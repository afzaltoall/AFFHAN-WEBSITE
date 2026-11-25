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
import { TRIP_PRIVACY, TRIP_TERMS } from "../../src/lib/trip-legal.ts";

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
  const screen = read("src/components/lucky-draw/wall/DrawWall.tsx");
  assert.match(screen, /await openPass\(\);[\s\S]{0,240}?const board = await fetchBoard\(\);/);
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
  const screen = read("src/components/lucky-draw/wall/DrawWall.tsx");
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
  // The Trip IDs a draw chooses from are the pool's, all of it or (seats 1 to 3, 2026-11-23) its first 1,540 only.
  assert.match(server, /const poolTripIds = \(mode: DrawMode, first = false\) =>\s*first\s*\? Prisma\.sql`SELECT array_agg\(p\."referenceNo"\) FROM \(\$\{pool\(mode\)\}\) p WHERE p\."referenceNo" BETWEEN \$\{FIRST_GROUP_FROM\} AND \$\{FIRST_GROUP_TO\}`\s*: Prisma\.sql`SELECT array_agg\(p\."referenceNo"\) FROM \(\$\{pool\(mode\)\}\) p`;/);
});

test("a draw: one at a time under the draw's lock, once per press, chosen by the system's cryptographic random numbers", () => {
  const server = read("src/lib/server/lucky-draw.ts");
  const draw = /export async function drawOne[\s\S]*?\n\}/.exec(server)[0];
  assert.match(server, /const DRAW_LOCK = Prisma\.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock\(hashtext\('affhan-trip-lucky-draw'\)\)`;/);
  const lock = draw.indexOf("await tx.$queryRaw(DRAW_LOCK);");
  const again = draw.indexOf(`WHERE "requestId" = \${requestId}`);
  const choose = draw.indexOf("crypto.randomInt(everyone.length)");
  assert.ok(lock > 0 && again > lock && choose > again, "the lock, then the same press answered, then a choice");
  assert.doesNotMatch(draw, /Math\.random/);
  // This press's draw read after the lock: a press already answered draws nobody.
  assert.match(draw, /SELECT \(SELECT "id" FROM "TripDraw" WHERE "requestId" = \$\{requestId\} LIMIT 1\) AS "done"`;\s*if \(done\) return \{ ok: true, id: done, again: true \};/, "never anyone already drawn");
  assert.match(draw, /const everyone = \(tripIds \?\? \[\]\)\.sort\(compareTripIds\);/, "in the list's own order");
  assert.match(draw, /createHash\("sha256"\)\.update\(everyone\.join\("\\n"\)\)/);
  assert.match(draw, /clock_timestamp\(\) AT TIME ZONE 'UTC'/, "dated after the lock, in the order drawn");
  // The application drawn is the one with the Trip ID chosen (Trip IDs are unique), exactly one, or nothing is written.
  assert.match(draw, /FROM "TripApplication" a WHERE a\."referenceNo" = \$\{chosen\}`;\s*if \(inserted !== 1\) throw /);
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
  const screen = read("src/components/lucky-draw/wall/DrawWall.tsx");
  assert.match(screen, /const early = mode === "live" && !!board\?\.applicationsOpen;/);
  assert.match(screen, /disabled=\{drawing \|\| access !== "ok" \|\| !ready \|\| notReady \|\| empty \|\| early\}/);
});

test("the trip's Privacy Policy says what the draw's screen shows, and what it never does", () => {
  const text = JSON.stringify(TRIP_PRIVACY.sections.find((x) => x.n === 12));
  assert.match(text, /The winners, and then a waiting list of reserve applicants, are drawn live/);
  assert.match(text, /each applicant's name, city and country/);
  assert.match(text, /Trip IDs, mobile numbers, identity documents and passport answers are never shown on it/);
  assert.equal(TRIP_PRIVACY.updated, "25 November 2026");
  // The trip's legal pages' date in the sitemap: moved on 2026-11-25, when section 12 changed (no Trip ID on the screen).
  assert.match(fs.readFileSync(new URL("../../src/app/sitemap.ts", import.meta.url), "utf8"), /chinaTripLegal: '2026-11-25'/);
});

// 2026-11-25, the owner, over a filled seat on the TV ("Karthikeyan M / Trichy, India / TRIP-26-00774"): "trip id kaata
// vendam and trip id display pana vendam". The screen has Trip IDs only to order the wall and find a person on it:
// nothing on it draws or writes one (the seats, the tickets' stubs, the reveal's details, the pack, the pass, the tag,
// the board, the words read out).
test("the TV never shows a Trip ID", () => {
  const wall = read("src/components/lucky-draw/wall/DrawWall.tsx");
  // Found by a pattern, never by its line breaks: a checkout can have the file in CRLF.
  const at = wall.search(/return \(\s*<div\s+ref=\{rootRef\}/);
  const jsx = wall.slice(at);
  assert.ok(at > 0 && jsx.length > 1000, "the screen's markup found");
  assert.doesNotMatch(jsx, /tripId|lw-seat-id/, "no Trip ID in the screen's markup");
  assert.doesNotMatch(wall, /Trip ID \$\{/, "nor in the words read out for a screen reader");
  const faces = read("src/components/lucky-draw/wall/faces.ts");
  const face = faces.slice(faces.indexOf("export function drawFace("), faces.indexOf("export function drawBack("));
  assert.doesNotMatch(face, /e\[0\]/, "a ticket's face never draws its entry's Trip ID");
  assert.match(face, /bodoniText\(ctx, "A", mid - /, "its stub: the AFFHAN A, where the Trip ID was");
  assert.doesNotMatch(faces, /tripId|TRIP-26/, "the pass, the tag, the envelope, the pack: no Trip ID");
  const stage = read("src/components/lucky-draw/wall/stage.ts");
  assert.doesNotMatch(stage, /drawPlate\([^;]*tripId/, "no detail of the reveal is a Trip ID");
  assert.doesNotMatch(stage, /drawTag\([^;]*tripId/);
  assert.match(stage, /drawPlate\(ctx, waiting \? "Waiting list" : "The draw", card\.seat \? seatName\(card\.round, card\.seat\)\.toUpperCase\(\) : "", "", this\.opts\.fonts\)/);
  assert.doesNotMatch(read("src/components/lucky-draw/wall/board.ts"), /tripId/);
  assert.doesNotMatch(read("src/app/globals.css") + fs.readFileSync(new URL("../../src/components/lucky-draw/wall/wall.css", import.meta.url), "utf8"), /lw-seat-id/);
});

// The same day: the first five are the draw, the rest a waiting list. Someone on the waiting list is never called a
// winner on the screen (the pack, the climax, the pass), and the words on the TV and the console are the shared ones.
test("the draw and its waiting list: nobody on the waiting list is called a winner", () => {
  const stage = read("src/components/lucky-draw/wall/stage.ts");
  assert.match(stage, /this\.grandPack\.ink\(waiting \? this\.packInks\.waiting : this\.packInks\.winner\);/);
  assert.match(stage, /drawPlate\(ctx, inWaitingList\(card\.round\) \? "Waiting list" : "Winner", card\.name\.toUpperCase\(\), "", this\.opts\.fonts\)/);
  const faces = read("src/components/lucky-draw/wall/faces.ts");
  assert.match(faces, /passLabel\(ctx, fonts, `\$\{waiting \? "Waiting list" : "Winner"\} · Lucky Draw \$\{year\}`, right, 146, "right"\);/);
  assert.match(faces, /medallion\(ctx, fonts, sx, 830, 94, year, !waiting\);/);
  const wall = read("src/components/lucky-draw/wall/DrawWall.tsx");
  assert.match(wall, /\{drawing \? "Drawing…" : nextRound \? nextRoundWords\(round\) : "Draw"\}/);
  assert.match(wall, /<p className="lw-round">\{roundName\(round\)\}<\/p>/);
  assert.doesNotMatch(wall, /`Round |Start round/);
  const consoleBoard = read("src/components/admin/LuckyDrawBoard.tsx");
  assert.match(consoleBoard, /\{nextRoundWords\(board\.round\)\}/);
  assert.doesNotMatch(consoleBoard, /Round \{|`Round |Start round/);
});

test("the console has its row, under Free China Trip", () => {
  const rail = read("src/components/admin/rail-sections.ts");
  assert.match(rail, /\{ key: "lucky-draw", href: "\/admin\/lucky-draw\/", label: "Lucky draw", icon: Ticket \}/);
});

// 2026-11-22, the owner, over a picture of the TV with "8,115 applicants in the draw" boxed: "dont show the number of
// users in draw". Neither screen says how many are in the draw: not at rest, and not beside a draw just made.
// 2026-11-23, the owner: seats 1 to 3 of every round from the first 1,540 applications, seats 4 and 5 from everyone,
// stated in the Terms' clause 3 ("ok do"). The server works out the seat a press fills before choosing anyone, under
// the draw's lock, which releases and restores now take too; the Terms say exactly what is done; and the TV's light
// moves only over that group's names for those seats.
test("seats 1–3 from the first 1,540 applications, seats 4–5 from everyone, exactly as the Terms say", () => {
  const server = read("src/lib/server/lucky-draw.ts");
  const draw = server.slice(server.indexOf("export async function drawOne("), server.indexOf("const DRAW_LOCK") > server.indexOf("export async function drawOne(") ? server.indexOf("const DRAW_LOCK") : server.indexOf("export async function releaseDraw("));
  const lock = draw.indexOf("await tx.$queryRaw(DRAW_LOCK);");
  const seat = draw.indexOf("const { seat } = seatOfNextDraw(");
  const pool = draw.indexOf("${poolTripIds(mode, first)}");
  assert.ok(lock > 0 && seat > lock && pool > seat, "the lock, then the seat, then the pool of that seat's group");
  assert.match(draw, /const first = seatFromFirstGroup\(seat\);/);
  assert.match(draw, /const poolHash = crypto\.createHash\("sha256"\)\.update\(everyone\.join\("\\n"\)\)\.digest\("hex"\);/, "the fingerprint is of the group drawn from");
  assert.match(server, /p WHERE p\."referenceNo" BETWEEN \$\{FIRST_GROUP_FROM\} AND \$\{FIRST_GROUP_TO\}`/);
  for (const name of ["releaseDraw", "restoreDraw"]) {
    const fn = server.slice(server.indexOf(`export async function ${name}(`));
    assert.match(fn.slice(0, 600), /await tx\.\$queryRaw\(DRAW_LOCK\);/, `${name} waits for a draw being made`);
  }
  const shared = read("src/lib/lucky-draw-shared.ts");
  assert.match(shared, /export const FIRST_GROUP_SEATS = 3;/);
  assert.match(shared, /export const FIRST_GROUP_FROM = "TRIP-26-00001";/);
  assert.match(shared, /export const FIRST_GROUP_TO = "TRIP-26-01540";/);
  // What the Terms say is what is done: three from the first 1,540, two from everyone, equal within each.
  const terms = JSON.stringify(TRIP_TERMS.sections.find((x) => x.n === 3));
  assert.match(terms, /Three of the five places are drawn from the eligible applicants among the first 1,540 applications received \(12 to 29 October 2026\)\. The other two places are drawn from all eligible applicants\./);
  assert.match(terms, /Within each of these draws, every eligible applicant has an equal chance of being selected\./);
  assert.doesNotMatch(terms, /Every eligible applicant has an equal opportunity to be selected/);
  assert.equal(TRIP_TERMS.updated, "23 November 2026");
  // The TV: for seats 1 to 3 the light moves over the group's names only, swapped in while every ticket is face down.
  const wall = read("src/components/lucky-draw/wall/DrawWall.tsx");
  assert.match(wall, /if \(seatFromFirstGroup\(c\.seat\) && pool\) stage\.drawFrom\(wallOf\(pool, board\.cards\)\.entries\.filter\(\(e\) => inFirstGroup\(e\[0\]\)\)\);/);
  const stage = read("src/components/lucky-draw/wall/stage.ts");
  assert.match(stage, /private placeNames\(r: Run, i: number\) \{\s*if \(r\.group\) \{/);
  assert.match(read(`${API}/draw/route.ts`), /if \(drawn\.reason === "empty_first"\)/);
});

test("the TV never says how many are in the draw", () => {
  const screen = read("src/components/lucky-draw/wall/DrawWall.tsx");
  assert.doesNotMatch(screen, /applicants|poolSize\)|count\.format|setListed|listed \?\?|inDraw|inList/);
  assert.match(screen, /\? \{ text: `Drawn at random · \$\{AT\.format\(new Date\(card\.drawnAt\)\)\}` \}/);
  assert.match(screen, /: \{ text: "" \}\);/, "the wall at rest: no line");
});

// 2026-11-23, the owner, over the first screen (the list) showing on the TV: "this old ui is showing sometimes remove
// this from this project". The page fell back to it whenever the wall's first seconds were slow (a TV tab opened behind
// the console), the browser asked for reduced motion, or WebGL ran in software. Now the wall is the only screen: it
// never gives way for being slow, starts again when its WebGL is lost, and without WebGL at all says what to turn on.
test("the TV is the wall only: the list is gone, and nothing chooses another screen", () => {
  for (const gone of ["src/components/lucky-draw/DrawScreen.tsx", "src/components/lucky-draw/draw-screen.css", "src/components/lucky-draw/reel.ts"]) {
    assert.ok(!fs.existsSync(new URL(`../../${gone}`, import.meta.url)), `${gone} is gone`);
  }
  const show = read("src/components/lucky-draw/DrawShow.tsx");
  assert.doesNotMatch(show, /DrawScreen|engine|wallFits|prefers-reduced-motion|failIfMajorPerformanceCaveat|swiftshader/i);
  assert.match(show, /<DrawWall\s+key=\{run\}/, "a lost WebGL starts the wall again");
  assert.match(show, /if \(why === "webgl"\) \{\s*setNoWebgl\(true\);/, "no WebGL at all: what to turn on");
  assert.match(show, /if \(recent\.length > RESTARTS\) setNoWebgl\(true\);\s*else setRun\(\(n\) => n \+ 1\);/);
  const wall = read("src/components/lucky-draw/wall/DrawWall.tsx");
  assert.doesNotMatch(wall, /onSlow|"slow"/, "a slow start never gives the wall up");
  assert.match(wall, /onFail\?: \(why: "webgl" \| "lost"\) => void/);
  assert.doesNotMatch(read("src/components/lucky-draw/wall/stage.ts"), /onSlow|health\(/);
  assert.match(read("src/app/admin/draw-screen/page.tsx"), /<DrawShow mode=/);
});

// 2026-11-22, the owner: "click the selected candidate ... a right-side tab ... their full details ... documents if they
// have them". The console's Lucky draw opens Participants' own panel, read again from the admin-only route, the ID
// proof behind the admin's password lock as there; without New, Handled, Spam or Delete, which would take a winner's
// seat without a word (the page's "Can't take part" does that, and says so).
test("the console's Lucky draw: a name opens Participants' own panel, read again, without its status buttons", () => {
  const board = read("src/components/admin/LuckyDrawBoard.tsx");
  assert.match(board, /import \{ Detail as ApplicationPanel, DetailWaiting as ApplicationWaiting, type Application \} from "@\/components\/admin\/TripApplicationsBoard";/);
  assert.match(board, /fetch\(`\/api\/admin\/trip-applications\/\$\{openedId\}\/`, \{ cache: "no-store" \}\)/);
  assert.match(board, /<ApplicationPanel a=\{application\} lead=\{drawRows\(opened\.card, opened\.mode\)\} onClose=\{\(\) => setOpened\(null\)\} \/>/);
  assert.doesNotMatch(board, /<ApplicationPanel[^>]*onStatus/, "no status buttons from the draw's page");
  assert.equal((board.match(/<Person c=\{c\} onOpen=\{openPerson\} \/>/g) ?? []).length, 3, "every name: this round's seats, the rounds before, those who can't take part");
  const panel = read("src/components/admin/TripApplicationsBoard.tsx");
  assert.match(panel, /\{onStatus && \(\s*<div className="flex flex-wrap items-center gap-1\.5 text-\[12\.5px\]">/);
  assert.match(panel, /\.\.\.\(onStatus \? \[\] : \[\["Status", STATUS_WORD\[a\.status as Status\] \?\? a\.status\] as \[string, React\.ReactNode\]\]\),/);
  assert.match(panel, /if \(a\.documents\?\.length\) answers\.push\(\["ID proof", <TripDocuments key="docs" documents=\{a\.documents\} \/>\]\);/);
  assert.match(panel, /<Detail a=\{openFull\} busy=\{busy\} onClose=\{\(\) => setOpenId\(null\)\} onStatus=\{\(s\) => void setStatus\(openFull\.id, s\)\} \/>/, "Participants keeps its buttons");
  const route = read("src/app/api/admin/trip-applications/[id]/route.ts");
  assert.match(route, /if \(!admin \|\| admin\.role !== "admin"\) return new NextResponse\("Unauthorized", \{ status: 401 \}\);/);
  assert.match(route, /documents: row\.documents\.map\(\(d\) => \(\{ id: d\.id, contentType: d\.contentType, size: d\.size, proof: idProofOfKey\(d\.key\) \}\)\)/, "never a file's key");
});
