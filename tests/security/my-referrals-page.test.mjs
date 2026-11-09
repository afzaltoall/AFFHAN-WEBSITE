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

// 2026-11-09, the owner: "the clickable are not working while clicking profile getting 10 seconds ... the page is very
// slow". A press is answered at once, and the pages ask the database less, and less often one question at a time.
test("a staff tab or rail press is marked at once, the next page's outline in the page's place", () => {
  const tabs = read("src/components/employee/WorkspaceTabs.tsx");
  assert.match(tabs, /onNavigate=\{\(\) => nav\.start\(t\.href\)\}/);
  assert.match(tabs, /const at = nav\.moving \?\? pathOf\(pathname\);/);
  const rail = read("src/components/employee/WorkspaceSidebar.tsx");
  assert.equal((rail.match(/onNavigate=\{\(\) => nav\.start\("\/employee\/(dashboard|cargo|referrals|profile)\/"\)\}/g) ?? []).length, 4);
  const nav = read("src/components/employee/workspace-nav.tsx");
  assert.match(nav, /\{moving && <WorkspaceSkeleton path=\{moving\} \/>\}/);
  assert.match(nav, /<div className=\{moving \? "hidden" : undefined\}>\{children\}<\/div>/, "the page kept underneath, so going back is instant");
  assert.match(nav, /window\.setTimeout\(\(\) => setPending\(null\), 20_000\)/, "a move that never arrives gives the page back");
  const layout = read("src/app/employee/(workspace)/layout.tsx");
  assert.match(layout, /<WorkspaceNavProvider>/);
  assert.match(layout, /<WorkspaceMain>\{children\}<\/WorkspaceMain>/);
  // No loading.tsx under the workspace: it turned the account-type redirects into a 200 and held fast moves ~300 ms.
  for (const page of ["referrals", "profile", "dashboard", "cargo"]) {
    assert.ok(!fs.existsSync(new URL(`../../src/app/employee/(workspace)/${page}/loading.tsx`, import.meta.url)), page);
  }
  assert.ok(!fs.existsSync(new URL("../../src/app/employee/(workspace)/loading.tsx", import.meta.url)));
});

test("the shop's bar does not fetch the category list where it is never drawn", () => {
  const bar = read("src/components/sections/Navbar.tsx");
  assert.match(bar, /const noBarHere = \/\^\\\/\(admin\|employee\|supplier\)\(\\\/\|\$\)\/\.test\(pathname\);/);
  assert.match(bar, /if \(categoriesFetched\.current \|\| noBarHere\) return;/);
  assert.match(bar, /if \(noBarHere\) return;\s*const net = window\.setTimeout/);
});

test("the staff pages ask the database once for who is signed in, and side by side for the rest", () => {
  assert.match(read("src/lib/employee-session.ts"), /export const readWorkspaceAuth = cache\(readWorkspaceAuthNow\);/);
  const referrals = read("src/lib/server/trip-referrals.ts");
  const fn = referrals.slice(referrals.indexOf("export async function employeeReferrals"), referrals.indexOf("export async function employeeReferrals") + 600);
  assert.match(fn, /= await Promise\.all\(\[\s*ensureReferralCode\(employee\),/, "the code read with the rest, not before it");
  const profile = read("src/app/employee/(workspace)/profile/page.tsx");
  const nonSales = profile.slice(profile.indexOf("if (!isSalesJob(auth.employee)) {"), profile.indexOf("if (!isSalesJob(auth.employee)) {") + 300);
  assert.match(nonSales, /const row = await readIdentity\(\);/);
  assert.doesNotMatch(nonSales, /inquiry|statusUpdate|contactMessage/, "an account that takes no leads asks nothing about leads");
  assert.match(profile, /stats=\{null\}/);
  assert.doesNotMatch(profile, /const \[thisWeek, lastWeek\] = await/, "the week's counts asked with everything else");
});

test("Profile: My referrals' heading, and no leads for an account that takes none", () => {
  const profile = read("src/components/employee/EmployeeProfile.tsx");
  assert.match(profile, /<RefreshPill refreshing=\{refreshing\} onRefresh=\{refresh\} \/>/);
  assert.match(profile, /stats: ProfileStats \| null;/);
  assert.match(profile, /\{stats \? \(\s*<LeadSections /);
  assert.match(read("src/components/employee/ReferralRefresh.tsx"), /return <RefreshPill refreshing=\{refreshing\} onRefresh=\{\(\) => start\(\(\) => router\.refresh\(\)\)\} \/>;/);
});

test("the root layout ignores what browser extensions write on <body>, and nothing inside it", () => {
  const root = read("src/app/layout.tsx");
  assert.match(root, /<body className="[^"]+" suppressHydrationWarning>/);
});

test("the header's mark and the rail's mark, which go home, mark a press too", () => {
  assert.match(read("src/app/employee/(workspace)/layout.tsx"), /<WorkspaceLink href=\{home\}/);
  assert.match(read("src/components/employee/WorkspaceSidebar.tsx"), /onNavigate=\{\(\) => nav\.start\(home\)\}/);
});
