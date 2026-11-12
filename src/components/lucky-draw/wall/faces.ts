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
const SEAL = "rgb(163 22 44)";

const DRAWN = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * A barcode down the pass, from its Trip ID, as the registered page's pass draws it (guard bars, then each character's
 * last five bits as a wide or narrow bar): the same person always has the same code. Decoration, not for scanning.
 */
function barcode(ctx: Ctx, text: string, x: number, y: number, w: number, h: number) {
  const bars: { at: number; w: number }[] = [];
  let at = 0;
  const put = (dark: boolean, bw: number) => {
    if (dark) bars.push({ at, w: bw });
    at += bw;
  };
  const guard = () => {
    put(true, 1);
    put(false, 1);
    put(true, 1);
    put(false, 1.4);
  };
  guard();
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    for (let b = 4; b >= 0; b--) {
      put(true, (c >> b) & 1 ? 2.3 : 1);
      put(false, b === 0 ? 1.8 : 1);
    }
  }
  guard();
  const k = h / at;
  ctx.fillStyle = INK;
  for (const b of bars) ctx.fillRect(x, y + b.at * k, w, b.w * k);
}

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

function label(ctx: Ctx, fonts: Fonts, text: string, x: number, y: number, align: CanvasTextAlign = "left") {
  ctx.save();
  ctx.globalAlpha = 0.56;
  ctx.fillStyle = INK;
  ctx.textAlign = align;
  ctx.font = `700 22px ${fonts.sans}`;
  spacing(ctx, 6);
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.restore();
}

/**
 * The winner's entry seal, stamped across the perforation as the registered page's is ("Registered", "Free China
 * Trip"): two rings, "Lucky draw" over the rim, "Free China Trip" under it, "Winner" and the day in the middle, in red
 * ink that sinks into the gold, a little uneven, as a rubber stamp leaves it.
 */
/** The seal for a day, made once: it changes only with the date (every winner of the day shares it). */
const seals = new Map<string, HTMLCanvasElement>();

function seal(ctx: Ctx, fonts: Fonts, cx: number, cy: number, r: number, when: Date) {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(when);
  const key = `${day}|${r}|${fonts.sans}`;
  let s = seals.get(key);
  if (!s) {
    s = sealCanvas(fonts, r, when);
    seals.set(key, s);
  }
  const c = s.width / 2;
  ctx.save();
  ctx.globalAlpha = 0.86;
  ctx.globalCompositeOperation = "multiply";
  ctx.translate(cx, cy);
  ctx.rotate(-0.21);
  ctx.drawImage(s, -c, -c);
  ctx.restore();
}

function sealCanvas(fonts: Fonts, r: number, when: Date): HTMLCanvasElement {
  const s = document.createElement("canvas");
  const size = Math.ceil(r * 2 + 8);
  s.width = size;
  s.height = size;
  const g = s.getContext("2d");
  if (!g) return s;
  const c = size / 2;
  g.strokeStyle = SEAL;
  g.fillStyle = SEAL;
  g.lineWidth = r * 0.05;
  g.beginPath();
  g.arc(c, c, r * 0.96, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = r * 0.022;
  g.beginPath();
  g.arc(c, c, r * 0.72, 0, Math.PI * 2);
  g.stroke();
  // The rim's words, upright, round the top and the bottom.
  const arc = (text: string, radius: number, top: boolean, px: number) => {
    g.save();
    g.font = `700 ${px}px ${fonts.sans}`;
    spacing(g, 0);
    const chars = [...text.toUpperCase()];
    const widths = chars.map((ch) => g.measureText(ch).width + px * 0.18);
    const total = widths.reduce((a, b) => a + b, 0);
    let a = -total / radius / 2;
    for (let i = 0; i < chars.length; i++) {
      const mid = a + widths[i] / radius / 2;
      g.save();
      if (top) {
        g.translate(c + radius * Math.sin(mid), c - radius * Math.cos(mid));
        g.rotate(mid);
      } else {
        // Left to right along the foot of the ring, each letter upright (its top towards the middle).
        g.translate(c + radius * Math.sin(mid), c + radius * Math.cos(mid));
        g.rotate(-mid);
      }
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(chars[i], 0, 0);
      g.restore();
      a += widths[i] / radius;
    }
    g.restore();
  };
  arc("Lucky draw", r * 0.84, true, r * 0.17);
  arc("Free China Trip", r * 0.84, false, r * 0.15);
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.font = `700 ${r * 0.27}px ${fonts.sans}`;
  spacing(g, r * 0.03);
  g.fillText("WINNER", c, c + r * 0.06);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).formatToParts(when).map((x) => [x.type, x.value]));
  g.font = `600 ${r * 0.15}px ${fonts.sans}`;
  spacing(g, r * 0.02);
  g.fillText(`${p.day} ${p.month} ${p.year}`.toUpperCase(), c, c + r * 0.33);
  // Uneven ink: specks where the stamp did not take, in three shades, one path each.
  g.globalCompositeOperation = "destination-out";
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const alpha of [0.3, 0.55, 0.8]) {
    g.globalAlpha = alpha;
    g.beginPath();
    for (let i = 0; i < 170; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const rad = 0.6 + rnd() * 2.4;
      g.moveTo(x + rad, y);
      g.arc(x, y, rad, 0, Math.PI * 2);
    }
    g.fill();
  }
  return s;
}

/**
 * The winner's boarding pass: the registered page's pass (its gold, its words, its barcode and its plane from their
 * country to China), now with their round and seat on the stub and the winner's seal across the perforation. The name
 * in the trip's Bodoni, in capitals, as large as its line allows.
 */
export function drawPass(ctx: Ctx, c: DrawCardPublic, fonts: Fonts, seats: number) {
  const W = PASS_W;
  const H = PASS_H;
  const R = 46;
  const STUB = 420;
  const main = W - STUB;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, R);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#f8ecd0");
  g.addColorStop(0.48, "#ecd3a0");
  g.addColorStop(1, "#d8b06a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const hi = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.75);
  hi.addColorStop(0, "rgb(255 250 236 / 0.92)");
  hi.addColorStop(1, "rgb(255 250 236 / 0)");
  ctx.fillStyle = hi;
  ctx.fillRect(0, 0, W, H);

  const L = 92;
  const right = main - 92;
  ctx.textBaseline = "alphabetic";
  // The head: the brand, and what it is.
  ctx.fillStyle = INK;
  ctx.font = `800 30px ${fonts.sans}`;
  spacing(ctx, 7.5);
  ctx.textAlign = "left";
  ctx.fillText("AFFHAN INTERNATIONAL", L, 118);
  ctx.globalAlpha = 0.6;
  ctx.font = `700 24px ${fonts.sans}`;
  spacing(ctx, 7.5);
  ctx.textAlign = "right";
  ctx.fillText("BOARDING PASS", right, 118);
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.strokeStyle = "rgb(27 19 7 / 0.28)";
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 9]);
  ctx.beginPath();
  ctx.moveTo(L, 150);
  ctx.lineTo(right, 150);
  ctx.stroke();
  ctx.restore();

  // The barcode down the right of the main part, its Trip ID printed beside it.
  barcode(ctx, c.tripId, right - 64, 206, 64, 430);
  ctx.save();
  ctx.translate(right - 86, 421);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.7;
  ctx.textAlign = "center";
  ctx.font = `600 21px ${fonts.sans}`;
  spacing(ctx, 5);
  ctx.fillText(c.tripId, 0, 0);
  ctx.restore();

  // The passenger: the name as large as its line allows, in capitals, in the trip's Bodoni at its text cut.
  label(ctx, fonts, "Passenger", L, 226);
  const nameWidth = right - 140 - L;
  const { size, lines } = setBodoniName(ctx, c.name.toUpperCase(), [158, 144, 130, 118, 106, 96, 86, 78, 70, 62], nameWidth, fonts);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  spacing(ctx, 0);
  // One line sits in the middle of the space between the label and the Trip ID; two fill it.
  if (lines.length === 1) bodoniText(ctx, lines[0], L - 4, 246 + (300 + size * 0.7) / 2, size, fonts);
  else {
    bodoniText(ctx, lines[0], L - 4, 252 + size * 0.86, size, fonts);
    bodoniText(ctx, lines[1], L - 4, 252 + size * 0.86 + size * 1.04, size, fonts);
  }

  // Trip ID, then the route: their country and city, the plane, China.
  const rowLabel = 574;
  const rowValue = 640;
  label(ctx, fonts, "Trip ID", L, rowLabel);
  ctx.fillStyle = INK;
  ctx.font = `600 50px ${fonts.sans}`;
  spacing(ctx, 3);
  ctx.textAlign = "left";
  ctx.fillText(c.tripId, L, rowValue);

  const fromX = 640;
  label(ctx, fonts, "From", fromX, rowLabel);
  ctx.fillStyle = INK;
  ctx.font = `600 50px ${fonts.sans}`;
  spacing(ctx, 0.5);
  ctx.fillText(ellipsize(ctx, c.country || "—", 300), fromX, rowValue);
  ctx.globalAlpha = 0.7;
  ctx.font = `400 32px ${fonts.sans}`;
  spacing(ctx, 0.3);
  ctx.fillText(ellipsize(ctx, c.city && c.city !== c.country ? c.city : "", 300), fromX, rowValue + 46);
  ctx.globalAlpha = 1;

  const toX = right - 250;
  const trackA = fromX + 310;
  const trackB = toX - 40;
  ctx.save();
  ctx.strokeStyle = "rgb(27 19 7 / 0.35)";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(trackA, rowValue - 16);
  ctx.lineTo(trackB, rowValue - 16);
  ctx.stroke();
  ctx.restore();
  plane(ctx, (trackA + trackB) / 2, rowValue - 16, 54);
  label(ctx, fonts, "To", toX, rowLabel);
  ctx.fillStyle = INK;
  ctx.font = `600 50px ${fonts.sans}`;
  spacing(ctx, 0.5);
  ctx.fillText("China", toX, rowValue);

  // The foot: when they were drawn, and what they are now.
  ctx.save();
  ctx.strokeStyle = "rgb(27 19 7 / 0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L, 740);
  ctx.lineTo(right, 740);
  ctx.stroke();
  ctx.restore();
  label(ctx, fonts, "Drawn on", L, 812);
  const d = Object.fromEntries(DRAWN.formatToParts(new Date(c.drawnAt)).map((x) => [x.type, x.value]));
  ctx.fillStyle = INK;
  ctx.font = `500 40px ${fonts.sans}`;
  spacing(ctx, 0.5);
  ctx.fillText(`${d.day} ${d.month} ${d.year} · ${d.hour}:${d.minute} IST`, L, 870);
  label(ctx, fonts, "Status", fromX + 120, 812);
  ctx.fillStyle = INK;
  ctx.font = `600 40px ${fonts.sans}`;
  ctx.fillText("Lucky draw winner", fromX + 120, 870);

  // The perforation: a line of holes and a notch at each end, cut through.
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

  // The stub: the round and the seat, large.
  const sx = main + STUB / 2;
  label(ctx, fonts, "Round", sx, 210, "center");
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  spacing(ctx, 0);
  const big = (text: string, y: number) => bodoniText(ctx, text, sx - bodoniWidth(ctx, text, 168, fonts) / 2, y, 168, fonts);
  big(String(c.round), 380);
  label(ctx, fonts, "Seat", sx, 500, "center");
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  big(String(c.seat ?? "—"), 670);
  ctx.textAlign = "center";
  ctx.globalAlpha = 0.6;
  ctx.font = `600 32px ${fonts.sans}`;
  spacing(ctx, 4);
  ctx.fillText(`OF ${seats}`, sx, 728);
  ctx.globalAlpha = 1;
  spacing(ctx, 0);

  seal(ctx, fonts, main - 40, 826, 118, new Date(c.drawnAt));
  ctx.restore();

  // A hairline just inside the edge, as foil card has.
  ctx.save();
  ctx.strokeStyle = "rgb(255 246 222 / 0.65)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(2.5, 2.5, W - 5, H - 5, R - 2);
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
