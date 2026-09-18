#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const zlib = require("node:zlib");
const { deriveRow6ColumnAncestry } = require(
  "./row6_terminal_class_ancestry.cjs",
);

const GATE_SHA256 =
  "6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98";
const FACTOR_SHA256 =
  "1afc78df4b2ff4fe85dd3385589835095c8123da86082de0f66dce4e0897fbef";
const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const canonicalHash = (value) => sha256(Buffer.from(JSON.stringify(value)));

function readOwner(file, expectedSha256) {
  assert.equal(fs.statSync(file).mode & 0o222, 0, `${file} is mutable`);
  const plain = zlib.gunzipSync(fs.readFileSync(file));
  assert.equal(sha256(plain), expectedSha256, `${file} identity changed`);
  return JSON.parse(plain);
}

async function main() {
  if (process.argv.length !== 4) {
    throw new Error("usage: check_row6_terminal_class_ancestry.cjs GATE FACTOR");
  }
  const gate = readOwner(process.argv[2], GATE_SHA256);
  const factor = readOwner(process.argv[3], FACTOR_SHA256);
  const ancestry = await deriveRow6ColumnAncestry(gate, factor);
  assert.equal(ancestry.rawToUnitKernel.length, 7 * 1137);
  assert.equal(ancestry.rawToPresentation.length, 2 * 1137);
  assert.equal(ancestry.acceptedArch.length, 147);
  assert.equal(
    ancestry.state.packedLogProvenance.acceptedArchSha256,
    canonicalHash(ancestry.acceptedArch),
  );
  assert.deepEqual(ancestry.state.activeFactorRows, [1092, 1094]);
  assert.deepEqual(ancestry.state.acceptedActiveFactorRows, [1092, 1094]);
  assert.equal(ancestry.state.packedLogProvenance.terminalPackedEquality, true);
  assert.equal(ancestry.state.packedLogProvenance.mutationsRejected, 3);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row6-column-ancestry-check-v1",
    gateSha256: GATE_SHA256,
    factorSha256: FACTOR_SHA256,
    ancestrySha256: canonicalHash(ancestry),
    rawToUnitKernelSha256: canonicalHash(ancestry.rawToUnitKernel),
    rawToPresentationSha256: canonicalHash(ancestry.rawToPresentation),
    acceptedArchSha256: canonicalHash(ancestry.acceptedArch),
    activeFactorRows: ancestry.state.activeFactorRows,
    checkpointCount: ancestry.state.packedLogProvenance.checkpoints.length,
    terminalPackedEquality: true,
    frozenW0RuntimeInput: false,
  })}\n`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
