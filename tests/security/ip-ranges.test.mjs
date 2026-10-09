// L1 (security audit 2026-10-08): the photo search's link fetch refuses every internal address, however it is written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress } from "../../src/lib/ip-ranges.ts";

const internal = [
  // IPv4
  "0.0.0.0", "10.1.2.3", "100.64.0.1", "100.127.255.254", "127.0.0.1", "127.255.255.255", "169.254.169.254",
  "172.16.0.1", "172.31.255.255", "192.0.0.8", "192.168.1.1", "198.18.0.1", "198.19.255.255", "224.0.0.1", "239.255.255.250", "240.0.0.1", "255.255.255.255",
  // IPv6 loopback, unspecified, local ranges
  "::1", "::", "0:0:0:0:0:0:0:1", "[::1]", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "febf::1", "fec0::1", "ff02::1", "100::1",
  // IPv4 carried inside IPv6, in every spelling: the bypass this closes
  "::ffff:127.0.0.1", "::ffff:7f00:1", "[::ffff:7f00:1]", "0:0:0:0:0:ffff:7f00:0001", "::FFFF:A9FE:A9FE", "::ffff:10.0.0.1",
  "::127.0.0.1", "::7f00:1", "64:ff9b::7f00:1", "64:ff9b::169.254.169.254", "64:ff9b:1::1", "2002:7f00:1::", "2002:a9fe:a9fe::1", "2001:0:4136:e378::1",
];
const external = [
  "8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "169.253.0.1", "198.20.0.1", "223.255.255.255",
  "2606:4700:4700::1111", "2a00:1450:4001:81a::200e", "::ffff:8.8.8.8", "::ffff:808:808", "64:ff9b::808:808", "2002:808:808::1",
];
const notAddresses = ["localhost", "example.com", "1.2.3", "1.2.3.4.5", "256.1.1.1", "1:2:3:4:5:6:7:8:9", "1::2::3", "g::1", ""];

test("every internal address is refused, however it is written", () => {
  for (const ip of internal) assert.equal(isPublicAddress(ip), false, ip);
});

test("addresses on the open internet are allowed, including IPv4 carried in IPv6", () => {
  for (const ip of external) assert.equal(isPublicAddress(ip), true, ip);
});

test("anything that is not an IP address is not public", () => {
  for (const s of notAddresses) assert.equal(isPublicAddress(s), false, JSON.stringify(s));
});
