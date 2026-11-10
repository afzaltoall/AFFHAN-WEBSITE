// The Free China Trip's ID proof, from the upload to the application recorded (2026-11-10, the owner: "after uploading
// any document ... the application is not sending, users are complaining"). On the live code, one request that never
// answered left the file's tile at "Uploading…" for good, Submit answering "still uploading", with no way to take it
// off; Submit pressed while a slow PDF was uploading sent nothing; an answer lost on the way back kept "Processing"
// turning for good, or, on Try again, asked for the ID again for an application already recorded.
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
const FIELD = "src/components/TripApplication/IdDocumentField.tsx";
const PAGE = "src/components/TripApplication/ApplyExperience.tsx";
const ROUTE = "src/app/api/trip-applications/route.ts";

test("an upload can never hang: the ticket has a time limit, the file goes with progress, a stall is given up and tried again", () => {
  const field = read(FIELD);
  assert.match(field, /const TICKET_MS = 20_000;/);
  assert.match(field, /const timer = window\.setTimeout\(stop, TICKET_MS\);/, "the ticket's request is given up in time");
  assert.match(field, /new XMLHttpRequest\(\)/, "the file itself goes by XMLHttpRequest, which says how much has gone");
  assert.doesNotMatch(field, /fetch\(ticket\.uploadUrl|fetch\(t\.uploadUrl/, "never by fetch, which can wait for good without a word");
  assert.match(field, /xhr\.upload\.onprogress = \(e\) => \{[\s\S]*?wait\(all \? ANSWER_MS : STALL_MS\);/, "every byte that moves gives it more time");
  assert.match(field, /const STALL_MS = 30_000;/);
  assert.match(field, /const TRIES = 3;/);
  assert.match(field, /for \(let attempt = 1; attempt <= TRIES; attempt\+\+\)/);
  // A try that lost only its answer goes again to the same key, so nothing is left behind; one S3 refused gets a new ticket.
  assert.match(field, /if \(how === "refused"\) ticket = null;/);
});

test("a file on its way shows how much has gone, and can be taken off", () => {
  const field = read(FIELD);
  assert.match(field, /aria-label=\{`Stop uploading \$\{idProofLabel\(s\.proof\)\}`\}/);
  assert.match(field, /const cancel = \(id: string\) => stops\.current\.get\(id\)\?\.abort\(\);/);
  assert.match(field, /\{pc\}%/);
  // Every file still on its way is stopped when the field goes.
  assert.match(field, /live\.forEach\(\(c\) => c\.abort\(\)\);/);
  // Each upload by its own id, so a file settled twice, or after the link dropped, is counted once.
  const hook = read("src/components/TripApplication/useApplication.ts");
  assert.match(hook, /documents: \{ files: UploadedDocument\[\]; pending: string\[\] \};/);
  assert.match(hook, /if \(!s\.documents\.pending\.includes\(id\)\) return s;/);
});

test("a file the phone named no type is known by its first bytes, and a HEIC photo is told so", () => {
  const field = read(FIELD);
  assert.match(field, /if \(text\(0, 5\) === "%PDF-"\) return "pdf";/);
  assert.match(field, /if \(type !== "application\/pdf" && !type\.startsWith\("image\/"\)\) \{\s*const seen = await sniff\(file\);/);
  assert.match(field, /if \(\/hei\[cf\]\/\.test\(type\)\) return \{ error: HEIC \};/);
});

test("Submit pressed while the ID is uploading sends the application once it has arrived, never 'still uploading'", () => {
  const page = read(PAGE);
  assert.doesNotMatch(page, /Please wait a moment, then submit/);
  assert.match(page, /if \(onItsWay\) delete all\.idDocument;/);
  assert.match(page, /if \(onItsWay\) \{\s*queued\.current = \{ from: fromButton \};\s*setWaitingForId\(true\);/);
  // Once nothing is on its way, sent as if Submit were pressed now: not when every file failed or one did.
  const effect = page.slice(page.indexOf("const pendingIds = app.state.documents.pending.length;"), page.indexOf("}, [pendingIds]);"));
  assert.match(effect, /if \(!queued\.current \|\| pendingIds > 0\) return;/);
  assert.match(effect, /if \(phase !== "form" \|\| !app\.state\.documents\.files\.length \|\| app\.errors\.idDocument\) return;\s*void send\(from\);/);
  // Said over Submit, where the eye is; never as a line under the ID choices (the owner, 2026-11-05/06).
  assert.match(page, /<StepNav disabled=\{phase !== "form"\} note=\{waitingForId \? SUBMIT\.waiting : undefined\} \/>/);
  assert.match(read("src/components/TripApplication/StepNav.tsx"), /<p role="status" data-ax-waiting/);
});

test("the application's answer has a time limit, and with its ID it is sent once more by itself when lost", () => {
  const send = read("src/components/TripApplication/submitApplication.ts");
  assert.match(send, /const ANSWER_MS = 30_000;/);
  assert.match(send, /signal: stop\.signal,/);
  const page = read(PAGE);
  assert.match(page, /if \(!sent\.result\.ok && sent\.result\.reason === "network" && payload\.documents\?\.length\) \{/);
});

test("the same application sent again, its files kept with it from the same number, is answered with its Trip ID", () => {
  const route = read(ROUTE);
  // Only every file kept with one application of this same mobile number, not deleted.
  const kept = route.slice(route.indexOf("async function keptWith("), route.indexOf("export async function POST"));
  assert.match(kept, /kept\.every\(\(k\) => k\.application\.id === first\.id\) && first\.status !== "deleted" && !!customerKey && first\.customerKey === customerKey/);
  // Before S3 is asked, before the number is refused as a repeat, and when the save meets the files' unique keys.
  assert.ok(route.indexOf("const kept = await keptWith(documentKeys, customerKey)") < route.indexOf("await checkDocuments(documentKeys)"));
  const dup = route.slice(route.indexOf("if (existing.length) {"), route.indexOf('reason: "duplicate"'));
  assert.match(dup, /if \(kept !== "none" && kept !== "another"\) return recordedAnswer\(kept, 200\);/);
  const p2002 = route.slice(route.indexOf('e.code === "P2002"'), route.indexOf('e.code === "P2002"') + 500);
  assert.match(p2002, /return recordedAnswer\(kept, 200\);/);
  // Another application's files are still refused, as before.
  assert.match(route, /if \(kept === "another"\) \{\s*turnedAway\("its ID files are kept with another application", body\);/);
});

test("every application and file turned away leaves a line in the server's log, and none of the applicant", () => {
  const route = read(ROUTE);
  const line = route.slice(route.indexOf("function turnedAway("), route.indexOf("function recordedAnswer("));
  assert.doesNotMatch(line, /fullName|phone|city|country|email/);
  for (const why of ["too many from this connection", "this account or mobile number has applied already", "an ID file S3 does not have", "no ID proof with a link's code"]) {
    assert.ok(route.includes(`turnedAway("${why}", body);`), why);
  }
  assert.match(read("src/app/api/trip-applications/document-url/route.ts"), /turnedAway\("not a live link's code"\);/);
});

test("the trip's country field asks 'Select your country'", () => {
  assert.match(read("src/components/TripApplication/fields.tsx"), /placeholder="Select your country"/);
});
