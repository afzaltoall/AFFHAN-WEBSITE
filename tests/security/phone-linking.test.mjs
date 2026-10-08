// C1 (security audit 2026-10-08): a proved phone enters only its own account, and never links by email.
import { test } from "node:test";
import assert from "node:assert/strict";
import { phonePlan } from "../../src/lib/phone-linking.ts";

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
