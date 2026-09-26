#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row19_live_rank1_unit.py");
const TERMINAL = "/scratch/sagejs-row19-terminal-continuation/row19-terminal-continuation-f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76.json.gz";
const TERMINAL_SHA256 = "f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76";
const TERMINAL_COMPRESSED_SHA256 = "bfa7c4a68a2571e5c2663fb43b672d7dcaae36905262b0256a318e44221123dd";
const OUTPUT = "/scratch/sagejs-row19-live-rank1-unit";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function runPython(terminal) {
  return spawnSync("python3", [SOURCE], { cwd: ROOT, encoding: "utf8",
    input: JSON.stringify({ terminal, ancestry: {
      terminalOwnerSha256: TERMINAL_SHA256,
      terminalCompressedSha256: TERMINAL_COMPRESSED_SHA256,
      sourceSha256: sha(fs.readFileSync(SOURCE)), relationsSha256: "0".repeat(64),
      logsSha256: "0".repeat(64), generatorsSha256: "0".repeat(64),
      regulatorSha256: "0".repeat(64) } }), timeout: 600_000,
    maxBuffer: 16*1024*1024,
    env: { ...process.env,
      PYTHONPYCACHEPREFIX: "/scratch/sagejs-row19-live-rank1-unit-cache/pycache" } });
}

function main() {
  process.env.PYTHONPYCACHEPREFIX =
    "/scratch/sagejs-row19-live-rank1-unit-cache/pycache";
  const api = require("./row19_live_rank1_unit_coordinator.cjs");
  const descriptor = { path: TERMINAL, ownerSha256: TERMINAL_SHA256,
    compressedSha256: TERMINAL_COMPRESSED_SHA256 };
  const receipt = api.compose(descriptor, OUTPUT);
  assert.equal(receipt.ownerSha256,
    "d0537e45fc9ecb8c89e7252325f612262363df1d84dbe0c507f0e47ea6ac4116");
  assert.equal(receipt.compressedSha256,
    "5807069dfc9ff429659d6204f3d01335541893a811ef9405c4fa2c28ca956f5b");
  assert.equal(receipt.exponentSha256,
    "d16c6852208fe906d02547b408e8957af9f7417c35fba8e1044b98b62b851420");
  assert.equal(fs.statSync(receipt.path).mode & 0o222, 0);
  const compressed = fs.readFileSync(receipt.path);
  assert.equal(sha(compressed), receipt.compressedSha256);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), receipt.ownerSha256);
  const unit = JSON.parse(plain);
  api.verifyOwner(unit, receipt.ancestry);

  const terminal = api.readTerminal(descriptor).owner;
  for (const mutate of [
    value => { value.relationIdentity.records[0] = "4"; },
    value => { value.relationIdentity.logs[1] = String(BigInt(value.relationIdentity.logs[1]) + 1n); },
    value => { value.regulator[0] = String(BigInt(value.regulator[0]) + 1n); },
    value => { value.relationIdentity.generators.splice(0, 3, "0", "0", "0"); },
  ]) {
    const changed = structuredClone(terminal); mutate(changed);
    const run = runPython(changed);
    assert.notEqual(run.status, 0, "mutated live terminal owner was accepted");
  }

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-live-rank1-unit-check-v1",
    owner: receipt.path, ownerSha256: receipt.ownerSha256,
    compressedSha256: receipt.compressedSha256,
    terminalOwnerSha256: TERMINAL_SHA256,
    relationsSha256: receipt.ancestry.relationsSha256,
    logsSha256: receipt.ancestry.logsSha256,
    generatorsSha256: receipt.ancestry.generatorsSha256,
    regulatorSha256: receipt.ancestry.regulatorSha256,
    exponentSha256: receipt.exponentSha256,
    inverseExponentSha256: receipt.inverseExponentSha256,
    exactNorm: unit.factoredUnit.exactNorm,
    exactInverseNorm: unit.factoredUnit.exactInverseNorm,
    w0RuntimeInput: false, mutationRejections: 4,
  })}\n`);
}

try { main(); } catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
