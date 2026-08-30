/**
 * Envelope encryption for user-supplied secrets (plan §8.2).
 *
 * A pasted calendar or photo-album URL is a bearer credential. Each secret is
 * encrypted with its own random data key (AES-256-GCM); the data key is
 * wrapped by the instance MASTER_KEY (AES-256-GCM). Rotating the master key
 * means re-wrapping small data keys, never re-encrypting payloads.
 *
 * Wire format (one string, safe in JSON):
 *   v1.<base64url wrapped-DEK blob>.<base64url payload blob>
 *   blob = iv(12) || authTag(16) || ciphertext
 *
 * Never log the plaintext, never log the ciphertext next to the key, and
 * never return either from an API — `maskUrl` is what the UI shows.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_LEN = 12;
const TAG_LEN = 16;

function masterKey(): Buffer {
  const b64 = process.env.MASTER_KEY;
  if (!b64) throw new Error("MASTER_KEY is not set. See .env.example.");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("MASTER_KEY must decode to exactly 32 bytes.");
  return key;
}

function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

function open(key: Buffer, blob: Buffer, aad: string): Buffer {
  if (blob.length < IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Encrypts a secret. `context` binds the ciphertext to its use (e.g. "widget:<id>"). */
export function encryptSecret(plaintext: string, context: string): string {
  const dek = randomBytes(32);
  const wrapped = seal(masterKey(), dek, `dek:${context}`);
  const payload = seal(dek, Buffer.from(plaintext, "utf8"), `payload:${context}`);
  dek.fill(0);
  return `${VERSION}.${wrapped.toString("base64url")}.${payload.toString("base64url")}`;
}

export function decryptSecret(token: string, context: string): string {
  const [v, w, p] = token.split(".");
  if (v !== VERSION || !w || !p) throw new Error("unrecognized secret format");
  const dek = open(masterKey(), Buffer.from(w, "base64url"), `dek:${context}`);
  try {
    return open(dek, Buffer.from(p, "base64url"), `payload:${context}`).toString("utf8");
  } finally {
    dek.fill(0);
  }
}

export function isEncryptedSecret(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${VERSION}.`) && value.split(".").length === 3;
}

/**
 * What the UI shows after save: scheme + host only. The path/query of a
 * private ICS or album link IS the credential, so it never comes back.
 */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/…`;
  } catch {
    return "(saved)";
  }
}
