// The console's "Registered again": applications with the same mobile number (src/lib/trip-repeats.ts).
//   node --import ./tests/helpers/server-modules.mjs --test "tests/trip-repeats/*.test.mjs"
import assert from "node:assert/strict";
import { test } from "node:test";
import { repeatGroups } from "@/lib/trip-repeats";

let n = 0;
const app = (customerKey, minute = ++n) => ({ id: `a${++n}`, customerKey, createdAt: new Date(Date.UTC(2026, 9, 1, 0, minute)) });

test("one application a number: nobody", () => {
  assert.deepEqual(repeatGroups([app("919000000001"), app("919000000002"), app("919000000003")]), []);
});

test("the same number twice: one group, the newest first", () => {
  const older = app("919360397986", 1);
  const newer = app("919360397986", 50);
  assert.deepEqual(repeatGroups([older, app("919000000004"), newer]), [{ ids: [newer.id, older.id] }]);
});

test("the group with the newest application comes first", () => {
  const a1 = app("919000000005", 10);
  const a2 = app("919000000005", 20);
  const b1 = app("919000000006", 5);
  const b2 = app("919000000006", 90);
  assert.deepEqual(repeatGroups([a1, a2, b1, b2]).map((g) => g.ids), [[b2.id, b1.id], [a2.id, a1.id]]);
});

test("rows without a number never match, nor by their email", () => {
  assert.deepEqual(repeatGroups([app(null), app(null), app("email:x@example.com"), app("email:x@example.com")]), []);
});

test("names are never compared: the rows carry none", () => {
  const keys = Object.keys(app("919000000007"));
  assert.deepEqual(keys.sort(), ["createdAt", "customerKey", "id"]);
});
