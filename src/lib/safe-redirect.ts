/**
 * Where to send someone after they sign in, from a `?redirect=` they arrived
 * with: a path on this site, or "/" (security audit 2026-10-08, M3).
 *
 * The check it replaces allowed anything that started with "/" and not "//".
 * A browser reads more than that as another site: "/\evil.example" and
 * "/%5Cevil.example" (a backslash counts as a slash), "/<tab>/evil.example"
 * (tabs and newlines are dropped before parsing), and "/..//evil.example"
 * (dot segments fold away and leave "//"). Each of those passed, and the login
 * page then sent a signed-in visitor straight to the other site.
 *
 * So the raw value has to be a single-slash path with no backslash, encoded
 * or not, and no control character; and what it resolves to has to stay on
 * the same origin and still be a single-slash path. Anything else is "/".
 *
 * Kept free of path aliases and of other modules, so tests can load it as it is.
 */
const ANCHOR = "https://affhan.com";

export function safeRedirect(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw === "") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.includes("\\") || /%5c/i.test(raw)) return "/";
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  let url: URL;
  try {
    url = new URL(raw, ANCHOR);
  } catch {
    return "/";
  }
  if (url.origin !== ANCHOR) return "/";
  const path = `${url.pathname}${url.search}${url.hash}`;
  // Resolution can leave a path that a browser reads as another host ("/..//x" becomes "//x").
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}
