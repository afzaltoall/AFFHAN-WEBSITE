import { NextResponse } from "next/server";
import type { MobileUser } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { readContactPhone } from "@/lib/phone";
import { checkContactPhoneRateLimit, limitReached } from "@/lib/rate-limit";
import { recordAccountChanges, type ChangeSource } from "@/lib/account-audit";

// ---------------------------------------------------------------------------
// The account's contact number, saved as typed: no code (the owner, 2026-10-15).
//
// Our team calls or WhatsApps customers about their quotes, and an account made
// with Google arrives with no number. This puts one on it the way password
// sign-up does: checked as a real mobile for its country (lib/phone.ts),
// refused when another account already has it, and stored unverified, which
// is the truth, since nothing has confirmed it is theirs.
//
// A number to reach someone on, never a way in: authProvider is left as it
// is, and there is no phone sign-in (removed 2026-10-15). Nothing here sends
// a code.
//
// The session decides whose account changes; the body never names one. The
// website's cookie and the app's Bearer token both carry it
// (verifyMobileSession); each has its own route only for the shape its
// client reads back.
// ---------------------------------------------------------------------------

export const PHONE_TAKEN_MESSAGE =
  "That number is already on another AFFHAN account. Check it, or use a different number.";

export type SaveContactPhoneResult = { ok: true; user: MobileUser } | { ok: false; response: NextResponse };

/** Save `{ phone }` from the request's body as the signed-in account's number. `source` is where, for the account's history. */
export async function saveContactPhone(request: Request, source: ChangeSource): Promise<SaveContactPhoneResult> {
  const user = await verifyMobileSession(request);
  if (!user) return refuse(401, "Sign in to save your number.");

  // Before the number is even read: what the limit guards most is the "already
  // on another account" answer, which would otherwise test numbers for free.
  const limit = await checkContactPhoneRateLimit(user.id);
  if (!limit.success) {
    return { ok: false, response: limitReached("You have saved a number many times in the last hour.", limit) };
  }

  const body = await request.json().catch(() => null);
  const read = readContactPhone(body?.phone);
  if (!read.ok) return refuse(400, read.error);
  const phone = read.e164;

  // Already the account's number: nothing changes, so nothing is written or
  // recorded, and a number proved earlier stays proved.
  if (phone === user.phone) return { ok: true, user };

  // Asked first so the customer is told why; the unique index decides a race
  // between two saves, below.
  const holder = await prisma.mobileUser.findUnique({ where: { phone }, select: { id: true } });
  if (holder && holder.id !== user.id) return refuse(409, PHONE_TAKEN_MESSAGE);

  let updated: MobileUser;
  try {
    updated = await prisma.mobileUser.update({
      where: { id: user.id },
      // Unverified, always: a number typed in is not a number proved.
      data: { phone, phoneVerified: false },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return refuse(409, PHONE_TAKEN_MESSAGE);
    throw e;
  }

  await recordAccountChanges(user.id, source, [{ field: "phone", from: user.phone, to: phone }]);
  return { ok: true, user: updated };
}

function refuse(status: number, error: string): SaveContactPhoneResult {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}
