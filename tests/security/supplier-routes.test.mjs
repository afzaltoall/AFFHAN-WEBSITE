// The supplier portal's routes (2026-10-21), read from their sources: every signed-in supplier route asks for the
// supplier's session before it touches the database; the admin routes for it admit admins only; the reset flow
// uses the supplier's own code purpose and token audience, so no customer or staff code or token can reset a
// supplier's password, nor the other way round.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const handlers = (source) =>
  [...source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)].map((m, i, all) =>
    source.slice(m.index, all[i + 1]?.index ?? source.length),
  );

const SIGNED_IN = [
  "src/app/api/supplier/me/route.ts",
  "src/app/api/supplier/me/password/route.ts",
  "src/app/api/supplier/upload-url/route.ts",
  "src/app/api/supplier/offers/route.ts",
  "src/app/api/supplier/offers/[id]/route.ts",
];

for (const rel of SIGNED_IN) {
  test(`${rel}: the supplier's session first, in every handler`, () => {
    const list = handlers(read(rel));
    assert.ok(list.length > 0, "has handlers");
    for (const h of list) {
      const session = h.indexOf("readSupplier()");
      assert.ok(session > 0, "reads the supplier session");
      const db = /\bprisma\.\w+/.exec(h);
      if (db) assert.ok(session < db.index, `readSupplier() comes before ${db[0]}`);
      assert.match(h.slice(session, session + 200), /if \(!supplier\) return NextResponse\.json\([^)]*\{ status: 401 \}\)/);
    }
  });
}

for (const rel of ["src/app/api/admin/supplier-offers/[id]/route.ts", "src/app/api/admin/supplier-accounts/[id]/route.ts", "src/app/api/admin/supplier-accounts/delete/route.ts"]) {
  test(`${rel}: admins only, before anything else`, () => {
    for (const h of handlers(read(rel))) {
      const gate = h.indexOf('admin.role !== "admin"');
      assert.ok(gate > 0, "checks the admin role");
      const db = /\bprisma\.\w+/.exec(h);
      if (db) assert.ok(gate < db.index, "before any database call");
    }
  });
}

test("the supplier reset flow uses its own code purpose and token audience", () => {
  assert.match(read("src/app/api/supplier/auth/forgot-password/route.ts"), /issueEmailOtp\(email, "SUPPLIER_PASSWORD_RESET"\)/);
  const verify = read("src/app/api/supplier/auth/verify-reset-otp/route.ts");
  assert.match(verify, /checkEmailOtp\(email, "SUPPLIER_PASSWORD_RESET", code\)/);
  assert.match(verify, /issueResetToken\(email, result\.otpId, "supplier"\)/);
  const reset = read("src/app/api/supplier/auth/reset-password/route.ts");
  assert.match(reset, /readResetToken\(body\?\.resetToken, "supplier"\)/);
  assert.match(reset, /spendResetToken\(otpId, email, "SUPPLIER_PASSWORD_RESET"\)/);
  assert.match(reset, /tokenVersion: \{ increment: 1 \}/);
});

test("a supplier's sign-in lockout is counted apart from a customer's and an admin's", () => {
  assert.match(read("src/lib/password.ts"), /supplierLoginKey = \(email: string\) => `supplier:\$\{/);
  assert.match(read("src/app/api/supplier/auth/login/route.ts"), /beginLoginAttempt\(key\)/);
});

test("an application accepts only photos our upload route issued", () => {
  assert.match(read("src/app/api/supplier/offers/route.ts"), /readOffer\([^)]*isSupplierPhotoUrl\)/);
  assert.match(read("src/lib/video-storage.ts"), /`suppliers\/\$\{crypto\.randomUUID\(\)\}/);
});
