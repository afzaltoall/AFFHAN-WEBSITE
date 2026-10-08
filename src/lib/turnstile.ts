import { protectionsRequired } from "@/lib/protections";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileCheck = { ok: true } | { ok: false; status: number; error: string };

/**
 * Check a Cloudflare Turnstile token, server-side.
 *
 * With TURNSTILE_SECRET_KEY unset, production refuses (security audit
 * 2026-10-08, H5): each sign-in used to skip the check with a warning, so a
 * deployment missing the variable quietly had no check at all. Under
 * `next dev` it is still skipped, with the warning (lib/protections.ts).
 */
export async function checkTurnstile(token: unknown, ip?: string): Promise<TurnstileCheck> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (protectionsRequired()) {
      console.error("[turnstile] TURNSTILE_SECRET_KEY is not set: refusing (Turnstile fails closed in production).");
      return { ok: false, status: 503, error: "The security check is unavailable right now. Please try again later." };
    }
    console.warn("TURNSTILE_SECRET_KEY is missing. Skipping CAPTCHA validation.");
    return { ok: true };
  }

  if (typeof token !== "string" || !token) {
    return { ok: false, status: 400, error: "Please complete the security check." };
  }

  const form = new URLSearchParams();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch(SITEVERIFY, { method: "POST", body: form, signal: AbortSignal.timeout(8_000) });
    const verdict = (await res.json().catch(() => ({}))) as { success?: boolean };
    if (verdict.success === true) return { ok: true };
  } catch (error) {
    console.error("[turnstile] siteverify did not answer:", error instanceof Error ? error.name : "unknown");
  }
  return { ok: false, status: 403, error: "Security check failed. Please try again." };
}
