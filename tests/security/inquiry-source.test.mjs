// App inquiries are ordinary inquiries (2026-10-23), read from the sources: the AFFHAN app sends its quote requests
// to the website's /api/inquiry with its Bearer session, so they are Inquiry rows, in the open pool like the
// website's; Inquiry.source records which (APP or WEB) from the session's own platform. The routes both apps call
// keep their answers (the before/after run on a throwaway database checks them byte for byte), and the console's
// views read Inquiry.source, not the old MobileInquiry table, which no app writes.
//   npm run test:security
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("the quote route records where it was sent from, off the session that sent it", () => {
  const route = read("src/app/api/inquiry/route.ts");
  assert.match(route, /const session = await mobileSessionOf\(req\)/);
  assert.match(route, /source: session\.platform,/);
  // Still the same session check and the same pool arrival as before.
  assert.match(route, /if \(!session \|\| !user\) \{/);
  assert.match(route, /await leadArrived\(\{ kind: "inquiry", id: newInquiry\.id,/);
  assert.match(route, /return NextResponse\.json\(\{ id: newInquiry\.id \}, \{ status: 201 \}\);/);
});

test("a session's platform: its own column, or the app's Bearer envelope for an older one", () => {
  const auth = read("src/lib/mobile-auth.ts");
  assert.match(auth, /export async function verifyMobileSession\(request: Request\) \{\s*return \(await mobileSessionOf\(request\)\)\?\.user \?\? null;\s*\}/);
  assert.match(auth, /session\.platform === "APP" \|\| session\.platform === "WEB" \? session\.platform : bearer \? "APP" : "WEB"/);
  assert.match(read("src/lib/web-session.ts"), /platform: "WEB"/);
  for (const rel of ["src/app/api/mobile/auth/login/route.ts", "src/app/api/mobile/auth/register/route.ts", "src/app/api/mobile/auth/google/route.ts"]) {
    assert.match(read(rel), /platform: "APP"/, rel);
  }
});

test("the column is additive: a default of WEB, so every older row and every other writer is the website's", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /source String @default\("WEB"\)/);
  const sql = read("prisma/migrations/20261023160000_inquiry_source/migration.sql")
    .split("\n")
    .filter((l) => !l.startsWith("--") && l.trim())
    .join("\n");
  assert.equal(sql, `ALTER TABLE "Inquiry" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'WEB';\nCREATE INDEX "Inquiry_source_idx" ON "Inquiry"("source");`);
  assert.doesNotMatch(sql, /\b(DROP|RENAME|DELETE|UPDATE|TRUNCATE)\b/i);
});

test("what both apps read is unchanged: My Inquiries labels the Inquiry table's rows as before", () => {
  const account = read("src/app/api/account/inquiries/route.ts");
  assert.match(account, /source: "WEBSITE",/);
  assert.match(account, /source: "APP",/);
});

test("the console's App views read Inquiry.source, admins only, and no admin page or route reads the old table", () => {
  const list = read("src/app/api/admin/inquiries/route.ts");
  const gate = list.indexOf("if (!(await requireAdmin()))");
  const first = list.search(/\bprisma\.\w+/);
  assert.ok(gate > 0 && first > gate, "admins only, before the first read");
  assert.match(list, /source: "APP",/);
  assert.doesNotMatch(list, /mobileInquiry/);
  assert.match(read("src/app/admin/(console)/page.tsx"), /source: i\.source,/);
  const walk = (rel) =>
    fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(path.join(rel, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(rel, d.name)] : [],
    );
  for (const rel of [...walk("src/app/admin"), ...walk("src/app/api/admin"), ...walk("src/components/admin")]) {
    assert.doesNotMatch(read(rel), /prisma\.mobileInquiry/, rel);
  }
});
