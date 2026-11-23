// The office's Instagram task (2026-11-23): who may do what, held in the code. Employees touch only their own
// accounts; only trackers (HR) and admins see everyone and check; nobody checks their own; only admins give the prize,
// and only to someone the server finds complete; the staff door and the console's door are never one.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const walk = (dir) =>
  fs.readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name === "route.ts" ? [`${dir}/${e.name}`] : [],
  );

const server = read("src/lib/server/instagram-task.ts");
const auth = read("src/lib/server/instagram-auth.ts");

test("two doors: the staff routes read only the staff cookie, the console's only the admin's", () => {
  // readWorkspaceAuth prefers a staff cookie over the admin's: a console tab would act as that employee.
  assert.doesNotMatch(auth, /import[^;]*readWorkspaceAuth|readWorkspaceAuth\(/);
  assert.match(auth, /const auth = await readEmployeeAuth\(\);/);
  assert.match(auth, /if \(!admin \|\| admin\.role !== "admin"\) return \{ ok: false, response: new NextResponse\("Unauthorized", \{ status: 401 \}\) \};/);
  const staff = walk("src/app/api/instagram-task");
  const console_ = walk("src/app/api/admin/instagram-task");
  assert.equal(staff.length, 5, staff.join(", "));
  assert.equal(console_.length, 6, console_.join(", "));
  for (const f of staff) {
    const src = read(f);
    assert.match(src, /const who = await readInstagramEmployee\(\);\s*if \(!who\.ok\) return who\.response;/, f);
    assert.doesNotMatch(src, /readInstagramAdmin|getCurrentUser/, f);
  }
  for (const f of console_) {
    const src = read(f);
    assert.match(src, /const who = await readInstagramAdmin\(\);\s*if \(!who\.ok\) return who\.response;/, f);
    assert.doesNotMatch(src, /readInstagramEmployee|readEmployeeAuth/, f);
  }
});

test("only trackers and admins see everyone or check: the staff board, history and check refuse anyone else", () => {
  for (const f of ["src/app/api/instagram-task/board/route.ts", "src/app/api/instagram-task/people/[id]/route.ts", "src/app/api/instagram-task/accounts/[id]/check/route.ts"]) {
    assert.match(read(f), /if \(!who\.actor\.tracker\) return NextResponse\.json\(\{ error: "Only HR and the admins [^"]+" \}, \{ status: 403 \}\);/, f);
  }
  // And the function itself, whoever calls it.
  assert.match(server, /if \(checker\.kind === "employee" && !checker\.tracker\) throw new InstagramTaskError\(403,/);
  // Their page too: anyone not a tracker is sent to their own.
  const team = read("src/app/employee/(workspace)/instagram/team/page.tsx");
  assert.match(team, /if \(!\(await isInstagramTracker\(auth\.employee\.id\)\)\) redirect\("\/employee\/instagram\/"\);/);
});

test("nobody checks their own accounts: HR takes part, and the prize is money", () => {
  assert.match(server, /if \(checker\.kind === "employee" && checker\.id === owner\) \{\s*throw new InstagramTaskError\(403,/);
  // The board offers no Check on a tracker's own accounts either.
  const board = read("src/components/instagram/InstagramBoard.tsx");
  assert.match(board, /const own = me !== null && x\.employeeId === me;/);
  assert.match(read("src/app/employee/(workspace)/instagram/team/page.tsx"), /api="\/api\/instagram-task" me=\{auth\.employee\.id\} admin=\{false\}/);
  // The console is no one's own: it checks everyone, HR included.
  assert.match(read("src/components/admin/InstagramTaskConsole.tsx"), /api="\/api\/admin\/instagram-task" me=\{null\} admin/);
});

test("a check is what the checker saw: its form starts empty, never the employee's own count", () => {
  const board = read("src/components/instagram/InstagramBoard.tsx");
  const form = board.slice(board.indexOf("function CheckForm("), board.indexOf("function eventWords("));
  assert.match(form, /const \[posts, setPosts\] = useState\(""\);/);
  assert.match(form, /const \[followers, setFollowers\] = useState\(""\);/);
  assert.doesNotMatch(form, /useState\(String\(a\.(posts|followers)\)\)/);
});

test("an employee's writes are their own accounts, while the task runs and until their prize", () => {
  // Someone else's account answers as a missing one.
  assert.match(server, /if \(!rows\[0\] \|\| rows\[0\]\.employeeId !== actor\.id\) throw new InstagramTaskError\(404,/);
  for (const fn of ["addInstagramAccount", "reportInstagramAccount", "renameInstagramAccount", "removeInstagramAccount"]) {
    const body = server.slice(server.indexOf(`export async function ${fn}(`));
    assert.match(body.slice(0, 400), /asOwner\(actor, async \(tx/, fn);
  }
  const owner = server.slice(server.indexOf("async function asOwner"), server.indexOf("async function ownAccount"));
  assert.match(owner, /await tx\.\$queryRaw\(personLock\(actor\.id\)\);/);
  assert.match(owner, /const closed = closedWords\(settings\);\s*if \(closed\) throw new InstagramTaskError\(409, closed\);/);
  assert.match(owner, /if \(await hasPrize\(tx, actor\.id\)\) throw new InstagramTaskError\(409,/);
  // The number of accounts is counted under the lock, so two presses can never add one more than the task's.
  assert.match(server, /if \(n >= settings\.accountsPerPerson\) \{/);
  // A new username loses its check.
  const rename = server.slice(server.indexOf("export async function renameInstagramAccount("), server.indexOf("export async function removeInstagramAccount("));
  assert.match(rename, /"checkState" = NULL, "checkedPosts" = NULL, "checkedFollowers" = NULL/);
});

test("only an admin gives the prize, only to someone the server finds complete, once", () => {
  assert.ok(fs.existsSync(new URL("../../src/app/api/admin/instagram-task/prize/route.ts", import.meta.url)));
  assert.ok(!fs.existsSync(new URL("../../src/app/api/instagram-task/prize", import.meta.url)), "no staff door to the prize");
  const prize = server.slice(server.indexOf("export async function giveInstagramPrize("));
  assert.match(prize, /await tx\.\$queryRaw\(personLock\(employeeId\)\);/);
  assert.match(prize, /if \(await hasPrize\(tx, employeeId\)\) throw new InstagramTaskError\(409,/);
  assert.match(prize, /const p = personProgress\(accounts, settings\);\s*if \(!p\.complete\) \{/);
  // A check never lands after the prize.
  const check = server.slice(server.indexOf("export async function checkInstagramAccount("), server.indexOf("// ---- the admin's ----"));
  assert.match(check, /await tx\.\$queryRaw\(personLock\(owner\)\);/);
  assert.match(check, /if \(await hasPrize\(tx, owner\)\) throw new InstagramTaskError\(409,/);
});

test("plain SQL with its values always bound, never pasted in", () => {
  assert.doesNotMatch(server, /\$queryRawUnsafe|\$executeRawUnsafe|Prisma\.raw\(/);
});

test("nobody else sees an employee's accounts: not Team tasks, not the referral pages", () => {
  for (const f of ["src/app/employee/(workspace)/tasks/page.tsx", "src/app/employee/(workspace)/referrals/page.tsx", "src/lib/server/trip-referrals.ts"]) {
    assert.doesNotMatch(read(f), /instagram/i, f);
  }
});

test("every account has the task: the tab, the rail row and the outline, outside any account's own pages", () => {
  assert.match(read("src/components/employee/WorkspaceTabs.tsx"), /\{ href: "\/employee\/instagram\/", label: "Instagram" \},/);
  const rail = read("src/components/employee/WorkspaceSidebar.tsx");
  const row = rail.slice(rail.indexOf('href="/employee/tasks/"'), rail.indexOf('href="/employee/profile/"'));
  assert.ok(row.includes('href="/employee/instagram/"') && !/pages ===/.test(row), "the rail's row is outside every account's condition");
  const skeleton = read("src/components/employee/WorkspaceSkeleton.tsx");
  assert.match(skeleton, /"\/employee\/instagram": "Instagram task",/);
  assert.match(skeleton, /"\/employee\/instagram\/team": "Instagram task",/);
  // And its own row in the console, under Team, apart from the Free China Trip's Employee tasks.
  assert.match(read("src/components/admin/rail-sections.ts"), /\{ key: "instagram-task", href: "\/admin\/instagram-task\/", label: "Instagram task", icon: Camera \},/);
});

test("its migration only adds: five tables, their indexes and their links to Employee", () => {
  const sql = read("prisma/migrations/20261123120000_instagram_task/migration.sql");
  // (ON DELETE / ON UPDATE inside a foreign key are not statements.)
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b|^\s*DELETE\b|^\s*UPDATE\b|^\s*INSERT\b|ALTER TABLE "(?!Instagram)/im);
  assert.equal((sql.match(/^CREATE TABLE "Instagram/gm) ?? []).length, 5);
  assert.equal((sql.match(/^CREATE (UNIQUE )?INDEX "Instagram/gm) ?? []).length, 4);
  assert.equal((sql.match(/^ALTER TABLE "Instagram\w+" ADD CONSTRAINT/gm) ?? []).length, 4);
});
