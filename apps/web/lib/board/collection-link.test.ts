import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { encryptSecret } from "@ffd/crypto";
import { MAX_COLLECTION_LINK, SOURCE_SECRET_COLUMN } from "./collection-link.ts";

process.env.MASTER_KEY = randomBytes(32).toString("base64");

test("the longest link the API accepts still fits the sourceSecret column once encrypted (L7)", () => {
  const link = `https://photos.google.com/share/${"A".repeat(MAX_COLLECTION_LINK - 32)}`;
  assert.equal(link.length, MAX_COLLECTION_LINK);
  // A cuid-length id, as the route binds the ciphertext to `collection:<id>`.
  const sealed = encryptSecret(link, `collection:${"c".repeat(25)}`);
  assert.ok(sealed.length <= SOURCE_SECRET_COLUMN, `ciphertext is ${sealed.length} chars`);
});
