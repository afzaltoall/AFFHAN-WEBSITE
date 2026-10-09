/**
 * The Turnstile site key every form renders with.
 *
 * In production, the real key (NEXT_PUBLIC_TURNSTILE_SITE_KEY), or none. Under
 * `next dev`, Cloudflare's published always-pass TEST key: the real key is
 * refused on localhost (Cloudflare error 110200, domain not allowed), and
 * lib/turnstile.ts checks no token under `next dev`, so working on the site
 * needs no keys and every form still shows the widget where it will be.
 *
 * Inlined at build time, like any NEXT_PUBLIC_ value: a production build
 * carries the real key, a dev server the test one.
 */
export const TURNSTILE_SITE_KEY: string | undefined =
  process.env.NODE_ENV === "production" ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined : "1x00000000000000000000AA";
