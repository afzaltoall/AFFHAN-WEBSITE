import * as THREE from "three";

/**
 * The grand opening the winner is revealed in, as a card pack's walkout (the owner, 2026-11-12: "a grand opening,
 * zooming in one by one ... after the selection something comes, then the opening, with effects and animations ...
 * truly a grand opening of a card, FIFA style"; a flat ticket with words over it read as "a scrap of paper flying").
 * As a walkout runs (the pack, its flare, the details one at a time, each its own shot, the card last), in AFFHAN's
 * black and gold, in seconds from the light's landing:
 *
 *  - the winner's ticket spins out of the wall towards the room and, in a flash, is a gold foil pack, the AFFHAN
 *    Winner Pack, that lands in the middle with a jolt; spotlights sweep, a flare rises behind it; it trembles,
 *    light at its seams, and its top tears off, light bursting out;
 *  - their Trip ID, cast in gold, zooms in out of the dark and lands with a shock, a glint running over it; it rushes
 *    past the room, and their city (and country) swings in the same way;
 *  - the spotlights close in, embers rise, the light pulses; a burst, and their card spins in out of it and lands in
 *    the middle, rays turning behind it, for its three seconds, then down into its seat as the screen lights again.
 *
 * ./stage.ts plays it (poseGrand); this module holds its moments, its motion and its pieces.
 */

export const TG = {
  lock: 0.2,
  /** The ticket out of the wall, spinning towards the room; in a flash at `swap`, the pack; landed at `pack`. */
  out: 0.1,
  swap: 0.5,
  pack: 0.85,
  /**
   * The pack waits here, floating under the spotlights, until it is opened by hand (the owner, 2026-11-12: "we click
   * the pack to open it"): a click on the screen, or a Draw key or the clicker. Its every moment after this counts from
   * the opening.
   */
  wait: 1.5,
  /** It charges (trembling, light at its seams, the flare rising), and its top tears off. */
  charge: 1.8,
  tear: 2.9,
  /** The Trip ID: out of the dark, landed, rushing past. */
  plate1: 3.15,
  land1: 3.75,
  through1: 5.15,
  /** The place, the same way. */
  plate2: 5.45,
  land2: 6.05,
  through2: 7.45,
  /** The spotlights close in, embers rise, the light pulses; the burst, and the card spins in. */
  build: 7.7,
  burst: 8.8,
  placed: 9.6,
  leave: 12.6,
  seat: 13.25,
  end: 13.45,
} as const;

/** The two details, in the order they come (the owner: "first the Trip ID, next the place"). */
export const PLATES = [
  { in: TG.plate1, land: TG.land1, through: TG.through1, side: 1 },
  { in: TG.plate2, land: TG.land2, through: TG.through2, side: -1 },
] as const;

/** How far from the room a plate is (world units): deep in the dark, where it lands, where it drifts to, rushing past. */
export const PLATE_FAR = 46;
export const PLATE_HOLD = 8.2;
export const PLATE_DRIFT = 7.4;
export const PLATE_PAST = 1.1;
/** Seconds a plate takes to rush past the room. */
export const PAST_T = 0.32;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};

/**
 * A plate `t` seconds from the landing: whether it shows, how far from the room it is, its swing (radians), how much
 * of it shows, where its glint is (0 to 1 across it; outside: none), and its heat (the glow as it lands).
 */
export function plateAt(k: 0 | 1, t: number): { on: boolean; dist: number; swing: number; alpha: number; glint: number; heat: number } {
  const p = PLATES[k];
  const off = { on: false, dist: PLATE_FAR, swing: 0, alpha: 0, glint: -1, heat: 0 };
  if (t < p.in || t > p.through + PAST_T) return off;
  if (t < p.land) {
    // Zooming in out of the dark, fast and then slowing, turning to face the room; it lands at once at its place.
    const x = (t - p.in) / (p.land - p.in);
    const e = 1 - (1 - x) ** 4;
    return { on: true, dist: PLATE_FAR + (PLATE_HOLD - PLATE_FAR) * e, swing: p.side * 0.9 * (1 - e) ** 2, alpha: smooth(x * 3), glint: -1, heat: smooth((x - 0.7) / 0.3) };
  }
  if (t < p.through) {
    // Landed: drifting closer, slowly; the glint runs across it once; its heat cooling.
    const x = (t - p.land) / (p.through - p.land);
    return { on: true, dist: PLATE_HOLD + (PLATE_DRIFT - PLATE_HOLD) * x, swing: 0, alpha: 1, glint: (t - p.land - 0.2) / 0.9, heat: 1 - smooth((t - p.land) / 0.9) };
  }
  // Rushing past the room.
  const x = (t - p.through) / PAST_T;
  return { on: true, dist: PLATE_DRIFT + (PLATE_PAST - PLATE_DRIFT) * x * x * x, swing: 0, alpha: 1 - smooth(x), glint: -1, heat: 0 };
}

/** The jolts: the pack landing, tearing, each plate landing, the card landing; how strong each is. */
export const IMPACTS: readonly { at: number; strength: number }[] = [
  { at: TG.pack, strength: 1 },
  { at: TG.tear, strength: 0.55 },
  { at: TG.land1, strength: 0.8 },
  { at: TG.land2, strength: 0.8 },
  { at: TG.placed, strength: 0.7 },
];

/** The room shaken by the jolts at `t` (world units at the middle of the view): sharp, dying in about half a second. */
export function shakeAt(t: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const j of IMPACTS) {
    const d = t - j.at;
    if (d < 0 || d > 0.6) continue;
    const a = 0.055 * j.strength * Math.exp(-d * 9);
    x += a * Math.sin(d * 61);
    y += a * Math.cos(d * 47) * 0.8;
  }
  return { x, y };
}

/** The shock ring after the latest jolt: how far it has spread (0 to 1) and how bright it is; none after 0.7 s. */
export function ringAt(t: number): { on: boolean; at: number; spread: number; alpha: number } {
  let last: { at: number; strength: number } | null = null;
  for (const j of IMPACTS) if (t >= j.at && t - j.at < 0.7) last = j;
  if (!last) return { on: false, at: 0, spread: 0, alpha: 0 };
  const d = (t - last.at) / 0.7;
  return { on: true, at: last.at, spread: 1 - (1 - d) ** 3, alpha: (1 - d) ** 2 * last.strength };
}

// ---- the pieces ----

/** The pack, world units: its size, and where its top tears off (a fraction of its height from its foot). */
export const PACK = { w: 1.5, h: 2.15, cut: 0.875 };

const packVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vBulge;
  void main() {
    vUv = uv;
    vec3 p = position;
    // Puffed as a sealed foil pack is: full in the middle, flat at its sides and its crimped ends.
    float bx = 1.0 - pow(abs(uv.x * 2.0 - 1.0), 2.2);
    float by = 1.0 - pow(abs((uv.y - 0.5) / 0.46), 6.0);
    float b = max(0.0, bx) * clamp(by, 0.0, 1.0);
    p.z += 0.11 * b;
    vBulge = b;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const packFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uGlow;
  uniform float uPart;
  uniform float uCut;
  uniform float uOpen;
  uniform float uFade;
  varying vec2 vUv;
  varying float vBulge;
  float tri(float x) { return abs(fract(x) - 0.5) * 2.0; }
  void main() {
    // The body below the tear, the strip above it.
    if (uPart < 0.5 && vUv.y > uCut) discard;
    if (uPart > 0.5 && vUv.y <= uCut) discard;
    // Its crimped ends: a zigzag edge.
    float zig = 0.012 * tri(vUv.x * 46.0);
    if (vUv.y > 1.0 - zig || vUv.y < zig) discard;
    vec2 q = (vUv - 0.5) * vec2(1.5, 2.15);
    // Warm gold, its light running slowly across it (as the tickets' foil), finely lined.
    float band = 0.5 + 0.5 * sin(q.x * 2.1 + q.y * 3.3 - uTime * 0.55);
    vec3 c = mix(vec3(0.50, 0.34, 0.10), vec3(0.86, 0.66, 0.30), smoothstep(0.0, 0.62, band));
    c = mix(c, vec3(1.0, 0.91, 0.64), smoothstep(0.78, 1.0, band));
    c *= 0.92 + 0.06 * sin((q.x - q.y) * 140.0);
    // The crimped bands, ridged.
    float crimp = step(vUv.y, 0.075) + step(0.925, vUv.y);
    c *= 1.0 - 0.2 * crimp * (0.5 + 0.5 * sin(vUv.x * 320.0));
    // Its volume: the full middle catching the light, the sides falling away.
    c *= 0.7 + 0.4 * vBulge;
    // A light sweeping over it now and then.
    float s = vUv.x * 0.8 - vUv.y * 0.6 - (mod(uTime * 0.35, 2.6) - 0.9);
    c += vec3(1.0, 0.9, 0.65) * exp(-s * s * 60.0) * 0.3 * vBulge;
    if (gl_FrontFacing) c = mix(c, vec3(0.15, 0.09, 0.02), texture2D(uMap, vUv).a * 0.9);
    // Charged: light at its edges and seams.
    float edge = 1.0 - smoothstep(0.0, 0.07, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
    float seam = (1.0 - smoothstep(0.0, 0.012, abs(vUv.y - uCut))) * (uPart < 0.5 ? 1.0 : 0.0);
    c += vec3(1.0, 0.88, 0.6) * (edge + seam) * uGlow;
    c += vec3(1.0, 0.92, 0.7) * uGlow * 0.07;
    // Torn open: light pouring out of the opening.
    if (uPart < 0.5) c += vec3(1.0, 0.95, 0.8) * uOpen * smoothstep(uCut - 0.16, uCut, vUv.y) * 2.6;
    gl_FragColor = vec4(c * (1.0 - uFade), 1.0);
  }
`;

/** The AFFHAN Winner Pack: a gold foil pack, its body and the strip along its top that tears off. */
export class GoldPack {
  readonly root = new THREE.Group();
  /** The strip, turning about the tear as it comes away. */
  readonly strip = new THREE.Group();
  private readonly mats: THREE.ShaderMaterial[] = [];
  private readonly owned: { dispose(): void }[] = [];

  constructor(ink: THREE.Texture) {
    const geometry = new THREE.PlaneGeometry(PACK.w, PACK.h, 24, 40);
    this.owned.push(geometry);
    const yCut = (PACK.cut - 0.5) * PACK.h;
    for (const part of [0, 1]) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: ink }, uTime: { value: 0 }, uGlow: { value: 0 }, uPart: { value: part }, uCut: { value: PACK.cut }, uOpen: { value: 0 }, uFade: { value: 0 } },
        vertexShader: packVertex,
        fragmentShader: packFragment,
        side: THREE.DoubleSide,
      });
      this.mats.push(mat);
      this.owned.push(mat);
      const mesh = new THREE.Mesh(geometry, mat);
      if (part === 0) this.root.add(mesh);
      else {
        mesh.position.y = -yCut;
        this.strip.position.y = yCut;
        this.strip.add(mesh);
        this.root.add(this.strip);
      }
    }
    this.root.visible = false;
  }

  /** One moment: the time (its foil's light), its charge, its opening's light, how far the strip has come away (0 to 1), its fading. */
  set(time: number, glow: number, open: number, torn: number, fade: number) {
    for (const m of this.mats) {
      m.uniforms.uTime.value = time;
      m.uniforms.uGlow.value = glow;
      m.uniforms.uOpen.value = open;
      m.uniforms.uFade.value = fade;
    }
    // The strip tears away at a corner first, then flies up and back, turning.
    this.strip.rotation.set(-1.4 * torn, 0.5 * torn, 0.35 * smooth(torn * 3));
    this.strip.position.x = 0.5 * torn;
    this.strip.position.z = -0.6 * torn;
    this.strip.position.y = (PACK.cut - 0.5) * PACK.h + 1.4 * torn;
    this.strip.visible = torn < 0.98;
  }

  dispose() {
    for (const x of this.owned) x.dispose();
  }
}

const plainVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const plateFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uTexel;
  uniform float uGlint;
  uniform float uAlpha;
  uniform float uHeat;
  varying vec2 vUv;
  void main() {
    // The letters, crisp (red), and blurred (green): their bevel and their glow.
    vec4 m = texture2D(uMap, vUv);
    float face = m.r;
    float soft = m.g;
    float sx = texture2D(uMap, vUv + vec2(uTexel.x * 3.0, 0.0)).g - texture2D(uMap, vUv - vec2(uTexel.x * 3.0, 0.0)).g;
    float sy = texture2D(uMap, vUv + vec2(0.0, uTexel.y * 3.0)).g - texture2D(uMap, vUv - vec2(0.0, uTexel.y * 3.0)).g;
    vec3 n = normalize(vec3(-sx * 2.4, -sy * 2.4, 1.0));
    vec3 L = normalize(vec3(-0.45, 0.55, 0.7));
    float diff = clamp(dot(n, L), 0.0, 1.0);
    float spec = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 18.0);
    // Cast gold: dark in its hollows, bright on its edges, a little lighter towards its top.
    vec3 gold = mix(vec3(0.40, 0.25, 0.06), vec3(0.98, 0.80, 0.42), diff);
    gold = mix(gold, vec3(1.0, 0.96, 0.84), spec * 0.85);
    gold *= 0.88 + 0.22 * vUv.y;
    // The glint, a band of light running across it once it has landed.
    float g = vUv.x - (1.0 - vUv.y) * 0.25 - uGlint;
    gold += vec3(1.0, 0.94, 0.78) * exp(-g * g * 220.0) * 0.95;
    // A warm glow round the letters, strongest as it lands.
    float halo = soft * (1.0 - face) * (0.3 + 0.7 * uHeat);
    vec3 col = gold * face + vec3(1.0, 0.76, 0.36) * halo;
    float a = clamp(face + halo, 0.0, 1.0) * uAlpha;
    gl_FragColor = vec4(col * uAlpha, a);
  }
`;

/** A detail cast in gold (./faces.ts drawPlate draws its letters): a plate the size of the picture's shape. */
export class GoldPlate {
  readonly mesh: THREE.Mesh;
  readonly u: { uMap: THREE.IUniform; uTexel: THREE.IUniform; uGlint: THREE.IUniform; uAlpha: THREE.IUniform; uHeat: THREE.IUniform };
  private readonly owned: { dispose(): void }[] = [];

  constructor(map: THREE.Texture, w: number, h: number, texW: number, texH: number) {
    this.u = { uMap: { value: map }, uTexel: { value: new THREE.Vector2(1 / texW, 1 / texH) }, uGlint: { value: -1 }, uAlpha: { value: 0 }, uHeat: { value: 0 } };
    const geometry = new THREE.PlaneGeometry(w, h);
    const material = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: plainVertex, fragmentShader: plateFragment, transparent: true, premultipliedAlpha: true, depthWrite: false });
    this.owned.push(geometry, material);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 14;
    this.mesh.visible = false;
  }

  dispose() {
    for (const x of this.owned) x.dispose();
  }
}

const beamVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    vY = -position.y;
    gl_Position = projectionMatrix * mv;
  }
`;
const beamFragment = /* glsl */ `
  uniform float uA;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    // A cone of light seen through: brightest where it is seen through most, fading along its length.
    float through = pow(abs(dot(normalize(vN), normalize(vV))), 1.7);
    float a = through * (0.35 + 0.65 * (1.0 - vY)) * smoothstep(0.0, 0.08, vY) * uA;
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.56) * a, a);
  }
`;

/** Spotlights from above, sweeping across the dark, and closing in on the middle before the burst. */
export class LightBeams {
  readonly root = new THREE.Group();
  private readonly beams: THREE.Mesh[] = [];
  private readonly mat: THREE.ShaderMaterial;
  private readonly owned: { dispose(): void }[] = [];

  constructor() {
    const geometry = new THREE.ConeGeometry(1, 1, 48, 1, true);
    geometry.translate(0, -0.5, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 } },
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.owned.push(geometry, this.mat);
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(geometry, this.mat);
      m.renderOrder = 6;
      this.beams.push(m);
      this.root.add(m);
    }
    this.root.visible = false;
  }

  /** How bright, the time (their sweep), and how far they have closed in on the middle (0 apart, 1 together). */
  set(alpha: number, time: number, close: number) {
    this.mat.uniforms.uA.value = alpha;
    this.root.visible = alpha > 0.002;
    this.beams.forEach((m, k) => {
      const side = k < 2 ? -1 : 1;
      const out = k % 2 ? 1 : 0.55;
      const sway = Math.sin(time * (0.55 + 0.17 * k) + k * 1.7) * 0.28 * (1 - close);
      m.position.set(side * out * 4.2, 5.2, -0.6 * k);
      // Leaning in towards the middle (a beam from the left points down and to the right).
      m.rotation.set(0, 0, -side * (0.42 + 0.18 * out) * (1 - 0.55 * close) + sway);
      m.scale.set(1.15 + 0.25 * close, 9.5, 1.15 + 0.25 * close);
    });
  }

  dispose() {
    for (const x of this.owned) x.dispose();
  }
}

const pillarFragment = /* glsl */ `
  uniform float uA;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    // A flare: a hot core rising, soft at its sides, flickering.
    float x = vUv.x - 0.5;
    float core = exp(-x * x * 900.0) + 0.45 * exp(-x * x * 60.0);
    float up = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    float flicker = 0.85 + 0.15 * sin(uTime * 31.0 + vUv.y * 9.0);
    float a = core * up * flicker * uA;
    gl_FragColor = vec4(vec3(1.0, 0.9, 0.66) * a, a);
  }
`;

/** The flare rising behind the pack as it charges. */
export class FlarePillar {
  readonly mesh: THREE.Mesh;
  private readonly u: { uA: THREE.IUniform; uTime: THREE.IUniform };
  private readonly owned: { dispose(): void }[] = [];

  constructor() {
    this.u = { uA: { value: 0 }, uTime: { value: 0 } };
    const geometry = new THREE.PlaneGeometry(1.6, 14);
    geometry.translate(0, 7, 0);
    const material = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: plainVertex, fragmentShader: pillarFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.owned.push(geometry, material);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  set(alpha: number, rise: number, time: number) {
    this.u.uA.value = alpha;
    this.u.uTime.value = time;
    this.mesh.scale.y = Math.max(0.001, rise);
    this.mesh.visible = alpha > 0.002;
  }

  dispose() {
    for (const x of this.owned) x.dispose();
  }
}

const ringFragment = /* glsl */ `
  uniform float uA;
  uniform float uR;
  varying vec2 vUv;
  void main() {
    // A ring of light spreading from a jolt, thinning as it goes.
    float d = length(vUv - 0.5) * 2.0;
    float w = 0.05 + 0.05 * (1.0 - uR);
    float a = exp(-pow((d - uR) / w, 2.0)) * uA;
    gl_FragColor = vec4(vec3(1.0, 0.88, 0.6) * a, a);
  }
`;

/** The shock ring each jolt sends out. */
export class ShockRing {
  readonly mesh: THREE.Mesh;
  private readonly u: { uA: THREE.IUniform; uR: THREE.IUniform };
  private readonly owned: { dispose(): void }[] = [];

  constructor() {
    this.u = { uA: { value: 0 }, uR: { value: 0 } };
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: plainVertex, fragmentShader: ringFragment, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.owned.push(geometry, material);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 15;
    this.mesh.visible = false;
  }

  set(alpha: number, spread: number) {
    this.u.uA.value = alpha;
    this.u.uR.value = spread;
    this.mesh.visible = alpha > 0.002;
  }

  dispose() {
    for (const x of this.owned) x.dispose();
  }
}
