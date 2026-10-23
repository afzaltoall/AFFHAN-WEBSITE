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

for (const rel of [
  "src/app/api/admin/supplier-offers/[id]/route.ts",
  "src/app/api/admin/supplier-accounts/route.ts",
  "src/app/api/admin/supplier-accounts/[id]/route.ts",
  "src/app/api/admin/supplier-accounts/delete/route.ts",
]) {
  test(`${rel}: admins only, before anything else`, () => {
    for (const h of handlers(read(rel))) {
      const gate = h.indexOf('admin.role !== "admin"');
      assert.ok(gate > 0, "checks the admin role");
      const db = /\bprisma\.\w+/.exec(h);
      if (db) assert.ok(gate < db.index, "before any database call");
    }
  });
}

// New Suppliers and a new supplier's own page (2026-10-23), which Supplier Users opens too: admins only, before
// anything is read; the page's tab title too, since generateMetadata runs apart from the page and would otherwise
// name the supplier to anyone.
for (const rel of [
  "src/app/admin/(console)/new-suppliers/page.tsx",
  "src/app/admin/(console)/new-suppliers/[id]/page.tsx",
  "src/app/admin/(console)/users/suppliers/[id]/page.tsx",
]) {
  test(`${rel}: admins only, before anything is read`, () => {
    const source = read(rel);
    const page = source.slice(source.indexOf("export default async function"));
    const gate = page.indexOf('admin.role !== "admin"');
    assert.ok(gate > 0, "the page checks the admin role");
    const first = /\bprisma\.\w+|readBoard\(|renderNewSupplierPage\(/.exec(page);
    assert.ok(first && gate < first.index, "before the first read");
    if (source.includes("generateMetadata")) {
      const meta = source.slice(source.indexOf("export async function generateMetadata"), source.indexOf("export default async function"));
      const metaGate = meta.indexOf('admin.role !== "admin"');
      assert.ok(metaGate > 0, "the tab title checks the admin role");
      const metaRead = /\bprisma\.\w+|newSupplierTitle\(/.exec(meta);
      assert.ok(metaRead && metaGate < metaRead.index, "before reading the supplier's name");
    }
  });
}

test("the supplier page's reads are server-only", () => {
  assert.match(read("src/components/admin/NewSupplierPage.tsx"), /^import "server-only";/m);
  assert.match(read("src/lib/supplier-news.ts"), /^import "server-only";/m);
});

// Sign-up proves the address first (2026-10-23): the first step only sends a code and never makes an account; the
// second checks the sign-up code before it creates one, so no other purpose's code (a reset's, a customer's) opens it.
test("supplier sign-up: a code first, the account only after it checks", () => {
  const register = read("src/app/api/supplier/auth/register/route.ts");
  assert.doesNotMatch(register, /supplierAccount\.create/);
  assert.match(register, /issueEmailOtp\(email, "SUPPLIER_SIGNUP"\)/);
  assert.match(register, /supplierSignupCodeEmail\(/);
  const verify = read("src/app/api/supplier/auth/register/verify/route.ts");
  const limit = verify.indexOf("checkSupplierVerifyRateLimit(");
  const check = verify.indexOf('checkEmailOtp(email, "SUPPLIER_SIGNUP", code)');
  const create = verify.indexOf("supplierAccount.create");
  assert.ok(limit > 0 && check > limit, "rate limit, then the code");
  assert.ok(create > check, "the account only after the code");
  assert.match(verify.slice(check, create), /if \(!result\.ok\)/);
});

test("supplier codes go by email only: no WhatsApp or phone fallback, in the Supplier Centre's style", () => {
  for (const rel of ["src/app/api/supplier/auth/register/route.ts", "src/app/api/supplier/auth/forgot-password/route.ts"]) {
    const source = read(rel);
    assert.doesNotMatch(source, /cannotSendResponse\(/, rel);
    assert.match(source, /cannotSendEmailOnlyResponse\(/, rel);
  }
  assert.match(read("src/app/api/supplier/auth/forgot-password/route.ts"), /supplierPasswordResetCodeEmail\(/);
  const ui = read("src/components/supplier/SupplierAuth.tsx") + read("src/components/supplier/SupplierForgotPassword.tsx");
  // No link to WhatsApp or a phone (the comments saying so may name them).
  assert.doesNotMatch(ui, /wa\.me\/|["'`]tel:/i);
  const cannot = read("src/lib/cannot-send.ts");
  const emailOnly = cannot.slice(cannot.indexOf("export function cannotSendEmailOnlyResponse"));
  assert.doesNotMatch(emailOnly.slice(0, emailOnly.indexOf("\n}")), /contact|whatsapp|phone/i);
});

// Customers and suppliers are separate accounts with separate sessions (the owner, 2026-10-23): each side's routes
// read only their own session, and the shop's sign-in state is not asked for on the portal's pages.
const walk = (rel) =>
  fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(rel, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(rel, d.name)] : [],
  );

test("supplier routes never read a customer's session", () => {
  for (const rel of walk("src/app/api/supplier")) {
    assert.doesNotMatch(read(rel), /@\/lib\/(mobile-auth|web-session)"|affhan_user/, rel);
  }
});

test("customer routes never read a supplier's session", () => {
  for (const dir of ["src/app/api/web", "src/app/api/mobile", "src/app/api/account"]) {
    for (const rel of walk(dir)) {
      assert.doesNotMatch(read(rel), /@\/lib\/supplier-(session|token)"|affhan_supplier/, rel);
    }
  }
});

test("the shop's sign-in is not asked for on the supplier portal", () => {
  const auth = read("src/context/AuthContext.tsx");
  assert.match(auth, /const supplierSide = isSupplierPath\(pathname\)/);
  assert.match(auth, /if \(supplierSide \|\| asked\.current\) return;/);
  assert.match(auth, /supplierSide\s*\?[\s\S]{0,120}?\{ user: null, loading: false, hint: null,/);
  assert.match(read("src/lib/supplier-paths.ts"), /pathname === "\/supplier" \|\| pathname\.startsWith\("\/supplier\/"\)/);
});

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
