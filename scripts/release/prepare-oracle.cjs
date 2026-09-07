#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { acquireLock } = require("./runner.cjs");
const { replaceDirectory, realDirectory, exists } = require("./directory-transaction.cjs");
const { provision, readCatalog } = require("../numerical-computing/qualification/scipy-oracle-provisioner.cjs");
const { createBinding } = require("../numerical-computing/qualification/scipy-oracle.cjs");

async function prepareOracle(root = path.resolve(__dirname, "../..")) {
  root = fs.realpathSync(root);
  const build = path.join(root, "build");
  realDirectory(build, !exists(build));
  const lockDirectory = path.join(build, "release-runner");
  realDirectory(lockDirectory, !exists(lockDirectory));
  const lock = path.join(lockDirectory, "active.lock");
  let borrowed = false;
  if (exists(lock)) {
    const stat = fs.lstatSync(lock);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("unsafe checkout lease");
    const owner = JSON.parse(fs.readFileSync(lock, "utf8"));
    // The release runner launches this file directly, without a pnpm shell.
    // Other invocations must obtain their own checkout lease, never just check
    // that a lock was absent before starting preparation.
    borrowed = owner.host === os.hostname() && owner.pid === process.ppid;
  }
  const unlock = borrowed ? () => {} : acquireLock(lock);
  try {
    const catalog = readCatalog(root);
    const artifacts = path.join(build, "numerical-scipy-downloads");
    return await replaceDirectory({ parent: build, name: "numerical-scipy",
      async prepare(directory) {
        realDirectory(artifacts, !exists(artifacts));
        await provision({ catalog, artifactDirectory: artifacts, download: true,
          prefixPath: path.join(directory, "prefix"), provenancePath: path.join(directory, "provenance.json") });
      },
      validate(directory) {
        if (JSON.stringify(fs.readdirSync(directory).sort()) !== JSON.stringify(["prefix", "provenance.json"])) {
          throw new Error("oracle bundle must contain exactly prefix and provenance.json");
        }
        // This checks the current catalog, entire link-free prefix and
        // provenance, actually probes Python/NumPy/SciPy, then rehashes the
        // prefix to ensure the probe did not mutate it. No PATH fallback.
        return createBinding({ root, prefixPath: path.join(directory, "prefix"),
          provenancePath: path.join(directory, "provenance.json") });
      },
    });
  } finally { unlock(); }
}

if (require.main === module) {
  if (process.argv.length !== 2) { console.error("usage: node scripts/release/prepare-oracle.cjs"); process.exitCode = 1; }
  else prepareOracle().then((result) => console.log(JSON.stringify({
    schema: "sagejs.release-oracle-preparation/v1", directory: result.directory,
    reused: result.reused, retained: result.retained ?? null, bindingId: result.value.id,
    provenanceId: result.value.provenance.id,
  })), (error) => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { prepareOracle };
