// "Email on your decision" (2026-10-23): when a supplier is emailed about their application, measured against what
// they were last told (src/lib/supplier-news-rules.ts). The sending itself waits out NEWS_SETTLE_MS in
// src/lib/supplier-news.ts, so a run of changes is one email about where things ended.
//   npm run test:supplier-match
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEWS_SETTLE_MS, isNews, newsOf } from "../../src/lib/supplier-news-rules.ts";

const NEW = { status: "NEW", reply: null };

test("a decision is news: being reviewed, accepted, not selected", () => {
  for (const status of ["REVIEWING", "ACCEPTED", "REJECTED"]) {
    assert.deepEqual(newsOf(NEW, { status, reply: null }), { status: true, reply: false }, status);
  }
});

test("back to New, a withdrawal or no change at all is not", () => {
  assert.equal(isNews(newsOf({ status: "REVIEWING", reply: null }, NEW)), false);
  assert.equal(isNews(newsOf(NEW, { status: "WITHDRAWN", reply: null })), false);
  assert.equal(isNews(newsOf({ status: "ACCEPTED", reply: "Yes" }, { status: "ACCEPTED", reply: "Yes" })), false);
});

test("a reply is news when it is new, and a blank or re-saved one is not", () => {
  assert.deepEqual(newsOf(NEW, { status: "NEW", reply: "Send us a sample" }), { status: false, reply: true });
  assert.equal(isNews(newsOf({ status: "NEW", reply: "Same" }, { status: "NEW", reply: "  Same " })), false);
  assert.equal(isNews(newsOf(NEW, { status: "NEW", reply: "   " })), false);
});

test("a run of changes is measured from what the supplier last saw: accepted and a reply is one email with both", () => {
  // Reviewing, then Accepted, then a reply, all inside the settle window: one email, against NEW.
  assert.deepEqual(newsOf(NEW, { status: "ACCEPTED", reply: "Welcome aboard" }), { status: true, reply: true });
  // A slip (Accepted) put back (Reviewing) before the window closed, after they were told Reviewing: nothing.
  assert.equal(isNews(newsOf({ status: "REVIEWING", reply: null }, { status: "REVIEWING", reply: null })), false);
});

test("the settle window is long enough for a status and then a reply", () => {
  assert.ok(NEWS_SETTLE_MS >= 10_000 && NEWS_SETTLE_MS <= 30_000);
});
