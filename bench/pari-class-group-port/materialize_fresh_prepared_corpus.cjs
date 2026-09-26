#!/usr/bin/env node
"use strict";

// Development-only projection of the frozen W0 exports onto the exact
// prepared-number-field boundary.  This program is intentionally outside the
// class-group runtime: it authenticates the frozen source, discards every
// event/result field, and publishes only normalized prepared-NF JSON.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  authenticatePreparedNf,
  normalizePreparedBundle,
} = require("./prepared_nf_authentication.cjs");

const ROOT = __dirname;
const FROZEN_MANIFEST = path.join(ROOT, "development-default-driver-manifest.json");
const CORPUS_MANIFEST = path.join(ROOT, "fresh-prepared-corpus-manifest.json");
const INDEX_SCHEMA = "sagejs.pari-class-group/fresh-prepared-corpus-index-v1";

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function atomicImmutableWrite(filename, bytes) {
  if (fs.existsSync(filename)) {
    const prior = fs.readFileSync(filename);
    assert.equal(sha256(prior), sha256(bytes), `${filename} has conflicting content`);
    return;
  }
  const temporary = `${filename}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, bytes, { mode: 0o444, flag: "wx" });
  fs.renameSync(temporary, filename);
  fs.chmodSync(filename, 0o444);
}

function main() {
  const sourceDirectory = path.resolve(process.argv[2] || "");
  const outputDirectory = path.resolve(process.argv[3] || "");
  assert(process.argv[2] && process.argv[3],
    "usage: materialize_fresh_prepared_corpus.cjs SOURCE_W0_DIRECTORY /scratch/OUTPUT_DIRECTORY");
  assert(outputDirectory === "/scratch" || outputDirectory.startsWith("/scratch/"),
    "prepared corpus output must be rebuildable /scratch storage");

  const compact = readJson(CORPUS_MANIFEST);
  assert.equal(compact.schema, "sagejs.pari-class-group/fresh-prepared-corpus-manifest-v1");
  assert.equal(compact.rows.length, 16);

  const frozenBytes = fs.readFileSync(FROZEN_MANIFEST);
  const sourceManifestBytes = fs.readFileSync(path.join(sourceDirectory, "manifest.json"));
  assert.equal(sha256(frozenBytes), compact.sourceManifestSha256,
    "committed frozen manifest changed");
  assert.equal(sha256(sourceManifestBytes), compact.sourceManifestSha256,
    "source directory is not the frozen W0 corpus");
  assert.deepEqual(sourceManifestBytes, frozenBytes,
    "source and committed manifests differ despite their digest");
  const sourceManifest = JSON.parse(sourceManifestBytes);
  assert.equal(sourceManifest.diagnosticOnly, true);
  assert.equal(sourceManifest.qualificationExecutionEnabled, false);
  assert.equal(sourceManifest.reserveOpened, false);
  assert.equal(sourceManifest.policy?.answerDerivedRuntimeFields, false);

  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o755 });
  const files = [];
  for (const expected of compact.rows) {
    const frozen = sourceManifest.records.find(row => row.panelIndex === expected.panelIndex);
    assert(frozen, `frozen manifest lacks row ${expected.panelIndex}`);
    for (const key of ["id", "filename", "bytes", "sha256"])
      assert.equal(frozen[key], expected[`source${key[0].toUpperCase()}${key.slice(1)}`],
        `row ${expected.panelIndex} frozen ${key} changed`);

    const sourceBytes = fs.readFileSync(path.join(sourceDirectory, frozen.filename));
    assert.equal(sourceBytes.length, expected.sourceBytes,
      `row ${expected.panelIndex} source byte count changed`);
    assert.equal(sha256(sourceBytes), expected.sourceSha256,
      `row ${expected.panelIndex} source digest changed`);
    const bundle = JSON.parse(sourceBytes);
    assert.equal(bundle.diagnosticOnly, true);
    assert.equal(bundle.qualificationExecutionEnabled, false);
    assert.equal(bundle.reserveOpened, false);
    assert.equal(bundle.field?.panelIndex, expected.panelIndex);
    assert.equal(bundle.field?.id, expected.sourceId);

    const prepared = normalizePreparedBundle(bundle);
    assert.deepEqual(Object.keys(prepared).sort(), compact.normalizedPreparedKeys,
      `row ${expected.panelIndex} normalized key set changed`);
    const authority = authenticatePreparedNf(prepared);
    assert.equal(authority.sha256, expected.preparedAuthoritySha256,
      `row ${expected.panelIndex} prepared authority changed`);
    const preparedBytes = Buffer.from(`${JSON.stringify(prepared)}\n`);
    assert.equal(preparedBytes.length, expected.preparedJsonBytes,
      `row ${expected.panelIndex} prepared JSON byte count changed`);
    assert.equal(sha256(preparedBytes), expected.preparedJsonSha256,
      `row ${expected.panelIndex} prepared JSON digest changed`);
    const filename = `prepared-row-${String(expected.panelIndex).padStart(2, "0")}-${
      expected.preparedJsonSha256}.json`;
    atomicImmutableWrite(path.join(outputDirectory, filename), preparedBytes);
    files.push({ panelIndex: expected.panelIndex, fieldId: expected.sourceId, filename,
      bytes: preparedBytes.length, sha256: expected.preparedJsonSha256,
      authoritySha256: authority.sha256 });
  }

  const index = { schema: INDEX_SCHEMA, sourceManifestSha256: compact.sourceManifestSha256,
    manifestSha256: sha256(fs.readFileSync(CORPUS_MANIFEST)), count: files.length, files };
  const indexBytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
  const indexFilename = path.join(outputDirectory, "prepared-corpus-index.json");
  atomicImmutableWrite(indexFilename, indexBytes);
  process.stdout.write(`${JSON.stringify({ ...index, outputDirectory })}\n`);
}

if (require.main === module) main();

module.exports = { INDEX_SCHEMA, atomicImmutableWrite, main, sha256 };
