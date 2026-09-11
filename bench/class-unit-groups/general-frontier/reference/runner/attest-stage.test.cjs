"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { inventory } = require("./attest-stage.cjs");

test("stage inventory detects mutation, additions and removals", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frontier-attest-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "a"), "a"); const first = inventory(root);
  assert.deepEqual(inventory(root), first);
  fs.writeFileSync(path.join(root, "a"), "b"); assert.notDeepEqual(inventory(root), first);
  fs.writeFileSync(path.join(root, "b"), "a"); assert.equal(inventory(root).length, 2);
  fs.unlinkSync(path.join(root, "a")); assert.notDeepEqual(inventory(root), first);
});

test("stage inventory rejects external and dangling symlinks", { skip: process.platform === "win32" }, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frontier-attest-link-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "a"), "a");
  fs.symlinkSync("a", path.join(root, "b")); assert.equal(inventory(root).length, 2);
  fs.unlinkSync(path.join(root, "b")); fs.symlinkSync(os.tmpdir(), path.join(root, "b"));
  assert.throws(() => inventory(root), /external symlink/);
  fs.unlinkSync(path.join(root, "b")); fs.symlinkSync("missing", path.join(root, "b"));
  assert.throws(() => inventory(root));
});
