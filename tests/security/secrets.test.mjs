// H1 (security audit 2026-10-08): the signing secrets have no fallback, and a missing or short one fails closed.
//   node --test tests/security/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authSecret, authSecretOrNull, cronAuthorized, cronSecret, SecretMissingError, MIN_SECRET_LENGTH } from "../../src/lib/secrets.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LONG = "x".repeat(MIN_SECRET_LENGTH);

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("AUTH_SECRET unset: signing throws an error that names the variable", () => {
  withEnv({ AUTH_SECRET: undefined }, () => {
    assert.throws(() => authSecret(), (e) => e instanceof SecretMissingError && /AUTH_SECRET is not set/.test(e.message));
  });
});

test("AUTH_SECRET shorter than 32 characters: refused", () => {
  withEnv({ AUTH_SECRET: "x".repeat(MIN_SECRET_LENGTH - 1) }, () => {
    assert.throws(() => authSecret(), /shorter than 32 characters/);
  });
});

test("AUTH_SECRET of 32 characters or more: returned as set", () => {
  withEnv({ AUTH_SECRET: LONG }, () => assert.equal(authSecret(), LONG));
});

test("checking without AUTH_SECRET accepts nothing, and does not throw", () => {
  withEnv({ AUTH_SECRET: undefined }, () => {
    const errors = [];
    const original = console.error;
    console.error = (m) => errors.push(String(m));
    try {
      assert.equal(authSecretOrNull(), null);
      assert.equal(authSecretOrNull(), null);
    } finally {
      console.error = original;
    }
    assert.ok(errors.length <= 1, "the reason is logged at most once");
  });
});

test("CRON_SECRET unset: no header passes, not even the literal 'Bearer undefined'", () => {
  withEnv({ CRON_SECRET: undefined }, () => {
    assert.throws(() => cronSecret(), SecretMissingError);
    assert.throws(() => cronAuthorized("Bearer undefined"), SecretMissingError);
    assert.throws(() => cronAuthorized(null), SecretMissingError);
  });
});

test("CRON_SECRET set: only the exact bearer passes", () => {
  withEnv({ CRON_SECRET: LONG }, () => {
    assert.equal(cronAuthorized(`Bearer ${LONG}`), true);
    assert.equal(cronAuthorized(`Bearer ${LONG}x`), false);
    assert.equal(cronAuthorized(`bearer ${LONG}`), false);
    assert.equal(cronAuthorized(LONG), false);
    assert.equal(cronAuthorized(""), false);
    assert.equal(cronAuthorized(null), false);
  });
});

test("the published fallback key appears nowhere in src", () => {
  const hits = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && fs.readFileSync(p, "utf8").includes("affhan_dev_secret")) hits.push(path.relative(ROOT, p));
    }
  })(path.join(ROOT, "src"));
  assert.deepEqual(hits, []);
});
