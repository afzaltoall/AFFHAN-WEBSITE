import * as THREE from "three";

/**
 * The golden envelope the winner's ticket becomes on the wall's screen (the owner, 2026-11-12: "golden envelope,
 * award-show style ... the selected card's winner card, full slow-mo, shown on its own"): gold paper with an engraved
 * border, its flap sealed in crimson wax pressed with the AFFHAN mark, "The Winner" and the round and seat on its
 * front, as an award's envelope carries its category. It opens as at an award show: the seal breaks, the flap lifts
 * back on its black lining, light comes from inside, and the winner's card (the boarding pass) slides up out of it,
 * slowly. ./stage.ts plays all that (its moments, TE); this builds the envelope and sets one moment of it (`set`).
 */

/** Its size (world units): the paper, the V its front's opening makes, its flap, and the seal's radius. */
export const ENV = { w: 2.6, h: 1.62, notch: 0.68, flap: 0.94, seal: 0.2 };
/** Where a card rides inside it, between its back (z 0) and its front, and how big it is in there. */
export const CARD_Z = 0.008;
export const CARD_IN = 0.78;
const POCKET_Z = 0.02;
/** The flap's hinge: over the front while it is closed, behind the card once it is open (as a real flap folds from the back). */
const FLAP_Z = 0.026;
const FLAP_OPEN_Z = -0.03;

/**
 * The reveal's moments, seconds from the stop. In slow motion: the winner's ticket rises out of the wall and floats
 * towards the room, turning to face it (out to turn); it turns edge-on over the envelope's place (to flip), and half
 * way round it is the envelope, which settles facing the room (sealed); the seal breaks and the flap lifts back
 * (open); the card slides up out of it, slowly (slide to risen), comes to the room facing it (placed), holds three
 * seconds (to leave; the owner: "3 second katanum podhum") and goes down into its seat.
 */
export const TE = {
  lock: 0.6,
  out: 0.45,
  turn: 2.4,
  flip: 2.95,
  sealed: 3.5,
  open: 4.15,
  slide: 4.65,
  risen: 6.35,
  placed: 7.05,
  leave: 10.05,
  seat: 10.7,
  end: 10.9,
} as const;

export interface EnvelopeMoment {
  /** The flap: 0 closed, 1 lifted back. */
  open: number;
  /** The seal: 0 whole, 1 broken apart and gone. */
  crack: number;
  /** The light inside, 0 to 1. */
  glow: number;
}

/** UVs over a box of the paper (x0, y0: its lower left; w, h: its size), so every part takes its own part of a picture. */
function mapUV(geometry: THREE.BufferGeometry, x0: number, y0: number, w: number, h: number) {
  const pos = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x0) / w, (pos.getY(i) - y0) / h);
  uv.needsUpdate = true;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Envelope {
  /** Where the stage puts the envelope, and turns it to face the room. */
  readonly root = new THREE.Group();
  /** The flap's hinge, along the top edge. */
  private readonly pivot = new THREE.Group();
  private readonly halves: THREE.Mesh[] = [];
  private readonly sealMaterial: THREE.MeshBasicMaterial;
  private readonly glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly owned: { dispose(): void }[] = [];

  constructor(t: { pocket: THREE.Texture; flap: THREE.Texture; lining: THREE.Texture; seal: THREE.Texture; light: THREE.Texture }) {
    const keep = <T extends { dispose(): void }>(x: T) => {
      this.owned.push(x);
      return x;
    };
    const { w, h, notch, flap, seal } = ENV;
    // Gold: the paper's own colours tinted deep gold, so the studio's white light it reflects comes back gold, never
    // cream (an untinted paper read as white on the TV). The lining and the wax are unlit: exactly as drawn.
    const gold = (map: THREE.Texture | null, side: THREE.Side = THREE.FrontSide) =>
      keep(new THREE.MeshStandardMaterial({ map, color: map ? 0xffdc96 : 0xb88a3c, metalness: 0.72, roughness: 0.4, envMapIntensity: 0.62, side }));
    const lining = (side: THREE.Side) => keep(new THREE.MeshBasicMaterial({ map: t.lining, side }));

    // The back: lined inside (seen through the opening), plain gold outside.
    const back = keep(new THREE.PlaneGeometry(w, h));
    this.root.add(new THREE.Mesh(back, lining(THREE.FrontSide)), new THREE.Mesh(back, gold(null, THREE.BackSide)));

    // The light inside, behind where the card rides: it shows through the opening once the flap is up.
    this.glow = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(w * 0.86, h * 0.86)),
      keep(new THREE.MeshBasicMaterial({ map: t.light, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
    );
    this.glow.position.set(0, h * 0.14, 0.003);
    this.glow.visible = false;
    this.root.add(this.glow);

    // The front: the whole paper but for the V its opening makes from the top corners.
    const front = new THREE.Shape();
    front.moveTo(-w / 2, -h / 2);
    front.lineTo(w / 2, -h / 2);
    front.lineTo(w / 2, h / 2);
    front.lineTo(0, h / 2 - notch);
    front.lineTo(-w / 2, h / 2);
    front.closePath();
    const frontGeometry = keep(new THREE.ShapeGeometry(front, 1));
    mapUV(frontGeometry, -w / 2, -h / 2, w, h);
    const pocket = new THREE.Mesh(frontGeometry, gold(t.pocket));
    pocket.position.z = POCKET_Z;
    this.root.add(pocket);

    // The flap, hinged on the top edge: gold outside with the seal at its tip, lined inside.
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, -flap);
    shape.closePath();
    const flapGeometry = keep(new THREE.ShapeGeometry(shape, 1));
    mapUV(flapGeometry, -w / 2, -flap, w, flap);
    this.pivot.add(new THREE.Mesh(flapGeometry, gold(t.flap)), new THREE.Mesh(flapGeometry, lining(THREE.BackSide)));
    this.sealMaterial = keep(new THREE.MeshBasicMaterial({ map: t.seal, transparent: true, depthWrite: false }));
    // The seal in two halves, left and right, that break apart as the flap lifts.
    for (const start of [Math.PI / 2, -Math.PI / 2]) {
      const half = new THREE.Mesh(keep(new THREE.CircleGeometry(seal, 48, start, Math.PI)), this.sealMaterial);
      half.position.set(0, -flap + seal * 1.05, 0.006);
      half.renderOrder = 7;
      this.pivot.add(half);
      this.halves.push(half);
    }
    this.pivot.position.set(0, h / 2, FLAP_Z);
    this.root.add(this.pivot);
    this.root.visible = false;
  }

  /** Where the seal is now, in the world (the sparks come from it as it breaks). */
  sealAt(out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld();
    return this.pivot.localToWorld(out.set(0, -ENV.flap + ENV.seal * 1.05, 0.01));
  }

  /** One moment of the opening. */
  set(m: EnvelopeMoment) {
    // The flap lifts back past upright, leaning away from the room, its hinge going behind the card, so the card rises
    // in front of all of it.
    this.pivot.rotation.x = -1.08 * Math.PI * m.open;
    this.pivot.position.z = FLAP_Z + (FLAP_OPEN_Z - FLAP_Z) * smoothstep(0, 0.6, m.open);
    const c = m.crack;
    this.halves[0].position.x = -0.08 * c;
    this.halves[0].rotation.z = 0.55 * c;
    this.halves[1].position.x = 0.08 * c;
    this.halves[1].rotation.z = -0.55 * c;
    this.sealMaterial.opacity = 1 - smoothstep(0.3, 1, c);
    for (const half of this.halves) half.visible = this.sealMaterial.opacity > 0.01;
    this.glow.material.opacity = m.glow;
    this.glow.visible = m.glow > 0.005;
  }

  dispose() {
    for (const x of this.owned) x.dispose();
  }
}
