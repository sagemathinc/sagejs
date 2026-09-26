// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const check = require("../bench/pari-class-group-port/check_row14_phase6_strict_admission.cjs");
const registry = require("../bench/pari-class-group-port/phase6_prepared_adapter_registry.cjs");
const verifier = require("../bench/pari-class-group-port/row14_phase6_matched_state_verifier.cjs");

test("row 14 static evidence is complete, replayed, and mutation covered", () => {
  const result = check.staticCheck();
  assert.equal(result.verdict.matchedReady, true);
  assert.equal(result.verdict.panelIndex, 14);
  assert.deepEqual(Object.keys(result.verdict.mutationCoverage),
    registry.MUTATION_FAMILIES);
  assert(Object.values(result.verdict.mutationCoverage).every(Boolean));
  assert.equal(result.verdict.sourceOwnerArithmeticMutations
    .signedGeneratorEquation, true);
  assert.equal(result.verdict.leanSemanticDigest,
    registry.TRUSTED_V2_ADMISSIONS[0].sageCorrectness.leanSemanticDigest);
});

test("requested precision and packed representation precision are distinct", () => {
  const evidence = JSON.parse(fs.readFileSync(check.EVIDENCE, "utf8"));
  assert.equal(evidence.matchedState.precision.requestedBits, "192");
  assert.equal(evidence.matchedState.precision.packedRealBits, "256");
  assert.equal(evidence.classUnitOutput.unitGroup.regulator.precisionBits, "192");
  assert.equal(evidence.matchedState.regulator.value[1], "256");
  assert.equal(verifier.verifySageCorrectnessEvidence(evidence).matchedReady, true);
});

test("cached arithmetic still reauthenticates fixture bytes on every replay", () => {
  const evidence = JSON.parse(fs.readFileSync(check.EVIDENCE, "utf8"));
  assert.equal(verifier.verifySageCorrectnessEvidence(evidence).matchedReady, true);
  const replay = require(
    "../bench/pari-class-group-port/row14_phase6_static_math_replay.cjs");
  const originalRead = fs.readFileSync;
  fs.readFileSync = function(filename, ...args) {
    const bytes = originalRead.call(this, filename, ...args);
    if (typeof filename === "string" && filename === replay.RESULT_PATH) {
      const changed = Buffer.from(bytes);
      changed[0] ^= 1;
      return changed;
    }
    return bytes;
  };
  try {
    assert.throws(() => verifier.verifySageCorrectnessEvidence(evidence),
      /compressed authority changed/);
  } finally {
    fs.readFileSync = originalRead;
  }
});

test("trust remains single-row and does not open execution or reserves", () => {
  const inventory = registry.inventory();
  assert.deepEqual(inventory.rows.map(row => row.panelIndex), [14]);
  assert.equal(inventory.executionEnabled, false);
  assert.equal(inventory.reserveOpeningEnabled, false);
  assert.equal(registry.preparedAdapterRegistration(14).matchedOutputSchema,
    verifier.MATCHED_OUTPUT_SCHEMA);
  assert.throws(() => registry.preparedAdapterRegistration(13),
    /no prepared adapter inventory|diagnostic-only/);
});

test("row 14 attributes only clocks with exclusive semantic ownership", () => {
  assert.deepEqual(verifier.sageStageLeaves({
    kernelNanoseconds: "31",
    exclusiveRootBoundary: {
      relationship: "exclusive = kernel - startOffset + endOffset",
      startOffsetNanoseconds: "2", endOffsetNanoseconds: "1",
    },
    exclusiveStageTiming: { rootNanoseconds: "30",
      stageTotalsNanoseconds: {
        "relation-retry": "1", "sparse-hnf-snf-transform": "4",
        "unit-regulator": "8", "honesty-generators-final": "0",
        "unattributed-remainder": "17",
      } },
  }), {
    relationRetry: "1",
    sparseHnfSnfTransform: "4",
    unitRegulator: "8",
    honestyGeneratorsFinal: "0",
  });
});

function syntheticWorkOwner() {
  return { accepted: { field: { degree: 4, polynomial: [1, 2, 3, 4, 5] } },
    live: { collectorValues: { relation_state: { toArray: () => [806] } },
      checkpoints: [{ columns: 806 }], resident: {
        state: [3, 10, 796, 0, 7, 0, 0, 806, 0],
        h: Array(9).fill(0), perm: Array(799).fill(0),
        c: Array(7 * 3 * 806).fill(0),
      } }, units: { archimedeanUnits: Array(7 * 3 * 2).fill(0) } };
}

test("row 14 derives work from live owner shapes and rejects disagreements", () => {
  const owner = syntheticWorkOwner();
  assert.deepEqual(verifier.deriveSageWork(owner).authorityValues, {
    classHnfColumns: "3", degree: "4", factorBaseSize: "799",
    logEmbeddingColumns: "2", logEmbeddingRows: "3", relationCount: "806",
  });
  for (const mutate of [
    value => { value.live.resident.h.pop(); },
    value => { value.live.resident.perm.pop(); },
    value => { value.live.resident.c.pop(); },
    value => { value.units.archimedeanUnits.pop(); },
    value => { value.accepted.field.polynomial.pop(); },
    value => { value.live.checkpoints[0].columns = 805; },
  ]) {
    const changed = syntheticWorkOwner(); mutate(changed);
    assert.throws(() => verifier.deriveSageWork(changed));
  }
});
