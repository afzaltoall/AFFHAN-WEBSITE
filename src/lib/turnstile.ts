import { protectionsRequired } from "@/lib/protections";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileCheck = { ok: true } | { ok: false; status: number; error: string };

let devWarned = false;

/**
 * Check a Cloudflare Turnstile token, server-side.
 *
 * With TURNSTILE_SECRET_KEY unset, production refuses (security audit
 * 2026-10-08, H5): each sign-in used to skip the check with a warning, so a
 * deployment missing the variable quietly had no check at all.
 *
 * Under `next dev` nothing is checked, with a warning, whatever the keys:
 * the forms render Cloudflare's test key there (lib/turnstile-site-key.ts),
 * whose tokens no real secret accepts, and the real key does not run on
 * localhost (lib/protections.ts says the same for Redis).
 *
 * Every route that also has a rate limit calls this first: a request without
 * a passing token is turned away before it costs an Upstash command or counts
 * against anybody's limit (2026-10-09).
 */
export async function checkTurnstile(token: unknown, ip?: string): Promise<TurnstileCheck> {
  if (!protectionsRequired()) {
    if (!devWarned) {
      devWarned = true;
      console.warn("[turnstile] next dev: tokens are not checked (production checks them).");
    }
    return { ok: true };
  }
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("[turnstile] TURNSTILE_SECRET_KEY is not set: refusing (Turnstile fails closed in production).");
    return { ok: false, status: 503, error: "The security check is unavailable right now. Please try again later." };
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
