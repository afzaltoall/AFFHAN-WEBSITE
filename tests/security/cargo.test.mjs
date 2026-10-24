// Cargo tracking (2026-10-24), read from the sources: assigner accounts keep the sheet and salespeople cannot, the
// sales routes refuse an assigner, every change is logged with its author, admins alone read the change log, and the
// public lookup on /shipping/ reads only the number, the stage and the timeline, never the customer or the sheet,
// behind a per-IP limit. The gate's cargo-e2e.mjs exercises the same rules on a running build.
//   npm run test:security
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CARGO_STATUSES, CARGO_STATUS_META, cargoKey, fmtDay, officeToday } from "../../src/lib/cargo-shared.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const handlers = (source) =>
  [...source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)].map((m, i, all) => source.slice(m.index, all[i + 1]?.index ?? source.length));

const CARGO_ROUTES = [
  "src/app/api/cargo/route.ts",
  "src/app/api/cargo/[id]/route.ts",
  "src/app/api/cargo/[id]/events/route.ts",
  "src/app/api/cargo/[id]/events/[eventId]/route.ts",
];

for (const rel of CARGO_ROUTES) {
  test(`${rel}: an assigner or an admin, before anything is read or written`, () => {
    const list = handlers(read(rel));
    assert.ok(list.length > 0);
    for (const h of list) {
      const gate = h.indexOf("const auth = await readCargoActor();");
      assert.ok(gate > 0, "reads the cargo actor");
      assert.match(h.slice(gate, gate + 200), /if \(!auth\.ok\) return NextResponse\.json\(\{ error: auth\.error \}, \{ status: auth\.status, headers: PRIVATE \}\);/);
      const work = h.search(/\b(listCargo|getCargo|createCargo|updateCargo|deleteCargo|addCargoEvent|editCargoEvent|deleteCargoEvent|prisma)\b\(/);
      assert.ok(work < 0 || work > gate, "the actor first");
      // Writes are made as the actor the server read, never one the body names.
      assert.doesNotMatch(h, /body\??\.(by|byId|byName|actor|employeeId)\b/);
    }
  });
}

test("who keeps the sheet: an assigner or an admin; a salesperson is refused", () => {
  const lib = read("src/lib/cargo.ts");
  const fn = lib.slice(lib.indexOf("export async function readCargoActor"), lib.indexOf("export class CargoError"));
  assert.match(fn, /const auth = await readWorkspaceAuth\(\);/);
  assert.match(fn, /if \(auth\.kind === "admin"\)/);
  assert.match(fn, /if \(isSalesJob\(auth\.employee\)\) return \{ ok: false, status: 403/);
  assert.match(read("src/lib/employee-session.ts"), /export const isSalesJob = \(employee: \{ job: string \}\) => employee\.job !== "ASSIGNER";/);
});

test("every change is written with its author, in the same transaction as the change", () => {
  const lib = read("src/lib/cargo.ts");
  for (const fn of ["createCargo", "updateCargo", "deleteCargo", "addCargoEvent", "editCargoEvent", "deleteCargoEvent"]) {
    const start = lib.indexOf(`export async function ${fn}(`);
    const body = lib.slice(start, lib.indexOf("\nexport ", start + 10));
    assert.match(body, /prisma\.\$transaction\(async \(tx\) => \{[\s\S]*await log\(tx, actor,/, fn);
  }
  assert.match(lib, /data: \{ shipmentId: shipment\.id, reference: shipment\.reference, action, summary, byId: actor\.id, byName: actor\.name \}/);
});

test("the change log is the admin's alone", () => {
  const route = read("src/app/api/cargo/changes/route.ts");
  const gate = route.indexOf('if (!admin || admin.role !== "admin")');
  assert.ok(gate > 0 && gate < route.indexOf("listCargoChanges("));
});

test("the public lookup: the number, the stage and the timeline, nothing of the sheet, behind a per-IP limit", () => {
  const lib = read("src/lib/cargo.ts");
  const fn = lib.slice(lib.indexOf("export async function trackCargo"));
  const select = fn.slice(fn.indexOf("select: {"), fn.indexOf("if (!r) return null;"));
  for (const field of ["customer", "type", "pol", "pod", "etd", "eta", "createdById", "changes", "byName", "byId"]) {
    assert.doesNotMatch(select, new RegExp(`\\b${field}\\b`), field);
  }
  assert.match(select, /reference: true,\s+status: true,\s+updatedAt: true,\s+events: \{ orderBy: \[\{ date: "asc" \}, \{ createdAt: "asc" \}\], select: \{ date: true, name: true, status: true \} \}/);
  const route = read("src/app/api/track/route.ts");
  assert.ok(route.indexOf("checkCargoTrackRateLimit(request)") < route.indexOf("trackCargo(ref)"), "the limit before the lookup");
  assert.match(route, /"Cache-Control": "no-store"/);
});

test("the sales routes refuse an assigner; the workspace sends each account to its own page", () => {
  for (const rel of [
    "src/app/api/employee/pool/route.ts",
    "src/app/api/employee/pool/take/route.ts",
    "src/app/api/employee/leads/status/route.ts",
    "src/app/api/employee/leads/release/route.ts",
    "src/app/api/employee/inquiries/[id]/supplier-matches/route.ts",
  ]) {
    assert.match(read(rel), /if \(!isSalesJob\(auth\.employee\)\) return NextResponse\.json\(\{ error: "This account keeps cargo tracking, not leads\.", reason: "not_sales" \}, \{ status: 403/, rel);
  }
  assert.match(read("src/app/employee/(workspace)/dashboard/page.tsx"), /if \(auth\.kind === "employee" && !isSalesJob\(auth\.employee\)\) redirect\("\/employee\/cargo\/"\);/);
  assert.match(read("src/app/employee/(workspace)/cargo/page.tsx"), /if \(auth\.kind === "employee" && isSalesJob\(auth\.employee\)\) redirect\("\/employee\/dashboard\/"\);/);
});

test("the migration only adds: a column with a default and three new tables", () => {
  const sql = read("prisma/migrations/20261024120000_cargo_tracking/migration.sql")
    .split(/\r?\n/)
    .filter((l) => !l.startsWith("--") && l.trim())
    .join("\n");
  // A foreign key's ON DELETE / ON UPDATE says what follows a parent row; it deletes and updates nothing now.
  const bare = sql.replace(/ON (DELETE|UPDATE) (CASCADE|SET NULL|RESTRICT|NO ACTION)/g, "");
  assert.doesNotMatch(bare, /\b(DROP|RENAME|DELETE|TRUNCATE|ALTER COLUMN)\b|^UPDATE\b/im);
  assert.match(sql, /^ALTER TABLE "Employee" ADD COLUMN\s+"job" TEXT NOT NULL DEFAULT 'SALES';$/m);
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  for (const st of statements) {
    assert.match(st, /^(ALTER TABLE "Employee" ADD COLUMN|CREATE TABLE "Cargo|CREATE (UNIQUE )?INDEX "Cargo|ALTER TABLE "Cargo\w+" ADD CONSTRAINT "Cargo\w+_fkey" FOREIGN KEY)/, st.slice(0, 80));
  }
});

test("matching, stages and days", () => {
  assert.equal(cargoKey("co 26-000002"), "CO26000002");
  assert.equal(cargoKey("CO-26-000002"), cargoKey("co26000002"));
  assert.deepEqual([...CARGO_STATUSES], ["IN_POL_PORT", "IN_SAILING", "IN_CUSTOMS"]);
  assert.deepEqual(CARGO_STATUSES.map((s) => CARGO_STATUS_META[s].label), ["In POL port", "In sailing", "In customs"]);
  assert.equal(fmtDay("2026-10-17"), "17 Oct 2026");
  assert.equal(fmtDay("2026-10-17", false), "17 Oct");
  // The office's day: 23:00 UTC on the 23rd is already the 24th in Chennai.
  assert.equal(officeToday(new Date("2026-10-23T23:00:00Z")), "2026-10-24");
});
