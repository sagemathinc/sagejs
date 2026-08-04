#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { createHash } = require("node:crypto");

const root = resolve(__dirname, "..");
const temporaryRoot = mkdtempSync(join(tmpdir(), "sagejs-installer-test-"));
try {
  const platform = "linux-x64";
  const distribution = join(temporaryRoot, `sagejs-${platform}`);
  const installDirectory = join(temporaryRoot, "installed");
  mkdirSync(distribution);
  for (const executable of ["sagejs", "sagepython"]) {
    const filename = join(distribution, executable);
    writeFileSync(filename, "#!/bin/sh\necho 'sagejs 9.9.9-test'\n");
    chmodSync(filename, 0o755);
  }
  const archiveName = `sagejs-${platform}.tar.xz`;
  const archive = join(temporaryRoot, archiveName);
  execFileSync("tar", ["-C", temporaryRoot, "-cJf", archive, `sagejs-${platform}`]);
  const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
  writeFileSync(join(temporaryRoot, `${archiveName}.sha256`), `${digest}  ${archiveName}\n`);

  const result = spawnSync("sh", [join(root, "install.sh")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_DOWNLOAD_BASE_URL: `file://${temporaryRoot}`,
      SAGEJS_INSTALL_DIR: installDirectory,
      SAGEJS_INSTALL_PLATFORM: platform,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed sagejs 9\.9\.9-test/);
  assert.equal(
    execFileSync(join(installDirectory, "sagejs"), { encoding: "utf8" }).trim(),
    "sagejs 9.9.9-test",
  );

  const damaged = readFileSync(archive);
  damaged[damaged.length - 1] ^= 1;
  writeFileSync(archive, damaged);
  const rejected = spawnSync("sh", [join(root, "install.sh")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_DOWNLOAD_BASE_URL: `file://${temporaryRoot}`,
      SAGEJS_INSTALL_DIR: join(temporaryRoot, "rejected"),
      SAGEJS_INSTALL_PLATFORM: platform,
    },
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /SHA-256 verification failed/);
  console.log("Standalone installer tests passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
