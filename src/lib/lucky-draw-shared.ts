import { TRIP_FACTS } from "@/lib/trip-legal";

/**
 * The Free China Trip's lucky draw (the owner, 2026-11-10: "a lucky draw page which our CEO will click to draw the
 * lucky person ... our target is 5 persons, each draw 1 person ... make it infinity: even after 5, if someone says they
 * can't, we spin again"). What the server, the console and the TV screen share: the seats, how they are filled, and
 * how a person's name and city are set. No database here, so a test can load it as it is.
 *
 * Five seats (the Terms' five winners), drawn in rounds (the owner, the same day: "after completing 5 seats ... give a
 * next option, click it and draw 2 opens"). Each round has five seats of its own, filled in order from seat 1. When
 * all five are taken, the screen and the console offer the next round; the next draw then takes seat 1 of round 2,
 * the round before kept as it was. Round 1 is the draw, and every round after it the waiting list (2026-11-25;
 * inWaitingList below): "Start waiting list", then "Continue waiting list". Someone who can't take part (released, or
 * their application taken out as spam or deleted) leaves their seat open, and the next draw fills it before any other
 * while it is in the current round (Terms clause 4: "offer the place to the next eligible reserve applicant"). So Draw
 * always works: there is always another person to draw, until nobody is left.
 */
export const DRAW_SEATS = TRIP_FACTS.winners;

/** "live" draws are the result; "rehearsal" draws are practice on the screen and never stop anyone being drawn. */
export const DRAW_MODES = ["live", "rehearsal"] as const;
export type DrawMode = (typeof DRAW_MODES)[number];
export const isDrawMode = (v: unknown): v is DrawMode => typeof v === "string" && (DRAW_MODES as readonly string[]).includes(v);

/**
 * Who is in the draw, in words (the owner, 2026-11-27: "make the valid passport persons only come"; the trip's Terms,
 * clause 3, say so): a valid passport is the one rule. The answer to "Do you run a business?" and an employee's link,
 * both rules from 2026-11-25 to 2026-11-27, no longer matter.
 */
export const DRAW_POOL_RULE = "Applicants who said they have a valid passport, not marked spam or deleted, one chance per mobile number";

/**
 * In the draw, by an application's own answers: what lib/server/lucky-draw.ts's pool asks in SQL (a valid passport),
 * said once for the applicant's own page (no ticket of theirs in the draw globe unless this holds). Spam, deleted and
 * already drawn are the team's doing, not the applicant's, and are left to the pool.
 */
export function inTheDraw(a: { hasPassport: boolean }): boolean {
  return a.hasPassport;
}

/**
 * A seat of the draw given before it (the owner, 2026-11-27: "we already make a lucky draw the person have to come in
 * seat 5 he is already selected and a winner too"; Terms clause 3 says so). That seat of round 1 is theirs: the press
 * that would fill it brings them in, and no other draw can take them. Stored as a TripDraw row of mode "given", its
 * number the seat (lib/server/lucky-draw.ts). While they are still to come in a mode the board names the seat and who
 * holds it, and the TV shows them in it from the start (the owner, the same day: "mention the seat 5 winner in terms
 * and draw place ... now show the draw same as everyone shuffling"), so its press can run the draw's own shuffle and
 * search: the room already sees whose seat it is, as a host placed in A1 is shown before a World Cup draw. Their Trip
 * ID only keeps them off the wall until then; it is never shown.
 */
export interface GivenSeat {
  seat: number;
  tripId: string;
  name: string;
  city: string;
  country: string;
}

/** The same for the console: whose it is, to open their application. */
export interface GivenSeatFull extends GivenSeat {
  applicationId: string;
  phone: string;
}

/**
 * One person in the draw as the console lists them (the owner, 2026-11-25: "show the overall the list of lucky draw set
 * persons to see"): their application (its panel opens from the name), Trip ID, name, city, country, mobile and when
 * they applied. The console's alone: the TV's list (DrawPoolEntry) never has a mobile number.
 */
export interface DrawPerson {
  id: string;
  tripId: string;
  name: string;
  city: string;
  country: string;
  phone: string;
  appliedAt: string;
}

/** One draw as the TV screen may have it: the Terms allow limited winner information to be shown, never private
 *  contact details (Privacy Policy section 12), so no mobile number, and nothing of who pressed Draw. Its Trip ID only
 *  finds the person on the wall; the screen never shows it (2026-11-25). */
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
  /**
   * A seat given before the draw (GivenSeat), not drawn: nobody was drawn from (its row's pool size is 0, which a draw's
   * never is). The screen, which showed them in that seat from the start, never says "drawn at random" of them.
   */
  given: boolean;
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
  /** The draw's seat given before it, while its holder is still to come in this mode (GivenSeat); null otherwise. */
  given: (C extends DrawCardFull ? GivenSeatFull : GivenSeat) | null;
}

/**
 * One person in the draw as the TV screen has them (the owner, 2026-11-10: "everyone who applied, their names in a line,
 * a list ... it scrolls, an arrow at the side, wherever it stops, that one"): Trip ID, name, city, country. Never a
 * mobile number. The screen shows the name, the city and the country; the Trip ID only orders the wall and finds a
 * person on it, and is never drawn or written anywhere on the screen (the owner, 2026-11-25: "trip id kaata vendam and
 * trip id display pana vendam"). The trip's Privacy Policy, section 12, says what the screen shows; change the two
 * together.
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
 * Seats 1 to 3 of every round are drawn from the eligible applicants among the first 1,540 applications received
 * (TRIP-26-00001 to TRIP-26-01540: 12 to 29 October 2026, while signing in was required), seats 4 and 5 from everyone
 * in the draw (the owner, 2026-11-23; the trip's Terms, section 3, say so in those words). The numbers run without a
 * gap and in the order the applications came (checked on the live database the same day), so "the first 1,540" is
 * exactly this range. Within each, every one is equally likely, as before.
 */
export const FIRST_GROUP_SEATS = 3;
export const FIRST_GROUP_FROM = "TRIP-26-00001";
export const FIRST_GROUP_TO = "TRIP-26-01540";
/** Whether a seat (counted from 1) is drawn from the first 1,540 applications only. */
export const seatFromFirstGroup = (seat: number | null | undefined): boolean => !!seat && seat >= 1 && seat <= FIRST_GROUP_SEATS;
/** Whether a Trip ID is one of the first 1,540 applications. */
export const inFirstGroup = (tripId: string): boolean => compareTripIds(tripId, FIRST_GROUP_FROM) >= 0 && compareTripIds(tripId, FIRST_GROUP_TO) <= 0;

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

/**
 * The seat a draw made now takes: the draws so far played as the board plays them (seatDraws), with one more after
 * them, so it is exactly the seat it will be seen in. (Not nextPlace's guess from the board: an application marked spam
 * or deleted lets go of its seat only after every draw, so a draw made now never takes that seat.) `at`: now, ISO.
 */
export function seatOfNextDraw(
  draws: readonly { id: string; number: number; drawnAt: string; releasedAt: string | null; removed?: boolean }[],
  at: string,
  seats: number = DRAW_SEATS,
): { round: number; seat: number } {
  const next = "next-draw";
  const number = draws.reduce((m, d) => Math.max(m, d.number), 0) + 1;
  const seating = seatDraws([...draws, { id: next, number, drawnAt: at, releasedAt: null }], seats);
  return { round: seating.roundOf[next] ?? 1, seat: seating.seatOf[next] ?? 1 };
}

/** Where the next draw goes: the first open seat of the current round, or seat 1 of the next round once all are taken. */
export function nextPlace(board: Pick<DrawBoard, "seats" | "round">): { n: number; round: number } {
  const open = board.seats.indexOf(null);
  return open >= 0 ? { n: open + 1, round: board.round } : { n: 1, round: board.round + 1 };
}

/** Whether every seat of the current round is taken (the next draw starts a new round). */
export const roundFull = (board: Pick<DrawBoard, "seats">) => board.seats.length > 0 && board.seats.every(Boolean);

/**
 * The draw and its waiting list (the owner, 2026-11-25, over the screen's "Round 1 complete" and "Start round 2": "edhula
 * round maari vendam ... first panrom la adhu draw va erukatum ... remaining la next set waiting list vachupom"): round
 * 1's five seats are the draw, the Terms' five winners; every round after it is the waiting list, the Terms' reserve
 * applicants (clause 3: drawn "through the same random-selection process, in the same way"; clause 4: a place a winner
 * can't take goes to "the next eligible reserve applicant"), its places numbered on in the order they are drawn: round
 * 2's five are No. 1 to 5, round 3's No. 6 to 10. Only the words are new: the rounds, how they fill, and seats 1 to 3 of
 * every one drawn from the first 1,540, are as they were.
 */
export const inWaitingList = (round: number): boolean => round >= 2;
/** A waiting-list place's number, from its round and seat: round 2's seat 1 is No. 1, round 3's seat 1 No. 6. */
export const waitingNo = (round: number, seat: number): number => (round - 2) * DRAW_SEATS + seat;
/** What a round is called: "The draw", then "Waiting list". */
export const roundName = (round: number): string => (inWaitingList(round) ? "Waiting list" : "The draw");
/** A seat's own mark in its round: "Seat" and 3 in the draw, "No." and 6 on the waiting list. */
export const seatMark = (round: number, seat: number): { word: string; n: number } =>
  inWaitingList(round) ? { word: "No.", n: waitingNo(round, seat) } : { word: "Seat", n: seat };
/** "Seat 3" in the draw, "No. 6" on the waiting list. */
export const seatName = (round: number, seat: number): string => {
  const m = seatMark(round, seat);
  return `${m.word} ${m.n}`;
};
/** A place in words: "Seat 3 of 5" in the draw, "Waiting list · No. 6" after it. */
export const placeWords = (p: { n: number; round: number }): string =>
  inWaitingList(p.round) ? `Waiting list · No. ${waitingNo(p.round, p.n)}` : `Seat ${p.n} of ${DRAW_SEATS}`;
/** What starts the next round once this one is full: the waiting list after the draw, then more of it. */
export const nextRoundWords = (round: number): string => (inWaitingList(round) ? "Continue waiting list" : "Start waiting list");

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
