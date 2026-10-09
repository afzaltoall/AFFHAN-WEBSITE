// 2026-10-09: the phone sign-up form's email check had lost its backslashes, so [^s@] refused every address with
// an "s" in it and the form could not be finished. It must be the server's check, character for character.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const literal = (source, pattern) => {
  const m = pattern.exec(source);
  assert.ok(m, `no match for ${pattern}`);
  return m[1];
};

test("the phone sign-up form checks an email exactly as the server does", () => {
  const form = literal(read("src/components/ui/PhoneAuthForm.tsx"), /emailLooksValid = \/(.+?)\/\.test\(/);
  const server = literal(read("src/app/api/web/auth/complete-profile/route.ts"), /const EMAIL_RE = \/(.+?)\/;/);
  assert.equal(form, server);
  const re = new RegExp(form);
  for (const good of ["sam@gmail.com", "suresh.s@affhan.com", "a@b.co"]) assert.ok(re.test(good), good);
  for (const bad of ["no-at-sign", "two words@x.com", "a@b", "a@ b.com"]) assert.ok(!re.test(bad), bad);
});
