#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { authenticatePreparedNf } = require("./prepared_nf_authentication.cjs");
const { INDEX_SCHEMA } = require("./materialize_fresh_prepared_corpus.cjs");

const directory = path.resolve(process.argv[2] || "");
assert(process.argv[2], "usage: check_fresh_prepared_corpus.cjs PREPARED_CORPUS_DIRECTORY");
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const manifestPath = path.join(__dirname, "fresh-prepared-corpus-manifest.json");
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
const index = JSON.parse(fs.readFileSync(path.join(directory, "prepared-corpus-index.json")));

assert.equal(index.schema, INDEX_SCHEMA);
assert.equal(index.sourceManifestSha256, manifest.sourceManifestSha256);
assert.equal(index.manifestSha256, sha256(manifestBytes));
assert.equal(index.count, 16);
assert.equal(index.files.length, 16);
assert.deepEqual(index.files.map(row => row.panelIndex), manifest.rows.map(row => row.panelIndex));

const rows = [];
for (const expected of manifest.rows) {
  const record = index.files.find(row => row.panelIndex === expected.panelIndex);
  assert(record, `index lacks row ${expected.panelIndex}`);
  assert.equal(record.fieldId, expected.sourceId);
  assert.equal(record.bytes, expected.preparedJsonBytes);
  assert.equal(record.sha256, expected.preparedJsonSha256);
  assert.equal(record.authoritySha256, expected.preparedAuthoritySha256);
  assert.equal(record.filename,
    `prepared-row-${String(expected.panelIndex).padStart(2, "0")}-${expected.preparedJsonSha256}.json`);
  const filename = path.join(directory, record.filename);
  const stat = fs.statSync(filename);
  assert(stat.isFile(), `${record.filename} is not a regular file`);
  assert.equal(stat.mode & 0o777, 0o444, `${record.filename} is not immutable mode-0444`);
  const bytes = fs.readFileSync(filename);
  assert.equal(bytes.length, expected.preparedJsonBytes);
  assert.equal(sha256(bytes), expected.preparedJsonSha256);
  const prepared = JSON.parse(bytes);
  assert.deepEqual(Object.keys(prepared).sort(), manifest.normalizedPreparedKeys,
    `row ${expected.panelIndex} has an unreviewed or missing prepared key`);
  const authority = authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, expected.preparedAuthoritySha256);
  rows.push({ panelIndex: expected.panelIndex, fieldId: expected.sourceId,
    preparedJsonSha256: expected.preparedJsonSha256,
    preparedAuthoritySha256: expected.preparedAuthoritySha256,
    degree: authority.degree, signature: authority.signature });
}

// The compact manifest, not an output filename or caller assertion, owns every
// digest.  Prove that an extra answer-bearing key cannot pass the gate.
const sample = JSON.parse(fs.readFileSync(path.join(directory, index.files[0].filename)));
sample.classNumber = "1";
assert.notDeepEqual(Object.keys(sample).sort(), manifest.normalizedPreparedKeys);

process.stdout.write(`${JSON.stringify({
  schema: "sagejs.pari-class-group/fresh-prepared-corpus-check-v1",
  count: rows.length,
  sourceManifestSha256: manifest.sourceManifestSha256,
  totalBytes: rows.reduce((sum, row) => sum + manifest.rows.find(
    expected => expected.panelIndex === row.panelIndex).preparedJsonBytes, 0),
  rows,
}, null, 2)}\n`);
