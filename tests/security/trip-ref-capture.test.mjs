// An employee's link always brings its ID proof and its employee (2026-11-04, the owner: "sometimes the document part
// is not showing ... they apply but it doesn't count"). The code used to be kept only once the server said the link
// was live, so a late, lost or unheard answer left the application without its ID proof and uncounted. Now it is kept
// the moment the page opens and read from the address by the form itself; only the server's clear "credits nobody"
// takes it back.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { REFERRAL_CODE_MAX, referralFromSearch } = await import("../../src/lib/trip-referral-shared.ts");
/** A source file's code, its comments taken out. */
const read = (p) =>
  fs
    .readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

test("a link's code is read from the address as the application keeps it", () => {
  assert.equal(referralFromSearch("?ref=rahim49"), "RAHIM49");
  assert.equal(referralFromSearch("?utm=wa&ref=Nagara6"), "NAGARA6");
  assert.equal(referralFromSearch("?ref=ab"), "", "too short to be a code");
  assert.equal(referralFromSearch("?other=RAHIM49"), "");
  assert.equal(referralFromSearch(""), "");
  assert.equal(referralFromSearch(`?ref=${"A".repeat(40)}`).length, REFERRAL_CODE_MAX);
});

test("kept and told to the form before the server answers; given up after a time; taken back only on a clear no", () => {
  const capture = read("src/components/TripApplication/TripRefCapture.tsx");
  const kept = capture.indexOf("write(JSON.stringify({ code, at: Date.now() }));");
  const told = capture.indexOf("window.dispatchEvent(new CustomEvent<string>(REFERRAL_EVENT, { detail: code }));");
  const asked = capture.indexOf("await fetch(`/api/trip-applications/referral/?code=");
  assert.ok(kept > 0 && told > kept && asked > told, "kept, the form told, then the server asked");
  assert.match(capture, /const timer = window\.setTimeout\(\(\) => ask\.abort\(\), CHECK_MS\);/);
  assert.match(capture, /signal: ask\.signal/);
  // Unanswered, refused (429, 500) or late: kept. Only live === false undoes it, and the link kept before comes back.
  assert.match(capture, /if \(res\.ok\) live = \(\(await res\.json\(\)\) as \{ live\?: unknown \}\)\.live === true;/);
  assert.match(capture, /if \(live !== false\) return;/);
  assert.match(capture, /write\(before && keptCode\(before\) !== code \? before : null\);/);
  assert.match(capture, /window\.dispatchEvent\(new CustomEvent<string>\(REFERRAL_DROPPED_EVENT, \{ detail: code \}\)\);/);
});

// 2026-11-05, the owner: only those who come through an employee's link are asked for documents, never someone who
// comes to the site and clicks the China Trip; "sometimes it throws them out"; "sometimes they can't even get in".
test("the link's code is this visit's alone: kept in the tab, never 30 days; the old key cleared", () => {
  const capture = read("src/components/TripApplication/TripRefCapture.tsx");
  assert.match(capture, /localStorage\.removeItem\(REFERRAL_STORAGE_KEY\);/, "the 30-day key cleared on every trip page");
  assert.ok(capture.indexOf("localStorage.removeItem(REFERRAL_STORAGE_KEY);") < capture.indexOf("if (!code) return;"), "even without a link");
  assert.doesNotMatch(capture, /localStorage\.(getItem|setItem)/, "never kept there again");
  assert.match(capture, /sessionStorage\.setItem\(REFERRAL_STORAGE_KEY, value\);/);
  const form = read("src/components/TripApplication/useApplication.ts");
  assert.match(form, /sessionStorage\.getItem\(REFERRAL_STORAGE_KEY\)/);
  assert.doesNotMatch(form, /localStorage\.getItem|REFERRAL_STORAGE_DAYS/, "no visit reads a code an earlier one kept");
  assert.doesNotMatch(read("src/lib/trip-referral-shared.ts"), /REFERRAL_STORAGE_DAYS/);
});

test("on a link, closing the Terms keeps the application; a link on a browser applied from before opens the form", () => {
  const page = read("src/components/TripApplication/ApplyExperience.tsx");
  const leave = page.slice(page.indexOf("const leaveFirst = () => {"), page.indexOf("const leaveFirst = () => {") + 400);
  assert.ok(leave.indexOf('setPhase("intro");') > 0 && leave.indexOf('setPhase("intro");') < leave.indexOf("router.replace("), "a link stays, on the opening, before any move away");
  assert.match(page, /if \(!registration \|\| \(app\.state\.referral\.code && !registeredByAccount\)\) return;/, "only an account's own application sends a link visit to a boarding pass");
  // Whose it is, from the server: the signed-in account's own, or only this browser's.
  const me = read("src/app/api/trip-applications/me/route.ts");
  assert.match(me, /const own = user \? await registrationOf\(user\.id\) : null;/);
  assert.match(me, /byAccount: !!own/);
  assert.match(read("src/components/TripAccess/useTripStatus.ts"), /registeredByAccount: readFor === userId && byAccount,/);
});

test("the form takes the code from the address first, and forgets only what the server dropped", () => {
  const form = read("src/components/TripApplication/useApplication.ts");
  assert.match(form, /const linked = referralFromSearch\(window\.location\.search\) \|\| codeFromLink\(\);/);
  assert.match(form, /window\.addEventListener\(REFERRAL_DROPPED_EVENT, dropped\);/);
  assert.match(form, /if \(s\.referral\.code !== gone\) return s;/);
  // Holding a code is what shows the ID proof, and what the application must carry it with.
  assert.match(read("src/components/TripApplication/ApplicationForm.tsx"), /\{app\.state\.referral\.code && <IdDocumentField app=\{app\} \/>\}/);
  assert.match(read("src/lib/trip-application.ts"), /if \(a\.referralCode && !a\.documents\?\.length\) e\.idDocument = ID_DOCUMENT_NEEDED;/);
});

// 2026-11-05, the owner: "dont show the text of choose any of these ... remove the text contents". The ID proof has no
// grey line of instructions under its choices; a missing choice or file is said by the field's own complaint.
test("the ID proof field has no line of instructions under its choices", () => {
  const field = read("src/components/TripApplication/IdDocumentField.tsx");
  assert.doesNotMatch(field, /ax-idDocument-note|PROOF_NOTE|Choose any one of these/);
  assert.match(field, /aria-describedby=\{error \? "ax-idDocument-error" : undefined\}/);
});
