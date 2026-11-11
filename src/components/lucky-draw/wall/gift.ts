import * as THREE from "three";

/**
 * The gift the winner's tile becomes on the wall's screen (the owner, 2026-11-11: "open like a gift box ... animated,
 * gift box opening, it should open in a nice style"): a box in black paper with a fine gold pattern, tied with gold
 * satin ribbon and a bow, a tag on its front with the winner's Trip ID. Inside it is light. When it opens, the lid lifts
 * away, light pours up out of it, and the boarding pass rises from it (./stage.ts plays all that; this only builds the
 * box and sets one moment of it, `set`).
 */

/** The box's size, world units: its body, and the lid that sits over its top. */
export const BOX = { w: 2.0, h: 1.45, d: 2.0, lidW: 2.14, lidH: 0.38, overlap: 0.1 };
/** Where the box's open top is, in the gift's own space (the pass rises from here). */
export const RIM_Y = BOX.h / 2;

export interface GiftMoment {
  /** The whole gift lifted (a hop), and squashed (+) or stretched (-) as it lands and springs. */
  hop: number;
  squash: number;
  /** The closed lid trembling, in radians. */
  tremble: number;
  /** Light leaking round the closed lid, 0 to 1. */
  seam: number;
  /** The lid lifted off and away, 0 (closed) to 1 (gone up and back), and faded out. */
  open: number;
  lidFade: number;
  /** The light from inside: the beams' height and strength, and the lamp. */
  beams: number;
  light: number;
}

const beamVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.x *= 1.0 + uv.y * 1.6;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const beamFragment = /* glsl */ `
  uniform float uAmount;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float a = pow(max(across, 0.0), 1.8) * pow(1.0 - vUv.y, 1.25) * uAmount;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/** A loop of the bow: an oval that starts and ends at the knot, reaching out along +x. */
class LoopCurve extends THREE.Curve<THREE.Vector3> {
  constructor() {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * Math.PI * 2;
    return target.set(0.3 * (1 - Math.cos(a)), 0.15 * Math.sin(a), 0);
  }
}

export class Gift {
  /** Where the stage puts the gift, and turns it to face the room. */
  readonly root = new THREE.Group();
  /** The box with its lid: what hops. */
  private readonly body = new THREE.Group();
  private readonly lid = new THREE.Group();
  private readonly lidY = RIM_Y + BOX.lidH / 2 - BOX.overlap;
  private readonly lidMaterials: THREE.Material[] = [];
  private readonly seam: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private readonly lamp: THREE.PointLight;
  private readonly beams = new THREE.Group();
  private readonly beamMaterial: THREE.ShaderMaterial;
  private readonly owned: { dispose(): void }[] = [];

  constructor(wrap: THREE.Texture, tag: THREE.Texture, inside: THREE.Texture) {
    const { w, h, d, lidW, lidH } = BOX;
    const keep = <T extends { dispose(): void }>(x: T) => {
      this.owned.push(x);
      return x;
    };
    const paper = keep(new THREE.MeshPhysicalMaterial({ map: wrap, roughness: 0.58, clearcoat: 0.32, clearcoatRoughness: 0.32, envMapIntensity: 0.42 }));
    const ribbon = keep(new THREE.MeshStandardMaterial({ color: 0xe0b45a, metalness: 0.88, roughness: 0.3, envMapIntensity: 1.1 }));
    // Inside the box: light, so an open box glows from within (no lamp needs to reach into it).
    const light = keep(new THREE.MeshBasicMaterial({ map: inside, toneMapped: false }));

    // The body: paper on five faces, the light on its open top (+y is the third of a box's six faces).
    const base = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), [paper, paper, light, paper, paper, paper]);
    this.body.add(base);
    // The ribbon down each side of the body.
    const band = 0.32;
    const thin = 0.012;
    const sideZ = keep(new THREE.BoxGeometry(band, h, thin));
    const sideX = keep(new THREE.BoxGeometry(thin, h, band));
    for (const z of [d / 2 + thin / 2, -d / 2 - thin / 2]) {
      const m = new THREE.Mesh(sideZ, ribbon);
      m.position.z = z;
      this.body.add(m);
    }
    for (const x of [w / 2 + thin / 2, -w / 2 - thin / 2]) {
      const m = new THREE.Mesh(sideX, ribbon);
      m.position.x = x;
      this.body.add(m);
    }

    // The light round a closed lid as it is about to open.
    this.seam = new THREE.Mesh(
      keep(new THREE.BoxGeometry(w + 0.05, 0.05, d + 0.05)),
      keep(new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
    );
    this.seam.position.y = RIM_Y - BOX.overlap - 0.03;
    this.body.add(this.seam);

    // The lid: paper, the ribbon crossing it, and the bow on top. Its own materials, so it can fade as it flies off.
    const lidPaper = keep(paper.clone());
    const lidRibbon = keep(ribbon.clone());
    for (const m of [lidPaper, lidRibbon]) {
      m.transparent = true;
      this.lidMaterials.push(m);
    }
    this.lid.add(new THREE.Mesh(keep(new THREE.BoxGeometry(lidW, lidH, lidW)), lidPaper));
    this.lid.add(new THREE.Mesh(keep(new THREE.BoxGeometry(band + 0.02, lidH + 0.012, lidW + 0.012)), lidRibbon));
    this.lid.add(new THREE.Mesh(keep(new THREE.BoxGeometry(lidW + 0.012, lidH + 0.012, band + 0.02)), lidRibbon));

    // The bow: two loops of flat satin ribbon leaning back from a knot, and two tails down over the front.
    const bow = new THREE.Group();
    bow.position.y = lidH / 2 + 0.02;
    const loop = keep(new THREE.TubeGeometry(new LoopCurve(), 72, 0.017, 8, true));
    loop.scale(1, 1, 6.2);
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(loop, lidRibbon);
      m.scale.x = side;
      m.rotation.z = side * 0.5;
      g.add(m);
      g.rotation.x = -0.62;
      g.rotation.y = side * -0.12;
      bow.add(g);
    }
    const knot = new THREE.Mesh(keep(new THREE.SphereGeometry(0.1, 20, 14)), lidRibbon);
    knot.scale.set(1.3, 0.95, 1.25);
    knot.position.y = 0.04;
    bow.add(knot);
    const tail = keep(new THREE.BoxGeometry(0.17, 0.014, 0.56));
    tail.translate(0, 0, 0.28);
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(tail, lidRibbon);
      m.position.set(side * 0.04, 0.0, 0.02);
      m.rotation.set(0.12, side * 0.5, 0);
      bow.add(m);
    }
    this.lid.add(bow);
    this.lid.position.y = this.lidY;
    this.body.add(this.lid);

    // The tag on the front, the Trip ID of the person it is for, on a gold thread from the ribbon.
    const tagMaterial = keep(new THREE.MeshBasicMaterial({ map: tag, transparent: true, toneMapped: false }));
    const tagMesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.78, 0.39)), tagMaterial);
    tagMesh.position.set(0.58, RIM_Y - 0.56, d / 2 + 0.03);
    tagMesh.rotation.z = -0.09;
    this.body.add(tagMesh);
    const thread = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6)), ribbon);
    thread.position.set(0.26, RIM_Y - 0.42, d / 2 + 0.025);
    thread.rotation.z = 1.0;
    this.body.add(thread);

    // The light pouring out: a sheaf of soft beams from the open top, and a warm lamp just above it.
    this.beamMaterial = keep(
      new THREE.ShaderMaterial({
        uniforms: { uAmount: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.86, 0.56) } },
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    const beamGeometry = keep(new THREE.PlaneGeometry(1, 1));
    beamGeometry.translate(0, 0.5, 0);
    for (let k = 0; k < 7; k++) {
      const m = new THREE.Mesh(beamGeometry, this.beamMaterial);
      m.rotation.y = (k * Math.PI) / 7;
      m.scale.set(0.7 + (k % 3) * 0.22, 1, 1);
      m.renderOrder = 5;
      this.beams.add(m);
    }
    this.beams.position.y = RIM_Y;
    this.beams.scale.y = 0.001;
    this.body.add(this.beams);
    this.lamp = new THREE.PointLight(0xffcf7a, 0, 7, 1.6);
    this.lamp.position.y = RIM_Y + 0.5;
    this.body.add(this.lamp);

    this.root.add(this.body);
    this.root.visible = false;
  }

  /** One moment of the opening. */
  set(m: GiftMoment, time: number) {
    this.body.position.y = m.hop;
    this.body.scale.set(1 + m.squash * 0.5, 1 - m.squash, 1 + m.squash * 0.5);
    // The lid pops up a little, tips back and drops away behind the box, gone as it falls (it never rises over the
    // screen's words).
    const o = m.open;
    this.lid.position.set(-0.35 * o, this.lidY + 0.95 * o - 0.55 * o * o, -1.5 * o);
    this.lid.rotation.set(-1.0 * o, 0.2 * o, m.tremble + 0.25 * o);
    const lidOpacity = 1 - m.lidFade;
    for (const mat of this.lidMaterials) mat.opacity = lidOpacity;
    this.lid.visible = lidOpacity > 0.01;
    this.seam.material.opacity = m.seam * (1 - Math.min(1, o * 4));
    this.beams.scale.y = Math.max(0.001, m.beams) * 4.4;
    this.beams.rotation.y = time * 0.22;
    this.beamMaterial.uniforms.uAmount.value = m.beams * 0.95;
    this.beams.visible = m.beams > 0.002;
    this.lamp.intensity = m.light * 26;
  }

  dispose() {
    for (const x of this.owned) x.dispose();
  }
}
