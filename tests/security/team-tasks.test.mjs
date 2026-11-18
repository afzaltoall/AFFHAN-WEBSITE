// Team tasks (2026-11-18, the owner: "in admin i see the employee tasks now show the all tasks of works to employees
// everyone in there employee page overall tasks status so they can see everyone status and theres too"). Every
// employee sees every other's name and how far they have got, and nothing more of them: no email, no code, no points
// or rupees, and nothing of who applied through their link (the trip's Privacy Policy, section 5, tells applicants
// only the employee whose link they used sees them).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ordinal, referralTaskDates, targetShare, teamPlaces, teamRows, teamTotals } from "../../src/lib/trip-referral-shared.ts";

/** A source file's code, its comments taken out. */
const read = (p) =>
  fs
    .readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const PAGE = "src/app/employee/(workspace)/tasks/page.tsx";
const SERVER = "src/lib/server/trip-referrals.ts";
const fnOf = (src, name) => {
  const at = src.indexOf(`export async function ${name}`);
  assert.ok(at >= 0, name);
  return src.slice(at, src.indexOf("\n}\n", at) + 2);
};

test("each employee's line counts as Employee tasks counts: deleted never, spam and taken-out applied but not counted", () => {
  const employees = [
    { id: "a", name: "Asma" },
    { id: "b", name: "Bilal" },
    { id: "c", name: "Chitra" },
    { id: "d", name: "Deepa" },
    { id: "e", name: "Arun" },
  ];
  const counts = [
    { referrerId: "a", referralState: "counted", status: "new", n: 3 },
    { referrerId: "a", referralState: "counted", status: "spam", n: 1 },
    { referrerId: "a", referralState: "not_counted", status: "new", n: 2 },
    { referrerId: "a", referralState: "waiting", status: "handled", n: 1 },
    { referrerId: "a", referralState: "counted", status: "deleted", n: 5 },
    { referrerId: "b", referralState: "counted", status: "handled", n: 3 },
    { referrerId: "c", referralState: "counted", status: "new", n: 10 },
    // A former employee's, and an application with no code: on nobody's line.
    { referrerId: "gone", referralState: "counted", status: "new", n: 4 },
    { referrerId: null, referralState: null, status: "new", n: 900 },
  ];
  const rows = teamRows(employees, counts, new Map([["b", 50]]), 100);
  assert.deepEqual(
    rows.map((r) => [r.name, r.referred, r.counted, r.target]),
    [
      ["Chitra", 10, 10, 100],
      // The same count: the one with more applied first.
      ["Asma", 7, 3, 100],
      ["Bilal", 3, 3, 50],
      // Nothing yet: by name.
      ["Arun", 0, 0, 100],
      ["Deepa", 0, 0, 100],
    ],
  );
  assert.deepEqual(Object.keys(rows[0]).sort(), ["counted", "employeeId", "name", "referred", "target"], "a name and figures, nothing else");
});

test("places: the same count shares a place, and nobody has one before anything counts", () => {
  const at = (...c) => teamPlaces(c.map((counted) => ({ counted })));
  assert.deepEqual(at(10, 3, 3, 0), [1, 2, 2, null]);
  assert.deepEqual(at(9, 7, 7, 7, 2), [1, 2, 2, 2, 5]);
  assert.deepEqual(at(5, 5, 5), [1, 1, 1]);
  assert.deepEqual(at(0, 0), [null, null]);
  assert.deepEqual(at(), []);
  assert.equal(
    [1, 2, 3, 4, 10, 11, 12, 13, 14, 21, 22, 23, 24, 100, 101, 102, 103, 111, 112, 113, 121].map(ordinal).join(" "),
    "1st 2nd 3rd 4th 10th 11th 12th 13th 14th 21st 22nd 23rd 24th 100th 101st 102nd 103rd 111th 112th 113th 121st",
  );
});

test("the team together: everyone's counted against all their targets, and who has reached theirs", () => {
  const rows = [
    { employeeId: "a", name: "A", referred: 130, counted: 120, target: 100 },
    { employeeId: "b", name: "B", referred: 60, counted: 50, target: 50 },
    { employeeId: "c", name: "C", referred: 12, counted: 9, target: 100 },
    { employeeId: "d", name: "D", referred: 0, counted: 0, target: 100 },
  ];
  assert.deepEqual(teamTotals(rows), { employees: 4, referred: 202, counted: 179, target: 350, reached: 2, toGo: 171 });
  assert.deepEqual(teamTotals([]), { employees: 0, referred: 0, counted: 0, target: 0, reached: 0, toGo: 0 });
  assert.equal(targetShare(0, 100), 0);
  assert.equal(targetShare(42, 100), 0.42);
  assert.equal(targetShare(150, 100), 1, "a bar never runs past its end");
  assert.equal(targetShare(3, 0), 1);
});

test("the task's dates read as My referrals has always written them", () => {
  const starts = "2026-11-02T18:30:00.000Z"; // India's midnight, 3 Nov
  const ends = "2026-11-25T18:30:00.000Z"; // the first moment after 25 Nov
  assert.equal(referralTaskDates({ startsAt: starts, endsAt: ends }), "3 Nov 2026 to 25 Nov 2026");
  assert.equal(referralTaskDates({ startsAt: null, endsAt: ends }), "until 25 Nov 2026");
  assert.equal(referralTaskDates({ startsAt: starts, endsAt: null }), "from 3 Nov 2026");
  assert.equal(referralTaskDates({ startsAt: null, endsAt: null }), null);
  assert.match(read("src/app/employee/(workspace)/referrals/page.tsx"), /const dates = referralTaskDates\(settings\);/);
});

test("the board asks the database for names and counts only, and writes nothing", () => {
  const board = fnOf(read(SERVER), "teamBoard");
  assert.match(board, /prisma\.employee\.findMany\(\{ where: \{ isActive: true \}, select: \{ id: true, name: true \} \}\)/);
  assert.match(board, /by: \["referrerId", "referralState", "status"\],/);
  assert.match(board, /where: \{ referrerId: \{ not: null \}, status: \{ not: "deleted" \} \},/);
  assert.match(board, /_count: \{ _all: true \},/);
  assert.doesNotMatch(board, /_sum|email|code|payout|phone|fullName|ensure|create|update|delete\b/i, "no money, no code, no applicant, no write");
  // Their own points, for them alone: the rule referralCounts is.
  const points = fnOf(read(SERVER), "employeePoints");
  assert.match(points, /where: \{ referrerId: employeeId, referralState: "counted", status: \{ notIn: \["spam", "deleted"\] \} \},/);
});

test("the page draws names and counts, and nobody's points but your own", () => {
  const page = read(PAGE);
  assert.doesNotMatch(page, /"use client"/, "drawn on the server: the rows are never props in the browser");
  const imports = [...page.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ["@/components/employee/ReferralRefresh", "@/components/employee/workspace-ui", "@/lib/employee-session", "@/lib/server/trip-referrals", "@/lib/trip-referral-shared", "next"]);
  assert.doesNotMatch(page, /email|referralLink|maskPhone|rupees|payout|\.code\b|r\.points|me\.points/);
  assert.match(page, /const myId = auth\.kind === "employee" \? auth\.employee\.id : null;/);
  assert.match(page, /= await Promise\.all\(\[teamBoard\(\), myId \? employeePoints\(myId\) : Promise\.resolve\(0\)\]\);/);
  assert.match(page, /\["Points", num\(myPoints\)\],/);
  assert.match(page, /\{me && \(/, "the You card only for an employee, never for an administrator looking in");
  assert.match(page, /export const dynamic = "force-dynamic";/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /<ReferralRefresh \/>/);
  // A phone: a list of people. From sm: the table.
  assert.match(page, /<ol className=\{`divide-y sm:hidden/);
  assert.match(page, /className="hidden overflow-x-auto sm:block"/);
});

test("every account has it: the tab, the rail row and the outline, never behind an account's own pages", () => {
  const tabs = read("src/components/employee/WorkspaceTabs.tsx");
  assert.match(tabs, /\{ href: "\/employee\/referrals\/", label: "My referrals" \},\s*\{ href: "\/employee\/tasks\/", label: "Team tasks" \},\s*\{ href: "\/employee\/profile\/", label: "Profile" \},/);
  const rail = read("src/components/employee/WorkspaceSidebar.tsx");
  const between = rail.slice(rail.indexOf('href="/employee/referrals/"'), rail.indexOf('href="/employee/tasks/"'));
  assert.ok(between.length > 0 && !/pages ===/.test(between), "the rail's row is outside every account's condition");
  assert.match(rail, /onNavigate=\{\(\) => nav\.start\("\/employee\/tasks\/"\)\}/);
  assert.match(rail, /aria-current=\{onTasks \? "page" : undefined\}/);
  assert.match(read("src/components/employee/WorkspaceSkeleton.tsx"), /"\/employee\/tasks": "Team tasks",/);
  // What the console says each account opens.
  const board = read("src/components/admin/TripReferralsBoard.tsx");
  for (const sees of ["My leads, My referrals, Team tasks and Profile.", "My referrals, Team tasks and Profile.", "Cargo tracking, My referrals, Team tasks and Profile."]) {
    assert.ok(board.includes(`sees: "${sees}`), sees);
  }
});
