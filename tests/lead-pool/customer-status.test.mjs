// What a signed-in customer reads about a request (src/lib/inquiry-status.ts), the same in the app and on the website's
// My Inquiries (the owner, 2026-11-17): Received when it is sent; Checked once the office has looked at it, or marked
// it Handled (src/lib/inquiry-checked.ts); then, after the call, Confirmed, or Closed with the reason. The old In
// Progress reads as Checked. And the console offers exactly those steps, under the same words the customer reads.
//   npm run test:lead-pool
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describeStatus, isMobileInquiryStatus } from "../../src/lib/inquiry-status.ts";

test("each step in the customer's words", () => {
  assert.deepEqual(describeStatus("PENDING", null), { status: "PENDING", label: "Received", message: "We have your request.", note: null });
  assert.deepEqual(describeStatus("CHECKED", null), { status: "CHECKED", label: "Checked", message: "Our team has checked your request and will call you.", note: null });
  assert.deepEqual(describeStatus("CONFIRMED", null), { status: "CONFIRMED", label: "Confirmed", message: "Confirmed. Our team will be in touch about the next steps.", note: null });
});

test("Closed says the reason the team gave, or only that it is closed", () => {
  const why = "We couldn't agree on the price.";
  assert.deepEqual(describeStatus("CLOSED", why), { status: "CLOSED", label: "Closed", message: why, note: why });
  assert.equal(describeStatus("CLOSED", "   ").message, "This request is closed.");
  assert.equal(describeStatus("CLOSED", null).message, "This request is closed.");
});

test("a note on the other steps follows their sentence; the team's own message stands alone", () => {
  assert.equal(describeStatus("CHECKED", "Quote sent to your email.").message, "Our team has checked your request and will call you. Quote sent to your email.");
  const own = describeStatus("CUSTOM", "Samples arrive on Friday.");
  assert.equal(own.status, "CUSTOM");
  assert.equal(own.message, "Samples arrive on Friday.");
});

test("the old In Progress reads as Checked, anything unknown as Received, and every value stored so far stays valid", () => {
  assert.deepEqual(describeStatus("IN_PROGRESS", null), describeStatus("CHECKED", null));
  assert.equal(describeStatus("SOMETHING ELSE", null).status, "PENDING");
  for (const s of ["PENDING", "CHECKED", "CONFIRMED", "CLOSED", "CUSTOM", "IN_PROGRESS"]) assert.ok(isMobileInquiryStatus(s), s);
  assert.ok(!isMobileInquiryStatus("DONE"));
});

test("the console offers the steps under the customer's own words, and the website's My Inquiries shows the same line", () => {
  const consoleSrc = readFileSync("src/components/admin/AdminConsole.tsx", "utf8").replace(/\r\n/g, "\n");
  const meta = /const CUSTOMER_STATUS_META[^=]*= \{([\s\S]*?)\n\};/.exec(consoleSrc)[1];
  const offered = [...meta.matchAll(/^\s+([A-Z_]+): \{ label: "([^"]+)"/gm)].map((m) => [m[1], m[2]]);
  assert.deepEqual(offered.map(([s]) => s), ["PENDING", "CHECKED", "CONFIRMED", "CLOSED", "CUSTOM"], "never the old In Progress");
  for (const [s, label] of offered) if (s !== "CUSTOM") assert.equal(label, describeStatus(s, null).label, `${s} is called what the customer reads`);
  assert.match(consoleSrc, /s === "IN_PROGRESS" \? "CHECKED"/, "a row still at In Progress is shown as Checked");
  for (const reason of ["We couldn't source this product.", "We couldn't agree on the price.", "You decided not to go ahead."]) {
    assert.ok(consoleSrc.includes(`"${reason}"`), `Closed offers "${reason}"`);
  }

  const page = readFileSync("src/app/account/inquiries/page.tsx", "utf8").replace(/\r\n/g, "\n");
  const stages = [...page.matchAll(/\{ key: "([A-Z_]+)", label: "([^"]+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(stages, [["PENDING", "Received"], ["CHECKED", "Checked"], ["CONFIRMED", "Confirmed"]]);
  assert.match(page, /const CLOSED_STAGE = \{ label: "Closed"/);
});

test("Handled tells its customer Checked; New again (or restored), Received again; nothing else moves", () => {
  const rule = readFileSync("src/lib/inquiry-checked.ts", "utf8").replace(/\r\n/g, "\n");
  assert.match(rule, /where: \{ id, status: "handled", customerStatus: "PENDING" \},\s*data: \{ customerStatus: "CHECKED"/);
  // The way back (the owner: "I put it back to New, but the mobile still shows Checked"): only Checked, or the old In
  // Progress, which reads as Checked; never Confirmed, Closed or the team's own message.
  assert.match(rule, /status: "new", customerStatus: \{ in: \["CHECKED", "IN_PROGRESS"\] \}/);
  assert.match(rule, /where: \{ id, status: "new", customerStatus \},\s*data: \{ customerStatus: "PENDING"/);
  for (const route of ["src/app/api/admin/inquiry/route.ts", "src/app/api/admin/inquiry/[id]/route.ts"]) {
    const src = readFileSync(route, "utf8");
    assert.match(src, /status === "handled" \? await checkHandledInquiries\(/, `${route}: Handled`);
    assert.match(src, /status === "new" \? await reopenCheckedInquiries\(/, `${route}: New`);
  }
  // And the console shows it at once, both ways.
  const consoleSrc = readFileSync("src/components/admin/AdminConsole.tsx", "utf8");
  assert.match(consoleSrc, /status === "new" && \(x\.customerStatus === "CHECKED" \|\| x\.customerStatus === "IN_PROGRESS"\)\) return \{ customerStatus: "PENDING"/);
});
