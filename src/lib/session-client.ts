/**
 * The browser half of a session: keep-alives, the sign-out that has to beat
 * them, and the channel that keeps every tab of one session in step.
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

/** Whose session: the console's, or the staff workspace's. Separate cookies. */
export type SessionRole = "admin" | "staff";

/**
 * One channel per session, shared by every tab holding it.
 *
 * Tabs share the cookie, so they share the session — but each tab only knows
 * what it has itself been told. Without this, working in one tab left another
 * counting down to a timeout that had already been pushed back, and signing
 * out in one tab left the others looking signed in until they next asked.
 */
const CHANNEL: Record<SessionRole, string> = {
  admin: "affhan:admin-session",
  staff: "affhan:staff-session",
};

export type SessionMessage =
  /** The window was pushed back. A local-clock time: every tab in one browser reads the same clock. */
  | { type: "extended"; expiresAt: number }
  | { type: "signed-out" };

export function openSessionChannel(role: SessionRole): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(CHANNEL[role]);
  } catch {
    return null;
  }
}

/** Tell the session's other tabs. Best effort: a browser without the API simply polls. */
export function announce(role: SessionRole, message: SessionMessage): void {
  const channel = openSessionChannel(role);
  if (!channel) return;
  try {
    channel.postMessage(message);
  } finally {
    channel.close();
  }
}

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
 * Sign out through `url`, after everything already asked for has been answered,
 * then tell this session's other tabs so they leave too.
 *
 * Never throws: a logout that cannot reach the server still has to let the page
 * move on, or the button appears to do nothing.
 */
export async function signOutThrough(url: string, role: SessionRole): Promise<void> {
  signingOut = true;
  if (inFlight.size) await Promise.allSettled([...inFlight]);
  try {
    await fetch(url, { method: "POST", cache: "no-store", credentials: "same-origin" });
  } catch {
    // Offline, or the request was refused. The caller leaves regardless.
  }
  announce(role, { type: "signed-out" });
}
