import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, isEncryptedSecret, maskUrl } from "./index.ts";

process.env.MASTER_KEY = randomBytes(32).toString("base64");

test("round-trips a secret and produces a fresh ciphertext every time", () => {
  const secret = "https://calendar.google.com/calendar/ical/abc123%40group.calendar.google.com/private-deadbeef/basic.ics";
  const a = encryptSecret(secret, "widget:1");
  const b = encryptSecret(secret, "widget:1");
  assert.notEqual(a, b, "random DEK + IV → different ciphertexts");
  assert.equal(decryptSecret(a, "widget:1"), secret);
  assert.equal(decryptSecret(b, "widget:1"), secret);
  assert.ok(!a.includes("deadbeef"), "plaintext must not leak into the token");
});

test("ciphertext is bound to its context", () => {
  const token = encryptSecret("secret-url", "widget:1");
  assert.throws(() => decryptSecret(token, "widget:2"));
});

test("tampering is detected", () => {
  const token = encryptSecret("secret-url", "widget:1");
  const parts = token.split(".");
  const payload = Buffer.from(parts[2]!, "base64url");
  payload[payload.length - 1] = payload[payload.length - 1]! ^ 0x01;
  const tampered = `${parts[0]}.${parts[1]}.${payload.toString("base64url")}`;
  assert.throws(() => decryptSecret(tampered, "widget:1"));
});

test("wrong master key cannot open it", () => {
  const token = encryptSecret("secret-url", "ctx");
  const saved = process.env.MASTER_KEY;
  process.env.MASTER_KEY = randomBytes(32).toString("base64");
  try {
    assert.throws(() => decryptSecret(token, "ctx"));
  } finally {
    process.env.MASTER_KEY = saved;
  }
});

test("bad master key length is rejected loudly", () => {
  const saved = process.env.MASTER_KEY;
  process.env.MASTER_KEY = Buffer.from("short").toString("base64");
  try {
    assert.throws(() => encryptSecret("x", "ctx"), /32 bytes/);
  } finally {
    process.env.MASTER_KEY = saved;
  }
});

test("isEncryptedSecret and maskUrl", () => {
  assert.equal(isEncryptedSecret(encryptSecret("x", "c")), true);
  assert.equal(isEncryptedSecret("https://example.com/ics"), false);
  assert.equal(isEncryptedSecret(42), false);
  assert.equal(maskUrl("https://calendar.google.com/calendar/ical/private-xyz/basic.ics"), "https://calendar.google.com/…");
  assert.equal(maskUrl("not a url"), "(saved)");
});
