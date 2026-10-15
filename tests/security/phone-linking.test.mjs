// C1 (security audit 2026-10-08): a proved phone enters only its own account, and never links by email.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { phonePlan, provedPhoneMayEnter } from "../../src/lib/phone-linking.ts";

test("a proved phone enters only its own account", () => {
  assert.equal(phonePlan({ accountForPhone: true, hasProfile: true, emailTaken: true }).kind, "sign_in");
  assert.equal(phonePlan({ accountForPhone: true, hasProfile: false, emailTaken: false }).kind, "sign_in");
});

test("a proved phone with someone else's email is refused, never linked", () => {
  assert.equal(phonePlan({ accountForPhone: false, hasProfile: true, emailTaken: true }).kind, "email_taken");
});

test("a new phone with no profile yet is asked for one; with a new email, it is a new account", () => {
  assert.equal(phonePlan({ accountForPhone: false, hasProfile: false, emailTaken: false }).kind, "needs_profile");
  assert.equal(phonePlan({ accountForPhone: false, hasProfile: true, emailTaken: false }).kind, "create");
});

// 2026-10-15: numbers are saved without a code now (lib/contact-phone.ts), so holding one is not owning the account.
test("a proved phone opens an account only when that account proved the number too", () => {
  assert.equal(provedPhoneMayEnter({ phoneVerified: true }), true);
  assert.equal(provedPhoneMayEnter({ phoneVerified: false }), false);
});

test("both places a proved phone opens an existing account ask that first", () => {
  for (const [file, opens] of [
    ["src/lib/phone-auth.ts", "prisma.mobileSession.create"],
    ["src/app/api/web/auth/complete-profile/route.ts", "createWebSession(user.id)"],
  ]) {
    const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    const asked = source.indexOf("if (user && !provedPhoneMayEnter(user))");
    assert.ok(asked > 0, `${file} never asks`);
    assert.ok(asked < source.indexOf(opens), `${file} asks after the session is opened`);
  }
});
