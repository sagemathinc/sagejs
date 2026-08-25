#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const HASH = /^[0-9a-f]{64}$/;

function semanticReceipt(receipt) {
  assert.equal(receipt?.schema, "sagejs.wasm-prepared-toolchain/v2");
  assert.equal(receipt?.canonicalBuilder, "linux-x64");
  assert.match(receipt?.lockDigest ?? "", HASH);
  assert.match(receipt?.platform ?? "", /^(?:linux|darwin)-(?:x64|arm64)$/);
  assert.equal(typeof receipt?.wasiSdk?.version, "string");
  assert.equal(typeof receipt?.wasiSdk?.clangVersion, "string");

  const libraries = {};
  for (const name of Object.keys(receipt?.libraries ?? {}).sort()) {
    const library = receipt.libraries[name];
    assert.equal(typeof library?.version, "string");
    assert.equal(typeof library?.source, "string");
    for (const field of ["sourceSha256", "archiveSha256", "headersSha256"]) {
      assert.match(library?.[field] ?? "", HASH);
    }
    libraries[name] = {
      version: library.version,
      source: library.source,
      sourceSha256: library.sourceSha256,
      archiveSha256: library.archiveSha256,
      headersSha256: library.headersSha256,
    };
  }
  assert.ok(Object.keys(libraries).length > 0);
  return {
    schema: "sagejs.wasm-toolchain-semantic-receipt/v1",
    canonicalBuilder: receipt.canonicalBuilder,
    wasiSdk: {
      version: receipt.wasiSdk.version,
      clangVersion: receipt.wasiSdk.clangVersion,
    },
    libraries,
  };
}

function compareReceipts(reference, candidates) {
  const expected = semanticReceipt(reference);
  const compared = [];
  for (const candidate of candidates) {
    const actual = semanticReceipt(candidate);
    assert.deepEqual(
      actual,
      expected,
      `semantic toolchain receipt differs for ${candidate.platform}`,
    );
    compared.push({
      platform: candidate.platform,
      lockDigest: candidate.lockDigest,
    });
  }
  return {
    schema: "sagejs.wasm-toolchain-reproducibility/v1",
    reference: {
      platform: reference.platform,
      lockDigest: reference.lockDigest,
    },
    compared,
    semanticReceipt: expected,
  };
}

function load(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function main(argv = process.argv.slice(2)) {
  if (argv.length < 2) {
    throw new Error("usage: compare-receipts.cjs REFERENCE CANDIDATE...");
  }
  const result = compareReceipts(load(argv[0]), argv.slice(1).map(load));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { compareReceipts, semanticReceipt };
