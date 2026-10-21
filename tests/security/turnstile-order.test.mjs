// 2026-10-09: every route with Turnstile checks it before it calls Upstash, counts a sign-in or reads the database,
// so a request without a passing token costs nothing and counts against nobody. Read from the sources: the first
// checkTurnstile( must come before the first limiter, lockout or Prisma call in each handler.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ROUTES = [
  "src/app/api/auth/login/route.ts", // console
  "src/app/api/employee/auth/login/route.ts", // staff
  "src/app/api/web/auth/login-password/route.ts", // customers, website
  "src/app/api/web/auth/forgot-password/route.ts", // customers, Send code
  "src/app/api/employee/auth/forgot-password/route.ts", // staff, Send code
  "src/app/api/contact/route.ts", // contact form
  "src/app/api/supplier/auth/login/route.ts", // supplier portal, sign in (2026-10-21)
  "src/app/api/supplier/auth/register/route.ts", // supplier portal, new account
  "src/app/api/supplier/auth/forgot-password/route.ts", // supplier portal, Send code
];
const LATER = [/\bcheck\w*RateLimit\(/, /\bbeginLoginAttempt\(/, /\bwindowLockRemainingMs\(/, /\bprisma\.\w+\.\w+\(/, /\bcanDeliverTo\(/];

for (const path of ROUTES) {
  test(`${path}: Turnstile before any limit, lockout or lookup`, () => {
    const source = fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    const handler = source.slice(source.indexOf("export async function POST"));
    const turnstile = handler.indexOf("checkTurnstile(");
    assert.ok(turnstile > 0, "checkTurnstile is called in the handler");
    for (const pattern of LATER) {
      const m = pattern.exec(handler);
      if (m) assert.ok(turnstile < m.index, `checkTurnstile comes before ${m[0]}`);
    }
  });
}
