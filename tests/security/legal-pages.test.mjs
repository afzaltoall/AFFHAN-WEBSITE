// The Terms and Privacy Policies say what the site really does (2026-11-08, the owner: "update the terms and conditions
// and privacy policy perfectly what we do what we done"; "nama ena vanguroma adha matu dhan podurom"; "privacy policy
// la technical information remove panu").
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { TRIP_PRIVACY, TRIP_TERMS } = await import("../../src/lib/trip-legal.ts");
/** A source file's code, its comments taken out (a comment may quote the old wording). */
const read = (p) =>
  fs
    .readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
/** A section's words, every block's text joined. */
const words = (s) =>
  s.blocks
    .map((b) => (b.kind === "list" ? b.items.join(" | ") : b.kind === "sub" ? `[${b.text}]` : "text" in b ? b.text : ""))
    .join(" ");

test("the trip's Privacy Policy, section 1: only what the application asks, and no Technical Information", () => {
  const one = TRIP_PRIVACY.sections.find((s) => s.n === 1);
  const lists = Object.fromEntries(
    one.blocks.flatMap((b, i) => (b.kind === "sub" ? [[b.text, one.blocks.slice(i + 1).find((x) => x.kind === "list")?.items ?? []]] : [])),
  );
  assert.deepEqual(lists["Personal Details"], ["Full name", "Mobile number", "Country", "City"]);
  assert.deepEqual(lists["Business Details"], ["Whether you run a business"]);
  assert.ok(lists["Application Details"].some((i) => /valid passport/.test(i)));
  assert.ok(lists["Application Details"].some((i) => /identity document, only if you apply through a link/.test(i)));
  assert.equal(lists["Technical Information"], undefined, "no Technical Information list");
  assert.doesNotMatch(words(one), /Email address|Company name|Job title|IP address|Browser type|Pages visited/);
});

test("the trip's documents: the same seventeen sections and clauses, the pass rows' sections there, a date shown", () => {
  assert.equal(TRIP_PRIVACY.sections.length, 17);
  assert.equal(TRIP_TERMS.sections.length, 17);
  for (const n of [1, 2, 5, 8, 9, 16]) assert.ok(TRIP_PRIVACY.sections.some((s) => s.n === n), `section ${n}`);
  assert.match(TRIP_PRIVACY.updated, /^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  assert.match(TRIP_TERMS.updated, /^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  assert.match(read("src/components/TripLegal/LegalPage.tsx"), /Updated \{doc\.updated\}/);
});

test("the trip's documents say how the ID proof is kept and who sees it, and the cookies it really uses", () => {
  const s = (n) => words(TRIP_PRIVACY.sections.find((x) => x.n === n));
  assert.match(s(4), /private, encrypted storage in India/);
  assert.match(s(4), /Only Affhan administrators can open it, and only after entering their password again/);
  // What My referrals shows them (ReferralApplicants): change one, change the other.
  assert.match(s(5), /team member can see your Trip ID, your name, your city and country, part of your mobile number, when you applied/);
  assert.match(s(5), /cannot see your whole mobile number or your identity document/);
  assert.match(s(6), /United States/);
  assert.match(s(11), /does not use advertising or analytics cookies/);
  assert.match(words(TRIP_TERMS.sections.find((x) => x.n === 2)), /Only one application is accepted for each mobile number/);
});

test("the website's pages: no template text, a date, and no analytics loaded anywhere", () => {
  const terms = read("src/app/terms-conditions/page.tsx");
  const privacy = read("src/app/privacy-policy/page.tsx");
  assert.doesNotMatch(terms, /provided in our store|non-commercial transitory viewing/);
  for (const page of [terms, privacy]) assert.match(page, /Last updated \{UPDATED\}/);
  assert.match(privacy, /We do not use advertising or analytics cookies/);
  assert.match(privacy, /We do not keep the photo/);
  // The policy says none is used: nothing in the site may load one.
  const files = fs.readdirSync(new URL("../../src", import.meta.url), { recursive: true }).filter((f) => /\.(tsx?|jsx?)$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(new URL(`../../src/${f.replace(/\\/g, "/")}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /googletagmanager|google-analytics\.com|@vercel\/analytics|connect\.facebook\.net|clarity\.ms|hotjar/, f);
  }
});
