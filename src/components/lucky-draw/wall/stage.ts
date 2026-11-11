import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { DrawCardPublic, DrawPoolEntry } from "@/lib/lucky-draw-shared";
import { endOf, halt, mod, plan, reelAt, type Run } from "../reel";
import { DRUM, blur, nextFree, placeOfTrip, shows } from "./drum";
import { FACE_H, FACE_W, INSIDE, PASS_H, PASS_W, TAG_H, TAG_W, WRAP, drawFace, drawInside, drawPass, drawTag, drawWrap, type Fonts } from "./faces";
import { Gift, RIM_Y, type GiftMoment } from "./gift";

/**
 * The lucky draw's wall, drawn in 3D on the TV (the owner, 2026-11-11, with four pictures of video walls: "look how
 * they are ... animated, innovative ... like opening a gift box"). Everyone in the draw is a tile on a drum, the names
 * in one spiral in Trip ID order, a gold frame at the front. A press turns the drum: it gathers pace, the names streak
 * into light, then it slows until the last names can be read as they pass the frame, and stops with the person the
 * server drew in it (the same arithmetic as the list's, ./reel.ts). Their tile lifts out of the wall towards the room,
 * turns, and is a gift; the gift hops, its lid flies off, light pours out, and their boarding pass rises out of it and
 * holds the screen for three seconds; then it goes down into its seat, and the frame moves on to the next person.
 *
 * Built not to stick: every moment is worked out from the clock, never from how many frames were drawn, and timers
 * finish a run and a reveal even when the browser stops drawing (./DrawWall.tsx checks the result, not the picture).
 * Only the tiles near the front carry words, drawn into one texture as they are needed; the rest of the wall is glass
 * and light. No mobile number ever reaches it.
 */

export interface StageOptions {
  fonts: Fonts;
  /** A layer of the page over everything (the seats too), where the pass is shown once it faces the room. */
  lift: HTMLElement;
  /** Seats in a round (the pass's stub says "of 5"). */
  seats: number;
  /** The Trip ID in the frame each time the drum comes to rest (or stops on someone), null with nobody on the wall. */
  onRest?: (tripId: string | null) => void;
  /** Called once if this screen draws too slowly to keep the wall (the page then shows the list instead). */
  onSlow?: () => void;
}

/** A tile's state, per slot: as it is, a winner (gold), out of the wall (the winner's, while it is a gift), blank. */
const GOLD = 1;
const HIDDEN = 2;
const BLANK = 3;

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
  attribute float aJ;
  attribute float aCell;
  attribute float aFlag;
  uniform float uFrac;
  uniform float uPerTurn;
  uniform float uRadius;
  uniform float uPitchY;
  uniform float uAtlasCols;
  uniform vec2 uCellUV;
  uniform float uBlur;
  varying vec2 vUv;
  varying float vFacing;
  varying float vRow;
  varying float vFlag;
  varying float vHasCell;
  varying vec2 vCell;
  varying float vJ;
  varying vec3 vWorld;
  void main() {
    float j = aJ - uFrac;
    float ang = 6.28318530718 * j / uPerTurn;
    float c = cos(ang);
    float s = sin(ang);
    // Level rows: a name moves down to the next row behind the drum, where nobody sees it (./drum.ts).
    float row = floor(j / uPerTurn + 0.5);
    vec3 p = position;
    // At speed the tiles of a row close up into one ribbon (see the fragment shader).
    p.x *= 1.0 + uBlur * 0.1;
    vec3 w = vec3(c * p.x + s * uRadius, p.y - uPitchY * row, -s * p.x + c * uRadius - uRadius);
    vUv = uv;
    vFacing = c;
    vRow = row;
    vFlag = aFlag;
    vJ = j;
    vWorld = w;
    vHasCell = aCell >= 0.0 ? 1.0 : 0.0;
    float cell = max(aCell, 0.0);
    vCell = vec2(mod(cell, uAtlasCols), floor(cell / uAtlasCols)) * uCellUV;
    bool gone = c < -0.08 || (aFlag > 1.5 && aFlag < 2.5);
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
  uniform float uBlur;
  varying vec2 vUv;
  varying float vFacing;
  varying float vRow;
  varying float vFlag;
  varying float vHasCell;
  varying vec2 vCell;
  varying float vJ;
  varying vec3 vWorld;
  void main() {
    vec2 q = (vUv - 0.5) * uTile;
    float rad = 0.075;
    vec2 dd = abs(q) - (uTile * 0.5 - rad);
    float sdf = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - rad;
    float aa = fwidth(sdf) * 1.2;
    // At speed a tile is cut only top and bottom: the row runs on as one band.
    float sdfY = abs(q.y) - uTile.y * 0.5;
    float insideRow = 1.0 - smoothstep(-aa, aa, sdfY);
    float inside = mix(1.0 - smoothstep(-aa, aa, sdf), insideRow, uBlur);
    if (inside < 0.004) discard;
    float edge = 1.0 - smoothstep(0.0, aa + 0.012, abs(sdf + 0.017));
    float gold = (vFlag > 0.5 && vFlag < 1.5) ? 1.0 : 0.0;
    float blank = vFlag > 2.5 ? 1.0 : 0.0;
    // Where it is: facing the room, and how many rows from the frame's.
    float face = smoothstep(-0.05, 0.92, vFacing);
    float band = 1.0 - 0.72 * smoothstep(1.2, 2.2, abs(vRow)) - 0.28 * smoothstep(2.2, 3.2, abs(vRow));
    float framed = uLock * (1.0 - smoothstep(0.3, 0.6, abs(vJ)));
    float bright = (0.16 + 0.84 * face) * (0.2 + 0.8 * band) * (1.0 - 0.74 * uDim * (1.0 - framed));
    // Glass: deep violet, lighter towards the top, a soft sheen at its upper left.
    vec3 glass = mix(vec3(0.045, 0.032, 0.115), vec3(0.115, 0.082, 0.255), vUv.y);
    glass += vec3(0.07, 0.055, 0.14) * pow(max(0.0, 1.0 - length(q / uTile - vec2(-0.28, 0.36)) * 1.7), 2.0);
    glass = mix(glass, vec3(0.20, 0.14, 0.06) + glass * 0.6, gold * 0.55);
    // The words, near the front, at rest or slowing.
    float words = 0.0;
    if (vHasCell > 0.5 && blank < 0.5) {
      words = texture2D(uAtlas, vCell + vec2(vUv.x, 1.0 - vUv.y) * uCellUV).a;
    }
    float readable = uWords * smoothstep(0.45, 0.86, vFacing) * (1.0 - smoothstep(1.2, 1.8, abs(vRow)));
    vec3 ink = mix(vec3(0.95, 0.94, 1.0), vec3(1.0, 0.87, 0.55), gold);
    vec3 line = mix(vec3(0.45, 0.35, 1.0), vec3(1.0, 0.80, 0.42), gold);
    // A slow light passing over the wall while it waits.
    float d = vWorld.x * 0.085 - vWorld.y * 0.24 - (mod(uTime * 0.13, 2.8) - 1.4);
    float sweep = exp(-d * d * 36.0) * uIdle;
    vec3 col = glass + ink * words * readable;
    col += line * edge * (0.5 + 0.5 * gold + sweep * 1.5 + framed * 1.4);
    col += vec3(1.0, 0.85, 0.5) * framed * 0.16;
    // At speed, rows of light streaming past: bright along their top and bottom edges, softer inside, rippling the
    // way the drum turns. No tile can be followed by the eye at that pace, so none is drawn: nothing strobes.
    float v = abs(q.y) / (uTile.y * 0.5);
    float rim = exp(-(1.0 - v) * (1.0 - v) * 60.0);
    float ripple = 0.72 + 0.28 * sin(vWorld.x * 2.6 + uTime * 9.0 + vRow * 1.7);
    vec3 ribbon = (vec3(0.07, 0.05, 0.18) + vec3(0.36, 0.27, 0.95) * (0.16 + 0.55 * rim) * ripple) * (1.0 + gold * 0.4);
    col = mix(col, ribbon, uBlur);
    col *= bright * (1.0 + framed * 0.5);
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
 * as the drum turns, one new name reaches the front of each row and one leaves. A cell not used lately is drawn over.
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

  /** A new round of asking: the tiles ask again for what they need, the nearest the frame first. */
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
  /** Where the pass goes down to: the seat on the page. */
  seatRect: DOMRect | null;
  burst: boolean;
  seated: boolean;
}

/** The camera, where the room sees the wall from: a little below the frame, looking slightly up at it. */
const CAM = new THREE.Vector3(0, -0.95, 12.6);
const LOOK = new THREE.Vector3(0, -0.5, 0);
const FOV = 30;
/** The frame, at the front of the drum; the gift, between the wall and the room, a little below the frame. */
const FRAME_AT = new THREE.Vector3(0, 0, 0.06);
const GIFT_AT = new THREE.Vector3(0, -0.95, 5.6);
const GIFT_SCALE = 0.62;
const GIFT_YAW = -0.62;
const GIFT_TILT = 0.36;
/** The pass, world units: 2048 × 1000 pixels. */
const PASS_WORLD_W = 2.2;
const PASS_WORLD_H = (PASS_WORLD_W * PASS_H) / PASS_W;
/** Where the pass holds the screen: far enough from the room to be just over half its width, a little above the middle. */
const HOLD_DIST = 4.28;
const HOLD_UP = 0.14;

export class WallStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 90);
  private readonly drum = DRUM;
  private readonly J = Math.ceil(DRUM.perTurn * 3.6);
  private readonly count = 2 * this.J + 1;
  /** Slots nearest the frame first: their faces are asked for first. */
  private readonly order: number[];
  private readonly cellArr: Float32Array;
  private readonly flagArr: Float32Array;
  private readonly cellAttr: THREE.InstancedBufferAttribute;
  private readonly flagAttr: THREE.InstancedBufferAttribute;
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
  /** A wall read while the drum was running or a gift was open, put in when it stops. */
  private waiting: { entries: DrawPoolEntry[]; gold: ReadonlySet<string> } | null = null;
  /** Where the drum rests: the place in the frame. */
  private at = 0;
  /** Before the first run: nothing comes before Trip ID 1 (the owner: "starting ... trip 1 erundhu start aganum"). */
  private opening = true;
  private run: (Run & { start: number; done: (landed: boolean) => void }) | null = null;
  private glide: { from: number; to: number; start: number; T: number } | null = null;
  private show: Show | null = null;
  private dim = { from: 0, to: 0, start: 0, T: 1 };
  private idle = 1;
  private hiddenId: string | null = null;
  private slotBase = Number.NaN;
  private slotsDirty = true;
  private fast = false;
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

    this.camera.position.copy(CAM);
    this.camera.lookAt(LOOK);

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

    // The drum: one plane, drawn once for every slot of the spiral, each slot placed by the shader.
    this.atlas = new FaceAtlas(this.renderer, opts.fonts);
    this.owned.push(this.atlas);
    const plane = keep(new THREE.PlaneGeometry(this.drum.tileW, this.drum.tileH));
    const geometry = keep(new THREE.InstancedBufferGeometry());
    geometry.index = plane.index;
    geometry.setAttribute("position", plane.getAttribute("position"));
    geometry.setAttribute("uv", plane.getAttribute("uv"));
    const js = new Float32Array(this.count);
    for (let k = 0; k < this.count; k++) js[k] = k - this.J;
    this.cellArr = new Float32Array(this.count).fill(-1);
    this.flagArr = new Float32Array(this.count);
    geometry.setAttribute("aJ", new THREE.InstancedBufferAttribute(js, 1));
    this.cellAttr = new THREE.InstancedBufferAttribute(this.cellArr, 1).setUsage(THREE.DynamicDrawUsage);
    this.flagAttr = new THREE.InstancedBufferAttribute(this.flagArr, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aCell", this.cellAttr);
    geometry.setAttribute("aFlag", this.flagAttr);
    geometry.instanceCount = this.count;
    this.order = Array.from({ length: this.count }, (_, k) => k).sort((a, b) => Math.abs(a - this.J) - Math.abs(b - this.J));
    this.tileU = {
      uFrac: { value: 0 },
      uPerTurn: { value: this.drum.perTurn },
      uRadius: { value: this.drum.radius },
      uPitchY: { value: this.drum.pitchY },
      uTile: { value: new THREE.Vector2(this.drum.tileW, this.drum.tileH) },
      uAtlas: { value: this.atlas.texture },
      uAtlasCols: { value: this.atlas.cols },
      uCellUV: { value: this.atlas.uv },
      uWords: { value: 1 },
      uBlur: { value: 0 },
      uDim: { value: 0 },
      uTime: { value: 0 },
      uIdle: { value: 1 },
      uLock: { value: 0 },
    };
    const tiles = new THREE.Mesh(geometry, keep(new THREE.ShaderMaterial({ uniforms: this.tileU, vertexShader: tileVertex, fragmentShader: tileFragment, alphaToCoverage: true })));
    tiles.frustumCulled = false;
    this.scene.add(tiles);

    // The gold frame at the front of the drum: where it stops is who is drawn.
    const frameSize = new THREE.Vector2(this.drum.tileW + 0.8, this.drum.tileH + 0.8);
    this.frameU = { uSize: { value: frameSize }, uTile: { value: new THREE.Vector2(this.drum.tileW, this.drum.tileH) }, uGlow: { value: 1 }, uAlpha: { value: 1 } };
    this.frameMesh = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(frameSize.x, frameSize.y)),
      keep(new THREE.ShaderMaterial({ uniforms: this.frameU, vertexShader: plainVertex, fragmentShader: frameFragment, transparent: true, depthWrite: false })),
    );
    this.frameMesh.position.copy(FRAME_AT);
    this.frameMesh.renderOrder = 3;
    this.scene.add(this.frameMesh);

    // The winner's tile as it leaves the wall: drawn four times larger, so it stays sharp as it comes near.
    this.heroCanvas.width = FACE_W * 2;
    this.heroCanvas.height = FACE_H * 2;
    this.heroTex = keep(new THREE.CanvasTexture(this.heroCanvas));
    this.heroTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.heroU = { uMap: { value: this.heroTex }, uTile: { value: new THREE.Vector2(this.drum.tileW, this.drum.tileH) }, uGlow: { value: 0 } };
    this.hero = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(this.drum.tileW, this.drum.tileH)),
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
    this.gift.root.position.copy(GIFT_AT);
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

  /** The Trip ID in the frame now, while the drum is at rest. */
  framed(): string | null {
    const n = this.rows.length;
    return n ? this.rows[mod(Math.round(this.at), n)][0] : null;
  }

  /** The wall's people (in Trip ID order) and its winners: the person in the frame stays in it (or the one after). */
  setRows(entries: DrawPoolEntry[], gold: ReadonlySet<string>) {
    // Never while the drum moves (a run, a reveal, the frame gliding on): put in when it rests.
    if (this.run || this.show || this.glide) {
      this.waiting = { entries, gold };
      return;
    }
    const here = this.framed();
    this.rows = entries;
    this.gold = gold;
    const n = entries.length;
    this.at = here && n ? mod(placeOfTrip(entries, here), n) : 0;
    this.slotsDirty = true;
    this.rested();
  }

  /** The drum at rest with this Trip ID in the frame (or where it would be). */
  restOn(tripId: string) {
    if (this.run || !this.rows.length) return;
    this.glide = null;
    this.at = mod(placeOfTrip(this.rows, tripId), this.rows.length);
    this.slotsDirty = true;
    this.rested();
  }

  /**
   * The frame moves on from this Trip ID to the next person who can still be drawn (the owner: "so next person"),
   * gliding there, or at once (`instant`: the screen opening after draws have been made).
   */
  restAfter(tripId: string, instant = false) {
    const n = this.rows.length;
    if (this.run || !n) return;
    if (this.glide) this.endGlide();
    const i = placeOfTrip(this.rows, tripId);
    let to = i < n && this.rows[i][0] === tripId ? nextFree(this.rows, this.gold, i) : mod(i, n);
    if (this.gold.has(this.rows[to][0])) to = nextFree(this.rows, this.gold, to);
    let d = mod(to - this.at, n);
    if (d > n / 2) d -= n;
    if (instant) this.opening = false;
    if (d === 0 || instant) {
      this.at = to;
      this.slotsDirty = true;
      this.rested();
      return;
    }
    this.glide = { from: this.at, to: this.at + d, start: performance.now(), T: Math.min(1.4, 0.7 + Math.abs(d) * 0.04) };
  }

  /** Someone drawn, on the wall: their place, or one made for them if they joined after the wall was read. */
  ensure(entry: DrawPoolEntry): number {
    const i = placeOfTrip(this.rows, entry[0]);
    if (this.rows[i]?.[0] === entry[0]) return i;
    this.rows = [...this.rows.slice(0, i), entry, ...this.rows.slice(i)];
    this.slotsDirty = true;
    return i;
  }

  /** The drum starts to turn. Settles true when it stops on someone (land), false when on nobody (halt). */
  spin(): Promise<boolean> {
    this.finish();
    if (this.glide) this.endGlide();
    this.dimTo(0, 0.2);
    return new Promise((done) => {
      this.run = { p0: this.at, plan: null, halt: null, start: performance.now(), done };
    });
  }

  /** The person drawn is known: the rest of the run, to their place. */
  land(target: number) {
    const r = this.run;
    if (!r || r.plan || r.halt || !this.rows.length) return;
    r.plan = plan(r.p0, this.elapsed(r), target, this.rows.length);
    this.watch(r);
  }

  /** Nobody drawn (the draw failed): the drum slows to a stop. */
  halt() {
    const r = this.run;
    if (!r || r.plan || r.halt) return;
    r.halt = halt(r, this.elapsed(r));
    this.watch(r);
  }

  /** Stops whatever is running at once, where it would have ended. */
  finish = () => {
    const r = this.run;
    if (!r) return;
    this.run = null;
    window.clearTimeout(this.dog);
    const n = this.rows.length;
    const end = r.plan ? r.plan.target : r.halt ? r.halt.to : reelAt(r, this.elapsed(r)).p;
    this.at = n ? mod(Math.round(end), n) : 0;
    this.opening = false;
    this.slotsDirty = true;
    if (this.waiting && !r.plan) {
      const w = this.waiting;
      this.waiting = null;
      this.setRows(w.entries, w.gold);
    }
    this.rested();
    r.done(!!r.plan);
  };

  /**
   * The person drawn, known while the drum still turns (the server has answered): their gift's tag and their pass are
   * made in the drum's last, slowest moments, when a frame that takes longer moves nothing anyone can see, rather than
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
    return new Promise((resolve) => {
      const show: Show = { card, start: performance.now(), seat: o.seat, onSeat: o.onSeat, resolve, timers: [], risen: null, seatRect: null, burst: false, seated: false };
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
    const { p, v } = this.position(now);
    // The drawn person's gift and pass made, a step a frame, once the drum is nearly still (or has stopped).
    if (this.steps.length && (!this.run || (this.run.plan && Math.abs(v) < 2.2))) (this.steps.shift() as () => void)();
    const b = blur(v);
    const fast = b > 0.97;
    if (fast !== this.fast) {
      this.fast = fast;
      this.slotsDirty = true;
    }
    this.refreshSlots(p);
    if (this.atlas.pump(fast ? 0 : 12, this.frameNo) > 0) this.slotsDirty = true;
    const quiet = !this.run && !this.glide && !this.show ? 1 : 0;
    this.idle += (quiet - this.idle) * 0.04;
    const u = this.tileU;
    u.uFrac.value = p - Math.floor(p);
    u.uWords.value = 1 - b;
    // The ribbons only once the names are gone, and gone again before they come back.
    u.uBlur.value = smooth(b, 0.55, 1);
    u.uTime.value = time;
    u.uIdle.value = this.idle;
    u.uDim.value = this.dimAt(now);
    if (this.show) this.pose((now - this.show.start) / 1000, time);
    else {
      u.uLock.value = 0;
      this.frameU.uGlow.value = 0.85 + 0.15 * Math.sin(time * 1.6) * this.idle;
    }
    this.bgU.uTime.value = time;
    this.bokehU.uTime.value = time;
    this.renderer.render(this.scene, this.camera);
  }

  /** The drum's position (in places) and pace (places a second) now. */
  private position(now: number): { p: number; v: number } {
    const r = this.run;
    if (r) {
      const t = this.elapsed(r);
      if (t >= endOf(r)) {
        this.finish();
        return { p: this.at, v: 0 };
      }
      return reelAt(r, t);
    }
    const g = this.glide;
    if (g) {
      const s = Math.min(1, (now - g.start) / (g.T * 1000));
      if (s >= 1) {
        this.endGlide();
        return { p: this.at, v: 0 };
      }
      return { p: g.from + (g.to - g.from) * easeInOut(s), v: 0 };
    }
    return { p: this.at, v: 0 };
  }

  private endGlide() {
    const g = this.glide;
    if (!g) return;
    this.glide = null;
    const n = this.rows.length;
    this.at = n ? mod(Math.round(g.to), n) : 0;
    this.slotsDirty = true;
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      this.setRows(w.entries, w.gold);
    } else this.rested();
  }

  /** Each slot's tile: who it is now, gold or out of the wall, and its face's cell when it is near enough to read. */
  private refreshSlots(p: number) {
    const base = Math.floor(p);
    if (base === this.slotBase && !this.slotsDirty) return;
    this.slotBase = base;
    this.slotsDirty = false;
    this.atlas.restart();
    const n = this.rows.length;
    for (const k of this.order) {
      const j = k - this.J;
      const raw = base + j;
      let cell = -1;
      let flag = 0;
      if (!n || (this.opening && raw < 0)) flag = BLANK;
      else {
        const e = this.rows[mod(raw, n)];
        if (e[0] === this.hiddenId) flag = HIDDEN;
        else if (this.gold.has(e[0])) flag = GOLD;
        if (!this.fast && shows(this.drum, j)) cell = this.atlas.cell(e, this.frameNo);
      }
      this.cellArr[k] = cell;
      this.flagArr[k] = flag;
    }
    this.cellAttr.needsUpdate = true;
    this.flagAttr.needsUpdate = true;
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
  private watch(r: Run & { start: number }) {
    window.clearTimeout(this.dog);
    const left = (endOf(r) - this.elapsed(r)) * 1000;
    this.dog = window.setTimeout(this.finish, Math.max(0, left) + 400);
  }

  private rested() {
    this.opts.onRest?.(this.framed());
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

  private resize() {
    const host = this.canvas.parentElement;
    const w = Math.max(1, host?.clientWidth ?? window.innerWidth);
    const h = Math.max(1, host?.clientHeight ?? window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const px = this.renderer.getPixelRatio() * h;
    const scale = px / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    this.bokehU.uScale.value = scale;
    this.sparkU.uScale.value = scale;
    this.bgU.uRes.value.set(w, h);
  }

  // ---- the reveal ----

  /** Where the pass holds the screen: in front of the room, a little above the middle, facing it squarely. */
  private holdAt(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, HOLD_UP, -HOLD_DIST);
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
    this.frameU.uAlpha.value = 1 - 0.85 * smooth(t, 0.9, 1.5) * (1 - smooth(t, TL.seat - 0.1, TL.end));
    if (t >= TL.out && this.hiddenId !== s.card.tripId) {
      this.hiddenId = s.card.tripId;
      this.slotsDirty = true;
    }

    // The tile comes out of the wall towards the room, turning; half way round, it is a gift.
    const heroOn = t >= TL.out && t < TL.flip;
    this.hero.visible = heroOn;
    if (heroOn) {
      const k = (t - TL.out) / (TL.flip - TL.out);
      const e = easeInOut(k);
      this.hero.position.lerpVectors(FRAME_AT, GIFT_AT, e);
      this.hero.position.y += Math.sin(Math.PI * k) * 0.45;
      this.hero.scale.setScalar(1 - 0.3 * e);
      this.hero.rotation.set(GIFT_TILT * e, (-Math.PI / 2) * easeIn(k), 0);
      this.heroU.uGlow.value = k * 1.5;
    }
    this.flash.visible = t > TL.flip - 0.15 && t < TL.flip + 0.4;
    if (this.flash.visible) {
      (this.flash.material as THREE.SpriteMaterial).opacity = bell(t, TL.flip - 0.15, TL.flip + 0.4) * 0.95;
      this.flash.position.copy(GIFT_AT);
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
      this.gift.root.position.set(GIFT_AT.x, GIFT_AT.y - 2.6 * sink, GIFT_AT.z);
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
    this.hiddenId = null;
    this.slotsDirty = true;
    this.frameU.uAlpha.value = 1;
    this.tileU.uLock.value = 0;
    this.dimTo(0, 0.5);
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      this.setRows(w.entries, w.gold);
    }
    s.resolve();
  }
}
