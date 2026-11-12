// The golden envelope's reveal (src/components/lucky-draw/wall/envelope.ts): its moments in order, the card held three
// seconds, and the card hidden inside the envelope until it is drawn out.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_IN, ENV, TE } from "@/components/lucky-draw/wall/envelope";

test("the envelope's moments: out of the wall, turned into the envelope, opened, the card drawn out, held three seconds, seated", () => {
  const order = ["out", "turn", "flip", "sealed", "open", "slide", "risen", "placed", "leave", "seat", "end"];
  for (let k = 1; k < order.length; k++) assert.ok(TE[order[k]] > TE[order[k - 1]], `${order[k - 1]} before ${order[k]}`);
  assert.ok(TE.turn - TE.out >= 1.6, "the ticket's slow rise out of the wall takes its time (slow motion)");
  assert.ok(TE.risen - TE.slide >= 1.4, "the card comes out of the envelope slowly");
  assert.ok(Math.abs(TE.leave - TE.placed - 3) < 1e-9, "the card holds the screen three seconds (the owner: '3 second katanum podhum')");
  assert.ok(TE.end <= 11.5, "the whole reveal under twelve seconds");
});

test("the envelope: its flap covers the opening when closed, and the card fits inside it, hidden under the V", () => {
  assert.ok(ENV.flap > ENV.notch, "the closed flap reaches below the V of the opening");
  const PASS_WORLD_H = (2.2 * 1000) / 2048;
  const half = (PASS_WORLD_H * CARD_IN) / 2;
  const top = ENV.h / 2 - ENV.notch - 0.03;
  assert.ok(top - 2 * half >= -ENV.h / 2, "inside, the card's foot is within the envelope");
  assert.ok(2.2 * CARD_IN <= ENV.w - 0.2, "and it is narrower than the envelope");
});
