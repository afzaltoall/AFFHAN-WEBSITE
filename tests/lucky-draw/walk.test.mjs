// The award-show walkout (src/components/lucky-draw/wall/walk.ts): its moments in the owner's order (dark, the Trip
// ID, the place, the burst, the card), the card held three seconds, and the clues' letters landing one after another.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLUES, LETTER_GAP, LETTER_T, TW, letterAt, lineAt } from "@/components/lucky-draw/wall/walk";

test("the walkout's moments: dark, the ticket turned over, the Trip ID, then the place, the burst, the card, its seat", () => {
  const order = ["out", "over", "rise", "risen", "clue1", "clue1Out", "clue2", "clue2Out", "build", "burst", "placed", "leave", "seat", "end"];
  for (let k = 1; k < order.length; k++) assert.ok(TW[order[k]] > TW[order[k - 1]], `${order[k - 1]} before ${order[k]}`);
  assert.ok(TW.over <= 0.55, "turned over under the landing's flash, before its name can be read");
  assert.equal(CLUES.length, 2);
  assert.ok(CLUES[0].in === TW.clue1 && CLUES[1].in === TW.clue2, "first the Trip ID, next the place");
  for (const k of CLUES) assert.ok(k.out - k.in >= 1.6, "each clue long enough to read from the back of the room");
  assert.ok(Math.abs(TW.leave - TW.placed - 3) < 1e-9, "the card holds the screen three seconds");
  assert.ok(TW.end <= 11.5);
});

test("a clue's letters come in one after another, land on their places, and go together", () => {
  const n = 13;
  for (let k = 1; k < n; k++) {
    // Each letter starts after the one before it.
    const t = (k - 0.5) * LETTER_GAP + 0.05;
    assert.ok(letterAt(k - 1, t, 5).a >= letterAt(k, t, 5).a, `letter ${k - 1} shows no less than letter ${k}`);
  }
  for (let k = 0; k < n; k++) {
    const landed = letterAt(k, k * LETTER_GAP + LETTER_T + 0.6, 5);
    assert.ok(Math.abs(landed.a - 1) < 1e-9 && Math.abs(landed.y) < 1e-9 && Math.abs(landed.s - 1) < 1e-9, `letter ${k} in its place`);
    assert.equal(letterAt(k, -0.01, 5).a, 0, "nothing before the clue begins");
    assert.ok(letterAt(k, 3, 0).a < 1e-9, "gone when the clue ends");
  }
  assert.ok(lineAt(1, 5, 0.1) > 0.99 && lineAt(0, 5, 0.1) === 0 && lineAt(1, 0, 0.1) < 1e-9);
});
