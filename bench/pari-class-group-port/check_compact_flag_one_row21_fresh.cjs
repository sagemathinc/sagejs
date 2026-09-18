#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const PROGRAM = path.join(__dirname, "compact_flag_one_row21_fresh.py");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-21-6966124ec38a3af1.json";
const W0_SHA256 = "45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a";
const EXPECTED_TRANSFORM = ["0", "0", "0", "0", "0", "1", "0", "0",
  "0", "0", "0", "0", "0", "1", "3", "1",
  "0", "0", "0", "0", "0", "-1", "1", "0"];

function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function execute(filename = W0, sha256 = W0_SHA256, expected = 0) {
  const result = spawnSync("python3", [PROGRAM, "--w0", filename,
    "--w0-sha256", sha256], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stderr || String(result.error));
  return result;
}
function writeJson(directory, name, value) {
  const filename = path.join(directory, name);
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  fs.writeFileSync(filename, bytes, { mode: 0o600 });
  return [filename, digest(bytes)];
}

const source = fs.readFileSync(PROGRAM, "utf8");
assert.ok(!source.includes("_reference_integral_units"));
assert.ok(!source.includes("_exact_unit_replay"));
const raw = fs.readFileSync(W0);
assert.equal(digest(raw), W0_SHA256);
const original = JSON.parse(raw);
const first = JSON.parse(execute().stdout);
const second = JSON.parse(execute().stdout);
assert.deepEqual(second, first);
assert.equal(first.schema,
  "sagejs.pari-class-group/compact-flag-one-row21-fresh-cut-v1");
assert.equal(first.diagnosticOnly, true);
assert.equal(first.publishable, false);
assert.equal(first.qualifiedTiming, false);
assert.equal(first.frozenW0RuntimeInput, true);
assert.equal(first.input.freshPreparedInput, false);
assert.equal(first.input.frozenHnfLogAcceptanceInput, true);
assert.equal(first.execution.integerLllExecuted, true);
assert.equal(first.execution.realLllExecuted, true);
assert.equal(first.execution.compactTransformCompositionExecuted, true);
assert.equal(first.execution.cleanarchExecuted, true);
assert.equal(first.execution.privateGetfuFactorSelectionExecuted, true);
assert.equal(first.execution.pariFlagOneCallExecuted, false);
assert.equal(first.execution.fundamentalUnitsEventAccessible, false);
assert.equal(first.execution.eagerUnitExpansionExecuted, false);
assert.equal(first.execution.exactFieldUnitMaterializationExecuted, false);
assert.deepEqual(first.result.compactTransform, EXPECTED_TRANSFORM);
assert.deepEqual(first.result.privateGetfuFactor,
  ["1", "0", "0", "0", "1", "0", "1", "0", "1"]);
assert.deepEqual(first.result.cleanarchState, [0, 3, 3, -183, -174, -1, -1]);
assert.equal(JSON.stringify(first).includes("exact-unit-coordinates"), false);
assert.equal(JSON.stringify(first).includes("expanded-unit-coordinates"), false);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row21-compact-fresh-"));
let mutationsRejected = 0;
try {
  // Output-only reference material is stripped before the compact computation.
  // Poisoning both expanded units and the multiplication tensor must not affect
  // any mathematical result from the compact cut.
  const poison = structuredClone(original);
  const fundamental = poison.events.find(event => event.event === "fundamental_units");
  fundamental.U = { poison: "expanded units are out of scope" };
  fundamental.units = { poison: "must never be opened" };
  poison.prepared.multiplicationTensor = ["poison"];
  const [poisonPath, poisonSha] = writeJson(temporary, "poison-output.json", poison);
  const poisoned = JSON.parse(execute(poisonPath, poisonSha).stdout);
  assert.deepEqual(poisoned.result, first.result);
  assert.equal(poisoned.execution.fundamentalUnitsEventAccessible, false);
  assert.equal(poisoned.execution.eagerUnitExpansionExecuted, false);

  const rejected = [
    value => { value.field.signature = [1, 2]; },
    value => { value.events.find(event => event.event === "acceptance").lattice.values.pop(); },
    value => { value.events.find(event => event.event === "hnf").exactC.values.pop(); },
  ];
  for (const [index, mutate] of rejected.entries()) {
    const changed = structuredClone(original);
    mutate(changed);
    const [filename, sha256] = writeJson(temporary, `rejected-${index}.json`, changed);
    const result = execute(filename, sha256, 1);
    assert.match(result.stderr, /(wrong row-21|shape changed|wrong shape)/);
    mutationsRejected += 1;
  }

  const badDigest = execute(W0, "0".repeat(64), 1);
  assert.match(badDigest.stderr, /W0 digest changed/);
  mutationsRejected += 1;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  schema: "sagejs.pari-class-group/compact-flag-one-row21-fresh-check-v1",
  programSha256: digest(fs.readFileSync(PROGRAM)),
  w0Sha256: W0_SHA256,
  repeatedFreshExecutions: 2,
  compactTransform: first.result.compactTransform,
  privateGetfuFactor: first.result.privateGetfuFactor,
  noEagerExpansionControls: {
    strippedExpandedOutputMutationIgnored: true,
    fundamentalUnitsEventAccessible: false,
    eagerUnitExpansionExecuted: false,
    exactFieldUnitMaterializationExecuted: false,
  },
  mutationsRejected,
  honesty: {
    diagnosticOnly: true,
    publishable: false,
    qualifiedTiming: false,
    frozenW0RuntimeInput: true,
  },
  dependencyCut: first.dependencyCut,
})}\n`);
