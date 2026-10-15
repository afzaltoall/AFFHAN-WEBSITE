// The sign-in calls name their routes with the trailing slash. The site's trailingSlash answers the bare address
// with a 308 first, a second round trip before anyone is signed in (measured on affhan.com, 2026-10-15: Google's
// sign-in waited 0.13-0.28s for the redirect alone). Read from the sources.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

for (const [file, route] of [
  ["src/components/ui/GoogleButton.tsx", "/api/web/auth/google/"],
  ["src/components/ui/GoogleButton.tsx", "/api/web/auth/google/config/"],
  ["src/components/ui/PasswordAuthForm.tsx", "/api/web/auth/login-password/"],
  ["src/components/ui/SignupForm.tsx", "/api/web/auth/signup/"],
  ["src/context/AuthContext.tsx", "/api/web/auth/me/"],
]) {
  test(`${file} calls ${route} with its slash`, () => {
    const source = read(file);
    assert.ok(source.includes(`"${route}"`), `no "${route}" in ${file}`);
    assert.ok(!source.includes(`"${route.slice(0, -1)}"`), `the bare "${route.slice(0, -1)}" is still called`);
  });
}

test("the Google button asks for Chrome's own account chooser (FedCM)", () => {
  assert.match(read("src/components/ui/GoogleButton.tsx"), /use_fedcm_for_button: true/);
});

test("the login page reads ?redirect= in the browser, so its HTML carries the form", () => {
  assert.doesNotMatch(read("src/app/login/page.tsx"), /useSearchParams\(|<Suspense/);
});
