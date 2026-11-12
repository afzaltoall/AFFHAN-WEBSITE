import type { DrawCardPublic, DrawPoolEntry } from "@/lib/lucky-draw-shared";

/**
 * What the wall's pictures say, drawn on canvases the wall and the gift turn into textures (./stage.ts): a ticket's
 * face (name and city; the Trip ID on its stub) and the mark on the tickets' gold backs, the winner's boarding pass,
 * the gift's tag and its wrapping paper. In the page's own fonts (Jost, and the trip's Bodoni for the winner's name),
 * read from the page and loaded before anything is drawn.
 *
 * Only what the TV may show (Privacy Policy section 12): Trip ID, name, city and country, and the seat. Never a mobile
 * number: none reaches this page.
 */

export interface Fonts {
  /** CSS font-family lists, as the page's next/font variables hold them. */
  sans: string;
  display: string;
}

/** A ticket's face on the wall, in pixels (8:3, as the tickets are), and where its perforation is (its stub to the right). */
export const FACE_W = 320;
export const FACE_H = 120;
export const STUB_AT = 0.775;
/**
 * A face's two inks, kept apart so the wall's shader can colour each: what is drawn in red it inks ivory (the name and
 * the city), what is drawn in green it inks gold (the stub); on a golden ticket both are inked dark, as if printed.
 */
const IVORY_INK = "#ff0000";
const GOLD_INK = "#00ff00";

type Ctx = CanvasRenderingContext2D;

/** "Chennai, India"; a city that is its own country once ("Singapore"). */
export const fromOf = (city: string, country: string) =>
  city && country && city.trim().toLowerCase() === country.trim().toLowerCase() ? city : [city, country].filter(Boolean).join(", ");

function spacing(ctx: Ctx, px: number) {
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${px}px`;
}

/**
 * The trip's Bodoni, set at the size of its small optical cut and scaled up. The browser picks a variable font's
 * optical size from the size it is set at, and at a hundred pixels Bodoni Moda's display cut has hairlines that
 * vanish on a TV, and its 1 reads as an I (the site sets it at opsz 11 for the same reason, 2026-09-29). Canvas has no
 * font-variation-settings, so the size is the lever: drawn at 12px, scaled to `size`.
 */
const OPSZ_PX = 12;
function bodoniFont(fonts: Fonts) {
  return `600 ${OPSZ_PX}px ${fonts.display}`;
}
function bodoniWidth(ctx: Ctx, text: string, size: number, fonts: Fonts): number {
  ctx.font = bodoniFont(fonts);
  return (ctx.measureText(text).width * size) / OPSZ_PX;
}
function bodoniText(ctx: Ctx, text: string, x: number, y: number, size: number, fonts: Fonts) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / OPSZ_PX, size / OPSZ_PX);
  ctx.font = bodoniFont(fonts);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** `text` shortened with an ellipsis until it fits `width` in the current font. */
function ellipsize(ctx: Ctx, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${text.slice(0, m).trimEnd()}…`).width <= width) lo = m;
    else hi = m - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

/**
 * A name set to fit `width`: one line at the largest size that fits; else two lines, broken at a space, at the largest
 * size both fit; else two lines at the smallest size, the second shortened. A word is never broken.
 */
export function setName(ctx: Ctx, name: string, font: (size: number) => string, sizes: number[], width: number): { size: number; lines: string[] } {
  for (const size of sizes) {
    ctx.font = font(size);
    if (ctx.measureText(name).width <= width) return { size, lines: [name] };
  }
  const words = name.split(/\s+/).filter(Boolean);
  const split = (size: number) => {
    ctx.font = font(size);
    let first = "";
    let i = 0;
    for (; i < words.length; i++) {
      const next = first ? `${first} ${words[i]}` : words[i];
      if (ctx.measureText(next).width > width) break;
      first = next;
    }
    return { first, rest: words.slice(i).join(" ") };
  };
  for (const size of sizes) {
    const { first, rest } = split(size);
    if (first && ctx.measureText(rest).width <= width) return { size, lines: [first, rest] };
  }
  const size = sizes[sizes.length - 1];
  const { first, rest } = split(size);
  ctx.font = font(size);
  if (!first) return { size, lines: [ellipsize(ctx, name, width)] };
  return { size, lines: rest ? [first, ellipsize(ctx, rest, width)] : [first] };
}

/** setName for the trip's Bodoni (bodoniText): the name's lines, and the size they fit at. */
function setBodoniName(ctx: Ctx, name: string, sizes: number[], width: number, fonts: Fonts): { size: number; lines: string[] } {
  const fits = (text: string, size: number) => bodoniWidth(ctx, text, size, fonts) <= width;
  for (const size of sizes) if (fits(name, size)) return { size, lines: [name] };
  const words = name.split(/\s+/).filter(Boolean);
  const split = (size: number) => {
    let first = "";
    let i = 0;
    for (; i < words.length; i++) {
      const next = first ? `${first} ${words[i]}` : words[i];
      if (!fits(next, size)) break;
      first = next;
    }
    return { first, rest: words.slice(i).join(" ") };
  };
  for (const size of sizes) {
    const { first, rest } = split(size);
    if (first && fits(rest, size)) return { size, lines: [first, rest] };
  }
  const size = sizes[sizes.length - 1];
  const shorten = (text: string) => {
    let t = text;
    while (t.length > 1 && !fits(`${t}…`, size)) t = t.slice(0, -1).trimEnd();
    return `${t}…`;
  };
  const { first, rest } = split(size);
  if (!first) return { size, lines: [shorten(name)] };
  return { size, lines: rest ? [first, fits(rest, size) ? rest : shorten(rest)] : [first] };
}

/**
 * A ticket's face, its two inks on clear (the wall's shader draws the ticket and colours them): on its main part the
 * name, one line or two, and the city and country under it; on its stub, past the perforation, "TRIP-26" and the
 * number. `s` scales the whole face (the winner's ticket is drawn twice as large).
 */
export function drawFace(ctx: Ctx, e: DrawPoolEntry, fonts: Fonts, s = 1) {
  const w = FACE_W * s;
  const h = FACE_H * s;
  const pad = 18 * s;
  const main = STUB_AT * w - pad - 10 * s;
  ctx.clearRect(0, 0, w, h);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;

  ctx.fillStyle = IVORY_INK;
  spacing(ctx, 0);
  const { size, lines } = setName(ctx, e[1], (z) => `500 ${z}px ${fonts.sans}`, [27, 24, 21, 19, 17].map((z) => z * s), main);
  ctx.font = `500 ${size}px ${fonts.sans}`;
  let city: number;
  if (lines.length === 1) {
    ctx.fillText(lines[0], pad, 62 * s);
    city = 93 * s;
  } else {
    ctx.fillText(lines[0], pad, 47 * s);
    ctx.fillText(lines[1], pad, 47 * s + size * 1.06);
    city = 47 * s + size * 1.06 + 24 * s;
  }
  ctx.globalAlpha = 0.66;
  ctx.font = `400 ${12.5 * s}px ${fonts.sans}`;
  spacing(ctx, 0.3 * s);
  ctx.fillText(ellipsize(ctx, fromOf(e[2], e[3]), main), pad, city);

  // The stub: "TRIP-26" small and spaced, the number large.
  const cut = e[0].lastIndexOf("-");
  const head = cut > 0 ? e[0].slice(0, cut) : "";
  const number = cut > 0 ? e[0].slice(cut + 1) : e[0];
  const mid = ((STUB_AT + 1) / 2) * w;
  ctx.fillStyle = GOLD_INK;
  ctx.textAlign = "center";
  ctx.globalAlpha = 0.85;
  ctx.font = `600 ${10 * s}px ${fonts.sans}`;
  spacing(ctx, 1.4 * s);
  if (head) ctx.fillText(head, mid + 0.7 * s, 51 * s);
  ctx.globalAlpha = 1;
  spacing(ctx, 0.4 * s);
  for (const px of [21, 19, 17, 15]) {
    ctx.font = `600 ${px * s}px ${fonts.sans}`;
    if (ctx.measureText(number).width <= (1 - STUB_AT) * w - 12 * s) break;
  }
  ctx.fillText(number, mid, 78 * s);
  ctx.textAlign = "left";
  spacing(ctx, 0);
}

/** The mark on the tickets' gold backs: AFFHAN in the trip's Bodoni, and the draw under it (one ink; inked dark). */
export function drawBack(ctx: Ctx, fonts: Fonts) {
  const w = FACE_W;
  const h = FACE_H;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = IVORY_INK;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const word = "AFFHAN";
  const size = 30;
  const tracked = (text: string, px: number) => bodoniWidth(ctx, text, size, fonts) + px * (text.length - 1);
  let x = (w - tracked(word, 6)) / 2;
  for (const ch of word) {
    bodoniText(ctx, ch, x, 66, size, fonts);
    x += bodoniWidth(ctx, ch, size, fonts) + 6;
  }
  ctx.globalAlpha = 0.8;
  ctx.fillRect(w / 2 - 46, 78, 92, 1.5);
  ctx.textAlign = "center";
  ctx.font = `600 9.5px ${fonts.sans}`;
  spacing(ctx, 3.2);
  ctx.fillText("LUCKY DRAW", w / 2 + 1.6, 96);
  spacing(ctx, 0);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

/** The boarding pass, in pixels (as the registered page's pass, wider for the stub). */
export const PASS_W = 2048;
export const PASS_H = 1000;
const INK = "#1b1307";

const DRAWN = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** A small plane flying right, as the pass's route has one (lucide's plane, turned to the route); the departures board's too. */
export function plane(ctx: Ctx, cx: number, cy: number, size: number, color = INK) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.scale(size / 24, size / 24);
  ctx.translate(-12, -12);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke(new Path2D("M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"));
  ctx.restore();
}

/** The pass's foil gold, light at the top of a letter and deep at its foot; the gold of its labels; its plain words. */
const PASS_GOLD = ["#fff3cf", "#ecc879", "#b88b3d"] as const;
const PASS_LABEL = "rgb(222 190 120 / 0.74)";
const PASS_TEXT = "#f2e2b6";
/** The band of foil round the pass's edge, in its pixels: the only part of it the page's light runs over (wall.css). */
export const PASS_BAND = 40;

/** A layer the pass's size for letters filled with foil gold (made once). */
let goldLayer: HTMLCanvasElement | null = null;

/**
 * Letters filled with foil gold: drawn in white by `draw` inside `box` on a layer of their own, the gold laid into them
 * (light at the box's top, deep at its foot), then set on the pass. A gradient set straight into Bodoni's scaled
 * drawing would be scaled with it.
 */
function inGold(ctx: Ctx, box: [number, number, number, number], draw: (g: Ctx) => void) {
  const [x, y, w, h] = box;
  if (!goldLayer) goldLayer = document.createElement("canvas");
  if (goldLayer.width !== PASS_W || goldLayer.height !== PASS_H) {
    goldLayer.width = PASS_W;
    goldLayer.height = PASS_H;
  }
  const g = goldLayer.getContext("2d");
  if (!g) return;
  g.save();
  g.globalCompositeOperation = "source-over";
  g.clearRect(x, y, w, h);
  g.fillStyle = "#fff";
  draw(g);
  g.globalCompositeOperation = "source-in";
  const foil = g.createLinearGradient(0, y, 0, y + h);
  foil.addColorStop(0, PASS_GOLD[0]);
  foil.addColorStop(0.55, PASS_GOLD[1]);
  foil.addColorStop(1, PASS_GOLD[2]);
  g.fillStyle = foil;
  g.fillRect(x, y, w, h);
  g.restore();
  ctx.drawImage(goldLayer, x, y, w, h, x, y, w, h);
}

/** Small spaced capitals in the pass's label gold. */
function passLabel(ctx: Ctx, fonts: Fonts, text: string, x: number, y: number, align: CanvasTextAlign = "left") {
  ctx.save();
  ctx.fillStyle = PASS_LABEL;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 22px ${fonts.sans}`;
  spacing(ctx, 6.5);
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.restore();
}

/** A four-pointed glint. */
function glint(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** The winner's medallion on the stub: a gold coin, its rim beaded, a glint, and "Winner" and the year struck into it. */
function medallion(ctx: Ctx, fonts: Fonts, cx: number, cy: number, r: number, year: string) {
  ctx.save();
  const coin = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.08, cx, cy, r);
  coin.addColorStop(0, "#fff3cc");
  coin.addColorStop(0.45, "#e6bf6c");
  coin.addColorStop(1, "#946a2c");
  ctx.fillStyle = coin;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgb(70 44 10 / 0.55)";
  ctx.lineWidth = r * 0.028;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgb(70 44 10 / 0.6)";
  ctx.beginPath();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const bx = cx + Math.cos(a) * r * 0.9;
    const by = cy + Math.sin(a) * r * 0.9;
    ctx.moveTo(bx + r * 0.022, by);
    ctx.arc(bx, by, r * 0.022, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = "#3a2507";
  glint(ctx, cx, cy - r * 0.36, r * 0.12);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${Math.round(r * 0.25)}px ${fonts.sans}`;
  spacing(ctx, r * 0.035);
  ctx.fillText("WINNER", cx + r * 0.017, cy + r * 0.1);
  ctx.font = `600 ${Math.round(r * 0.15)}px ${fonts.sans}`;
  spacing(ctx, r * 0.04);
  ctx.fillText(year, cx + r * 0.02, cy + r * 0.4);
  spacing(ctx, 0);
  ctx.restore();
}

/**
 * The winner's pass, the card the reveal ends on (the owner, 2026-11-12: "the final card is not perfect ... think
 * innovative ... the effects must not touch the text"): black lacquer, the wall's own ticket made the winner's, every
 * word in gold on the black; a band of fine gold lines round its edge between gold rules, the only part the page's
 * light runs over (wall.css .lw-lift-foil); the stub with their round and seat over a gold medallion. Their name in
 * the trip's Bodoni, in capitals, in foil gold, as large as its line allows.
 */
export function drawPass(ctx: Ctx, c: DrawCardPublic, fonts: Fonts, seats: number) {
  const W = PASS_W;
  const H = PASS_H;
  const R = 46;
  const STUB = 420;
  const main = W - STUB;
  const B = PASS_BAND;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, R);
  ctx.clip();
  // Black lacquer, warm, lighter where the light falls on it; the stub a shade warmer.
  const lacquer = ctx.createLinearGradient(0, 0, W, H);
  lacquer.addColorStop(0, "#1d160b");
  lacquer.addColorStop(0.45, "#0c0905");
  lacquer.addColorStop(1, "#161009");
  ctx.fillStyle = lacquer;
  ctx.fillRect(0, 0, W, H);
  const lit = ctx.createRadialGradient(W * 0.3, -H * 0.25, 0, W * 0.3, -H * 0.25, W * 0.85);
  lit.addColorStop(0, "rgb(255 214 140 / 0.11)");
  lit.addColorStop(1, "rgb(255 214 140 / 0)");
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgb(231 194 108 / 0.05)";
  ctx.fillRect(main, 0, STUB, H);

  // The foil band: fine gold lines on the bias, between the edge and the inner rule.
  const foil = ctx.createLinearGradient(0, 0, W, H);
  foil.addColorStop(0, "#f6dc9a");
  foil.addColorStop(0.5, "#c99a48");
  foil.addColorStop(1, "#f0d08a");
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.roundRect(B, B, W - 2 * B, H - 2 * B, R - B * 0.6);
  ctx.clip("evenodd");
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = foil;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = foil;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = -H; x < W + H; x += 9) {
    ctx.moveTo(x, H);
    ctx.lineTo(x + H, 0);
  }
  ctx.stroke();
  ctx.restore();
  // Its rules: the band's inner edge, and a finer one inside it.
  const rule = ctx.createLinearGradient(0, 0, W, 0);
  rule.addColorStop(0, "#c9994a");
  rule.addColorStop(0.5, "#fbe6b0");
  rule.addColorStop(1, "#c9994a");
  ctx.save();
  ctx.strokeStyle = rule;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(B, B, W - 2 * B, H - 2 * B, R - B * 0.6);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(B + 12, B + 12, W - 2 * B - 24, H - 2 * B - 24, Math.max(4, R - B * 0.6 - 10));
  ctx.stroke();
  ctx.restore();

  const L = 112;
  const right = main - 96;
  const year = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(c.drawnAt));
  // The head: AFFHAN in foil gold, spaced as on the wall's tickets, and what the card is.
  const tracked = (g: Ctx, text: string, x: number, y: number, size: number, track: number) => {
    for (const ch of text) {
      bodoniText(g, ch, x, y, size, fonts);
      x += bodoniWidth(g, ch, size, fonts) + track;
    }
  };
  inGold(ctx, [L - 6, 100, 520, 64], (g) => tracked(g, "AFFHAN", L, 152, 52, 20));
  passLabel(ctx, fonts, `Winner · Lucky Draw ${year}`, right, 146, "right");
  const headRule = ctx.createLinearGradient(L, 0, right, 0);
  headRule.addColorStop(0, "rgb(231 194 108 / 0.7)");
  headRule.addColorStop(1, "rgb(231 194 108 / 0.06)");
  ctx.fillStyle = headRule;
  ctx.fillRect(L, 184, right - L, 2);

  // The passenger: their name in foil gold, as large as its line allows (two lines at most, never set too tall for them).
  passLabel(ctx, fonts, "Passenger", L, 262);
  const set = setBodoniName(ctx, c.name.toUpperCase(), [158, 144, 130, 118, 106, 96, 86, 78, 70, 62], right - L, fonts);
  const size = set.lines.length > 1 ? Math.min(set.size, 128) : set.size;
  const baselines = set.lines.length === 1 ? [282 + (290 + size * 0.7) / 2] : [288 + size * 0.86, 288 + size * 0.86 + size * 1.04];
  set.lines.forEach((line, i) => {
    const y = baselines[i];
    inGold(ctx, [L - 10, Math.floor(y - size * 0.8), right - L + 20, Math.ceil(size * 0.98)], (g) => {
      g.textAlign = "left";
      spacing(g, 0);
      bodoniText(g, line, L - 4, y, size, fonts);
    });
  });

  // Their Trip ID, then the route: their city (and country), the plane, China.
  const rowLabel = 606;
  const rowValue = 670;
  const value = (text: string, x: number, track: number) => {
    ctx.fillStyle = PASS_TEXT;
    ctx.font = `600 52px ${fonts.sans}`;
    ctx.textAlign = "left";
    spacing(ctx, track);
    ctx.fillText(text, x, rowValue);
    spacing(ctx, 0);
  };
  passLabel(ctx, fonts, "Trip ID", L, rowLabel);
  value(c.tripId, L, 3);
  const fromX = 660;
  passLabel(ctx, fonts, "From", fromX, rowLabel);
  const other = !!c.city && !!c.country && c.city.trim().toLowerCase() !== c.country.trim().toLowerCase();
  ctx.font = `600 52px ${fonts.sans}`;
  value(ellipsize(ctx, c.city || c.country || "—", 330), fromX, 0.5);
  if (other) {
    ctx.fillStyle = PASS_LABEL;
    ctx.font = `500 32px ${fonts.sans}`;
    ctx.textAlign = "left";
    ctx.fillText(ellipsize(ctx, c.country, 330), fromX, rowValue + 48);
  }
  const toX = right - 210;
  const trackA = fromX + 360;
  const trackB = toX - 44;
  ctx.save();
  ctx.strokeStyle = "rgb(231 194 108 / 0.55)";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(trackA, rowValue - 17);
  ctx.lineTo(trackB, rowValue - 17);
  ctx.stroke();
  ctx.restore();
  plane(ctx, (trackA + trackB) / 2, rowValue - 17, 58, "#e9c676");
  passLabel(ctx, fonts, "To", toX, rowLabel);
  value("China", toX, 0.5);

  // The foot: when they were drawn, and the trip.
  const footRule = ctx.createLinearGradient(L, 0, right, 0);
  footRule.addColorStop(0, "rgb(231 194 108 / 0.4)");
  footRule.addColorStop(1, "rgb(231 194 108 / 0.04)");
  ctx.fillStyle = footRule;
  ctx.fillRect(L, 760, right - L, 2);
  passLabel(ctx, fonts, "Drawn on", L, 828);
  const d = Object.fromEntries(DRAWN.formatToParts(new Date(c.drawnAt)).map((x) => [x.type, x.value]));
  ctx.fillStyle = PASS_TEXT;
  ctx.font = `500 40px ${fonts.sans}`;
  ctx.textAlign = "left";
  spacing(ctx, 0.5);
  ctx.fillText(`${d.day} ${d.month} ${d.year} · ${d.hour}:${d.minute} IST`, L, 886);
  spacing(ctx, 0);
  passLabel(ctx, fonts, "Free China Business Trip", right, 886, "right");

  // The perforation: a line of holes, and a notch at each end, cut through.
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (let y = 58; y < H - 40; y += 30) {
    ctx.beginPath();
    ctx.arc(main, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(main, 0, 30, 0, Math.PI * 2);
  ctx.arc(main, H, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The stub: their round and their seat in foil gold, over the medallion.
  const sx = main + STUB / 2;
  passLabel(ctx, fonts, "Round", sx, 200, "center");
  const numeral = (text: string, y: number) => {
    const wd = bodoniWidth(ctx, text, 160, fonts);
    inGold(ctx, [Math.floor(sx - wd / 2 - 8), Math.floor(y - 135), Math.ceil(wd + 16), 160], (g) => {
      g.textAlign = "left";
      spacing(g, 0);
      bodoniText(g, text, sx - wd / 2, y, 160, fonts);
    });
  };
  numeral(String(c.round), 362);
  passLabel(ctx, fonts, "Seat", sx, 452, "center");
  numeral(String(c.seat ?? "—"), 614);
  passLabel(ctx, fonts, `Of ${seats}`, sx, 668, "center");
  medallion(ctx, fonts, sx, 830, 94, year);
  ctx.restore();

  // A hairline just inside the edge, as a foil card has.
  ctx.save();
  ctx.strokeStyle = "rgb(255 236 190 / 0.5)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(1.5, 1.5, W - 3, H - 3, R - 1);
  ctx.stroke();
  ctx.restore();
}

/** The gift's tag, in pixels. */
export const TAG_W = 512;
export const TAG_H = 256;

/** The gift's tag: cream card on a gold thread, the Trip ID of the person whose gift it is. */
export function drawTag(ctx: Ctx, tripId: string, fonts: Fonts) {
  const W = TAG_W;
  const H = TAG_H;
  ctx.clearRect(0, 0, W, H);
  const path = new Path2D();
  const cut = 70;
  path.moveTo(cut, 8);
  path.lineTo(W - 22, 8);
  path.arcTo(W - 8, 8, W - 8, 22, 14);
  path.lineTo(W - 8, H - 22);
  path.arcTo(W - 8, H - 8, W - 22, H - 8, 14);
  path.lineTo(cut, H - 8);
  path.lineTo(8, H / 2);
  path.closePath();
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#fbf5e8");
  g.addColorStop(1, "#ece0c4");
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.strokeStyle = "#c79a45";
  ctx.lineWidth = 5;
  ctx.stroke(path);
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(64, H / 2, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#c79a45";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(64, H / 2, 19, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = 0.6;
  ctx.font = `700 26px ${fonts.sans}`;
  spacing(ctx, 6);
  ctx.fillText("FOR", 118, 104);
  ctx.globalAlpha = 1;
  spacing(ctx, 1);
  for (const px of [44, 40, 36, 32]) {
    ctx.font = `600 ${px}px ${fonts.sans}`;
    if (ctx.measureText(tripId).width <= W - 150) break;
  }
  ctx.fillText(ellipsize(ctx, tripId, W - 140), 112, 170);
  spacing(ctx, 0);
}

/** The light inside the gift, in pixels. */
export const INSIDE = 256;

/** The light inside the open gift, seen through its top: brightest in the middle, warm towards the walls. */
export function drawInside(ctx: Ctx) {
  const S = INSIDE;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.66);
  g.addColorStop(0, "#fffbf1");
  g.addColorStop(0.4, "#ffe7ad");
  g.addColorStop(0.82, "#eaa954");
  g.addColorStop(1, "#b8732c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "rgb(110 56 18 / 0.5)";
  ctx.lineWidth = 9;
  ctx.strokeRect(4.5, 4.5, S - 9, S - 9);
}

/** The wrapping paper, one repeat of it, in pixels. */
export const WRAP = 512;

/** The gift's wrapping paper: glossy black with a fine gold pattern of dots and small four-pointed stars. */
export function drawWrap(ctx: Ctx) {
  const S = WRAP;
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, "#0d0a06");
  g.addColorStop(1, "#1c160d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // Fine diagonal lines, barely there.
  ctx.save();
  ctx.strokeStyle = "rgb(255 236 190 / 0.05)";
  ctx.lineWidth = 6;
  for (let k = -S; k < S * 2; k += 32) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + S, S);
    ctx.stroke();
  }
  ctx.restore();
  const star = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  };
  // Dots and stars on a staggered grid; every position is whole repeats of the tile, so the paper joins seamlessly.
  const step = S / 4;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * step + (row % 2 ? step / 2 : 0) + step / 4;
      const y = row * step + step / 4;
      ctx.fillStyle = "rgb(236 200 116 / 0.9)";
      if ((row + col) % 2) star(x % S, y, 13);
      else {
        ctx.beginPath();
        ctx.arc(x % S, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ---- the golden envelope (./envelope.ts) ----

/** The envelope's paper in pixels (its 2.6 by 1.62 shape), and its flap's height (the triangle down to its tip). */
export const ENV_PX = { w: 1300, h: 810, flapH: 470 };
/** The lining, one repeat of it; the wax seal. */
export const LINING_PX = 512;
export const WAX_PX = 256;

/** Gold paper over the whole canvas: warm light to deep gold, finely lined as the tickets' backs are. */
function goldPaper(ctx: Ctx, w: number, h: number, lift: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, lift ? "#f0d488" : "#e8c873");
  g.addColorStop(0.45, lift ? "#d4a64c" : "#c99a42");
  g.addColorStop(1, lift ? "#a87830" : "#9a6c26");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.strokeStyle = "rgb(104 68 12 / 0.09)";
  ctx.lineWidth = 1.2;
  for (let k = -h; k < w; k += 7) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + h, h);
    ctx.stroke();
  }
  // A soft light across the paper's upper left, as a lamp catches it.
  const sheen = ctx.createRadialGradient(w * 0.28, h * 0.22, 0, w * 0.28, h * 0.22, w * 0.7);
  sheen.addColorStop(0, "rgb(255 248 222 / 0.32)");
  sheen.addColorStop(1, "rgb(255 248 222 / 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Text in Bodoni, centred on x, pressed into the gold: a light edge under it, then the ink. */
function engraved(ctx: Ctx, text: string, cx: number, y: number, size: number, fonts: Fonts, ink: string) {
  const width = bodoniWidth(ctx, text, size, fonts);
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgb(255 244 210 / 0.6)";
  bodoniText(ctx, text, cx - width / 2, y + size * 0.03, size, fonts);
  ctx.fillStyle = ink;
  bodoniText(ctx, text, cx - width / 2, y, size, fonts);
  ctx.restore();
}

/**
 * The envelope's front for a winner, as an award's envelope carries its category: an engraved border, the shadow the
 * closed flap leaves along its edges, and under the seal "The Winner", a rule, and their round and seat.
 */
export function drawEnvelopePocket(ctx: Ctx, card: Pick<DrawCardPublic, "round" | "seat">, fonts: Fonts) {
  const { w, h, flapH } = ENV_PX;
  ctx.clearRect(0, 0, w, h);
  goldPaper(ctx, w, h, 0);
  ctx.save();
  ctx.strokeStyle = "rgb(92 60 12 / 0.55)";
  ctx.lineWidth = 4;
  ctx.strokeRect(30, 30, w - 60, h - 60);
  ctx.strokeStyle = "rgb(92 60 12 / 0.32)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(46, 46, w - 92, h - 92);
  // The closed flap's shadow along its two edges (a crease in the paper once it is open).
  ctx.filter = "blur(6px)";
  ctx.strokeStyle = "rgb(58 34 4 / 0.34)";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(-10, 6);
  ctx.lineTo(w / 2, flapH + 10);
  ctx.lineTo(w + 10, 6);
  ctx.stroke();
  ctx.filter = "none";
  ctx.restore();
  const ink = "#3a2507";
  engraved(ctx, "The Winner", w / 2, 640, 92, fonts, ink);
  ctx.save();
  ctx.fillStyle = "rgb(92 60 12 / 0.5)";
  ctx.fillRect(w / 2 - 120, 670, 240, 2);
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.82;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 34px ${fonts.sans}`;
  ctx.fillText(card.seat ? `Round ${card.round} · Seat ${card.seat}` : `Round ${card.round}`, w / 2, 724);
  ctx.restore();
}

/** The flap's outside: gold paper a shade lighter (it catches the light), a crisp paper edge, a line inside it. */
export function drawEnvelopeFlap(ctx: Ctx) {
  const { w, flapH: h } = ENV_PX;
  ctx.clearRect(0, 0, w, h);
  goldPaper(ctx, w, h, 1);
  ctx.save();
  const edge = (inset: number, colour: string, width: number) => {
    // The two edges down to the tip, moved `inset` pixels in, and the top edge.
    const slope = Math.hypot(w / 2, h) / (w / 2);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(inset * slope + inset * 0.5, inset);
    ctx.lineTo(w / 2, h - inset * slope * 1.6);
    ctx.lineTo(w - inset * slope - inset * 0.5, inset);
    ctx.closePath();
    ctx.stroke();
  };
  edge(3, "rgb(84 52 8 / 0.65)", 3);
  edge(7, "rgb(255 244 212 / 0.5)", 2);
  edge(34, "rgb(92 60 12 / 0.42)", 2.5);
  ctx.restore();
}

/** The lining, inside the envelope and its flap: black, with a fine gold lattice. */
export function drawLining(ctx: Ctx) {
  const S = LINING_PX;
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, "#0c0906");
  g.addColorStop(1, "#17110a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.save();
  ctx.strokeStyle = "rgb(214 174 96 / 0.24)";
  ctx.lineWidth = 1.6;
  const step = S / 8;
  for (let k = -S; k <= S * 2; k += step) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + S, S);
    ctx.moveTo(k, S);
    ctx.lineTo(k + S, 0);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The seal: crimson wax (the pass's WINNER seal is the same red), pressed with the AFFHAN mark, a gold A in a raised
 * ring; its edge a little uneven, as wax spreads. Clear outside the wax.
 */
export function drawWaxSeal(ctx: Ctx, fonts: Fonts) {
  const S = WAX_PX;
  const c = S / 2;
  const R = S * 0.46;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const r = R * (1 + 0.035 * Math.sin(7 * a + 0.6) + 0.02 * Math.sin(13 * a + 1.9));
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  const wax = ctx.createRadialGradient(c - R * 0.25, c - R * 0.3, R * 0.1, c, c, R * 1.05);
  wax.addColorStop(0, "#b4263c");
  wax.addColorStop(0.55, "#7d1224");
  wax.addColorStop(1, "#4a0814");
  ctx.fillStyle = wax;
  ctx.fill();
  // The pressed ring: a lit edge outside, a shadow inside.
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgb(255 196 196 / 0.2)";
  ctx.beginPath();
  ctx.arc(c, c, R * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgb(36 0 8 / 0.5)";
  ctx.beginPath();
  ctx.arc(c, c, R * 0.68, 0, Math.PI * 2);
  ctx.stroke();
  // The mark, in gold, pressed in.
  const size = R * 1.02;
  const width = bodoniWidth(ctx, "A", size, fonts);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgb(40 0 8 / 0.6)";
  bodoniText(ctx, "A", c - width / 2 + 2, c + size * 0.36 + 3, size, fonts);
  const gold = ctx.createLinearGradient(0, c - size * 0.5, 0, c + size * 0.4);
  gold.addColorStop(0, "#f8e2a2");
  gold.addColorStop(1, "#c8973c");
  ctx.fillStyle = gold;
  bodoniText(ctx, "A", c - width / 2, c + size * 0.36, size, fonts);
  // Light on the wax's upper left.
  const shine = ctx.createRadialGradient(c - R * 0.4, c - R * 0.45, 0, c - R * 0.4, c - R * 0.45, R * 0.5);
  shine.addColorStop(0, "rgb(255 255 255 / 0.22)");
  shine.addColorStop(1, "rgb(255 255 255 / 0)");
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();
}

// ---- the grand opening (./grand.ts) ----

/** The Winner Pack's print, in pixels (its 1.5 by 2.15 shape). */
export const PACK_PX = { w: 1024, h: 1468 };

/** Spaced capitals in Jost, centred on x. */
function caps(ctx: Ctx, text: string, x: number, y: number, px: number, track: number, weight: number, fonts: Fonts) {
  ctx.save();
  ctx.font = `${weight} ${px}px ${fonts.sans}`;
  spacing(ctx, track);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x + track / 2, y);
  spacing(ctx, 0);
  ctx.restore();
}

/** Bodoni centred on x, at `size`, tracked by `track` pixels a letter. */
function bodoniCentred(ctx: Ctx, text: string, x: number, y: number, size: number, track: number, fonts: Fonts) {
  const widths = [...text].map((ch) => bodoniWidth(ctx, ch, size, fonts));
  let at = x - (widths.reduce((a, b) => a + b, 0) + track * (text.length - 1)) / 2;
  [...text].forEach((ch, i) => {
    bodoniText(ctx, ch, at, y, size, fonts);
    at += widths[i] + track;
  });
}

/**
 * The pack's print, in ink on clear (the pack's foil is its shader's): AFFHAN, a medallion with the A, "Winner Pack",
 * the lucky draw and the trip, inside an engraved border; lines where its crimped ends begin.
 */
export function drawPack(ctx: Ctx, fonts: Fonts) {
  const { w, h } = PACK_PX;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  // Where the crimped ends begin.
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, h * 0.078, w, 5);
  ctx.fillRect(0, h * 0.922 - 5, w, 5);
  // The engraved border, double.
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 6;
  ctx.strokeRect(54, h * 0.1, w - 108, h * 0.8);
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(72, h * 0.1 + 18, w - 144, h * 0.8 - 36);
  ctx.globalAlpha = 0.85;
  bodoniCentred(ctx, "AFFHAN", w / 2, 262, 70, 22, fonts);
  // The medallion: two rings, the A.
  const cx = w / 2;
  const cy = 620;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(cx, cy, 236, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 208, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  bodoniCentred(ctx, "A", cx, cy + 112, 330, 0, fonts);
  bodoniCentred(ctx, "Winner Pack", w / 2, 1000, 98, 2, fonts);
  ctx.globalAlpha = 0.6;
  ctx.fillRect(w / 2 - 170, 1042, 340, 3);
  ctx.globalAlpha = 0.85;
  caps(ctx, "LUCKY DRAW · 2026", w / 2, 1116, 40, 14, 600, fonts);
  ctx.globalAlpha = 0.7;
  caps(ctx, "FREE CHINA BUSINESS TRIP", w / 2, 1196, 32, 9, 500, fonts);
  ctx.globalAlpha = 1;
}

/** A detail cast in gold, in pixels (wide, as a title is). */
export const PLATE_PX = { w: 2048, h: 680 };

/** A plate's room for its value and the line under it, under its label (pixels from its top). */
export const PLATE_ROOM = { top: 160, bottom: 660 };

/**
 * Where a plate's value and the line under it go, and at what size, so all of it fits the plate: `lines` of the value
 * (one or two), the size they fit across at, and whether a line goes under them. Set in the middle of the room under
 * the label; smaller if the value's lines and that line would not fit it (a long place on two lines had run its
 * country into its second line, 2026-11-12: "no perfection"). A Bodoni line takes 0.75 of its size above its
 * baseline and 0.22 below; the line under it 88 pixels of capitals, a gap of 26 above them and 24 below for its tails.
 */
export function plateLayout(lines: number, size: number, sub: boolean): { size: number; first: number; step: number; sub: number } {
  const room = PLATE_ROOM.bottom - PLATE_ROOM.top;
  const tall = (s: number) => (lines - 1) * s * 1.08 + 0.97 * s + (sub ? 112 : 0);
  let s = size;
  while (s > 60 && tall(s) > room) s -= 6;
  const first = PLATE_ROOM.top + (room - tall(s)) / 2 + 0.75 * s;
  return { size: s, first, step: s * 1.08, sub: first + (lines - 1) * s * 1.08 + 0.22 * s + 88 };
}

/**
 * A detail's letters for its gold plate: its label in spaced capitals, its value in Bodoni (as large as fits), and
 * under it a second line; drawn twice on black, crisp in red and blurred in green (the plate's shader takes its gold
 * from the one, its bevel and its glow from the other).
 */
export function drawPlate(ctx: Ctx, label: string, value: string, sub: string, fonts: Fonts) {
  const { w, h } = PLATE_PX;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const track = 6;
  const room = w * 0.92;
  const wide = (text: string, s: number) => [...text].reduce((a, ch) => a + bodoniWidth(ctx, ch, s, fonts), 0) + track * (text.length - 1);
  // One line, as large as fits; a long value (a long name) on two lines, broken at the space that evens them most,
  // never inside a word, rather than set small.
  let lines = [value];
  let size = 300;
  while (size > 170 && wide(value, size) > room) size -= 6;
  if (wide(value, size) > room && value.includes(" ")) {
    const words = value.split(" ");
    let best = [value, ""];
    let worst = Infinity;
    for (let i = 1; i < words.length; i++) {
      const two = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
      const m = Math.max(...two.map((l) => l.length));
      if (m < worst) {
        worst = m;
        best = two;
      }
    }
    lines = best;
    size = 230;
    while (size > 90 && Math.max(...lines.map((l) => wide(l, size))) > room) size -= 6;
  } else while (size > 90 && wide(value, size) > room) size -= 6;
  const at = plateLayout(lines.length, size, !!sub);
  const draw = () => {
    caps(ctx, label.toUpperCase(), w / 2, 118, 58, 24, 600, fonts);
    lines.forEach((line, i) => bodoniCentred(ctx, line, w / 2, at.first + i * at.step, at.size, track, fonts));
    if (sub) {
      ctx.save();
      ctx.font = `500 88px ${fonts.sans}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(sub, w / 2, at.sub);
      ctx.restore();
    }
  };
  ctx.globalCompositeOperation = "lighter";
  ctx.filter = "blur(14px)";
  ctx.fillStyle = "#00ff00";
  draw();
  ctx.filter = "none";
  ctx.fillStyle = "#ff0000";
  draw();
  ctx.restore();
}
