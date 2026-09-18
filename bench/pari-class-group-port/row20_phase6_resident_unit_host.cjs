"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const SOURCE = path.join(__dirname, "row20_phase6_resident_unit_root.py");
const EXPORT = "pari_row20_phase6_resident_unit_root";

function signature() {
  const match = fs.readFileSync(SOURCE, "utf8").match(
    new RegExp(`def ${EXPORT}\\(([\\s\\S]*?)\\n\\) -> int:`));
  assert(match, "missing row-20 resident unit signature");
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

function integer(fn, length, capacity = 32, values) {
  return fn.createIntegerBuffer(length, capacity,
    values === undefined ? undefined : values.map(BigInt));
}
function int64(fn, length) { return fn.createInt64Buffer(length); }
function float64(fn, length) { return fn.createFloat64Buffer(length); }
function strings(owner, length = owner.length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);
}

async function prepare(prepared) {
  const built = await compileKernel({ sourcePath: SOURCE,
    cacheRoot: "/scratch/sagejs-native-cache-row20-phase6-unit" });
  const fn = require(built.modulePath)[EXPORT];
  assert(fn?.nativeAvailable, "row-20 resident unit root is unavailable");
  const sizes = {
    u1: 14, integer_state: 5, lll_basis: 14, lll_transform: 49,
    lll_gram: 49, lll_mu: 49, lll_mu_exponents: 49, lll_r: 49,
    lll_r_exponents: 49, lll_s: 7, lll_s_exponents: 7,
    lll_approximate: 14, lll_float_gram: 49, lll_alpha: 7,
    lll_column: 7, lll_column_exponents: 7, lll_normalized: 7,
    lll_temporary: 7, lll_dpe_scratch: 7, lll_integer_scratch: 7,
    first_logs: 42, triples: 18, factor: 4, real_integers: 6,
    real_form: 3, real_state: 2, composed: 14, transformed_logs: 42,
    clean_scratch: 42, clean: 42, clean_state: 6, matep: 42, arch: 42,
    candidate_a: 42, arch_real: 18, arch_imag: 18, clean_real: 18,
    clean_imag: 18, embedding_real: 45, embedding_imag: 45,
    exponential_real: 18, exponential_imag: 18, split_matrix: 75,
    split_rhs: 30, solve_work: 75, solve_rhs: 30, solved: 30,
    rounded: 10, multiplication: 25, inverse: 5, candidate_units: 10,
    output_units: 10, output_logs_real: 18, output_logs_imag: 18,
    getfu_state: 8, pivots: 5, exp_cache: 3, pi_cache: 3,
    arithmetic_a: 512, arithmetic_b: 512, arithmetic_p: 512,
    arithmetic_q: 512, arithmetic_stack: 91, resident_state: 8,
  };
  const int64Names = new Set(["clean_state", "getfu_state", "pivots",
    "resident_state"]);
  const floatNames = new Set(["lll_mu", "lll_r", "lll_s",
    "lll_approximate", "lll_float_gram", "lll_normalized",
    "lll_temporary", "lll_dpe_scratch"]);
  const values = {};
  for (const [name] of signature()) {
    if (["exact_logs", "relation_lattice", "regulator"].includes(name)) continue;
    if (name === "embedding_m") values[name] = integer(fn, 25, 32,
      prepared.admission_matrix_m);
    else if (name === "embedding_p") values[name] = integer(fn, 25, 32,
      prepared.admission_matrix_p);
    else if (name === "embedding_e") values[name] = integer(fn, 25, 32,
      prepared.admission_matrix_e);
    else if (name === "multiplication_tensor") values[name] = integer(fn, 125,
      32, prepared.basis_table);
    else if (int64Names.has(name)) values[name] = int64(fn, sizes[name]);
    else if (floatNames.has(name)) values[name] = float64(fn, sizes[name]);
    else values[name] = integer(fn, sizes[name], 64);
  }
  return { built, fn, names: signature(), values };
}

function run(resident, hnf, acceptance) {
  assert.equal(hnf.status, 0);
  assert.equal(acceptance.status, 0);
  const inputs = { ...resident.values,
    exact_logs: hnf.values.hnf_result_c,
    relation_lattice: acceptance.values.relations,
    regulator: acceptance.values.regulator };
  const status = resident.fn.gmp(...resident.names.map(([name]) => inputs[name]));
  const summary = {
    status: Number(status),
    units: strings(inputs.output_units, 10),
    transform: strings(inputs.composed, 14),
    factor: strings(inputs.factor, 4),
    integerState: strings(inputs.integer_state, 5),
    cleanState: Array.from(inputs.clean_state, Number),
    getfuState: Array.from(inputs.getfu_state, Number),
    residentState: Array.from(inputs.resident_state, Number),
  };
  assert.equal(summary.status, 0, `row-20 resident unit root failed: ${JSON.stringify(summary)}`);
  assert.equal(summary.getfuState[6], 2, "row-20 resident unit count changed");
  return summary;
}

module.exports = { EXPORT, SOURCE, prepare, run };
