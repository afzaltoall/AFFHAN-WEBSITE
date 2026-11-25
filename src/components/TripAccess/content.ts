import { TRIP_FACTS, TRIP_PRIVACY_HREF, TRIP_TERMS_HREF } from "@/lib/trip-legal";

/**
 * The words of the page every trip page shows while the trip is locked
 * (TripLockedExperience; proxy.ts). Nothing here gives a date: the trip opens
 * when an admin unlocks it, and the page opens with it.
 */
export const TRIP_LOCKED = {
  eyebrow: "AFFHAN International · Free China Business Trip",
  title: "Opening soon",
  line: "The trip isn't open yet. Keep this page open, and it opens right here the moment it does.",
  status: {
    waiting: "Unlocks live, right here",
    denied: "Locked for now",
    unlocking: "Unlocking now",
    opening: "Opening the trip",
  },
  /** For someone who registered before it was locked: their own Trip ID. */
  registered: "You're registered",
  links: [
    { href: "/", label: "Back to AFFHAN" },
    { href: "/contact/", label: "Contact us" },
  ],
} as const;

/** The note on each trip page for an admin checking it while it is locked (TripPreviewNote). */
export const TRIP_PREVIEW = {
  label: "Preview",
  line: "Locked for visitors",
  manage: { href: "/admin/trip-applications/#trip-lock", label: "Trip lock" },
  hide: "Hide this note",
} as const;

/**
 * The words of the page every trip page shows once applications have closed (TripClosedExperience; proxy.ts): the
 * time left until the winners are announced, as the trip film ends on it (the owner, 2026-11-25: "the china trip page
 * have to lock and show the only ui is timer only to december 1 winner announce"). The dates are the Terms' own.
 */
export const TRIP_CLOSED = {
  eyebrow: "Winners announced",
  title: TRIP_FACTS.winnersAnnounced,
  now: "Now in India",
  /** Once the clock reaches zero, in place of the date and time under it. */
  reached: "The winners are announced today.",
  closed: `Applications for the Free China Business Trip closed on ${TRIP_FACTS.applicationsClose}. Thank you to everyone who applied.`,
  /** The rules the draw runs under stay readable (proxy.ts lets them through). */
  links: [
    { href: TRIP_TERMS_HREF, label: "Terms & Conditions" },
    { href: TRIP_PRIVACY_HREF, label: "Privacy Policy" },
  ],
} as const;
