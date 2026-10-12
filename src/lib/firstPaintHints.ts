/**
 * What the navbar can draw from the first frame, before React runs: what this
 * device last saw of the account (AuthContext's hint) and of the Free China
 * Trip's lock (TripNavLink). The owner, 2026-10-12: "loading late", a grey
 * pill where the account belongs and a trip without its lock for the first
 * half second of every page.
 *
 * The layout runs FIRST_PAINT_SCRIPT first in <body>, before the navbar's HTML
 * is parsed, so it sets these on <html> before anything paints:
 *   data-me="out"          signed out last time: the stand-in reads "Login";
 *   data-me="in"           signed in: the stand-in is the avatar's shape, with
 *     --me-initial, --me-name  the account's initial and name (CSS content);
 *   data-trip-locked="1"   the trip's lock badge shows.
 * globals.css draws from them (.auth-ph-*, .trip-lock-badge) until React has
 * the answer itself. A plain module, not a client one, so the layout (a server
 * component) can take the string.
 */
export const ME_HINT_KEY = "affhan:me-hint";
export const TRIP_LOCK_KEY = "affhan:trip-locked";

export const FIRST_PAINT_SCRIPT = `(function(){try{var d=document.documentElement,s=localStorage,h=s.getItem(${JSON.stringify(ME_HINT_KEY)});if(h==="signed-out")d.setAttribute("data-me","out");else if(h){var u=JSON.parse(h),n=String(u.name||u.phone||"");if(n){d.setAttribute("data-me","in");d.style.setProperty("--me-initial",JSON.stringify(n.charAt(0).toUpperCase()));d.style.setProperty("--me-name",JSON.stringify(n))}}if(s.getItem(${JSON.stringify(TRIP_LOCK_KEY)})==="1")d.setAttribute("data-trip-locked","1")}catch(e){}})();`;
