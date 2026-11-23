// Employee tasks → Duplicates (2026-11-23, the owner: "we are going to give real money to employees so we have to be
// more careful"): the list of applications that may be one person twice carries applicants' names, numbers and ID
// proofs, so it is the console's alone; it compares ID files by S3's checksum without ever reading a file; it decides
// through the referral decisions that already exist; and Mark paid waits for it.
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
/** One exported function's text, to its closing brace, whatever the checkout's line endings. */
const fnOf = (src, name) => {
  const at = src.search(new RegExp(`export (async )?function ${name}\\b`));
  assert.ok(at >= 0, name);
  const end = /\r?\n\}\r?\n/.exec(src.slice(at));
  assert.ok(end, `${name} ends`);
  return src.slice(at, at + end.index + end[0].length);
};
const ROUTE = "src/app/api/admin/trip-referrals/duplicates/route.ts";
const SERVER = "src/lib/server/trip-duplicates.ts";
const DOCS = "src/lib/server/trip-documents.ts";
const BOARD = "src/components/admin/TripReferralsBoard.tsx";
const VIEW = "src/components/admin/ReferralDuplicates.tsx";

test("the list is an admin's only, never cached, and only read: no other method", () => {
  const src = read(ROUTE);
  assert.match(src, /if \(!admin \|\| admin\.role !== "admin"\) return new NextResponse\("Unauthorized", \{ status: 401 \}\)/);
  assert.match(src, /"Cache-Control": "no-store"/);
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.deepEqual([...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]), ["GET"]);
});

test("ID files are compared by S3's checksum, asked with HEAD only, of files alike in type and size on two applications", () => {
  const fn = fnOf(read(DOCS), "documentChecksums");
  assert.match(fn, /new HeadObjectCommand\(/);
  assert.doesNotMatch(fn, /GetObjectCommand|getSignedUrl|Body/, "no file is read or handed out");
  assert.match(fn, /new Set\(list\.map\(\(d\) => d\.applicationId\)\)\.size > 1/, "only files alike on more than one application");
  assert.match(fn, /AbortSignal\.timeout\(5000\)/);
  assert.match(fn, /unchecked\+\+/, "a file S3 does not answer for is counted, not guessed");
});

test("spam and deleted applications are left out, and no file's key leaves the server", () => {
  const src = read(SERVER);
  assert.equal((src.match(/status: \{ notIn: \["spam", "deleted"\] \}/g) ?? []).length, 2, "applications and their files");
  const pushed = /list\.push\(\{([^}]*)\}\)/.exec(src);
  assert.ok(pushed, "each file as the console gets it");
  assert.deepEqual(
    [...pushed[1].matchAll(/(\w+):/g)].map((m) => m[1]),
    ["id", "contentType", "size", "proof"],
    "id, type, size and the ID it was added as; never the key",
  );
  assert.match(pushed[1], /proof: idProofOfKey\(d\.key\)/);
});

test("a decision from the list is the referral decision that already exists, and nothing else writes", () => {
  const board = read(BOARD);
  assert.match(board, /const decideDuplicates = async[\s\S]*?send\("\/api\/admin\/trip-referrals\/decide\/", \{ ids, state \}\)/);
  const view = read(VIEW);
  assert.doesNotMatch(view, /fetch\(|method: "(POST|PATCH|PUT|DELETE)"/, "the list asks nothing of the server itself");
  assert.ok(!fs.existsSync(new URL("../../src/app/api/admin/trip-referrals/duplicates/decide", import.meta.url)), "no second way to decide");
});

test("Mark paid waits for the check, and with something to check it is the admin's own choice, said so", () => {
  const board = read(BOARD);
  const win = board.slice(board.indexOf("function PayWindow("));
  assert.match(win, /disabled=\{busy \|\| check\.state === "checking"\}/);
  assert.match(win, /const doubtful = check\.state === "failed" \|\| \(check\.state === "ok" && check\.toCheck > 0\)/);
  assert.match(win, /doubtful \? "Pay anyway" : "Mark paid"/);
  assert.match(board, /check=\{dupes \? \{ state: "ok", toCheck: toCheckOf\(paying\.employeeId\) \} : dupesFailed \? \{ state: "failed" \} : \{ state: "checking" \}\}/);
});

test("the export says when the check could not be read, rather than a blank that reads as no duplicate", () => {
  const board = read(BOARD);
  assert.match(board, /notes \? \(notes\.get\(a\.referenceNo\) \?\? ""\) : "Not checked"/);
  assert.match(board, /dup \? \(dup\.byEmployee\[r\.employeeId\] \?\? 0\) : "Not checked"/);
});

const DELETE_ROUTE = "src/app/api/admin/trip-referrals/duplicates/delete/route.ts";
const PROOFS_ROUTE = "src/app/api/admin/trip-referrals/id-proofs/route.ts";
const PROOFS = "src/lib/server/trip-id-proofs.ts";

test("deleting duplicates (2026-11-23): an admin's only, POST only, and the server decides what is a later application", () => {
  const src = read(DELETE_ROUTE);
  assert.match(src, /if \(!admin \|\| admin\.role !== "admin"\) return new NextResponse\("Unauthorized", \{ status: 401 \}\)/);
  assert.deepEqual([...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]), ["POST"]);
  assert.match(src, /body\.ids\.length <= 1000/);
  const fn = fnOf(read(SERVER), "deleteRepeats");
  assert.match(fn, /await referralDuplicates\(\)/, "worked out again on the server, never taken from the browser");
  assert.match(fn, /g\.applications\.slice\(1\)\.filter\(deletableRepeat\)/, "never the first of a group, only what may be deleted");
  // A row's own Delete (byHand): any application in a group now, still never a paid or live-drawn one.
  assert.match(fn, /byHand \? g\.applications\.filter\(deletableByHand\) : g\.applications\.slice\(1\)\.filter\(deletableRepeat\)/);
  assert.match(read(DELETE_ROUTE), /deleteRepeats\(ids, admin\.name \|\| admin\.email, body\.byHand === true\)/, "only a true byHand, never anything else sent");
  assert.match(fn, /data: \{ status: "deleted" \}/, "a soft delete, restored from Participants");
  assert.match(fn, /referralState: "not_counted", referralDecidedAt: at, referralDecidedBy: by/, "out of the count with who, so a restored one is never paid unasked");
  assert.doesNotMatch(fn, /\.delete\(|deleteMany/, "no row is ever removed");
  // Drawn in the live draw: never deleted from here (a winner's seat would empty without a word).
  assert.match(read(SERVER), /SELECT "applicationId" FROM "TripDraw" WHERE mode = 'live'/);
});

test("ID proofs (2026-11-23): an admin's only, never cached, read only; no file's key or content leaves the server", () => {
  const src = read(PROOFS_ROUTE);
  assert.match(src, /if \(!admin \|\| admin\.role !== "admin"\) return new NextResponse\("Unauthorized", \{ status: 401 \}\)/);
  assert.match(src, /"Cache-Control": "no-store"/);
  assert.deepEqual([...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]), ["GET"]);
  const server = read(PROOFS);
  assert.doesNotMatch(server, /GetObjectCommand|HeadObjectCommand|getSignedUrl/, "no file is read or handed out here");
  const mapped = /documents: a\.documents\.map\(\(d\) => \(\{([^}]*)\}\)\)/.exec(server);
  assert.ok(mapped, "each file as the console gets it");
  assert.deepEqual([...mapped[1].matchAll(/(\w+):/g)].map((m) => m[1]), ["id", "contentType", "size", "proof"]);
  assert.match(server, /status: \{ notIn: \["spam", "deleted"\] \}/);
  assert.doesNotMatch(read("src/components/admin/ReferralIdProofs.tsx"), /fetch\(|method: "(POST|PATCH|PUT|DELETE)"/, "the view asks nothing of the server itself");
});
