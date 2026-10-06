import { TRIP_APPLY_HREF, TRIP_FACTS, TRIP_PRIVACY_HREF, TRIP_TERMS_HREF } from "@/lib/trip-legal";

/**
 * Every word on /free-china-trip/registered/, the participants board. The
 * dates and the number of places are the Terms' own (TRIP_FACTS). Nothing
 * here promises a place: eligible applications go into a random draw.
 */
export const REGISTERED = {
  eyebrow: "AFFHAN International · Free China Business Trip",
  title: { registered: "You're registered", visitor: "The participants" },
  welcome: (firstName: string) => `Welcome aboard, ${firstName}. Your application is in, under your own Trip ID.`,
  draw: `Eligible applications enter a random draw for ${TRIP_FACTS.winners} places. The winners are announced on ${TRIP_FACTS.winnersAnnounced}.`,
  visitor: "Everyone who has registered for the trip, as they arrive.",
  pass: {
    brand: "AFFHAN International",
    kind: "Boarding pass",
    passenger: "Passenger",
    tripId: "Trip ID",
    from: "From",
    to: "To",
    toValue: "China",
    registered: "Registered",
    announced: "Winners announced",
    statusLabel: "Status",
    status: "Application received",
    /** The entry seal on the stub: around its rim, top and bottom; the date is in its middle. */
    seal: { top: "Registered", bottom: "Free China Trip" },
  },
  live: {
    label: "Registered",
    tag: "Live",
    places: `registered for ${TRIP_FACTS.winners} places`,
    /** For screen readers, in place of the drums. */
    total: (n: number) => `${n.toLocaleString("en-IN")} registered for ${TRIP_FACTS.winners} places`,
    arrived: (n: number) => `+${n} just now`,
    today: (n: number) => `${n.toLocaleString("en-IN")} today`,
    lastHour: (n: number) => `${n.toLocaleString("en-IN")} in the last hour`,
    from: "From",
    moreCountries: (n: number) => `and ${n} more ${n === 1 ? "country" : "countries"}`,
  },
  pool: {
    eyebrow: "The draw",
    title: `${TRIP_FACTS.winners} places`,
    line: "Drawn at random from the eligible applications.",
    announced: "Winners announced",
    date: TRIP_FACTS.winnersAnnounced,
    units: ["Days", "Hours", "Min", "Sec"],
    reached: "Today is the day.",
    calendar: {
      button: "Add to calendar",
      google: "Google Calendar",
      file: "Apple, Outlook and others (.ics)",
      title: "Free China Business Trip: winners announced",
      details: (ref: string | null) =>
        `AFFHAN announces the ${TRIP_FACTS.winners} winners of the Free China Business Trip, drawn at random from the eligible applications.${ref ? ` Your Trip ID: ${ref}.` : ""}`,
    },
  },
  board: {
    title: "Latest registrations",
    cols: ["Trip ID", "From", "Registered"],
    you: "You",
    empty: "No registrations yet. Be the first.",
    error: "The board could not refresh just now. It will try again shortly.",
    privacy: "Shown here: Trip ID, country and time only. Names and contact details are never shown.",
    /** The board holds the newest few dozen (lib/trip-participants.ts): "all" only when that is all there are. */
    more: (n: number, total: number) => (total > n ? `Show the ${n} newest` : `Show all ${n}`),
    fewer: "Show fewer",
  },
  apply: {
    line: "You have not applied yet. Registration takes a few minutes.",
    button: "Apply for the Trip",
    href: TRIP_APPLY_HREF,
  },
  links: [
    { href: "/free-china-trip/", label: "View trip details" },
    { href: TRIP_TERMS_HREF, label: "Terms & Conditions" },
    { href: TRIP_PRIVACY_HREF, label: "Privacy Policy" },
    { href: "/", label: "Back to AFFHAN" },
  ],
} as const;
