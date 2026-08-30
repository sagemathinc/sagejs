"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  makeRunReceipt,
  parsePrefixedJson,
  profileSettings,
  workloadKey,
} = require("../../tools/optimizer-development/workloads.cjs");

const EXPECTED_CASES = Object.freeze({
  "3.1.588.1": 3,
  "3.1.4027.2": 6,
  "3.1.5448.1": 8,
});
const EXPECTED_METADATA = Object.freeze([105, 364, 0, 4]);

function runProfiler(root, workload, profile) {
  const settings = profileSettings(workload, profile);
  const mode = workloadKey(workload);
  const environment = { ...process.env };
  delete environment.SAGEJS_NATIVE_DISABLE;
  delete environment.SAGEJS_NATIVE_MODE;
  delete environment.SAGEJS_NATIVE_REQUIRED;
  Object.assign(environment, {
    SAGEJS_NATIVE_MODE: mode === "targets" ? "native" : "auto",
    SAGEJS_OPT_LEVEL: "O2",
    SAGEJS_CUBIC_KERNEL_TARGET: "native",
    SAGEJS_CUBIC_PROFILE_MODE: mode === "targets" ? "targets" : "full",
    SAGEJS_CUBIC_PROFILE_SAMPLES: String(settings.samples),
    SAGEJS_CUBIC_PROFILE_WARMUPS: String(settings.warmups),
    SAGEJS_CUBIC_KERNEL_CALLS: String(settings.size),
    SAGEJS_CUBIC_KERNEL_BATCHES: String(settings.samples),
    SAGEJS_CUBIC_KERNEL_WARMUPS: String(settings.warmups),
  });
  // The target-only control must fail rather than silently losing the native
  // candidate.  The authentic workload imports additional source-transparent
  // kernels whose production-pack inclusion is independent of this campaign;
  // those retain their required dynamic fallback.  validateTargets still
  // authenticates that the measured cubic candidate itself ran natively.
  if (mode === "targets") environment.SAGEJS_NATIVE_REQUIRED = "1";
  const result = spawnSync(
    process.execPath,
    [path.join(root, "bin/sagejs-source.cjs"), "--python", path.join(root, "bench/class-unit-groups/cubic-compiler-boundaries.py")],
    {
      cwd: root,
      encoding: "utf8",
      timeout: settings.timeout_seconds * 1000,
      maxBuffer: 64 * 1024 * 1024,
      env: environment,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(`cubic profiler failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return parsePrefixedJson(result.stdout, "RESULT ", "cubic profiler");
}

function validateTargets(payload) {
  const targets = new Map(payload.candidate_kernel_targets.map((entry) => [entry.target, entry]));
  assert.deepEqual([...targets.keys()].sort(), ["javascript", "native"]);
  for (const target of targets.values()) {
    assert.deepEqual(target.metadata, EXPECTED_METADATA);
    assert.ok(Number.isFinite(target.call_nanoseconds) && target.call_nanoseconds >= 0);
    assert.ok(Number.isFinite(target.buffer_inclusive_nanoseconds) && target.buffer_inclusive_nanoseconds >= 0);
    assert.ok(Array.isArray(target.call_samples_nanoseconds) && target.call_samples_nanoseconds.length > 0);
    assert.ok(Array.isArray(target.buffer_inclusive_samples_nanoseconds) && target.buffer_inclusive_samples_nanoseconds.length > 0);
  }
  assert.equal(targets.get("native").route_selector, "native-wrapper");
  assert.equal(targets.get("native").callable_compiled, true);
  assert.equal(targets.get("native").call_execution_mode, "native");
  assert.equal(targets.get("javascript").route_selector, "explicit-javascript-property");
  return targets;
}

function validateRecords(payload) {
  assert.equal(payload.records.length, Object.keys(EXPECTED_CASES).length * 2);
  const keys = new Set();
  for (const record of payload.records) {
    assert.equal(record.class_number, EXPECTED_CASES[record.label]);
    assert.equal(typeof record.proof, "boolean");
    assert.equal(record.samples.length, payload.samples);
    assert.match(record.presentation_sha256, /^[0-9a-f]{64}$/);
    assert.ok(record.presentation_bytes > 0);
    assert.ok(record.proof_status);
    assert.ok(new Set(["detached-cubic-certificate", "live-projection-presentation"]).has(record.proof_carrier));
    assert.equal(record.phases.class_number.samples_seconds.length, payload.samples);
    assert.equal(record.phases.field_setup.samples_seconds.length, payload.samples);
    assert.ok(Number.isFinite(record.phases.presentation.seconds));
    keys.add(`${record.label}|${record.proof}`);
  }
  assert.equal(keys.size, payload.records.length);
}

async function run(context) {
  const { root, catalog, workload, profile, preflight } = context;
  const payload = runProfiler(root, workload, profile);
  assert.equal(payload.schema, "sagejs-cubic-compiler-boundaries/v1");
  assert.equal(payload.profile_mode, workloadKey(workload) === "targets" ? "targets" : "full");
  const targets = validateTargets(payload);
  if (workloadKey(workload) === "targets") {
    assert.equal(payload.records.length, 0);
  } else {
    validateRecords(payload);
  }
  const native = targets.get("native");
  const javascript = targets.get("javascript");
  const callRatio = javascript.call_nanoseconds / native.call_nanoseconds;
  const inclusiveRatio =
    javascript.buffer_inclusive_nanoseconds / native.buffer_inclusive_nanoseconds;
  const specification = workload.input.value;
  if (workload.class === "negative-control") {
    assert.ok(
      callRatio > specification.policy.maximum_javascript_over_native_call_ratio,
      "the known generic JavaScript route unexpectedly ceased to be a negative control; review rather than silently promoting it",
    );
    assert.ok(
      inclusiveRatio > specification.policy.maximum_javascript_over_native_inclusive_ratio,
      "the generated JavaScript route no longer loses inclusively; review rather than retaining stale negative evidence",
    );
  }
  return makeRunReceipt({
    root,
    catalog,
    workload,
    preflight,
    configuration: {
      profile,
      samples: payload.samples,
      warmups: payload.warmups,
      profile_mode: payload.profile_mode,
      kernel_target: payload.kernel_target,
    },
    compilerOptions: {
      frontendMode: "python",
      optimizationLevel: "O2",
      compilationKind: "runtime-evaluator",
    },
    target: "native",
    output: {
      metadata: EXPECTED_METADATA,
      candidateDispositions: {
        generatedJavascript: "measured-and-rejected",
        native: "measured-reference",
      },
      targetRatios: {
        javascriptOverNativeCall: callRatio,
        javascriptOverNativeInclusive: inclusiveRatio,
      },
      records: payload.records.map((record) => ({
        label: record.label,
        proof: record.proof,
        classNumber: record.class_number,
        proofStatus: record.proof_status,
        proofCarrier: record.proof_carrier,
        presentationSha256: record.presentation_sha256,
        presentationBytes: record.presentation_bytes,
        boundaries: record.boundaries,
      })),
    },
    oracleEvidence: Object.fromEntries(
      workload.oracles.map((oracle) => [oracle.id, specification.oracleContract]),
    ),
    compilation: [0],
    compilationUnit: "microseconds",
    cold: payload.records.length ? [payload.records[0].samples[0]] : [native.call_samples_nanoseconds[0] / 1e9],
    warm: payload.records.length ? payload.records.flatMap((record) => record.samples) : native.call_samples_nanoseconds.map((value) => value / 1e9),
    executionUnit: "seconds",
    phaseSamples: payload.records.length ? {
      "class-number": { cold: payload.records[0].samples[0], warm: payload.records.flatMap((record) => record.samples), unit: "seconds" },
      "field-setup": { cold: payload.records[0].phases.field_setup.samples_seconds[0], warm: payload.records.flatMap((record) => record.phases.field_setup.samples_seconds), unit: "seconds" },
      presentation: { cold: payload.records[0].phases.presentation.seconds, warm: payload.records.map((record) => record.phases.presentation.seconds), unit: "seconds" },
    } : {
      "call-javascript": { cold: javascript.call_samples_nanoseconds[0] / 1000, warm: javascript.call_samples_nanoseconds.map((value) => value / 1000), unit: "microseconds" },
      "call-native": { cold: native.call_samples_nanoseconds[0] / 1000, warm: native.call_samples_nanoseconds.map((value) => value / 1000), unit: "microseconds" },
      "inclusive-javascript": { cold: javascript.buffer_inclusive_samples_nanoseconds[0] / 1000, warm: javascript.buffer_inclusive_samples_nanoseconds.map((value) => value / 1000), unit: "microseconds" },
      "inclusive-native": { cold: native.buffer_inclusive_samples_nanoseconds[0] / 1000, warm: native.buffer_inclusive_samples_nanoseconds.map((value) => value / 1000), unit: "microseconds" },
    },
    counters: { boundaryCrossings: payload.records.reduce((total, record) => total + Object.values(record.boundaries).reduce((count, boundary) => count + boundary.calls, 0), 0), copiedBytes: 0, materializations: payload.records.length, allocations: 0 },
    resources: { liveBefore: 0, liveAfter: 0, highWater: 0 },
    sourcePaths: ["bench/class-unit-groups/cubic-compiler-boundaries.py", ...(specification.fixture ? [specification.fixture.path] : [])],
  });
}

module.exports = {
  EXPECTED_CASES,
  EXPECTED_METADATA,
  run,
  runProfiler,
  validateRecords,
  validateTargets,
};
