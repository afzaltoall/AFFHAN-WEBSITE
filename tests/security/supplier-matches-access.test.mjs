// 2026-10-22: supplier data (the old suppliers book: names, numbers, WeChat IDs) reaches two places only, the console's
// inquiry panel and a staff member's own lead, one inquiry at a time. Read from the sources: the matcher is server-only
// and imported by its two routes alone, the panel is loaded lazily by its two hosts alone, the console's route answers
// admins, and the staff route answers an employee only for an inquiry assigned to them now, as a condition of the
// lookup, with a 404 for anything else. Every answer is private and never cached. The same rules are exercised against
// a running build by the gate's end-to-end run; these keep them from quietly coming undone.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), "utf8");
const walk = (dir) =>
  fs.readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(p) : [p];
  });

const MATCHER = "src/lib/server/supplier-match";
const ADMIN_ROUTE = "src/app/api/admin/inquiries/[id]/supplier-matches/route.ts";
const STAFF_ROUTE = "src/app/api/employee/inquiries/[id]/supplier-matches/route.ts";
const PANEL = "src/components/admin/InquirySupplierMatches.tsx";
const sources = walk("src").filter((p) => /\.(ts|tsx)$/.test(p));

test("every file of the matcher is server-only", () => {
  const files = walk(MATCHER).filter((p) => p.endsWith(".ts"));
  assert.ok(files.length >= 7, `${files.length} files`);
  for (const f of files) assert.match(read(f), /^import "server-only";/, f);
});

test("only the two routes import the matcher", () => {
  const importers = sources.filter((p) => !p.startsWith(MATCHER) && /from "@\/lib\/server\/supplier-match(\/[\w-]+)?"/.test(read(p)));
  assert.deepEqual(importers.sort(), [ADMIN_ROUTE, STAFF_ROUTE].sort());
});

test("only the console and the staff lead show the panel, and both load it lazily", () => {
  const hosts = sources.filter((p) => p !== PANEL && /InquirySupplierMatches/.test(read(p)));
  assert.deepEqual(hosts.sort(), ["src/components/admin/AdminConsole.tsx", "src/components/employee/CustomerDetail.tsx"]);
  for (const h of hosts) {
    const source = read(h);
    assert.match(source, /dynamic\(\(\) => import\("@\/components\/admin\/InquirySupplierMatches"\), \{ ssr: false \}\)/, h);
    assert.doesNotMatch(source, /import \{?\s*InquirySupplierMatches\s*\}? from/, `${h} imports the panel directly`);
  }
  assert.match(read("src/components/employee/CustomerDetail.tsx"), /<InquirySupplierMatches [^>]*audience="employee"/);
});

/** Every NextResponse.json( call in a handler, with its arguments. */
const responses = (handler) => handler.split("NextResponse.json(").slice(1);

test("the console's route: admins only, any inquiry, private answers", () => {
  const source = read(ADMIN_ROUTE);
  const handler = source.slice(source.indexOf("export async function GET"));
  assert.match(source, /const PRIVATE = \{ "Cache-Control": "private, no-store" \};/);
  assert.match(handler, /const auth = await readAdminSession\(\);\s+if \(!auth\.ok\)/);
  assert.match(handler, /auth\.reason === "not_admin"/);
  assert.match(handler, /status: forbidden \? 403 : 401/);
  assert.match(handler, /supplierMatchesFor\(id, \{ kind: "admin" \}\)/);
  for (const r of responses(handler)) assert.match(r, /headers: PRIVATE/, `an answer without the private header: ${r.slice(0, 60)}`);
});

test("the staff route: an employee's own leads only, 404 for anything else, each view logged, private answers", () => {
  const source = read(STAFF_ROUTE);
  const handler = source.slice(source.indexOf("export async function GET"));
  assert.match(source, /const PRIVATE = \{ "Cache-Control": "private, no-store" \};/);
  // The staff cookie alone decides: not the admin's, and not the workspace's admin fallback.
  assert.match(handler, /const auth = await readEmployeeAuth\(\);\s+if \(!auth\.ok\) \{\s+return NextResponse\.json\([^)]*status: 401/);
  assert.doesNotMatch(source, /readAdminSession|readWorkspaceAuth/);
  assert.match(handler, /supplierMatchesFor\(id, \{ kind: "employee", employeeId: auth\.employee\.id \}\)/);
  assert.match(handler, /if \(!result\) return NextResponse\.json\(\{ error: "Not found" \}, \{ status: 404/);
  assert.match(handler, /console\.info\(`supplier matches viewed: employee \$\{auth\.employee\.id\}, inquiry \$\{id\}, \$\{new Date\(\)\.toISOString\(\)\}`\)/);
  for (const r of responses(handler)) assert.match(r, /headers: PRIVATE/, `an answer without the private header: ${r.slice(0, 60)}`);
});

test("for an employee the assignment is part of the lookup, and app inquiries are never theirs", () => {
  const source = read(`${MATCHER}/index.ts`);
  const lookup = source.slice(source.indexOf("export async function supplierMatchesFor"), source.indexOf("if (!inquiry) return null;"));
  const employee = lookup.slice(lookup.indexOf('viewer.kind === "employee"'), lookup.indexOf(": ((await"));
  assert.match(employee, /prisma\.inquiry\.findFirst\(\{ where: \{ id: inquiryId, assignedToId: viewer\.employeeId, status: \{ not: "deleted" \} \}/);
  assert.doesNotMatch(employee, /mobileInquiry/);
});

test("the panel links into the supplier book and New Suppliers (admin pages) for admins only", () => {
  const source = read(PANEL);
  const links = [...source.matchAll(/href=\{[^}]*\/admin\/(?:new-)?suppliers\//g)];
  assert.equal(links.length, 3, "the book search, the supplier's page and the application on New Suppliers");
  for (const m of links) {
    const before = source.slice(Math.max(0, m.index - 400), m.index);
    assert.match(before, /\{admin (\?|&&) \(?\s*<Link\s*$/, "each one inside an admin-only branch");
  }
});

// 2026-10-23: new suppliers (the supplier portal's applications) answer an inquiry beside the book's.
test("new suppliers: read only for an inquiry the viewer has, open or accepted applications of active accounts", () => {
  const index = read(`${MATCHER}/index.ts`);
  const body = index.slice(index.indexOf("export async function supplierMatchesFor"));
  assert.ok(body.includes("portalSuggestionsFor(inquiry)"));
  assert.ok(
    body.indexOf("portalSuggestionsFor(inquiry)") > body.indexOf("if (!inquiry) return null;"),
    "after the lookup, so a staff member's are as gated as the book's",
  );
  const portal = read(`${MATCHER}/portal.ts`);
  assert.match(portal, /where: \{ status: \{ in: \[\.\.\.SUGGESTED_STATUSES\] \}, supplier: \{ status: "ACTIVE" \} \}/);
  assert.match(read(`${MATCHER}/portal-rank.ts`), /export const SUGGESTED_STATUSES = \["NEW", "REVIEWING", "ACCEPTED"\] as const;/);
  // What the application was sent with, never the account's sign-in email, password, address, details or photos.
  const from = portal.indexOf("select: {");
  const select = portal.slice(from, portal.indexOf("},", from));
  assert.match(select, /mobile: true, wechatId: true/);
  assert.doesNotMatch(select, /email|password|Hash|companyAddress|details|photos/);
});

test("the matcher's own folder never logs a number or a WeChat ID", () => {
  for (const f of [...walk(MATCHER), ADMIN_ROUTE, STAFF_ROUTE].filter((p) => /\.(ts|tsx)$/.test(p))) {
    for (const m of read(f).matchAll(/console\.\w+\(([^;]*)\);/g)) {
      assert.doesNotMatch(m[1], /phone|contact|handle|wechat|companyName|personName|suggestions/i, `${f}: ${m[0].slice(0, 80)}`);
    }
  }
});
