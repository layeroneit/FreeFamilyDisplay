import assert from "node:assert/strict";
import test from "node:test";
import { isPublicAddress, normalizeUserUrl, UnsafeUrlError } from "./ssrf.ts";

// The payload list from CLAUDE.md, plus the usual suspects.
const BLOCKED = [
  "127.0.0.1",
  "127.255.255.255",
  "169.254.169.254", // cloud metadata
  "169.254.0.1",
  "10.0.0.1",
  "10.255.255.255",
  "172.16.0.1",
  "172.31.255.254",
  "192.168.1.50", // this very box
  "192.168.255.1",
  "0.0.0.0",
  "100.64.0.1", // CGNAT
  "224.0.0.1", // multicast
  "255.255.255.255",
  "::1",
  "::",
  "fe80::1", // link-local
  "fd00::1", // unique local
  "fc00::1",
  "ff02::1", // multicast
  "::ffff:127.0.0.1", // v4-mapped loopback
  "::ffff:169.254.169.254",
  "::ffff:7f00:1", // hex-form mapped loopback
  "::ffff:c0a8:132", // hex-form mapped 192.168.1.50
  "64:ff9b::7f00:1", // NAT64
  "2001:db8::1", // documentation
];

const ALLOWED = ["8.8.8.8", "1.1.1.1", "142.250.72.14", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e"];

test("blocks every private, loopback, link-local, and reserved address", () => {
  for (const ip of BLOCKED) assert.equal(isPublicAddress(ip), false, `${ip} should be blocked`);
});

test("allows public unicast addresses", () => {
  for (const ip of ALLOWED) assert.equal(isPublicAddress(ip), true, `${ip} should be allowed`);
});

test("non-addresses are never public", () => {
  assert.equal(isPublicAddress("localhost"), false);
  assert.equal(isPublicAddress(""), false);
  assert.equal(isPublicAddress("999.1.1.1"), false);
});

test("scheme allowlist: https and webcal only, webcal rewritten to https", () => {
  assert.equal(normalizeUserUrl("https://example.com/cal.ics").protocol, "https:");
  assert.equal(normalizeUserUrl("webcal://example.com/cal.ics").toString(), "https://example.com/cal.ics");
  assert.throws(() => normalizeUserUrl("http://example.com/cal.ics"), UnsafeUrlError);
  assert.throws(() => normalizeUserUrl("ftp://example.com/x"), UnsafeUrlError);
  assert.throws(() => normalizeUserUrl("file:///etc/passwd"), UnsafeUrlError);
  assert.throws(() => normalizeUserUrl("javascript:alert(1)"), UnsafeUrlError);
  assert.throws(() => normalizeUserUrl("not a url"), UnsafeUrlError);
});

test("IP-literal hosts inside private ranges are rejected before any DNS", () => {
  assert.throws(() => normalizeUserUrl("https://127.0.0.1/"), UnsafeUrlError);
  assert.throws(() => normalizeUserUrl("https://169.254.169.254/latest/meta-data/"), UnsafeUrlError);
  assert.throws(() => normalizeUserUrl("https://[::1]/"), UnsafeUrlError);
  assert.throws(() => normalizeUserUrl("https://[::ffff:10.0.0.1]/"), UnsafeUrlError);
});

test("decimal and hex IP literals are normalized by the URL parser into dotted form and rejected", () => {
  // WHATWG URL parsing turns these into 127.0.0.1 before we see them.
  assert.throws(() => normalizeUserUrl("https://2130706433/"), UnsafeUrlError);
  assert.throws(() => normalizeUserUrl("https://0x7f000001/"), UnsafeUrlError);
  assert.throws(() => normalizeUserUrl("https://0177.0.0.1/"), UnsafeUrlError);
});

test("embedded credentials are rejected", () => {
  assert.throws(() => normalizeUserUrl("https://user:pw@example.com/"), UnsafeUrlError);
});
