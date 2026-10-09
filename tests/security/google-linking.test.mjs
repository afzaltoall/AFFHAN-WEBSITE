// H2 (security audit 2026-10-08): a Google sign-in never merges into an account that did not prove its email.
import { test } from "node:test";
import assert from "node:assert/strict";
import { googlePlan } from "../../src/lib/google-linking.ts";

test("Google, on an account whose email was never proved: claimed, not merged", () => {
  // The password goes; the phone stays, and with it a phone sign-in the account had.
  for (const [authProvider, after] of [["EMAIL", "GOOGLE"], ["PHONE", "GOOGLE_AND_PHONE"], ["PHONE_AND_EMAIL", "GOOGLE_AND_PHONE"], ["EMAIL_AND_GOOGLE", "GOOGLE"]]) {
    const plan = googlePlan({ emailVerified: false, googleId: null, authProvider });
    assert.equal(plan.kind, "claim", authProvider);
    assert.equal(plan.authProvider, after, authProvider);
  }
  // Even one that once had a Google identity, whose email was changed since to one it never proved.
  assert.equal(googlePlan({ emailVerified: false, googleId: "old-sub", authProvider: "GOOGLE" }).kind, "claim");
});

test("Google, on an account that proved its email: linked or signed in, as before", () => {
  assert.deepEqual(googlePlan({ emailVerified: true, googleId: null, authProvider: "EMAIL" }), { kind: "link", authProvider: "EMAIL_AND_GOOGLE" });
  assert.deepEqual(googlePlan({ emailVerified: true, googleId: null, authProvider: "PHONE_AND_EMAIL" }), { kind: "link", authProvider: "PHONE_AND_EMAIL_AND_GOOGLE" });
  assert.deepEqual(googlePlan({ emailVerified: true, googleId: "sub", authProvider: "GOOGLE" }), { kind: "sign_in" });
});
