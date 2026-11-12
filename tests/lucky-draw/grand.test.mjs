// The grand opening (src/components/lucky-draw/wall/grand.ts): its moments in the owner's order (the pack, the Trip
// ID, the place, the card), each detail zooming in out of the dark to land at its place and rushing past the room,
// the jolts dying away, and the card held three seconds.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { EMERGE, FIREWORKS, Fireworks, GoldPlate, IMPACTS, PAST_T, PLATES, PLATE_DRIFT, PLATE_FAR, PLATE_HOLD, RayBurst, ShockRing, TG, plateAt, ringAt, shakeAt, shellSpot, warpAt, emergeAt } from "@/components/lucky-draw/wall/grand";

test("the grand opening's moments: the pack, its tearing, the Trip ID, then the place, the burst, the card, its seat", () => {
  const order = ["out", "swap", "pack", "wait", "charge", "tear", "plate1", "land1", "plate2", "through1", "land2", "through2", "build", "burst", "name", "nameLand", "nameOut", "placed", "leave", "seat", "end"];
  for (let k = 1; k < order.length; k++) assert.ok(TG[order[k]] > TG[order[k - 1]], `${order[k - 1]} before ${order[k]}`);
  assert.ok(PLATES[0].in === TG.plate1 && PLATES[1].in === TG.plate2 && PLATES[2].in === TG.name, "first the Trip ID, next the place, finally the name");
  for (const p of PLATES) assert.ok(p.through - p.land >= 1.3 - 1e-9, "each detail held long enough to read from the back of the room");
  for (const k of [1, 2]) assert.ok(PLATES[k - 1].through + PAST_T <= PLATES[k].land, "one detail at a time: each lands once the one before has gone");
  assert.ok(PLATES[1].in <= PLATES[0].through, "the place already on its way in as the Trip ID rushes past: never an empty moment");
  assert.ok(TG.cardIn >= TG.nameOut && TG.cardIn < TG.placed, "the card out of the name's rush");
  assert.ok(Math.abs(TG.leave - TG.placed - 3) < 1e-9, "the card holds the screen three seconds");
  assert.ok(TG.end <= 16);
  assert.ok(TG.wait > TG.pack && TG.wait < TG.charge, "the pack waits to be opened by hand once it has landed, before it charges");
});

test("each detail zooms in out of the dark, lands at its place, drifts a little closer, and rushes past the room", () => {
  for (const k of [0, 1, 2]) {
    const p = PLATES[k];
    assert.equal(plateAt(k, p.in - 0.01).on, false, "not before it comes");
    let last = Infinity;
    for (let t = p.in; t < p.land; t += 0.01) {
      const P = plateAt(k, t);
      assert.ok(P.on && P.dist <= last + 1e-9, "always nearer");
      last = P.dist;
    }
    assert.ok(Math.abs(plateAt(k, p.in).dist - PLATE_FAR) < 1e-9, "out of the dark");
    const landed = plateAt(k, p.land);
    assert.ok(Math.abs(landed.dist - PLATE_HOLD) < 1e-9 && landed.swing === 0 && landed.alpha === 1, "landed at its place, facing the room");
    assert.ok(Math.abs(plateAt(k, p.through).dist - PLATE_DRIFT) < 1e-9, "drifted a little closer");
    assert.ok(plateAt(k, p.through + PAST_T * 0.99).dist < 1.5, "rushing past the room");
    assert.equal(plateAt(k, p.through + PAST_T + 0.01).on, false, "and gone");
    // The glint runs across it after it lands.
    assert.ok(plateAt(k, p.land + 0.6).glint > 0 && plateAt(k, p.land + 0.6).glint < 1);
  }
});

test("the jolts shake the room sharply and die away within half a second; a shock ring spreads from each", () => {
  for (const j of IMPACTS) {
    const near = shakeAt(j.at + 0.02);
    assert.ok(Math.hypot(near.x, near.y) > 0.001, `a jolt at ${j.at}`);
    const later = shakeAt(j.at + 0.61);
    assert.ok(Math.hypot(later.x, later.y) < 1e-9, "gone after 0.6 s");
    const r0 = ringAt(j.at + 0.01);
    const r1 = ringAt(j.at + 0.5);
    assert.ok(r0.on && r1.on && r1.spread > r0.spread && r1.alpha < r0.alpha, "the ring spreads and fades");
  }
  assert.equal(shakeAt(TG.pack - 0.1).x, 0, "nothing before the first jolt");
});

test("the rays turn behind the winner's name and card, never over their letters (the owner's video, 2026-11-12)", () => {
  const rays = new RayBurst();
  const name = new GoldPlate(new THREE.Texture(), 1, 1, 1, 1);
  const stage = readFileSync("src/components/lucky-draw/wall/stage.ts", "utf8").replace(/\r\n/g, "\n");
  const card = Number(/\bpass\.renderOrder = (\d+);/.exec(stage)[1]);
  const cardLight = Number(/this\.passHalo\.renderOrder = (\d+);/.exec(stage)[1]);
  assert.ok(rays.mesh.renderOrder < name.mesh.renderOrder, "drawn before the name");
  assert.ok(rays.mesh.renderOrder < card && rays.mesh.renderOrder < cardLight, "and before the card and its light");
  assert.equal(rays.mesh.material.depthTest, false, "never hidden by the dark wall they are further away than");
  const ring = new ShockRing();
  assert.ok(ring.mesh.renderOrder < name.mesh.renderOrder, "each jolt's shock ring spreads behind the letters too");
  ring.dispose();
  // In the scene, never a layer of the page (the page is over the scene, so its rays ran through the name).
  assert.doesNotMatch(stage, /lw-walk-rays/);
  assert.doesNotMatch(readFileSync("src/components/lucky-draw/wall/wall.css", "utf8"), /\.lw-walk-rays/);
  rays.dispose();
  name.dispose();
});

test("while the reveal plays, the page's words are gone, not faded (faded, they read behind every detail)", () => {
  const css = readFileSync("src/components/lucky-draw/wall/wall.css", "utf8").replace(/\r\n/g, "\n");
  const rule = /((?:\.lw\[data-walk\] \.lw-[a-z]+,?\s*)+)\{\s*opacity: ([\d.]+);\s*\}/.exec(css);
  assert.ok(rule, "the rule for the page's words while the reveal plays");
  assert.deepEqual(rule[1].match(/\.lw-[a-z]+/g).sort(), [".lw-band", ".lw-eyebrow", ".lw-foot", ".lw-note"]);
  assert.equal(Number(rule[2]), 0);
});

test("from one detail into the next the room travels (the warp), and is still while a detail or the card holds", () => {
  for (const [a, b] of [[TG.land1 + 0.05, TG.through1 - 0.15], [TG.land2 + 0.05, TG.through2 - 0.15], [TG.nameLand + 0.05, TG.nameOut - 0.15], [TG.placed, TG.end]]) {
    for (let t = a; t <= b; t += 0.05) assert.equal(warpAt(t), 0, `still at ${t.toFixed(2)}`);
  }
  for (const at of [TG.through1, TG.through2, TG.nameOut]) assert.ok(warpAt(at + 0.2) > 0.95, `travelling as a detail rushes past (${at})`);
  for (let t = 0; t < TG.end; t += 0.01) assert.ok(warpAt(t) >= 0 && warpAt(t) <= 1);
});

test("fireworks burst up the sides or over the top, never in the middle band where the words are read", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let sides = 0;
  for (let i = 0; i < 4000; i++) {
    const p = shellSpot(rnd);
    assert.ok(Math.abs(p.x) <= 0.94 && p.y >= -0.2 && p.y <= 0.88, "on the screen");
    assert.ok(Math.abs(p.x) > 0.58 || p.y > 0.64, `not in the middle band (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    assert.equal(p.side, Math.abs(p.x) > 0.58, "a rocket rises only up a side");
    if (p.side) sides++;
  }
  assert.ok(sides > 1000 && sides < 3900, "both up the sides and over the top");
});

test("a shell: its stars burst where its rocket ends, at the moment it ends", () => {
  const fw = new Fireworks();
  fw.shell(10, 3, 1, -8, 0.5, 0, -2.3, () => 0.5);
  const a = fw.points.geometry.attributes;
  const per = FIREWORKS.stars * FIREWORKS.trail + FIREWORKS.rocket;
  const born = a.aBorn.array;
  const kind = a.aKind.array;
  let stars = 0;
  let rockets = 0;
  for (let i = 0; i < per; i++) {
    if (kind[i] > 0.5) {
      rockets++;
      // A rocket's head reaches the burst as its life ends, at the shell's moment.
      if (i === FIREWORKS.stars * FIREWORKS.trail) assert.ok(Math.abs(born[i] + a.aLife.array[i] - 10) < 1e-6);
      assert.deepEqual([...a.aVel.array.slice(i * 3, i * 3 + 3)].map((v) => +v.toFixed(4)), [3, 1, -8]);
    } else {
      stars++;
      assert.ok(born[i] >= 10 && born[i] < 10.1, "the stars from the burst");
      assert.deepEqual([...a.position.array.slice(i * 3, i * 3 + 3)].map((v) => +v.toFixed(4)), [3, 1, -8]);
    }
  }
  assert.equal(stars, FIREWORKS.stars * FIREWORKS.trail);
  assert.equal(rockets, FIREWORKS.rocket);
  for (let i = per; i < born.length; i++) assert.ok(born[i] < -1000, "nothing else in the air");
  fw.reset();
  assert.ok([...a.aBorn.array].every((b) => b < -1000), "reset: none in the air");
  fw.dispose();
});

test("the Trip ID comes out of the pack: from inside it, out of its torn top, then flying to its place", () => {
  assert.ok(TG.plate1 > TG.tear, "once the pack has torn open");
  assert.equal(emergeAt(TG.plate1 - 0.01).on, false);
  const first = emergeAt(TG.plate1);
  assert.ok(first.on && first.rise === 0 && first.fly === 0, "from inside the pack");
  const out = emergeAt(TG.plate1 + EMERGE.rise);
  assert.ok(Math.abs(out.rise - 1) < 1e-9 && out.fly < 1e-9, "all the way out of its top before it flies");
  let rise = -1;
  let fly = -1;
  for (let t = TG.plate1; t < TG.land1; t += 0.01) {
    const e = emergeAt(t);
    assert.ok(e.on && e.rise >= rise && e.fly >= fly, "always on its way out");
    rise = e.rise;
    fly = e.fly;
  }
  assert.ok(fly > 0.97, "at its place as it lands");
  assert.equal(emergeAt(TG.land1).on, false, "landed: on its own way from there");
  assert.ok(TG.land1 - TG.plate1 - EMERGE.rise >= 0.4, "time to fly to its place, seen");
});

test("gold confetti: thrown up from the foot of the screen either side, falling from above; all of it within its room", async () => {
  const { Confetti, CONFETTI } = await import("@/components/lucky-draw/wall/grand");
  const cf = new Confetti();
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  cf.cannons(20, 3.6, 2, -8, 180, rnd);
  cf.rain(30, 3.6, 2, -8, 120, 2.5, rnd);
  const a = cf.points.geometry.attributes;
  const born = a.aBorn.array;
  const pos = a.position.array;
  const vel = a.aVel.array;
  let left = 0;
  for (let i = 0; i < 180; i++) {
    assert.ok(born[i] >= 20 && born[i] <= 20.25, "thrown together");
    assert.ok(pos[i * 3 + 1] < -2, "from the foot of the screen");
    assert.ok(vel[i * 3 + 1] > 0 && Math.sign(vel[i * 3]) === -Math.sign(pos[i * 3]), "up, and in towards the middle");
    if (pos[i * 3] < 0) left++;
  }
  assert.equal(left, 90, "as many from each side");
  for (let i = 180; i < 300; i++) {
    assert.ok(born[i] >= 30 && born[i] <= 32.5 && pos[i * 3 + 1] > 2, "falling from above the screen");
  }
  assert.ok(CONFETTI.flakes >= 300, "room for both at once");
  for (let i = 300; i < CONFETTI.flakes; i++) assert.ok(born[i] < -1000, "nothing else in the air");
  cf.reset();
  assert.ok([...a.aBorn.array].every((b) => b < -1000), "reset: none in the air");
  cf.dispose();
});
