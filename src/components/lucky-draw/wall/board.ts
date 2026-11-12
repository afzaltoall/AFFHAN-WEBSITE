import type { DrawCardPublic } from "@/lib/lucky-draw-shared";
import { fromOf, plane, type Fonts } from "./faces";

/**
 * The airport departures board the winner's ticket checks in to (the owner, 2026-11-12, choosing the first of four
 * ideas to replace the gift box: "airport departure"). A black and gold split-flap board: every letter is a flap that
 * clatters through the alphabet and settles, left to right and row by row, on the winner's flight: their Trip ID,
 * their name, where they fly from, China, and WINNER. Then their boarding pass prints out of it.
 *
 * Drawn on a 2D canvas for the moment asked (`t`, seconds into the reveal), never from how many frames were drawn.
 * The letters are drawn once, large, into tiles, and scaled onto the flaps; the board without its letters is drawn
 * once a winner. The arithmetic (rows, when each flap spins and settles, what it shows) is plain, for the tests.
 */

export interface BoardRow {
  label: string;
  text: string;
  gold?: boolean;
}

/** The fewest and most letters across a row (the letters grow when the rows are short). */
export const BOARD_COLS_MIN = 16;
export const BOARD_COLS_MAX = 26;
/** Seconds one flap takes to fall; the rows' stagger; each letter's after the one before; the least a letter spins. */
export const FLAP_T = 0.065;
const ROW_GAP = 0.2;
const SPIN_GAP = 0.02;
const SETTLE_GAP = 0.035;
const SPIN_MIN = 0.35;
/** The letters a flap passes through. */
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/**
 * Seconds into the reveal: the first letters start to spin; every letter has settled by about 3.95; the whole board,
 * WINNER glowing, is read for a second; at BOARD_PRINT_AT the pass prints.
 */
export const BOARD_FLAPS_AT = 1.35;
export const BOARD_SETTLED_BY = 3.95;
export const BOARD_PRINT_AT = 5;

const upper = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

/**
 * A name in as few lines as fit the board (one, two or three), broken at the spaces that even the lines most, never
 * inside a word: a winner's name is never cut short.
 */
function lines(name: string): string[] {
  if (name.length <= BOARD_COLS_MAX || !name.includes(" ")) return [name];
  const words = name.split(" ");
  const join = (a: number, b: number) => words.slice(a, b).join(" ");
  let best: string[] = [name];
  let worst = Infinity;
  for (let i = 1; i < words.length; i++) {
    const two = [join(0, i), join(i, words.length)];
    const m = Math.max(...two.map((l) => l.length));
    if (m < worst) {
      worst = m;
      best = two;
    }
  }
  if (worst <= BOARD_COLS_MAX) return best;
  for (let i = 1; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const three = [join(0, i), join(i, j), join(j, words.length)];
      const m = Math.max(...three.map((l) => l.length));
      if (m < worst) {
        worst = m;
        best = three;
      }
    }
  }
  return best;
}

/** The board's rows for a winner: their name on one row, or on two or three when it is long; nothing wider than the board. */
export function boardRows(c: Pick<DrawCardPublic, "tripId" | "name" | "city" | "country">): BoardRow[] {
  const rows: BoardRow[] = [{ label: "FLIGHT", text: upper(c.tripId) }];
  lines(upper(c.name)).forEach((text, i) => rows.push({ label: i ? "" : "PASSENGER", text }));
  rows.push({ label: "FROM", text: upper(fromOf(c.city, c.country)) }, { label: "TO", text: "CHINA" }, { label: "STATUS", text: "WINNER", gold: true });
  return rows.map((r) => (r.text.length > BOARD_COLS_MAX ? { ...r, text: `${r.text.slice(0, BOARD_COLS_MAX - 1)}…` } : r));
}

/**
 * When a flap starts to spin and when it settles (seconds into the reveal): its row, its place, a random 0..1, and
 * whether it carries a letter (the blank flaps after the words settle soon, as a board's do).
 */
export function letterTimes(row: number, k: number, rnd: number, letter = true): { spin: number; settle: number } {
  const spin = BOARD_FLAPS_AT + row * ROW_GAP + k * SPIN_GAP;
  const spinFor = letter ? SPIN_MIN + k * SETTLE_GAP + rnd * 0.08 : SPIN_MIN;
  const flips = Math.max(1, Math.round(spinFor / FLAP_T));
  return { spin, settle: spin + flips * FLAP_T };
}

/** The letters a flap shows, one a fall: blank first, then letters at random, its own letter last. */
export function flapSequence(target: string, spin: number, settle: number, rnd: () => number): string[] {
  const n = Math.max(1, Math.round((settle - spin) / FLAP_T));
  const seq = [" "];
  for (let i = 1; i < n; i++) seq.push(CHARS[Math.floor(rnd() * CHARS.length) % CHARS.length]);
  seq.push(target);
  return seq;
}

/** What a flap shows at `t`: the letter it is leaving, the one coming, and how far the fall has got (1: still). */
export function flapAt(seq: readonly string[], spin: number, t: number): { from: string; to: string; p: number } {
  const n = seq.length - 1;
  if (t <= spin) return { from: seq[0], to: seq[0], p: 1 };
  const f = (t - spin) / FLAP_T;
  const i = Math.floor(f);
  if (i >= n) return { from: seq[n], to: seq[n], p: 1 };
  return { from: seq[i], to: seq[i + 1], p: f - i };
}

interface Flap {
  seq: string[];
  spin: number;
  settle: number;
  x: number;
  y: number;
  gold: boolean;
}

const INK = "#f3ead3";
const GOLD = "#f0cd78";
/** A letter tile, drawn once: this many pixels tall (the flaps scale it down). */
const GLYPH_H = 120;
const GLYPH_W = 84;

/** The departures board on a canvas of its own (./stage.ts shows it on the page, over the wall). */
export class Board {
  readonly el: HTMLCanvasElement = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly glyphs = new Map<string, HTMLCanvasElement>();
  private readonly base: HTMLCanvasElement = document.createElement("canvas");
  private rows: BoardRow[] = [];
  private flaps: Flap[] = [];
  private cols = BOARD_COLS_MIN;
  private cssW = 0;
  private dpr = 1;
  private ready = false;
  private layout = { pad: 0, labelW: 0, pitch: 0, rowPitch: 0, head: 0, W: 0, H: 0 };
  /** The layout, in the canvas's own pixels. */
  private cw = 0;
  private ch = 0;
  /** The last moment drawn (nothing is drawn again for the same moment, nor while nothing on the board moves). */
  private drawnAt = -1;
  /** A blank flap's card, drawn once at the flaps' size: its halves are copied onto the falling flaps. */
  private readonly card: HTMLCanvasElement = document.createElement("canvas");
  /** When the last letter settles, and when WINNER's glow is full. */
  private still = Infinity;
  /** Where the pass comes out: the slot at the board's foot (page pixels from the board's top left, at scale 1). */
  slotX = 0;
  slotY = 0;
  heightCss = 0;

  private readonly fonts: Fonts;

  constructor(fonts: Fonts) {
    this.fonts = fonts;
    this.el.className = "lw-board";
    const ctx = this.el.getContext("2d");
    if (!ctx) throw new Error("no 2d canvas");
    this.ctx = ctx;
  }

  /** The winner's rows; every flap's letters and times. */
  set(c: Pick<DrawCardPublic, "tripId" | "name" | "city" | "country">) {
    this.rows = boardRows(c);
    this.still = Infinity;
    this.cols = Math.min(BOARD_COLS_MAX, Math.max(BOARD_COLS_MIN, ...this.rows.map((r) => r.text.length)));
    this.flaps = [];
    this.rows.forEach((row, r) => {
      const text = row.text.padEnd(this.cols, " ");
      for (let k = 0; k < this.cols; k++) {
        const { spin, settle } = letterTimes(r, k, Math.random(), k < row.text.length);
        this.flaps.push({ seq: flapSequence(text[k], spin, settle, Math.random), spin, settle, x: k, y: r, gold: !!row.gold });
      }
    });
    this.ready = false;
    this.drawnAt = -1;
  }

  /** The board `cssW` page pixels wide, at the screen's pixel ratio: laid out, and drawn without its letters. */
  size(cssW: number, dpr: number) {
    if (this.ready && Math.abs(cssW - this.cssW) < 0.5 && dpr === this.dpr) return;
    this.cssW = cssW;
    this.dpr = dpr;
    const W = Math.round(cssW * dpr);
    const pad = W * 0.045;
    const labelW = W * 0.2;
    const pitch = (W - 2 * pad - labelW) / this.cols;
    this.cw = pitch * 0.88;
    this.ch = this.cw * 1.42;
    const rowPitch = this.ch + pitch * 0.2;
    const head = this.ch * 1.05;
    const H = Math.round(pad + head + pitch * 0.5 + this.rows.length * rowPitch + pad * 1.15);
    this.el.width = W;
    this.el.height = H;
    this.el.style.width = `${cssW}px`;
    this.el.style.height = `${H / dpr}px`;
    this.heightCss = H / dpr;
    this.slotX = cssW / 2;
    this.slotY = (H - pad * 0.45) / dpr;
    this.base.width = W;
    this.base.height = H;
    this.layout = { pad, labelW, pitch, rowPitch, head, W, H };
    this.card.width = Math.ceil(this.cw);
    this.card.height = Math.ceil(this.ch);
    const cctx = this.card.getContext("2d");
    if (cctx) {
      cctx.clearRect(0, 0, this.card.width, this.card.height);
      this.cell(cctx, 0, 0);
    }
    this.drawBase();
    this.ready = true;
    this.drawnAt = -1;
  }

  /** Where flap (k, r) is, in the canvas's pixels (its top left). */
  private at(k: number, r: number): { x: number; y: number } {
    const L = this.layout;
    return { x: L.pad + L.labelW + k * L.pitch, y: L.pad + L.head + L.pitch * 0.5 + r * L.rowPitch };
  }

  /** The board without its letters: its frame, its head, the labels and every flap, blank. */
  private drawBase() {
    const ctx = this.base.getContext("2d");
    if (!ctx) return;
    const L = this.layout;
    const { W, H, pad } = L;
    ctx.clearRect(0, 0, W, H);
    const r = W * 0.018;
    const frame = new Path2D();
    frame.roundRect(1, 1, W - 2, H - 2, r);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#14110c");
    bg.addColorStop(1, "#0a0806");
    ctx.fillStyle = bg;
    ctx.fill(frame);
    ctx.strokeStyle = "rgb(214 173 92 / 0.75)";
    ctx.lineWidth = Math.max(1, W * 0.0016);
    ctx.stroke(frame);
    // Its head: a plane and DEPARTURES in gold, the trip on the right; a gold hairline under it.
    const hy = pad + L.head * 0.5;
    const hs = L.head * 0.42;
    ctx.save();
    plane(ctx, pad + hs * 0.55, hy, hs * 1.15, GOLD);
    ctx.restore();
    ctx.fillStyle = GOLD;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = `600 ${hs}px ${this.fonts.sans}`;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${hs * 0.32}px`;
    ctx.fillText("DEPARTURES", pad + hs * 1.6, hy);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgb(243 234 211 / 0.6)";
    ctx.font = `500 ${hs * 0.62}px ${this.fonts.sans}`;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${hs * 0.18}px`;
    ctx.fillText("FREE CHINA BUSINESS TRIP", W - pad, hy);
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
    ctx.fillStyle = "rgb(214 173 92 / 0.5)";
    ctx.fillRect(pad, pad + L.head, W - 2 * pad, Math.max(1, W * 0.0012));
    // The labels, and every flap blank.
    this.rows.forEach((row, rIdx) => {
      const { y } = this.at(0, rIdx);
      ctx.fillStyle = "rgb(214 173 92 / 0.78)";
      ctx.textAlign = "left";
      ctx.font = `600 ${this.ch * 0.3}px ${this.fonts.sans}`;
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${this.ch * 0.06}px`;
      if (row.label) ctx.fillText(row.label, pad, y + this.ch / 2);
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
      for (let k = 0; k < this.cols; k++) this.cell(ctx, this.at(k, rIdx).x, y);
    });
    // The slot the pass comes out of, at the foot.
    const sw = W * 0.34;
    const sy = H - pad * 0.45;
    ctx.fillStyle = "#020101";
    ctx.fillRect((W - sw) / 2, sy - 2 * this.dpr, sw, 4 * this.dpr);
    ctx.fillStyle = "rgb(214 173 92 / 0.55)";
    ctx.fillRect((W - sw) / 2, sy + 2 * this.dpr, sw, Math.max(1, this.dpr));
  }

  /** A flap's card, blank: dark, lit a little from above, split across its middle. */
  private cell(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const { cw, ch } = this;
    const g = ctx.createLinearGradient(0, y, 0, y + ch);
    g.addColorStop(0, "#221d16");
    g.addColorStop(0.5, "#17130e");
    g.addColorStop(0.5, "#120f0b");
    g.addColorStop(1, "#1a1611");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, cw * 0.1);
    ctx.fill();
    ctx.fillStyle = "rgb(0 0 0 / 0.85)";
    ctx.fillRect(x, y + ch / 2 - Math.max(1, ch * 0.012), cw, Math.max(1.5, ch * 0.024));
  }

  /** A letter's tile (drawn once): the letter in ivory or gold, on clear. */
  private glyph(ch: string, gold: boolean): HTMLCanvasElement | null {
    if (ch === " ") return null;
    const key = `${gold ? "g" : "w"}${ch}`;
    let tile = this.glyphs.get(key);
    if (!tile) {
      tile = document.createElement("canvas");
      tile.width = GLYPH_W;
      tile.height = GLYPH_H;
      const g = tile.getContext("2d");
      if (g) {
        g.fillStyle = gold ? GOLD : INK;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = `600 ${GLYPH_H * 0.66}px ${this.fonts.sans}`;
        g.fillText(ch, GLYPH_W / 2, GLYPH_H * 0.54);
      }
      this.glyphs.set(key, tile);
    }
    return tile;
  }

  /**
   * Half a letter (top or bottom) in a flap at (x, y), squashed to `s` of its height towards the middle, as a falling
   * flap is: plain copies of the card's and the letter's halves, no clipping (cheap enough for every flap, every frame).
   */
  private half(letter: string, gold: boolean, x: number, y: number, top: boolean, s = 1, card = false, shade = 0) {
    const ctx = this.ctx;
    const { cw, ch } = this;
    const hh = (ch / 2) * s;
    if (hh < 0.5) return;
    const dy = top ? y + ch / 2 - hh : y + ch / 2;
    if (card) ctx.drawImage(this.card, 0, top ? 0 : this.card.height / 2, this.card.width, this.card.height / 2, x, dy, cw, hh);
    const tile = this.glyph(letter, gold);
    if (tile) {
      const gw = ch * (GLYPH_W / GLYPH_H);
      ctx.drawImage(tile, 0, top ? 0 : GLYPH_H / 2, GLYPH_W, GLYPH_H / 2, x + (cw - gw) / 2, dy, gw, hh);
    }
    if (shade > 0) {
      ctx.fillStyle = `rgb(0 0 0 / ${shade.toFixed(3)})`;
      ctx.fillRect(x, dy, cw, hh);
    }
  }

  /** Every glyph tile drawn now, and once onto the board (while nothing moves), so the first flaps cost nothing extra. */
  warm() {
    for (const c of `${CHARS} -,.'…`) {
      for (const gold of [false, true]) {
        const tile = this.glyph(c, gold);
        if (tile) this.ctx.drawImage(tile, 0, 0, 1, 1);
      }
    }
    this.drawnAt = -1;
  }

  /** The board at `t` seconds into the reveal. */
  draw(t: number) {
    if (!this.ready || t === this.drawnAt) return;
    // Nothing moves on the board before its first flap spins, nor once WINNER glows in full: drawn once, then kept.
    const first = this.flaps.length ? this.flaps[0].spin : 0;
    if (this.drawnAt >= 0 && ((t < first && this.drawnAt < first) || (t > this.still && this.drawnAt > this.still))) return;
    this.drawnAt = t;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.el.width, this.el.height);
    ctx.drawImage(this.base, 0, 0);
    for (const f of this.flaps) {
      const { x, y } = this.at(f.x, f.y);
      const { from, to, p } = flapAt(f.seq, f.spin, t);
      if (p >= 1) {
        const tile = this.glyph(to, f.gold);
        if (tile) ctx.drawImage(tile, x + (this.cw - this.ch * (GLYPH_W / GLYPH_H)) / 2, y, this.ch * (GLYPH_W / GLYPH_H), this.ch);
        continue;
      }
      // Behind the falling flap, the coming letter's top; under it, the leaving letter's foot.
      this.half(to, f.gold, x, y, true);
      this.half(from, f.gold, x, y, false);
      const c = Math.cos(p * Math.PI);
      if (c > 0) this.half(from, f.gold, x, y, true, c, true, (1 - c) * 0.55);
      else this.half(to, f.gold, x, y, false, -c, true, (1 + c) * 0.55);
    }
    // WINNER glows once it has settled.
    const last = this.flaps.filter((f) => f.gold);
    const done = last.length ? Math.max(...last.map((f) => f.settle)) : Infinity;
    this.still = Math.max(done + 0.36, this.settled());
    if (t > done) {
      const k = Math.min(1, (t - done) / 0.35);
      const { y } = this.at(0, this.rows.length - 1);
      const g = this.layout;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createLinearGradient(g.pad + g.labelW, 0, g.W - g.pad, 0);
      glow.addColorStop(0, `rgb(240 205 120 / ${(0.16 * k).toFixed(3)})`);
      glow.addColorStop(0.4, `rgb(240 205 120 / ${(0.05 * k).toFixed(3)})`);
      glow.addColorStop(1, "rgb(240 205 120 / 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(g.pad + g.labelW - this.cw * 0.2, y - this.cw * 0.2, g.W - 2 * g.pad - g.labelW + this.cw * 0.4, this.ch + this.cw * 0.4);
      ctx.restore();
    }
  }

  /** The moment every letter has settled (seconds into the reveal). */
  settled(): number {
    return this.flaps.length ? Math.max(...this.flaps.map((f) => f.settle)) : BOARD_FLAPS_AT;
  }
}
