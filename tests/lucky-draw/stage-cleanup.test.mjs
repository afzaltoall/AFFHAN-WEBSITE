// The wall's stage (src/components/lucky-draw/wall/stage.ts) takes out of the page everything it put in it. A stage
// is made again within one screen (its pass renewed), and each puts in its own pass, board, rays and flashes: the old
// ones would stay behind it, and a stage gone in the middle of a reveal would leave the page's words faded.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stage = readFileSync("src/components/lucky-draw/wall/stage.ts", "utf8");
const dispose = /\n  dispose\(\) \{\n    if \(this\.disposed\) return;([\s\S]*?)\n  \}\n/.exec(stage);

test("the stage's cleanup takes out every element it put in the page", () => {
  assert.ok(dispose, "the stage's dispose()");
  const put = [...stage.matchAll(/opts\.lift\.(?:append|appendChild)\(([^)]*)\)/g)].flatMap((m) => m[1].split(",").map((x) => x.trim()));
  assert.ok(put.length >= 5, `the pass, the board, its flash, the rays, the walkout's flash (${put.join(", ")})`);
  for (const el of put) assert.ok(dispose[1].includes(`${el}.remove();`), `${el} taken out of the page`);
});

test("and every mark it set on the page", () => {
  const marks = [...new Set([...stage.matchAll(/root\.dataset\.(\w+) = /g)].map((m) => m[1]))];
  assert.deepEqual(marks.sort(), ["pack", "walk"]);
  for (const k of marks) assert.ok(dispose[1].includes(`delete this.opts.lift.parentElement?.dataset.${k};`), `data-${k} taken off the page`);
});
