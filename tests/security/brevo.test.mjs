// The Brevo client: the sender comes only from the environment (no hard-coded address), a message carries its text,
// its HTML and the reply-to, failures are answered rather than thrown, and the keep-alive never throws.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brevoConfigured, brevoKeepAlive, brevoSend } from "../../src/lib/brevo.ts";

const realFetch = globalThis.fetch;
const realError = console.error;
const realWarn = console.warn;
let calls;
const answer = (status, body) => async (url, init) => {
  calls.push({ url: String(url), init });
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
};
const message = { to: "someone@example.com", subject: "Your code", text: "Your code is 123456.", html: "<p>Your code is <b>123456</b>.</p>", replyTo: "info@affhan.com" };

beforeEach(() => {
  calls = [];
  console.error = () => {};
  console.warn = () => {};
  process.env.BREVO_API_KEY = "xkeysib-test-not-a-real-key";
  process.env.BREVO_SENDER_EMAIL = "noreply@mail.affhan.com";
  process.env.BREVO_SENDER_NAME = "AFFHAN Group";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
  console.warn = realWarn;
  delete process.env.BREVO_API_KEY;
  delete process.env.BREVO_SENDER_EMAIL;
  delete process.env.BREVO_SENDER_NAME;
});

test("no hard-coded sender is left in the client", () => {
  const source = readFileSync(new URL("../../src/lib/brevo.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /gmail\.com/i);
  assert.doesNotMatch(source, /sender\s*=\s*\{\s*name:\s*["']/);
});

test("without the key or the sender email nothing is sent", async () => {
  globalThis.fetch = answer(201, { messageId: "<m@relay>" });
  for (const unset of ["BREVO_API_KEY", "BREVO_SENDER_EMAIL"]) {
    const saved = process.env[unset];
    delete process.env[unset];
    assert.equal(brevoConfigured(), false, unset);
    assert.deepEqual(await brevoSend(message), { ok: false, status: null }, unset);
    process.env[unset] = saved;
  }
  assert.equal(calls.length, 0);
});

test("a send goes to Brevo's endpoint from the configured sender, with text, HTML and the reply-to", async () => {
  globalThis.fetch = answer(201, { messageId: "<202610141000.1@smtp-relay.mailin.fr>" });
  const out = await brevoSend(message);
  assert.deepEqual(out, { ok: true, messageId: "<202610141000.1@smtp-relay.mailin.fr>" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["api-key"], "xkeysib-test-not-a-real-key");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    sender: { email: "noreply@mail.affhan.com", name: "AFFHAN Group" },
    to: [{ email: "someone@example.com" }],
    replyTo: { email: "info@affhan.com" },
    subject: "Your code",
    textContent: "Your code is 123456.",
    htmlContent: "<p>Your code is <b>123456</b>.</p>",
  });
});

test("a text-only message carries no HTML, and the sender's name has a default", async () => {
  globalThis.fetch = answer(201, { messageId: "<m@relay>" });
  delete process.env.BREVO_SENDER_NAME;
  await brevoSend({ ...message, html: undefined });
  const body = JSON.parse(calls[0].init.body);
  assert.equal("htmlContent" in body, false);
  assert.deepEqual(body.sender, { email: "noreply@mail.affhan.com", name: "AFFHAN Group" });
});

test("a refusal and an unreachable Brevo are answered, not thrown", async () => {
  globalThis.fetch = answer(401, { code: "unauthorized", message: "Key not found" });
  assert.deepEqual(await brevoSend(message), { ok: false, status: 401 });
  globalThis.fetch = answer(400, { code: "invalid_parameter", message: "email is not valid in to" });
  assert.deepEqual(await brevoSend(message), { ok: false, status: 400 });
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  assert.deepEqual(await brevoSend(message), { ok: false, status: null });
});

test("the keep-alive reads the account, and never throws", async () => {
  globalThis.fetch = answer(200, { email: "owner@example.com", plan: [] });
  await brevoKeepAlive();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.brevo.com/v3/account");
  assert.equal(calls[0].init.headers["api-key"], "xkeysib-test-not-a-real-key");
  assert.equal(calls[0].init.method, undefined);

  globalThis.fetch = answer(401, { code: "unauthorized" });
  await assert.doesNotReject(brevoKeepAlive());
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.doesNotReject(brevoKeepAlive());
  delete process.env.BREVO_API_KEY;
  calls = [];
  await assert.doesNotReject(brevoKeepAlive());
  assert.equal(calls.length, 0);
});
