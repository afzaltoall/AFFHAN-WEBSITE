import gsap from "gsap";

/**
 * The departure board beside the Terms (Scene13Terms): which clause is being
 * read, set the way an airport's split-flap board sets a flight. Every tile
 * turns through its drum, in order, to the next character (the top leaf
 * falls, the bottom one lands), at most five leaves per change, tiles
 * rippling left to right.
 *
 * Time-based, not scrubbed: a board changes when the flight changes. A newer
 * change always wins: a tile settles on whatever it last showed and turns on
 * from there. Under reduced motion the characters are simply set.
 */
export const BOARD_COLS = 16;
export const BOARD_ROWS = 2;

const LETTERS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ&";
const DIGITS = " 0123456789";
const MAX_LEAVES = 5;
/** Seconds for the top leaf to fall and the bottom one to land. */
const FALL = 0.05;
const LAND = 0.06;

/** A clause title as the board sets it: capitals, word-wrapped into two rows of sixteen. */
export function boardLines(title: string): string[] {
  const rows: string[] = [""];
  for (const word of title.toUpperCase().split(/\s+/)) {
    const row = rows[rows.length - 1];
    if (!row) rows[rows.length - 1] = word;
    else if (row.length + 1 + word.length <= BOARD_COLS) rows[rows.length - 1] = `${row} ${word}`;
    else rows.push(word);
  }
  return Array.from({ length: BOARD_ROWS }, (_, i) => (rows[i] ?? "").slice(0, BOARD_COLS).padEnd(BOARD_COLS, " "));
}

export interface Board {
  /** Set clause i (0-based). */
  show(i: number): void;
  /** Clear every tile (the board before the reader arrives). */
  blank(): void;
  kill(): void;
}

export function createBoard(el: HTMLElement, titles: readonly string[], reduced: boolean): Board {
  const digits = Array.from(el.querySelectorAll<HTMLElement>("[data-flap='digit']"));
  const letters = Array.from(el.querySelectorAll<HTMLElement>("[data-flap='letter']"));
  const segs = Array.from(el.querySelectorAll<HTMLElement>("[data-cx='board-seg']"));
  const running = new Map<HTMLElement, gsap.core.Timeline>();

  /** A tile's four halves: static top and bottom, falling top leaf, landing bottom leaf. */
  const halves = (tile: HTMLElement) => {
    const [top, bottom, leafTop, leafBottom] = Array.from(tile.children) as HTMLElement[];
    const glyph = (h: HTMLElement) => h.firstElementChild as HTMLElement;
    const shade = (h: HTMLElement) => h.lastElementChild as HTMLElement;
    return { top, bottom, leafTop, leafBottom, glyph, shade };
  };

  const settle = (tile: HTMLElement, ch: string) => {
    const h = halves(tile);
    [h.top, h.bottom, h.leafTop, h.leafBottom].forEach((x) => {
      h.glyph(x).textContent = ch;
    });
    gsap.set(h.leafTop, { rotationX: 0 });
    gsap.set(h.leafBottom, { rotationX: 90 });
    gsap.set([h.shade(h.leafTop), h.shade(h.leafBottom)], { opacity: 0 });
    tile.dataset.ch = ch;
  };

  const turn = (tile: HTMLElement, target: string, drum: string, delay: number, animate: boolean) => {
    running.get(tile)?.kill();
    running.delete(tile);
    const from = tile.dataset.ch ?? " ";
    settle(tile, from);
    const b = drum.indexOf(target);
    if (from === target) return;
    if (!animate || b < 0) {
      settle(tile, target);
      return;
    }
    const a = Math.max(0, drum.indexOf(from));
    const leaves = Math.min(MAX_LEAVES, (b - a + drum.length) % drum.length);
    const h = halves(tile);
    const tl = gsap.timeline({ delay, onComplete: () => running.delete(tile) });
    let was = from;
    for (let k = 0; k < leaves; k++) {
      const ch = drum[(b - leaves + 1 + k + drum.length) % drum.length];
      const prev = was;
      was = ch;
      tl.call(() => {
        h.glyph(h.top).textContent = ch;
        h.glyph(h.leafTop).textContent = prev;
        h.glyph(h.leafBottom).textContent = ch;
        h.glyph(h.bottom).textContent = prev;
      });
      tl.fromTo(h.leafTop, { rotationX: 0 }, { rotationX: -90, duration: FALL, ease: "power1.in", immediateRender: false });
      tl.fromTo(h.shade(h.leafTop), { opacity: 0 }, { opacity: 0.5, duration: FALL, ease: "power1.in", immediateRender: false }, "<");
      tl.fromTo(h.leafBottom, { rotationX: 90 }, { rotationX: 0, duration: LAND, ease: "power1.out", immediateRender: false });
      tl.fromTo(h.shade(h.leafBottom), { opacity: 0.4 }, { opacity: 0, duration: LAND, ease: "power1.out", immediateRender: false }, "<");
      tl.call(() => settle(tile, ch));
    }
    running.set(tile, tl);
  };

  // Hidden (below the widths that show it): set, never animated.
  const visible = () => el.offsetParent !== null && !reduced;

  return {
    show(i) {
      const n = String(i + 1).padStart(2, "0");
      const text = boardLines(titles[i] ?? "").join("");
      const animate = visible();
      digits.forEach((t, k) => turn(t, n[k] ?? " ", DIGITS, k * 0.05, animate));
      letters.forEach((t, k) => turn(t, text[k] ?? " ", LETTERS, 0.1 + k * 0.016, animate));
      segs.forEach((s, k) => {
        s.toggleAttribute("data-on", k <= i);
        s.toggleAttribute("data-now", k === i);
      });
    },
    blank() {
      [...digits, ...letters].forEach((t) => {
        running.get(t)?.kill();
        settle(t, " ");
      });
      running.clear();
      segs.forEach((s) => {
        s.removeAttribute("data-on");
        s.removeAttribute("data-now");
      });
    },
    kill() {
      running.forEach((tl) => tl.kill());
      running.clear();
    },
  };
}
