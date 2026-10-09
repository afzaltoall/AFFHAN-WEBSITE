// M1 (security audit 2026-10-08): JSON-LD text cannot end its <script> element, and still parses to the same data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { jsonLd } from "../../src/lib/json-ld.ts";

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const BACKSLASH = String.fromCharCode(0x5c);

test("a string holding </script> cannot close the element", () => {
  const value = { "@type": "Product", name: 'Lamp </script><script>alert(1)</script> "x"' };
  const out = jsonLd(value);
  assert.ok(!out.includes("<"), out);
  assert.ok(out.includes(`${BACKSLASH}u003c/script`), "written as its escape");
  assert.deepEqual(JSON.parse(out), value, "the data is unchanged for anything that parses it");
});

test("> and & are escaped too, and parse back", () => {
  const value = { description: "Sourcing & freight --> <!-- & ]]>" };
  const out = jsonLd(value);
  assert.ok(!/[<>&]/.test(out), out);
  assert.ok(out.includes(`${BACKSLASH}u0026`) && out.includes(`${BACKSLASH}u003e`));
  assert.equal(JSON.parse(out).description, value.description);
});

test("the line and paragraph separators are escaped, and parse back", () => {
  const value = { name: `line${LS}break${PS}here` };
  const out = jsonLd(value);
  assert.ok(!out.includes(LS) && !out.includes(PS), "no raw separator left");
  assert.ok(out.includes(`${BACKSLASH}u2028`) && out.includes(`${BACKSLASH}u2029`));
  assert.equal(JSON.parse(out).name, value.name);
});

test("everything else is written as JSON.stringify writes it", () => {
  const value = { "@context": "https://schema.org", name: "Café ☕ 中国 sourcing", n: 3, list: [1, "two"], nested: { ok: true } };
  assert.equal(jsonLd(value), JSON.stringify(value));
});
