/**
 * Ask Google for an avatar big enough for where it is being drawn.
 *
 * Google serves profile photos with the size baked into the URL — the token
 * `=s96-c` at the end means "96px, cropped square". Sign-in hands us whatever
 * size it felt like, usually s96, and drawing that at 64 CSS pixels on a 2x
 * display means stretching 96 real pixels across 128, which is exactly the soft
 * result you get.
 *
 * Rewriting the token asks their CDN for the right size instead of upscaling a
 * small one locally. Non-Google URLs are returned untouched — the token is a
 * Google convention, not a general one.
 */
export function avatarUrl(url: string | null | undefined, cssPx: number): string | null {
  if (!url) return null;
  if (!/googleusercontent\.com/i.test(url)) return url;

  // 2x for retina, clamped: below 64 the crop gets mushy, and past 512 we are
  // downloading a portrait to draw a thumbnail.
  const size = Math.min(512, Math.max(64, Math.round(cssPx * 2)));

  // Existing token — replace whatever size it names.
  if (/=s\d+(-c)?$/i.test(url)) {
    return url.replace(/=s\d+(-c)?$/i, `=s${size}-c`);
  }
  // Some URLs arrive with no token at all; append one.
  if (!url.includes("=")) return `${url}=s${size}-c`;

  return url;
}
