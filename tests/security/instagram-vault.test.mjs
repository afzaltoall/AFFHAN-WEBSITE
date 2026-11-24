// The Instagram task's passwords (src/lib/instagram-vault.ts, 2026-11-24, the owner: "give usernam and account password
// entry"): sealed with AES-256-GCM under a key derived from AUTH_SECRET, bound to their account, and read only through
// the vault, whose unlock is the admin's own password again, as the ID proof lock is, under a key of its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { VAULT_UNLOCK_MS, openPassword, readVaultUnlock, sealPassword, signVaultUnlock } from "../../src/lib/instagram-vault.ts";
import { signIdProofUnlock } from "../../src/lib/id-proof-lock-token.ts";

const SECRET = "s".repeat(48);
const OTHER = "t".repeat(48);
const NOW = 1_800_000_000_000;

test("a password comes back only for its own account, under the same secret", () => {
  const sealed = sealPassword("Affhan@2026 finds", "acct-1", SECRET);
  assert.match(sealed, /^v1\.[A-Za-z0-9_-]+$/);
  assert.ok(!sealed.includes("Affhan"), "never the password in the clear");
  assert.equal(openPassword(sealed, "acct-1", SECRET), "Affhan@2026 finds");
  assert.equal(openPassword(sealed, "acct-2", SECRET), null, "copied onto another account's row it never opens");
  assert.equal(openPassword(sealed, "acct-1", OTHER), null, "nor under another secret");
  assert.equal(openPassword(sealed, "acct-1", null), null, "nor with no secret at all");
});

test("every seal is new, and an altered one never opens", () => {
  const a = sealPassword("same password", "acct-1", SECRET);
  const b = sealPassword("same password", "acct-1", SECRET);
  assert.notEqual(a, b, "a fresh iv each time: the same password never seals the same twice");
  const raw = Buffer.from(a.slice(3), "base64url");
  for (const at of [0, 12, 27, 28, raw.length - 1]) {
    const bent = Buffer.from(raw);
    bent[at] ^= 1;
    assert.equal(openPassword(`v1.${bent.toString("base64url")}`, "acct-1", SECRET), null, `byte ${at}`);
  }
  for (const junk of ["", "v1.", "v2." + a.slice(3), a.slice(3), "v1.AAAA", undefined, null]) {
    assert.equal(openPassword(junk, "acct-1", SECRET), null, String(junk));
  }
  // Every character survives: Tamil, emoji, spaces at either end.
  const odd = "  பாஸ்வேர்ட் 🔒 x ";
  assert.equal(openPassword(sealPassword(odd, "acct-9", SECRET), "acct-9", SECRET), odd);
});

test("the vault opens for ten minutes, for that admin, and nothing else opens it", () => {
  const token = signVaultUnlock({ adminId: "a1", tokenVersion: 3 }, SECRET, NOW);
  assert.deepEqual(readVaultUnlock(token, SECRET, NOW + 1000), { adminId: "a1", tokenVersion: 3, expiresAt: NOW + VAULT_UNLOCK_MS });
  assert.equal(VAULT_UNLOCK_MS, 10 * 60 * 1000);
  assert.equal(readVaultUnlock(token, SECRET, NOW + VAULT_UNLOCK_MS), null, "over at ten minutes");
  assert.equal(readVaultUnlock(token, OTHER, NOW), null, "another secret's");
  assert.equal(readVaultUnlock(token, null, NOW), null, "no secret, nothing trusted");
  const [payload, sig] = token.split(".");
  const longer = Buffer.from(JSON.stringify({ kind: "instagram-vault-unlock", sub: "a1", v: 3, exp: NOW + VAULT_UNLOCK_MS * 6 })).toString("base64url");
  assert.equal(readVaultUnlock(`${longer}.${sig}`, SECRET, NOW), null, "an altered payload");
  assert.equal(readVaultUnlock(`${payload}.${sig}x`, SECRET, NOW), null, "an altered signature");
  // An ID proof unlock, signed with the same AUTH_SECRET, is another kind under another key: it never opens passwords.
  assert.equal(readVaultUnlock(signIdProofUnlock({ adminId: "a1", tokenVersion: 3 }, SECRET, NOW), SECRET, NOW + 1000), null);
});
