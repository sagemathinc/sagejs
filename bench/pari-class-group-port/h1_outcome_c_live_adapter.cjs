"use strict";

// Authentic Sage.js adapter for the Outcome-C worker.  The caller supplies the
// already-sanitized, prepared owner graph; this module neither reads a fixture
// nor serializes an intermediate resident result.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const HERE = __dirname;
const CANDIDATE_SOURCE = path.join(HERE, "resident_generated_class_attempt.py");
const BRIDGE_SOURCE = path.join(HERE, "live_h1_owner_bridge.py");
const PREPARED_SCHEMA = "sagejs.pari-class-group/sanitized-prepared-h1-v1";
const TERMINAL_STATUS = "live-candidate-bridge-prefix-h1";

const BRIDGE_SIZES = Object.freeze({
  unit_transform: 14, getfu_factor: 4, compact_provenance: 14,
  cleaned_arch: 147, bridge_state: 16, u1: 14, u2: 4, first_arch: 42,
  p_triples: 18, au: 42, clean_logs: 18, signs: 6, unit_state: 5,
  unit_trace: 5, integer_state: 5, integer_basis: 14,
  integer_transform: 49, integer_gram: 49, integer_mu: 49,
  integer_mu_exponents: 49, integer_r: 49, integer_r_exponents: 49,
  integer_s: 7, integer_s_exponents: 7, integer_approximate: 14,
  integer_float_gram: 49, integer_alpha: 7, integer_column: 7,
  integer_column_exponents: 7, integer_normalized: 7, integer_temporary: 7,
  integer_dpe_scratch: 7, integer_scratch: 7, real_integers: 6,
  real_form: 3, real_basis: 6, real_transform: 4, real_gram: 4,
  real_mu: 4, real_mu_exponents: 4, real_r: 4, real_r_exponents: 4,
  real_s: 2, real_s_exponents: 2, real_approximate: 6,
  real_float_gram: 4, real_alpha: 2, real_column: 3,
  real_column_exponents: 3, real_normalized: 3, real_temporary: 3,
  real_dpe_scratch: 3, real_scratch: 3, real_state: 2,
  factor_matep: 18, factor_basis: 6, factor_transform: 4, factor_state: 2,
  factor_mu: 4, factor_mu_exponents: 4, factor_r: 4,
  factor_r_exponents: 4, factor_s: 2, factor_s_exponents: 2,
  factor_approximate: 6, factor_float_gram: 4, factor_alpha: 2,
  factor_column: 3, factor_column_exponents: 2, factor_normalized: 3,
  factor_temporary: 3, factor_exact_gram: 4, clean_pi_cache: 3,
  clean_a: 512, clean_b: 512, clean_p: 512, clean_q: 512,
  clean_stack: 1024, clean_scratch: 147, clean_state: 4, driver_state: 10,
});

function canonical(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function parameters(source, entry) {
  const match = source.match(new RegExp(`def\\s+${entry}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `${entry} declaration disappeared`);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

function scalar(value, kind, name) {
  if (kind === "bool") {
    assert.equal(typeof value, "boolean", `${name} must be boolean`);
    return value;
  }
  if (kind === "float") {
    const answer = Number(value);
    assert(Number.isFinite(answer), `${name} must be finite`);
    return answer;
  }
  assert.match(String(value), /^-?(0|[1-9][0-9]*)$/, `${name} must be canonical`);
  return BigInt(value);
}

function owner(value, kind, name) {
  if (!kind.endsWith("Buffer")) return scalar(value, kind, name);
  assert(Array.isArray(value), `${name} must be an owner`);
  const member = kind === "Float64Buffer" ? "float" : "Integer";
  return value.map((entry, index) => scalar(entry, member, `${name}[${index}]`));
}

function decimalPrefix(value, length, name) {
  assert(Array.isArray(value) && value.length >= length, `${name} is short`);
  return value.slice(0, length).map(entry => String(entry));
}

function candidateResult(values, bridgeValues) {
  const attempt = decimalPrefix(values.attempt_state, 4, "attempt state");
  const bridge = decimalPrefix(bridgeValues.bridge_state, 16, "bridge state");
  assert.deepEqual(attempt, ["4", "0", "1", "1"], "candidate is not terminal");
  assert.equal(bridge[0], "0", "live owner bridge failed");
  assert.equal(bridge[6], "1", "Outcome-C adapter is restricted to h = 1");
  assert.equal(bridge[15], "0", "internal result cannot claim public completion");
  const cleaned = decimalPrefix(bridgeValues.cleaned_arch, 147, "cleaned archimedean owner");
  return {
    schema: "sagejs.pari-class-group/live-candidate-bridge-prefix-v1",
    field: "pari-2.17.4:x^3-20018*x+20034",
    classGroup: { classNumber: "1", invariantFactors: [], generators: [] },
    correspondence: {
      acceptedRelations: String(values.relation_state[0]),
      hnfRank: String(values.hnf_state[1]),
      cleanarchSha256: digest(cleaned),
      compactUnitProvenance: decimalPrefix(bridgeValues.compact_provenance, 14, "unit provenance"),
      bridgeState: bridge,
    },
    assumptions: {
      pari2174AlgorithmicCorrespondence: true,
      grhAndPariHeuristicBounds: true,
      publicClassUnitComplete: false,
    },
  };
}

function bridgeArguments(specification, values) {
  const source = {
    accepted_arch: values.hnf_result_c.slice(0, 147),
    relation_lattice: values.accept_relations.slice(0, 14),
    expected_regulator: values.accept_regulator.slice(0, 3),
    prep_base_state: values.prep_base_state.slice(0, 7),
    prep_state: values.prep_state.slice(0, 8), hnf_state: values.hnf_state.slice(0, 9),
    acceptance_state: values.accept_acceptance_state.slice(0, 3),
    attempt_state: values.attempt_state.slice(0, 4), class_number: values.class_number.slice(0, 1),
    columns: 7n, precision: 192n,
  };
  const result = {};
  for (const [name, kind] of specification) {
    if (Object.hasOwn(source, name)) result[name] = source[name];
    else {
      assert(Object.hasOwn(BRIDGE_SIZES, name), `missing live bridge capacity: ${name}`);
      result[name] = Array(BRIDGE_SIZES[name]).fill(kind === "Float64Buffer" ? 0 : 0n);
    }
  }
  return result;
}

function createPreparedH1Adapter({ compiler } = {}) {
  compiler ||= options => require("../../tools/native-kernel/compiler.cjs").compileKernel(options);
  let kernelsPromise;
  async function kernels() {
    if (!kernelsPromise) kernelsPromise = Promise.all([
      compiler({ sourcePath: CANDIDATE_SOURCE }), compiler({ sourcePath: BRIDGE_SOURCE }),
    ]).then(([candidate, bridge]) => {
      const candidateSource = fs.readFileSync(CANDIDATE_SOURCE, "utf8");
      const bridgeSource = fs.readFileSync(BRIDGE_SOURCE, "utf8");
      return {
        candidate: require(candidate.modulePath).pari_resident_generated_class_attempt,
        candidateParameters: parameters(candidateSource, "pari_resident_generated_class_attempt"),
        bridge: require(bridge.modulePath).pari_live_h1_owner_bridge,
        bridgeParameters: parameters(bridgeSource, "pari_live_h1_owner_bridge"),
      };
    });
    return kernelsPromise;
  }

  return async function runPreparedH1({ implementation, seed, preparedInput, switchStage }) {
    assert.equal(implementation, "sagejs", "live adapter only implements Sage.js");
    assert.equal(typeof switchStage, "function");
    assert.equal(preparedInput.schema, PREPARED_SCHEMA, "prepared input was not sanitized");
    assert.equal(preparedInput.names.length, 351, "prepared owner ABI changed");
    const compiled = await kernels();
    assert.deepEqual(preparedInput.names, compiled.candidateParameters, "prepared owner ABI changed");
    const values = Object.fromEntries(preparedInput.names.map(([name, kind]) =>
      [name, owner(preparedInput.input[name], kind, name)]));

    switchStage("relation-retry");
    const action = compiled.candidate.tagged(
      ...compiled.candidateParameters.map(([name]) => values[name]),
    );
    assert.equal(action, 0n, "resident candidate did not accept");
    switchStage("sparse-hnf-snf-transform");
    assert.equal(String(values.class_number[0]), "1", "candidate is not h = 1");

    switchStage("unit-regulator");
    const bridgeValues = bridgeArguments(compiled.bridgeParameters, values);
    const bridgeStatus = compiled.bridge.tagged(
      ...compiled.bridgeParameters.map(([name]) => bridgeValues[name]),
    );
    assert.equal(bridgeStatus, 0n, "live owner bridge did not publish");

    switchStage("honesty-generators-final");
    const result = candidateResult(values, bridgeValues);
    const resultSha256 = digest(result);
    const authoritySha256 = digest({
      preparedInputSha256: digest(preparedInput), resultSha256,
      attemptState: decimalPrefix(values.attempt_state, 4, "attempt state"),
      bridgeState: decimalPrefix(bridgeValues.bridge_state, 16, "bridge state"),
    });
    return {
      correspondenceComplete: false,
      result,
      replay: { status: "cold-replay-authenticated", resultSha256, authoritySha256 },
      rng: {
        seed: String(seed),
        terminal: decimalPrefix(values.prep_kummer_random_state, values.prep_kummer_random_state.length, "random state"),
      },
      work: {
        action: String(action), relations: String(values.relation_state[0]),
        hnfRank: String(values.hnf_state[1]), cleanedColumns: String(bridgeValues.bridge_state[14]),
      },
      terminalStatus: TERMINAL_STATUS,
    };
  };
}

module.exports = {
  createPreparedH1Adapter,
  runPreparedH1: createPreparedH1Adapter(),
};
