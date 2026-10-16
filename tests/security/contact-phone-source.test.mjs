// The contact number (the owner, 2026-10-15) is saved without a code and is never a way in. Read from the sources:
// nothing on its path reaches Twilio or the phone-code routes (Job 3 deletes them), marks a number proved or adds a
// way to sign in; and the app's sign-in replies carry the number, so the app knows when to ask for one.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
// The code only: comments may say what is not here.
const code = (file) => read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ON_THE_PATH = [
  "src/lib/contact-phone.ts",
  "src/app/api/web/account/phone/route.ts",
  "src/app/api/mobile/account/phone/route.ts",
  "src/components/account/AddPhoneDialog.tsx",
  "src/context/PhonePromptContext.tsx",
  "src/components/ui/GoogleButton.tsx",
];

for (const file of ON_THE_PATH) {
  test(`no Twilio and no phone codes in ${file}`, () => {
    assert.doesNotMatch(code(file), /twilio|phone-auth|mobile-otp|otp-caps|send-otp|verify-otp|add-phone|Verification\(/i);
  });
}

test("the number is saved unverified, and the ways to sign in are left as they are", () => {
  const save = code("src/lib/contact-phone.ts");
  assert.match(save, /data: \{ phone, phoneVerified: false \}/);
  assert.doesNotMatch(save, /phoneVerified: true|authProvider/);
});

test("the app's Google sign-in and /me say whether the account has a number", () => {
  assert.match(code("src/app/api/mobile/auth/google/route.ts"), /phone: user\.phone,/);
  // /me answers with the account's profile (lib/account-profile.ts, 2026-10-16), the number among it.
  assert.match(code("src/app/api/mobile/auth/me/route.ts"), /user: profileOf\(user\)/);
  assert.match(code("src/lib/account-profile.ts"), /phone: user\.phone,/);
});
