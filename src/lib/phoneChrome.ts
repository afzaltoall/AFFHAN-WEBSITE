/**
 * Which frame a page has on a phone (below 768px), shared by the navbar and
 * the phone frame (components/mobile/PhoneChrome.tsx), so the two can never
 * disagree about which of them is showing.
 *
 *   "full"  the phone frame: the logo and a search box across the top, and
 *           the tab bar along the bottom (Alibaba.com's mobile site, which the
 *           owner asked for on 2026-10-13: "no navbar for mobile").
 *   "plain" the frame's top alone, the logo and nothing else: signing in and
 *           resetting a password, where a search box or the tabs would only
 *           pull someone away from the one thing on the page.
 *   "none"  the navbar, as before. The Free China Trip's pages have their own
 *           film and stages under it (and pad for it, --nav-h); admin and the
 *           staff workspace have no site frame at all.
 *
 * From 768px up every page has the navbar, whatever this says.
 */
export type PhoneChrome = "none" | "plain" | "full";

export function phoneChromeFor(pathname: string | null | undefined): PhoneChrome {
  const bare = (pathname ?? "/").replace(/\/$/, "") || "/";
  if (bare === "/admin" || bare.startsWith("/admin/") || bare === "/employee" || bare.startsWith("/employee/")) return "none";
  // "experience" as the floating dock reads it (WhatsAppButton): the trip's own pages.
  if (bare === "/free-china-trip" || bare.startsWith("/free-china-trip/") || bare.includes("experience")) return "none";
  if (bare === "/login" || bare === "/forgot-password") return "plain";
  return "full";
}

/** The phone frame's tab bar: its height above the safe area (the page leaves this much room under itself). */
export const PHONE_TABS_HEIGHT = "3.5rem";
