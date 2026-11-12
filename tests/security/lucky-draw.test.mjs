// The Free China Trip's lucky draw (2026-11-10): the TV screen's pass, who can do what, what the screen may show, and
// how a draw is made. The owner: "our CEO will click draw ... we will put the page on the TV ... it must not get stuck".
// The pass (src/lib/draw-screen-token.ts) lets the TV keep drawing whatever the console's thirty-minute session does;
// it must never pass for an admin session, nor a session for it, and it can read the board without anyone's mobile
// number and press Draw, nothing else. Those cookies are re-made here by hand, as session-token.ts makes them.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { DRAW_SCREEN_MS, readDrawScreen, signDrawScreen } from "../../src/lib/draw-screen-token.ts";
import { signTripApplicantToken } from "../../src/lib/trip-applicant-token.ts";
import { TRIP_PRIVACY } from "../../src/lib/trip-legal.ts";

const SECRET = "s".repeat(48);
const NOW = 1_800_000_000_000;
const CLAIMS = { adminId: "admin-1", tokenVersion: 3, mode: "live" };

/** A source file's code, its comments taken out. */
const read = (p) =>
  fs
    .readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const API = "src/app/api/admin/lucky-draw";

test("a screen pass reads back as the admin, account version and mode it was made for, until it ends", () => {
  const token = signDrawScreen(CLAIMS, SECRET, NOW);
  assert.deepEqual(readDrawScreen(token, SECRET, NOW), { ...CLAIMS, expiresAt: NOW + DRAW_SCREEN_MS });
  assert.ok(readDrawScreen(token, SECRET, NOW + DRAW_SCREEN_MS - 1));
  assert.equal(readDrawScreen(token, SECRET, NOW + DRAW_SCREEN_MS), null, "ended");
  assert.equal(DRAW_SCREEN_MS, 12 * 60 * 60 * 1000);
  const rehearsal = readDrawScreen(signDrawScreen({ ...CLAIMS, mode: "rehearsal" }, SECRET, NOW), SECRET, NOW);
  assert.equal(rehearsal?.mode, "rehearsal");
});

test("a pass altered, signed with another secret, or read without one, is no pass", () => {
  const token = signDrawScreen(CLAIMS, SECRET, NOW);
  const [payload, sig] = token.split(".");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  for (const change of [{ mode: "rehearsal" }, { sub: "admin-2" }, { v: 4 }, { exp: data.exp + 1 }]) {
    const forged = Buffer.from(JSON.stringify({ ...data, ...change })).toString("base64url");
    assert.equal(readDrawScreen(`${forged}.${sig}`, SECRET, NOW), null, JSON.stringify(change));
  }
  assert.equal(readDrawScreen(token, "t".repeat(48), NOW), null);
  assert.equal(readDrawScreen(token, null, NOW), null);
  for (const junk of ["", ".", "a.b", `${payload}.`, `${payload}.${sig}.x`, null, undefined]) assert.equal(readDrawScreen(junk, SECRET, NOW), null);
});

test("a pass claiming to last longer than any signed, or of another kind or mode, is refused even when signed right", () => {
  const key = crypto.createHmac("sha256", SECRET).update("affhan lucky draw screen v1").digest();
  const make = (d) => {
    const p = Buffer.from(JSON.stringify(d)).toString("base64url");
    return `${p}.${crypto.createHmac("sha256", key).update(p).digest("base64url")}`;
  };
  const good = { kind: "draw-screen", sub: "admin-1", v: 3, mode: "live", exp: NOW + 1000 };
  assert.ok(readDrawScreen(make(good), SECRET, NOW), "made the way signDrawScreen makes it");
  assert.equal(readDrawScreen(make({ ...good, exp: NOW + DRAW_SCREEN_MS + 1 }), SECRET, NOW), null, "too long");
  assert.equal(readDrawScreen(make({ ...good, kind: "trip-applicant" }), SECRET, NOW), null);
  assert.equal(readDrawScreen(make({ ...good, mode: "test" }), SECRET, NOW), null);
  assert.equal(readDrawScreen(make({ ...good, v: "3" }), SECRET, NOW), null);
  assert.equal(readDrawScreen(make({ ...good, sub: "" }), SECRET, NOW), null);
});

test("a pass is never an admin session, nor a session or another cookie a pass", () => {
  const token = signDrawScreen(CLAIMS, SECRET, NOW);
  const [payload, sig] = token.split(".");
  // readSession's check: HMAC-SHA256 of the payload with AUTH_SECRET itself.
  assert.notEqual(sig, crypto.createHmac("sha256", SECRET).update(payload).digest("base64url"));
  const session = Buffer.from(JSON.stringify({ id: "admin-1", email: "x@affhan.com", name: null, role: "admin", tokenVersion: 3, iat: NOW })).toString("base64url");
  const sessionToken = `${session}.${crypto.createHmac("sha256", SECRET).update(session).digest("base64url")}`;
  assert.equal(readDrawScreen(sessionToken, SECRET, NOW), null);
  assert.equal(readDrawScreen(signTripApplicantToken("app-1", SECRET, NOW), SECRET, NOW), null);
});

test("the pass is a cookie of its own per mode: httpOnly, same-site only, sent only to the lucky draw's routes", () => {
  const src = read("src/lib/server/draw-screen.ts");
  assert.match(src, /const COOKIE_PATH = "\/api\/admin\/lucky-draw";/);
  assert.match(src, /httpOnly: true,/);
  assert.match(src, /sameSite: "strict" as const,/);
  assert.match(src, /export const drawScreenCookie = \(mode: DrawScreenMode\) => `affhan_draw_\$\{mode\}`;/);
  // Checked against the admin's account as it is now: a password change or "sign out everywhere" ends it.
  assert.match(src, /if \(!row \|\| row\.tokenVersion !== claims\.tokenVersion\) return null;/);
  assert.match(src, /if \(!claims \|\| claims\.mode !== mode\) return null;/);
});

test("the TV holds its pass from the moment it opens, renewed while the console's session lasts", () => {
  // Once the console's session has ended no pass can be had: asked for only after a refusal, it would come too late.
  const screen = read("src/components/lucky-draw/DrawScreen.tsx");
  assert.match(screen, /await openPass\(\);\s*const board = await fetchBoard\(\);/);
  assert.match(screen, /const PASS_EVERY_MS = 30 \* 60_000;/);
  assert.match(screen, /if \(Date\.now\(\) - passAt\.current > PASS_EVERY_MS\) \{\s*passAt\.current = Date\.now\(\);\s*await openPass\(\);/);
});

test("only an admin's own session releases, restores, clears the rehearsal or opens a screen; the pass only reads and draws", () => {
  for (const route of ["release", "rehearsal", "screen"]) {
    const src = read(`${API}/${route}/route.ts`);
    assert.match(src, /const admin = await consoleAdmin\(\);\s*if \(!admin\) return/, route);
    assert.doesNotMatch(src, /drawActor/, `${route} never takes the screen's pass`);
  }
  for (const route of ["board", "draw", "pool"]) {
    const src = read(`${API}/${route}/route.ts`);
    assert.match(src, /const actor = await drawActor\(mode\);\s*if \(!actor\) return NextResponse\.json\([^)]*\{ status: 401 \}\);/, route);
  }
});

test("the TV screen never holds a mobile number: the pass and the screen's own requests get the public board", () => {
  const board = read(`${API}/board/route.ts`);
  assert.match(board, /const forScreen = actor\.kind === "screen" \|\| req\.nextUrl\.searchParams\.get\("view"\) === "screen";/);
  assert.match(board, /forScreen \? await drawBoard\(mode, false\) : await drawBoard\(mode, true\)/);
  const draw = read(`${API}/draw/route.ts`);
  assert.match(draw, /const forScreen = actor\.kind === "screen" \|\| body\.view === "screen";/);
  // The public card is made field by field, and the phone is not one of them.
  const server = read("src/lib/server/lucky-draw.ts");
  const publicCards = /cards: cards\.map\(\s*\(\{([^}]*)\}\): DrawCardPublic/.exec(server);
  assert.ok(publicCards, "the public cards are picked field by field");
  assert.doesNotMatch(publicCards[1], /phone|drawnBy|poolHash|release|applicationId|status/);
  const shared = read("src/lib/lucky-draw-shared.ts");
  const publicType = /export interface DrawCardPublic \{([\s\S]*?)\}/.exec(shared);
  assert.doesNotMatch(publicType[1], /phone/);
  // The list everyone scrolls past in: Trip ID, name, city and country, and nothing else.
  const entries = /const entries = tripIds\.map\(\(tripId, k\): DrawPoolEntry => \[(.*)\]\);/.exec(server);
  assert.ok(entries, "the list is made a person at a time, from the pool's arrays");
  assert.deepEqual(entries[1].split(/, (?![^(]*\))/).map((x) => x.trim()), ["tripId", 'personName(names[k] ?? "")', 'personName(cities[k] ?? "")', 'countries[k] ?? ""']);
  // The arrays are the pool's Trip IDs, names, cities and countries, and nothing else.
  const arrays = /const poolArrays = \(mode: DrawMode, drawn = true\) => Prisma\.sql`\s*SELECT (.*)\s*FROM \(\$\{pool\(mode, drawn\)\}\) p`;/.exec(server);
  assert.ok(arrays, "the list's arrays are the pool's own query");
  assert.deepEqual([...arrays[1].matchAll(/array_agg\(p\."(\w+)"\)/g)].map((m) => m[1]), ["referenceNo", "fullName", "city", "country"]);
  assert.match(shared, /export type DrawPoolEntry = \[tripId: string, name: string, city: string, country: string\];/);
  // The screen asks for the public view itself, so even an admin's laptop shows no number on the TV.
  const screen = read("src/components/lucky-draw/DrawScreen.tsx");
  assert.match(screen, /`\$\{API\}\/board\/\?mode=\$\{mode\}&view=screen`/);
  assert.match(screen, /`\$\{API\}\/pool\/\?mode=\$\{mode\}`/);
  assert.match(screen, /body: JSON\.stringify\(\{ mode, requestId: id, view: "screen" \}\)/);
  assert.doesNotMatch(screen, /phone/i);
});

test("who is in the draw: a valid passport, not spam or deleted, once per mobile number, not already drawn in this mode", () => {
  const server = read("src/lib/server/lucky-draw.ts");
  const pool = /const pool = \(mode: DrawMode, drawn = true\) => Prisma\.sql`([\s\S]*?)`;/.exec(server);
  assert.ok(pool, "the pool is one query");
  const q = pool[1];
  assert.match(q, /SELECT DISTINCT ON \(COALESCE\(a\."customerKey", a\."id"\)\)/);
  assert.match(q, /a\."status" NOT IN \('spam', 'deleted'\)/);
  assert.match(q, /a\."hasPassport" = true\$\{drawn \? notDrawn\(mode\) : Prisma\.empty\}/);
  const notDrawn = /const notDrawn = \(mode: DrawMode\) => Prisma\.sql`([\s\S]*?)`;/.exec(server);
  assert.ok(notDrawn);
  assert.match(notDrawn[1], /NOT EXISTS \([\s\S]*d\."mode" = \$\{mode\}[\s\S]*b\."customerKey" = a\."customerKey"/);
  // Earlier draws are left out of it only where the draw's table is missing, so nobody can have been drawn: the
  // count and the list there, and nowhere else.
  assert.equal(server.match(/\(mode, false\)/g).length, 2);
  assert.match(server, /SELECT count\(\*\)::int AS n FROM \(\$\{pool\(mode, false\)\}\) p/);
  assert.match(server, /if \(!isMissingTable\(e\)\) throw e;\s*ready = false;\s*\[cols\] = await prisma\.\$queryRaw<PoolArrays\[\]>\(poolArrays\(mode, false\)\);/);
  // The draw's own read of it never leaves anyone drawn in.
  assert.match(server, /const poolTripIds = \(mode: DrawMode\) => Prisma\.sql`SELECT array_agg\(p\."referenceNo"\) FROM \(\$\{pool\(mode\)\}\) p`;/);
});

test("a draw: one at a time under the draw's lock, once per press, chosen by the system's cryptographic random numbers", () => {
  const server = read("src/lib/server/lucky-draw.ts");
  const draw = /export async function drawOne[\s\S]*?\n\}/.exec(server)[0];
  const lock = draw.indexOf("pg_advisory_xact_lock(hashtext('affhan-trip-lucky-draw'))");
  const again = draw.indexOf(`WHERE "requestId" = \${requestId}`);
  const choose = draw.indexOf("crypto.randomInt(everyone.length)");
  assert.ok(lock > 0 && again > lock && choose > again, "the lock, then the same press answered, then a choice");
  assert.doesNotMatch(draw, /Math\.random/);
  // This press's draw and everyone in the draw, read together after the lock: a press already answered draws nobody.
  assert.match(draw, /SELECT \(SELECT "id" FROM "TripDraw" WHERE "requestId" = \$\{requestId\} LIMIT 1\) AS "done", \(\$\{poolTripIds\(mode\)\}\) AS "tripIds"`;\s*if \(done\) return \{ ok: true, id: done, again: true \};/, "never anyone already drawn");
  assert.match(draw, /const everyone = \(tripIds \?\? \[\]\)\.sort\(compareTripIds\);/, "in the list's own order");
  assert.match(draw, /createHash\("sha256"\)\.update\(everyone\.join\("\\n"\)\)/);
  assert.match(draw, /clock_timestamp\(\) AT TIME ZONE 'UTC'/, "dated after the lock, in the order drawn");
  // The application drawn is the one with the Trip ID chosen (Trip IDs are unique), exactly one, or nothing is written.
  assert.match(draw, /FROM "TripApplication" a WHERE a\."referenceNo" = \$\{chosen\}`;\s*if \(made !== 1\) throw /);
  assert.match(read(`${API}/draw/route.ts`), /const PRESS = \/\^\[0-9a-f\]\{8\}-/);
});

test("the TV page stands outside the console's layout, so its session countdown never covers the screen", () => {
  assert.ok(fs.existsSync(new URL("../../src/app/admin/draw-screen/page.tsx", import.meta.url)));
  assert.ok(!fs.existsSync(new URL("../../src/app/admin/(console)/draw-screen", import.meta.url)));
  const page = read("src/app/admin/draw-screen/page.tsx");
  assert.match(page, /robots: \{ index: false, follow: false \}/);
});

test("the draw's table is an addition only, and a draw can never lose the application it names", () => {
  const sql = fs.readFileSync(new URL("../../prisma/migrations/20261110120000_trip_lucky_draw/migration.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im, "no statement that removes or changes rows");
  assert.doesNotMatch(sql, /\b(DROP COLUMN|ALTER COLUMN|RENAME)\b/i);
  // Its one ALTER only adds the new table's own key.
  assert.deepEqual([...sql.matchAll(/ALTER TABLE "(\w+)" (\w+)/g)].map((m) => `${m[1]} ${m[2]}`), ["TripDraw ADD"]);
  assert.match(sql, /CREATE TABLE "TripDraw"/);
  assert.match(sql, /CREATE UNIQUE INDEX "TripDraw_requestId_key"/);
  assert.match(sql, /CREATE UNIQUE INDEX "TripDraw_mode_number_key"/);
  assert.match(sql, /REFERENCES "TripApplication"\("id"\) ON DELETE RESTRICT/);
  assert.match(fs.readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8"), /application\s+TripApplication @relation\(fields: \[applicationId\], references: \[id\], onDelete: Restrict\)/);
});

test("no live draw while applications are open: a localhost (always open) on the live database can only rehearse", () => {
  const route = read(`${API}/draw/route.ts`);
  const refuse = route.indexOf(`if (mode === "live" && applicationWindow() !== "closed") {`);
  assert.ok(refuse > 0 && refuse < route.indexOf("await drawOne("), "refused before anyone is drawn");
  assert.match(route, /reason: "applications_open" \},\s*\{ status: 409 \}/);
  assert.match(read("src/lib/trip-application.ts"), /if \(process\.env\.NODE_ENV !== "production"\) return "open";/);
  const screen = read("src/components/lucky-draw/DrawScreen.tsx");
  assert.match(screen, /const early = mode === "live" && !!board\?\.applicationsOpen;/);
  assert.match(screen, /disabled=\{drawing \|\| access !== "ok" \|\| notReady \|\| empty \|\| early\}/);
});

test("the trip's Privacy Policy says what the draw's screen shows, and what it never does", () => {
  const text = JSON.stringify(TRIP_PRIVACY.sections.find((x) => x.n === 12));
  assert.match(text, /each applicant's Trip ID, name, city and country/);
  assert.match(text, /Mobile numbers, identity documents and passport answers are never shown on it/);
  assert.equal(TRIP_PRIVACY.updated, "10 November 2026");
  assert.match(fs.readFileSync(new URL("../../src/app/sitemap.ts", import.meta.url), "utf8"), /chinaTripLegal: '2026-11-10'/);
});

test("the console has its row, under Free China Trip", () => {
  const rail = read("src/components/admin/rail-sections.ts");
  assert.match(rail, /\{ key: "lucky-draw", href: "\/admin\/lucky-draw\/", label: "Lucky draw", icon: Ticket \}/);
});
