import { OTP_TTL_MS } from "@/lib/mobile-otp";
import type { EmailMessage } from "@/lib/email";

// ---------------------------------------------------------------------------
// What our transactional emails say.
//
// Kept away from the sending code and away from the routes: the wording of a
// security email is worth reading on its own, and a route deciding both what
// to do and how to phrase it ends up with neither reviewed properly.
//
// Plain and narrow on purpose. A password-reset email that looks like a
// marketing campaign — big images, buttons, tracking pixels — is the exact
// shape people are told to distrust, and it is the shape spam filters weigh
// against. Text first, a little inline CSS, no images, no links to click.
// ---------------------------------------------------------------------------

const BRAND = "Affhan Group";
const SUPPORT = "https://affhan.com/contact/";

const TTL_MINUTES = Math.round(OTP_TTL_MS / 60000);

/**
 * The code itself, for someone resetting their password.
 *
 * No link. A reset link in an email is a credential that survives in inboxes,
 * forwards and browser history; a six-digit code typed back into the page the
 * customer already has open is not. It also means a leaked email alone is not
 * enough — the reader has to be at the form.
 */
export function passwordResetCodeEmail(code: string): Omit<EmailMessage, "to"> {
  const text = [
    `Your ${BRAND} password reset code is ${code}`,
    "",
    `Enter it on the page you started the reset from. It expires in ${TTL_MINUTES} minutes and can be used once.`,
    "",
    "If you didn't ask to reset your password, ignore this email — nothing has changed on your account.",
    "",
    `${BRAND} — sourcing and freight forwarding`,
    SUPPORT,
  ].join("\n");

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;color:#0f172a;line-height:1.55">
  <p style="margin:0 0 18px;font-size:15px">Your ${BRAND} password reset code is:</p>
  <p style="margin:0 0 18px;font-size:30px;font-weight:700;letter-spacing:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${code}</p>
  <p style="margin:0 0 18px;font-size:14px;color:#475569">
    Enter it on the page you started the reset from. It expires in ${TTL_MINUTES} minutes and can be used once.
  </p>
  <p style="margin:0 0 22px;font-size:14px;color:#475569">
    If you didn't ask to reset your password, ignore this email — nothing has changed on your account.
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 14px">
  <p style="margin:0;font-size:12px;color:#94a3b8">
    ${BRAND} — sourcing and freight forwarding<br>
    <a href="${SUPPORT}" style="color:#94a3b8">Contact us</a>
  </p>
</div>`.trim();

  return { subject: `${code} is your ${BRAND} password reset code`, text, html };
}

/**
 * For an account that has no password to reset.
 *
 * Sent instead of a code when the address signs in with Google. The HTTP
 * response is identical either way — the server never tells a stranger which
 * addresses exist — but the person who actually owns the inbox deserves to
 * know why no code arrived, rather than being left pressing the button.
 */
/**
 * A customer the rotation has given up on.
 *
 * The only message here that goes to the office rather than to a customer, and
 * the only one anybody is expected to act on. It exists because INVALID is
 * otherwise a state with no witness: the customer stops moving, stops being
 * anybody's work, and waits on somebody opening the Queue page to notice. A
 * customer who asked for a quote and was offered to the whole team twice
 * deserves better than being found later.
 *
 * Says what it is, who it was, and where to go. No link to click for the same
 * reason the reset email has none — and because the admin console is behind a
 * login anyway, so a URL in an inbox saves nobody anything.
 */
export function leadGivenUpEmail(details: {
  customerName: string;
  products: number;
  messages: number;
  passes: number;
  handoffs: number;
  enteredAt: string;
}): Omit<EmailMessage, "to"> {
  const { customerName, products, messages, passes, handoffs, enteredAt } = details;
  const has = [
    products > 0 ? `${products} ${products === 1 ? "product" : "products"}` : "",
    messages > 0 ? `${messages} ${messages === 1 ? "message" : "messages"}` : "",
  ].filter(Boolean).join(" and ");

  const text = [
    `${customerName} has been given up on by the rotation and needs somebody to look at them.`,
    "",
    `They asked about ${has || "nothing that is still on file"}, and were offered to the whole sales team`,
    `${passes} times over (${handoffs} handovers) since ${enteredAt} without anybody recording an outcome.`,
    "",
    "Nobody holds them now. Open Queue in the admin console to assign them to somebody,",
    "or to put them back into the rotation.",
    "",
    `${BRAND} — sourcing and freight forwarding`,
  ].join("\n");

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;color:#0f172a;line-height:1.55">
  <p style="margin:0 0 18px;font-size:15px">
    <strong>${customerName}</strong> has been given up on by the rotation and needs somebody to look at them.
  </p>
  <p style="margin:0 0 18px;font-size:14px;color:#475569">
    They asked about ${has || "nothing that is still on file"}, and were offered to the whole sales team
    ${passes} times over (${handoffs} handovers) since ${enteredAt} without anybody recording an outcome.
  </p>
  <p style="margin:0 0 22px;font-size:14px;color:#475569">
    Nobody holds them now. Open <strong>Queue</strong> in the admin console to assign them to somebody,
    or to put them back into the rotation.
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 14px">
  <p style="margin:0;font-size:12px;color:#94a3b8">
    ${BRAND} — sourcing and freight forwarding<br>
    ${SUPPORT}
  </p>
</div>`.trim();

  return { subject: `Queue: nobody took on ${customerName}`, text, html };
}

export function noPasswordOnAccountEmail(): Omit<EmailMessage, "to"> {
  const text = [
    `Someone asked to reset the password for your ${BRAND} account.`,
    "",
    "That account doesn't have a password — it signs in with Google. Use the",
    "\"Continue with Google\" button and you'll be straight in.",
    "",
    "If this wasn't you, you can ignore this email. Nothing has changed.",
    "",
    `${BRAND} — sourcing and freight forwarding`,
    SUPPORT,
  ].join("\n");

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;color:#0f172a;line-height:1.55">
  <p style="margin:0 0 18px;font-size:15px">Someone asked to reset the password for your ${BRAND} account.</p>
  <p style="margin:0 0 18px;font-size:14px;color:#475569">
    That account doesn't have a password — it signs in with Google. Use the
    <strong>Continue with Google</strong> button and you'll be straight in.
  </p>
  <p style="margin:0 0 22px;font-size:14px;color:#475569">
    If this wasn't you, you can ignore this email. Nothing has changed.
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 14px">
  <p style="margin:0;font-size:12px;color:#94a3b8">
    ${BRAND} — sourcing and freight forwarding<br>
    <a href="${SUPPORT}" style="color:#94a3b8">Contact us</a>
  </p>
</div>`.trim();

  return { subject: `About your ${BRAND} account`, text, html };
}
