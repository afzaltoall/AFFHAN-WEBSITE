/**
 * The words of the trip's sign-in gate (SignInGate) and the reason the
 * sign-in popup gives (LoginModal's eyebrow line).
 */
export const TRIP_SIGN_IN = {
  /** Over the sign-in popup: why it is asking. */
  reason: "Sign in to join the Free China Business Trip",
  eyebrow: "AFFHAN International presents",
  title: ["Free China", "Business Trip"],
  line: "Sign in to open the trip and apply. Your application is kept with your account, under your own Trip ID.",
  button: "Sign in to continue",
  home: { href: "/", label: "Back to AFFHAN" },
} as const;

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
