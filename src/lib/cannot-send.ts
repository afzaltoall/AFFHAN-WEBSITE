import { NextResponse } from "next/server";
import { OFFICES } from "@/lib/brand";

/**
 * What a password-reset request answers when no code can leave at all
 * (lib/email.ts, canSendEmail: Brevo is not set up, or a send has failed in the
 * last ten minutes), with somewhere to go instead: the head office's number,
 * and the WhatsApp the company's profiles publish. Chennai publishes no
 * WhatsApp of its own, so that one is Dubai's.
 *
 * Asked before any account is read, so it is the same for every address; the
 * request whose own send fails is answered like any other (the caller's
 * generic sentence), and it is that failure which turns this on for the next.
 * Shared by the customer reset (app/api/web/auth/forgot-password) and the
 * staff one (app/api/employee/auth/forgot-password); both pages show its
 * contact as a WhatsApp and a call button.
 */
const CANNOT_SEND = "We couldn't send the code right now. Please contact us on WhatsApp or call us.";
const spaced = (n: string) => n.replace(/-/g, " ");
const CONTACT = {
  phone: spaced(OFFICES.chennai.telephone),
  tel: `tel:${OFFICES.chennai.telephone.replace(/[^+\d]/g, "")}`,
  whatsappNumber: spaced(OFFICES.dubai.telephone),
  whatsapp: OFFICES.dubai.whatsapp,
};

export function cannotSendResponse() {
  return NextResponse.json({ error: CANNOT_SEND, reason: "cannot_send", contact: CONTACT }, { status: 503 });
}

/**
 * The supplier portal's answer when no code can leave (its sign-up and its password reset). By email only: the
 * owner, 2026-10-23, "don't use that number or WhatsApp, use only email" for a supplier getting into their
 * account. So no number to call and no WhatsApp, only to try again shortly, when a send that failed is no
 * longer held against the sender (lib/email.ts, ten minutes).
 */
export function cannotSendEmailOnlyResponse() {
  return NextResponse.json(
    { error: "We couldn't send the email right now. Please try again in a few minutes.", reason: "cannot_send" },
    { status: 503 },
  );
}
