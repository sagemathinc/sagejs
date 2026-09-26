#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row13_rank2_c5_c6.py");
const SCHEMA = "sagejs.pari-class-group/row13-rank2-c5-c6-v1";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;

const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const hash = (value) => sha256(Buffer.from(JSON.stringify(value)));

class Row13Rank2Failure extends Error {}
function fail(message) {
  throw new Row13Rank2Failure(message);
}
function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    fail(`${label} has the wrong length`);
  }
  return value.map((entry, index) => {
    if (!INTEGER.test(String(entry))) {
      fail(`${label}[${index}] is not canonical`);
    }
    return String(entry);
  });
}

function verifyOwner(owner, ancestry = undefined) {
  if (
    !owner ||
    owner.schema !== SCHEMA ||
    owner.precision !== 256 ||
    owner.status !== "not_given" ||
    owner.reason !== "LARGE" ||
    owner.materialization !== "not_given(LARGE)" ||
    owner.matchedFlagZero !== true ||
    owner.exactUnitsPublished !== false ||
    owner.compactFactoredUnitsRetained !== false ||
    owner.correspondenceComplete !== false ||
    owner.provenance?.frozenW0RuntimeInput !== false
  ) {
    fail("invalid row-13 LARGE owner");
  }
  if (ancestry !== undefined) {
    assert.deepEqual(owner.ancestry, ancestry);
  }
  const compact = owner.compact || {};
  integers(compact.unitTransform, 14, "unit transform");
  integers(compact.archimedeanUnits, 42, "archimedean units");
  integers(compact.getfuFactor, 4, "getfu factor");
  integers(compact.getfuCandidateA, 42, "getfu candidate A");
  integers(compact.relationLattice, 14, "relation lattice");
  integers(compact.regulator, 3, "regulator");
  assert.deepEqual(compact.unitTransformShape, [7, 2]);
  assert.deepEqual(compact.archimedeanUnitShape, [3, 2]);
  assert.deepEqual(compact.getfuFactorShape, [2, 2]);
  assert.deepEqual(compact.relationLatticeShape, [7, 2]);
  if (!Array.isArray(owner.c6State) || owner.c6State[0] !== 2) {
    fail("row-13 getfu did not retain the authentic LARGE state");
  }
  return true;
}

function composeInMemory(accepted, post1006, metadata) {
  const acceptedOwnerSha256 = hash(accepted);
  const postArithmetic = {
    acceptedOwnerSha256: post1006.acceptedOwnerSha256,
    metadataSha256: post1006.metadataSha256,
    regulator: post1006.regulator,
    unitRelations: post1006.unitRelations.map(String),
    unitRelationsSha256: post1006.unitRelationsSha256,
    terminalState: post1006.terminalState,
  };
  const ancestry = {
    acceptedOwnerSha256,
    post1006ArithmeticSha256: hash(postArithmetic),
    metadataSha256: metadata.metadataSha256,
    sourceSha256: sha256(fs.readFileSync(SOURCE)),
  };
  const program = String.raw`import importlib,json,sys
sys.set_int_max_str_digits(1000000);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row13_rank2_c5_c6')
x=json.load(sys.stdin)
json.dump(m.compose_row13_rank2_c5_c6(x['accepted'],x['post'],x['metadata'],x['ancestry']),sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync(
    "prlimit",
    [
      "--as=4294967296",
      "--rss=4294967296",
      "--cpu=600",
      "--",
      "python3",
      "-c",
      program,
    ],
    {
      cwd: ROOT,
      input: JSON.stringify({
        accepted,
        post: post1006,
        metadata,
        ancestry,
      }),
      encoding: "utf8",
      timeout: 600_000,
      maxBuffer: 128 * 1024 * 1024,
    },
  );
  if (run.status !== 0) {
    fail((run.stderr || run.stdout || `Python exited ${run.status}`).trim());
  }
  const owner = JSON.parse(run.stdout);
  verifyOwner(owner, ancestry);
  return { owner, ownerSha256: hash(owner), ancestry };
}

module.exports = {
  Row13Rank2Failure,
  SCHEMA,
  composeInMemory,
  verifyOwner,
};
