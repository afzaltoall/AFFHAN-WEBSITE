// Participants and the lucky draw (the owner, 2026-11-25: "give me a option in filter ... run a business ... valid
// passport ... which is selected for lucky draw too have to show separately ... without referrals ... only users who
// came and applied in website", "which is this to audit and check for us so think and do understandable perfection").
// The list marks who is in the draw by the draw's own query; Valid passport and Applied through filter like the
// journeys; Lucky draw shows the draw's people with an audit from every application to them.
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

test("who Participants marks as in the lucky draw is the draw's own query, drawn or not, one per mobile number", () => {
  const draw = read("src/lib/server/lucky-draw.ts");
  assert.match(draw, /export async function drawEligibleIds\(\): Promise<Set<string>> \{\s*const \[row\] = await prisma\.\$queryRaw<\{ ids: string\[\] \| null \}\[\]>\(Prisma\.sql`SELECT array_agg\(p\."id"\) AS ids FROM \(\$\{pool\("live", false\)\}\) p`\);/, "the pool, its rules and one a number, without the not-drawn step");
  const route = read("src/app/api/admin/trip-applications/route.ts");
  assert.match(route, /deleted \? new Set<string>\(\) : withDbRetry\(\(\) => drawEligibleIds\(\)\),/, "every page of the list, never the deleted");
  assert.match(route, /forList\(rows, codes \?\? \(await codesFor\(rows\.map\(\(r\) => r\.customerKey\)\)\), inDraw\)/);
  assert.match(route, /if \(!\(await requireAdmin\(\)\)\) return new NextResponse\("Unauthorized", \{ status: 401 \}\);/);
});

test("a list row says whether it has a passport and came through a link, as a yes or no, never the code or whose", () => {
  const rows = read("src/lib/server/trip-admin-rows.ts");
  const select = /export const LIST_SELECT = \{([\s\S]*?)\} satisfies/.exec(rows)[1];
  for (const k of ["hasPassport", "referralCode", "referrerId"]) assert.match(select, new RegExp(`\\b${k}: true`), `${k} read`);
  assert.match(rows, /return rows\.map\(\(\{ customerKey, referralCode, referrerId, \.\.\.r \}\) => \(\{/, "the code and the employee taken off the row");
  assert.match(rows, /viaLink: referralCode !== null \|\| referrerId !== null,\s*inDraw: inDraw\.has\(r\.id\),/);
});

test("Valid passport and Applied through filter and count as the journeys do, and ride in the address", () => {
  const board = read("src/components/admin/TripApplicationsBoard.tsx");
  assert.match(board, /const p = !passport \|\| \(passport === "yes"\) === r\.hasPassport;/);
  assert.match(board, /const w = !through \|\| \(through === "link"\) === !!r\.viaLink;/);
  assert.match(board, /const d = !drawOnly \|\| !!r\.inDraw;/);
  // Each count leaves out its own filter and keeps the others.
  assert.match(board, /if \(t && s && j && c && w && d\) \{\s*const k: PassportPick = r\.hasPassport \? "yes" : "no";/);
  assert.match(board, /if \(t && s && j && c && p && d\) \{\s*const k: ThroughPick = r\.viaLink \? "link" : "web";/);
  assert.match(board, /if \(t && s && j && c && p && w && r\.inDraw\) inDraw\+\+;/);
  assert.match(board, /if \(t && s && j && c && p && w && d\) list\.push\(r\);/);
  assert.match(board, /\{ value: "yes", label: "Valid passport" \},\s*\{ value: "no", label: "No passport" \},/);
  assert.match(board, /\{ value: "web", label: "Website" \},\s*\{ value: "link", label: "Team member's link" \},/);
  for (const k of ["passport", "through"]) assert.match(board, new RegExp(`if \\(${k}\\) p\\.set\\("${k}", ${k}\\);`));
  assert.match(board, /if \(drawOnly\) p\.set\("draw", "1"\);/);
  const page = read("src/app/admin/(console)/trip-applications/page.tsx");
  assert.match(page, /passport: one\(params\.passport\),\s*through: one\(params\.through\),\s*draw: one\(params\.draw\),/);
});

test("Lucky draw shows the draw's people, every status, with an audit by the Terms' rules, checked against the Lucky draw page", () => {
  const board = read("src/components/admin/TripApplicationsBoard.tsx");
  assert.match(board, /const on = !\(drawOnly && !showRepeats\);\s*setDrawOnly\(on\);\s*setShowRepeats\(false\);\s*if \(on\) setTab\("all"\);/);
  assert.match(board, /\{rows && rows\.length > 0 && drawOnly && !showRepeats && <DrawAudit rows=\{rows\} \/>\}/);
  const audit = board.slice(board.indexOf("function DrawAudit("), board.indexOf("function ActiveFilter("));
  // The rules, in the order the card takes them out.
  assert.match(audit, /const notSpam = rows\.filter\(\(r\) => r\.status !== "spam"\);/);
  assert.match(audit, /const web = notSpam\.filter\(\(r\) => !r\.viaLink\);/);
  assert.match(audit, /const business = web\.filter\(\(r\) => r\.businessStatus === DRAW_BUSINESS_STATUS\);/);
  assert.match(audit, /const passport = business\.filter\(\(r\) => r\.hasPassport\);/);
  assert.match(audit, /repeats: passport\.length - inDraw,/, "one a number: what the draw's own count leaves of the rest");
  assert.match(audit, /fetch\("\/api\/admin\/lucky-draw\/board\/\?mode=live", \{ cache: "no-store" \}\)/);
  assert.match(audit, /board\.toDraw \+ board\.drawn === f\.inDraw/);
  // The export says it of every row.
  assert.match(board, /"Referral code", "In the lucky draw",/);
  assert.match(board, /yes\(inDrawOf\.get\(r\.id\) === true\),/);
});
