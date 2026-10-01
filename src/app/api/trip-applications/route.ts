import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerKeyOf } from "@/lib/customerGroups";
import { ensureCustomerCode } from "@/lib/customerCode";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { isValidMobileE164 } from "@/lib/phone";
import { checkTripApplicationRateLimit } from "@/lib/rate-limit";
import { TRIP_FACTS } from "@/lib/trip-legal";
import {
  BUSINESS_CATEGORIES,
  BUSINESS_FIELD_KEYS,
  INTERESTS,
  LIMITS,
  YEARS_IN_BUSINESS,
  applicationWindow,
  isBusinessStatus,
  relevantBusiness,
  validateAll,
  type BusinessFieldKey,
  type TripApplicationPayload,
} from "@/lib/trip-application";

/**
 * Applications for the free China business trip, from /free-china-trip/apply/.
 *
 * Public, like /api/contact: no sign-in needed. If the applicant is signed in
 * their account is linked, the way freight requests are. Every rule the form
 * applies is applied again here (lib/trip-application.ts is shared), because
 * the form is only a convenience and anyone can post to this URL:
 *
 *  - only from 5 October to 25 November 2026 (Terms, clause 1; a production
 *    build keeps the window, a development server is always open);
 *  - one application per person (Terms, clause 2): none is taken from an
 *    email address or mobile number that already has one (unless the team
 *    deleted it);
 *  - only the business answers the chosen business journey asks are kept
 *    (relevantBusiness); anything else sent is dropped, never stored;
 *  - the three consents are required and recorded one by one.
 *
 * Nothing here scores, ranks or orders an application. Each is stored as
 * "new" for the team; the five winners are drawn at random, later, from the
 * applications found eligible (Terms, clause 3), and no answer has any part in
 * that.
 *
 * Returns the reference number the table's DEFAULT wrote (TRIP-26-00001), which
 * the success screen shows. Nothing sensitive is logged: failures log the
 * error, never the application.
 */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);

/** The longest each business answer may be. */
const BUSINESS_MAX: Record<BusinessFieldKey, number> = {
  companyName: LIMITS.company,
  role: LIMITS.role,
  businessCategory: LIMITS.category,
  companyWebsite: LIMITS.url,
  yearsInBusiness: 40,
  businessDescription: LIMITS.description,
  businessPlan: LIMITS.description,
  areaOfInterest: LIMITS.category,
  exploreGoal: LIMITS.explore,
};

function read(body: Record<string, unknown>): TripApplicationPayload {
  const o = (k: string) => (body[k] && typeof body[k] === "object" ? (body[k] as Record<string, unknown>) : {});
  const p = o("personal"), b = o("business"), f = o("profile"), t = o("travel"), c = o("consent");
  const answers = Object.fromEntries(BUSINESS_FIELD_KEYS.map((k) => [k, str(b[k], BUSINESS_MAX[k])])) as Record<BusinessFieldKey, string>;
  // The mobile app's older form asks only the company questions, all of them
  // required, and sends no businessStatus: it is read as running a business.
  const status = isBusinessStatus(b.businessStatus) ? b.businessStatus : b.businessStatus === undefined && answers.companyName ? "existing_business" : "";
  return {
    personal: {
      fullName: str(p.fullName, LIMITS.name),
      email: str(p.email, LIMITS.email),
      phone: str(p.phone, LIMITS.phone),
      country: str(p.country, LIMITS.country),
      city: str(p.city, LIMITS.city),
      profileUrl: str(p.profileUrl, LIMITS.url),
    },
    // Only what the chosen journey asks; the rest is dropped here.
    business: relevantBusiness({ businessStatus: status, ...answers }),
    profile: {
      interests: Array.isArray(f.interests)
        ? Array.from(new Set(f.interests.filter((x): x is string => typeof x === "string"))).slice(0, INTERESTS.length)
        : [],
      productsOfInterest: str(f.productsOfInterest, LIMITS.products),
      exploreNotes: str(f.exploreNotes, LIMITS.explore),
    },
    travel: {
      nationality: str(t.nationality, LIMITS.country),
      hasPassport: bool(t.hasPassport),
      travelledToChina: bool(t.travelledToChina),
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
  const limited = await checkTripApplicationRateLimit(req);
  if (!limited.success) {
    return NextResponse.json({ error: "Too many applications from this connection. Please try again later." }, { status: 429 });
  }

  const taking = applicationWindow();
  if (taking !== "open") {
    const error = taking === "before" ? `Applications open on ${TRIP_FACTS.applicationsOpen}.` : `Applications closed on ${TRIP_FACTS.applicationsClose}.`;
    return NextResponse.json({ error, reason: "closed" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  const a = read(body);
  const b = a.business;

  // The same rules as the form, plus the lists: a value the form cannot offer
  // is refused rather than stored.
  const errors = validateAll(a, isValidMobileE164(a.personal.phone.replace(/\s+/g, "")));
  const inList = (list: readonly string[], v: string) => list.includes(v);
  if (b.businessCategory && !inList(BUSINESS_CATEGORIES, b.businessCategory)) errors.businessCategory = "Please choose a category.";
  if (b.yearsInBusiness && !inList(YEARS_IN_BUSINESS, b.yearsInBusiness)) errors.yearsInBusiness = "Please choose one.";
  if (b.areaOfInterest && !inList(BUSINESS_CATEGORIES, b.areaOfInterest)) errors.areaOfInterest = "Please choose an area of interest.";
  if (a.profile.interests.some((i) => !inList(INTERESTS, i))) errors.interests = "Please choose from the list.";
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: "Some answers need another look.", fields: errors }, { status: 400 });
  }

  const customerKey = customerKeyOf({ phone: a.personal.phone, email: a.personal.email });
  const phoneKey = customerKeyOf({ phone: a.personal.phone });

  try {
    // One application per person: the same email (in any case) or the same
    // mobile number already has one the team has not deleted.
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "TripApplication"
      WHERE status <> 'deleted'
        AND (lower(email) = lower(${a.personal.email}) OR (${phoneKey}::text IS NOT NULL AND "customerKey" = ${phoneKey}))
      LIMIT 1`;
    if (existing.length) {
      return NextResponse.json(
        { error: "We have already received an application from this email address or mobile number. To change anything in it, write to info@affhan.com.", reason: "duplicate" },
        { status: 409 },
      );
    }
  } catch (e) {
    console.error("trip application duplicate check failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't record your application." }, { status: 500 });
  }

  const user = await verifyMobileSession(req).catch(() => null);
  const orNull = (v: string) => v || null;

  try {
    const saved = await prisma.tripApplication.create({
      data: {
        fullName: a.personal.fullName,
        email: a.personal.email,
        phone: a.personal.phone,
        country: a.personal.country,
        city: a.personal.city,
        profileUrl: orNull(a.personal.profileUrl),
        businessStatus: b.businessStatus as string,
        companyName: orNull(b.companyName),
        role: orNull(b.role),
        businessCategory: orNull(b.businessCategory),
        companyWebsite: orNull(b.companyWebsite),
        yearsInBusiness: orNull(b.yearsInBusiness),
        businessDescription: orNull(b.businessDescription),
        businessPlan: orNull(b.businessPlan),
        areaOfInterest: orNull(b.areaOfInterest),
        exploreGoal: orNull(b.exploreGoal),
        interests: a.profile.interests,
        productsOfInterest: a.profile.productsOfInterest,
        exploreNotes: orNull(a.profile.exploreNotes),
        nationality: a.travel.nationality,
        hasPassport: a.travel.hasPassport === true,
        travelledToChina: a.travel.travelledToChina === true,
        // All three are required above; recorded as given.
        consentPrivacy: a.consent.privacy,
        consentAccuracy: a.consent.accuracy,
        consentTerms: a.consent.terms,
        customerKey,
        userId: user?.id ?? null,
      },
      select: { id: true, referenceNo: true, createdAt: true },
    });

    // The customer number every other lead gets. Never fatal: the
    // application is saved either way.
    try {
      await ensureCustomerCode({ phone: a.personal.phone, email: a.personal.email }, saved.createdAt, "TRIP");
    } catch (e) {
      console.error("trip application customer code:", e instanceof Error ? e.message : e);
    }

    return NextResponse.json({ referenceNo: saved.referenceNo }, { status: 201 });
  } catch (e) {
    console.error("trip application save failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't record your application." }, { status: 500 });
  }
}
