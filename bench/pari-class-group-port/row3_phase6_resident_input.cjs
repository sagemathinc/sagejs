"use strict";

// Fresh bounded owners for the generic prepared class-and-unit root on row 3.
// The only non-prepared inputs are zeroed workspaces whose shapes are public
// functions of the degree, selected factor-base ceiling and relation target.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("./resident_candidate_owner_manifest.cjs");

const SOURCE = path.join(__dirname, "resident_generated_class_attempt.py");
const ROWS = 668;
const TARGET = 675;
const RESERVE = 10 * TARGET + 50;
const DEGREE = 3;
const PLACES = 3;

function signature() {
  const source = fs.readFileSync(SOURCE, "utf8");
  const match = source.match(
    /def pari_resident_generated_class_attempt\(([\s\S]*?)\n\)/,
  );
  assert(match, "missing resident generated signature");
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

function lengths() {
  const result = {};
  for (const group of manifest.owner_groups) {
    const length = manifest.length_rules[group.length_rule].length;
    for (const name of group.owners) result[name] = length;
  }
  const rows = ROWS, columns = TARGET, reserve = RESERVE, k0 = 4;
  const size = rows * columns, square = columns * columns;
  const logs = 7 * PLACES * columns;
  Object.assign(result, {
    admission_prime_offsets: 10008, admission_prime_counts: 10008,
    admission_group_tau: 9 * rows, packet_ideals: 9 * rows,
    relation: rows, search_ideals: rows, packet_ids: rows,
    packet_norms: rows, ramification: rows, relation_primes: rows,
    admission_group_e: rows, admission_group_f: rows,
    admission_group_inert: rows, class_invariants: rows, prep_bad: rows,
    prep_sub_order: rows, prep_sub_scratch: rows, prep_sub_chosen: rows,
    prep_sub_rejected: rows, relation_basis: rows * rows,
    relation_records: rows * reserve, relation_hashes: reserve,
    relation_metadata: 3 * reserve, generators: DEGREE * reserve,
    relation_scratch: rows, log_embeddings: reserve * 7 * PLACES,
    hnf_original: size, hnf_perm: rows, hnf_mat: size,
    hnf_dense: k0 * columns, hnf_transform: square,
    hnf_vmax: columns, hnf_found: 1, hnf_sparse_state: 13,
    hnf_bottom: (rows - k0) * columns,
    hnf_updated_dense: k0 * columns, hnf_extra: size,
    hnf_cleanup_state: 10, hnf_rank_matrix: size,
    hnf_occupied: columns, hnf_rank_pivots: rows, hnf_best: rows,
    hnf_profile: rows + 1, hnf_rank_state: 10,
    hnf_perm_work: rows, hnf_matbnew: size, hnf_dep: size,
    hnf_b: size, hnf_assembly_state: 6,
    hnf_transformed_logs: logs, hnf_full_h: size,
    hnf_hnf_transform: square, hnf_lam: square,
    hnf_d: columns + 1, hnf_hnf_state: 11,
    hnf_full_dep: size, hnf_work_b: size, hnf_work_c: logs,
    hnf_diagonal: rows, hnf_result_h: size, hnf_result_dep: size,
    hnf_result_b: rows * (columns + rows), hnf_result_c: logs,
    hnf_final_state: 7, hnf_state: 9,
    hnf_cup_arena: 5_000_000, hnf_cup_frames: 64,
    hnf_cup_solve_state: 8, hnf_cup_state: 8,
  });
  return result;
}

function makeFreshInput(prepared) {
  const names = signature();
  const capacity = lengths();
  const explicit = Object.fromEntries(Object.entries(prepared).map(
    ([name, value]) => [name, structuredClone(value)]));
  const input = Object.fromEntries(names.map(([name, kind]) => {
    if (Object.hasOwn(explicit, name)) return [name, explicit[name]];
    assert(kind.endsWith("Buffer"), `unclassified scalar ${name}`);
    assert(Number.isInteger(capacity[name]) && capacity[name] >= 0,
      `unclassified owner capacity ${name}`);
    return [name, Array(capacity[name]).fill(0)];
  }));
  input.accept_inverse_hr = [-991, -992, -993];
  input.analytic_log_discriminant = [-999];
  return { input, names };
}

module.exports = { DEGREE, PLACES, RESERVE, ROWS, SOURCE, TARGET,
  lengths, makeFreshInput, signature };
