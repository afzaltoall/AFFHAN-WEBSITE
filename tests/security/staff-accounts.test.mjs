// An employee's account (Sales / Referral only / Assigner) decides what they see at /employee/login. The owner,
// 2026-11-04: "give an option to change the person into sales and referral ... what can they see in their employee
// account". Employee tasks changes it only through the Staff section's own route, which lets go of what a person
// leaving Sales holds, so the two places can never disagree about what a change does.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/** A source file's code, its comments taken out. */
const read = (p) =>
  fs
    .readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

test("Employee tasks changes an account only through the Staff route, which releases what a person leaving Sales holds", () => {
  const board = read("src/components/admin/TripReferralsBoard.tsx");
  assert.ok(board.includes('send<{ released?: number }>(`/api/admin/employees/${w.employeeId}/`, { job }, "PATCH")'), "the Staff route, PATCH, the account alone");
  assert.doesNotMatch(board, /\/api\/admin\/trip-referrals\/(job|account)/, "no route of its own");
  // The route lets go of their customers whenever the new account is not Sales, and only an admin reaches it.
  const route = read("src/app/api/admin/employees/[id]/route.ts");
  assert.match(route, /const leavesSales = isStaffJob\(body\?\.job\) && body\.job !== "SALES";/);
  assert.match(route, /await releaseDeactivated\(id, admin\.name \|\| admin\.email, new Date\(\), leavesSales/);
  assert.match(route, /admin\.role === "admin" \? admin : null/);
});

test("the three accounts, named as the staff workspace opens them, on rows that say which each person has", () => {
  const board = read("src/components/admin/TripReferralsBoard.tsx");
  for (const account of ['job: "SALES", label: "Sales"', 'job: "REFERRAL", label: "Referral only"', 'job: "ASSIGNER", label: "Assigner"']) assert.ok(board.includes(account), account);
  assert.match(read("src/lib/server/trip-referrals.ts"), /select: \{ id: true, name: true, email: true, isActive: true, job: true,/);
  // The workspace reads the account from the database on every request, so a change shows on their next page.
  assert.match(read("src/lib/employee-session.ts"), /job: employee\.job,/);
});
