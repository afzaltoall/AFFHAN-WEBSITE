// The app cannot show Cloudflare's widget, so nothing it calls may ask for Turnstile (the owner, 2026-10-14): its
// password sign-in, its Google sign-in, and every other route under /api/mobile, nor the sign-in code those share
// with the website. Read from the sources.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../src/app/api/mobile/", import.meta.url));
const routes = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === "route.ts") routes.push(p);
  }
};
walk(root);

test("the app's sign-in routes are among those read", () => {
  assert.ok(routes.some((r) => r.endsWith(path.join("auth", "login", "route.ts"))), "/api/mobile/auth/login");
  assert.ok(routes.some((r) => r.endsWith(path.join("auth", "google", "route.ts"))), "/api/mobile/auth/google");
});

for (const r of routes) {
  test(`no Turnstile in /api/mobile/${path.relative(root, r).replace(/\\/g, "/")}`, () => {
    assert.doesNotMatch(fs.readFileSync(r, "utf8"), /checkTurnstile|lib\/turnstile/);
  });
}

// The website's routes the app calls too (from AFFHAN-FLUTTER's services, 2026-10-14).
const SHARED = [
  "products/route.ts",
  "categories/route.ts",
  "rankings/route.ts",
  "search/image/route.ts",
  "search/suggestions/route.ts",
  "shipping-inquiry/route.ts",
  "trip-applications/route.ts",
  "videos/route.ts",
  "videos/[id]/route.ts",
];
for (const route of SHARED) {
  test(`no Turnstile in /api/${route}, which the app calls`, () => {
    const source = fs.readFileSync(fileURLToPath(new URL(`../../src/app/api/${route}`, import.meta.url)), "utf8");
    assert.doesNotMatch(source, /checkTurnstile|lib\/turnstile/);
  });
}

for (const lib of ["google-account.ts", "google-linking.ts", "password.ts", "mobile-auth.ts", "rate-limit.ts"]) {
  test(`no Turnstile in lib/${lib}, which the app's sign-in shares`, () => {
    const source = fs.readFileSync(new URL(`../../src/lib/${lib}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /checkTurnstile|lib\/turnstile/);
  });
}
