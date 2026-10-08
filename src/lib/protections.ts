/**
 * Whether a protection that is not configured must refuse rather than step
 * aside (security audit 2026-10-08, H5).
 *
 * In production it refuses: every build Vercel serves, previews included.
 * Under `next dev` it steps aside with a warning, so working on the site needs
 * no Redis and no Turnstile keys. A local `next start` is production too, and
 * refuses like the live site.
 *
 * NODE_ENV rather than VERCEL_ENV: Vercel sets NODE_ENV on every deployment,
 * while VERCEL_ENV reaches the functions only when the project exposes its
 * system variables, and a check that silently read "not production" would
 * undo the point of it.
 */
export function protectionsRequired(): boolean {
  return process.env.NODE_ENV === "production";
}
