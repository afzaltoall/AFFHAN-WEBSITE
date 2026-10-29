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
import {
  BUSINESS_CATEGORIES,
  BUSINESS_FIELD_KEYS,
  BUSINESS_STATUSES,
  LIMITS,
  applicationWindow,
  isBusinessStatus,
  isRetiredBusinessStatus,
  relevantBusiness,
  validateAll,
  type BusinessFieldKey,
  type TripApplicationPayload,
} from "@/lib/trip-application";

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
 *  - only the business answers the chosen business journey asks are kept
 *    (relevantBusiness); anything else sent is dropped, never stored, and a
 *    journey no longer offered (taken out on 2026-10-28, still on a page
 *    opened before) is asked again;
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

/** The longest each business answer may be. */
const BUSINESS_MAX: Record<BusinessFieldKey, number> = {
  companyName: LIMITS.company,
  role: LIMITS.role,
  businessCategory: LIMITS.category,
};

function read(body: Record<string, unknown>): TripApplicationPayload {
  const o = (k: string) => (body[k] && typeof body[k] === "object" ? (body[k] as Record<string, unknown>) : {});
  // The business profile (interests, products, what to explore), "About your business", a company's website and
  // years in business, and what the journeys taken out asked are no longer asked (2026-10-28): anything an older
  // form still sends of them is dropped here, never stored.
  const p = o("personal"), b = o("business"), t = o("travel"), c = o("consent");
  const answers = Object.fromEntries(BUSINESS_FIELD_KEYS.map((k) => [k, str(b[k], BUSINESS_MAX[k])])) as Record<BusinessFieldKey, string>;
  // The mobile app's older form asks only the company questions, all of them
  // required, and sends no businessStatus: it is read as running a business.
  const status = isBusinessStatus(b.businessStatus) ? b.businessStatus : b.businessStatus === undefined && answers.companyName ? "existing_business" : "";
  return {
    personal: {
      fullName: str(p.fullName, LIMITS.name),
      phone: str(p.phone, LIMITS.phone),
      country: str(p.country, LIMITS.country),
      city: str(p.city, LIMITS.city),
    },
    // Only what the chosen journey asks; the rest is dropped here.
    business: relevantBusiness({ businessStatus: status, ...answers }),
    travel: {
      nationality: str(t.nationality, LIMITS.country),
      hasPassport: bool(t.hasPassport),
    },
    consent: {
      // The website asks for the Privacy Policy in a box of its own. The
      // mobile app's form asks for it inside its terms box and sends no
      // `privacy`, so for that form the terms box carries both.
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
  const b = a.business;

  // The same rules as the form, plus the lists: a value the form cannot offer
  // is refused rather than stored.
  const errors = validateAll(a, isValidMobileE164(a.personal.phone.replace(/\s+/g, "")));
  const inList = (list: readonly string[], v: string) => list.includes(v);
  if (b.businessCategory && !inList(BUSINESS_CATEGORIES, b.businessCategory)) errors.businessCategory = "Please choose a category.";
  // A page opened before 2026-10-28 still offers the two journeys taken out: it shows this under them.
  const sent = body.business && typeof body.business === "object" ? (body.business as Record<string, unknown>).businessStatus : undefined;
  if (isRetiredBusinessStatus(sent)) errors.businessStatus = `Please choose ${BUSINESS_STATUSES.map((s) => `“${s.label}”`).join(" or ")}.`;
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

  const orNull = (v: string) => v || null;

  try {
    const saved = await prisma.tripApplication.create({
      data: {
        fullName: a.personal.fullName,
        // No longer asked (2026-10-29; an older page's is dropped): the column may not be null.
        email: "",
        phone: a.personal.phone,
        country: a.personal.country,
        city: a.personal.city,
        // A website or LinkedIn is no longer asked either (2026-10-29): left null, an older page's dropped.
        businessStatus: b.businessStatus as string,
        companyName: orNull(b.companyName),
        role: orNull(b.role),
        businessCategory: orNull(b.businessCategory),
        // No longer asked (2026-10-28): left empty, as the columns allow ("" for the one that may not be null; the
        // website, years in business, plan, area of interest and what to explore default to null).
        interests: [],
        productsOfInterest: "",
        nationality: a.travel.nationality,
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
