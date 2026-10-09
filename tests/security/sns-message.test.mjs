// SES notifications: an SNS message is believed only with SNS's signature, from a certificate hosted on SNS.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { parseSnsMessage, stringToSign, isSigningCertUrl, isSubscribeUrl, verifySnsSignature } from "../../src/lib/sns-message.ts";

const NL = String.fromCharCode(10);
const base = {
  Type: "Notification",
  MessageId: "22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324",
  TopicArn: "arn:aws:sns:ap-south-1:123456789012:affhan-ses-events",
  Message: '{"eventType":"Bounce"}',
  Timestamp: "2026-10-09T08:00:00.000Z",
  SignatureVersion: "2",
  Signature: "AAAA",
  SigningCertURL: "https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-6209c161c6221fdf56ec1eb5c821d112.pem",
};
const confirmation = {
  ...base,
  Type: "SubscriptionConfirmation",
  Message: "You have chosen to subscribe to the topic.",
  Token: "2336412f37fb687f5d51e6e2425f004aed",
  SubscribeURL: "https://sns.ap-south-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=arn:aws:sns:ap-south-1:123456789012:affhan-ses-events&Token=2336412f37fb687f5d51e6e2425f004aed",
};

test("only SNS-shaped messages are read", () => {
  assert.equal(parseSnsMessage(base)?.Type, "Notification");
  assert.equal(parseSnsMessage({ ...base, Signature: undefined }), null);
  assert.equal(parseSnsMessage({ ...base, Type: "Something" }), null);
  assert.equal(parseSnsMessage({ ...confirmation, SubscribeURL: undefined }), null, "a confirmation needs its SubscribeURL");
  assert.equal(parseSnsMessage([base]), null);
  assert.equal(parseSnsMessage(null), null);
});

test("the signed text is each field's name and value in AWS's order, Subject only when present", () => {
  const lines = (keys) => keys.map(([k, v]) => `${k}${NL}${v}${NL}`).join("");
  const n = parseSnsMessage(base);
  assert.equal(stringToSign(n), lines([["Message", base.Message], ["MessageId", base.MessageId], ["Timestamp", base.Timestamp], ["TopicArn", base.TopicArn], ["Type", "Notification"]]));
  const withSubject = parseSnsMessage({ ...base, Subject: "Amazon SES Email Event Notification" });
  assert.equal(stringToSign(withSubject), lines([["Message", base.Message], ["MessageId", base.MessageId], ["Subject", "Amazon SES Email Event Notification"], ["Timestamp", base.Timestamp], ["TopicArn", base.TopicArn], ["Type", "Notification"]]));
  const c = parseSnsMessage(confirmation);
  assert.equal(stringToSign(c), lines([["Message", c.Message], ["MessageId", c.MessageId], ["SubscribeURL", c.SubscribeURL], ["Timestamp", c.Timestamp], ["Token", c.Token], ["TopicArn", c.TopicArn], ["Type", "SubscriptionConfirmation"]]));
});

test("certificates and confirmation links are only fetched from SNS itself", () => {
  assert.equal(isSigningCertUrl(base.SigningCertURL), true);
  for (const bad of [
    "http://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem",
    "https://sns.ap-south-1.amazonaws.com.evil.example/SimpleNotificationService-abc.pem",
    "https://evil.example/sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem",
    "https://sns.ap-south-1.amazonaws.com:8443/SimpleNotificationService-abc.pem",
    "https://user@sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem",
    "https://sns.ap-south-1.amazonaws.com/other.pem",
    "https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem?x=1",
    "https://s3.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem",
    "not a url",
  ]) assert.equal(isSigningCertUrl(bad), false, bad);
  assert.equal(isSubscribeUrl(confirmation.SubscribeURL), true);
  assert.equal(isSubscribeUrl("https://sns.ap-south-1.amazonaws.com/?Action=Unsubscribe&Token=x"), false);
  assert.equal(isSubscribeUrl("https://evil.example/?Action=ConfirmSubscription&Token=x"), false);
});

test("the signature is checked over the exact text, for both signature versions", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = publicKey.export({ type: "spki", format: "pem" });
  for (const [version, hash] of [["1", "sha1"], ["2", "sha256"]]) {
    const m = parseSnsMessage({ ...base, SignatureVersion: version });
    const signed = { ...m, Signature: crypto.sign(hash, Buffer.from(stringToSign(m)), privateKey).toString("base64") };
    assert.equal(verifySnsSignature(signed, pem), true, `version ${version}`);
    assert.equal(verifySnsSignature({ ...signed, Message: '{"eventType":"Complaint"}' }, pem), false, `tampered, version ${version}`);
    assert.equal(verifySnsSignature({ ...signed, SignatureVersion: "3" }, pem), false, "unknown version");
  }
  const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" });
  const m = parseSnsMessage(base);
  const signed = { ...m, Signature: crypto.sign("sha256", Buffer.from(stringToSign(m)), privateKey).toString("base64") };
  assert.equal(verifySnsSignature(signed, other), false, "someone else's key");
  assert.equal(verifySnsSignature({ ...m, Signature: "not base64 at all" }, pem), false);
});
