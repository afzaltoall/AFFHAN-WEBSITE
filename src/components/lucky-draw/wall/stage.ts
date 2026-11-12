import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { DrawCardPublic, DrawPoolEntry } from "@/lib/lucky-draw-shared";
import { placeOfTrip } from "./drum";
import {
  ENV_PX,
  FACE_H,
  FACE_W,
  INSIDE,
  LINING_PX,
  PACK_PX,
  PASS_H,
  PLATE_PX,
  PASS_W,
  STUB_AT,
  TAG_H,
  TAG_W,
  WAX_PX,
  WRAP,
  drawBack,
  drawEnvelopeFlap,
  drawEnvelopePocket,
  drawFace,
  drawInside,
  drawLining,
  drawPack,
  drawPass,
  drawPlate,
  drawTag,
  drawWaxSeal,
  drawWrap,
  type Fonts,
} from "./faces";
import { BOARD_PRINT_AT, Board } from "./board";
import { CARD_IN, CARD_Z, ENV, Envelope, TE } from "./envelope";
import { FlarePillar, GoldPack, GoldPlate, LightBeams, PLATE_HOLD, ShockRing, TG, plateAt, ringAt, shakeAt } from "./grand";
import { Gift, RIM_Y, type GiftMoment } from "./gift";
import {
  ALL_DOWN,
  BACKS_T,
  DOWN_AT,
  DRIFT,
  FLIP_T,
  GRID,
  ROWS,
  SHUFFLE_MIN,
  SHUFFLE_RAMP,
  WAVE_T,
  drawPlan,
  flatX,
  flipAngle,
  flipDelay,
  mod,
  openingRows,
  pathAt,
  personAt,
  rollAt,
  shuffleAt,
  shuffleEnd,
  stepIndex,
  stretchFor,
  walkAhead,
  walkStart,
  type Cell,
  type Roll,
  type Segment,
  type Walk,
} from "./grid";

/**
 * A draw on the wall, pressed at `start` (ms; its moments are seconds from then): where the rows stood (still until
 * the roll); when the tickets turn face up again (Infinity until the server has answered); the person drawn and
 * whether the new names are in; the roll (from `roll0`, to rest on `end`); the ticket the light lands on, when the
 * light comes on and when it lands, and its way; whether the draw failed (the tickets then turn back up as they were).
 */
interface Run {
  start: number;
  done: (landed: boolean) => void;
  p0: number;
  up: number;
  drawn: number | null;
  placed: boolean;
  roll: Roll | null;
  roll0: number;
  end: number;
  target: Cell | null;
  light: number;
  land: number;
  walk: Walk | null;
  halted: boolean;
  /**
   * When the tickets' face-down wave began (seconds from the press: before it, or -Infinity, when the press found them
   * resting on their gold backs), its first column, and when every ticket is face down (at least 0: the press).
   */
  down: number;
  downK0: number;
  allDown: number;
  /** The earliest the names may turn face up (drawPlan's `from`). */
  from: number;
  /** The rows' pace at the press (rolling on between draws), kept until the roll takes it up; the up wave's first column. */
  v: number;
  upK0: number;
  /**
   * Pressed on the gold backs: the rows shuffle at once (./grid.ts shuffleAt), told to stop (`stop`, seconds from the
   * press; Infinity until the answer) and at rest again by `settled` (0 for a run that does not shuffle).
   */
  shuffle: boolean;
  stop: number;
  settled: number;
}

/**
 * The lucky draw's wall, drawn in 3D on the TV (the owner, 2026-11-11, with four pictures of video walls: "like opening
 * a gift box"; then "filled completely ... curved, facing the screen"; "one box of light ... for real, not like
 * magic"; "card to card, a snap, not a mouse drag or a slideshow"; "tickets ... six rows ... a Ballon d'Or gold feel";
 * "bring that roll back"; "when I click Draw, first that image (the gold backs) ... and while it scrolls, the
 * selection").
 *
 * Everyone in the draw is a ticket, black with gold print, in six rows on a gently curved wall facing the room, drawn
 * only in the view between the screen's words and its seats (opts.view); each row in Trip ID order, rolling slowly
 * left while it waits (./grid.ts). A press: the tickets turn face down in a wave, a wall of gold backs while the
 * server draws; they turn face up with new names, the person drawn among them in their own place, and the rows roll
 * about a screen on while the light jumps from ticket to ticket, a snap each time, every way across the wall, the
 * ticket it is on turning gold; the rows come to rest, the light slows, holding on each name, and its last jump lands
 * on the person drawn. Their golden
 * ticket lifts out of the wall, turns, and is a gift; the gift hops, its lid tips off, light pours out, and their
 * boarding pass rises out of it and holds the screen for three seconds; then it goes down into its seat, and the rows
 * roll on.
 *
 * Built not to stick: every moment is worked out from the clock, never from how many frames were drawn, and timers
 * finish a run and a reveal even when the browser stops drawing (./DrawWall.tsx checks the result, not the picture).
 * The names are drawn into one texture as tiles need them. No mobile number ever reaches it.
 */

export interface StageOptions {
  fonts: Fonts;
  /** A layer of the page over everything (the seats too), where the pass is shown once it faces the room. */
  lift: HTMLElement;
  /** The part of the page between its words and its seats: the rows of names are drawn only there, whole. */
  view?: HTMLElement;
  /** Seats in a round (the pass's stub says "of 5"). */
  seats: number;
  /** The Trip ID the light lands on (and the first name, as the wall opens); null while the light is out. */
  onRest?: (tripId: string | null) => void;
  /** Called once if this screen draws too slowly to keep the wall (the page then shows the list instead). */
  onSlow?: () => void;
  /** Called once the wall has opened: the names in, drawn, and turned face up (Draw can be pressed from then on). */
  onOpen?: () => void;
  /**
   * How the winner is revealed: the grand opening, as a card pack's walkout (./grand.ts; the owner, 2026-11-12: "a
   * grand opening, zooming in one by one ... FIFA style": the pack, the Trip ID, the place, the card), or the ones it replaced,
   * to compare on the TV page: the golden envelope (`?reveal=envelope`), the airport departures board
   * (`?reveal=board`), the gift box (`?reveal=gift`).
   */
  reveal?: "walk" | "envelope" | "board" | "gift";
}

/** A tile's state: as it is, a winner (gold), or out of the wall (the winner's, while it is a gift). */
const GOLD = 1;
const HIDDEN = 2;
/** Seconds the rows stay still after they come to rest, before they roll on, and the seconds they take to get going. */
const DRIFT_AFTER = 2.5;
const DRIFT_EASE = 1.6;
/**
 * The wall moved by hand between draws (the owner, 2026-11-12: "scroll the cards with the cursor, as by hand"): let
 * go, it keeps the hand's pace (at most FLING_MAX columns a second), slowing as a heavy wheel does (its pace halving
 * about every 0.4 s); a mouse's wheel or a trackpad moves it by as much, eased in over about a tenth of a second.
 */
const FLING_MAX = 8;
const FLING_FRICTION = 1.8;
const WHEEL_EASE = 9;
/** The page's pass, before it is shown: there, ready, and too faint to see. */
const LIFT_READY = 0.004;
/** Seconds the tickets the light has jumped from stay golden, fading: its trail across the wall. */
const TRAIL = 0.55;

/** The reveal, in seconds from the stop. */
const TL = {
  lock: 0.6,
  out: 0.45,
  flip: 0.95,
  landed: 1.45,
  pop: 2.05,
  rise: 2.25,
  risen: 2.9,
  placed: 3.7,
  /** Three seconds in front of the room (the owner: "3 second katanum podhum"), then down to its seat. */
  leave: 6.7,
  seat: 7.35,
  end: 7.55,
} as const;

/**
 * The departures board's reveal, in seconds from the stop: the ticket flies out and checks in to the board as it
 * comes up; the board's letters settle by BOARD_PRINT_AT (./board.ts); the pass prints out of its slot, holds the
 * screen three seconds, and goes down into its seat.
 */
const TB = {
  lock: 0.6,
  out: 0.45,
  dock: 1.2,
  boardIn: 0.9,
  print: BOARD_PRINT_AT,
  placed: BOARD_PRINT_AT + 0.65,
  leave: BOARD_PRINT_AT + 3.65,
  seat: BOARD_PRINT_AT + 4.3,
  end: BOARD_PRINT_AT + 4.5,
} as const;

/** The moments every reveal has. */
type Moments = { lock: number; out: number; placed: number; leave: number; seat: number; end: number };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (t: number, a: number, b: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const easeIn = (x: number) => clamp01(x) ** 3;
const easeInOut = (x: number) => {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};
const backOut = (x: number, s = 1.9) => {
  const c = clamp01(x) - 1;
  return 1 + (s + 1) * c * c * c + s * c * c;
};
const bell = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));

/** A seeded random, so the lights in the room are the same every time the screen opens. */
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A ticket's outline (a rounded card with a notch top and bottom at its perforation), and gold foil. */
const ticketGlsl = /* glsl */ `
  float ticketSdf(vec2 q, vec2 size, float stub) {
    float rad = 0.045;
    vec2 dd = abs(q) - (size * 0.5 - rad);
    float sdf = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - rad;
    float xs = (stub - 0.5) * size.x;
    float notch = min(length(q - vec2(xs, size.y * 0.5)), length(q - vec2(xs, -size.y * 0.5))) - 0.052;
    return max(sdf, -notch);
  }
  float perforation(vec2 q, vec2 size, float stub, float aa) {
    float xs = (stub - 0.5) * size.x;
    float d = length(vec2(q.x - xs, mod(q.y + 0.019, 0.038) - 0.019)) - 0.0072;
    return (1.0 - smoothstep(-aa * 0.6, aa * 0.6, d)) * step(abs(q.y), size.y * 0.5 - 0.07);
  }
  // Warm gold, its light running slowly across it.
  vec3 foil(vec2 q, float t) {
    float band = 0.5 + 0.5 * sin(q.x * 2.1 + q.y * 3.3 - t * 0.55);
    vec3 c = mix(vec3(0.50, 0.34, 0.10), vec3(0.86, 0.66, 0.30), smoothstep(0.0, 0.62, band));
    return mix(c, vec3(1.0, 0.91, 0.64), smoothstep(0.78, 1.0, band));
  }
`;

const tileVertex = /* glsl */ `
  attribute vec3 aPos;
  attribute float aCell;
  attribute float aFlag;
  attribute float aLit;
  attribute float aFlip;
  uniform float uAtlasCols;
  uniform vec2 uCellUV;
  uniform float uCurve;
  uniform vec3 uSel;
  uniform float uPop;
  varying vec2 vUv;
  varying vec2 vCenter;
  varying float vFlag;
  varying float vHasCell;
  varying vec2 vCell;
  varying vec3 vWorld;
  varying float vLit;
  void main() {
    vec3 p = position;
    vLit = aLit;
    // The ticket the light has just jumped to stands out a little, for a moment.
    float picked = uSel.z * (1.0 - step(0.05, abs(aPos.x - uSel.x))) * (1.0 - step(0.05, abs(aPos.y - uSel.y)));
    p.xy *= 1.0 + (uPop - 1.0) * picked;
    // Turning over: about its own upright, coming a little towards the room as it turns.
    float ca = cos(aFlip);
    float sa = sin(aFlip);
    float lx = p.x * ca;
    float lz = -p.x * sa + 0.16 * abs(sa);
    // The wall curves gently towards the room, each ticket turned to face it (./grid.ts): aPos is its place on the flat.
    float th = aPos.x / uCurve;
    float c = cos(th);
    float s = sin(th);
    vec3 w = vec3(uCurve * s + lx * c - lz * s, aPos.y + p.y, uCurve * (1.0 - c) + lx * s + lz * c);
    vUv = uv;
    vCenter = aPos.xy;
    vFlag = aFlag;
    vWorld = w;
    vHasCell = aCell >= 0.0 ? 1.0 : 0.0;
    float cell = max(aCell, 0.0);
    vCell = vec2(mod(cell, uAtlasCols), floor(cell / uAtlasCols)) * uCellUV;
    bool gone = aFlag > 1.5 && aFlag < 2.5;
    gl_Position = gone ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(w, 1.0);
  }
`;

const tileFragment = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec2 uCellUV;
  uniform vec2 uBackCell;
  uniform vec2 uTile;
  uniform float uStub;
  uniform float uDim;
  uniform float uTime;
  uniform float uIdle;
  uniform float uLock;
  // The walkout's darkness: 0 none, 1 the wall all but gone.
  uniform float uDark;
  uniform vec2 uRes;
  // The ticket the light is on: its centre (x, y), and whether the light is on (z).
  uniform vec3 uSel;
  varying vec2 vUv;
  varying vec2 vCenter;
  varying float vFlag;
  varying float vHasCell;
  varying vec2 vCell;
  varying vec3 vWorld;
  varying float vLit;
  ${ticketGlsl}
  void main() {
    // Turned over, a ticket shows its back, the right way round.
    bool back = !gl_FrontFacing;
    vec2 uv = back ? vec2(1.0 - vUv.x, vUv.y) : vUv;
    vec2 q = (uv - 0.5) * uTile;
    float sdf = ticketSdf(q, uTile, uStub);
    float aa = fwidth(sdf) * 1.2;
    float inside = 1.0 - smoothstep(-aa, aa, sdf);
    if (inside < 0.004) discard;
    float edge = 1.0 - smoothstep(0.0, aa + 0.008, abs(sdf + 0.013));
    float perf = perforation(q, uTile, uStub, aa);
    float gold = (vFlag > 0.5 && vFlag < 1.5) ? 1.0 : 0.0;
    float picked = uSel.z * (1.0 - step(0.05, abs(vCenter.x - uSel.x))) * (1.0 - step(0.05, abs(vCenter.y - uSel.y)));
    // How golden the ticket is: the light's (fully), a winner's (fully), the light's trail (fading).
    float trail = vLit * vLit * (1.0 - picked);
    float golden = max(max(picked, gold), trail * 0.9);
    // The rows run off the screen's left and right edges; their far ends fall a little into shadow.
    vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
    float vig = 1.0 - 0.3 * smoothstep(0.7, 1.45, length(ndc * vec2(0.82, 1.0)));
    float bright = vig * (1.0 - 0.74 * uDim * (1.0 - picked));
    vec3 metal = foil(q + vCenter, uTime);
    vec3 col;
    if (back) {
      // The back: gold foil, finely lined, the AFFHAN mark printed dark.
      col = metal * (0.9 + 0.06 * sin((q.x - q.y) * 120.0));
      float mark = texture2D(uAtlas, uBackCell + vec2(uv.x, 1.0 - uv.y) * uCellUV).a;
      col = mix(col, vec3(0.17, 0.11, 0.03), mark * 0.88);
      col = mix(col, vec3(1.0, 0.95, 0.78), edge * 0.55);
      col = mix(col, vec3(0.32, 0.21, 0.06), perf * 0.7);
    } else {
      // The face: a black card with gold print, a shade lighter on its stub; golden when lit, its print then dark.
      vec3 card = mix(vec3(0.043, 0.034, 0.021), vec3(0.098, 0.076, 0.044), uv.y);
      card += vec3(0.05, 0.04, 0.02) * pow(max(0.0, 1.0 - length(q / uTile - vec2(-0.3, 0.35)) * 1.6), 2.0);
      card = mix(card, card * 1.3 + vec3(0.016, 0.012, 0.004), step(uStub, uv.x));
      vec3 body = mix(card, metal, golden);
      vec4 m = vHasCell > 0.5 ? texture2D(uAtlas, vCell + vec2(uv.x, 1.0 - uv.y) * uCellUV) : vec4(0.0);
      float sum = max(m.r + m.g, 0.0001);
      float ivory = m.a * m.r / sum;
      float printed = m.a * m.g / sum;
      col = body;
      col = mix(col, mix(vec3(0.97, 0.93, 0.84), vec3(0.13, 0.08, 0.02), golden), ivory);
      col = mix(col, mix(vec3(0.92, 0.75, 0.41), vec3(0.22, 0.13, 0.03), golden), printed);
      col = mix(col, mix(vec3(0.74, 0.57, 0.26), vec3(1.0, 0.94, 0.72), golden), edge * (0.8 + 0.2 * golden));
      col = mix(col, mix(vec3(0.66, 0.51, 0.24), vec3(0.36, 0.23, 0.07), golden), perf * 0.85);
      // A slow light passing over the wall while it waits.
      float d = vWorld.x * 0.085 - vWorld.y * 0.24 - (mod(uTime * 0.13, 2.8) - 1.4);
      col += vec3(1.0, 0.86, 0.56) * edge * exp(-d * d * 36.0) * uIdle;
    }
    col += vec3(1.0, 0.84, 0.5) * picked * (0.04 + 0.12 * uLock);
    col *= bright * (1.0 + picked * (0.12 + 0.35 * uLock));
    col *= 1.0 - 0.985 * uDark;
    gl_FragColor = vec4(col, inside);
  }
`;

/** The winner's ticket as it leaves the wall: golden, its print dark, drawn twice as large so it stays sharp. */
const heroFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uAtlas;
  uniform vec2 uBackCell;
  uniform vec2 uCellUV;
  uniform vec2 uTile;
  uniform float uGlow;
  uniform float uShade;
  uniform float uStub;
  uniform float uTime;
  varying vec2 vUv;
  ${ticketGlsl}
  void main() {
    // Turned over, it shows its back, the right way round, as the wall's tickets do.
    bool back = !gl_FrontFacing;
    vec2 uv = back ? vec2(1.0 - vUv.x, vUv.y) : vUv;
    vec2 q = (uv - 0.5) * uTile;
    float sdf = ticketSdf(q, uTile, uStub);
    float aa = fwidth(sdf) * 1.2;
    float inside = 1.0 - smoothstep(-aa, aa, sdf);
    if (inside < 0.004) discard;
    float edge = 1.0 - smoothstep(0.0, aa + 0.008, abs(sdf + 0.013));
    vec3 col = foil(q, uTime);
    if (back) {
      col *= 0.9 + 0.06 * sin((q.x - q.y) * 120.0);
      col = mix(col, vec3(0.17, 0.11, 0.03), texture2D(uAtlas, uBackCell + vec2(uv.x, 1.0 - uv.y) * uCellUV).a * 0.88);
    } else col = mix(col, vec3(0.13, 0.08, 0.02), texture2D(uMap, uv).a);
    col = mix(col, vec3(1.0, 0.95, 0.76), edge);
    col = mix(col, vec3(0.36, 0.23, 0.07), perforation(q, uTile, uStub, aa) * 0.85);
    col += vec3(1.0, 0.86, 0.55) * uGlow * 0.12;
    // Light leaking from its edges as it is about to burst.
    col += vec3(1.0, 0.9, 0.62) * edge * max(0.0, uGlow - 1.5) * 0.6;
    col *= 1.0 - uShade;
    gl_FragColor = vec4(col, inside);
  }
`;

const plainVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frameFragment = /* glsl */ `
  uniform vec2 uSize;
  uniform vec2 uTile;
  uniform float uGlow;
  uniform float uAlpha;
  varying vec2 vUv;
  float box(vec2 q, vec2 hs, float r) {
    vec2 d = abs(q) - (hs - r);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
  }
  void main() {
    vec2 q = (vUv - 0.5) * uSize;
    vec2 hs = uTile * 0.5 + vec2(0.07);
    float s = box(q, hs, 0.1);
    float aa = fwidth(s);
    // A fine gold line round the tile, a soft light outside it and a little inside.
    float line = 1.0 - smoothstep(0.0, aa * 1.5, abs(s) - 0.0085);
    float outer = s > 0.0 ? exp(-s * 10.0) : 0.0;
    float inner = s < 0.0 ? exp(s * 28.0) : 0.0;
    // Gone before the edge of the plane it is drawn on, so it never shows that plane's corners.
    float glow = (outer * 0.5 + inner * 0.22) * uGlow * (1.0 - smoothstep(0.16, 0.31, s));
    vec3 col = mix(vec3(0.94, 0.74, 0.38), vec3(1.0, 0.93, 0.74), line);
    float a = clamp(line + glow, 0.0, 1.0) * uAlpha;
    gl_FragColor = vec4(col, a);
  }
`;

const passFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uAlpha;
  uniform float uSweep;
  uniform float uWarm;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(uMap, vUv);
    float d = vUv.x + vUv.y * 0.35 - (uSweep * 1.7 - 0.25);
    float band = exp(-d * d * 70.0);
    // The texture is premultiplied (it uploads faster so): so is what is drawn.
    vec3 col = c.rgb + (vec3(1.0, 0.97, 0.88) * band * 0.24 + vec3(1.0, 0.8, 0.45) * uWarm * 0.1) * c.a;
    gl_FragColor = vec4(col * uAlpha, c.a * uAlpha);
  }
`;

const backgroundFragment = /* glsl */ `
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uDark;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 d = (vUv - vec2(0.5, 0.57)) * vec2(uRes.x / uRes.y, 1.0);
    float r = length(d);
    vec3 col = mix(vec3(0.120, 0.088, 0.040), vec3(0.052, 0.038, 0.020), smoothstep(0.0, 0.62, r));
    col = mix(col, vec3(0.012, 0.010, 0.008), smoothstep(0.5, 1.25, r));
    col += vec3(0.11, 0.075, 0.025) * exp(-pow((vUv.y - 0.57) * 3.4, 2.0)) * 0.45;
    // A grain under a step of the TV's own, so the dark gradient never bands.
    col *= 1.0 - 0.92 * uDark;
    col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * (1.6 / 255.0);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const bokehVertex = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aAlpha;
  uniform float uTime;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position + vec3(sin(uTime * 0.09 + aPhase) * 0.9, cos(uTime * 0.07 + aPhase * 1.7) * 0.55, 0.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(aSize * uScale / -mv.z, 900.0);
    vColor = aColor;
    vAlpha = aAlpha * (0.78 + 0.22 * sin(uTime * 0.45 + aPhase * 3.0));
  }
`;
const bokehFragment = /* glsl */ `
  uniform float uDark;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r = length(q);
    if (r > 1.0) discard;
    float disc = smoothstep(1.0, 0.8, r);
    float ring = smoothstep(0.68, 0.94, r) * smoothstep(1.0, 0.94, r);
    float a = (disc * 0.5 + ring * 0.55) * vAlpha * (1.0 - 0.9 * uDark);
    gl_FragColor = vec4(vColor * a, a);
  }
`;

const sparkVertex = /* glsl */ `
  attribute vec3 aVel;
  attribute float aBorn;
  attribute float aLife;
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uT;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = uT - aBorn;
    if (t < 0.0 || t > aLife) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vColor = aColor;
      return;
    }
    vec3 p = position + aVel * t + vec3(0.0, -1.6, 0.0) * t * t * 0.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float k = t / aLife;
    gl_PointSize = min(aSize * uScale / -mv.z * (1.0 - 0.4 * k), 200.0);
    vColor = aColor;
    vAlpha = (1.0 - k) * (1.0 - k) * (0.7 + 0.3 * sin(t * 23.0 + aBorn * 40.0));
  }
`;
const sparkFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float core = exp(-dot(q, q) * 9.0);
    float cross = exp(-abs(q.x) * 26.0) * exp(-q.y * q.y * 3.0) + exp(-abs(q.y) * 26.0) * exp(-q.x * q.x * 3.0);
    float a = (core + cross * 0.55) * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

/** A soft round light, for the flash, the glow over the open gift and behind the pass. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  if (g) {
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    r.addColorStop(0, "rgb(255 248 228 / 1)");
    r.addColorStop(0.18, "rgb(255 220 150 / 0.75)");
    r.addColorStop(0.5, "rgb(230 170 90 / 0.22)");
    r.addColorStop(1, "rgb(200 140 80 / 0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(c);
}

/**
 * The faces of the tiles near the front, kept in one texture of 256×144 cells and drawn the moment a tile needs one:
 * as the rows roll, a new name comes in at the end of each row and one leaves. A cell not used lately is drawn over.
 */
class FaceAtlas {
  readonly texture: THREE.DataTexture;
  readonly cols: number;
  readonly cells: number;
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly source: THREE.CanvasTexture;
  private readonly cellOf = new Map<string, number>();
  private readonly idOf: (string | null)[];
  private readonly used: Int32Array;
  private queue: DrawPoolEntry[] = [];
  private readonly queued = new Set<string>();
  private readonly at = new THREE.Vector2();
  /** Cell 0 holds the mark on the tickets' backs (drawn first); faces use the rest. */
  private fresh = 1;
  private backDrawn = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly fonts: Fonts,
    width = 4096,
    height = 2048,
  ) {
    this.cols = Math.floor(width / FACE_W);
    this.cells = this.cols * Math.floor(height / FACE_H);
    this.idOf = new Array(this.cells).fill(null);
    this.used = new Int32Array(this.cells).fill(-1);
    this.canvas.width = FACE_W;
    this.canvas.height = FACE_H;
    const ctx = this.canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) throw new Error("no 2d canvas");
    this.ctx = ctx;
    this.source = new THREE.CanvasTexture(this.canvas);
    this.texture = new THREE.DataTexture(null, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.source.dataReady = false;
    this.texture.needsUpdate = true;
  }

  get uv(): THREE.Vector2 {
    return new THREE.Vector2(FACE_W / this.texture.image.width, FACE_H / this.texture.image.height);
  }

  /** A new round of asking: the tiles ask again for what they need, the nearest the light first. */
  restart() {
    this.queue = [];
    this.queued.clear();
  }

  /** The cell with this person's face, or -1 while it is still to be drawn (it is then asked for). */
  cell(e: DrawPoolEntry, frame: number): number {
    const c = this.cellOf.get(e[0]);
    if (c !== undefined) {
      this.used[c] = frame;
      return c;
    }
    if (!this.queued.has(e[0])) {
      this.queued.add(e[0]);
      this.queue.push(e);
    }
    return -1;
  }

  /** Draws up to `budget` faces asked for; how many it drew. */
  pump(budget: number, frame: number): number {
    let drawn = 0;
    if (!this.backDrawn) {
      drawBack(this.ctx, this.fonts);
      this.at.set(0, 0);
      this.renderer.copyTextureToTexture(this.source, this.texture, null, this.at);
      this.backDrawn = true;
      drawn++;
    }
    while (drawn < budget && this.queue.length) {
      const e = this.queue.shift() as DrawPoolEntry;
      this.queued.delete(e[0]);
      if (this.cellOf.has(e[0])) continue;
      const c = this.free(frame);
      if (c < 0) break;
      const old = this.idOf[c];
      if (old) this.cellOf.delete(old);
      drawFace(this.ctx, e, this.fonts);
      this.at.set((c % this.cols) * FACE_W, Math.floor(c / this.cols) * FACE_H);
      this.renderer.copyTextureToTexture(this.source, this.texture, null, this.at);
      this.cellOf.set(e[0], c);
      this.idOf[c] = e[0];
      this.used[c] = frame;
      drawn++;
    }
    return drawn;
  }

  /** A cell to draw into: one never used, else the one unused longest (never one in use this frame). */
  private free(frame: number): number {
    if (this.fresh < this.cells) return this.fresh++;
    let best = -1;
    let oldest = frame;
    for (let c = 1; c < this.cells; c++) {
      if (this.used[c] < oldest) {
        oldest = this.used[c];
        best = c;
      }
    }
    return best;
  }

  dispose() {
    this.texture.dispose();
    this.source.dispose();
  }
}

interface Show {
  card: DrawCardPublic;
  start: number;
  seat: () => DOMRect | null;
  onSeat: () => void;
  resolve: () => void;
  timers: number[];
  risen: { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number } | null;
  /** Where the winner's tile was on the wall when the light landed on it (where it leaves from), and its turn. */
  from: THREE.Vector3;
  turn: number;
  /** Where the pass goes down to: the seat on the page. */
  seatRect: DOMRect | null;
  burst: boolean;
  /** The grand opening's embers, rising before its burst, and the card's own burst as it lands. */
  embers: boolean;
  cardBurst: boolean;
  /** Where the reveal waits to be opened by hand (seconds from the stop; null: it never waits), and whether it has been. */
  hold: number | null;
  opened: boolean;
  seated: boolean;
}

/** The camera's view: set back just far enough for the wall's ten columns to fill the screen's width (resize). */
const FOV = 30;
/**
 * The gift, between the wall and the room: in the room's own view, 7.2 units away, a little below the middle of the
 * view (between the words and the seats), so its open top and the pass rising from it stay clear of the words.
 */
const GIFT_DIST = 7.2;
const GIFT_BELOW = 0.44;
const GIFT_SCALE = 0.58;
const GIFT_YAW = -0.62;
const GIFT_TILT = 0.36;
/**
 * The golden envelope, between the wall and the room: in the room's own view, below the middle of the view (the card
 * rises out of it into the view's upper half, clear of the words).
 */
/**
 * The grand opening's pack: in the middle of the screen (the owner, 2026-11-12: "too high, bring it a little lower";
 * it had been the view's middle, nearer the words, which are faded while it shows), near enough to fill most of it.
 */
const PACK_DIST = 6.4;
/** Where the card spins in from, deep in the dark. */
const CARD_FAR = 34;
const ENV_DIST = 6.6;
const ENV_BELOW = 0.3;
const ENV_SCALE = 0.74;
/** The pass, world units: 2048 × 1000 pixels. */
const PASS_WORLD_W = 2.2;
const PASS_WORLD_H = (PASS_WORLD_W * PASS_H) / PASS_W;
/** Where the pass holds the screen: far enough from the room to be just over half its width, on the view's middle. */
const HOLD_DIST = 4.28;
const HOLD_BELOW = 0.03;
/** Rows of names the view can hold at most (a tall screen's). */
const MAX_ROWS = 18;

export class WallStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 90);
  private readonly grid = GRID;
  /** Every tile the screen can show (its rows, each a row's places), placed each frame on the CPU. */
  private readonly cap = MAX_ROWS * (GRID.cols + 2);
  private readonly tilesGeometry: THREE.InstancedBufferGeometry;
  private readonly posArr: Float32Array;
  private readonly cellArr: Float32Array;
  private readonly flagArr: Float32Array;
  private readonly posAttr: THREE.InstancedBufferAttribute;
  private readonly cellAttr: THREE.InstancedBufferAttribute;
  private readonly flagAttr: THREE.InstancedBufferAttribute;
  private readonly flipArr: Float32Array;
  private readonly flipAttr: THREE.InstancedBufferAttribute;
  private readonly litArr: Float32Array;
  private readonly litAttr: THREE.InstancedBufferAttribute;
  /** When the light last passed over each box (seconds; key "row:column"), for its trail. */
  private readonly litAt = new Map<string, number>();
  /** The rows of names (every one inside the view, seen whole), and the first one's height on the wall. */
  private rowsShown = 4;
  private yTop = 0;
  /** The middle of the view, up the screen (-1 at its foot, 1 at its top): the gift and the pass are placed by it. */
  private viewMid = 0.18;
  /** Where the gift sits: in the room's own view, so it is the same on any screen. */
  private readonly giftAt = new THREE.Vector3();
  /** The golden envelope (./envelope.ts), where it is shown, and its front, drawn for each winner (round and seat). */
  private readonly envelope: Envelope;
  private readonly envAt = new THREE.Vector3();
  private readonly packAt = new THREE.Vector3();
  /** The camera's distance from the wall as it is set (resize); the jolts shake it about there. */
  private camDist = 10;
  private readonly envCanvas = document.createElement("canvas");
  private readonly envTex: THREE.CanvasTexture;
  private readonly atlas: FaceAtlas;
  private readonly tileU: Record<string, THREE.IUniform>;
  private readonly frameU: Record<string, THREE.IUniform>;
  private readonly bgU: Record<string, THREE.IUniform>;
  private readonly bokehU: Record<string, THREE.IUniform>;
  private readonly sparkU: Record<string, THREE.IUniform>;
  private readonly passU: Record<string, THREE.IUniform>;
  private readonly heroU: Record<string, THREE.IUniform>;
  private readonly hero: THREE.Mesh;
  private readonly heroCanvas = document.createElement("canvas");
  private readonly heroTex: THREE.CanvasTexture;
  private readonly gift: Gift;
  private readonly tagCanvas = document.createElement("canvas");
  private readonly tagTex: THREE.CanvasTexture;
  private readonly passGroup = new THREE.Group();
  private readonly passCanvas = document.createElement("canvas");
  private readonly passSmall = document.createElement("canvas");
  private readonly passTex: THREE.CanvasTexture;
  /** The pass on the page (the same canvas), its glow, and the light that passes over its foil. */
  private readonly liftRoot = document.createElement("div");
  private readonly liftCard = document.createElement("div");
  private readonly liftGlow = document.createElement("div");
  private readonly liftBand = document.createElement("div");
  /** The departures board (./board.ts) and the flash of gold as the ticket checks in, on the page under the pass. */
  private readonly board: Board;
  private readonly boardFlash = document.createElement("div");
  /** The grand opening on the page: the golden rays behind the card, and the flash over everything. */
  private readonly walk = document.createElement("div");
  private readonly rays = document.createElement("div");
  private readonly walkFlash = document.createElement("div");
  /** The grand opening in the scene (./grand.ts): the pack, the details cast in gold, the spotlights, the flare, the shock ring. */
  private readonly grandPack: GoldPack;
  private readonly plates: GoldPlate[] = [];
  private readonly plateCanvases = [document.createElement("canvas"), document.createElement("canvas"), document.createElement("canvas")];
  private readonly plateTex: THREE.CanvasTexture[] = [];
  private readonly beams: LightBeams;
  private readonly pillar: FlarePillar;
  private readonly ring: ShockRing;
  private readonly style: "walk" | "envelope" | "board" | "gift";
  private liftW = 0;
  /** The person whose gift and pass are made (prepare, make), one still being made, and the steps left. */
  private made: string | null = null;
  private pending: DrawCardPublic | null = null;
  private steps: (() => void)[] = [];
  private readonly passHalo: THREE.Sprite;
  private readonly flash: THREE.Sprite;
  private readonly giftHalo: THREE.Sprite;
  private readonly sparks: THREE.Points;
  private readonly frameMesh: THREE.Mesh;
  private readonly owned: { dispose(): void }[] = [];
  private readonly resizeWatch: ResizeObserver;

  private rows: DrawPoolEntry[] = [];
  private gold: ReadonlySet<string> = new Set();
  /** A wall read while a draw or a gift was on (or one that would change the names in view), put in at the next draw. */
  private waiting: { entries: DrawPoolEntry[]; gold: ReadonlySet<string> } | null = null;
  /** Each row's stretches of names (index: the row, 0 at the top). */
  private segs: Segment[][] = [];
  /** Where the rows have rolled to (columns; fractional while they move), and their pace while they wait. */
  private p = 0;
  private drift = 0;
  /** A draw: since when, its roll (once the server has answered), the light's steps, the person drawn's box. */
  private run: Run | null = null;
  /** The box of light: the box it is on and the one it came from, when it stepped (seconds from the press), its glide. */
  /** The light: whether it is on, the tickets it lands on and when (seconds from the press), and the time now. */
  private light: { on: boolean; cells: Cell[]; times: number[]; t: number } = { on: false, cells: [{ r: 0, c: 0 }], times: [0], t: Infinity };
  /** When the light last landed on a ticket (ms), for its flash and the ticket's little start, and which jump that was. */
  private landFlash = 0;
  private jump = -1;
  /** When the wall last came to rest (it rolls on slowly a moment later), and the last frame's time. */
  private restSince = performance.now();
  private lastFrame = performance.now();
  private opened = false;
  /**
   * How the tickets rest between draws: face down, the wall's gold backs (the owner, 2026-11-12: "after the winner ...
   * back again to gold ... while clicking Draw it has to show"), from the moment the screen opens (never an empty
   * ticket while the names load) and again after every winner; face up only from a landing to the end of its reveal.
   * `at`: when the wave into that state began (ms; -Infinity: already there), `k0` its first column.
   */
  private turn = { down: true, at: -Infinity, k0: 0 };
  /**
   * The room's hand on the wall between draws: held (and where, when), the pace it lets go with (columns a second,
   * slowing), and a wheel's columns still to move.
   */
  private hand = { held: false, x: 0, at: 0, v: 0, wheel: 0 };
  /** Whether Draw has been opened (onOpen: the names in and the practice pass made), and that pass. */
  private openDone = false;
  private warmed = false;
  private show: Show | null = null;
  private dim = { from: 0, to: 0, start: 0, T: 1 };
  private idle = 1;
  /** The winner's box while it is out of the wall as a gift. */
  private hidden: Cell | null = null;
  private slotsDirty = true;
  private frameNo = 0;
  private raf = 0;
  private dog = 0;
  private warmTimer = 0;
  private readonly born = performance.now();
  private lastNow = 0;
  private gaps: number[] = [];
  private slowChecked = false;
  private disposed = false;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpV2 = new THREE.Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: StageOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance", stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const keep = <T extends { dispose(): void }>(x: T) => {
      this.owned.push(x);
      return x;
    };

    // Reflections for the gift's paper and gold ribbon: a soft studio, made here, no file to load.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = keep(pmrem.fromScene(room, 0.04)).texture;
    room.dispose();
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xfff1dc, 1.7);
    key.position.set(3, 6, 9);
    const rim = new THREE.DirectionalLight(0xffc56e, 1.6);
    rim.position.set(-6, 3, -5);
    this.scene.add(key, rim);

    // The room: warm black, a golden haze behind the wall.
    this.bgU = { uRes: { value: new THREE.Vector2(16, 9) }, uTime: { value: 0 }, uDark: { value: 0 } };
    const bgGeometry = keep(new THREE.BufferGeometry());
    bgGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const bg = new THREE.Mesh(
      bgGeometry,
      keep(
        new THREE.ShaderMaterial({
          uniforms: this.bgU,
          vertexShader: "varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }",
          fragmentShader: backgroundFragment,
          depthTest: false,
          depthWrite: false,
        }),
      ),
    );
    bg.frustumCulled = false;
    bg.renderOrder = -10;
    this.scene.add(bg);

    // Out-of-focus lights in the room, drifting slowly, behind the wall and a few in front of it.
    const rnd = seeded(20261111);
    const N = 46;
    const pos = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const color = new Float32Array(N * 3);
    const phase = new Float32Array(N);
    const alpha = new Float32Array(N);
    const tints = [
      [1.0, 0.78, 0.42],
      [1.0, 0.86, 0.6],
      [0.9, 0.62, 0.3],
      [1.0, 0.95, 0.85],
    ];
    for (let i = 0; i < N; i++) {
      const front = i % 7 === 0;
      pos[i * 3] = (rnd() - 0.5) * (front ? 14 : 44);
      pos[i * 3 + 1] = (rnd() - 0.5) * (front ? 7 : 22) + 1;
      pos[i * 3 + 2] = front ? 6 + rnd() * 3 : -22 + rnd() * 16;
      size[i] = front ? 0.5 + rnd() * 0.7 : 0.8 + rnd() * 2.6;
      const t = tints[i % 9 === 4 ? 3 : Math.floor(rnd() * 3)];
      color.set(t, i * 3);
      phase[i] = rnd() * 6.283;
      alpha[i] = front ? 0.07 + rnd() * 0.05 : 0.12 + rnd() * 0.2;
    }
    const bokehGeometry = keep(new THREE.BufferGeometry());
    bokehGeometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    bokehGeometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    bokehGeometry.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    bokehGeometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    bokehGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    this.bokehU = { uTime: { value: 0 }, uScale: { value: 500 }, uDark: { value: 0 } };
    const bokeh = new THREE.Points(
      bokehGeometry,
      keep(new THREE.ShaderMaterial({ uniforms: this.bokehU, vertexShader: bokehVertex, fragmentShader: bokehFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
    );
    bokeh.frustumCulled = false;
    bokeh.renderOrder = -5;
    this.scene.add(bokeh);

    // The wall: one plane, drawn once for every tile the screen shows, each placed on the CPU every frame.
    this.atlas = new FaceAtlas(this.renderer, opts.fonts);
    this.owned.push(this.atlas);
    const plane = keep(new THREE.PlaneGeometry(this.grid.tileW, this.grid.tileH));
    const geometry = keep(new THREE.InstancedBufferGeometry());
    geometry.index = plane.index;
    geometry.setAttribute("position", plane.getAttribute("position"));
    geometry.setAttribute("uv", plane.getAttribute("uv"));
    this.posArr = new Float32Array(this.cap * 3);
    this.cellArr = new Float32Array(this.cap).fill(-1);
    this.flagArr = new Float32Array(this.cap);
    this.posAttr = new THREE.InstancedBufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage);
    this.cellAttr = new THREE.InstancedBufferAttribute(this.cellArr, 1).setUsage(THREE.DynamicDrawUsage);
    this.flagAttr = new THREE.InstancedBufferAttribute(this.flagArr, 1).setUsage(THREE.DynamicDrawUsage);
    this.flipArr = new Float32Array(this.cap);
    this.flipAttr = new THREE.InstancedBufferAttribute(this.flipArr, 1).setUsage(THREE.DynamicDrawUsage);
    this.litArr = new Float32Array(this.cap);
    this.litAttr = new THREE.InstancedBufferAttribute(this.litArr, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aPos", this.posAttr);
    geometry.setAttribute("aCell", this.cellAttr);
    geometry.setAttribute("aFlag", this.flagAttr);
    geometry.setAttribute("aLit", this.litAttr);
    geometry.setAttribute("aFlip", this.flipAttr);
    geometry.instanceCount = 0;
    this.tilesGeometry = geometry;
    this.tileU = {
      uTile: { value: new THREE.Vector2(this.grid.tileW, this.grid.tileH) },
      uCurve: { value: this.grid.curve },
      uAtlas: { value: this.atlas.texture },
      uAtlasCols: { value: this.atlas.cols },
      uCellUV: { value: this.atlas.uv },
      uRes: { value: new THREE.Vector2(1920, 1080) },
      uSel: { value: new THREE.Vector3(0, 0, 0) },
      uPop: { value: 1 },
      uStub: { value: STUB_AT },
      uBackCell: { value: new THREE.Vector2(0, 0) },
      uDim: { value: 0 },
      uTime: { value: 0 },
      uIdle: { value: 1 },
      uLock: { value: 0 },
      uDark: { value: 0 },
    };
    const tiles = new THREE.Mesh(geometry, keep(new THREE.ShaderMaterial({ uniforms: this.tileU, vertexShader: tileVertex, fragmentShader: tileFragment, alphaToCoverage: true, side: THREE.DoubleSide })));
    tiles.frustumCulled = false;
    this.scene.add(tiles);

    // The box of light, a gold frame: where its last step lands is who is drawn.
    const frameSize = new THREE.Vector2(this.grid.tileW + 0.8, this.grid.tileH + 0.8);
    this.frameU = { uSize: { value: frameSize }, uTile: { value: new THREE.Vector2(this.grid.tileW, this.grid.tileH) }, uGlow: { value: 1 }, uAlpha: { value: 0 } };
    this.frameMesh = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(frameSize.x, frameSize.y)),
      keep(new THREE.ShaderMaterial({ uniforms: this.frameU, vertexShader: plainVertex, fragmentShader: frameFragment, transparent: true, depthWrite: false })),
    );
    this.frameMesh.renderOrder = 3;
    this.scene.add(this.frameMesh);

    // The winner's tile as it leaves the wall: drawn four times larger, so it stays sharp as it comes near.
    this.heroCanvas.width = FACE_W * 2;
    this.heroCanvas.height = FACE_H * 2;
    this.heroTex = keep(new THREE.CanvasTexture(this.heroCanvas));
    this.heroTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.heroU = {
      uMap: { value: this.heroTex },
      uAtlas: { value: this.atlas.texture },
      uBackCell: { value: this.tileU.uBackCell.value },
      uCellUV: { value: this.atlas.uv },
      uTile: { value: new THREE.Vector2(this.grid.tileW, this.grid.tileH) },
      uGlow: { value: 0 },
      uShade: { value: 0 },
      uStub: { value: STUB_AT },
      uTime: { value: 0 },
    };
    this.hero = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(this.grid.tileW, this.grid.tileH)),
      keep(new THREE.ShaderMaterial({ uniforms: this.heroU, vertexShader: plainVertex, fragmentShader: heroFragment, alphaToCoverage: true, side: THREE.DoubleSide })),
    );
    this.hero.visible = false;
    this.hero.renderOrder = 4;
    this.scene.add(this.hero);

    // The gift: its paper drawn once, its tag drawn for each winner.
    const wrapCanvas = document.createElement("canvas");
    wrapCanvas.width = WRAP;
    wrapCanvas.height = WRAP;
    const wctx = wrapCanvas.getContext("2d");
    if (wctx) drawWrap(wctx);
    const wrap = keep(new THREE.CanvasTexture(wrapCanvas));
    wrap.colorSpace = THREE.SRGBColorSpace;
    wrap.wrapS = THREE.RepeatWrapping;
    wrap.wrapT = THREE.RepeatWrapping;
    wrap.repeat.set(1.5, 1.5);
    wrap.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.tagCanvas.width = TAG_W;
    this.tagCanvas.height = TAG_H;
    this.tagTex = keep(new THREE.CanvasTexture(this.tagCanvas));
    this.tagTex.colorSpace = THREE.SRGBColorSpace;
    this.tagTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const insideCanvas = document.createElement("canvas");
    insideCanvas.width = INSIDE;
    insideCanvas.height = INSIDE;
    const ictx = insideCanvas.getContext("2d");
    if (ictx) drawInside(ictx);
    const inside = keep(new THREE.CanvasTexture(insideCanvas));
    inside.colorSpace = THREE.SRGBColorSpace;
    this.gift = new Gift(wrap, this.tagTex, inside);
    this.owned.push(this.gift);
    this.gift.root.scale.setScalar(GIFT_SCALE);
    this.scene.add(this.gift.root);

    const glow = keep(glowTexture());

    // The golden envelope: its flap, lining and seal drawn once; its front drawn for each winner (makeSteps).
    const paper = (canvas: HTMLCanvasElement, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = false) => {
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) draw(ctx);
      const tex = keep(new THREE.CanvasTexture(canvas));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      if (repeat) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
      }
      return tex;
    };
    this.envTex = paper(this.envCanvas, ENV_PX.w, ENV_PX.h, (ctx) => drawEnvelopePocket(ctx, { round: 1, seat: 1 }, opts.fonts));
    const envFlap = paper(document.createElement("canvas"), ENV_PX.w, ENV_PX.flapH, (ctx) => drawEnvelopeFlap(ctx));
    const envLining = paper(document.createElement("canvas"), LINING_PX, LINING_PX, (ctx) => drawLining(ctx), true);
    envLining.repeat.set(2.4, 1.5);
    const envSeal = paper(document.createElement("canvas"), WAX_PX, WAX_PX, (ctx) => drawWaxSeal(ctx, opts.fonts));
    this.envelope = new Envelope({ pocket: this.envTex, flap: envFlap, lining: envLining, seal: envSeal, light: glow });
    this.owned.push(this.envelope);
    this.envelope.root.scale.setScalar(ENV_SCALE);
    this.scene.add(this.envelope.root);
    for (const t of [this.envTex, envFlap, envLining, envSeal]) this.renderer.initTexture(t);

    // The grand opening: the pack's print drawn once; the details' letters drawn for each winner (makeSteps).
    const packInk = paper(document.createElement("canvas"), PACK_PX.w, PACK_PX.h, (ctx) => drawPack(ctx, opts.fonts));
    packInk.colorSpace = THREE.NoColorSpace;
    this.grandPack = new GoldPack(packInk);
    this.owned.push(this.grandPack);
    this.scene.add(this.grandPack.root);
    this.plateCanvases.forEach((canvas, k) => {
      const sample = [["Trip ID", "TRIP-26-00000", ""], ["From", "Chennai", "India"], ["Winner", "AFFHAN INTERNATIONAL", ""]][k];
      const tex = paper(canvas, PLATE_PX.w, PLATE_PX.h, (ctx) => drawPlate(ctx, sample[0], sample[1], sample[2], opts.fonts));
      tex.colorSpace = THREE.NoColorSpace;
      this.plateTex.push(tex);
      const wide = k === 2 ? 6.6 : 5.6;
      const plate = new GoldPlate(tex, wide, (wide * PLATE_PX.h) / PLATE_PX.w, PLATE_PX.w, PLATE_PX.h);
      this.plates.push(plate);
      this.owned.push(plate);
      this.scene.add(plate.mesh);
    });
    this.beams = new LightBeams();
    this.pillar = new FlarePillar();
    this.ring = new ShockRing();
    this.owned.push(this.beams, this.pillar, this.ring);
    this.scene.add(this.beams.root, this.pillar.mesh, this.ring.mesh);
    for (const t of [packInk, ...this.plateTex]) this.renderer.initTexture(t);
    this.flash = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, toneMapped: false })));
    this.flash.visible = false;
    this.flash.renderOrder = 12;
    this.scene.add(this.flash);
    this.giftHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })));
    this.giftHalo.visible = false;
    this.giftHalo.renderOrder = 6;
    this.scene.add(this.giftHalo);

    // The boarding pass, and a soft gold light behind it.
    this.passCanvas.width = PASS_W;
    this.passCanvas.height = PASS_H;
    // The scene's pass is never more than half the screen wide: it is drawn from a half-size copy, a quarter of the
    // pixels to send to the GPU at the stop (the page's pass is the full canvas).
    this.passSmall.width = PASS_W / 2;
    this.passSmall.height = PASS_H / 2;
    this.passTex = keep(new THREE.CanvasTexture(this.passSmall));
    this.passTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.passTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.passTex.premultiplyAlpha = true;
    this.passU = { uMap: { value: this.passTex }, uAlpha: { value: 1 }, uSweep: { value: -1 }, uWarm: { value: 0 } };
    const pass = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(PASS_WORLD_W, PASS_WORLD_H)),
      keep(new THREE.ShaderMaterial({ uniforms: this.passU, vertexShader: plainVertex, fragmentShader: passFragment, transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide })),
    );
    pass.renderOrder = 9;
    this.passHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false })));
    this.passHalo.scale.set(PASS_WORLD_W * 1.9, PASS_WORLD_H * 2.4, 1);
    this.passHalo.position.z = -0.08;
    this.passHalo.renderOrder = 8;
    this.passGroup.add(this.passHalo, pass);
    this.passGroup.visible = false;
    this.scene.add(this.passGroup);
    // Its place on the page, over everything: the very canvas the scene's pass is drawn from.
    this.liftRoot.className = "lw-lift";
    this.liftRoot.hidden = true;
    this.liftGlow.className = "lw-lift-glow";
    this.liftCard.className = "lw-lift-pass";
    this.liftBand.className = "lw-lift-band";
    const foil = document.createElement("div");
    foil.className = "lw-lift-foil";
    foil.appendChild(this.liftBand);
    this.liftCard.append(this.passCanvas, foil);
    this.liftRoot.append(this.liftGlow, this.liftCard);
    this.style = opts.reveal ?? "walk";
    this.board = new Board(opts.fonts);
    this.board.el.hidden = true;
    this.boardFlash.className = "lw-board-flash";
    this.boardFlash.style.opacity = String(LIFT_READY);
    opts.lift.append(this.board.el, this.boardFlash);
    this.walk.className = "lw-walk";
    this.walk.hidden = true;
    this.rays.className = "lw-walk-rays";
    this.walk.appendChild(this.rays);
    opts.lift.appendChild(this.walk);
    opts.lift.appendChild(this.liftRoot);
    this.walkFlash.className = "lw-walk-flash";
    this.walkFlash.style.opacity = "0";
    opts.lift.appendChild(this.walkFlash);

    // Sparks from the open gift, and gold dust round the pass while it holds the screen.
    const S = 380;
    const sparkGeometry = keep(new THREE.BufferGeometry());
    sparkGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(S * 3), 3));
    sparkGeometry.setAttribute("aVel", new THREE.BufferAttribute(new Float32Array(S * 3), 3));
    sparkGeometry.setAttribute("aBorn", new THREE.BufferAttribute(new Float32Array(S), 1));
    sparkGeometry.setAttribute("aLife", new THREE.BufferAttribute(new Float32Array(S), 1));
    sparkGeometry.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(S), 1));
    sparkGeometry.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(S * 3), 3));
    this.sparkU = { uT: { value: -10 }, uScale: { value: 500 } };
    this.sparks = new THREE.Points(
      sparkGeometry,
      keep(new THREE.ShaderMaterial({ uniforms: this.sparkU, vertexShader: sparkVertex, fragmentShader: sparkFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
    );
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 11;
    this.sparks.visible = false;
    this.scene.add(this.sparks);

    this.resizeWatch = new ResizeObserver(() => this.resize());
    if (canvas.parentElement) this.resizeWatch.observe(canvas.parentElement);
    this.resize();

    // Every shader made ready as the screen opens, and the textures that never change sent to the GPU: the gift's
    // paper and ribbon took the GPU 0.4 s the first time (measured), which would have held the screen still just as
    // the gift appeared. Lights count only when they show, so the gift (its lamp) shows for the call.
    for (const t of [wrap, inside, glow]) this.renderer.initTexture(t);
    this.gift.root.visible = true;
    this.envelope.root.visible = true;
    this.hero.visible = true;
    const grand = [this.grandPack.root, ...this.plates.map((p) => p.mesh), this.beams.root, this.pillar.mesh, this.ring.mesh];
    for (const o of grand) o.visible = true;
    void this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
    for (const o of grand) o.visible = false;
    this.gift.root.visible = false;
    this.envelope.root.visible = false;
    this.hero.visible = false;
    // A practice pass, drawn once while the screen opens and nothing moves: the canvas's own first-time work (126 ms,
    // measured) is then done before the first winner's pass is drawn.
    this.warmTimer = window.setTimeout(() => {
      // Made behind the gold backs the screen opens on, so the longest frame it takes moves nothing anyone can see.
      this.warmed = true;
      if (this.disposed || this.run || this.show || this.steps.length) return;
      const practice: DrawCardPublic = { id: "", number: 0, tripId: "TRIP-26-00000", name: "Affhan International", city: "Chennai", country: "India", drawnAt: new Date().toISOString(), poolSize: 0, round: 1, seat: 1, out: false };
      for (const step of this.makeSteps(practice).slice(0, 7)) step();
      // The board too: its letters' tiles and a board drawn once, unseen.
      if (this.style === "board") {
        this.board.warm();
        this.board.set(practice);
        this.boardSize();
        this.board.draw(BOARD_PRINT_AT);
      }
    }, 1200);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** How many are on the wall. */
  get size(): number {
    return this.rows.length;
  }

  /** The Trip ID the light is on, while it shows. */
  framed(): string | null {
    return this.rows.length && this.light.on ? this.rows[this.personIn(this.lightCell())][0] : null;
  }

  /** Where the light is now, between boxes (row and column, fractional), and the box it is over. */
  private lightAt(): { r: number; c: number } {
    return pathAt(this.light.cells, this.light.times, this.light.t);
  }

  private lightCell(): Cell {
    const q = this.lightAt();
    return { r: Math.round(q.r), c: Math.round(q.c) };
  }

  /** Who is in a box (its row, and its column on the rolling wall), as their place on the wall. */
  private personIn(cell: Cell): number {
    this.fillRows();
    return personAt(this.segs[cell.r] ?? this.segs[0], cell.c, this.rows.length);
  }

  /** The row in the middle of the view (the upper of two). */
  private middleRow(): number {
    return Math.floor((this.rowsShown - 1) / 2);
  }

  /**
   * The wall's people (in Trip ID order) and its winners (gold at once). The first wall lays the rows out, the first
   * clear row opening with TRIP-26-00001. A wall that would change the names in view is kept for the next draw, which
   * brings a new screen of names in anyway.
   */
  setRows(entries: DrawPoolEntry[], gold: ReadonlySet<string>) {
    this.gold = gold;
    this.slotsDirty = true;
    if (!this.opened) {
      if (!entries.length) return;
      this.rows = entries;
      this.segs = openingRows(this.rowsShown, entries.length, this.p);
      this.opened = true;
      this.opts.onRest?.(entries[0][0]);
      return;
    }
    const n = this.rows.length;
    const same = n === entries.length && n > 0 && entries[0][0] === this.rows[0][0] && entries[n - 1][0] === this.rows[n - 1][0];
    if (this.run || this.show || !same) {
      this.waiting = { entries, gold };
      return;
    }
    this.rows = entries;
  }

  /** Rows for every row the screen shows (a taller screen than the wall opened on gets rows of its own). */
  private fillRows() {
    const n = Math.max(1, this.rows.length);
    while (this.segs.length < this.rowsShown) this.segs.push([{ from: Math.floor(this.p) - 1, start: Math.floor(Math.random() * n) }]);
  }

  /** The light on this Trip ID in a clear box, at rest (a draw shown without the run: no stage when it was made). */
  restOn(tripId: string) {
    const n = this.rows.length;
    if (this.run || !n) return;
    const i = placeOfTrip(this.rows, tripId);
    if (this.rows[i]?.[0] !== tripId) return;
    this.p = Math.round(this.p);
    this.drift = 0;
    this.fillRows();
    const r = this.middleRow();
    const c = this.p + Math.ceil(this.grid.cols / 2);
    this.segs[r].push(stretchFor(i, n, this.p - 1, c));
    this.light = { on: true, cells: [{ r, c }], times: [0], t: Infinity };
    this.landFlash = performance.now();
    // Face up, so the ticket the light is on is seen.
    if (this.turn.down) this.turn = { down: false, at: performance.now(), k0: Math.floor(this.p) };
    this.slotsDirty = true;
    this.opts.onRest?.(tripId);
  }

  /**
   * A winner shown: the light goes, and the tickets turn face down in a wave, back to the wall's gold backs for the
   * next press (the owner, 2026-11-12: "after the winner ... back again to gold"). Already on its backs (the screen
   * opening, or a draw that failed), it stays on them.
   */
  restAfter() {
    if (this.run) return;
    this.light.on = false;
    if (!this.turn.down) this.turn = { down: true, at: performance.now(), k0: Math.floor(this.p) };
    this.restSince = performance.now();
    this.slotsDirty = true;
    this.opts.onRest?.(null);
  }

  /** Someone drawn, on the wall: their place, or one made for them if they joined after the wall was read. */
  ensure(entry: DrawPoolEntry): number {
    const i = placeOfTrip(this.rows, entry[0]);
    if (this.rows[i]?.[0] === entry[0]) return i;
    this.rows = [...this.rows.slice(0, i), entry, ...this.rows.slice(i)];
    this.slotsDirty = true;
    return i;
  }

  /**
   * The press: the rows stand still and the tickets turn face down in a wave, their gold backs showing while the
   * server draws. Settles true when the light lands on someone (land), false when not (halt).
   */
  spin(): Promise<boolean> {
    this.finish();
    // A hand on the wall lets go: the draw starts from the wall's own pace.
    this.hand = { held: false, x: 0, at: 0, v: 0, wheel: 0 };
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      this.rows = w.entries;
      this.gold = w.gold;
    }
    this.fillRows();
    this.dimTo(0, 0.2);
    this.litAt.clear();
    this.light = { on: false, cells: [{ r: 0, c: 0 }], times: [0], t: 0 };
    this.slotsDirty = true;
    if (!this.openDone) {
      this.openDone = true;
      this.opts.onOpen?.();
    }
    const now = performance.now();
    // Face down for the draw: from the gold backs the wall rests on (down already, or still turning), which shuffle at
    // once, the names turning up once the shuffle is at rest (land); or, face up, in a wave from now, the names turning
    // up once the backs have shown a moment.
    const T = this.turn;
    const down = T.down ? (Number.isFinite(T.at) ? (T.at - now) / 1000 : -Infinity) : DOWN_AT;
    const allDown = Math.max(0, down + WAVE_T + FLIP_T);
    const from = ALL_DOWN + BACKS_T;
    const downK0 = T.down ? T.k0 : Math.floor(this.p);
    return new Promise((done) => {
      this.run = {
        start: now,
        done,
        p0: this.p,
        up: Infinity,
        drawn: null,
        placed: false,
        roll: null,
        roll0: Infinity,
        end: this.p,
        target: null,
        light: Infinity,
        land: Infinity,
        walk: null,
        halted: false,
        down,
        downK0,
        allDown,
        from,
        v: this.drift,
        upK0: Math.floor(this.p),
        shuffle: T.down,
        stop: Infinity,
        settled: T.down ? Infinity : 0,
      };
      this.watch(this.run);
    });
  }

  /**
   * The person drawn is known (`i`, their place on the wall): the draw's moments are set (./grid.ts drawPlan). Once
   * every ticket is face down the rows get new names (placeNames); they turn face up, the rows roll a screen on while
   * the light searches over them, and it lands on the person drawn once they are still.
   */
  land(i: number) {
    const r = this.run;
    if (!r || r.drawn !== null || r.halted || !this.rows.length) return;
    r.drawn = i;
    const ta = this.elapsed(r);
    // A shuffle stops once it has run its least and the answer is in (now, if it has run long enough); the names turn
    // up the moment every row is at rest again.
    if (r.shuffle) {
      r.stop = Math.max(SHUFFLE_MIN, ta);
      r.settled = shuffleEnd(this.rowsShown, r.stop);
      r.from = r.settled + 0.05;
    }
    const plan = drawPlan(r.p0, ta, r.from, r.v);
    r.up = plan.up;
    r.upK0 = Math.floor(r.p0 + r.v * plan.up);
    r.roll = plan.roll;
    r.roll0 = plan.roll0;
    r.end = plan.end;
    r.light = plan.light;
    r.land = plan.land;
    this.watch(r);
  }

  /**
   * Every ticket face down: each row gets a new stretch of names in Trip ID order from a random place, and the drawn
   * person's row (chosen at random) the stretch that puts them, in their own place, on a ticket the rows will bring
   * into view and stop on, chosen at random. Unseen: every ticket shows its back.
   */
  private placeNames(r: Run, i: number) {
    const n = this.rows.length;
    this.fillRows();
    const from = Math.floor(r.p0) - 1;
    const row = Math.floor(Math.random() * this.rowsShown);
    const col = r.end + 1 + Math.floor(Math.random() * this.grid.cols);
    const span = r.end + this.grid.cols + 3 - from;
    for (let k = 0; k < this.segs.length; k++) {
      if (k === row) {
        this.segs[k].push(stretchFor(i, n, from, col));
        continue;
      }
      // Nobody else's new names show the drawn person too.
      let start = Math.floor(Math.random() * n);
      for (let tries = 0; tries < 12 && n > span && mod(i - start, n) < span; tries++) start = Math.floor(Math.random() * n);
      this.segs[k].push({ from, start });
    }
    r.target = { r: row, c: col };
    r.placed = true;
    this.slotsDirty = true;
  }

  /** Nobody drawn (the draw failed): the tickets turn face up again as they were, and no light comes on. */
  halt() {
    const r = this.run;
    if (!r || r.drawn !== null || r.halted) return;
    r.halted = true;
    // From the gold backs the wall rests on, it stays on them (a shuffle comes to rest first); a press from face up
    // turns back up as it was.
    if (r.shuffle) {
      r.stop = Math.max(SHUFFLE_RAMP, this.elapsed(r));
      r.settled = shuffleEnd(this.rowsShown, r.stop);
      r.land = r.settled + 0.05;
    } else if (r.down < 0) {
      r.land = this.elapsed(r) + 0.05;
    } else {
      r.up = Math.max(r.allDown + 0.1, this.elapsed(r) + 0.05);
      r.land = r.up + WAVE_T + FLIP_T + 0.05;
    }
    this.watch(r);
  }

  /**
   * The run over: on its landing, or at once (frames stopped: the watchdog, or a new press), where it would have
   * ended: the rows at rest, the light on the person drawn.
   */
  finish = () => {
    const r = this.run;
    if (!r) return;
    this.run = null;
    window.clearTimeout(this.dog);
    const target = r.target;
    const landed = !r.halted && r.placed && !!target;
    const at = this.elapsed(r);
    this.p = landed ? r.end : r.roll && Number.isFinite(r.roll0) && at >= r.roll0 ? rollAt(r.roll, at - r.roll0).p : r.p0 + r.v * at;
    if (landed && target) {
      const w = r.walk;
      const last = w?.cells[w.cells.length - 1];
      this.light = w && last && last.r === target.r && last.c === target.c ? { on: true, cells: w.cells, times: w.times, t: Infinity } : { on: true, cells: [target], times: [0], t: Infinity };
      this.landFlash = performance.now();
    } else this.light.on = false;
    // The tickets rest as the run left them: face up once they turned up (the winner's reveal shows over the names,
    // and the wall goes back to gold after it: restAfter), face down when they never did (a draw that failed).
    this.turn = { down: !Number.isFinite(r.up), at: -Infinity, k0: Math.floor(this.p) };
    // A draw that never turned the names up (it failed) leaves the backs rolling on at their pace, never stopped; a
    // landing holds the rows still for the reveal (they roll on again after it: restAfter).
    const rollOn = !landed && this.turn.down && r.v > 0;
    this.drift = rollOn ? r.v : 0;
    this.restSince = performance.now() - (rollOn ? (DRIFT_AFTER + DRIFT_EASE) * 1000 : 0);
    this.slotsDirty = true;
    this.opts.onRest?.(this.framed());
    r.done(landed);
  };

  /**
   * The person drawn, known while the rows still roll (the server has answered): their gift's tag and their pass are
   * made while nothing moves (the gold backs held, or the light holding on a ticket on the still wall), when a frame
   * that takes longer moves nothing anyone can see, rather than at the stop, where it held the gold frame's flare
   * still for a tenth of a second (measured).
   */
  prepare(card: DrawCardPublic) {
    if (this.made === card.id || this.pending?.id === card.id) return;
    this.pending = card;
    this.steps = this.makeSteps(card);
  }

  /**
   * Making the person's tile, tag and pass, one step a frame (so no one frame carries it all): the tile and the tag,
   * then the pass, then its copy sent to the GPU, then the page's pass laid out, unseen.
   */
  private makeSteps(card: DrawCardPublic): (() => void)[] {
    return [
      () => {
        const hctx = this.heroCanvas.getContext("2d");
        if (hctx) drawFace(hctx, [card.tripId, card.name, card.city, card.country], this.opts.fonts, 2);
        this.heroTex.needsUpdate = true;
        const tctx = this.tagCanvas.getContext("2d");
        if (tctx) drawTag(tctx, card.tripId, this.opts.fonts);
        this.tagTex.needsUpdate = true;
        this.renderer.initTexture(this.heroTex);
        this.renderer.initTexture(this.tagTex);
      },
      () => {
        // The grand opening's first detail, cast in gold: their Trip ID.
        if (this.style !== "walk") return;
        const ctx = this.plateCanvases[0].getContext("2d");
        if (ctx) drawPlate(ctx, "Trip ID", card.tripId, "", this.opts.fonts);
        this.plateTex[0].needsUpdate = true;
        this.renderer.initTexture(this.plateTex[0]);
      },
      () => {
        // The second: their city, and their country when it is another.
        if (this.style !== "walk") return;
        const ctx = this.plateCanvases[1].getContext("2d");
        const other = card.city && card.country && card.city.trim().toLowerCase() !== card.country.trim().toLowerCase();
        if (ctx) drawPlate(ctx, "From", card.city || card.country, other ? card.country : "", this.opts.fonts);
        this.plateTex[1].needsUpdate = true;
        this.renderer.initTexture(this.plateTex[1]);
      },
      () => {
        // The last: their name, the climax (on two lines when it is long).
        if (this.style !== "walk") return;
        const ctx = this.plateCanvases[2].getContext("2d");
        if (ctx) drawPlate(ctx, "Winner", card.name.toUpperCase(), "", this.opts.fonts);
        this.plateTex[2].needsUpdate = true;
        this.renderer.initTexture(this.plateTex[2]);
      },
      () => {
        // The envelope's front: "The Winner", and their round and seat, as an award's envelope carries its category.
        if (this.style !== "envelope") return;
        const ectx = this.envCanvas.getContext("2d");
        if (ectx) drawEnvelopePocket(ectx, card, this.opts.fonts);
        this.envTex.needsUpdate = true;
        this.renderer.initTexture(this.envTex);
      },
      () => {
        const pctx = this.passCanvas.getContext("2d");
        if (pctx) drawPass(pctx, card, this.opts.fonts, this.opts.seats);
      },
      () => {
        const sctx = this.passSmall.getContext("2d");
        if (sctx) {
          sctx.clearRect(0, 0, this.passSmall.width, this.passSmall.height);
          sctx.drawImage(this.passCanvas, 0, 0, this.passSmall.width, this.passSmall.height);
        }
        this.passTex.needsUpdate = true;
        this.renderer.initTexture(this.passTex);
      },
      () => {
        // The board with the winner's flight, laid out (its frame, labels and blank flaps drawn once)...
        if (this.style === "board") {
          this.board.set(card);
          this.boardSize();
        }
      },
      () => {
        // ...then drawn blank and put on the page in its place, too faint to see, so the browser has it ready before it
        // is shown (as the pass is). Two steps, a frame each: one alone held the gold backs still for 42 ms (measured).
        if (this.style === "board") {
          this.board.warm();
          this.board.draw(0);
          this.placeBoard(LIFT_READY, 1);
        }
      },
      () => {
        // Kept on the page at an opacity no eye can see, so the browser has it ready: showing it for the first time at
        // the hand-over cost the TV a frame (measured, 2026-11-11).
        this.liftCard.style.opacity = String(LIFT_READY);
        this.liftGlow.style.opacity = "0";
        this.liftSize();
        this.liftRoot.hidden = false;
        this.made = card.id;
        this.pending = null;
      },
    ];
  }

  /** Every step still to make for this person, now (the reveal is starting). */
  private make(card: DrawCardPublic) {
    if (this.pending?.id !== card.id) {
      this.pending = card;
      this.steps = this.makeSteps(card);
    }
    while (this.steps.length) (this.steps.shift() as () => void)();
  }

  /**
   * The person drawn, shown: their tile becomes a gift, the gift opens, their boarding pass rises from it and holds
   * the screen for three seconds, then goes down into its seat (`seat`: where that seat is on the page; `onSeat` when
   * it gets there). Settles when it is over; nothing in it waits on a frame being drawn.
   */
  present(card: DrawCardPublic, o: { seat: () => DOMRect | null; onSeat: () => void }): Promise<void> {
    this.endShow();
    if (this.made !== card.id) this.make(card);
    const { pos, turn } = this.cellPos(this.lightCell());
    return new Promise((resolve) => {
      const show: Show = { card, start: performance.now(), seat: o.seat, onSeat: o.onSeat, resolve, timers: [], risen: null, from: pos.clone().add(new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn)).multiplyScalar(0.06)), turn, seatRect: null, burst: false, embers: false, cardBurst: false, hold: this.style === "walk" ? TG.wait : null, opened: false, seated: false };
      this.show = show;
      // A reveal that waits to be opened has its seat and its end timed from its opening (openPack).
      if (show.hold === null) this.timeShow(show, 0);
    });
  }

  /** The reveal's seat and end, `from` seconds into it (the stop, or the moment it was opened). */
  private timeShow(show: Show, from: number) {
    show.timers.push(
      window.setTimeout(() => {
        if (this.show === show && !show.seated) {
          show.seated = true;
          show.onSeat();
        }
      }, (this.T.seat - from) * 1000),
      window.setTimeout(() => {
        if (this.show === show) this.endShow();
      }, (this.T.end - from) * 1000),
    );
  }

  /** Whether the grand opening's pack is waiting to be opened by hand. */
  get packWaiting(): boolean {
    const s = this.show;
    return !!s && s.hold !== null && !s.opened && (performance.now() - s.start) / 1000 >= TG.pack;
  }

  /**
   * The pack opened by hand (a click, a Draw key, the clicker): the reveal goes on from where it waited. False when no
   * pack is waiting (not yet landed, already opened, or none in this reveal).
   */
  openPack(): boolean {
    const s = this.show;
    if (!this.packWaiting || !s || s.hold === null) return false;
    s.opened = true;
    this.timeShow(s, Math.min(s.hold, (performance.now() - s.start) / 1000));
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.dog);
    window.clearTimeout(this.warmTimer);
    this.resizeWatch.disconnect();
    if (this.show) for (const t of this.show.timers) window.clearTimeout(t);
    this.show = null;
    this.run = null;
    this.liftRoot.remove();
    for (const x of this.owned) x.dispose();
    this.renderer.dispose();
  }

  // ---- the frame of time ----

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    try {
      this.tick(now);
    } catch (e) {
      // One bad frame never stops the screen: the next one is drawn regardless (the result never depends on it).
      console.error(e);
    }
  };

  private tick(now: number) {
    this.frameNo++;
    this.health(now);
    const time = (now - this.born) / 1000;
    const r = this.run;
    const t = r ? (now - r.start) / 1000 : 0;
    const { p } = this.position(now, r, t);
    this.p = p;
    // The drawn person's gift and pass made, a step a frame, while nothing moves (or between draws): the rows still and
    // the light not yet on, or holding on a ticket; never while the rows roll or the light jumps.
    if (this.steps.length && (!r || this.still(r, t))) (this.steps.shift() as () => void)();
    if (r) this.drawStep(r, t, now);
    this.place(this.p);
    // While a draw's tickets are face down, its new names' faces drawn ahead, so they are ready when they turn up: all
    // at once if the rows stand still (a long frame then shows nothing), a few a frame while they roll on (a long frame
    // would jolt them; a screen of faces still takes only a few frames); otherwise a few a frame, as names roll in.
    if (this.atlas.pump(r && t < r.up ? (r.v > 0 || t < r.settled ? 8 : 48) : 12, this.frameNo) > 0) this.slotsDirty = true;
    // Draw opens once the names are in and the practice pass is made, behind the gold backs the screen opens on.
    if (!this.openDone && this.opened && this.warmed) {
      this.openDone = true;
      this.opts.onOpen?.();
    }
    const quiet = !this.run && !this.show ? 1 : 0;
    this.idle += (quiet - this.idle) * 0.04;
    const u = this.tileU;
    u.uTime.value = time;
    u.uIdle.value = this.idle;
    u.uDim.value = this.dimAt(now);
    // The light: on its ticket, snapping to the next; the ticket it is on golden, those it has left fading after it.
    const sel = u.uSel.value as THREE.Vector3;
    const L = this.light;
    const since = (now - this.landFlash) / 1000;
    if (L.on) {
      const at = this.cellPos(this.lightAt());
      this.frameMesh.position.set(at.pos.x + Math.sin(at.turn) * 0.06, at.pos.y, at.pos.z + Math.cos(at.turn) * 0.06);
      this.frameMesh.rotation.set(0, at.turn, 0);
      const box = this.lightCell();
      const lit = this.cellPos(box, this.tmpV2);
      sel.set(lit.x, lit.y, 1);
      if (this.run) this.litAt.set(`${box.r}:${box.c}`, now / 1000);
    } else sel.z = 0;
    u.uPop.value = 1 + 0.07 * Math.exp(-since * 14);
    this.heroU.uTime.value = time;
    if (this.show) {
      const s = this.show;
      if (s.hold !== null && !s.opened && now - s.start > s.hold * 1000) s.start = now - s.hold * 1000;
      this.pose((now - s.start) / 1000, time);
    }
    else {
      u.uLock.value = 0;
      this.frameU.uAlpha.value = L.on ? 1 : 0;
      this.frameU.uGlow.value = 1.1 + 1.5 * Math.exp(-since * 9);
    }
    this.bgU.uTime.value = time;
    this.bokehU.uTime.value = time;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Where the rows are (columns) and their pace (columns a second) now. At a draw, its roll from the press (gathering
   * pace from their drift, so nothing jerks), to rest. Otherwise they roll on slowly (the owner: "users roll"), a moment
   * after they came to rest, getting going gently; never while a winner is shown or the light is on someone.
   */
  private position(now: number, r: Run | null, t: number): { p: number; v: number } {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (r) {
      this.drift = 0;
      // Rolling on at the press's pace until the draw's roll takes it up (never a stop at the press).
      return r.roll && t >= r.roll0 ? rollAt(r.roll, t - r.roll0) : { p: r.p0 + r.v * t, v: r.v };
    }
    // Held by hand: exactly where the hand has put it (move), nothing else moving it.
    const h = this.hand;
    if (h.held) {
      this.drift = 0;
      return { p: this.p, v: 0 };
    }
    const since = (now - this.restSince) / 1000 - DRIFT_AFTER;
    if (!this.show && !this.light.on && since > 0) this.drift = DRIFT * smooth(since, 0, DRIFT_EASE);
    else this.drift = Math.max(0, this.drift - (DRIFT / 0.8) * dt);
    // Let go: the hand's pace, slowing; the wheel's columns, eased in; the wall's own pace back under them.
    h.v *= Math.exp(-dt * FLING_FRICTION);
    if (Math.abs(h.v) < 0.005) h.v = 0;
    const wheeled = h.wheel * (1 - Math.exp(-dt * WHEEL_EASE));
    h.wheel -= wheeled;
    if (Math.abs(h.wheel) < 1e-4) h.wheel = 0;
    return { p: this.p + (this.drift + h.v) * dt + wheeled, v: this.drift + h.v };
  }

  /** Whether the room can move the wall by hand now: between draws, with its names in. */
  get movable(): boolean {
    return !this.run && !this.show && this.rows.length > 0;
  }

  /** How far the pointer moves (page pixels) for the wall to move a column, in the middle of the screen. */
  private pxPerColumn(): number {
    const r = this.canvas.getBoundingClientRect();
    const row = this.middleRow();
    const c = Math.floor(this.p) + Math.floor(this.grid.cols / 2);
    const a = this.cellPos({ r: row, c }, this.tmpV).pos.project(this.camera).x;
    const b = this.cellPos({ r: row, c: c + 1 }, this.tmpV2).pos.project(this.camera).x;
    return Math.max(20, (Math.abs(b - a) * r.width) / 2);
  }

  /** The wall taken in hand at the page's `x` (a pointer pressed on it); false while a draw is on. */
  hold(x: number): boolean {
    if (!this.movable) return false;
    this.hand = { held: true, x, at: performance.now(), v: 0, wheel: 0 };
    this.drift = 0;
    return true;
  }

  /** The hand moved to the page's `x`: the wall goes with it, exactly. */
  move(x: number) {
    const h = this.hand;
    if (!h.held) return;
    if (!this.movable) {
      h.held = false;
      return;
    }
    const now = performance.now();
    const cols = -(x - h.x) / this.pxPerColumn();
    this.p += cols;
    const dt = (now - h.at) / 1000;
    if (dt > 0) h.v = 0.6 * h.v + 0.4 * (cols / Math.max(dt, 0.004));
    h.x = x;
    h.at = now;
    this.slotsDirty = true;
  }

  /** Let go: the wall carries on at the hand's pace, slowing, and rolls on at its own again (none if the hand had stopped). */
  letGo() {
    const h = this.hand;
    if (!h.held) return;
    h.held = false;
    if (performance.now() - h.at > 90) h.v = 0;
    h.v = Math.max(-FLING_MAX, Math.min(FLING_MAX, h.v));
    this.restSince = performance.now() - DRIFT_AFTER * 1000;
  }

  /** A mouse's wheel or a trackpad: the wall moves by `px` page pixels (more: further left), eased in. */
  scrollBy(px: number) {
    if (!this.movable || this.hand.held) return;
    this.hand.wheel += px / this.pxPerColumn();
    this.restSince = performance.now() - DRIFT_AFTER * 1000;
  }

  /**
   * Nothing on the screen moving at `t` but the gold's own light: every ticket face down and the backs held, or the
   * rows at rest and the light holding on its ticket.
   */
  private still(r: Run, t: number): boolean {
    if (r.drawn !== null && r.v === 0 && t >= r.allDown && t >= r.settled && t < r.up) return true;
    if (!r.roll || !r.walk || t < r.roll0 + r.roll.td + r.roll.dec) return false;
    const next = r.walk.times.find((x) => x > t);
    return next !== undefined && next - t > 0.18;
  }

  /**
   * One moment of a draw, `t` seconds after the press: the new names put in once every ticket is face down and the
   * server has answered; the light on as the rows set off, its way planned a jump or two ahead over the rolling
   * tickets, a flash at each landing; the run over when it lands on the person drawn (or, a failed draw, when the
   * tickets are back up).
   */
  private drawStep(r: Run, t: number, now: number) {
    if (!r.placed && !r.halted && r.drawn !== null && t >= r.allDown) this.placeNames(r, r.drawn);
    if (r.placed && r.target && !r.walk && t >= r.light) {
      // From the middle of the screen as the rows set off (they may have rolled on since the press).
      const P = Math.floor(r.roll ? r.roll.from : r.p0);
      let start = { r: this.middleRow(), c: P + Math.ceil(this.grid.cols / 2) };
      if (start.r === r.target.r && start.c === r.target.c) start = { r: start.r, c: start.c - 1 };
      r.walk = walkStart(start, Math.floor(Math.random() * 8), r.light, r.target, r.land);
      this.light = { on: true, cells: r.walk.cells, times: r.walk.times, t };
      this.landFlash = now;
      this.jump = 0;
    }
    if (r.walk) {
      walkAhead(r.walk, t, (c, at, leave) => this.clear(c, r, at, leave), Math.random);
      this.light.t = t;
      const j = stepIndex(r.walk.times, t);
      if (j !== this.jump) {
        this.jump = j;
        this.landFlash = now;
      }
    }
    if (t >= r.land) this.finish();
  }

  /**
   * A ticket the light may be on from `at` until it leaves at `leave` (seconds from the press): in a row of the view,
   * and whole on the screen all that while as the rows roll (they only move one way, so its ends tell).
   */
  private clear(c: Cell, r: Run, at: number, leave: number): boolean {
    if (c.r < 0 || c.r >= this.rowsShown || !r.roll) return false;
    const pAt = (x: number) => rollAt(r.roll as Roll, x - r.roll0).p;
    return c.c >= pAt(leave) + 0.75 && c.c <= pAt(at) + this.grid.cols + 0.25;
  }

  /** Where a box is in the scene now (on the wall's curve), how far it is turned to face the room, its flat place. */
  private cellPos(cell: Cell, out = new THREE.Vector3()): { pos: THREE.Vector3; turn: number; x: number; y: number } {
    const x = flatX(this.grid, cell.c, this.p);
    const y = this.yTop - cell.r * this.grid.pitchY;
    const th = x / this.grid.curve;
    out.set(this.grid.curve * Math.sin(th), y, this.grid.curve * (1 - Math.cos(th)));
    return { pos: out, turn: -th, x, y };
  }

  /**
   * Every box the screen shows, the rows rolled to `p`: its place on the flat wall (the shader curves it), who is in it
   * (gold, or out of the wall while they are a gift), and their face's cell once drawn.
   */
  private place(p: number) {
    const g = this.grid;
    const n = this.rows.length;
    this.fillRows();
    const c0 = Math.floor(p);
    const nowS = performance.now() / 1000;
    const run = this.run;
    const t = run ? this.elapsed(run) : 0;
    // Between draws, the tickets as they rest (turn): face down (π), or up (2π), or turning into it in a wave.
    const T = this.turn;
    const turnT = Number.isFinite(T.at) ? Math.max(0, nowS - T.at / 1000) : Infinity;
    this.atlas.restart();
    let idx = 0;
    // A press's shuffle: each row raced its own way (whole columns from where it set off once at rest, the backs alike,
    // so the wall is whole again); its tickets keep their own columns' names and faces, only drawn further along.
    const shuffling = !!run && run.shuffle && t < run.settled;
    for (let row = 0; row < this.rowsShown && idx < this.cap; row++) {
      const y = this.yTop - row * g.pitchY;
      const segs = this.segs[row] ?? this.segs[0];
      const o = shuffling && run ? shuffleAt(row, t, run.stop).o : 0;
      const dc = Math.floor(p + o) - c0;
      for (let c = c0; c <= c0 + g.cols + 1 && idx < this.cap; c++, idx++) {
        this.posArr[idx * 3] = flatX(g, c + dc, p + o);
        this.posArr[idx * 3 + 1] = y;
        this.posArr[idx * 3 + 2] = 0;
        let cell = -1;
        let flag = 0;
        if (n && segs) {
          const e = this.rows[personAt(segs, c, n)];
          if (this.hidden && this.hidden.r === row && this.hidden.c === c) flag = HIDDEN;
          else if (this.gold.has(e[0])) flag = GOLD;
          cell = this.atlas.cell(e, this.frameNo);
        }
        this.cellArr[idx] = cell;
        this.flagArr[idx] = flag;
        const lit = this.litAt.size ? this.litAt.get(`${row}:${c}`) : undefined;
        this.litArr[idx] = lit === undefined ? 0 : Math.max(0, 1 - (nowS - lit) / TRAIL);
        let flip: number;
        if (run) {
          // A draw: face down (already, or in its wave), then up in the run's own wave once the names are in.
          flip = flipAngle(t, run.down, Infinity, flipDelay(row, c - run.downK0, this.rowsShown, g.cols));
          if (Number.isFinite(run.up)) flip += flipAngle(t, run.up, Infinity, flipDelay(row, c - run.upK0, this.rowsShown, g.cols));
        } else {
          const turned = flipAngle(turnT, 0, Infinity, flipDelay(row, c - T.k0, this.rowsShown, g.cols));
          flip = T.down ? turned : Math.PI + turned;
        }
        this.flipArr[idx] = flip;
      }
    }
    this.tilesGeometry.instanceCount = idx;
    this.posAttr.needsUpdate = true;
    this.cellAttr.needsUpdate = true;
    this.flagAttr.needsUpdate = true;
    this.litAttr.needsUpdate = true;
    this.flipAttr.needsUpdate = true;
    this.slotsDirty = false;
  }

  private dimTo(to: number, seconds: number) {
    const now = performance.now();
    this.dim = { from: this.dimAt(now), to, start: now, T: seconds };
  }

  private dimAt(now: number): number {
    const d = this.dim;
    const s = clamp01((now - d.start) / (d.T * 1000));
    return d.from + (d.to - d.from) * s * s * (3 - 2 * s);
  }

  private elapsed(r: { start: number }) {
    return (performance.now() - r.start) / 1000;
  }

  /** Finishes the run even if the browser stops drawing frames (a tab out of sight): the result never waits on it. */
  private watch(r: Run) {
    window.clearTimeout(this.dog);
    const end = Number.isFinite(r.land) ? r.land : 40;
    const left = (end - this.elapsed(r)) * 1000;
    this.dog = window.setTimeout(this.finish, Math.max(0, left) + 400);
  }

  /**
   * The first seconds at rest tell whether this screen can draw the wall smoothly: if half its frames take longer
   * than 45 ms (under 22 a second), the page is told once, and shows the list instead (before anyone has pressed).
   */
  private health(now: number) {
    const gap = this.lastNow ? now - this.lastNow : 0;
    this.lastNow = now;
    if (this.slowChecked) return;
    const age = now - this.born;
    if (this.run || this.show || age < 2500) return;
    if (gap > 0) this.gaps.push(gap);
    if (age < 6500 || this.gaps.length < 20) return;
    this.slowChecked = true;
    const sorted = [...this.gaps].sort((a, b) => a - b);
    if (sorted[sorted.length >> 1] > 45) this.opts.onSlow?.();
  }

  /**
   * The camera set back just so far that the wall's columns fill the screen's width, edge to edge, on its curve; then
   * as many whole rows as the view (opts.view: between the words at the top and the seats at the foot) holds, even
   * about its middle, and none outside it, so no word on the screen is ever over a name. The wall's ends are nearer
   * the room, where a row looks a little taller: the rows are fitted to the view as seen there. Then the gift's place.
   */
  private resize() {
    const host = this.canvas.parentElement;
    const w = Math.max(1, host?.clientWidth ?? window.innerWidth);
    const h = Math.max(1, host?.clientHeight ?? window.innerHeight);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const g = this.grid;
    const edge = (g.cols / 2) * g.pitchX;
    const th = edge / g.curve;
    const dist = g.curve * (1 - Math.cos(th)) + (g.curve * Math.sin(th)) / (tan * aspect);
    this.camera.aspect = aspect;
    this.camera.position.set(0, 0, dist);
    this.camDist = dist;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    const halfH = dist * tan;
    // The view's top and foot as lines across the screen (fractions of its height), and as heights on the wall: in the
    // middle, and at the ends, nearer the room.
    const box = this.opts.view?.getBoundingClientRect();
    const seen = !!box && box.height > 1;
    const top = this.canvas.getBoundingClientRect().top;
    const f0 = seen ? (box.top - top) / h : 0.142;
    const f1 = seen ? (box.bottom - top) / h : 0.678;
    const near = (dist - g.curve * (1 - Math.cos(th))) / dist;
    const y0 = halfH * (1 - 2 * f0);
    const y1 = halfH * (1 - 2 * f1);
    const hi = Math.min(y0, y0 * near);
    const lo = Math.max(y1, y1 * near);
    const gap = g.pitchY - g.tileH;
    const rows = Math.max(1, Math.min(ROWS, MAX_ROWS, Math.floor((hi - lo + gap) / g.pitchY + 1e-6)));
    const span = rows * g.pitchY - gap;
    const mid = Math.min(hi - span / 2, Math.max(lo + span / 2, (y0 + y1) / 2));
    this.rowsShown = rows;
    this.yTop = mid + span / 2 - g.tileH / 2;
    this.viewMid = 1 - f0 - f1;
    this.giftAt.set(0, this.viewMid * GIFT_DIST * tan - GIFT_BELOW, -GIFT_DIST);
    this.camera.localToWorld(this.giftAt);
    this.envAt.set(0, this.viewMid * ENV_DIST * tan - ENV_BELOW, -ENV_DIST);
    this.camera.localToWorld(this.envAt);
    this.packAt.set(0, 0, -PACK_DIST);
    this.camera.localToWorld(this.packAt);
    const px = this.renderer.getPixelRatio() * h;
    const scale = px / (2 * tan);
    this.bokehU.uScale.value = scale;
    this.sparkU.uScale.value = scale;
    this.bgU.uRes.value.set(w, h);
    (this.tileU.uRes.value as THREE.Vector2).set(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
    this.slotsDirty = true;
  }

  // ---- the reveal ----

  /** Where the pass holds the screen: in front of the room, on the middle of the view, facing it squarely. */
  private holdAt(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, this.viewMid * HOLD_DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) - HOLD_BELOW, -HOLD_DIST);
    return this.camera.localToWorld(out);
  }

  /** How wide the view is (world units) at `dist` from the room. */
  private widthAt(dist: number): number {
    return 2 * dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * this.camera.aspect;
  }

  /** This style's moments. */
  private get T(): Moments {
    return this.style === "walk" ? TG : this.style === "envelope" ? TE : this.style === "board" ? TB : TL;
  }

  /** The board's width on the page: six tenths of the 16:9 plate the page is laid out on. */
  private boardSize() {
    const r = this.canvas.getBoundingClientRect();
    this.board.size(Math.min(r.width, r.height * (16 / 9)) * 0.6, Math.min(2, window.devicePixelRatio || 1));
  }

  /** Where the board's middle is on the page (the view's middle). */
  private boardCentre(r: DOMRect): { x: number; y: number } {
    return { x: r.left + r.width / 2, y: r.top + ((1 - this.viewMid) / 2) * r.height };
  }

  /** A point on the page, `dist` from the room in the scene (where the ticket goes in, and the sparks come from). */
  private pageToScene(px: number, py: number, dist: number, out: THREE.Vector3): THREE.Vector3 {
    const r = this.canvas.getBoundingClientRect();
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const nx = ((px - r.left) / r.width) * 2 - 1;
    const ny = 1 - ((py - r.top) / r.height) * 2;
    out.set(nx * tan * this.camera.aspect * dist, ny * tan * dist, -dist);
    return this.camera.localToWorld(out);
  }

  /** Sparks: a fountain from the gift's open top as the lid goes, and gold dust round the pass while it holds. */
  private burst(from: THREE.Vector3, hold: THREE.Vector3, dustAt: number, lift = 1) {
    const g = this.sparks.geometry;
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const vel = g.getAttribute("aVel") as THREE.BufferAttribute;
    const born = g.getAttribute("aBorn") as THREE.BufferAttribute;
    const life = g.getAttribute("aLife") as THREE.BufferAttribute;
    const size = g.getAttribute("aSize") as THREE.BufferAttribute;
    const color = g.getAttribute("aColor") as THREE.BufferAttribute;
    const n = pos.count;
    const fountain = Math.floor(n * 0.74);
    const hues = [
      [1.0, 0.84, 0.48],
      [1.0, 0.94, 0.78],
      [1.0, 1.0, 1.0],
      [1.0, 0.72, 0.36],
    ];
    for (let i = 0; i < n; i++) {
      const h = hues[i % 11 === 0 ? 3 : i % 3 === 0 ? 2 : i % 2];
      color.setXYZ(i, h[0], h[1], h[2]);
      if (i < fountain) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.75;
        pos.setXYZ(i, from.x + Math.cos(a) * r, from.y, from.z + Math.sin(a) * r);
        const spread = 0.6 + Math.random() * 1.5;
        vel.setXYZ(i, Math.cos(a) * spread * lift, (2.6 + Math.random() * 3.3) * lift, (Math.sin(a) * spread + 0.8 + Math.random() * 1.6) * lift);
        born.setX(i, Math.random() * 0.9);
        life.setX(i, 1.3 + Math.random() * 1.4);
        size.setX(i, 0.05 + Math.random() * 0.11);
      } else {
        pos.setXYZ(i, hold.x + (Math.random() - 0.5) * PASS_WORLD_W * 1.4, hold.y + (Math.random() - 0.5) * PASS_WORLD_H * 1.4, hold.z - 0.1 - Math.random() * 0.3);
        vel.setXYZ(i, (Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.18, 0);
        born.setX(i, dustAt - 0.2 + Math.random() * 2.2);
        life.setX(i, 1.4 + Math.random() * 1.2);
        size.setX(i, 0.012 + Math.random() * 0.022);
      }
    }
    for (const a of [pos, vel, born, life, size, color]) a.needsUpdate = true;
  }

  /** One moment of the reveal, `t` seconds after the stop. */
  private pose(t: number, time: number) {
    const s = this.show;
    if (!s) return;
    const u = this.tileU;
    const T = this.T;
    // The stop: the frame flares, the tile in it lights, the rest of the wall dims.
    u.uLock.value = smooth(t, 0, 0.18) * (1 - smooth(t, T.out, T.out + 0.2));
    u.uDim.value = 0.78 * smooth(t, 0.1, 0.6) * (1 - smooth(t, T.seat - 0.1, T.end));
    this.frameU.uGlow.value = 0.9 + 2.6 * bell(t, 0, 0.75);
    // The light stays on the ticket until it leaves the wall, then goes.
    this.frameU.uAlpha.value = 1 - smooth(t, T.out, T.out + 0.35);
    if (t >= T.out && !this.hidden) {
      this.hidden = this.lightCell();
      this.slotsDirty = true;
    }
    if (this.style === "board") {
      this.poseBoard(t, s);
      return;
    }
    if (this.style === "envelope") {
      this.poseEnvelope(t, s);
      return;
    }
    if (this.style === "walk") {
      this.poseGrand(t, s, time);
      return;
    }

    // The tile comes out of the wall towards the room, turning; half way round, it is a gift.
    const heroOn = t >= TL.out && t < TL.flip;
    this.hero.visible = heroOn;
    if (heroOn) {
      const k = (t - TL.out) / (TL.flip - TL.out);
      const e = easeInOut(k);
      this.hero.position.lerpVectors(s.from, this.giftAt, e);
      this.hero.position.y += Math.sin(Math.PI * k) * 0.45;
      this.hero.scale.setScalar(1 - 0.3 * e);
      this.hero.rotation.set(GIFT_TILT * e, s.turn * (1 - e) + (-Math.PI / 2) * easeIn(k), 0);
      this.heroU.uGlow.value = k * 1.5;
    }
    this.flash.visible = t > TL.flip - 0.15 && t < TL.flip + 0.4;
    if (this.flash.visible) {
      (this.flash.material as THREE.SpriteMaterial).opacity = bell(t, TL.flip - 0.15, TL.flip + 0.4) * 0.95;
      this.flash.position.copy(this.giftAt);
      const f = 1.4 + 1.2 * smooth(t, TL.flip - 0.15, TL.flip + 0.4);
      this.flash.scale.set(f, f, 1);
    }

    // The gift: pops into shape, hops twice with its lid trembling, then the lid flies off and the light comes out.
    const giftOn = t >= TL.flip && t < TL.placed + 0.3;
    this.gift.root.visible = giftOn;
    if (giftOn) {
      const pop = (t - TL.flip) / 0.5;
      this.gift.root.scale.setScalar(GIFT_SCALE * (0.35 + 0.65 * backOut(pop)));
      this.gift.root.rotation.set(GIFT_TILT, GIFT_YAW + (Math.PI / 2) * (1 - easeOut(pop)), 0);
      const sink = easeIn((t - TL.risen - 0.05) / (TL.placed + 0.3 - TL.risen - 0.05));
      this.gift.root.position.set(this.giftAt.x, this.giftAt.y - 2.6 * sink, this.giftAt.z);
      const h = clamp01((t - TL.landed) / (TL.pop - TL.landed));
      const hopping = t >= TL.landed && t < TL.pop;
      const m: GiftMoment = {
        hop: hopping ? 0.17 * Math.abs(Math.sin(2 * Math.PI * h)) * (1 - 0.3 * h) : 0,
        squash: hopping ? 0.05 * Math.cos(4 * Math.PI * h) * (1 - h) : 0,
        tremble: 0.05 * Math.sin(t * 40) * smooth(t, TL.landed, TL.landed + 0.25) * (1 - smooth(t, TL.pop - 0.08, TL.pop)),
        seam: smooth(t, TL.landed + 0.1, TL.pop),
        open: t < TL.pop ? 0 : t < TL.pop + 0.6 ? easeOut((t - TL.pop) / 0.6) : 1 + (t - TL.pop - 0.6) * 0.9,
        lidFade: smooth(t, TL.pop + 0.35, TL.pop + 1.05),
        beams: easeOut((t - TL.pop) / 0.8) * (1 - smooth(t, TL.placed - 0.6, TL.placed + 0.15)),
        light: smooth(t, TL.pop, TL.pop + 0.25) * (1 - smooth(t, TL.placed - 0.5, TL.placed + 0.15)),
      };
      this.gift.set(m, time);
    }
    this.giftHalo.visible = t > TL.pop && t < TL.placed + 0.2;
    if (this.giftHalo.visible) {
      this.gift.root.updateMatrixWorld();
      this.gift.root.localToWorld(this.giftHalo.position.set(0, RIM_Y + 0.3, 0));
      const a = smooth(t, TL.pop, TL.pop + 0.3) * (1 - smooth(t, TL.placed - 0.5, TL.placed + 0.2));
      (this.giftHalo.material as THREE.SpriteMaterial).opacity = a * 0.85;
      this.giftHalo.scale.set(3.2, 3.2, 1);
    }

    // The sparks, from the open top, as the lid goes.
    if (!s.burst && t >= TL.pop) {
      s.burst = true;
      this.gift.root.updateMatrixWorld();
      const rim = this.gift.root.localToWorld(new THREE.Vector3(0, RIM_Y, 0));
      this.burst(rim, this.holdAt(new THREE.Vector3()), TL.placed - TL.pop);
      this.sparks.visible = true;
    }
    this.sparkU.uT.value = s.burst ? t - TL.pop : -10;

    // The pass: rises out of the gift and comes to the room in the scene; facing the room, it is handed to the page
    // (./wall.css .lw-lift), drawn over everything, sharp, for its three seconds and its way down into its seat.
    const inScene = t >= TL.rise && t < TL.placed;
    this.passGroup.visible = inScene;
    if (inScene) {
      const g = this.passGroup;
      const riseScale = GIFT_SCALE * 0.62;
      if (t < TL.risen) {
        const k = easeOut((t - TL.rise) / (TL.risen - TL.rise));
        this.gift.root.updateMatrixWorld();
        this.gift.root.localToWorld(g.position.set(0, RIM_Y - 0.8 + 1.85 * k, 0));
        this.gift.root.getWorldQuaternion(g.quaternion);
        g.scale.setScalar(riseScale);
        this.passU.uWarm.value = 1;
      } else {
        if (!s.risen) {
          this.gift.root.updateMatrixWorld();
          const p = this.gift.root.localToWorld(new THREE.Vector3(0, RIM_Y + 1.05, 0));
          s.risen = { pos: p, quat: this.gift.root.getWorldQuaternion(new THREE.Quaternion()), scale: riseScale };
        }
        const k = easeInOut((t - TL.risen) / (TL.placed - TL.risen));
        g.position.lerpVectors(s.risen.pos, this.holdAt(this.tmpV), k);
        g.position.y += Math.sin(Math.PI * k) * 0.18;
        g.quaternion.slerpQuaternions(s.risen.quat, this.camera.quaternion, k);
        g.scale.setScalar(s.risen.scale + (1 - s.risen.scale) * k);
        this.passU.uWarm.value = 1 - k;
      }
      this.passU.uSweep.value = -1;
      (this.passHalo.material as THREE.SpriteMaterial).opacity = 0.5 * smooth(t, TL.risen, TL.placed);
    }
    // The page's pass is laid out from the stop on, unseen, so taking over from the scene's is only a change of opacity.
    this.liftRoot.hidden = false;
    this.liftPose(t, s);
  }

  /**
   * The departures board's reveal, `t` seconds after the stop: the winner's golden ticket flies out to the middle and
   * checks in to the board, with a flash of gold, as the board comes up; the board's letters clatter and settle; the
   * pass prints out of its slot (liftPose) as the board dims, holds the screen three seconds, and goes to its seat.
   */
  private poseBoard(t: number, s: Show) {
    const r = this.canvas.getBoundingClientRect();
    const c = this.boardCentre(r);
    const into = this.pageToScene(c.x, c.y, 6, this.tmpV2);
    const heroOn = t >= TB.out && t < TB.dock;
    this.hero.visible = heroOn;
    if (heroOn) {
      const k = (t - TB.out) / (TB.dock - TB.out);
      const e = easeInOut(k);
      this.hero.position.lerpVectors(s.from, into, e);
      this.hero.position.y += Math.sin(Math.PI * k) * 0.35;
      this.hero.scale.setScalar((1 + 0.45 * e) * (1 - smooth(k, 0.72, 1)));
      this.hero.rotation.set(0, s.turn * (1 - e), 0);
      this.heroU.uGlow.value = k * 1.5;
    }
    this.flash.visible = false;
    // The board, on the page: up as the ticket arrives, gone as the pass prints out of it.
    this.boardSize();
    const w = parseFloat(this.board.el.style.width) || 0;
    const h = this.board.heightCss;
    const up = easeOut(clamp01((t - TB.boardIn) / 0.4));
    this.placeBoard(Math.max(LIFT_READY, up * (1 - smooth(t, TB.print, TB.print + 0.35))), 0.94 + 0.06 * up);
    this.board.draw(t);
    // The check-in: a line of gold light sweeping down the board, as a boarding gate's scanner reads the ticket.
    const sweep = smooth(t, TB.dock - 0.1, TB.dock + 0.5);
    const bw = w * 0.96;
    const bh = h * 0.16;
    this.boardFlash.style.width = `${bw}px`;
    this.boardFlash.style.height = `${bh}px`;
    this.boardFlash.style.transform = `translate3d(${(c.x - bw / 2).toFixed(1)}px, ${(c.y - h / 2 + (h - bh) * sweep).toFixed(1)}px, 0)`;
    this.boardFlash.style.opacity = String(bell(t, TB.dock - 0.1, TB.dock + 0.5).toFixed(3));
    // Gold dust round the pass while it holds, and a little fountain from the slot as it prints.
    if (!s.burst && t >= TB.print) {
      s.burst = true;
      const slot = this.boardSlot(r);
      this.burst(this.pageToScene(slot.x, slot.y, 6, new THREE.Vector3()), this.holdAt(new THREE.Vector3()), TB.placed - TB.print);
      this.sparks.visible = true;
    }
    this.sparkU.uT.value = s.burst ? t - TB.print : -10;
    this.liftRoot.hidden = false;
    this.liftPose(t, s);
  }

  /**
   * The grand opening, `t` seconds after the stop (./grand.ts TG), as a card pack's walkout: the light lands, the
   * screen goes dark, and the winner's ticket spins out of the wall towards the room; in a flash it is the Winner Pack,
   * which lands in the middle with a jolt, spotlights sweeping; it charges (trembling, light at its seams, a flare
   * rising behind it) and its top tears off, light bursting out; their Trip ID, cast in gold, zooms in out of the dark
   * and lands with a shock, a glint running over it, and rushes past the room; their city the same way; the
   * spotlights close in, embers rise, the light pulses; a burst, and their card spins in out of it and lands in the
   * middle, rays turning behind it; the page's card takes over (liftPose) for its three seconds and its seat.
   */
  private poseGrand(t: number, s: Show, time: number) {
    // The dark: the wall, its background and its lights all but gone, the page's words faded (.lw[data-walk]).
    const dark = smooth(t, 0.06, 0.6) * (1 - smooth(t, TG.leave, TG.seat));
    this.tileU.uDark.value = dark;
    this.bgU.uDark.value = dark;
    this.bokehU.uDark.value = dark;
    const root = this.opts.lift.parentElement;
    if (root) {
      if (t >= 0.08 && t < TG.leave) root.dataset.walk = "";
      else delete root.dataset.walk;
      if (this.packWaiting) root.dataset.pack = "";
      else delete root.dataset.pack;
    }
    // The jolts shake the room: the camera, about where it stands.
    const jolt = shakeAt(t);
    this.camera.position.set(jolt.x, jolt.y, this.camDist);
    this.camera.updateMatrixWorld();
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    // A point on the view's middle line, `d` from the room (where it stands, not shaken with it).
    const along = (d: number, out: THREE.Vector3) => out.set(0, this.viewMid * d * tan, this.camDist - d);
    // The flashes: as the light lands, as the ticket becomes the pack, as the pack tears, as it all bursts.
    const pulse = (at: number, rise: number, fall: number, peak: number) =>
      t < at ? 0 : t < at + rise ? (peak * (t - at)) / rise : peak * Math.exp(-(t - at - rise) / fall);
    this.walkFlash.style.opacity = Math.max(
      pulse(-0.03, 0.07, 0.14, 0.55),
      pulse(TG.swap - 0.06, 0.06, 0.12, 0.85),
      pulse(TG.tear - 0.02, 0.1, 0.2, 1),
      pulse(TG.burst - 0.06, 0.08, 0.22, 1),
      pulse(TG.placed - 0.04, 0.06, 0.18, 0.6),
    ).toFixed(3);

    // The ticket, spinning out of the wall towards the room; in the flash, the pack.
    const heroOn = t >= TG.out && t < TG.swap;
    this.hero.visible = heroOn;
    if (heroOn) {
      const k = (t - TG.out) / (TG.swap - TG.out);
      const e = easeInOut(k);
      this.hero.position.lerpVectors(s.from, this.packAt, e);
      this.hero.scale.setScalar(1 + 1.3 * e);
      this.hero.rotation.set(0, s.turn * (1 - e) + Math.PI * 3 * easeIn(k), 0);
      this.heroU.uGlow.value = 1 + 2.5 * k;
      this.heroU.uShade.value = 0;
    }

    // The pack: lands with a jolt, floats, charges, tears; falls away into the light.
    const pk = this.grandPack;
    const packOn = t >= TG.swap && t < TG.tear + 0.6;
    pk.root.visible = packOn;
    if (packOn) {
      const land = clamp01((t - TG.swap) / (TG.pack - TG.swap));
      const charge = clamp01((t - TG.charge) / (TG.tear - TG.charge));
      const after = clamp01((t - TG.tear) / 0.6);
      const quake = charge * charge;
      pk.root.position.copy(this.packAt);
      pk.root.position.z += 1.8 * (1 - easeOut(land));
      pk.root.position.x += Math.sin(t * 73) * 0.022 * quake;
      pk.root.position.y += Math.cos(t * 61) * 0.02 * quake + Math.sin(time * 1.4) * 0.04;
      pk.root.scale.setScalar((0.8 + 0.2 * backOut(land)) * (1 + 0.16 * easeIn(charge)) * (1 + 0.4 * easeOut(after)));
      pk.root.rotation.set(
        0.05 * Math.sin(t * 0.9),
        0.34 * Math.sin(time * 0.8) * (1 - charge) + 1.1 * (1 - easeOut(land)) + Math.sin(t * 83) * 0.02 * quake,
        0.025 * Math.sin(t * 0.7),
      );
      // Waiting to be opened: its edges breathing light, calling for the hand.
      const waiting = s.hold !== null && !s.opened && t >= TG.pack ? 1 : 0;
      const breathe = waiting * (0.3 + 0.3 * (0.5 + 0.5 * Math.sin(time * 2.6)));
      pk.set(time, 0.25 + 2.3 * quake + breathe, smooth(t, TG.tear, TG.tear + 0.15), clamp01((t - TG.tear) / 0.55), smooth(t, TG.tear + 0.25, TG.tear + 0.6));
    }
    // The flare rising behind the pack as it charges, and again before the burst.
    const flare =
      smooth(t, TG.charge - 0.2, TG.charge + 0.4) * (1 - smooth(t, TG.tear + 0.1, TG.tear + 0.6)) +
      smooth(t, TG.build + 0.3, TG.burst - 0.1) * (1 - smooth(t, TG.burst, TG.burst + 0.4));
    this.pillar.mesh.position.copy(this.packAt).add(this.tmpV.set(0, -2.4, -2.6));
    this.pillar.set(0.85 * flare, easeOut(clamp01(flare * 1.4)), time);
    // The spotlights: on as the pack lands, sweeping; closing in on the middle before the burst; gone in it.
    const beams = 0.62 * smooth(t, TG.pack - 0.3, TG.pack + 0.4) * (1 - smooth(t, TG.burst, TG.burst + 0.5));
    this.beams.root.position.copy(this.packAt);
    this.beams.set(beams, time, smooth(t, TG.build, TG.burst));

    // The details, cast in gold: out of the dark, landed, rushing past the room.
    this.plates.forEach((plate, k) => {
      const P = plateAt(k as 0 | 1 | 2, t);
      plate.mesh.visible = P.on;
      if (!P.on) return;
      along(P.dist, plate.mesh.position);
      plate.mesh.quaternion.copy(this.camera.quaternion);
      plate.mesh.rotateY(P.swing);
      plate.mesh.rotateZ(P.swing * 0.12);
      plate.u.uAlpha.value = P.alpha;
      plate.u.uGlint.value = P.glint < 0 || P.glint > 1.3 ? -1 : P.glint;
      plate.u.uHeat.value = P.heat;
    });

    // The shock ring from the latest jolt, where it struck.
    const R = ringAt(t);
    this.ring.set(0.9 * R.alpha, R.spread);
    if (R.on) {
      if (R.at === TG.placed) this.holdAt(this.ring.mesh.position);
      else if (R.at === TG.land1 || R.at === TG.land2 || R.at === TG.nameLand) along(PLATE_HOLD, this.ring.mesh.position);
      else this.ring.mesh.position.copy(this.packAt);
      this.ring.mesh.quaternion.copy(this.camera.quaternion);
      this.ring.mesh.scale.setScalar(1.5 + 9 * R.spread);
    }

    // Before the burst: embers rising, the light at the middle pulsing ever faster.
    if (!s.embers && t >= TG.build) {
      s.embers = true;
      this.rise(this.holdAt(new THREE.Vector3()));
      this.sparks.visible = true;
    }
    const b = t - TG.build;
    const beat = b > 0 && t < TG.burst ? 0.5 + 0.5 * Math.sin(2 * Math.PI * (1.6 * b + 1.6 * b * b)) : 0;
    this.flash.visible = beat > 0;
    if (this.flash.visible) {
      (this.flash.material as THREE.SpriteMaterial).opacity = (0.15 + 0.35 * beat) * smooth(t, TG.build, TG.build + 0.4);
      this.holdAt(this.flash.position);
      const f = 1.2 + 1.6 * clamp01(b / (TG.burst - TG.build)) + 0.3 * beat;
      this.flash.scale.set(f, f, 1);
    }

    // The burst: sparks out of the light, and gold dust round the card while it holds.
    if (!s.burst && t >= TG.burst) {
      s.burst = true;
      this.burst(along(PLATE_HOLD, new THREE.Vector3()), this.holdAt(new THREE.Vector3()), 9, 1.1);
      this.sparks.visible = true;
    }
    if (!s.cardBurst && t >= TG.placed) {
      s.cardBurst = true;
      this.burst(this.holdAt(new THREE.Vector3()), this.holdAt(new THREE.Vector3()), 0.25, 0.8);
      this.sparks.visible = true;
    }
    this.sparkU.uT.value = s.cardBurst ? t - TG.placed : s.burst ? t - TG.burst : s.embers ? t - TG.build : -10;

    // The card: spins in out of the burst from deep in the dark, landing in the middle facing the room.
    const cardOn = t >= TG.cardIn && t < TG.placed;
    this.passGroup.visible = cardOn;
    if (cardOn) {
      const g = this.passGroup;
      const k = 1 - (1 - (t - TG.cardIn) / (TG.placed - TG.cardIn)) ** 3;
      along(CARD_FAR, this.tmpV);
      g.position.lerpVectors(this.tmpV, this.holdAt(this.tmpV2), k);
      g.quaternion.copy(this.camera.quaternion);
      g.rotateY(4 * Math.PI * (1 - k));
      g.scale.setScalar(1);
      this.passU.uWarm.value = 1 - k;
      this.passU.uSweep.value = -1;
      (this.passHalo.material as THREE.SpriteMaterial).opacity = 0.6 * k;
    }

    // Rays turning behind the card while it holds.
    const { hx, hy, w } = this.liftSize();
    const rays = smooth(t, TG.nameLand - 0.15, TG.nameLand + 0.4) * (1 - smooth(t, TG.leave, TG.leave + 0.4));
    this.walk.hidden = false;
    this.rays.style.opacity = rays.toFixed(3);
    const size = w * 2.1;
    this.rays.style.width = `${size.toFixed(0)}px`;
    this.rays.style.height = `${size.toFixed(0)}px`;
    this.rays.style.transform = `translate3d(${(hx - size / 2).toFixed(1)}px, ${(hy - size / 2).toFixed(1)}px, 0) scale(${(0.85 + 0.15 * rays).toFixed(3)})`;
    this.rays.style.setProperty("--spin", `${(t * 9).toFixed(2)}deg`);

    this.liftRoot.hidden = false;
    this.liftPose(t, s);
  }

  /** Embers rising round the middle before the grand opening's burst. */
  private rise(at: THREE.Vector3) {
    const g = this.sparks.geometry;
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const vel = g.getAttribute("aVel") as THREE.BufferAttribute;
    const born = g.getAttribute("aBorn") as THREE.BufferAttribute;
    const life = g.getAttribute("aLife") as THREE.BufferAttribute;
    const size = g.getAttribute("aSize") as THREE.BufferAttribute;
    const color = g.getAttribute("aColor") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, at.x + (Math.random() - 0.5) * 7, at.y - 2.6 + Math.random() * 1.6, at.z - 0.6 - Math.random() * 1.2);
      vel.setXYZ(i, (Math.random() - 0.5) * 0.3, 1.5 + Math.random() * 1.1, 0);
      born.setX(i, Math.random() * 1.05);
      life.setX(i, 1.0 + Math.random() * 0.9);
      size.setX(i, 0.025 + Math.random() * 0.05);
      color.setXYZ(i, 1.0, 0.72 + Math.random() * 0.2, 0.36 + Math.random() * 0.2);
    }
    for (const x of [pos, vel, born, life, size, color]) x.needsUpdate = true;
  }

  /**
   * The golden envelope's reveal, `t` seconds after the stop (./envelope.ts TE), as at an award show and in slow motion:
   * the winner's ticket rises out of the wall and floats towards the room, turning to face it, their name on it; it
   * turns edge-on over the envelope's place and half way round is the envelope, sealed; the seal breaks and the flap
   * lifts back; the card slides up out of it, slowly, and comes to the room facing it, where the page's pass takes over
   * (liftPose) for its three seconds and its way down into its seat.
   */
  private poseEnvelope(t: number, s: Show) {
    const env = this.envelope;
    // Where the ticket floats in its slow part: most of the way from the wall to the envelope's place, a little above.
    const float = this.tmpV2.copy(s.from).lerp(this.envAt, 0.62);
    float.y += 0.42;
    const heroOn = t >= TE.out && t < TE.flip;
    this.hero.visible = heroOn;
    if (heroOn) {
      if (t < TE.turn) {
        const k = (t - TE.out) / (TE.turn - TE.out);
        const e = easeInOut(k);
        this.hero.position.lerpVectors(s.from, float, e);
        this.hero.position.y += Math.sin(Math.PI * k) * 0.12;
        this.hero.scale.setScalar(1 + 1.1 * e);
        this.hero.rotation.set(0.1 * Math.sin(Math.PI * k), s.turn * (1 - e) - 0.16 * Math.sin(Math.PI * k), 0.04 * Math.sin(2 * Math.PI * k));
        this.heroU.uGlow.value = 0.4 + 1.1 * e;
      } else {
        const k = (t - TE.turn) / (TE.flip - TE.turn);
        this.hero.position.lerpVectors(float, this.envAt, easeInOut(k));
        this.hero.scale.setScalar(2.1 - 0.75 * easeIn(k));
        this.hero.rotation.set(0, (Math.PI / 2) * easeIn(k), 0);
        this.heroU.uGlow.value = 1.5;
      }
    }
    // A flash where it becomes the envelope.
    this.flash.visible = t > TE.flip - 0.15 && t < TE.flip + 0.4;
    if (this.flash.visible) {
      (this.flash.material as THREE.SpriteMaterial).opacity = bell(t, TE.flip - 0.15, TE.flip + 0.4) * 0.85;
      this.flash.position.copy(this.envAt);
      const f = 1.6 + 1.4 * smooth(t, TE.flip - 0.15, TE.flip + 0.4);
      this.flash.scale.set(f, f, 1);
    }
    // The envelope: finishes the turn to face the room and settles; sways a little as it waits, so its gold catches the
    // light; the seal breaks and the flap lifts back, light inside; once the card is out, it drops away below.
    const on = t >= TE.flip && t < TE.placed + 0.45;
    env.root.visible = on;
    if (on) {
      const pop = clamp01((t - TE.flip) / 0.6);
      const wait = t - TE.flip;
      const sway = 0.09 * Math.sin(wait * 1.25) * (1 - smooth(t, TE.open - 0.2, TE.open + 0.3));
      env.root.rotation.set(-0.05, -(Math.PI / 2) * (1 - easeOut(pop)) + sway, 0.015 * Math.sin(wait * 0.9));
      env.root.scale.setScalar(ENV_SCALE * (0.92 + 0.08 * backOut(pop)));
      const drop = easeIn((t - TE.risen + 0.15) / (TE.placed + 0.45 - TE.risen + 0.15));
      env.root.position.set(this.envAt.x, this.envAt.y + 0.03 * Math.sin(wait * 1.6) - 3.2 * drop, this.envAt.z);
      env.set({
        open: easeInOut(clamp01((t - TE.open) / 0.7)),
        crack: clamp01((t - TE.open + 0.06) / 0.5),
        glow: smooth(t, TE.open, TE.open + 0.45) * (1 - smooth(t, TE.risen - 0.2, TE.placed)),
      });
    }
    // Light behind the opening, as it opens.
    this.giftHalo.visible = t > TE.open && t < TE.placed + 0.2;
    if (this.giftHalo.visible) {
      env.root.updateMatrixWorld();
      env.root.localToWorld(this.giftHalo.position.set(0, ENV.h / 2, -0.05));
      const a = smooth(t, TE.open, TE.open + 0.4) * (1 - smooth(t, TE.risen - 0.3, TE.placed + 0.2));
      (this.giftHalo.material as THREE.SpriteMaterial).opacity = a * 0.7;
      this.giftHalo.scale.set(3.4, 2.4, 1);
    }
    // Sparks from the seal as it breaks, and gold dust round the card while it holds.
    if (!s.burst && t >= TE.open) {
      s.burst = true;
      // A gentle fountain: the seal is mid-screen, and the sparks never rise over the words.
      this.burst(env.sealAt(new THREE.Vector3()), this.holdAt(new THREE.Vector3()), TE.placed - TE.open, 0.5);
      this.sparks.visible = true;
    }
    this.sparkU.uT.value = s.burst ? t - TE.open : -10;
    // The card: slides up out of the envelope, slowly, then comes to the room facing it, growing to where it holds.
    const inScene = t >= TE.slide && t < TE.placed;
    this.passGroup.visible = inScene;
    if (inScene) {
      const g = this.passGroup;
      const half = (PASS_WORLD_H * CARD_IN) / 2;
      // Inside, its top under the V of the front's opening; drawn out, its middle at the envelope's top edge (as a card is
      // pulled out to be read; never up over the screen's words).
      const y0 = ENV.h / 2 - ENV.notch - 0.03 - half;
      const y1 = ENV.h / 2;
      if (t < TE.risen) {
        const k = easeInOut((t - TE.slide) / (TE.risen - TE.slide));
        env.root.updateMatrixWorld();
        env.root.localToWorld(g.position.set(0, y0 + (y1 - y0) * k, CARD_Z));
        env.root.getWorldQuaternion(g.quaternion);
        g.scale.setScalar(env.root.scale.x * CARD_IN);
        this.passU.uWarm.value = 1;
      } else {
        if (!s.risen) {
          env.root.updateMatrixWorld();
          const p = env.root.localToWorld(new THREE.Vector3(0, y1, CARD_Z));
          s.risen = { pos: p, quat: env.root.getWorldQuaternion(new THREE.Quaternion()), scale: env.root.scale.x * CARD_IN };
        }
        const k = easeInOut((t - TE.risen) / (TE.placed - TE.risen));
        g.position.lerpVectors(s.risen.pos, this.holdAt(this.tmpV), k);
        g.position.y += Math.sin(Math.PI * k) * 0.1;
        g.quaternion.slerpQuaternions(s.risen.quat, this.camera.quaternion, k);
        g.scale.setScalar(s.risen.scale + (1 - s.risen.scale) * k);
        this.passU.uWarm.value = 1 - k;
      }
      this.passU.uSweep.value = -1;
      (this.passHalo.material as THREE.SpriteMaterial).opacity = 0.5 * smooth(t, TE.risen - 0.5, TE.placed);
    }
    this.liftRoot.hidden = false;
    this.liftPose(t, s);
  }

  /** The board in its place on the page (the view's middle), at this opacity and size. */
  private placeBoard(opacity: number, scale: number) {
    const el = this.board.el;
    const c = this.boardCentre(this.canvas.getBoundingClientRect());
    const w = parseFloat(el.style.width) || 0;
    const h = this.board.heightCss;
    el.hidden = false;
    el.style.opacity = String(opacity);
    el.style.transform = `translate3d(${(c.x - w / 2).toFixed(1)}px, ${(c.y - h / 2).toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
  }

  /** The board's slot on the page, the pass's way out. */
  private boardSlot(r: DOMRect): { x: number; y: number } {
    const c = this.boardCentre(r);
    return { x: c.x, y: c.y - this.board.heightCss / 2 + this.board.slotY };
  }

  /** The page's pass sized to the scene's where it holds the screen, and that place's centre, in page pixels. */
  private liftSize(): { r: DOMRect; hx: number; hy: number; w: number; h: number } {
    const r = this.canvas.getBoundingClientRect();
    const hold = this.holdAt(this.tmpV).project(this.camera);
    const hx = r.left + ((hold.x + 1) / 2) * r.width;
    const hy = r.top + ((1 - hold.y) / 2) * r.height;
    const w = (PASS_WORLD_W / this.widthAt(HOLD_DIST)) * r.width;
    const h = (w * PASS_H) / PASS_W;
    if (Math.abs(this.liftW - w) > 0.5) {
      this.liftW = w;
      this.liftCard.style.width = `${w}px`;
      this.liftCard.style.height = `${h}px`;
      this.liftGlow.style.width = `${w * 1.7}px`;
      this.liftGlow.style.height = `${h * 2.1}px`;
    }
    return { r, hx, hy, w, h };
  }

  /**
   * The pass on the page, from the moment it faces the room: exactly where the scene left it (same place, same size),
   * floating a little for three seconds while a light passes over its foil, then down into its seat on the page,
   * shrinking to the seat's width, and gone as the seat lights. Only transforms change (nothing is laid out again).
   */
  private liftPose(t: number, s: Show) {
    const T = this.T;
    const { r, hx, hy, w, h } = this.liftSize();
    let cx = hx;
    let cy = hy + Math.sin((t - T.placed) * 1.15) * r.height * 0.003;
    let sc = 1;
    let on = t >= T.placed ? 1 : LIFT_READY;
    if (this.style === "board" && t >= TB.print && t < TB.placed) {
      // Printed: out of the board's slot, rising and growing to where it holds the screen.
      const k = easeOut((t - TB.print) / (TB.placed - TB.print));
      const slot = this.boardSlot(r);
      cx = slot.x + (hx - slot.x) * k;
      cy = slot.y + (hy - slot.y) * k;
      sc = 0.3 + 0.7 * k;
      on = Math.max(LIFT_READY, smooth(t, TB.print, TB.print + 0.22));
    }
    if (t >= T.leave) {
      if (!s.seatRect) s.seatRect = s.seat() ?? new DOMRect(r.left + r.width * 0.42, r.top + r.height * 0.8, r.width * 0.16, r.height * 0.15);
      const k = easeInOut((t - T.leave) / (T.seat - T.leave));
      const sr = s.seatRect;
      cx = hx + (sr.left + sr.width / 2 - hx) * k;
      cy = hy + (sr.top + sr.height / 2 - hy) * k;
      sc = 1 + (sr.width / w - 1) * k;
    }
    // The grand opening's card, alive while it holds: tilting slowly, as a card held up to the room.
    const alive = this.style === "walk" ? smooth(t, T.placed + 0.3, T.placed + 1.1) * (1 - smooth(t, T.leave - 0.2, T.leave + 0.1)) : 0;
    const tilt = alive ? ` perspective(${(w * 2.2).toFixed(0)}px) rotateY(${(5 * alive * Math.sin((t - T.placed) * 0.95)).toFixed(2)}deg) rotateX(${(2.6 * alive * Math.sin((t - T.placed) * 0.7 + 1)).toFixed(2)}deg)` : "";
    this.liftCard.style.transform = `translate3d(${(cx - (w * sc) / 2).toFixed(1)}px, ${(cy - (h * sc) / 2).toFixed(1)}px, 0) scale(${sc.toFixed(4)})${tilt}`;
    this.liftCard.style.opacity = String(on * (1 - smooth(t, T.seat - 0.06, T.end - 0.02)));
    this.liftGlow.style.transform = `translate3d(${(cx - (w * 1.7 * sc) / 2).toFixed(1)}px, ${(cy - (h * 2.1 * sc) / 2).toFixed(1)}px, 0) scale(${sc.toFixed(4)})`;
    const breathe = this.style === "walk" ? 0.78 + 0.22 * Math.sin((t - T.placed) * 3.1) : 1;
    this.liftGlow.style.opacity = String(on * 0.9 * breathe * (1 - smooth(t, T.leave, T.leave + 0.35)));
    // The light over its foil: once; on the grand opening's card, again and again while it holds.
    const k = clamp01((this.style === "walk" ? (t - T.placed - 0.3) % 2.1 : t - T.placed - 0.3) / 1.15);
    this.liftBand.style.transform = `translate3d(${(-130 + 260 * easeInOut(k)).toFixed(1)}%, 0, 0) skewX(-16deg)`;
  }

  /** The reveal over: everything of it put away, the winner's tile back on the wall, the wall lit again. */
  private endShow() {
    const s = this.show;
    if (!s) return;
    for (const t of s.timers) window.clearTimeout(t);
    this.show = null;
    if (!s.seated) {
      s.seated = true;
      s.onSeat();
    }
    this.hero.visible = false;
    this.gift.root.visible = false;
    this.envelope.root.visible = false;
    this.passGroup.visible = false;
    this.liftRoot.hidden = true;
    this.walk.hidden = true;
    this.walkFlash.style.opacity = "0";
    this.camera.position.set(0, 0, this.camDist);
    this.camera.updateMatrixWorld();
    this.grandPack.root.visible = false;
    for (const p of this.plates) p.mesh.visible = false;
    this.beams.set(0, 0, 0);
    this.pillar.set(0, 0, 0);
    this.ring.set(0, 0);
    delete this.opts.lift.parentElement?.dataset.walk;
    delete this.opts.lift.parentElement?.dataset.pack;
    this.tileU.uDark.value = 0;
    this.bgU.uDark.value = 0;
    this.bokehU.uDark.value = 0;
    this.heroU.uShade.value = 0;
    this.board.el.hidden = true;
    this.boardFlash.style.opacity = "0";
    this.liftW = 0;
    this.made = null;
    this.flash.visible = false;
    this.giftHalo.visible = false;
    this.sparks.visible = false;
    this.sparkU.uT.value = -10;
    this.hidden = null;
    this.light.on = false;
    this.restSince = performance.now();
    this.slotsDirty = true;
    this.frameU.uAlpha.value = 0;
    this.tileU.uLock.value = 0;
    this.dimTo(0, 0.5);
    s.resolve();
  }
}
