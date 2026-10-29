import { NextRequest, NextResponse } from "next/server";
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
import { LIMITS, applicationWindow, isBusinessStatus, isRetiredBusinessStatus, validateAll, type TripApplicationPayload } from "@/lib/trip-application";

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
 *  - the three consents are required and recorded one by one.
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
  // first, before the request costs a rate-limit command (lib/turnstile.ts). Only here, never with a session: the app
  // always sends one, and cannot show the widget.
  const user = await verifyMobileSession(req).catch(() => null);
  if (!user) {
    const human = await checkTurnstile(body.turnstileToken, getClientIp(req));
    if (!human.ok) return NextResponse.json({ error: human.error, reason: "human" }, { status: human.status });
  }

  const limited = await checkTripApplicationRateLimit(req);
  if (!limited.success) return limitReached("Several applications have come from this connection in the last hour.", limited);

  // Locked, nothing is taken, from the website or the app (lib/trip-lock.ts).
  if (await tripClosedHere()) {
    return NextResponse.json({ error: TRIP_LOCKED_ERROR, reason: "locked" }, { status: 403 });
  }

  const taking = applicationWindow();
  if (taking !== "open") {
    const error = taking === "before" ? `Applications open on ${TRIP_FACTS.applicationsOpen}.` : `Applications closed on ${TRIP_FACTS.applicationsClose}.`;
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
    return NextResponse.json({ error: "Some answers need another look.", fields: errors }, { status: 400 });
  }

  const customerKey = customerKeyOf({ phone: a.personal.phone });
  const phoneKey = customerKeyOf({ phone: a.personal.phone });
  const userId = user?.id ?? null;

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

    const res = NextResponse.json({ referenceNo: saved.referenceNo, createdAt: saved.createdAt.toISOString() }, { status: 201 });
    // This browser is shown its own registration from now on. Never fatal either: without AUTH_SECRET the
    // application stands, and only the remembering is missing.
    try {
      rememberTripApplicant(res, saved.id);
    } catch (e) {
      console.error("trip application cookie:", e instanceof Error ? e.message : e);
    }
    return res;
  } catch (e) {
    console.error("trip application save failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't record your application." }, { status: 500 });
  }
}
