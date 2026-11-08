// My referrals (2026-11-08, the owner: a Refresh, and "click pana yaru pana details pakava katanum"). Its list is a
// client component, so whatever the page hands it is in the browser: the mobile must be masked before that, and the
// page must hand over nothing else of the application.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/** A source file's code, its comments taken out. */
const read = (p) =>
  fs
    .readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const PAGE = "src/app/employee/(workspace)/referrals/page.tsx";
const LIST = "src/components/employee/ReferralApplicants.tsx";

test("the browser gets the mobile masked, and only these fields of an application", () => {
  const page = read(PAGE);
  assert.match(page, /mobile: maskPhone\(a\.phone\),/);
  const people = page.slice(page.indexOf("const people: ReferralPerson[]"), page.indexOf("return (", page.indexOf("const people: ReferralPerson[]") + 400));
  assert.deepEqual([...people.matchAll(/^\s+([a-zA-Z]+):/gm)].map((m) => m[1]).sort(), ["at", "city", "country", "day", "mobile", "name", "points", "state", "tripId"]);
  assert.match(page, /<ReferralApplicants people=\{people\} \/>/, "the list is handed the people, not the applications");
  assert.doesNotMatch(page, /r\.applications\.map\(\(a\) => \(\s*</, "and the page draws no row of the raw applications");
});

test("the list has no way to a whole number or an ID proof", () => {
  const list = read(LIST);
  assert.doesNotMatch(list, /fetch\(|trip-documents|documents|\.phone\b|referralCode/);
  assert.match(list, /aria-expanded=\{open\}/);
  assert.match(list, /setOpenId\(\(now\) => \(now === id \? null : id\)\)/, "one open at a time; a second press closes it");
});

test("Refresh reads the page again from the server, without a reload", () => {
  const button = read("src/components/employee/ReferralRefresh.tsx");
  assert.match(button, /start\(\(\) => router\.refresh\(\)\)/);
  assert.doesNotMatch(button, /location\.reload/);
  assert.match(read(PAGE), /<ReferralRefresh \/>/);
  assert.match(read(PAGE), /export const dynamic = "force-dynamic";/);
});

test("on a phone: a list of people, and the link is never broken inside a word", () => {
  const list = read(LIST);
  assert.match(list, /<ul className=\{`divide-y sm:hidden/);
  assert.match(list, /className="hidden overflow-x-auto sm:block"/);
  const page = read(PAGE);
  assert.doesNotMatch(page, /break-all/);
  assert.match(page, /<wbr \/>/);
});

test("the staff tabs say which page you are on, in the dark brand colour", () => {
  const tabs = read("src/components/employee/WorkspaceTabs.tsx");
  assert.match(tabs, /aria-current=\{here \? "page" : undefined\}/);
  assert.match(tabs, /text-brand-dark/);
  assert.match(read("src/app/employee/(workspace)/layout.tsx"), /<WorkspaceTabs pages=\{pages\} \/>/);
});
