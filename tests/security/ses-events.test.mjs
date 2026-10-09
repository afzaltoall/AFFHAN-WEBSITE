// SES notifications: permanent bounces and complaints are suppressed; transient bounces and everything else are not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suppressionsFrom } from "../../src/lib/ses-events.ts";

// The shapes AWS documents for configuration-set event publishing ("eventType") and identity notifications
// ("notificationType"); the addresses are SES's mailbox simulator.
const permanent = {
  eventType: "Bounce",
  bounce: {
    feedbackId: "0102018a-bounce-feedback",
    bounceType: "Permanent",
    bounceSubType: "General",
    bouncedRecipients: [{ emailAddress: "bounce@simulator.amazonses.com", action: "failed", status: "5.1.1", diagnosticCode: "smtp; 550 5.1.1 user unknown" }],
    timestamp: "2026-10-09T08:00:00.000Z",
  },
  mail: { messageId: "0102018a-mail", destination: ["bounce@simulator.amazonses.com"] },
};
const complaint = {
  eventType: "Complaint",
  complaint: {
    feedbackId: "0102018a-complaint-feedback",
    complaintFeedbackType: "abuse",
    complainedRecipients: [{ emailAddress: "complaint@simulator.amazonses.com" }],
    timestamp: "2026-10-09T08:00:00.000Z",
  },
  mail: { messageId: "0102018a-mail-2" },
};

test("a permanent bounce suppresses each bounced recipient", () => {
  const { kind, suppress } = suppressionsFrom(permanent);
  assert.equal(kind, "Bounce (Permanent)");
  assert.deepEqual(suppress, [{ email: "bounce@simulator.amazonses.com", reason: "BOUNCE", detail: "General", feedbackId: "0102018a-bounce-feedback" }]);
});

test("a complaint suppresses each complaining recipient", () => {
  const { kind, suppress } = suppressionsFrom(complaint);
  assert.equal(kind, "Complaint");
  assert.deepEqual(suppress, [{ email: "complaint@simulator.amazonses.com", reason: "COMPLAINT", detail: "abuse", feedbackId: "0102018a-complaint-feedback" }]);
});

test("the identity-notification shape is read the same way", () => {
  const { suppress } = suppressionsFrom({ notificationType: "Bounce", bounce: permanent.bounce });
  assert.equal(suppress[0]?.email, "bounce@simulator.amazonses.com");
  assert.equal(suppressionsFrom({ notificationType: "Complaint", complaint: complaint.complaint }).suppress[0]?.reason, "COMPLAINT");
});

test("transient and undetermined bounces, deliveries and junk suppress nobody", () => {
  for (const bounceType of ["Transient", "Undetermined"]) {
    assert.deepEqual(suppressionsFrom({ ...permanent, bounce: { ...permanent.bounce, bounceType } }).suppress, [], bounceType);
  }
  assert.deepEqual(suppressionsFrom({ eventType: "Delivery", delivery: {} }).suppress, []);
  assert.deepEqual(suppressionsFrom({ eventType: "Send" }).suppress, []);
  for (const junk of [null, "text", 42, [], { eventType: "Bounce" }, { eventType: "Complaint", complaint: { complainedRecipients: "x" } }]) {
    assert.deepEqual(suppressionsFrom(junk).suppress, [], JSON.stringify(junk));
  }
});

test("addresses are cleaned: display names dropped, lower case, duplicates and non-addresses skipped", () => {
  const { suppress } = suppressionsFrom({
    ...permanent,
    bounce: { ...permanent.bounce, bouncedRecipients: [{ emailAddress: "Priya Raman <Priya@Example.COM>" }, { emailAddress: "priya@example.com" }, { emailAddress: "nonsense" }, {}] },
  });
  assert.deepEqual(suppress.map((s) => s.email), ["priya@example.com"]);
});
