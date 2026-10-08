// H7 (security audit 2026-10-08): text-message codes are capped per number, per connection and for the whole site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { otpCapReached, siteDailyCap, OTP_PER_NUMBER, OTP_PER_IP, OTP_SITE_PER_DAY } from "../../src/lib/otp-caps.ts";

const none = { numberHour: 0, numberDay: 0, ipHour: 0, ipDay: 0, siteDay: 0 };

test("under every cap: the code may go", () => {
  assert.equal(otpCapReached(none), null);
  assert.equal(otpCapReached({ numberHour: 4, numberDay: 9, ipHour: 9, ipDay: 29, siteDay: 299 }), null);
});

test("each cap stops the next code once it is reached", () => {
  assert.equal(otpCapReached({ ...none, numberHour: OTP_PER_NUMBER.hour, numberDay: OTP_PER_NUMBER.hour }), "number_hour");
  assert.equal(otpCapReached({ ...none, numberDay: OTP_PER_NUMBER.day }), "number_day");
  assert.equal(otpCapReached({ ...none, ipHour: OTP_PER_IP.hour, ipDay: OTP_PER_IP.hour }), "ip_hour");
  assert.equal(otpCapReached({ ...none, ipDay: OTP_PER_IP.day }), "ip_day");
  assert.equal(otpCapReached({ ...none, siteDay: OTP_SITE_PER_DAY }), "site_day");
});

test("the widest cap is the one reported", () => {
  const all = { numberHour: 99, numberDay: 99, ipHour: 99, ipDay: 99, siteDay: 9999 };
  assert.equal(otpCapReached(all), "site_day");
  assert.equal(otpCapReached({ ...all, siteDay: 0 }), "ip_day");
  assert.equal(otpCapReached({ ...all, siteDay: 0, ipDay: 0, ipHour: 0 }), "number_day");
});

test("the site cap follows OTP_DAILY_CAP when it is a whole number above zero", () => {
  assert.equal(otpCapReached({ ...none, siteDay: 300 }, 1000), null);
  assert.equal(otpCapReached({ ...none, siteDay: 50 }, 50), "site_day");
  assert.equal(siteDailyCap("500"), 500);
  assert.equal(siteDailyCap(" 500 "), 500);
  for (const raw of [undefined, "", "  ", "abc", "0", "-5", "2.5", "1e3x"]) assert.equal(siteDailyCap(raw), OTP_SITE_PER_DAY, String(raw));
});
