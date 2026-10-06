import { CITIES, MAP_PX, MARKETS, schedule } from "./mapNetwork";

/**
 * Chapter 06's light: the China map arrives at night and its market network
 * lights up, out from Guangzhou. Its foot lights first and the skyline after
 * it, then light runs along the printed routes to Shaxi, Baima and New Asia,
 * each pin and name lighting as the light reaches it, down the route to
 * Foshan, which lights in turn, and out to Louvre, Shunde and Sunlink; a
 * ring of light goes out over the ground from each as it lights. Then the
 * rest of the country follows, along its borders first, until the map is
 * exactly as printed (the order and the points are in mapNetwork.ts).
 *
 * Drawn by WebGL from two pictures: the map itself (the <img> the film
 * already loaded) and its field (06-china-map-light.webp, built by
 * scripts/build_trip_map.mjs), which holds when each pixel lights. So every
 * frame is a pure function of the light's progress, like the jump to Foshan
 * (warp.ts): the film scrubs it forwards and back, and draws only when the
 * timeline asks.
 *
 * The canvas lies over the picture and stands in for it once it can: only
 * while the map can't be seen, or once the light has filled it, where the
 * two are the same, so the change never shows. Without WebGL, or if the
 * field fails to load or the context is lost, the picture simply stays, as
 * printed, and the chapter plays as it did before. Never under reduced
 * motion (CinematicExperience does not start it).
 */

export const MAP_LIGHT_SRC = "/free-china-trip/06-china-map-light.webp";

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const RINGS = 2 + Object.keys(MARKETS).length;

// The map's colour, straight alpha; the field: r when the pixel lights, g how
// near a route it is, b how soft its edge is. Night is the map darkened and
// a little drained, its gold lines kept brighter so the routes show before
// they light. The light's front burns as it passes: hottest on a route (its
// head), then on the printed lines (the borders, as the country fills).
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define RINGS ${RINGS}
varying vec2 vUv;
uniform sampler2D uMap;
uniform sampler2D uField;
uniform float uP;
uniform vec2 uPx;
uniform vec4 uRing[RINGS];
uniform float uRingFor[RINGS];
const vec3 HOT = vec3(1.0, 0.95, 0.82);
const vec3 GOLD = vec3(1.0, 0.84, 0.5);
void main() {
  vec4 c = texture2D(uMap, vUv);
  vec3 f = texture2D(uField, vUv).rgb;
  float line = smoothstep(0.32, 0.75, c.g);
  float d = uP - f.r;
  float lit = clamp(d / mix(0.022, 0.085, f.b), 0.0, 1.0);
  lit = lit * lit * (3.0 - 2.0 * lit);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 night = mix(vec3(lum), c.rgb, 0.75) * (0.33 + 0.24 * line);
  vec3 col = mix(night, c.rgb, lit);
  float front = exp(-(d * d) / 0.0004);
  col += HOT * front * (f.g * 1.15 + line * mix(0.3, 0.38, f.b));
  // Rings over the ground: the map is drawn in perspective, so a circle on it is an ellipse 0.42 as tall.
  vec2 at = vUv * uPx;
  float ring = 0.0;
  for (int i = 0; i < RINGS; i++) {
    float k = (uP - uRing[i].z) / uRingFor[i];
    if (k > 0.0 && k < 1.0) {
      vec2 q = at - uRing[i].xy;
      q.y /= 0.42;
      float e = (length(q) - uRing[i].w * (1.0 - (1.0 - k) * (1.0 - k))) / (3.0 + 7.0 * k);
      ring += exp(-e * e) * (1.0 - k) * smoothstep(0.0, 0.1, k);
    }
  }
  col = min(col + GOLD * ring * 0.9, vec3(1.0));
  float a = max(c.a, min(1.0, ring * 0.7));
  gl_FragColor = vec4(col * a, a);
}`;

/** The rings: a city's goes far, a pin's just round it. Centre (map px), start, reach (map px); and how long. */
function rings() {
  const plan = schedule();
  const all = [
    { at: CITIES.guangzhou.disc, t: plan.cities.guangzhou, reach: 230, dur: 0.12 },
    { at: CITIES.foshan.disc, t: plan.cities.foshan, reach: 190, dur: 0.11 },
    ...(Object.keys(MARKETS) as (keyof typeof MARKETS)[]).map((k) => ({ at: MARKETS[k].pin, t: plan.markets[k], reach: 62, dur: 0.07 })),
  ];
  return {
    ring: new Float32Array(all.flatMap((r) => [r.at[0], r.at[1], r.t, r.reach])),
    dur: new Float32Array(all.map((r) => r.dur)),
  };
}

function loaded(img: HTMLImageElement) {
  // The film's loader gives the picture its file when the chapter nears (parts.tsx).
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => reject(new Error("map failed to load")), { once: true });
  });
}

export class MapLight {
  private gl: WebGLRenderingContext | null = null;
  private made: { prog: WebGLProgram; buf: WebGLBuffer; tex: WebGLTexture[] } | null = null;
  private uP: WebGLUniformLocation | null = null;
  private showing = false;
  private dead = false;
  private p = 0;
  private onLost = () => this.stop();

  constructor(
    private canvas: HTMLCanvasElement,
    private img: HTMLImageElement,
  ) {}

  /** Gets ready once the map has loaded; without WebGL it quietly leaves the picture. */
  async start() {
    try {
      await loaded(this.img);
      // The file the <img> chose, again (from the cache): its srcset makes the
      // <img> report a size divided by the screen's density, not the file's.
      const pic = new Image();
      pic.src = this.img.currentSrc || this.img.src;
      const field = new Image();
      field.src = MAP_LIGHT_SRC;
      await Promise.all([pic.decode(), field.decode()]);
      if (this.dead) return;
      this.init(pic, field);
      this.render(this.p);
    } catch {
      this.stop();
    }
  }

  private init(pic: HTMLImageElement, field: HTMLImageElement) {
    const { canvas } = this;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
    if (!gl) throw new Error("no webgl");
    canvas.addEventListener("webglcontextlost", this.onLost);
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) throw new Error("no shader");
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const prog = gl.createProgram();
    const buf = gl.createBuffer();
    if (!prog || !buf) throw new Error("no program");
    const shaders = [shader(gl.VERTEX_SHADER, VERT), shader(gl.FRAGMENT_SHADER, FRAG)];
    shaders.forEach((s) => gl.attachShader(prog, s));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    // Linked, the program keeps what it needs of them.
    shaders.forEach((s) => gl.deleteShader(s));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // The field's numbers must arrive as they are: no colour management, no premultiplying.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    const tex = [pic, field].map((source, unit) => {
      const t = gl.createTexture();
      if (!t) throw new Error("no texture");
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    });
    gl.uniform1i(gl.getUniformLocation(prog, "uMap"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "uField"), 1);
    gl.uniform2f(gl.getUniformLocation(prog, "uPx"), MAP_PX.w, MAP_PX.h);
    const r = rings();
    gl.uniform4fv(gl.getUniformLocation(prog, "uRing"), r.ring);
    gl.uniform1fv(gl.getUniformLocation(prog, "uRingFor"), r.dur);
    this.uP = gl.getUniformLocation(prog, "uP");

    // Drawn at the file's own resolution (1536 or the phone copy's 960), and
    // scaled with the picture by the film's transforms.
    canvas.width = pic.naturalWidth;
    canvas.height = pic.naturalHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    this.gl = gl;
    this.made = { prog, buf, tex };
  }

  /** Draw the light at its progress, 0..1 (animations.ts, chapter 06). */
  render(p: number) {
    this.p = p;
    const gl = this.gl;
    if (!gl || this.dead) return;
    if (!this.showing) {
      const hidden = this.canvas.parentElement ? getComputedStyle(this.canvas.parentElement).visibility === "hidden" : true;
      if (!hidden && p < 1) return;
      this.showing = true;
      this.img.style.visibility = "hidden";
    }
    gl.uniform1f(this.uP, p);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Back to the picture, for good: the film is rebuilt, or the context was lost. */
  private stop() {
    this.dead = true;
    this.img.style.visibility = "";
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    const gl = this.gl;
    if (gl && !gl.isContextLost()) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (this.made) {
        this.made.tex.forEach((t) => gl.deleteTexture(t));
        gl.deleteBuffer(this.made.buf);
        gl.deleteProgram(this.made.prog);
      }
    }
    this.gl = null;
    this.made = null;
  }

  clear() {
    this.stop();
  }
}
