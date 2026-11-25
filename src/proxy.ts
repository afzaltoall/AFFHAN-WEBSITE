import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROLE, SESSION_COOKIE, adminSessionIsFresh, readSession } from "@/lib/session-token";
import { applicationWindow } from "@/lib/trip-application";

/** The trip's own address. */
const TRIP = "/free-china-trip";
/** What every page under it shows while it is locked. */
const LOCKED = `${TRIP}/locked/`;
/** What every page under it shows once applications have closed: the time left until the winners are announced. */
const CLOSED = `${TRIP}/closed/`;
/** The trip's Terms and Privacy Policy: the rules the draw runs under, readable after applications close too. */
const LEGAL = /^\/free-china-trip\/(?:terms|privacy)(?:\/|$)/;
/** The trip's files, not its pages: its pictures and its sounds. */
const FILE = /\.(?:webp|png|jpe?g|avif|gif|svg|ico|wav|mp3|m4a|ogg|mp4|webm)$/i;
/** Where the lock is read from: this site, under one of its own names. */
const OWN_HOST = /^(?:(?:www\.)?affhan\.com|localhost|127\.0\.0\.1)$/i;

/**
 * The Free China Business Trip's lock, at the door (lib/trip-lock.ts).
 *
 * The lock first covered the homepage banner alone, and on 2026-10-06 the
 * owner found its way round: the banner's link, read out of the page in the
 * browser's inspector, still opened the trip. Now, while it is locked, the
 * trip is closed here, before any page is served:
 *
 *  - every page under /free-china-trip/ (the film, the application, the
 *    boarding pass, the trip's terms and privacy, any address under
 *    it) shows "Opening soon" instead (LOCKED), however it is asked for:
 *    typed, linked, prefetched, or a client-side navigation's RSC request.
 *    It is a rewrite, not a redirect, so the address stays as it was typed,
 *    and the page opens there by itself the moment the trip is unlocked
 *    (TripLockedExperience). Nothing of the trip goes out with it: not its
 *    title, its description or its share picture (a gate inside the pages
 *    would still send their metadata);
 *  - its pictures and sounds answer 404;
 *  - the "Opening soon" page itself sends anyone back to the trip once it
 *    is open.
 *
 * The trip's API routes check the lock themselves (tripClosedHere): the app
 * posts applications without any page.
 *
 * An admin signed in to the console passes, to check the trip before it
 * opens; each page then says it is a preview (TripPreviewNote).
 *
 * It fails shut. A lock that cannot be read is locked.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // The matcher lets through anything that merely starts with the name.
  if (pathname !== TRIP && !pathname.startsWith(`${TRIP}/`) && !pathname.startsWith(`${TRIP}.`)) return NextResponse.next();
  // Applications closed (the last moment of 25 November 2026, IST, has passed: lib/trip-application.ts; the owner,
  // 2026-11-25: "the china trip page have to lock and show the only ui is timer only to december 1 winner announce ...
  // auto change to lock"): every page of the trip shows the time left until the winners are announced (CLOSED), at the
  // address asked for, however it is asked for, and to everyone, an admin too (nothing is left to preview, and the
  // owner checks it signed in). First, so it holds whatever the lock says, and an employee's link goes to it too. Its
  // Terms and Privacy Policy stay readable, and its files are served (the clock's tick is one). A development server
  // never closes (applicationWindow).
  if (applicationWindow() === "closed") {
    if (FILE.test(pathname) || LEGAL.test(pathname)) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = CLOSED;
    const res = NextResponse.rewrite(url);
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("X-Robots-Tag", "noindex");
    // How a trip page left open tells that the trip has closed before it reloads into this (TripCloseWatch).
    res.headers.set("X-Trip-Closed", "closed");
    return res;
  }
  // Until then the countdown's own address is not a page of the trip's: an admin may look at it as it will be, and
  // everyone else goes on to the trip (on a development server it opens, to be worked on).
  if (pathname.startsWith(`${TRIP}/closed`) && process.env.NODE_ENV === "production" && !isAdmin(request)) {
    return NextResponse.redirect(new URL(`${TRIP}/`, request.url));
  }
  // An employee's link (?ref=, the referral task, the owner 2026-11-02) opens the application, its Terms first, never
  // the film: links shared for the trip's page before then still arrive there (lib/trip-referral-shared.ts,
  // referralLink). Before the lock, which then covers the application as it covers everything else.
  if ((pathname === TRIP || pathname === `${TRIP}/`) && request.nextUrl.searchParams.has("ref")) {
    const url = request.nextUrl.clone();
    url.pathname = `${TRIP}/apply/`;
    return NextResponse.redirect(url, 307);
  }
  if (isAdmin(request)) return NextResponse.next();

  if (!(await isLocked(request))) {
    return pathname.startsWith(`${TRIP}/locked`) ? NextResponse.redirect(new URL(`${TRIP}/`, request.url)) : NextResponse.next();
  }
  if (FILE.test(pathname)) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  // The query stays (a client-side navigation's _rsc rides on it).
  const url = request.nextUrl.clone();
  url.pathname = LOCKED;
  const res = NextResponse.rewrite(url);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  // How the "Opening soon" page tells the door is open again before it reloads.
  res.headers.set("X-Trip-Lock", "locked");
  return res;
}

/**
 * An admin signed in to the console, inside its idle window
 * (lib/session-token.ts).
 *
 * The signature and the window only: the session's version is in the
 * database (lib/session.ts), and the proxy has none. So a cookie revoked by a
 * password change can still preview the trip's pages for what is left of its
 * thirty minutes. The trip's API routes check the version (tripClosedHere).
 */
function isAdmin(request: NextRequest) {
  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  return !!session && session.user.role === ADMIN_ROLE && adminSessionIsFresh(session.issuedAt);
}

/**
 * Whether the trip is locked, as this site's /api/trip-lock/ says: the
 * route that reads it fail-shut, and that the edge keeps for five seconds,
 * so however many visitors arrive the database is asked about once every
 * five seconds. Not Prisma here: its engine is a native library that the
 * proxy's bundle does not carry. Asked of this site only, under its own
 * name, so a forged Host cannot answer for it.
 */
async function isLocked(request: NextRequest): Promise<boolean> {
  const { origin, hostname } = request.nextUrl;
  if (!OWN_HOST.test(hostname) && hostname !== process.env.VERCEL_URL && hostname !== process.env.VERCEL_BRANCH_URL) return true;
  try {
    const res = await fetch(new URL("/api/trip-lock/", origin), { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return true;
    const json = (await res.json()) as { locked?: unknown };
    return json.locked !== false;
  } catch {
    return true;
  }
}

export const config = {
  // The trip, its pages and its files, and the same name with a suffix
  // (/free-china-trip.rsc and the like): whatever might serve any of it.
  matcher: ["/free-china-trip(.*)"],
};
