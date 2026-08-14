"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  createWindowsReleaseZip,
} = require("../scripts/create-windows-release-zip.cjs");
const {
  extractArchive,
  preflightArchive,
} = require("../scripts/release-artifact-acceptance.cjs");

function sha256(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

test("Windows release ZIPs are canonical, rooted, and acceptance-compatible", () => {
  const workspace = mkdtempSync(join(tmpdir(), "sagejs-windows-zip-"));
  try {
    const distribution = join(workspace, "sagejs-windows-x64");
    mkdirSync(join(distribution, "licenses"), { recursive: true });
    writeFileSync(join(distribution, "sagejs.exe"), "math executable\n");
    writeFileSync(join(distribution, "sagepython.exe"), "python executable\n");
    writeFileSync(join(distribution, "licenses", "NOTICE.txt"), "notice\n");
    const first = join(workspace, "first.zip");
    const second = join(workspace, "second.zip");
    createWindowsReleaseZip(distribution, first);
    createWindowsReleaseZip(distribution, second);
    assert.equal(sha256(first), sha256(second), "ZIP output must be deterministic");
    assert.deepEqual(preflightArchive(first, "windows-x64"), [
      "sagejs-windows-x64/licenses/NOTICE.txt",
      "sagejs-windows-x64/sagejs.exe",
      "sagejs-windows-x64/sagepython.exe",
    ]);
    const extracted = extractArchive(
      first,
      "windows-x64",
      join(workspace, "extracted"),
    );
    assert.equal(readFileSync(join(extracted, "sagejs.exe"), "utf8"), "math executable\n");
    assert.equal(
      readFileSync(join(extracted, "licenses", "NOTICE.txt"), "utf8"),
      "notice\n",
    );
  } finally {
    rmSync(workspace, { force: true, recursive: true });
  }
});

test("Windows release ZIPs reject links and replacement", () => {
  const workspace = mkdtempSync(join(tmpdir(), "sagejs-windows-zip-reject-"));
  try {
    const distribution = join(workspace, "sagejs-windows-x64");
    mkdirSync(distribution);
    writeFileSync(join(distribution, "sagejs.exe"), "math executable\n");
    const output = join(workspace, "release.zip");
    createWindowsReleaseZip(distribution, output);
    assert.throws(
      () => createWindowsReleaseZip(distribution, output),
      /refusing to replace existing Windows release ZIP/,
    );
    symlinkSync("sagejs.exe", join(distribution, "alias.exe"));
    assert.throws(
      () => createWindowsReleaseZip(distribution, join(workspace, "linked.zip")),
      /contains a symbolic link/,
    );
  } finally {
    rmSync(workspace, { force: true, recursive: true });
  }
});
