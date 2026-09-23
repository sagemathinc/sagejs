"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const SOURCE = path.join(__dirname, "row20_phase6_factor_base_root.py");
const EXPORT = "pari_row20_phase6_factor_base_root";

function signature() {
  const match = fs.readFileSync(SOURCE, "utf8").match(
    new RegExp(`def ${EXPORT}\\(([\\s\\S]*?)\\n\\) -> int:`));
  assert(match);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}
function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    const value = BigInt(raw), absolute = value < 0n ? -value : value;
    result = Math.max(result,
      Math.ceil(Math.max(1, absolute.toString(2).length) / 64));
  }
  return result;
}
function snapshot(owner) {
  if (owner.sizes && owner.limbs) {
    const sizes = owner.sizes.slice(), limbs = owner.limbs.slice();
    return () => { owner.sizes.set(sizes); owner.limbs.set(limbs); };
  }
  const values = owner.slice();
  return () => owner.set(values);
}

async function prepare(prepared) {
  const built = await compileKernel({ sourcePath: SOURCE,
    cacheRoot: "/scratch/sagejs-native-cache-row20-phase6-factor-root" });
  const fn = require(built.modulePath)[EXPORT];
  assert.equal(fn?.nativeAvailable, true);
  const runtime = prepared.admission_primes.map(Number);
  let primeCount = runtime.findIndex(value => value > 257);
  assert.notEqual(primeCount, -1); primeCount += 1;
  const primes = runtime.slice(0, primeCount), capacity = 5 * primeCount;
  const I = (length, wordCapacity = 8, values) => fn.createIntegerBuffer(
    length, Math.max(wordCapacity, words(values)),
    values === undefined ? undefined : values.map(BigInt));
  const F = length => fn.createFloat64Buffer(length);
  const owners = {
    polynomial: I(6, 8, prepared.prep_polynomial),
    basis_table: I(125, 16, prepared.basis_table),
    matrix_m: I(25, 16, prepared.admission_matrix_m),
    matrix_p: I(25, 4, prepared.admission_matrix_p),
    matrix_e: I(25, 16, prepared.admission_matrix_e),
    discriminant: BigInt(prepared.analytic_discriminant),
    equation_index: BigInt(prepared.prep_index),
    primes: I(primeCount, 2, primes), prime_count: BigInt(primeCount),
    descriptor_workspace: I(12000, 32), descriptor_scratch: I(165, 32),
    descriptor_ranks: I(5, 2), descriptor_state: I(4, 2),
    degree_scratch: I(5, 2), exponent_scratch: I(5, 2),
    factor_workspace: I(32, 8), factor_state: I(3, 2),
    pattern_offsets: I(primeCount, 2), pattern_counts: I(primeCount, 2),
    pattern_degrees: I(capacity, 2), pattern_multiplicities: I(capacity, 2),
    full_offsets: I(primeCount, 2), full_counts: I(primeCount, 2),
    full_degrees: I(capacity, 2), configuration: F(3), bound_norms: I(6, 2),
    constants_logs: F(primeCount + 2), sums: F(2), factor_logs: F(primeCount + 1),
    selected_primes: I(primeCount, 2), prime_offsets: I(258, 2),
    prime_counts: I(258, 2), complete_groups: I(258, 2),
    selected_indices: I(capacity, 2), base_state: I(8, 16),
    selected_descriptors: I(7 * 33, 32), selected_ideals: I(7 * 25, 16),
    selected_norms: I(7, 8), group_offsets: I(3, 2), group_sizes: I(3, 2),
    group_complete: I(3, 2), hnf_multiplication: I(25, 16),
    hnf_work: I(25, 16), hnf_pivots: I(5, 2), subfactor_bad: I(7, 2),
    subfactor_configuration: F(1), subfactor_order: I(7, 2),
    subfactor_scratch: I(7, 2), subfactor_stack: I(24, 2),
    subfactor_chosen: I(7, 2), subfactor_rejected: I(7, 2),
    permutation: I(7, 2), subfactor_state: I(4, 4),
    relation_primes: I(7, 2), ramification: I(7, 2),
    residue_degrees: I(7, 2), packet_generators: I(35, 8),
    admission_group_tau: I(175, 16), packet_inert: I(7, 2),
    packet_primes: I(7, 2), hnf_perm: I(7, 2), outer_perm: I(7, 2),
    hnf_subfactor: I(7, 2), resident_state: I(8, 4),
  };
  const names = signature();
  assert.deepEqual(names.map(([name]) => name), Object.keys(owners));
  const reset = Object.values(owners).filter(value => typeof value === "object")
    .map(snapshot);
  const resident = { args: names.map(([name]) => owners[name]), built, fn,
    names, owners, reset };
  return resident;
}

function bindHnfIngress(resident, invocation) {
  const aliases = {
    selected_primes: "initial_primes", selected_ideals: "packet_ideals",
    selected_norms: "packet_norms", group_offsets: "initial_offsets",
    group_sizes: "initial_counts", group_complete: "initial_complete",
    permutation: "search_ideals", relation_primes: "relation_primes",
    ramification: "ramification", residue_degrees: "admission_group_f",
    packet_generators: "packet_generators",
    admission_group_tau: "admission_group_tau", packet_inert: "packet_inert",
    packet_primes: "packet_primes", hnf_perm: "hnf_perm",
    outer_perm: "outer_perm", hnf_subfactor: "subfactor",
  };
  for (const [factorName, hnfName] of Object.entries(aliases))
    resident.owners[factorName] = invocation.values[hnfName];
  resident.args = resident.names.map(([name]) => resident.owners[name]);
  resident.reset = Object.values(resident.owners)
    .filter(value => typeof value === "object").map(snapshot);
  return resident;
}

function reset(resident) { for (const restore of resident.reset) restore(); }
function runNative(resident) { return resident.fn.gmp(...resident.args); }
function run(resident) {
  const status = runNative(resident);
  assert.equal(status, 0n);
}

module.exports = { EXPORT, SOURCE, bindHnfIngress, prepare, reset, run, runNative };
