// M3 (security audit 2026-10-08): /login's ?redirect= only ever leads to a path on this site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeRedirect } from "../../src/lib/safe-redirect.ts";

// What searchParams.get() hands the page is already decoded, so both forms of each attack are tried.
const OFFSITE = [
  ["/%5Cevil.example", "an encoded backslash"],
  ["/\\evil.example", "a backslash"],
  ["//evil.example", "a protocol-relative URL"],
  ["/\t/evil.example", "a tab (browsers drop it, leaving //)"],
  ["/\n/evil.example", "a newline"],
  ["/\r/evil.example", "a carriage return"],
  ["/\u0000/evil.example", "a NUL"],
  ["/..//evil.example", "dot segments that fold into //"],
  ["/.//evil.example", "a single-dot segment that folds into //"],
  ["/%2e%2e//evil.example", "encoded dot segments"],
  ["https://evil.example/", "an absolute URL"],
  ["http:/evil.example", "a scheme with one slash"],
  ["javascript:alert(1)", "a script URL"],
  ["evil.example", "a bare host"],
  ["%2F%2Fevil.example", "an encoded protocol-relative URL"],
];
for (const [raw, what] of OFFSITE) {
  test(`refuses ${what}: ${JSON.stringify(raw)}`, () => {
    assert.equal(safeRedirect(raw), "/");
    // And whatever it returns, a browser resolves it on this site.
    assert.equal(new URL(safeRedirect(raw), "https://affhan.com/login/").origin, "https://affhan.com");
  });
}

test("empty, missing or non-string values go home", () => {
  for (const v of ["", null, undefined, 42, {}]) assert.equal(safeRedirect(v), "/");
});

test("paths on this site are kept as they are, query and hash included", () => {
  assert.equal(safeRedirect("/"), "/");
  assert.equal(safeRedirect("/products/"), "/products/");
  assert.equal(safeRedirect("/products/?q=led%20strip&sortBy=newest#top"), "/products/?q=led%20strip&sortBy=newest#top");
  assert.equal(safeRedirect("/account/inquiries/"), "/account/inquiries/");
});

test("an encoded slash stays a path on this site", () => {
  const out = safeRedirect("/%2F%2Fevil.example");
  assert.equal(out, "/%2F%2Fevil.example");
  assert.equal(new URL(out, "https://affhan.com/login/").origin, "https://affhan.com");
});
