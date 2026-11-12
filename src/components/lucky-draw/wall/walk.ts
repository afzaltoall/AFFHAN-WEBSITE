/**
 * The award-show walkout the winner is revealed in (the owner, 2026-11-12: "when a ticket is selected, it goes nicely
 * dark, like an award-winning opening: first the Trip ID is revealed, next the place, finally the winner's name, the
 * ticket placed in the centre ... like a FIFA card pack opening", with a pack-opening video as the reference: the pack
 * bursts, dark gold close-ups give one clue at a time, light breaks out, the card lands in the centre).
 *
 * In this order, in seconds from the light's landing: a flash of gold, under which the winner's ticket leaves the
 * wall, turned over (no name to read yet) as the screen goes dark; the ticket floats up to the middle, slowly, its gold
 * back to the room; the first clue, their Trip ID; the second, their city and country; the ticket trembles, light
 * leaking from its edges, and bursts; out of the light, their card (the boarding pass, their name on it) in the
 * middle, holding the screen three seconds (the owner: "3 second katanum podhum"), then down into its seat as the
 * screen lights again. ./stage.ts plays it (poseWalk); this module holds its moments and its words' motion.
 */

export const TW = {
  /** The frame's flare on the ticket, short: the flash takes over. */
  lock: 0.25,
  /** The ticket out of the wall, turned over under the flash, by `over`. */
  out: 0.2,
  over: 0.5,
  /** Its slow rise to the middle, its gold back to the room. */
  rise: 0.55,
  risen: 1.8,
  /** The clues: in, and gone. */
  clue1: 1.95,
  clue1Out: 3.85,
  clue2: 4.05,
  clue2Out: 5.95,
  /** Trembling, glowing, pushed towards the room; then the burst. */
  build: 6.0,
  burst: 7.05,
  /** Out of the light, the card in the middle; three seconds; to its seat. */
  placed: 7.2,
  leave: 10.2,
  seat: 10.85,
  end: 11.05,
} as const;

/** The clues, in the order they come: their moments in and out. */
export const CLUES = [
  { in: TW.clue1, out: TW.clue1Out },
  { in: TW.clue2, out: TW.clue2Out },
] as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
/** Past the mark a little, then settling on it (a letter landing). */
const backOut = (x: number, s = 1.7) => {
  const c = clamp01(x) - 1;
  return 1 + (s + 1) * c * c * c + s * c * c;
};

/** Seconds between letters as a clue's word comes in, and how long each takes to land. */
export const LETTER_GAP = 0.045;
export const LETTER_T = 0.42;

/**
 * The `k`th letter of a clue `t` seconds after it begins coming in (and `left` seconds before it goes): how much of
 * it shows, how far below its place it is (em), its size, and the light on it as it lands.
 */
export function letterAt(k: number, t: number, left: number): { a: number; y: number; s: number; glow: number } {
  const x = (t - k * LETTER_GAP) / LETTER_T;
  const going = 1 - smooth(1 - left / 0.4);
  const a = smooth(x * 2.2) * going;
  const y = (1 - backOut(x)) * 0.55 - (1 - going) * 0.12;
  const s = 1.35 - 0.35 * backOut(x);
  // A flash as it lands, then a light passing along the word, letter by letter.
  const land = Math.max(0, 1 - Math.abs(x - 0.85) / 0.35);
  const sweep = Math.max(0, 1 - Math.abs(t - (0.9 + k * 0.07)) / 0.14);
  return { a, y, s, glow: Math.max(land, sweep) * going };
}

/** A clue's label and its second line: in a little after its word begins, out with it. */
export function lineAt(t: number, left: number, delay: number): number {
  return smooth((t - delay) / 0.4) * (1 - smooth(1 - left / 0.4));
}
