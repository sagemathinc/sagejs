#!/usr/bin/env node
"use strict";

// Separate, bounded build step for the row-13 diagnostic pair. The pair itself
// only loads and authenticates this output and has no compiler fallback.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pari = require("./generic_phase6_pari_prepared_adapter.cjs");
const fresh = require("./row13_phase6_fresh_adapter.cjs");
const sage = require("./row13_phase6_sage_prepared_adapter.cjs");

function main() {
  assert.equal(process.argv.length, 4,
    "usage: prewarm_row13_phase6_pari_helper.cjs EXECUTABLE MANIFEST");
  const executable = path.resolve(process.argv[2]);
  const manifestPath = path.resolve(process.argv[3]);
  assert(!fs.existsSync(executable) && !fs.existsSync(manifestPath),
    "refusing to replace a prebuilt row-13 helper");
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  const built = pari.buildHelper();
  fs.copyFileSync(built.executable, executable, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(executable, 0o755);
  const runtimeLibrary = fresh.resolvePariRuntimeLibrary(executable);
  const manifest = { schema: fresh.PREBUILT_SCHEMA, fieldId: sage.FIELD_ID,
    executableAuthority: sage.artifactAuthority(executable),
    libraryAuthority: sage.artifactAuthority(runtimeLibrary.realPath),
    buildProvenance: { ...built.provenance } };
  fresh.validatePrebuiltManifest(manifest, executable);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ executable, manifestPath,
    executableSha256: manifest.executableAuthority.sha256 })}\n`);
}

if (require.main === module) main();
