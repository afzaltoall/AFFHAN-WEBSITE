import { TRIP_APPLY_HREF, TRIP_FACTS, TRIP_PRIVACY_HREF, TRIP_TERMS_HREF } from "@/lib/trip-legal";

/**
 * Every word on /free-china-trip/registered/, the participants board, in plain
 * words: short sentences anyone can follow (the owner, 2026-10-07, found the
 * earlier ones hard to understand). The dates and the number of places are
 * the Terms' own (TRIP_FACTS), and so are the steps after applying (Terms,
 * sections 1, 3 and 4). Nothing here promises a place: eligible applications
 * go into a random draw.
 */
export const REGISTERED = {
  eyebrow: "AFFHAN International · Free China Business Trip",
  title: { registered: "You're registered", visitor: "The applicants" },
  welcome: (firstName: string) => `Welcome, ${firstName}. We have received your application. This is your boarding pass, with your Trip ID.`,
  draw: `All eligible applications go into a random draw for ${TRIP_FACTS.winners} places. The winners are announced on ${TRIP_FACTS.winnersAnnounced}.`,
  visitor: "Everyone who has applied for the trip, updated live.",
  pass: {
    brand: "AFFHAN International",
    kind: "Boarding pass",
    passenger: "Passenger",
    tripId: "Trip ID",
    from: "From",
    to: "To",
    toValue: "China",
    registered: "Applied on",
    announced: "Winners announced",
    statusLabel: "Status",
    status: "Application received",
    /** The entry seal on the stub: around its rim, top and bottom; the date is in its middle. */
    seal: { top: "Registered", bottom: "Free China Trip" },
  },
  live: {
    label: "Applicants",
    places: `people have applied for ${TRIP_FACTS.winners} places`,
    /** For screen readers, in place of the drums. */
    total: (n: number) => `${n.toLocaleString("en-IN")} people have applied for ${TRIP_FACTS.winners} places`,
    arrived: (n: number) => `+${n} just now`,
    today: (n: number) => `${n.toLocaleString("en-IN")} applied today`,
    lastHour: (n: number) => `${n.toLocaleString("en-IN")} in the last hour`,
    from: "Applicants by country",
    moreCountries: (n: number) => `and ${n} more ${n === 1 ? "country" : "countries"}`,
    /**
     * An application arriving while the page is open, or, on arriving, one of the day's last few
     * told as it was, with its real time ("4 min ago", DepartureBoard's `ago`). Anonymous, as the
     * board (Privacy Policy, sections 5 and 12).
     */
    toast: {
      title: "New application",
      earlier: (when: string) => `Applied ${when}`,
      line: (ref: string, country: string) => `${ref} from ${country}`,
      mineTitle: "You're in the draw",
      mine: (ref: string) => `Your ticket ${ref} is in the draw globe.`,
    },
    /** The board's own clock, India time, as an airport board shows the time (BoardClock). */
    clock: {
      zone: "IST",
      updated: "Updated just now",
      ago: (s: number) => `Updated ${s} s ago`,
      title: "This list updates by itself every few seconds. Times are India time (IST).",
    },
  },
  /** The draw globe: one ticket in it for each application (DrawGlobe). */
  globe: {
    eyebrow: "The draw globe",
    title: "One ticket for every applicant",
    mine: "Yours glows, marked YOU.",
    line: `${TRIP_FACTS.winners} winners are picked at random and announced on ${TRIP_FACTS.winnersAnnounced}.`,
    label: (n: number, mine: boolean) =>
      `A glass globe holding one ticket for each of the ${n.toLocaleString("en-IN")} applicants${mine ? ", yours among them" : ""}.`,
    shake: "Click to mix the tickets",
  },
  pool: {
    eyebrow: "The draw",
    title: `${TRIP_FACTS.winners} winners`,
    line: `${TRIP_FACTS.winners} people win a place on the trip to China. They are picked at random from all eligible applications.`,
    /** The places as the aircraft's lit windows (FlightSeats): one for each, the Terms' own number, and the note pointing to them. */
    flight: {
      lit: TRIP_FACTS.winners,
      label: `The aircraft to China, ${TRIP_FACTS.winners} of its windows lit: ${TRIP_FACTS.winners} seats for the ${TRIP_FACTS.winners} winners`,
      note: `${TRIP_FACTS.winners} seats for the ${TRIP_FACTS.winners} winners`,
    },
    announced: "Winners announced",
    date: TRIP_FACTS.winnersAnnounced,
    units: ["Days", "Hours", "Min", "Sec"],
    reached: "The winners are announced today.",
    calendar: {
      button: "Add to calendar",
      google: "Google Calendar",
      file: "Apple, Outlook and others (.ics)",
      title: "Free China Business Trip: winners announced",
      details: (ref: string | null) =>
        `AFFHAN announces the ${TRIP_FACTS.winners} winners of the Free China Business Trip, picked at random from the eligible applications.${ref ? ` Your Trip ID: ${ref}.` : ""}`,
    },
  },
  /**
   * After applying, step by step, as the Terms set it out (sections 1, 3 and 4), following the stage
   * the team sets in the console (lib/trip-stage.ts): the steps it has passed done, the one it is at
   * "Now". For someone who has not applied, the first step is the applications themselves.
   */
  next: {
    title: "What happens next",
    applied: { title: "You applied", line: (date: string) => `Received on ${date}.` },
    apply: { title: "Applications", line: `Open until ${TRIP_FACTS.applicationsClose}.` },
    tags: { done: "Done", now: "Now", next: "Next" },
    steps: [
      { title: "Eligibility check", line: "Each application is checked against the requirements." },
      { title: "Random draw", line: `${TRIP_FACTS.winners} winners are picked at random from the eligible applications.` },
      { title: "Winners announced", line: `On ${TRIP_FACTS.winnersAnnounced}. The winners are contacted to confirm their details.` },
      { title: "Trip date shared", line: "The trip date and plan are sent to the winners." },
    ],
  },
  board: {
    title: "Latest applications",
    cols: ["Trip ID", "Country", "Applied"],
    you: "You",
    empty: "No applications yet. Be the first!",
    error: "We could not update the list just now. We will try again in a moment.",
    privacy: "For privacy, only the Trip ID, country and time are shown. Names and contact details are never shown.",
    /** The board holds the newest few dozen (lib/trip-participants.ts): "all" only when that is all there are. */
    more: (n: number, total: number) => (total > n ? `Show the ${n} newest` : `Show all ${n}`),
    fewer: "Show fewer",
  },
  apply: {
    line: "You have not applied yet. It only takes a few minutes.",
    button: "Apply for the trip",
    href: TRIP_APPLY_HREF,
  },
  /** The page's foot: where to go next, each with a word on what is there. */
  close: {
    sign: "AFFHAN International · Free China Business Trip",
    links: [
      { href: "/free-china-trip/", label: "Trip details", line: "What the trip is and how it works", icon: "plane" },
      { href: TRIP_TERMS_HREF, label: "Terms & Conditions", line: "The rules of the trip and the draw", icon: "terms" },
      { href: TRIP_PRIVACY_HREF, label: "Privacy Policy", line: "What we collect and how we keep it safe", icon: "privacy" },
      { href: "/", label: "Back to AFFHAN", line: "Sourcing from China since 2000", icon: "home" },
    ],
  },
} as const;
