// Brevo webhook events: hard bounces, invalid addresses, blocked sends and spam complaints are suppressed; every
// other event is not; the webhook's shared secret is required and compared in constant time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suppressionsFromBrevo, tokenMatches } from "../../src/lib/brevo-events.ts";

// The shape Brevo posts for a transactional event (its webhook documentation); the addresses are invented.
const event = (name, email = "someone@example.com", extra = {}) => ({
  event: name,
  email,
  id: 1234567,
  date: "2026-10-14 10:00:00",
  ts: 1791967200,
  "message-id": "<202610141000.1234567890@smtp-relay.mailin.fr>",
  ts_event: 1791967201,
  subject: "Your AFFHAN password reset code",
  tag: "",
  sending_ip: "185.41.28.109",
  ...extra,
});

test("each of the four events suppresses its address, with the reason and the event recorded", () => {
  const cases = [
    ["hard_bounce", "BOUNCE", "brevo:hard_bounce"],
    ["invalid_email", "BOUNCE", "brevo:invalid_email"],
    ["blocked", "BOUNCE", "brevo:blocked"],
    ["spam", "COMPLAINT", "brevo:spam"],
  ];
  for (const [name, reason, detail] of cases) {
    const { suppress } = suppressionsFromBrevo(event(name));
    assert.deepEqual(suppress, [{ email: "someone@example.com", reason, detail, feedbackId: "<202610141000.1234567890@smtp-relay.mailin.fr>" }], name);
  }
});

test("the names Brevo uses when a webhook is set up are read the same way", () => {
  assert.equal(suppressionsFromBrevo(event("hardBounce")).suppress[0]?.detail, "brevo:hard_bounce");
  assert.equal(suppressionsFromBrevo(event("invalid")).suppress[0]?.detail, "brevo:invalid_email");
});

test("deliveries, opens, clicks, soft bounces and the rest suppress nobody", () => {
  for (const name of ["request", "delivered", "opened", "unique_opened", "click", "soft_bounce", "deferred", "unsubscribed", "error", "proxy_open", ""]) {
    assert.deepEqual(suppressionsFromBrevo(event(name)).suppress, [], name);
  }
});

test("junk is not an event", () => {
  for (const junk of [null, undefined, "hard_bounce", 42, {}, [], [null, "x"], { event: "hard_bounce" }]) {
    assert.deepEqual(suppressionsFromBrevo(junk).suppress, []);
  }
});

test("a batch is read whole, one row per address, the latest event winning", () => {
  const { events, suppress } = suppressionsFromBrevo([
    event("delivered", "a@example.com"),
    event("hard_bounce", "b@example.com"),
    event("hard_bounce", "a@example.com"),
    event("spam", "a@example.com"),
  ]);
  assert.deepEqual(events, ["delivered", "hard_bounce", "hard_bounce", "spam"]);
  assert.deepEqual(
    suppress.map((s) => [s.email, s.reason]).sort(),
    [["a@example.com", "COMPLAINT"], ["b@example.com", "BOUNCE"]],
  );
});

test("addresses are cleaned: display names dropped, lower case, non-addresses skipped", () => {
  assert.equal(suppressionsFromBrevo(event("hard_bounce", "Some One <Some.One@Example.COM>")).suppress[0]?.email, "some.one@example.com");
  assert.equal(suppressionsFromBrevo(event("hard_bounce", "  MIXED@Example.com ")).suppress[0]?.email, "mixed@example.com");
  for (const bad of ["not an address", "a@b", "@example.com", "", 7, null]) {
    assert.deepEqual(suppressionsFromBrevo(event("hard_bounce", bad)).suppress, [], String(bad));
  }
});

test("no message-id is recorded as none", () => {
  assert.equal(suppressionsFromBrevo(event("spam", "x@example.com", { "message-id": undefined })).suppress[0]?.feedbackId, null);
});

test("the webhook's token: only the configured secret opens it, and no secret opens nothing", () => {
  const secret = "3f9c1a7e5b2d8c4f6a0e9b1d7c3a5f8e";
  assert.equal(tokenMatches(secret, secret), true);
  assert.equal(tokenMatches(`${secret}x`, secret), false);
  assert.equal(tokenMatches(secret.slice(0, -1), secret), false);
  assert.equal(tokenMatches("", secret), false);
  assert.equal(tokenMatches(null, secret), false);
  assert.equal(tokenMatches(undefined, secret), false);
  assert.equal(tokenMatches(secret, ""), false);
  assert.equal(tokenMatches(secret, undefined), false);
  assert.equal(tokenMatches("", ""), false);
});
