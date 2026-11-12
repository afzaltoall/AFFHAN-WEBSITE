// The grand opening (src/components/lucky-draw/wall/grand.ts): its moments in the owner's order (the pack, the Trip
// ID, the place, the card), each detail zooming in out of the dark to land at its place and rushing past the room,
// the jolts dying away, and the card held three seconds.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { IMPACTS, PAST_T, PLATES, PLATE_DRIFT, PLATE_FAR, PLATE_HOLD, TG, plateAt, ringAt, shakeAt } from "@/components/lucky-draw/wall/grand";

test("the grand opening's moments: the pack, its tearing, the Trip ID, then the place, the burst, the card, its seat", () => {
  const order = ["out", "swap", "pack", "charge", "tear", "plate1", "land1", "through1", "plate2", "land2", "through2", "build", "burst", "placed", "leave", "seat", "end"];
  for (let k = 1; k < order.length; k++) assert.ok(TG[order[k]] > TG[order[k - 1]], `${order[k - 1]} before ${order[k]}`);
  assert.ok(PLATES[0].in === TG.plate1 && PLATES[1].in === TG.plate2, "first the Trip ID, next the place");
  for (const p of PLATES) assert.ok(p.through - p.land >= 1.3, "each detail held long enough to read from the back of the room");
  assert.ok(PLATES[0].through + PAST_T <= PLATES[1].in + 0.05, "one detail at a time");
  assert.ok(Math.abs(TG.leave - TG.placed - 3) < 1e-9, "the card holds the screen three seconds");
  assert.ok(TG.end <= 14);
});

test("each detail zooms in out of the dark, lands at its place, drifts a little closer, and rushes past the room", () => {
  for (const k of [0, 1]) {
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
