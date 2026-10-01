import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerKeyOf } from "@/lib/customerGroups";
import { ensureCustomerCode } from "@/lib/customerCode";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { isValidMobileE164 } from "@/lib/phone";
import { checkTripApplicationRateLimit } from "@/lib/rate-limit";
import {
  BUSINESS_CATEGORIES,
  INTERESTS,
  LIMITS,
  YEARS_IN_BUSINESS,
  validateAll,
  type TripApplicationPayload,
} from "@/lib/trip-application";

/**
 * Applications for the free China business trip, from /free-china-trip/apply/.
 *
 * Public, like /api/contact: no sign-in needed. If the applicant is signed in
 * their account is linked, the way freight requests are. Every rule the form
 * applies is applied again here (lib/trip-application.ts is shared), because
 * the form is only a convenience and anyone can post to this URL.
 *
 * Returns the reference number the table's DEFAULT wrote (TRIP-26-00001), which
 * the success screen shows. Nothing sensitive is logged: failures log the
 * error, never the application.
 */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);

function read(body: Record<string, unknown>): TripApplicationPayload {
  const o = (k: string) => (body[k] && typeof body[k] === "object" ? (body[k] as Record<string, unknown>) : {});
  const p = o("personal"), b = o("business"), f = o("profile"), t = o("travel"), c = o("consent");
  return {
    personal: {
      fullName: str(p.fullName, LIMITS.name),
      email: str(p.email, LIMITS.email),
      phone: str(p.phone, LIMITS.phone),
      country: str(p.country, LIMITS.country),
      city: str(p.city, LIMITS.city),
      profileUrl: str(p.profileUrl, LIMITS.url),
    },
    business: {
      companyName: str(b.companyName, LIMITS.company),
      role: str(b.role, LIMITS.role),
      businessCategory: str(b.businessCategory, LIMITS.category),
      companyWebsite: str(b.companyWebsite, LIMITS.url),
      yearsInBusiness: str(b.yearsInBusiness, 40),
      businessDescription: str(b.businessDescription, LIMITS.description),
    },
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  const a = read(body);

  // The same rules as the form, plus the lists: a value the form cannot offer
  // is refused rather than stored.
  const errors = validateAll(a, isValidMobileE164(a.personal.phone.replace(/\s+/g, "")));
  if (!(BUSINESS_CATEGORIES as readonly string[]).includes(a.business.businessCategory)) errors.businessCategory = "Please choose a category.";
  if (!(YEARS_IN_BUSINESS as readonly string[]).includes(a.business.yearsInBusiness)) errors.yearsInBusiness = "Please choose one.";
  if (a.profile.interests.some((i) => !(INTERESTS as readonly string[]).includes(i))) errors.interests = "Please choose from the list.";
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: "Some answers need another look.", fields: errors }, { status: 400 });
  }

  const user = await verifyMobileSession(req).catch(() => null);

  try {
    const saved = await prisma.tripApplication.create({
      data: {
        fullName: a.personal.fullName,
        email: a.personal.email,
        phone: a.personal.phone,
        country: a.personal.country,
        city: a.personal.city,
        profileUrl: a.personal.profileUrl || null,
        companyName: a.business.companyName,
        role: a.business.role,
        businessCategory: a.business.businessCategory,
        companyWebsite: a.business.companyWebsite || null,
        yearsInBusiness: a.business.yearsInBusiness,
        businessDescription: a.business.businessDescription,
        interests: a.profile.interests,
        productsOfInterest: a.profile.productsOfInterest,
        exploreNotes: a.profile.exploreNotes || null,
        nationality: a.travel.nationality,
        hasPassport: a.travel.hasPassport === true,
        travelledToChina: a.travel.travelledToChina === true,
        consentAccuracy: true,
        consentTerms: true,
        customerKey: customerKeyOf({ phone: a.personal.phone, email: a.personal.email }),
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
