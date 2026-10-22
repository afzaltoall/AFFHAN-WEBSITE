// 2026-10-22, self-claim: staff take customers from an open pool, and before they take one the pool may show only the
// customer's AFFHAN number, the products' titles and photographs, quantities, the country, when each request
// arrived and what kind it is. Never a name, phone number, email, company or message, and never the customer key,
// which is the phone number. Administrators no longer hand anyone out; the old assign actions answer 410, and the
// one control left is Release to pool on the Queue page. Read from the sources: the gate's end-to-end run exercises
// the same rules against a running build, and these keep them from quietly coming undone.
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
const sources = walk("src").filter((p) => /\.(ts|tsx)$/.test(p));

const POOL = "src/lib/lead-pool.ts";
/** The body of one exported function, up to the next top-level export. */
const fn = (source, name) => {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const next = source.indexOf("\nexport ", start + 10);
  return source.slice(start, next < 0 ? undefined : next);
};
const block = (source, start, end) => {
  const a = source.indexOf(start);
  assert.ok(a >= 0, `${start} not found`);
  return source.slice(a, source.indexOf(end, a));
};
/** Source without its comments, which are allowed to say what the code must never touch. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const FORBIDDEN = /\b(customerName|fullName|phone|email|message|companyName|notes|statusNote|userId)\b/;

test("the pool reads only what it may show", () => {
  const list = code(fn(read(POOL), "listPool"));
  assert.match(list, /prisma\.leadQueueEntry\.findMany\(\{\s+where: \{ state: POOL_STATE\.OPEN \},\s+select: \{ id: true, customerKey: true, enteredAt: true \}/);
  assert.match(list, /select: \{ customerKey: true, productName: true, quantity: true, country: true, createdAt: true, product: \{ select: \{ imageUrl: true \} \} \}/);
  assert.match(list, /prisma\.contactMessage\.findMany\(\{ where, select: \{ customerKey: true, country: true, createdAt: true \} \}\)/);
  assert.match(list, /prisma\.shipmentInquiry\.findMany\(\{ where, select: \{ customerKey: true, country: true, createdAt: true \} \}\)/);
  // Nothing else is selected, and no field that names or reaches the customer is so much as mentioned.
  assert.equal((list.match(/select:/g) ?? []).length, 6, "an extra select in listPool");
  assert.doesNotMatch(list, FORBIDDEN);
  assert.doesNotMatch(list, /include:/);
});

test("a pool row carries its place in the pool, never the customer key", () => {
  const source = read(POOL);
  const types = code(block(source, "export interface PoolItem", "export async function listPool"));
  assert.doesNotMatch(types, /customerKey/);
  assert.doesNotMatch(types, FORBIDDEN);
  const row = block(fn(source, "listPool"), "rows.push({", "});");
  // The key may look up their AFFHAN number; it may not be a field of the row, or the value of one.
  assert.doesNotMatch(row, /\bcustomerKey\s*:|:\s*e\.customerKey\s*[,}]/);
  assert.match(row, /code: codes\[e\.customerKey\] \?\? null,/);
  assert.match(row, /id: e\.id,/);
});

test("the staff workspace gets the pool from listPool alone, and its client code only the types", () => {
  const page = read("src/app/employee/(workspace)/dashboard/page.tsx");
  assert.match(page, /listPool\(employeeId\)/);
  assert.match(page, /pool=\{pool\}/);
  for (const p of sources) {
    const s = read(p);
    if (!/^"use client";/.test(s)) continue;
    for (const line of s.split(/\r?\n/).filter((l) => /from "@\/lib\/lead-pool"/.test(l))) {
      assert.match(line, /^import type /, `${p} imports the pool's server code: ${line}`);
    }
  }
});

/** Every NextResponse.json( call in a handler, with its arguments. */
const responses = (handler) => handler.split("NextResponse.json(").slice(1);

for (const [route, what] of [
  ["src/app/api/employee/pool/route.ts", "the pool"],
  ["src/app/api/employee/pool/take/route.ts", "Take"],
  ["src/app/api/employee/leads/release/route.ts", "Release"],
]) {
  test(`${what}: a member of staff's own session, the actor never taken from the body, private answers`, () => {
    const source = read(route);
    assert.match(source, /const PRIVATE = \{ "Cache-Control": "private, no-store" \};/);
    assert.match(source, /const auth = await readEmployeeAuth\(\);\s+if \(!auth\.ok\) return NextResponse\.json\([^)]*status: 401/);
    assert.doesNotMatch(source, /readAdminSession|readWorkspaceAuth/);
    assert.doesNotMatch(source, /body\??\.(employeeId|employee|assignedToId)/);
    for (const r of responses(source)) assert.match(r, /headers: PRIVATE/, `${route}: an answer without the private header: ${r.slice(0, 60)}`);
  });
}

test("Take: one winner, the loser told who, and the cap checked under a lock of the taker's own", () => {
  const take = fn(read(POOL), "takeCustomer");
  assert.match(take, /pg_advisory_xact_lock\(hashtext\(\$\{`pool-take:\$\{me\.id\}`\}\)\)/);
  assert.match(take, /if \(held >= MAX_OPEN_LEADS\) return \{ outcome: "cap"/);
  assert.match(take, /tx\.leadQueueEntry\.updateMany\(\{\s+where: \{ id: entry\.id, state: POOL_STATE\.OPEN, currentEmployeeId: null \}/);
  assert.match(take, /if \(claimed\.count !== 1\)/);
  const route = read("src/app/api/employee/pool/take/route.ts");
  assert.match(route, /\{ error: `Already taken by \$\{result\.by\}`, by: result\.by \}, \{ status: 409/);
});

test("Release and Not attended: only the holder, and the customer leaves them at once", () => {
  const release = fn(read(POOL), "releaseCustomer");
  assert.match(release, /entry\.currentEmployeeId !== opts\.employee\.id\) return \{ outcome: "not-yours" \}/);
  assert.match(release, /where: \{ id: entry\.id, state: POOL_STATE\.HELD, currentEmployeeId: opts\.employee\.id \}/);
  assert.match(release, /await assignAll\(tx, key, null, now\);/);
  assert.match(read("src/app/api/employee/leads/release/route.ts"), /status: 404/);
  assert.match(read("src/app/api/employee/leads/status/route.ts"), /releaseCustomer\(\{[^}]*kind: POOL_EVENT\.NOT_ATTENDED/s);
});

test("the console's handling history: administrators only, private", () => {
  const source = read("src/app/api/admin/handling/route.ts");
  assert.match(source, /const auth = await readAdminSession\(\);/);
  assert.match(source, /status: forbidden \? 403 : 401/);
  for (const r of responses(source)) assert.match(r, /headers: PRIVATE/, r.slice(0, 60));
});

test("no assign control is left in the admin's screens", () => {
  const ui = sources.filter((p) => p.startsWith("src/components/") || (p.startsWith("src/app/") && p.endsWith(".tsx")));
  for (const p of ui) {
    const s = read(p);
    assert.doesNotMatch(s, /action: "assign"|action: "requeue"|"\/api\/admin\/queue\/"[^;]*assign/, `${p} still sends an assign`);
    assert.doesNotMatch(s, /<AssigneePicker\b|<AssignMenu\b|function AssignMenu|onAssign(Selected)?=/, `${p} still draws an assign control`);
  }
  // The picker itself has gone; the file keeps the avatar it shared.
  const picker = read("src/components/admin/AssigneePicker.tsx");
  assert.deepEqual([...picker.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]), ["Avatar"]);
  // The Queue's one control is Release to pool, on held rows.
  const queue = read("src/components/admin/QueueBoard.tsx");
  assert.match(queue, /body: JSON\.stringify\(\{ entryId: row\.id, action: "release" \}\)/);
  assert.match(queue, /\{row\.state === "HELD" && \(\s+<button/);
  // And the server has no way to hand a customer out any more.
  assert.doesNotMatch(read(POOL), /export async function admin(Assign|Move)|export async function reopenCustomer/);
});

test("the old assign actions answer 410 Gone, with where the control went", () => {
  for (const route of ["src/app/api/admin/inquiry/route.ts", "src/app/api/admin/contact/route.ts", "src/app/api/admin/shipping/route.ts"]) {
    assert.match(read(route), /if \(action === "assign"\) return NextResponse\.json\(\{ error: ASSIGN_GONE \}, \{ status: 410 \}\);/, route);
  }
  const queue = read("src/app/api/admin/queue/route.ts");
  assert.match(queue, /if \(action === "assign" \|\| action === "requeue"\) return NextResponse\.json\(\{ error: ASSIGN_GONE \}, \{ status: 410 \}\);/);
  assert.match(queue, /if \(action !== "release"\) return NextResponse\.json\(\{ error: "action must be release" \}, \{ status: 400 \}\);/);
  assert.match(queue, /if \(!admin \|\| admin\.role !== "admin"\)/);
});

test("the sweep's test clock stays off unless a build turns it on", () => {
  const cron = read("src/app/api/cron/leads/rotate/route.ts");
  assert.match(cron, /const refused = refuseUnlessCron\(request\);\s+if \(refused\) return refused;/);
  assert.match(cron, /if \(nowParam && process\.env\.LEAD_QUEUE_TEST_CLOCK !== "1"\)/);
  assert.match(cron, /runPoolSweep\(\{ now, dryRun \}\)/);
});

// 2026-10-22, the owner: a customer whose every request is marked Handled, Spam or deleted in the console never
// enters the pool. The switch, the console's own routes and every sweep apply the same rule.
test("already-handled customers stay out of the pool: the switch, the console's routes and the sweep apply the rule", () => {
  const pool = read(POOL);
  // The switch sorts each customer by the rule, and lets go of the ones it sets aside.
  assert.match(pool, /needsHandling: leads\.some\(\(l\) => needsHandling\(l\.status\)\),/);
  assert.match(pool, /if \(\(data\.state === POOL_STATE\.OPEN \|\| data\.state === POOL_STATE\.DONE\) && assigned\.length\) await assignAll\(tx, key, null, now\);/);
  // The sweep applies the console's triage before any clock, so nobody already handled is auto-released or given up on.
  const sweep = fn(pool, "runPoolSweep");
  const triage = sweep.indexOf("reconsiderTriage(await triageCandidates(), { now, dryRun })");
  assert.ok(triage > 0 && triage < sweep.indexOf("if (report.officeOpen)") && triage < sweep.indexOf("expiresAt: { lte: now }"), "the triage pass runs before the clocks");
  // Set aside: nobody's, on no clock.
  const reconsider = fn(pool, "reconsiderTriage");
  assert.match(reconsider, /state: POOL_STATE\.DONE, currentEmployeeId: null, nextRotationAt: null/);
  assert.match(reconsider, /await assignAll\(tx, e\.customerKey, null, now\);/);
  // Each of the console's three lists reads whose requests they are before the change, and applies the rule after it.
  for (const [route, kind] of [
    ["src/app/api/admin/inquiry/route.ts", "inquiry"],
    ["src/app/api/admin/contact/route.ts", "contact"],
    ["src/app/api/admin/shipping/route.ts", "shipment"],
  ]) {
    const s = read(route);
    assert.match(s, new RegExp(`const keys = await customerKeysOf\\("${kind}", `), route);
    assert.ok(s.indexOf("customerKeysOf(") < s.indexOf("deleteMany("), `${route}: keys are read before a purge removes the rows`);
    assert.equal((s.match(/await applyConsoleTriage\(keys, by\);/g) ?? []).length, 2, `${route}: after a purge and after a status change`);
  }
  // The pool only ever lists customers in it.
  assert.match(fn(pool, "listPool"), /where: \{ state: POOL_STATE\.OPEN \}/);
});

// 2026-10-22, the owner: the person holding a customer closes them. Lead or No lead marks every open request of the
// customer's Handled, "closed by" them on the trail, and an administrator may not mark a held customer Handled. Spam
// and delete still end the hold.
const TRIAGE_ROUTES = [
  ["src/app/api/admin/inquiry/route.ts", "inquiry"],
  ["src/app/api/admin/contact/route.ts", "contact"],
  ["src/app/api/admin/shipping/route.ts", "shipment"],
  ["src/app/api/admin/inquiry/[id]/route.ts", "inquiry"],
  ["src/app/api/admin/contact/[id]/route.ts", "contact"],
];

test("Handled on a held customer is refused by every console route that can set it, before anything is written", () => {
  for (const [route, kind] of TRIAGE_ROUTES) {
    const s = code(read(route));
    assert.match(s, new RegExp(`const keys = await customerKeysOf\\("${kind}", `), route);
    assert.match(
      s,
      /if \(status === "handled"\) \{\s+const held = await heldAmong\(keys\);\s+if \(held\.length\) return NextResponse\.json\(\{ error: heldByMessage\(held\.map\(\(h\) => h\.holder \?\? ""\), held\.length\) \}, \{ status: 409 \}\);\s+\}/,
      route,
    );
    const refusal = s.indexOf("await heldAmong(keys)");
    const write = s.search(/\.update(Many)?\(\{\s+where: \{ id[^;]*?data: \{ status \}/);
    assert.ok(refusal > 0 && write > refusal, `${route}: the check comes before the write`);
    // Spam, delete, restore and purge are never checked: only Handled.
    assert.equal((s.match(/heldAmong\(/g) ?? []).length, 1, route);
  }
  // And no other route writes a request's triage status.
  const writers = sources.filter((p) => p.startsWith("src/app/api/") && /\.(inquiry|contactMessage|shipmentInquiry)\.update(Many)?\(\{[^;]*?data: \{ status/.test(code(read(p))));
  assert.deepEqual(writers.sort(), TRIAGE_ROUTES.map(([r]) => r).sort());
  // Held means held: the pool's HELD state, nobody else.
  assert.match(fn(read(POOL), "heldAmong"), /where: \{ customerKey: \{ in: keys \}, state: POOL_STATE\.HELD \}/);
  // The console greys Handled on every status control that knows the customer is held, and checks a selection first.
  const ui = read("src/components/admin/AdminConsole.tsx");
  const controls = ui.match(/<StatusControl\b[\s\S]*?\/>/g) ?? [];
  assert.equal(controls.length, 6);
  for (const c of controls) assert.match(c, /heldBy=\{heldByOf\(\w+\.handling\)\}/, `every status control knows who holds the customer: ${c}`);
  assert.equal((ui.match(/const refusal = heldRefusal\(/g) ?? []).length, 3, "inquiries, messages and freight check a selection");
  assert.match(ui, /if \(blocked\) window\.alert\(blocked\); else onChange\(s\);/);
});

test("Lead or No lead closes the customer's open requests, after deciding them, and nothing else closes them", () => {
  const status = code(read("src/app/api/employee/leads/status/route.ts"));
  const touch = status.indexOf("await touchCustomer(");
  const close = status.indexOf("await closeOpenRequests({ leads: refs, employee })");
  assert.ok(touch > 0 && close > touch, "decided first, then closed");
  assert.match(status, /if \(status === "LEAD" \|\| status === "NO_LEAD"\) await closeOpenRequests\(\{ leads: refs, employee \}\);/);
  const callers = sources.filter((p) => p !== POOL && /closeOpenRequests\(/.test(code(read(p))));
  assert.deepEqual(callers, ["src/app/api/employee/leads/status/route.ts"]);
  // Only what is still open is marked (never a deleted or spam request back to life), and the trail says who.
  const closer = code(fn(read(POOL), "closeOpenRequests"));
  assert.match(closer, /status: \{ notIn: \[\.\.\.SETTLED_TRIAGE\] \},/);
  assert.match(closer, /const data = \{ status: "handled" \};/);
  assert.match(closer, /logEvent\(tx, entry\.id, POOL_EVENT\.REQUESTS_CLOSED, \{ from: opts\.employee, note: closedByNote\(opts\.employee\.name, marked\) \}\)/);
});
