"use strict";

// Development-host diagnostic for the current fresh row-14 prepared root.
// This is intentionally a different evidence type from the qualified row-14
// campaign.  It cannot open reserves or set a qualification bit.

const assert = require("node:assert/strict");
const fs = require("node:fs");

const campaign = require("./row14_matched_alternating_campaign.cjs");
const host = require("./row14_matched_kernel_clock_host.cjs");
const pari = require("./row14_pari_prepared_timing_adapter.cjs");
const timing = require("./row14_sage_prepared_timing_adapter.cjs");
const manifest = require("./class-unit-qualification-manifest.json");

const SCHEMA = "sagejs.pari-class-group/row14-unqualified-paired-diagnostic-v1";
const FIELD_ID = timing.FIELD_ID;
const PAIRS = 7;
const MINIMUM_ARM_NANOSECONDS = 1_000_000_000n;
const SAGE_LEAVES = Object.freeze([
  "initialRootAndLiveState",
  "factorMetadataProjection",
  "relationCollectionAndHnf",
  "acceptedLiveStateProjection",
  "analyticAcceptanceAndTerminalLattice",
  "unitLatticeAndGetfu",
  "classGroupGen",
]);

function orderFor(index) {
  assert(Number.isSafeInteger(index) && index >= 0);
  return index % 2 === 0 ? ["sagejs", "pari"] : ["pari", "sagejs"];
}

function unsigned(value, label, { positive = false } = {}) {
  assert.equal(typeof value, "string", `${label} must be a decimal string`);
  assert.match(value, /^(0|[1-9][0-9]*)$/, `${label} is not canonical`);
  const result = BigInt(value);
  if (positive) assert(result > 0n, `${label} must be positive`);
  return result;
}

function validateStageTiming(value, rootNanoseconds, implementation) {
  assert(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), ["leaves", "residualNanoseconds"].sort());
  const expected = implementation === "sagejs" ? SAGE_LEAVES : [];
  assert.deepEqual(Object.keys(value.leaves).sort(), [...expected].sort());
  const leaves = Object.values(value.leaves).reduce((sum, duration) =>
    sum + unsigned(duration, "stage leaf", { positive: true }), 0n);
  const residual = unsigned(value.residualNanoseconds, "stage residual");
  assert.equal(leaves + residual, rootNanoseconds,
    "exclusive leaves plus residual must equal the inclusive root");
  if (implementation === "sagejs") assert.equal(residual, 0n);
  else assert.equal(residual, rootNanoseconds);
  return value;
}

function validateArm(arm) {
  assert.deepEqual(Object.keys(arm).sort(), [
    "exactOutputAdmission", "freshComputationOrdinal", "implementation",
    "kernelNanoseconds", "matchedProjectionSha256", "processLifetimeMaxRssKiB",
    "sourceSemanticSha256", "stageTiming",
  ].sort());
  assert(["sagejs", "pari"].includes(arm.implementation));
  const root = unsigned(arm.kernelNanoseconds, "kernel duration", { positive: true });
  assert(root >= MINIMUM_ARM_NANOSECONDS,
    "retained diagnostic arm did not exceed one second");
  unsigned(arm.freshComputationOrdinal, "fresh ordinal", { positive: true });
  unsigned(arm.processLifetimeMaxRssKiB, "process max RSS", { positive: true });
  assert.equal(arm.exactOutputAdmission, true);
  assert.match(arm.matchedProjectionSha256, /^[0-9a-f]{64}$/);
  assert.match(arm.sourceSemanticSha256, /^[0-9a-f]{64}$/);
  validateStageTiming(arm.stageTiming, root, arm.implementation);
  return arm;
}

function validateReceipt(receipt) {
  assert.equal(receipt.schema, SCHEMA);
  assert.equal(receipt.diagnosticOnly, true);
  assert.equal(receipt.qualifiedTiming, false);
  assert.equal(receipt.finalTimingRun, false);
  assert.equal(receipt.ratioClaimPublished, false);
  assert.equal(receipt.outcomeClaim, null);
  assert.equal(receipt.field.id, FIELD_ID);
  assert.equal(receipt.field.panelIndex, 14);
  assert.equal(receipt.field.role, "sentinel");
  assert.equal(receipt.reserveControls.reserveOpeningEnabled, false);
  assert.equal(receipt.reserveControls.reserveFieldsRead, 0);
  assert.equal(receipt.reserveControls.populationDenominatorClaimed, false);
  assert.equal(receipt.pairs.length, PAIRS);
  let ordinal = 1n;
  let projection = null;
  const semantics = { sagejs: null, pari: null };
  for (const [index, pair] of receipt.pairs.entries()) {
    assert.equal(pair.pairIndex, index);
    assert.deepEqual(pair.order, orderFor(index));
    assert.equal(pair.arms.length, 2);
    for (const [position, arm] of pair.arms.entries()) {
      validateArm(arm);
      assert.equal(arm.implementation, pair.order[position]);
      assert.equal(BigInt(arm.freshComputationOrdinal), ordinal++);
      projection ??= arm.matchedProjectionSha256;
      assert.equal(arm.matchedProjectionSha256, projection);
      semantics[arm.implementation] ??= arm.sourceSemanticSha256;
      assert.equal(arm.sourceSemanticSha256, semantics[arm.implementation]);
    }
  }
  assert.equal(receipt.matchedProjectionSha256, projection);
  assert.deepEqual(receipt.sourceSemanticSha256, semantics);
  assert.equal(receipt.boundary.input, "authenticated prepared nfinit state");
  assert.equal(receipt.boundary.preparationInsideClock, false);
  assert.equal(receipt.boundary.compilationInsideClock, false);
  assert.equal(receipt.boundary.replayInsideClock, false);
  assert.equal(receipt.boundary.serializationInsideClock, false);
  assert.equal(receipt.stageInterpretation.phase6FourWayAttributionAvailable, false);
  return receipt;
}

function requireDevelopmentField() {
  assert.equal(manifest.executionEnabled, false,
    "this diagnostic must not enable the qualification runner");
  assert.equal(manifest.reserveOpeningEnabled, false, "reserves must remain sealed");
  const field = manifest.fields.find(value => value.id === FIELD_ID);
  assert(field, "row-14 field is absent from the frozen manifest");
  assert.equal(field.panelIndex, 14);
  assert.notEqual(field.role, "final-reserve");
  return field;
}

function affinityRecord(expectedText = process.env.SAGEJS_TIMING_CPU) {
  assert.match(expectedText || "", /^(0|[1-9][0-9]*)$/,
    "set SAGEJS_TIMING_CPU and pin this process to that CPU");
  const status = fs.readFileSync("/proc/self/status", "utf8");
  const match = status.match(/^Cpus_allowed_list:\s*(.+)$/m);
  assert(match);
  const allowed = campaign.parseCpuList(match[1]);
  assert.deepEqual(allowed, [Number(expectedText)]);
  return { requestedCpu: expectedText, cpusAllowedList: match[1].trim() };
}

async function runDiagnostic() {
  assert.equal(process.platform, "linux");
  assert.equal(process.arch, "x64");
  assert.equal(typeof global.gc, "function", "launch Node with --expose-gc");
  for (const name of ["OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"])
    assert.equal(process.env[name], "1", `${name}=1 is required`);
  const field = requireDevelopmentField();
  const affinity = affinityRecord();

  // Authentication, compilation, resident-handle construction, PARI build,
  // and both warmups are deliberately complete before the retained schedule.
  const authenticated = timing.authenticatePrepared();
  const resident = await host.prepareResident(authenticated.prepared);
  assert.equal(resident.gateKernels.profile, false);
  const client = new pari.HelperClient(pari.buildHelper());
  await client.ready();
  await host.runResident(resident);
  await client.run("1");

  let ordinal = 0n;
  let previousSageRoot = null;
  const pairs = [];
  const sourceSemanticSha256 = { sagejs: null, pari: null };
  let matchedProjectionSha256 = null;
  try {
    for (let pairIndex = 0; pairIndex < PAIRS; pairIndex += 1) {
      const order = orderFor(pairIndex), raw = {};
      for (const implementation of order) {
        global.gc();
        ordinal += 1n;
        if (implementation === "sagejs") {
          const result = await host.runResident(resident);
          assert.notEqual(result.root, previousSageRoot, "Sage.js root was reused");
          previousSageRoot = result.root;
          assert.equal(result.executionBoundary.compilationInsideRun, false);
          const sage = campaign.sageProjection(result);
          const projection = timing.commonProjectionFromSage(sage);
          raw.sagejs = { result, sage, arm: {
            implementation, freshComputationOrdinal: String(ordinal),
            kernelNanoseconds: result.kernelNanoseconds,
            processLifetimeMaxRssKiB: String(result.maxRssKiB),
            matchedProjectionSha256: campaign.digest(projection),
            sourceSemanticSha256: campaign.digest(sage),
            exactOutputAdmission: true,
            stageTiming: { leaves: result.stageNanoseconds, residualNanoseconds: "0" },
          } };
        } else {
          const sample = await client.run("1");
          const projection = timing.commonProjectionFromPari(sample);
          raw.pari = { sample, arm: {
            implementation, freshComputationOrdinal: String(ordinal),
            kernelNanoseconds: sample.kernelNanoseconds,
            processLifetimeMaxRssKiB: sample.processMaxRssKiB,
            matchedProjectionSha256: campaign.digest(projection),
            sourceSemanticSha256: campaign.digest(pari.semanticRecord(sample)),
            exactOutputAdmission: true,
            stageTiming: { leaves: {}, residualNanoseconds: sample.kernelNanoseconds },
          } };
        }
      }
      timing.compareWithPari(raw.sagejs.sage, raw.pari.sample);
      const arms = order.map(name => validateArm(raw[name].arm));
      for (const arm of arms) {
        matchedProjectionSha256 ??= arm.matchedProjectionSha256;
        assert.equal(arm.matchedProjectionSha256, matchedProjectionSha256);
        sourceSemanticSha256[arm.implementation] ??= arm.sourceSemanticSha256;
        assert.equal(arm.sourceSemanticSha256, sourceSemanticSha256[arm.implementation]);
      }
      pairs.push({ pairIndex, order, arms });
    }
  } finally {
    await client.close();
  }
  return validateReceipt({
    schema: SCHEMA, diagnosticOnly: true, qualifiedTiming: false,
    finalTimingRun: false, ratioClaimPublished: false, outcomeClaim: null,
    field: { id: field.id, panelIndex: field.panelIndex, role: field.role },
    reserveControls: { reserveOpeningEnabled: false, reserveFieldsRead: 0,
      populationDenominatorClaimed: false },
    hostControls: { ...affinity, threadEnvironment: {
      OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1",
    }, quietHostApproved: false, qualificationAuthorityApproved: false },
    boundary: {
      input: "authenticated prepared nfinit state",
      output: "matched flag-zero class-and-unit semantic projection",
      preparationInsideClock: false, compilationInsideClock: false,
      replayInsideClock: false, serializationInsideClock: false,
      eachArmFresh: true,
    },
    stageInterpretation: {
      phase6FourWayAttributionAvailable: false,
      reason: "relationCollectionAndHnf crosses the Phase-6 relation/HNF boundary and PARI remains whole-root-only",
      sageLeaves: SAGE_LEAVES,
      pariCharge: "unattributed-remainder",
    },
    minimumArmNanoseconds: String(MINIMUM_ARM_NANOSECONDS),
    matchedProjectionSha256, sourceSemanticSha256, pairs,
  });
}

module.exports = {
  FIELD_ID, MINIMUM_ARM_NANOSECONDS, PAIRS, SAGE_LEAVES, SCHEMA,
  orderFor, requireDevelopmentField, runDiagnostic, validateArm, validateReceipt,
};
