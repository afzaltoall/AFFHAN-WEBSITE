import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { DrawCardPublic, DrawPoolEntry } from "@/lib/lucky-draw-shared";
import { placeOfTrip } from "./drum";
import { FACE_H, FACE_W, INSIDE, PASS_H, PASS_W, TAG_H, TAG_W, WRAP, drawFace, drawInside, drawPass, drawTag, drawWrap, type Fonts } from "./faces";
import { Gift, RIM_Y, type GiftMoment } from "./gift";
import {
  GRID,
  TAIL_T,
  flatX,
  mod,
  openingRows,
  pathAt,
  personAt,
  planStop,
  rollAt,
  startRoll,
  stretchFor,
  walkAhead,
  walkLand,
  walkStart,
  type Cell,
  type Roll,
  type Segment,
  type Walk,
} from "./grid";

/**
 * A draw on the wall: pressed at `start` (ms); the rows' roll from then; the light's way; once the server has answered,
 * where the rows stop and when the light lands (seconds from the press).
 */
interface Run {
  start: number;
  done: (landed: boolean) => void;
  roll: Roll;
  walk: Walk;
  plan: { end: number; cut: number } | null;
  landAt: number | null;
}

/**
 * The lucky draw's wall, drawn in 3D on the TV (the owner, 2026-11-11, with four pictures of video walls: "like opening
 * a gift box"; then "filled completely, the users rolling, curved, facing the screen"; "not blurred ... one box of
 * light, moving everywhere, for real, not like magic"; "up and down too, in every direction ... a genuine random draw").
 *
 * Everyone in the draw is a box in rows of names, a gently curved wall facing the room, its rows as many as the view
 * between the screen's words and its seats holds whole (opts.view), each row in Trip ID order and rolling slowly left
 * while it waits (./grid.ts). A press: one box of light runs over the names, a box at a time, across, up, down and
 * corner to corner, quick at first and then ever slower, while the rows roll on by a screen, calmly, bringing in new
 * names; its last step lands on the person the server drew. Their box lifts out of the wall, turns, and is a gift; the
 * gift hops, its lid flies off, light pours out, and their boarding pass rises out of it and holds the screen for three
 * seconds; then it goes down into its seat, and the rows roll on.
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
}

/** A tile's state: as it is, a winner (gold), or out of the wall (the winner's, while it is a gift). */
const GOLD = 1;
const HIDDEN = 2;
/** Columns a second the rows roll while they wait: a name about every five and a half seconds. */
const DRIFT = 0.18;
/** Seconds the rows stay still after they come to rest, before they roll on, and the seconds they take to get going. */
const DRIFT_AFTER = 2.5;
const DRIFT_EASE = 1.6;
/** Seconds the boxes the light has passed over keep a fading glow: its trail across the wall. */
const TRAIL = 0.9;

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

const tileVertex = /* glsl */ `
  attribute vec3 aPos;
  attribute float aCell;
  attribute float aFlag;
  attribute float aLit;
  uniform float uAtlasCols;
  uniform vec2 uCellUV;
  uniform float uCurve;
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
    // The wall curves gently towards the room, each tile turned to face it (./grid.ts): aPos is its place on the flat.
    float th = aPos.x / uCurve;
    float c = cos(th);
    float s = sin(th);
    vec3 w = vec3(uCurve * s + p.x * c, aPos.y + p.y, uCurve * (1.0 - c) + p.x * s);
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
  uniform vec2 uTile;
  uniform float uWords;
  uniform float uDim;
  uniform float uTime;
  uniform float uIdle;
  uniform float uLock;
  uniform vec2 uRes;
  // The selected tile's centre (x, y) and whether a tile is selected (z).
  uniform vec3 uSel;
  varying vec2 vUv;
  varying vec2 vCenter;
  varying float vFlag;
  varying float vHasCell;
  varying vec2 vCell;
  varying vec3 vWorld;
  varying float vLit;
  void main() {
    vec2 q = (vUv - 0.5) * uTile;
    float rad = 0.075;
    vec2 dd = abs(q) - (uTile * 0.5 - rad);
    float sdf = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - rad;
    float aa = fwidth(sdf) * 1.2;
    float inside = 1.0 - smoothstep(-aa, aa, sdf);
    if (inside < 0.004) discard;
    float edge = 1.0 - smoothstep(0.0, aa + 0.012, abs(sdf + 0.017));
    float gold = (vFlag > 0.5 && vFlag < 1.5) ? 1.0 : 0.0;
    // The box the light is on: lit, and brighter still as it locks.
    float picked = uSel.z * (1.0 - step(0.05, abs(vCenter.x - uSel.x))) * (1.0 - step(0.05, abs(vCenter.y - uSel.y)));
    // The rows run off the screen's left and right edges; their far ends fall a little into shadow.
    vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
    float vig = 1.0 - 0.3 * smoothstep(0.7, 1.45, length(ndc * vec2(0.82, 1.0)));
    float bright = vig * (1.0 - 0.74 * uDim * (1.0 - picked));
    // Glass: deep violet, lighter towards the top, a soft sheen at its upper left.
    vec3 glass = mix(vec3(0.045, 0.032, 0.115), vec3(0.115, 0.082, 0.255), vUv.y);
    glass += vec3(0.07, 0.055, 0.14) * pow(max(0.0, 1.0 - length(q / uTile - vec2(-0.28, 0.36)) * 1.7), 2.0);
    glass = mix(glass, vec3(0.20, 0.14, 0.06) + glass * 0.6, gold * 0.55);
    float words = 0.0;
    if (vHasCell > 0.5) words = texture2D(uAtlas, vCell + vec2(vUv.x, 1.0 - vUv.y) * uCellUV).a;
    vec3 ink = mix(vec3(0.95, 0.94, 1.0), vec3(1.0, 0.87, 0.55), gold);
    // The light's trail: the boxes it has just passed over take its gold, fading.
    float trail = vLit * vLit * (1.0 - picked);
    vec3 line = mix(vec3(0.45, 0.35, 1.0), vec3(1.0, 0.80, 0.42), max(gold, smoothstep(0.04, 0.4, trail)));
    // A slow light passing over the wall while it waits.
    float d = vWorld.x * 0.085 - vWorld.y * 0.24 - (mod(uTime * 0.13, 2.8) - 1.4);
    float sweep = exp(-d * d * 36.0) * uIdle;
    vec3 col = glass + ink * words * uWords;
    col += line * edge * (0.5 + 0.5 * gold + sweep * 1.5 + picked * (0.8 + 1.2 * uLock) + trail * 0.9);
    col += vec3(1.0, 0.85, 0.5) * picked * (0.06 + 0.12 * uLock) + vec3(1.0, 0.84, 0.5) * trail * 0.04;
    col *= bright * (1.0 + picked * (0.25 + 0.4 * uLock));
    gl_FragColor = vec4(col, inside);
  }
`;

const heroFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uTile;
  uniform float uGlow;
  varying vec2 vUv;
  void main() {
    vec2 q = (vUv - 0.5) * uTile;
    float rad = 0.075;
    vec2 dd = abs(q) - (uTile * 0.5 - rad);
    float sdf = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - rad;
    float aa = fwidth(sdf) * 1.2;
    float inside = 1.0 - smoothstep(-aa, aa, sdf);
    if (inside < 0.004) discard;
    float edge = 1.0 - smoothstep(0.0, aa + 0.012, abs(sdf + 0.017));
    vec3 glass = mix(vec3(0.10, 0.07, 0.16), vec3(0.24, 0.17, 0.30), vUv.y);
    float words = texture2D(uMap, vUv).a;
    vec3 col = glass + vec3(1.0, 0.9, 0.62) * words + vec3(1.0, 0.82, 0.45) * edge * (1.2 + uGlow);
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
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 d = (vUv - vec2(0.5, 0.57)) * vec2(uRes.x / uRes.y, 1.0);
    float r = length(d);
    vec3 col = mix(vec3(0.150, 0.092, 0.330), vec3(0.068, 0.040, 0.170), smoothstep(0.0, 0.62, r));
    col = mix(col, vec3(0.016, 0.011, 0.040), smoothstep(0.5, 1.25, r));
    col += vec3(0.09, 0.05, 0.20) * exp(-pow((vUv.y - 0.57) * 3.4, 2.0)) * 0.5;
    // A grain under a step of the TV's own, so the dark gradient never bands.
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
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r = length(q);
    if (r > 1.0) discard;
    float disc = smoothstep(1.0, 0.8, r);
    float ring = smoothstep(0.68, 0.94, r) * smoothstep(1.0, 0.94, r);
    float a = (disc * 0.5 + ring * 0.55) * vAlpha;
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
  private fresh = 0;

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
    for (let c = 0; c < this.cells; c++) {
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
  private light: { on: boolean; walk: Walk; t: number } = { on: false, walk: walkStart({ r: 0, c: 0 }, 0), t: Infinity };
  /** When the light last came to rest on someone (ms), for its flash; and the rows coming to rest after a failed draw. */
  private landFlash = 0;
  private coast: { roll: Roll; start: number } | null = null;
  /** When the wall last came to rest (it rolls on slowly a moment later), and the last frame's time. */
  private restSince = performance.now();
  private lastFrame = performance.now();
  private opened = false;
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
    const rim = new THREE.DirectionalLight(0x8a6bff, 2.2);
    rim.position.set(-6, 3, -5);
    this.scene.add(key, rim);

    // The room: a deep violet night behind the wall.
    this.bgU = { uRes: { value: new THREE.Vector2(16, 9) }, uTime: { value: 0 } };
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
      [0.48, 0.36, 1.0],
      [0.25, 0.42, 1.0],
      [0.75, 0.32, 1.0],
      [1.0, 0.78, 0.42],
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
    this.bokehU = { uTime: { value: 0 }, uScale: { value: 500 } };
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
    this.litArr = new Float32Array(this.cap);
    this.litAttr = new THREE.InstancedBufferAttribute(this.litArr, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aPos", this.posAttr);
    geometry.setAttribute("aCell", this.cellAttr);
    geometry.setAttribute("aFlag", this.flagAttr);
    geometry.setAttribute("aLit", this.litAttr);
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
      uWords: { value: 1 },
      uDim: { value: 0 },
      uTime: { value: 0 },
      uIdle: { value: 1 },
      uLock: { value: 0 },
    };
    const tiles = new THREE.Mesh(geometry, keep(new THREE.ShaderMaterial({ uniforms: this.tileU, vertexShader: tileVertex, fragmentShader: tileFragment, alphaToCoverage: true })));
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
    this.heroU = { uMap: { value: this.heroTex }, uTile: { value: new THREE.Vector2(this.grid.tileW, this.grid.tileH) }, uGlow: { value: 0 } };
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
    opts.lift.appendChild(this.liftRoot);

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
    void this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
    this.gift.root.visible = false;
    // A practice pass, drawn once while the screen opens and nothing moves: the canvas's own first-time work (126 ms,
    // measured) is then done before the first winner's pass is drawn.
    this.warmTimer = window.setTimeout(() => {
      if (this.disposed || this.run || this.show || this.steps.length) return;
      const practice: DrawCardPublic = { id: "", number: 0, tripId: "TRIP-26-00000", name: "Affhan International", city: "Chennai", country: "India", drawnAt: new Date().toISOString(), poolSize: 0, round: 1, seat: 1, out: false };
      for (const step of this.makeSteps(practice).slice(0, 3)) step();
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
    return pathAt(this.light.walk.cells, this.light.walk.times, this.light.t);
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
    this.light = { on: true, walk: walkStart({ r, c }, 0), t: Infinity };
    this.landFlash = performance.now();
    this.slotsDirty = true;
    this.opts.onRest?.(tripId);
  }

  /** A winner shown: the light goes, and the rows roll on slowly (`instant`: the screen opening, nothing to undo). */
  restAfter(_tripId: string, instant = false) {
    if (this.run || instant) return;
    this.light.on = false;
    this.restSince = performance.now();
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
   * The press: the rows gather pace and the light comes on in the middle and sets off searching. Settles true when it
   * lands on someone (land), false when not (halt).
   */
  spin(): Promise<boolean> {
    this.finish();
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      this.rows = w.entries;
      this.gold = w.gold;
    }
    this.fillRows();
    this.dimTo(0, 0.2);
    this.litAt.clear();
    this.coast = null;
    const r = this.middleRow();
    const c = Math.floor(this.p) + Math.ceil(this.grid.cols / 2);
    const walk = walkStart({ r, c }, Math.floor(Math.random() * 8));
    this.light = { on: true, walk, t: 0 };
    this.slotsDirty = true;
    return new Promise((done) => {
      this.run = { start: performance.now(), done, roll: startRoll(this.p, this.drift), walk, plan: null, landAt: null };
    });
  }

  /**
   * The person drawn is known (`i`, their place on the wall). The rows roll on and come to rest a little after STOP_AT
   * (./grid.ts planStop); from the first column not yet on the screen, every row gets a new stretch of names in Trip ID
   * order from a random place, and the drawn person's row (chosen at random) the stretch that puts them, in their own
   * place, in a box chosen at random. The light searches on, slows once the rows are still, and lands on them.
   */
  land(i: number) {
    const r = this.run;
    const n = this.rows.length;
    if (!r || r.plan || !n) return;
    const t = this.elapsed(r);
    this.fillRows();
    const { td, end, cut } = planStop(this.grid, r.roll, t);
    r.roll.td = td;
    const row = Math.floor(Math.random() * this.rowsShown);
    const col = end + 1 + Math.floor(Math.random() * this.grid.cols);
    const inView = end + this.grid.cols + 2 - cut;
    for (let k = 0; k < this.segs.length; k++) {
      if (k === row) {
        this.segs[k].push(stretchFor(i, n, cut, col));
        continue;
      }
      // Nobody else's new names show the drawn person too.
      let start = Math.floor(Math.random() * n);
      for (let tries = 0; tries < 12 && n > inView && mod(i - start, n) < inView; tries++) start = Math.floor(Math.random() * n);
      this.segs[k].push({ from: cut, start });
    }
    r.plan = { end, cut };
    r.landAt = td + r.roll.dec + TAIL_T;
    walkLand(r.walk, { r: row, c: col }, r.landAt);
    this.watch(r);
  }

  /** Nobody drawn (the draw failed): the light goes out at once, and the rows slow to a stop on their own. */
  halt() {
    const r = this.run;
    if (!r || r.plan) return;
    const t = this.elapsed(r);
    this.run = null;
    window.clearTimeout(this.dog);
    this.coast = { roll: { ...r.roll, td: Math.max(r.roll.acc, t) }, start: r.start };
    this.light.on = false;
    this.restSince = performance.now();
    this.opts.onRest?.(null);
    r.done(false);
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
    const target = r.walk.target;
    if (r.plan && target) {
      this.p = r.plan.end;
      const w = r.walk;
      const last = w.cells[w.cells.length - 1];
      this.light = last.r === target.r && last.c === target.c && w.sched?.length === 0 ? { on: true, walk: w, t: Infinity } : { on: true, walk: walkStart(target, w.dir), t: Infinity };
      this.landFlash = performance.now();
    } else this.light.on = false;
    this.drift = 0;
    this.restSince = performance.now();
    this.slotsDirty = true;
    this.opts.onRest?.(this.framed());
    r.done(!!(r.plan && target));
  };

  /**
   * The person drawn, known while the rows still roll (the server has answered): their gift's tag and their pass are
   * made as the rows come to rest, when a frame that takes longer moves nothing anyone can see, rather than
   * at the stop, where it held the gold frame's flare still for a tenth of a second (measured).
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
        this.liftCard.style.opacity = "0";
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
      const show: Show = { card, start: performance.now(), seat: o.seat, onSeat: o.onSeat, resolve, timers: [], risen: null, from: pos.clone().add(new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn)).multiplyScalar(0.06)), turn, seatRect: null, burst: false, seated: false };
      show.timers.push(
        window.setTimeout(() => {
          if (this.show === show && !show.seated) {
            show.seated = true;
            o.onSeat();
          }
        }, TL.seat * 1000),
        window.setTimeout(() => {
          if (this.show === show) this.endShow();
        }, TL.end * 1000),
      );
      this.show = show;
    });
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
    const { p, v } = this.position(now, r, t);
    this.p = p;
    // The drawn person's gift and pass made, a step a frame, as the rows come to rest (or between draws): never while
    // the light searches over rolling names, where a slower frame would show.
    if (this.steps.length && (!r || (r.plan && t > r.roll.td + r.roll.dec - 0.3 && Math.abs(v) < 0.5))) (this.steps.shift() as () => void)();
    // The light's way planned a little ahead; the run is over when it lands, on the person drawn.
    if (r) {
      walkAhead(r.walk, t, (c, at, leave) => this.clear(c, r, at, leave), Math.random);
      this.light.t = t;
      if (r.landAt !== null && t >= r.landAt) this.finish();
    }
    this.place(this.p);
    if (this.atlas.pump(12, this.frameNo) > 0) this.slotsDirty = true;
    const quiet = !this.run && !this.show ? 1 : 0;
    this.idle += (quiet - this.idle) * 0.04;
    const u = this.tileU;
    u.uWords.value = 1;
    u.uTime.value = time;
    u.uIdle.value = this.idle;
    u.uDim.value = this.dimAt(now);
    // The box of light, gliding over the wall; the box it is over lit, and those it has passed glowing after it.
    const sel = u.uSel.value as THREE.Vector3;
    const L = this.light;
    if (L.on) {
      const at = this.cellPos(this.lightAt());
      this.frameMesh.position.set(at.pos.x + Math.sin(at.turn) * 0.06, at.pos.y, at.pos.z + Math.cos(at.turn) * 0.06);
      this.frameMesh.rotation.set(0, at.turn, 0);
      const box = this.lightCell();
      const lit = this.cellPos(box, this.tmpV2);
      sel.set(lit.x, lit.y, 1);
      if (this.run) this.litAt.set(`${box.r}:${box.c}`, now / 1000);
    } else sel.z = 0;
    if (this.show) this.pose((now - this.show.start) / 1000, time);
    else {
      u.uLock.value = 0;
      this.frameU.uAlpha.value = L.on ? 1 : 0;
      this.frameU.uGlow.value = 1.1 + 1.6 * Math.exp(-((now - this.landFlash) / 1000) * 6);
    }
    this.bgU.uTime.value = time;
    this.bokehU.uTime.value = time;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Where the rows are (columns) and their pace (columns a second) now. At a draw, its roll from the press (gathering
   * pace from their drift, so nothing jerks). After a failed draw, coming to rest. Otherwise they roll on slowly (the
   * owner: "users roll"), a moment after they came to rest, getting going gently; never while a winner is shown or the
   * light is on someone.
   */
  private position(now: number, r: Run | null, t: number): { p: number; v: number } {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (r) {
      this.drift = 0;
      return rollAt(r.roll, t);
    }
    if (this.coast) {
      const ct = (now - this.coast.start) / 1000;
      const q = rollAt(this.coast.roll, ct);
      if (ct < this.coast.roll.td + this.coast.roll.dec) return q;
      this.coast = null;
      this.restSince = now;
      this.p = q.p;
    }
    const since = (now - this.restSince) / 1000 - DRIFT_AFTER;
    if (!this.show && !this.light.on && since > 0) this.drift = DRIFT * smooth(since, 0, DRIFT_EASE);
    else this.drift = Math.max(0, this.drift - (DRIFT / 0.8) * dt);
    return { p: this.p + this.drift * dt, v: this.drift };
  }

  /**
   * A box the light may be on from `at` until it leaves at `leave` (seconds from the press): in a row of the view, and
   * whole on the screen all that while as the rows roll (they only move one way, so its ends tell).
   */
  private clear(c: Cell, r: Run, at: number, leave: number): boolean {
    if (c.r < 0 || c.r >= this.rowsShown) return false;
    return c.c >= rollAt(r.roll, leave).p + 0.75 && c.c <= rollAt(r.roll, at).p + this.grid.cols + 0.25;
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
    this.atlas.restart();
    let idx = 0;
    for (let row = 0; row < this.rowsShown && idx < this.cap; row++) {
      const y = this.yTop - row * g.pitchY;
      const segs = this.segs[row] ?? this.segs[0];
      for (let c = c0; c <= c0 + g.cols + 1 && idx < this.cap; c++, idx++) {
        this.posArr[idx * 3] = flatX(g, c, p);
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
      }
    }
    this.tilesGeometry.instanceCount = idx;
    this.posAttr.needsUpdate = true;
    this.cellAttr.needsUpdate = true;
    this.flagAttr.needsUpdate = true;
    this.litAttr.needsUpdate = true;
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
    const left = ((r.landAt ?? 0) - this.elapsed(r)) * 1000;
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
    const rows = Math.max(1, Math.min(MAX_ROWS, Math.floor((hi - lo + gap) / g.pitchY + 1e-6)));
    const span = rows * g.pitchY - gap;
    const mid = Math.min(hi - span / 2, Math.max(lo + span / 2, (y0 + y1) / 2));
    this.rowsShown = rows;
    this.yTop = mid + span / 2 - g.tileH / 2;
    this.viewMid = 1 - f0 - f1;
    this.giftAt.set(0, this.viewMid * GIFT_DIST * tan - GIFT_BELOW, -GIFT_DIST);
    this.camera.localToWorld(this.giftAt);
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

  /** Sparks: a fountain from the gift's open top as the lid goes, and gold dust round the pass while it holds. */
  private burst(from: THREE.Vector3, hold: THREE.Vector3) {
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
      [0.74, 0.64, 1.0],
    ];
    for (let i = 0; i < n; i++) {
      const h = hues[i % 11 === 0 ? 3 : i % 3 === 0 ? 2 : i % 2];
      color.setXYZ(i, h[0], h[1], h[2]);
      if (i < fountain) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.75;
        pos.setXYZ(i, from.x + Math.cos(a) * r, from.y, from.z + Math.sin(a) * r);
        const spread = 0.6 + Math.random() * 1.5;
        vel.setXYZ(i, Math.cos(a) * spread, 2.6 + Math.random() * 3.3, Math.sin(a) * spread + 0.8 + Math.random() * 1.6);
        born.setX(i, Math.random() * 0.9);
        life.setX(i, 1.3 + Math.random() * 1.4);
        size.setX(i, 0.05 + Math.random() * 0.11);
      } else {
        pos.setXYZ(i, hold.x + (Math.random() - 0.5) * PASS_WORLD_W * 1.4, hold.y + (Math.random() - 0.5) * PASS_WORLD_H * 1.4, hold.z - 0.1 - Math.random() * 0.3);
        vel.setXYZ(i, (Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.18, 0);
        born.setX(i, TL.placed - TL.pop - 0.2 + Math.random() * 2.2);
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
    // The stop: the frame flares, the tile in it lights, the rest of the wall dims.
    u.uLock.value = smooth(t, 0, 0.18) * (1 - smooth(t, TL.out, TL.out + 0.2));
    u.uDim.value = 0.78 * smooth(t, 0.1, 0.6) * (1 - smooth(t, TL.seat - 0.1, TL.end));
    this.frameU.uGlow.value = 0.9 + 2.6 * bell(t, 0, 0.75);
    // The light stays on the tile until it leaves the wall, then goes (the tile is a gift now).
    this.frameU.uAlpha.value = 1 - smooth(t, TL.out, TL.out + 0.35);
    if (t >= TL.out && !this.hidden) {
      this.hidden = this.lightCell();
      this.slotsDirty = true;
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
      this.burst(rim, this.holdAt(new THREE.Vector3()));
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
    const { r, hx, hy, w, h } = this.liftSize();
    let cx = hx;
    let cy = hy + Math.sin((t - TL.placed) * 1.15) * r.height * 0.003;
    let sc = 1;
    if (t >= TL.leave) {
      if (!s.seatRect) s.seatRect = s.seat() ?? new DOMRect(r.left + r.width * 0.42, r.top + r.height * 0.8, r.width * 0.16, r.height * 0.15);
      const k = easeInOut((t - TL.leave) / (TL.seat - TL.leave));
      const sr = s.seatRect;
      cx = hx + (sr.left + sr.width / 2 - hx) * k;
      cy = hy + (sr.top + sr.height / 2 - hy) * k;
      sc = 1 + (sr.width / w - 1) * k;
    }
    const on = t >= TL.placed ? 1 : 0;
    this.liftCard.style.transform = `translate3d(${(cx - (w * sc) / 2).toFixed(1)}px, ${(cy - (h * sc) / 2).toFixed(1)}px, 0) scale(${sc.toFixed(4)})`;
    this.liftCard.style.opacity = String(on * (1 - smooth(t, TL.seat - 0.06, TL.end - 0.02)));
    this.liftGlow.style.transform = `translate3d(${(cx - (w * 1.7 * sc) / 2).toFixed(1)}px, ${(cy - (h * 2.1 * sc) / 2).toFixed(1)}px, 0) scale(${sc.toFixed(4)})`;
    this.liftGlow.style.opacity = String(on * 0.9 * (1 - smooth(t, TL.leave, TL.leave + 0.35)));
    const k = clamp01((t - TL.placed - 0.3) / 1.15);
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
    this.passGroup.visible = false;
    this.liftRoot.hidden = true;
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
