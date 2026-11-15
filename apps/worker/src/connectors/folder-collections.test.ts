import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { mayUseDropFolders, resolveDropFolder } from "./folder-collections.ts";

const ROOT = path.resolve("/app/drop");

test("a plain folder name resolves inside the drop root", () => {
  assert.equal(resolveDropFolder(ROOT, "demon-slayer"), path.join(ROOT, "demon-slayer"));
  assert.equal(resolveDropFolder(ROOT, "Attack on Titan"), path.join(ROOT, "Attack on Titan"));
  assert.equal(resolveDropFolder(ROOT, "s1_e2.final"), path.join(ROOT, "s1_e2.final"));
});

test("nothing escapes the drop root", () => {
  for (const bad of [
    "..",
    ".",
    "../etc",
    "../../etc/passwd",
    "a/../../b",
    "sub/dir",
    "sub\\dir",
    "/etc/passwd",
    "C:\\Windows",
    "\\\\server\\share",
    "with/slash",
    "",
    "x".repeat(65),
    "nul\0byte",
  ]) {
    assert.equal(resolveDropFolder(ROOT, bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("only the operator's collections may read the shared drop folder (M6)", () => {
  // The drop root is one directory for the whole instance; nothing ties a
  // sub-folder to a household, so a member must not be able to pull one in.
  assert.equal(mayUseDropFolders("OPERATOR"), true);
  assert.equal(mayUseDropFolders("MEMBER"), false);
  assert.equal(mayUseDropFolders("ADMIN"), false);
  assert.equal(mayUseDropFolders(undefined), false);
});
