#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { createH1PrecisionRetryDriver } = require("./h1_precision_retry_driver.cjs");

const residentPath = path.resolve(
  process.argv[2] ||
    "/scratch/sagejs-runtime/pari-class-group-e2e-20260916/spine/generated/phase0-integration-replay-a2740fdbd/stages/resident-cubic-gmp/attempts/attempt-WhFzdr/generated/sagejs-resident-generated-class-FZYTSu/output.json",
);
const resident = JSON.parse(fs.readFileSync(residentPath, "utf8"));
const bridgeSource = path.join(__dirname, "live_h1_owner_bridge.py");
const parameterNames = fs.readFileSync(bridgeSource, "utf8")
  .match(/def pari_live_h1_owner_bridge\(([\s\S]*?)\n\)/)[1]
  .trim().split("\n")
  .map((line) => line.trim().replace(/,$/, "").split(": "));
const sizes = {
  unit_transform: 14, getfu_factor: 4, compact_provenance: 14,
  cleaned_arch: 147, bridge_state: 16, u1: 14, u2: 4, first_arch: 42,
  p_triples: 18, au: 42, clean_logs: 18, signs: 6, unit_state: 5,
  unit_trace: 5, integer_state: 5, integer_basis: 14,
  integer_transform: 49, integer_gram: 49, integer_mu: 49,
  integer_mu_exponents: 49, integer_r: 49, integer_r_exponents: 49,
  integer_s: 7, integer_s_exponents: 7, integer_approximate: 14,
  integer_float_gram: 49, integer_alpha: 7, integer_column: 7,
  integer_column_exponents: 7, integer_normalized: 7,
  integer_temporary: 7, integer_dpe_scratch: 7, integer_scratch: 7,
  real_integers: 6, real_form: 3, real_basis: 6, real_transform: 4,
  real_gram: 4, real_mu: 4, real_mu_exponents: 4, real_r: 4,
  real_r_exponents: 4, real_s: 2, real_s_exponents: 2,
  real_approximate: 6, real_float_gram: 4, real_alpha: 2,
  real_column: 3, real_column_exponents: 3, real_normalized: 3,
  real_temporary: 3, real_dpe_scratch: 3, real_scratch: 3, real_state: 2,
  factor_matep: 18, factor_basis: 6, factor_transform: 4, factor_state: 2,
  factor_mu: 4, factor_mu_exponents: 4, factor_r: 4,
  factor_r_exponents: 4, factor_s: 2, factor_s_exponents: 2,
  factor_approximate: 6, factor_float_gram: 4, factor_alpha: 2,
  factor_column: 3, factor_column_exponents: 2, factor_normalized: 3,
  factor_temporary: 3, factor_exact_gram: 4, clean_pi_cache: 3,
  clean_a: 512, clean_b: 512, clean_p: 512, clean_q: 512,
  clean_stack: 1024, clean_scratch: 147, clean_state: 4, driver_state: 10,
};

function liveCompactProvenance(fn) {
  const source = {
    accepted_arch: resident.hnf_result_c.slice(0, 147),
    relation_lattice: resident.accept_relations.slice(0, 14),
    expected_regulator: resident.accept_regulator.slice(0, 3),
    prep_base_state: resident.prep_base_state.slice(0, 7),
    prep_state: resident.prep_state.slice(0, 8),
    hnf_state: resident.hnf_state.slice(0, 9),
    acceptance_state: resident.accept_acceptance_state.slice(0, 3),
    attempt_state: resident.attempt_state.slice(0, 4),
    class_number: resident.class_number.slice(0, 1),
    columns: 7,
    precision: 192,
  };
  const values = {};
  for (const [name, kind] of parameterNames) {
    if (Object.hasOwn(source, name)) {
      const value = source[name];
      values[name] = Array.isArray(value) ? value.map(BigInt) : BigInt(value);
    } else {
      assert(Object.hasOwn(sizes, name), `missing bridge owner ${name}`);
      values[name] = Array(sizes[name]).fill(kind === "Float64Buffer" ? 0 : 0n);
    }
  }
  assert.equal(
    fn.javascript(...parameterNames.map(([name]) => values[name])),
    0n,
  );
  return values.compact_provenance;
}

function composeRetainedTransform(compact) {
  const cleanup = resident.hnf_transform.slice(0, 73 * 73).map(BigInt);
  const active = resident.hnf_hnf_transform.slice(0, 15 * 15).map(BigInt);
  const kernel = Array(7 * 73).fill(0n);
  for (let k = 0; k < 7; k += 1)
    for (let relation = 0; relation < 73; relation += 1)
      for (let column = 0; column < 15; column += 1)
        kernel[73 * k + relation] +=
          active[15 * k + column] * cleanup[73 * column + relation];
  const retained = Array(2 * 73).fill(0n);
  for (let unit = 0; unit < 2; unit += 1)
    for (let relation = 0; relation < 73; relation += 1)
      for (let k = 0; k < 7; k += 1)
        retained[73 * unit + relation] +=
          compact[7 * unit + k] * kernel[73 * k + relation];
  return retained;
}

function liveInput(retainedTransform, resourceCap) {
  const embedding = resident.preparation_embedding.map(BigInt);
  return {
    residentRoots: {
      m: [embedding[3], embedding[12], embedding[21]],
      p: [embedding[4], embedding[13], embedding[22]],
      e: [embedding[5], embedding[14], embedding[23]],
    },
    principalGenerators: resident.generators.slice(0, 3 * 73).map(BigInt),
    retainedTransform,
    multiplicationBasis: resident.basis_table.slice(0, 27).map(BigInt),
    initialPrecision: 192n,
    resourceCap,
  };
}

async function main() {
  const bridgeBuild = await compileKernel({ sourcePath: bridgeSource });
  const bridge = require(bridgeBuild.modulePath).pari_live_h1_owner_bridge;
  const retainedTransform = composeRetainedTransform(liveCompactProvenance(bridge));
  assert(retainedTransform.some((entry) => entry !== 0n));

  const run = await createH1PrecisionRetryDriver();
  const completed = run(liveInput(retainedTransform, 2176n));
  assert.equal(completed.status, "resource-cap");
  assert.equal(completed.precision, 2176n);
  assert.deepEqual(completed.attempts.map((x) => x.precision), [
    192n, 384n, 768n, 1536n, 2176n,
  ]);
  assert(completed.attempts.every((x) => x.status === 3n));
  assert.equal(completed.attempts.at(0).unitState[4], 1916n);
  assert.equal(completed.attempts.at(-1).unitState[4], -2n);
  assert.equal(Object.hasOwn(completed, "units"), false);
  assert.equal(Object.hasOwn(completed, "logs"), false);

  // The cap is deliberately below the observed success.  It is reached from
  // live PRECI transitions and returns no partially-filled public result.
  const capped = run(liveInput(retainedTransform, 2048n));
  assert.equal(capped.status, "resource-cap");
  assert.equal(capped.precision, 2048n);
  assert.equal(Object.hasOwn(capped, "units"), false);
  assert.equal(Object.hasOwn(capped, "logs"), false);

  let injected = false;
  const corruptingRun = await createH1PrecisionRetryDriver({
    testAfterAttempt({ attempt, exact }) {
      if (attempt === 1) {
        exact.principalGenerators[0] += 1n;
        injected = true;
      }
    },
  });
  assert.throws(
    () => corruptingRun(liveInput(retainedTransform, 2176n)),
    /retained exact owner changed/,
  );
  assert.equal(injected, true);

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/h1-precision-retry-driver-v1",
    field: "x^3-20018*x+20034",
    initialPrecision: "192",
    transitionPrecisions: completed.attempts.map((x) => x.precision.toString()),
    transitionStatuses: completed.attempts.map((x) => x.status.toString()),
    translatedResourceCeiling: completed.precision.toString(),
    finalLiveStatus: completed.attempts.at(-1).status.toString(),
    finalPrecisionDeficit: completed.attempts.at(-1).unitState[4].toString(),
    resourceCapStop: capped.precision.toString(),
    retainedExactOwnerDigest: completed.exactOwnerDigest,
    forcedMutationRejected: injected,
    publicFailureTransactional: true,
    fixtureAnswersLoadedByDriver: false,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
