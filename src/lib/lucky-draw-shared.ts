import { TRIP_FACTS } from "@/lib/trip-legal";

/**
 * The Free China Trip's lucky draw (the owner, 2026-11-10: "a lucky draw page which our CEO will click to draw the
 * lucky person ... our target is 5 persons, each draw 1 person ... make it infinity: even after 5, if someone says they
 * can't, we spin again"). What the server, the console and the TV screen share: the seats, how they are filled, and
 * how a person's name and city are set. No database here, so a test can load it as it is.
 *
 * Five seats (the Terms' five winners). A draw takes the first open seat; once all five are taken it is a reserve. A
 * person released (they can't take part, or the team took their application out as spam or deleted) gives their seat
 * to the first reserve, or leaves it open for the next draw: Terms clause 3 ("Affhan may also select reserve
 * applicants through the same random-selection process") and clause 4 ("offer the place to the next eligible reserve
 * applicant"). So Draw always works, as the owner asked: there is always another person to draw, until nobody is left.
 */
export const DRAW_SEATS = TRIP_FACTS.winners;

/** "live" draws are the result; "rehearsal" draws are practice on the screen and never stop anyone being drawn. */
export const DRAW_MODES = ["live", "rehearsal"] as const;
export type DrawMode = (typeof DRAW_MODES)[number];
export const isDrawMode = (v: unknown): v is DrawMode => typeof v === "string" && (DRAW_MODES as readonly string[]).includes(v);

/** Who is in the draw, in words (the owner's choice, 2026-11-10: "Only those with a valid passport"). */
export const DRAW_POOL_RULE = "Applicants who said they have a valid passport, not marked spam or deleted, one chance per mobile number";

/** One draw as the TV screen may show it: the Terms allow limited winner information to be shown, never private
 *  contact details (Privacy Policy section 12), so no mobile number, and nothing of who pressed Draw. */
export interface DrawCardPublic {
  id: string;
  number: number;
  tripId: string;
  name: string;
  city: string;
  country: string;
  /** ISO. */
  drawnAt: string;
  /** How many were in the draw when this one was drawn. */
  poolSize: number;
  /** Released by the team (can't take part), or taken out as spam or deleted since: no longer holds a seat. */
  out: boolean;
}

/** The same draw for the console: who it is and how to reach them, who drew and who released. */
export interface DrawCardFull extends DrawCardPublic {
  applicationId: string;
  phone: string;
  drawnBy: string;
  poolHash: string;
  releasedAt: string | null;
  releasedBy: string | null;
  releaseNote: string | null;
  /** The application's own status now ("new", "handled", "spam", "deleted"). */
  status: string;
}

export interface DrawBoard<C extends DrawCardPublic = DrawCardPublic> {
  mode: DrawMode;
  /** Who can still be drawn in this mode, now. */
  poolSize: number;
  /** Every draw in this mode, in the order drawn. */
  cards: C[];
  /** The five seats: each a draw's id, or null while open. */
  seats: (string | null)[];
  /** Drawn after the seats were full, in order: the first moves up when a seated person is released. */
  reserves: string[];
  /** The draw the screen shows large: the last one made, while it still holds a seat or a reserve's place. */
  latest: string | null;
  /** Whether applications are still being taken (a live draw now leaves out whoever applies later). */
  applicationsOpen: boolean;
  /** False when the draw's table is not in this database yet (its migration not applied). */
  ready: boolean;
}

/**
 * One person in the draw as the TV screen's list shows them (the owner, 2026-11-10: "everyone who applied, their names
 * in a line, a list ... it scrolls, an arrow at the side, wherever it stops, that one"): Trip ID, name, city, country.
 * Never a mobile number. The trip's Privacy Policy, section 12, says the screen shows this; change the two together.
 */
export type DrawPoolEntry = [tripId: string, name: string, city: string, country: string];

/** Everyone who can be drawn in a mode now, in Trip ID order: the order the server draws from. */
export interface DrawPool {
  size: number;
  entries: DrawPoolEntry[];
  /** False when the draw's table is not in this database yet (everyone counts as not drawn). */
  ready: boolean;
}

/** Trip IDs in the order the draw puts everyone in (plain character order: TRIP-26-00001 before TRIP-26-00002). */
export const compareTripIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Who holds which seat, worked out from the draws alone (never stored): every draw and every release played in the
 * order they happened. A draw takes the first open seat, or joins the reserves; a release frees its seat for the first
 * reserve (or leaves it open), or takes its reserve off the list. Someone taken out as spam or deleted without a
 * release counts as released after everything else. Restoring a release (its time cleared) is as if it never happened.
 * A seat once given never moves to somebody else while its holder stands.
 */
export function seatDraws(
  draws: readonly { id: string; number: number; drawnAt: string; releasedAt: string | null; removed?: boolean }[],
  seats: number = DRAW_SEATS,
): { seats: (string | null)[]; reserves: string[]; out: string[] } {
  type Step = { at: number; release: boolean; number: number; id: string };
  const steps: Step[] = [];
  // Draws in their own order, each dated no earlier than the one before it: their numbers say the order they were made.
  let since = Number.NEGATIVE_INFINITY;
  for (const d of [...draws].sort((x, y) => x.number - y.number)) {
    since = Math.max(since, Date.parse(d.drawnAt));
    steps.push({ at: since, release: false, number: d.number, id: d.id });
    if (d.releasedAt) steps.push({ at: Math.max(since, Date.parse(d.releasedAt)), release: true, number: d.number, id: d.id });
    else if (d.removed) steps.push({ at: Number.POSITIVE_INFINITY, release: true, number: d.number, id: d.id });
  }
  // In time order; at the same moment a draw before a release, and draws in their own order.
  steps.sort((a, b) => a.at - b.at || Number(a.release) - Number(b.release) || a.number - b.number);
  const held: (string | null)[] = Array.from({ length: seats }, () => null);
  const reserves: string[] = [];
  const out: string[] = [];
  for (const s of steps) {
    if (!s.release) {
      const open = held.indexOf(null);
      if (open >= 0) held[open] = s.id;
      else reserves.push(s.id);
      continue;
    }
    out.push(s.id);
    const seat = held.indexOf(s.id);
    if (seat >= 0) held[seat] = reserves.shift() ?? null;
    else {
      const r = reserves.indexOf(s.id);
      if (r >= 0) reserves.splice(r, 1);
    }
  }
  return { seats: held, reserves, out };
}

/** Where a draw stands on the board: "Seat 3", "Reserve 1", or null when it no longer holds either. */
export function placeOf(board: Pick<DrawBoard, "seats" | "reserves">, id: string): { kind: "seat" | "reserve"; n: number } | null {
  const seat = board.seats.indexOf(id);
  if (seat >= 0) return { kind: "seat", n: seat + 1 };
  const reserve = board.reserves.indexOf(id);
  if (reserve >= 0) return { kind: "reserve", n: reserve + 1 };
  return null;
}

/**
 * A name or a city as people typed it, set for a screen: spaces tidied, and one typed all in small letters or all in
 * capitals given capitals where a name has them ("mohamed ismail", "MOHAMED ISMAIL" -> "Mohamed Ismail"). Anything
 * typed with its own mix of capitals ("McDonald", "Abdul-Rahman") is kept as it was.
 */
export function personName(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return s;
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'.-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** The five digits a Trip ID ends with ("TRIP-26-04217" -> "04217"), which the screen turns over one by one. */
export function tripIdDigits(tripId: string): string {
  const m = /(\d{5})$/.exec(tripId);
  return m ? m[1] : tripId.replace(/\D/g, "").slice(-5).padStart(5, "0");
}

/** The part of a Trip ID before its digits ("TRIP-26-"), shown still while they turn. */
export function tripIdPrefix(tripId: string): string {
  return tripId.replace(/\d{5}$/, "");
}
