/**
 * The browser half of a session: keep-alives, and the sign-out that has to beat
 * them.
 *
 * Both consoles run a keeper that touches the session while somebody is
 * working, and both put a Sign out button on the same screen. Clicking it is a
 * pointerdown, which is activity, so the keeper fires a keep-alive in the same
 * tick as the logout. Two requests, two Set-Cookie headers, and whichever lands
 * second wins — so a sign-out could be undone by the keep-alive that the
 * sign-out click itself triggered. Observed on the staff workspace: the logout
 * cleared the cookie at 116ms and the keep-alive re-installed a live one at
 * 519ms, leaving somebody on the login page still holding a working session.
 *
 * Ordering is not something to hope for, so it is arranged here. A sign-out
 * stops any further keep-alives, waits for the ones already in the air to land
 * (fetch resolves once the response's headers — and therefore its cookie — have
 * been applied), and only then asks for the cookie to be cleared. Its clearing
 * header is always the last one.
 *
 * The flag also spares the reader a lie: a keeper polling through a sign-out
 * would get a 401 and announce that their session had timed out.
 */

const inFlight = new Set<Promise<unknown>>();
let signingOut = false;

/** Has a sign-out started in this document? */
export function isSigningOut(): boolean {
  return signingOut;
}

/**
 * A keeper mounting means there is a live session again, so forget any earlier
 * sign-out.
 *
 * Signing out and back in never reloads the page — both are client-side
 * navigations — so without this the flag set by the first sign-out would
 * outlive it and mute the keeper for the whole of the next session, which
 * would then lapse mid-work at the thirty-minute mark.
 */
export function armSessionKeeper(): void {
  signingOut = false;
}

/**
 * A session request from a keeper: POST to touch, GET to ask.
 *
 * Returns null when a sign-out has started, so callers stop rather than act on
 * an answer about a session that is being closed.
 */
export async function sessionRequest(url: string, method: "GET" | "POST"): Promise<Response | null> {
  if (signingOut) return null;
  const req = fetch(url, { method, cache: "no-store", credentials: "same-origin" });
  const tracked = req.catch(() => null);
  inFlight.add(tracked);
  try {
    return await req;
  } finally {
    inFlight.delete(tracked);
  }
}

/**
 * Sign out through `url`, after everything already asked for has been answered.
 *
 * Never throws: a logout that cannot reach the server still has to let the page
 * move on, or the button appears to do nothing.
 */
export async function signOutThrough(url: string): Promise<void> {
  signingOut = true;
  if (inFlight.size) await Promise.allSettled([...inFlight]);
  try {
    await fetch(url, { method: "POST", cache: "no-store", credentials: "same-origin" });
  } catch {
    // Offline, or the request was refused. The caller leaves regardless.
  }
}
