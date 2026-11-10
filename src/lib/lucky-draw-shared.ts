import { TRIP_FACTS } from "@/lib/trip-legal";

/**
 * The Free China Trip's lucky draw (the owner, 2026-11-10: "a lucky draw page which our CEO will click to draw the
 * lucky person ... our target is 5 persons, each draw 1 person ... make it infinity: even after 5, if someone says they
 * can't, we spin again"). What the server, the console and the TV screen share: the seats, how they are filled, and
 * how a person's name and city are set. No database here, so a test can load it as it is.
 *
 * Five seats (the Terms' five winners), drawn in rounds (the owner, the same day: "after completing 5 seats ... give a
 * next option, click it and draw 2 opens"). Each round has five seats of its own, filled in order from seat 1. When
 * all five are taken, the screen and the console offer "Start round 2"; the next draw then takes seat 1 of round 2,
 * the round before kept as it was. Someone who can't take part (released, or their application taken out as spam or
 * deleted) leaves their seat open, and the next draw fills it before any other (Terms clause 4: "offer the place to
 * the next eligible reserve applicant"). So Draw always works: there is always another person to draw, until nobody is
 * left.
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
  /** The round it was drawn in. */
  round: number;
  /** Its seat in that round (1 to 5), or null once released. */
  seat: number | null;
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
  /** The current round's five seats: each a draw's id, or null while open. */
  seats: (string | null)[];
  /** The current round (1 before any draw). */
  round: number;
  /** Every round's five seats, round 1 first. */
  rounds: (string | null)[][];
  /** The draw the screen shows large: the last one made, while it still holds its seat. */
  latest: string | null;
  /** Whether applications are still being taken (the live draw waits for them to close). */
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

export interface Seating {
  /** Every round's five seats, round 1 first; the last is the current round. */
  rounds: (string | null)[][];
  /** Each draw's round, and its seat in that round (from 1; null once released), by its id. */
  roundOf: Record<string, number>;
  seatOf: Record<string, number | null>;
  /** Released or taken out, in the order it happened. */
  out: string[];
}

/**
 * Who holds which seat, worked out from the draws alone (never stored): every draw and every release played in the
 * order they happened. A draw takes the first open seat of the current round, or, when all five are taken, seat 1 of
 * a new round. A release opens its holder's seat (in whichever round). Someone taken out as spam or deleted without a
 * release counts as released after everything else. Restoring a release (its time cleared) is as if it never happened.
 */
export function seatDraws(
  draws: readonly { id: string; number: number; drawnAt: string; releasedAt: string | null; removed?: boolean }[],
  seats: number = DRAW_SEATS,
): Seating {
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
  const empty = () => Array.from({ length: seats }, (): string | null => null);
  const rounds: (string | null)[][] = [empty()];
  const roundOf: Record<string, number> = {};
  const seatOf: Record<string, number | null> = {};
  const out: string[] = [];
  for (const s of steps) {
    if (!s.release) {
      let current = rounds[rounds.length - 1];
      let i = current.indexOf(null);
      if (i < 0) {
        current = empty();
        rounds.push(current);
        i = 0;
      }
      current[i] = s.id;
      roundOf[s.id] = rounds.length;
      seatOf[s.id] = i + 1;
      continue;
    }
    out.push(s.id);
    for (const round of rounds) {
      const i = round.indexOf(s.id);
      if (i >= 0) round[i] = null;
    }
    seatOf[s.id] = null;
  }
  return { rounds, roundOf, seatOf, out };
}

/** Where the next draw goes: the first open seat of the current round, or seat 1 of the next round once all are taken. */
export function nextPlace(board: Pick<DrawBoard, "seats" | "round">): { n: number; round: number } {
  const open = board.seats.indexOf(null);
  return open >= 0 ? { n: open + 1, round: board.round } : { n: 1, round: board.round + 1 };
}

/** Whether every seat of the current round is taken (the next draw starts a new round). */
export const roundFull = (board: Pick<DrawBoard, "seats">) => board.seats.length > 0 && board.seats.every(Boolean);

/** "Round 1 · Seat 3 of 5". */
export const seatWords = (p: { n: number; round: number }) => `Round ${p.round} · Seat ${p.n} of ${DRAW_SEATS}`;

/** Small words that stay small inside a name ("Mohamed bin Rashid", "Lucas da Silva"). */
const PARTICLES = new Set(["bin", "binti", "bint", "van", "von", "der", "de", "da", "di", "du"]);
/** A word's first letter, and each after an apostrophe, a full stop or a hyphen, as a capital; nothing else touched. */
const capitalise = (w: string) => w.replace(/(^|['.-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());

/**
 * A name or a city as people typed it, set for a screen, word by word: spaces tidied; every word begins with a capital
 * ("mohamed ismail" and "MOHAMED ISMAIL" -> "Mohamed Ismail"; "Mohamed Shairaz fathima Rukaiya" -> "... Fathima ...");
 * a word typed with its own capitals kept ("McDonald"); in a name of mixed case, a short word in capitals kept as
 * initials ("Rayyan Ahamed AK") and a longer one set as a name ("MOHAMED Ismail" -> "Mohamed Ismail"); particles kept
 * small after the first word ("bin", "da").
 */
export function personName(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return s;
  const oneCase = s === s.toLowerCase() || s === s.toUpperCase();
  return s
    .split(" ")
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && PARTICLES.has(lower) && (oneCase || word === lower)) return lower;
      if (oneCase) return capitalise(lower);
      const letters = word.replace(/[^\p{L}]/gu, "");
      if (word === word.toUpperCase() && letters !== letters.toLowerCase()) return letters.length >= 4 ? capitalise(lower) : word;
      return capitalise(word);
    })
    .join(" ");
}
