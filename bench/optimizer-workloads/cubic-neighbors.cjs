"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  makeRunReceipt,
  parseLastJson,
  profileSettings,
} = require("../../tools/optimizer-development/workloads.cjs");

function validateNeighborReceipt(payload, workload) {
  assert.equal(payload.schema, "sagejs.number-fields/lmfdb-class-number-benchmark-v1");
  const policy = workload.input.value.policy;
  assert.deepEqual(payload.proof_modes, policy.proof_modes);
  assert.equal(payload.comparisons.length, policy.records * policy.proof_modes.length);
  const fixtureExpected = new Map(
    Object.entries(workload.input.value.oracleContract.classNumbers),
  );
  assert.equal(fixtureExpected.size, policy.records);
  const keys = new Set();
  for (const record of payload.comparisons) {
    assert.equal(record.class_number, fixtureExpected.get(record.label));
    assert.ok(record.sagejs_proof_status);
    assert.ok(Number.isFinite(record.sagejs_seconds));
    keys.add(`${record.label}|${record.proof}`);
  }
  assert.equal(keys.size, policy.records * policy.proof_modes.length);
  return payload;
}

async function run(context) {
  const { root, catalog, workload, profile, preflight } = context;
  const settings = profileSettings(workload, profile);
  const specification = workload.input.value;
  const args = [
    path.join(root, "bench/class-unit-groups/compare-lmfdb-class-numbers.cjs"),
    "--fixture", path.join(root, specification.fixture.path),
    "--limit", String(specification.policy.records),
    "--proof", "both",
    "--samples", String(settings.samples),
    "--timeout-seconds", String(settings.timeout_seconds),
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    timeout: settings.timeout_seconds * 1000 + 30_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, SAGEJS_OPT_LEVEL: "O2" },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`cubic neighbor workload failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  const payload = validateNeighborReceipt(parseLastJson(result.stdout, "cubic neighbor workload"), workload);
  return makeRunReceipt({
    root,
    catalog,
    workload,
    preflight,
    configuration: { profile, records: specification.policy.records, samples: settings.samples, proof_modes: specification.policy.proof_modes },
    compilerOptions: {
      frontendMode: "python",
      optimizationLevel: "O2",
      compilationKind: "runtime-evaluator",
    },
    target: "generic",
    output: payload.comparisons.map((record) => ({ label: record.label, proof: record.proof, classNumber: record.class_number, proofStatus: record.sagejs_proof_status })),
    oracleEvidence: Object.fromEntries(
      workload.oracles.map((oracle) => [oracle.id, specification.oracleContract]),
    ),
    compilation: [0],
    compilationUnit: "microseconds",
    cold: [payload.comparisons[0].sagejs_seconds],
    warm: payload.comparisons.map((record) => record.sagejs_seconds),
    executionUnit: "seconds",
    phaseSamples: {
      "class-number": { cold: payload.comparisons[0].sagejs_seconds, warm: payload.comparisons.map((record) => record.sagejs_seconds), unit: "seconds" },
      process: { cold: payload.sagejs.process_total_seconds, warm: [payload.sagejs.process_total_seconds], unit: "seconds" },
    },
    oracleUnavailable: payload.sage_pari ? [] : ["sage-pari-optional"],
    counters: { boundaryCrossings: 0, copiedBytes: 0, materializations: payload.comparisons.length, allocations: 0 },
    resources: { liveBefore: 0, liveAfter: 0, highWater: 0 },
    sourcePaths: ["bench/class-unit-groups/compare-lmfdb-class-numbers.cjs", specification.fixture.path],
  });
}

module.exports = { run, validateNeighborReceipt };
