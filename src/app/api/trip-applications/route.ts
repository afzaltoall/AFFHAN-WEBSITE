import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { customerKeyOf } from "@/lib/customerGroups";
import { ensureCustomerCode } from "@/lib/customerCode";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { isValidMobileE164 } from "@/lib/phone";
import { checkTripApplicationRateLimit, getClientIp, limitReached } from "@/lib/rate-limit";
import { checkTurnstile } from "@/lib/turnstile";
import { rememberTripApplicant } from "@/lib/trip-applicant";
import { TRIP_FACTS } from "@/lib/trip-legal";
import { TRIP_LOCKED_ERROR, tripClosedHere } from "@/lib/trip-lock";
import { referralForApplication } from "@/lib/server/trip-referrals";
import { checkDocuments } from "@/lib/server/trip-documents";
import { ID_DOCUMENTS_MAX, ID_DOCUMENT_NEEDED, idDocumentTypeOfKey, idProofOfKey, isIdDocumentKey } from "@/lib/trip-referral-shared";
import { LIMITS, SOURCE_NOT_VERIFIED, applicationWindow, isBusinessStatus, isRetiredBusinessStatus, validateAll, type TripApplicationPayload } from "@/lib/trip-application";

/**
 * Applications for the free China business trip, from /free-china-trip/apply/.
 *
 * No account needed (the owner, 2026-10-28: "remove the login to enter for the
 * china free trip page"). Sent while signed in (the website's cookie or the
 * app's Bearer token, verifyMobileSession), the application is the account's
 * as well, as before, and nothing more is asked. Sent by someone who is not
 * signed in, from the website, Cloudflare's check comes first (lib/turnstile.ts),
 * as the contact form has it. The app always sends its session, so it is never
 * asked: it cannot show the widget (tests/security/app-no-turnstile.test.mjs
 * reads this file for that). Recorded, the application's id is remembered on
 * the browser that sent it (lib/trip-applicant.ts), so that browser is shown its
 * own registration without an account.
 *
 * Every rule the form applies is applied again here (lib/trip-application.ts is
 * shared), because the form is only a convenience and anyone can post to this
 * URL:
 *
 *  - never while the trip is locked (lib/trip-lock.ts), except from an admin
 *    signed in to the console, checking it;
 *  - only from 12 October to 25 November 2026 (Terms, clause 1; a production
 *    build keeps the window, a development server is always open);
 *  - one application per person (Terms, clause 2): none is taken from an
 *    account or a mobile number that already has one (unless the team
 *    deleted it). No email is asked since 2026-10-29, so none is compared;
 *  - only the six answers the page asks are kept (one page since 2026-10-29:
 *    name, mobile, country, city, doing business or not, valid passport);
 *    anything else an older page sends is dropped, never stored, and a
 *    business answer no longer offered (still on a page opened before) is
 *    refused with the words to reload and apply again;
 *  - the three consents are required and recorded one by one;
 *  - the code of the employee whose link brought the browser may come with it (`referralCode`, 2026-11-02): never
 *    shown to the applicant, it credits an active employee and is otherwise ignored, never refused
 *    (lib/server/trip-referrals.ts);
 *  - an application that credits an employee must bring ID proof (`documents`, the keys of its uploads to the private
 *    bucket, 1 to 3; the owner, 2026-11-02), each checked with S3 and kept with it (lib/server/trip-documents.ts).
 *    Nobody else is asked for any.
 *
 * Nothing here scores, ranks or orders an application. Each is stored as
 * "new" for the team; the five winners are drawn at random, later, from the
 * applications found eligible (Terms, clause 3), and no answer has any part in
 * that.
 *
 * Returns the reference number the table's DEFAULT wrote (TRIP-26-00001) and
 * when it was recorded, which the success screen shows. Nothing sensitive is logged: failures log the
 * error, never the application.
 */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);

/**
 * One line in the server's log for every application turned away (2026-11-10, the owner: "after uploading any document
 * ... not sending, users are complaining", with nothing on record to say why): the reason, whether a link's code and ID
 * files came with it, and nothing of the applicant.
 */
function turnedAway(why: string, body: Record<string, unknown>) {
  const files = Array.isArray(body.documents) ? body.documents.length : 0;
  console.warn(`[trip-application] not recorded: ${why} (link code: ${body.referralCode ? "yes" : "no"}, files: ${files})`);
}

/** The answer for a recorded application: its Trip ID and when, and this browser remembered as the one that sent it. */
function recordedAnswer(saved: { id: string; referenceNo: string; createdAt: Date }, status = 201) {
  const res = NextResponse.json({ referenceNo: saved.referenceNo, createdAt: saved.createdAt.toISOString() }, { status });
  // This browser is shown its own registration from now on. Never fatal: without AUTH_SECRET the application stands,
  // and only the remembering is missing.
  try {
    rememberTripApplicant(res, saved.id);
  } catch (e) {
    console.error("trip application cookie:", e instanceof Error ? e.message : e);
  }
  return res;
}

/**
 * Whether these ID files are kept with an application already, and whether it is this one (2026-11-10): the same
 * application sent again, its answer lost on the way back (the form sends it once more by itself, or Try again does),
 * when every file is kept with one application from this same mobile number, not deleted. Only the browser that
 * uploaded the files was ever given their keys, so they are proof enough to be told its Trip ID. It used to be told
 * "Please add your ID again." and, once it had, that the number had applied already: the applicant never saw that the
 * application they sent was in. Files kept with any other application are this one's only if it adds its own.
 */
async function keptWith(keys: string[], customerKey: string | null) {
  const kept = await prisma.tripApplicationDocument.findMany({
    where: { key: { in: keys } },
    select: { application: { select: { id: true, referenceNo: true, createdAt: true, customerKey: true, status: true } } },
  });
  if (!kept.length) return "none" as const;
  const first = kept[0].application;
  const same = kept.every((k) => k.application.id === first.id) && first.status !== "deleted" && !!customerKey && first.customerKey === customerKey;
  return same ? first : ("another" as const);
}

function read(body: Record<string, unknown>): TripApplicationPayload {
  const o = (k: string) => (body[k] && typeof body[k] === "object" ? (body[k] as Record<string, unknown>) : {});
  // Only the six answers (2026-10-29). An email, a website, nationality, travel to China, a company, a business
  // profile or anything else an older page or app sends is dropped here, never stored.
  const p = o("personal"), b = o("business"), t = o("travel"), c = o("consent");
  // The mobile app's older form asks the company questions and sends no businessStatus: it runs a business.
  const status = isBusinessStatus(b.businessStatus) ? b.businessStatus : b.businessStatus === undefined && typeof b.companyName === "string" && b.companyName.trim() ? "existing_business" : "";
  return {
    personal: {
      fullName: str(p.fullName, LIMITS.name),
      phone: str(p.phone, LIMITS.phone),
      country: str(p.country, LIMITS.country),
      city: str(p.city, LIMITS.city),
    },
    business: { businessStatus: status },
    travel: { hasPassport: bool(t.hasPassport) },
    consent: {
      // The website sends all three (Privacy Policy and Terms from the popup, accuracy from Submit). The
      // mobile app's form asks for the Privacy Policy inside its terms box and sends no `privacy`, so for that
      // form the terms box carries both.
      privacy: c.privacy === undefined ? c.terms === true : c.privacy === true,
      accuracy: c.accuracy === true,
      terms: c.terms === true,
    },
  };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }

  // Signed in: the application is the account's too, and nothing more is asked. Not signed in: Cloudflare's check
  // first (lib/turnstile.ts), never with a session: the app always sends one, and cannot show the widget. It does not
  // refuse (2026-10-29): the page never shows its "Verify you are human" box (the owner: "showing sometimes dont show
  // that"), so an application it did not confirm is taken all the same and marked not verified for the team
  // (SOURCE_NOT_VERIFIED); the rate limit and one application per number still hold for everyone.
  let notVerified = false;
  const user = await verifyMobileSession(req).catch(() => null);
  if (!user) {
    const human = await checkTurnstile(body.turnstileToken, getClientIp(req));
    notVerified = !human.ok;
  }

  const limited = await checkTripApplicationRateLimit(req);
  if (!limited.success) {
    turnedAway("too many from this connection", body);
    return limitReached("Several applications have come from this connection in the last hour.", limited);
  }

  // Locked, nothing is taken, from the website or the app (lib/trip-lock.ts).
  if (await tripClosedHere()) {
    turnedAway("the trip is locked", body);
    return NextResponse.json({ error: TRIP_LOCKED_ERROR, reason: "locked" }, { status: 403 });
  }

  const taking = applicationWindow();
  if (taking !== "open") {
    const error = taking === "before" ? `Applications open on ${TRIP_FACTS.applicationsOpen}.` : `Applications closed on ${TRIP_FACTS.applicationsClose}.`;
    turnedAway(`applications ${taking === "before" ? "not open yet" : "closed"}`, body);
    return NextResponse.json({ error, reason: "closed" }, { status: 403 });
  }

  const a = read(body);

  // The same rules as the form.
  const errors = validateAll(a, isValidMobileE164(a.personal.phone.replace(/\s+/g, "")));
  // A page opened before the change still offers business answers taken out ("I am planning to start a
  // business"): its questions are no longer these, so it is asked to start again, under the one it gave.
  const sent = body.business && typeof body.business === "object" ? (body.business as Record<string, unknown>).businessStatus : undefined;
  if (isRetiredBusinessStatus(sent)) errors.businessStatus = "This application has changed. Please reload the page and apply again.";
  if (Object.keys(errors).length) {
    turnedAway(`answers to look at again: ${Object.keys(errors).join(", ")}`, body);
    return NextResponse.json({ error: "Some answers need another look.", fields: errors }, { status: 400 });
  }

  const customerKey = customerKeyOf({ phone: a.personal.phone });
  const phoneKey = customerKeyOf({ phone: a.personal.phone });
  const userId = user?.id ?? null;

  // The employee whose link brought this browser here (lib/server/trip-referrals.ts): never shown, never asked, so it
  // can never stop an application. A link that credits nobody, or a lookup that fails, is simply no referral.
  const referral = await referralForApplication(body.referralCode).catch((e) => {
    console.error("trip application referral lookup failed:", e instanceof Error ? e.message : e);
    return null;
  });

  // Its ID proof: required when the link credits an employee, and every upload sent is checked and kept. Only keys this
  // server made can name a file (isIdDocumentKey), and one S3 does not have is an upload that never finished.
  const documentKeys = [...new Set(Array.isArray(body.documents) ? body.documents.filter(isIdDocumentKey) : [])].slice(0, ID_DOCUMENTS_MAX);
  // One of the five IDs at least (ID_PROOFS): a key names the one it was added as; one from before the five names none.
  if (referral && !documentKeys.some((k) => idProofOfKey(k))) {
    turnedAway("no ID proof with a link's code", body);
    return NextResponse.json({ error: "Some answers need another look.", fields: { idDocument: ID_DOCUMENT_NEEDED } }, { status: 400 });
  }
  // Its files already kept with an application: this same one sent again (its answer was lost), answered with its Trip
  // ID; or another one's, when this one adds its own (keptWith). Asked first, so it costs no call to S3. A lookup that
  // fails goes on: the files' unique keys still keep one application to a file (the save, below).
  if (documentKeys.length) {
    const kept = await keptWith(documentKeys, customerKey).catch(() => "none" as const);
    if (kept === "another") {
      turnedAway("its ID files are kept with another application", body);
      return NextResponse.json({ error: "Some answers need another look.", fields: { idDocument: "Please add your ID again." } }, { status: 400 });
    }
    if (kept !== "none") {
      console.info("[trip-application] the same application sent again: answered with its Trip ID");
      return recordedAnswer(kept, 200);
    }
  }
  const documents = documentKeys.length ? await checkDocuments(documentKeys) : [];
  if (documents.some((d) => d.state === "missing")) {
    turnedAway("an ID file S3 does not have", body);
    return NextResponse.json({ error: "Some answers need another look.", fields: { idDocument: "Your ID didn't finish uploading. Please add it again." } }, { status: 400 });
  }

  try {
    // One application per person: the signed-in account or the same mobile
    // number already has one the team has not deleted. (Not the email: none is
    // asked since 2026-10-29, and every new row holds "".)
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "TripApplication"
      WHERE status <> 'deleted'
        AND ((${userId}::text IS NOT NULL AND "userId" = ${userId}) OR (${phoneKey}::text IS NOT NULL AND "customerKey" = ${phoneKey}))
      LIMIT 1`;
    if (existing.length) {
      // This same application, recorded a moment ago by its first try whose answer was slow to come back: its Trip ID.
      if (documentKeys.length) {
        const kept = await keptWith(documentKeys, customerKey).catch(() => "none" as const);
        if (kept !== "none" && kept !== "another") return recordedAnswer(kept, 200);
      }
      turnedAway("this account or mobile number has applied already", body);
      return NextResponse.json(
        { error: "We have already received an application from this account or mobile number. To change anything in it, write to info@affhan.com.", reason: "duplicate" },
        { status: 409 },
      );
    }
  } catch (e) {
    console.error("trip application duplicate check failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't record your application." }, { status: 500 });
  }

  try {
    const saved = await prisma.tripApplication.create({
      data: {
        fullName: a.personal.fullName,
        // No longer asked (2026-10-29; an older page's is dropped): the column may not be null.
        email: "",
        phone: a.personal.phone,
        country: a.personal.country,
        city: a.personal.city,
        businessStatus: a.business.businessStatus as string,
        // No longer asked: left empty, as the columns allow ("" or an empty list where the column may not be null; a
        // website, a company, its role, category, website and years, a plan, an area and what to explore are null).
        interests: [],
        productsOfInterest: "",
        nationality: "",
        hasPassport: a.travel.hasPassport === true,
        // No longer asked (2026-10-29); the column may not be null, so false, which the console never shows.
        travelledToChina: false,
        // All three are required above; recorded as given.
        consentPrivacy: a.consent.privacy,
        consentAccuracy: a.consent.accuracy,
        consentTerms: a.consent.terms,
        ...(notVerified ? { source: SOURCE_NOT_VERIFIED } : {}),
        // The link's code, its employee and its points, fixed now; nothing without one.
        ...(referral ?? {}),
        ...(documents.length
          ? {
              documents: {
                create: documents.map((d) => ({
                  key: d.key,
                  contentType: d.state === "ok" ? d.contentType : (idDocumentTypeOfKey(d.key) ?? "application/octet-stream"),
                  size: d.state === "ok" ? d.size : null,
                })),
              },
            }
          : {}),
        customerKey,
        userId,
      },
      select: { id: true, referenceNo: true, createdAt: true },
    });

    // The customer number every other lead gets. Never fatal: the
    // application is saved either way.
    try {
      await ensureCustomerCode({ phone: a.personal.phone }, saved.createdAt, "TRIP");
    } catch (e) {
      console.error("trip application customer code:", e instanceof Error ? e.message : e);
    }

    return recordedAnswer(saved);
  } catch (e) {
    // Its files kept with an application between the check above and this save: this same one, sent twice at once
    // (its first answer slow to come back), answered with that one's Trip ID; another's, and this one adds its own.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String(e.meta?.target ?? "").includes("key")) {
      const kept = await keptWith(documentKeys, customerKey).catch(() => "none" as const);
      if (kept !== "none" && kept !== "another") return recordedAnswer(kept, 200);
      turnedAway("its ID files were kept with another application meanwhile", body);
      return NextResponse.json({ error: "Some answers need another look.", fields: { idDocument: "Please add your ID again." } }, { status: 400 });
    }
    console.error("trip application save failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't record your application." }, { status: 500 });
  }
}
