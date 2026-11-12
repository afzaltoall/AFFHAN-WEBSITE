// A detail's gold plate (src/components/lucky-draw/wall/faces.ts plateLayout): its value and the line under it always
// fit the plate, that line never on the value (a long place on two lines had run its country into its second line,
// 2026-11-12: "no perfection").
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLATE_PX, PLATE_ROOM, plateLayout } from "@/components/lucky-draw/wall/faces";

test("a plate's value and the line under it fit it, under its label, that line clear of the value's tails", () => {
  for (const lines of [1, 2]) {
    for (const sub of [false, true]) {
      for (let size = 90; size <= 300; size += 6) {
        const at = plateLayout(lines, size, sub);
        const what = `${lines} line(s) at ${size}${sub ? ", a line under them" : ""}`;
        assert.ok(at.size <= size, `never larger than it fits across (${what})`);
        const top = at.first - 0.75 * at.size;
        const last = at.first + (lines - 1) * at.step;
        const foot = sub ? at.sub + 24 : last + 0.22 * at.size;
        assert.ok(top >= PLATE_ROOM.top - 1e-9, `under its label (${what})`);
        assert.ok(foot <= PLATE_ROOM.bottom + 1e-9 && foot <= PLATE_PX.h, `within the plate (${what}): ${foot.toFixed(1)}`);
        if (sub) assert.ok(at.sub - 62 >= last + 0.22 * at.size + 25, `the line under the value clear of its tails (${what})`);
      }
    }
  }
});

test("the case that ran together: a place on two lines, its country under it", () => {
  const at = plateLayout(2, 230, true);
  assert.ok(at.size < 230, "set smaller, to fit");
  assert.ok(at.sub - 62 > at.first + at.step + 0.22 * at.size, "the country under the second line, not on it");
});
