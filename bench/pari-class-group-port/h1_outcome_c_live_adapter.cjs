"use strict";

// Standardized host adapter for the single native prepared-h=1 root. The
// native root publishes one immutable 811-cell result bundle. Independent
// cold replay deliberately remains an injected authority: this adapter must
// not turn successful native publication into a circular completion claim.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { authenticatePreparedNf } = require("./prepared_nf_authentication.cjs");

const HERE = __dirname;
const ROOT_SOURCE = path.join(HERE, "pari_unified_complete_h1_root.py");
const PREPARED_SCHEMA = "sagejs.pari-class-group/sanitized-prepared-h1-v1";
const COMPLETE_STATUS = "pari-correspondence-complete-internal-h1";
const UNAUTHENTICATED_STATUS = "native-final-publication-awaiting-cold-replay";

// Shape/resource policy, not answer data. Every length is the declared fixed
// owner shape at the prepared equal-bound root boundary.
const EXTRA_SIZES = Object.freeze({
  unified_state: 12,
  unit_transform: 32, getfu_factor: 4, compact_provenance: 32,
  cleaned_arch: 336, bridge_state: 16, u1: 32, u2: 4, first_arch: 42,
  p_triples: 18, au: 42, clean_logs: 18, signs: 6, unit_state: 5,
  unit_trace: 5, integer_state: 5, integer_basis: 32,
  integer_transform: 256, integer_gram: 256, integer_mu: 256,
  integer_mu_exponents: 256, integer_r: 256, integer_r_exponents: 256,
  integer_s: 16, integer_s_exponents: 16, integer_approximate: 32,
  integer_float_gram: 256, integer_alpha: 16, integer_column: 16,
  integer_column_exponents: 16, integer_normalized: 16, integer_temporary: 16,
  integer_dpe_scratch: 16, integer_scratch: 16, real_integers: 6,
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
  clean_stack: 1024, clean_scratch: 336, clean_state: 4, driver_state: 10,
  class_hnf_transform_inverse: 225, class_hnf_inverse_augmented: 450,
  class_hnf_inverse_state: 5, class_relation_to_presentation_scratch: 120,
  class_presentation_to_relation_scratch: 120, class_relation_witness_state: 8,
  class_presentation_scratch: 64, class_smith_scratch: 64,
  class_left_scratch: 64, class_left_inverse_scratch: 64,
  class_right_scratch: 64, class_ur_scratch: 64, class_y_scratch: 64,
  class_uir_scratch: 64, class_x_scratch: 64, class_m1_scratch: 64,
  class_m2_scratch: 64, class_invariants_scratch: 8,
  class_class_number_scratch: 1, class_smith_column_scratch: 8,
  class_right_inverse_scratch: 64, class_smith_augmented_scratch: 128,
  class_left_inverse_state: 5, class_right_inverse_state: 5,
  class_first_division_state: 6, class_second_division_state: 6,
  class_smith_state: 7, class_binding_state: 9,
  class_published_presentation: 64, class_published_smith: 64,
  class_published_left: 64, class_published_left_inverse: 64,
  class_published_right: 64, class_published_right_inverse: 64,
  class_published_relation_to_presentation: 120,
  class_published_presentation_to_relation: 120, class_published_state: 16,
  precision_kernel_relation_map: 511, precision_retained_relation_map: 146,
  precision_kernel_factors: 21, precision_exact_units_integral: 6,
  precision_exact_units_power: 6, precision_exact_norms: 2,
  precision_root_m: 6, precision_root_p: 6, precision_root_e: 6,
  precision_embedding_m: 9, precision_embedding_p: 9, precision_embedding_e: 9,
  precision_embedding_state: 4, precision_atom_logs: 1533,
  precision_transformed_logs: 42, precision_clean_scratch: 42,
  precision_clean_result: 42, precision_rebuilt_logs: 42,
  precision_phase_scratch: 6, precision_rebuilt_phases: 6,
  precision_log_cache: 3, precision_pi_cache: 3,
  precision_transcendental_a: 512, precision_transcendental_b: 512,
  precision_transcendental_p: 512, precision_transcendental_q: 512,
  precision_transcendental_stack: 128, precision_clean_state: 4,
  precision_precision_state: 5, precision_determinant_values: 12,
  precision_determinant_work: 12, precision_determinant_output: 3,
  precision_determinant_pivots: 1, precision_determinant_state: 5,
  precision_authority_state: 16, precision_resident_root_m: 3,
  precision_resident_root_p: 3, precision_resident_root_e: 3,
  precision_staged_retry_relations: 146, precision_embedding_packed: 27,
  precision_getfu_clean_logs: 18, precision_getfu_clean_phases: 6,
  precision_getfu_factor: 4, precision_getfu_matep: 18,
  precision_getfu_transformed_arch: 18, precision_getfu_transformed_clean: 18,
  precision_getfu_transformed_phases: 6, precision_getfu_exponentials: 18,
  precision_getfu_solve_work: 27, precision_getfu_solve_rhs: 18,
  precision_getfu_solved: 18, precision_getfu_rounded: 6,
  precision_getfu_multiplication: 9, precision_getfu_inverse: 3,
  precision_getfu_candidate_units: 6, precision_getfu_normalized_factor: 4,
  precision_staged_getfu_units: 6, precision_staged_getfu_logs: 18,
  precision_staged_getfu_phases: 6, precision_staged_getfu_factor: 4,
  precision_getfu_state: 8, precision_getfu_pivots: 3,
  precision_getfu_exp_cache: 512, precision_getfu_exp_a: 512,
  precision_getfu_exp_b: 512, precision_getfu_exp_p: 512,
  precision_getfu_exp_q: 512, precision_getfu_exp_stack: 128,
  precision_retry_state: 6, precision_published_retained_relations: 146,
  precision_published_logs: 18, precision_published_phases: 6,
  torsion_order: 1, torsion_generator: 3, torsion_state: 6,
  final_polynomial: 4, final_presentation: 64, final_smith: 64,
  final_left: 64, final_left_inverse: 64, final_right: 64,
  final_right_inverse: 64, final_relation_to_presentation: 120,
  final_presentation_to_relation: 120, final_compact_provenance: 14,
  final_retained_relation_map: 146, final_exact_units: 6,
  final_exact_norms: 2, final_regulator: 3, final_torsion_order: 1,
  final_torsion_generator: 3, final_invariants: 8, final_state: 16,
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

function values(value) {
  return Array.isArray(value) ? value : value.toArray ? value.toArray() : Array.from(value);
}

function decimalOwner(value) {
  return values(value).map(entry => String(entry));
}

function buildRootArguments(specification, preparedInput, fn, precisionResourceCap) {
  const result = {};
  const preparedKinds = new Map(preparedInput.names);
  for (const [name, kind] of specification) {
    if (preparedKinds.has(name)) {
      assert.equal(kind, preparedKinds.get(name), `prepared kind changed for ${name}`);
      result[name] = owner(preparedInput.input[name], kind, name);
      continue;
    }
    if (name === "precision_resource_cap") {
      result[name] = BigInt(precisionResourceCap);
      continue;
    }
    assert(Object.hasOwn(EXTRA_SIZES, name), `missing complete-root owner shape: ${name}`);
    const initial = Array(EXTRA_SIZES[name]).fill(kind === "Float64Buffer" ? 0 : 0n);
    if (kind === "IntegerBuffer" &&
        (name.startsWith("precision_") || name.startsWith("final_")) &&
        typeof fn.createIntegerBuffer === "function") {
      result[name] = fn.createIntegerBuffer(initial.length, 128, initial);
    } else result[name] = initial;
  }
  return result;
}

function standardizedResult(argumentsByName, preparedAuthority) {
  const finalState = decimalOwner(argumentsByName.final_state);
  assert.deepEqual(finalState, [
    "0", "0", "0", "0", "0", "0", "73", "8",
    "1", "0", "2", "2", "1", "811", "1", "0",
  ], "native root did not atomically publish the audited H1 bundle");
  const invariantCount = Number(finalState[9]);
  assert(Number.isSafeInteger(invariantCount) && invariantCount >= 0);
  const exactUnits = decimalOwner(argumentsByName.final_exact_units);
  return {
    schema: "sagejs.pari-class-group/prepared-h1-internal-result-v2",
    field: "pari-2.17.4:x^3-20018*x+20034",
    polynomial: decimalOwner(argumentsByName.final_polynomial),
    classGroup: {
      classNumber: finalState[8],
      invariantFactors: decimalOwner(argumentsByName.final_invariants).slice(0, invariantCount),
      generators: [],
    },
    units: {
      rank: finalState[10],
      integralCoordinates: [exactUnits.slice(0, 3), exactUnits.slice(3, 6)],
      norms: decimalOwner(argumentsByName.final_exact_norms),
      regulatorBall: decimalOwner(argumentsByName.final_regulator),
    },
    torsion: {
      order: decimalOwner(argumentsByName.final_torsion_order)[0],
      generator: decimalOwner(argumentsByName.final_torsion_generator),
    },
    correspondence: {
      presentation: decimalOwner(argumentsByName.final_presentation),
      smith: decimalOwner(argumentsByName.final_smith),
      left: decimalOwner(argumentsByName.final_left),
      leftInverse: decimalOwner(argumentsByName.final_left_inverse),
      right: decimalOwner(argumentsByName.final_right),
      rightInverse: decimalOwner(argumentsByName.final_right_inverse),
      relationToPresentation: decimalOwner(argumentsByName.final_relation_to_presentation),
      presentationToRelation: decimalOwner(argumentsByName.final_presentation_to_relation),
      compactProvenance: decimalOwner(argumentsByName.final_compact_provenance),
      retainedRelationMap: decimalOwner(argumentsByName.final_retained_relation_map),
      finalState,
    },
    assumptions: {
      pari2174AlgorithmicCorrespondence: true,
      grhAndPariHeuristicBounds: true,
      publicClassUnitComplete: false,
      preparedNfAuthoritySha256: preparedAuthority.sha256,
    },
  };
}

function validateReplay(replay, result) {
  assert(replay && typeof replay === "object" && !Array.isArray(replay),
    "cold replay hook must return a record");
  assert.deepEqual(Object.keys(replay).sort(),
    ["authoritySha256", "resultSha256", "status"],
    "cold replay record has unexpected fields");
  assert.equal(replay.status, "cold-replay-authenticated");
  assert.equal(replay.resultSha256, digest(result), "cold replay is detached from result");
  assert.match(replay.authoritySha256, /^[0-9a-f]{64}$/);
  return replay;
}

function replayOwnerView(argumentsByName) {
  // Borrowed read-only views. The replay hook must synchronously capture the
  // logical prefixes it needs before this invocation returns.
  const names = [
    "final_state", "final_polynomial", "final_presentation", "final_smith",
    "final_left", "final_left_inverse", "final_right", "final_right_inverse",
    "final_relation_to_presentation", "final_presentation_to_relation",
    "final_compact_provenance", "final_retained_relation_map", "final_exact_units",
    "final_exact_norms", "final_regulator", "final_torsion_order",
    "final_torsion_generator", "final_invariants", "prep_polynomial", "prep_zk",
    "basis_table", "packet_ideals", "packet_norms", "relation_records",
    "generators", "relation_hashes", "relation_metadata", "hnf_transform",
    "search_ideals", "log_embeddings", "hnf_matbnew",
    "hnf_full_h", "hnf_hnf_transform", "hnf_result_c",
    "state", "inc", "cursor_output", "progress", "schedule",
    "prep_kummer_random_state", "class_ur_scratch", "class_y_scratch",
    "class_uir_scratch", "class_x_scratch", "class_m2_scratch",
    "precision_getfu_factor", "precision_exact_units_integral",
    "precision_published_logs", "precision_published_phases",
    "precision_determinant_state", "precision_authority_state",
    "precision_retry_state", "accept_acceptance_state",
    "accept_reconstruction_state", "attempt_state", "unified_state",
    "class_published_state", "bridge_state", "torsion_state",
  ];
  return Object.freeze(Object.fromEntries(names.map(name => {
    assert(Object.hasOwn(argumentsByName, name), `missing replay owner: ${name}`);
    return [name, argumentsByName[name]];
  })));
}

function createPreparedH1Adapter({ compiler, authenticateFinalPublication,
  authenticatePreparedInput = authenticatePreparedNf, precisionResourceCap = 4096 } = {}) {
  compiler ||= options => require("../../tools/native-kernel/compiler.cjs").compileKernel(options);
  assert(Number.isSafeInteger(precisionResourceCap) && precisionResourceCap >= 192);
  let kernelPromise;
  const preparedStates = new WeakSet();
  async function kernel() {
    if (!kernelPromise) kernelPromise = compiler({ sourcePath: ROOT_SOURCE }).then(built => {
      const source = fs.readFileSync(ROOT_SOURCE, "utf8");
      const specification = parameters(source, "pari_unified_complete_h1_root");
      const fn = require(built.modulePath).pari_unified_complete_h1_root;
      assert.equal(typeof fn.gmp, "function", "complete H1 root lacks GMP entry");
      return { fn, specification };
    });
    return kernelPromise;
  }

  async function preparePreparedH1({ implementation, preparedInput }) {
    assert.equal(implementation, "sagejs", "live adapter only implements Sage.js");
    assert.equal(preparedInput.schema, PREPARED_SCHEMA, "prepared input was not sanitized");
    assert.equal(preparedInput.names.length, 351, "prepared owner ABI changed");
    const compiled = await kernel();
    assert.deepEqual(compiled.specification.slice(0, 351), preparedInput.names,
      "prepared owner ABI changed");
    const preparedAuthority = authenticatePreparedInput(preparedInput.input);
    assert(preparedAuthority && typeof preparedAuthority === "object");
    assert.match(preparedAuthority.sha256, /^[0-9a-f]{64}$/,
      "prepared-field authority is not digest-bound");
    const state = Object.freeze({
      schema: "sagejs.pari-class-group/authenticated-prepared-h1-state-v1",
      fieldId: preparedInput.fieldId,
      namesSha256: digest(preparedInput.names),
      preparedAuthority,
    });
    preparedStates.add(state);
    return state;
  }

  async function runPreparedH1({ implementation, seed, preparedInput, preparedState, switchStage }) {
    assert.equal(implementation, "sagejs", "live adapter only implements Sage.js");
    assert.equal(typeof switchStage, "function");
    assert.equal(preparedInput.schema, PREPARED_SCHEMA, "prepared input was not sanitized");
    assert.equal(preparedInput.names.length, 351, "prepared owner ABI changed");
    const compiled = await kernel();
    assert.deepEqual(compiled.specification.slice(0, 351), preparedInput.names,
      "prepared owner ABI changed");
    let preparedAuthority;
    if (preparedState !== undefined) {
      assert(preparedStates.has(preparedState), "prepared state did not originate at this adapter");
      assert.equal(preparedState.fieldId, preparedInput.fieldId, "prepared field identity changed");
      assert.equal(preparedState.namesSha256, digest(preparedInput.names), "prepared owner ABI changed");
      preparedAuthority = preparedState.preparedAuthority;
    } else preparedAuthority = authenticatePreparedInput(preparedInput.input);
    assert(preparedAuthority && typeof preparedAuthority === "object");
    assert.match(preparedAuthority.sha256, /^[0-9a-f]{64}$/,
      "prepared-field authority is not digest-bound");
    const argumentsByName = buildRootArguments(
      compiled.specification, preparedInput, compiled.fn, precisionResourceCap,
    );
    const status = compiled.fn.gmp(...compiled.specification.map(([name]) => argumentsByName[name]));
    assert.equal(status, 0n, "unified complete H1 root did not succeed");
    const result = standardizedResult(argumentsByName, preparedAuthority);
    const resultSha256 = digest(result);
    let replay = {
      status: "cold-replay-required",
      resultSha256,
      authoritySha256: digest({ resultSha256, status: "cold-replay-required" }),
    };
    let correspondenceComplete = false;
    if (authenticateFinalPublication !== undefined) {
      const publication = Object.freeze({
        rootStatus: String(status), preparedAuthority,
        result: structuredClone(result), resultSha256,
        replayOwners: replayOwnerView(argumentsByName),
      });
      replay = validateReplay(await authenticateFinalPublication(publication), result);
      correspondenceComplete = true;
    }
    const finalState = decimalOwner(argumentsByName.final_state);
    const precisionState = decimalOwner(argumentsByName.precision_authority_state);
    return {
      correspondenceComplete,
      result,
      replay,
      rng: { seed: String(seed), terminal: decimalOwner(argumentsByName.prep_kummer_random_state) },
      work: {
        nativeStatus: String(status), relations: finalState[6], hnfRank: finalState[7],
        precisionAttempts: precisionState[1], retryPrecision: precisionState[2],
        publishedCells: finalState[13],
      },
      terminalStatus: correspondenceComplete ? COMPLETE_STATUS : UNAUTHENTICATED_STATUS,
    };
  }
  runPreparedH1.preparePreparedH1 = preparePreparedH1;
  return runPreparedH1;
}

const defaultRunPreparedH1 = createPreparedH1Adapter();
module.exports = {
  COMPLETE_STATUS,
  OWNER_SHAPES: EXTRA_SIZES,
  UNAUTHENTICATED_STATUS,
  createPreparedH1Adapter,
  digest,
  preparePreparedH1: defaultRunPreparedH1.preparePreparedH1,
  runPreparedH1: defaultRunPreparedH1,
  stageMode: "whole-root-only",
};
