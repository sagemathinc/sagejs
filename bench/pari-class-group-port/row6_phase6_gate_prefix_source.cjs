"use strict";

// Generate the connected prepared factor/initial/collector/first-HNF root.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const prefix = require("./row6_phase6_prepared_prefix_source.cjs");
const { ROW6_PREPARED_LAYOUT } = require(
  "./row6_phase6_whole_prepared_layout.cjs");

const ROOT = "pari_row6_phase6_gate_prefix_root";
const PREFIX = "pari_row6_phase6_prepared_prefix_root";
const FACTOR = "pari_row6_prepared_factor_base_root";
const INITIAL = "pari_row6_prepared_initial_relations";
const COLLECTOR = "pari_collect_and_log_relations";
const HNF = "pari_hnfspec_complete";
const NEXT = "pari_row14_prepare_next_pass";
const APPEND = "pari_hnfadd";
const ANCESTRY = "pari_row6_phase6_gate_ancestry_private";
const WORKSPACE_LIMIT_BYTES = ROW6_PREPARED_LAYOUT.storagePlan.nativeWorkspaceBytes;

function signature(file, name) {
  const source = fs.readFileSync(path.join(__dirname, file), "utf8");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\) -> (?:int|int64):`));
  assert(match, `missing ${name}`);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

const COLLECTOR_ALIASES = Object.freeze({
  admission_embedding_m: "factor_embedding_m",
  admission_embedding_p: "factor_embedding_p",
  admission_embedding_e: "factor_embedding_e",
  admission_primes: "factor_runtime_primes",
  admission_products: "factor_runtime_products",
  admission_factor_product: "int(factor_base_state[6])",
  admission_factorlimit: "factor_factor_limit",
  admission_prime_limit: "factor_prime_limit",
  admission_group_tau: "integer_buffer_view(factor_selected_tau, 0, factor_count * 9)",
  admission_group_e: "integer_buffer_view(factor_ramification, 0, factor_count)",
  admission_group_f: "integer_buffer_view(factor_residue_degrees, 0, factor_count)",
  admission_group_inert: "integer_buffer_view(factor_inert_flags, 0, factor_count)",
  subfactor: "integer_buffer_view(factor_subfactor, 0, 4)",
  relation_primes: "integer_buffer_view(factor_relation_primes, 0, factor_count)",
  ramification: "integer_buffer_view(factor_ramification, 0, factor_count)",
  relation_state: "initial_relation_state",
  relation_basis: "integer_buffer_view(initial_relation_basis, 0, factor_count * factor_count)",
  relation_records: "integer_buffer_view(initial_relation_records, 0, relation_capacity * factor_count)",
  relation_hashes: "integer_buffer_view(initial_relation_hashes, 0, relation_capacity)",
  relation_metadata: "integer_buffer_view(initial_relation_metadata, 0, relation_capacity * 3)",
  relation: "integer_buffer_view(initial_relation, 0, factor_count)",
  relation_scratch: "integer_buffer_view(initial_relation_scratch, 0, factor_count)",
  generators: "integer_buffer_view(initial_relation_generators, 0, relation_capacity * 3)",
  search_ideals: "integer_buffer_view(factor_permutation, 0, factor_count)",
  packet_ideals: "integer_buffer_view(factor_packet_ideals, 0, factor_count * 9)",
  packet_norms: "integer_buffer_view(factor_packet_norms, 0, factor_count)",
  basis_table: "factor_basis_table",
  packet_primes: "integer_buffer_view(factor_relation_primes, 0, factor_count)",
  packet_inert: "integer_buffer_view(factor_inert_flags, 0, factor_count)",
  outer_minidx: "integer_buffer_view(factor_minidx, 0, factor_count)",
});

const HNF_ALIASES = Object.freeze({
  original: "gate_initial_hnf_original",
  perm: "gate_initial_hnf_perm",
  logs: "gate_log_embeddings",
});
const OMITTED_LOGICAL_INPUTS = new Set(["rows", "columns", "k0", "log_rows"]);

const HNF_INTEGER_LENGTHS = Object.freeze({
  dense: "initial_k0 * initial_columns",
  transform: "initial_columns * initial_columns",
  bottom: "(factor_count - initial_k0) * initial_columns",
  updated_dense: "initial_k0 * initial_columns",
  extra: "factor_count * initial_columns",
  rank_matrix: "factor_count * initial_columns",
  occupied: "initial_columns",
  pivots: "factor_count",
  best: "factor_count",
  profile: "factor_count + 1",
  rank_state: "10",
  matbnew: "factor_count * initial_columns",
  dep: "factor_count * initial_columns",
  b: "factor_count * initial_columns",
  transformed_logs: "log_stride * initial_columns",
  full_h: "factor_count * initial_columns",
  hnf_transform: "initial_columns * initial_columns",
  lam: "initial_columns * initial_columns",
  d: "initial_columns + 1",
  full_dep: "factor_count * initial_columns",
  work_b: "factor_count * initial_columns",
  work_c: "log_stride * initial_columns",
  result_h: "factor_count * initial_columns",
  result_dep: "factor_count * initial_columns",
  result_b: "factor_count * (initial_columns + factor_count)",
  result_c: "log_stride * initial_columns",
  cup_arena: "8_000_000",
  cup_frames: "64",
});

function hnfWords(name) {
  if (["transform", "full_h", "hnf_transform", "lam", "d", "full_dep",
    "work_b"].includes(name)) return 16;
  if (["transformed_logs", "work_c", "result_c"].includes(name)) return 8;
  if (["cup_arena", "cup_frames"].includes(name)) return 2;
  return 6;
}

const APPEND_INTEGER_LENGTHS = Object.freeze({
  top: "append_lig_ceiling * 8",
  exact_product: "append_lig_ceiling * 8",
  log_product: "log_stride * 8",
  adjusted_logs: "log_stride * 8",
  joined: "append_lig_ceiling * append_width_ceiling",
  joined_logs: "log_stride * relation_target",
  rank_matrix: "append_lig_ceiling * append_width_ceiling",
  occupied: "append_width_ceiling",
  pivots: "append_lig_ceiling",
  best: "append_lig_ceiling",
  profile: "append_lig_ceiling",
  rank_state: "10",
  matb: "append_lig_ceiling * append_width_ceiling",
  new_dep: "append_lig_ceiling * append_width_ceiling",
  permuted_b: "append_lig_ceiling * factor_count",
  full_h: "append_lig_ceiling * append_width_ceiling",
  transform: "append_width_ceiling * append_width_ceiling",
  lam: "append_width_ceiling * append_width_ceiling",
  d: "append_width_ceiling + 1",
  full_dep: "append_lig_ceiling * append_width_ceiling",
  work_b: "append_lig_ceiling * factor_count",
  work_c: "log_stride * relation_target",
  final_c: "log_stride * relation_target",
  result_h: "append_lig_ceiling * append_lig_ceiling",
  result_dep: "append_lig_ceiling * append_lig_ceiling",
  result_b: "append_lig_ceiling * factor_count",
  result_c: "log_stride * relation_target",
});
const APPEND_REUSABLE_INTEGER = new Set([
  "top", "exact_product", "log_product", "adjusted_logs", "joined",
  "joined_logs", "rank_matrix", "occupied", "pivots", "best", "profile",
  "matb", "new_dep", "lam", "d", "work_b", "work_c", "final_c",
]);

function workspaceAccounting({ factorCount, initialColumns, initialK0,
  initialBColumns, initialReverseLig, initialReverseTail, places,
  relationTarget }) {
  const values = {
    factor_count: factorCount,
    initial_columns: initialColumns,
    initial_k0: initialK0,
    log_stride: 7 * places,
    relation_target: relationTarget,
    append_lig_ceiling: factorCount - initialBColumns,
    append_width_ceiling: 24,
  };
  const length = expression => Function(...Object.keys(values),
    `"use strict"; return ${expression};`)(...Object.values(values));
  let hnf = 0;
  for (const [name, expression] of Object.entries(HNF_INTEGER_LENGTHS))
    hnf += length(expression) * (4 + 8 * hnfWords(name));
  let append = 0;
  for (const [name, expression] of Object.entries(APPEND_INTEGER_LENGTHS))
    append += length(expression) * (4 + 8 * 16) *
      (APPEND_REUSABLE_INTEGER.has(name) ? 1 : 2);
  const ancestry = 4 * relationTarget * (4 + 8 * 64) +
    Math.max(initialReverseLig * initialReverseTail, 16 * factorCount) *
      (4 + 8 * 32);
  const total = hnf + append + ancestry;
  return Object.freeze({ ancestry, append, hnf,
    limit: WORKSPACE_LIMIT_BYTES, total });
}

function generate() {
  const prefixSig = signature("row6_phase6_prepared_prefix_root.generated.py", PREFIX);
  const factorSig = signature("row6_prepared_factor_base_root.py", FACTOR);
  const initialSig = signature("row6_prepared_initial_relations.py", INITIAL);
  const collectorSig = signature("collected_log_embeddings.py", COLLECTOR);
  const hnfSig = signature("hnfspec_complete.py", HNF);
  const appendSig = signature("hnfadd.py", APPEND);
  const appendBorrowed = new Set(["h", "dep", "b", "logs", "perm", "new_logs"]);
  const lines = [
    '\"\"\"Connected row-6 prepared prefix through the first genuine HNF.\"\"\"',
    "",
    "from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, NativeWorkspaceArena, checked_int64, diagnostic_stage_switch, integer_buffer_view, native, uint64",
    `from .row6_prepared_factor_base_root import ${FACTOR}`,
    `from .row6_prepared_initial_relations import ${INITIAL}`,
    `from .collected_log_embeddings import ${COLLECTOR}`,
    `from .hnfspec_complete import ${HNF}`,
    `from .row14_next_pass import ${NEXT}`,
    `from .hnfadd import ${APPEND}`,
    `from .row6_phase6_gate_ancestry_private import ${ANCESTRY}`,
    "", "", "@native", `def ${ROOT}(`,
  ];
  for (const [name, kind] of prefixSig) lines.push(`    ${name}: ${kind},`);
  for (const [name, kind] of collectorSig) {
    if (!COLLECTOR_ALIASES[name] && name !== "scalar_prefix_count")
      lines.push(`    gate_${name}: ${kind},`);
  }
  for (const [name, kind] of hnfSig) {
    if (OMITTED_LOGICAL_INPUTS.has(name) || name === "logs") continue;
    if (kind === "IntegerBuffer") continue;
    if (!HNF_ALIASES[name]) lines.push(`    gate_initial_hnf_${name}: ${kind},`);
    else lines.push(`    ${HNF_ALIASES[name]}: ${kind},`);
  }
  lines.push("    gate_next_control: Int64Buffer,");
  for (const step of [1, 2]) for (const [name, kind] of appendSig) {
    if (kind.endsWith("Buffer") && kind !== "IntegerBuffer" &&
        !appendBorrowed.has(name))
      lines.push(`    gate_append${step}_${name}: ${kind},`);
  }
  for (const [name, kind] of [
    ["perm1", "Int64Buffer"], ["perm2", "Int64Buffer"],
    ["raw_to_all", "IntegerBuffer"],
    ["accepted_arch", "IntegerBuffer"],
    ["accepted_signs", "Int64Buffer"], ["phase_pi", "IntegerBuffer"],
    ["active_rows", "Int64Buffer"], ["state", "Int64Buffer"],
  ]) lines.push(`    gate_ancestry_${name}: ${kind},`);
  lines.push(
    "    gate_final_h: IntegerBuffer,",
    "    gate_final_b: IntegerBuffer,",
    "    gate_final_c: IntegerBuffer,",
  );
  lines.push(
    ") -> int:",
    '    \"\"\"Run the authenticated prefix, relation pass, logs and first HNF.\"\"\"',
    "    diagnostic_stage_switch(0)",
    `    count = ${FACTOR}(`,
  );
  for (const [name] of factorSig) lines.push(`        factor_${name},`);
  lines.push(
    "    )",
    "    factor_count = int(factor_root_state[3])",
    "    rational_group_count = int(factor_root_state[4])",
    "    if count != factor_count or factor_count < 1:",
    "        return 11",
    "    unit_rank = factor_real_places + factor_complex_pairs - 1",
    "    relation_target = factor_count + 5 + unit_rank",
    "    relation_capacity = 10 * relation_target + 50",
  );
  const initialAliases = {
    polynomial: "factor_polynomial", discriminant: "factor_discriminant",
    real_places: "factor_real_places", complex_pairs: "factor_complex_pairs",
    precision: "factor_precision", equation_index: "factor_equation_index",
    factor_state: "factor_root_state", random_state: "factor_random_state",
    rational_primes: "integer_buffer_view(factor_initial_primes, 0, rational_group_count)",
    group_offsets: "integer_buffer_view(factor_initial_offsets, 0, rational_group_count)",
    group_counts: "integer_buffer_view(factor_initial_counts, 0, rational_group_count)",
    group_complete: "integer_buffer_view(factor_initial_complete, 0, rational_group_count)",
    ramification: "integer_buffer_view(factor_ramification, 0, factor_count)",
    relation_basis: "integer_buffer_view(initial_relation_basis, 0, factor_count * factor_count)",
    relation_records: "integer_buffer_view(initial_relation_records, 0, relation_capacity * factor_count)",
    relation_hashes: "integer_buffer_view(initial_relation_hashes, 0, relation_capacity)",
    relation_metadata: "integer_buffer_view(initial_relation_metadata, 0, relation_capacity * 3)",
    relation: "integer_buffer_view(initial_relation, 0, factor_count)",
    relation_scratch: "integer_buffer_view(initial_relation_scratch, 0, factor_count)",
    relation_generators: "integer_buffer_view(initial_relation_generators, 0, relation_capacity * 3)",
  };
  lines.push(`    initial_count = ${INITIAL}(`);
  for (const [name] of initialSig) {
    const expression = initialAliases[name] || `initial_${name}`;
    lines.push(`        ${expression},`);
  }
  lines.push(
    "    )",
    "    if initial_count < 1:",
    "        return 12",
    "    log_stride = 7 * (factor_real_places + factor_complex_pairs)",
    "    initial_k0 = int(factor_root_state[7])",
    `    with NativeWorkspaceArena(${WORKSPACE_LIMIT_BYTES}) as gate_workspace:`,
  );
  const workspaceBodyStart = lines.length;
  lines.push(
    "    gate_ancestry_current = gate_workspace.integer_buffer(uint64(relation_target), 64)",
    "    gate_ancestry_old = gate_workspace.integer_buffer(uint64(relation_target), 64)",
    "    gate_ancestry_joined = gate_workspace.integer_buffer(uint64(relation_target), 64)",
    "    gate_ancestry_work = gate_workspace.integer_buffer(uint64(relation_target), 64)",
  );
  // Derive every factor/relation-dependent collector table and logical count
  // from states produced in this invocation.  The host supplies only zeroed
  // storage ceilings plus authenticated prepared-number-field inputs.
  lines.push(
    "    for i in range(19):",
    "        gate_outer_state[i] = 0",
    "    gate_outer_state[0] = relation_target - initial_count",
    "    gate_outer_state[1] = int(factor_root_state[7])",
    "    gate_outer_state[4] = factor_count + 1",
    "    for i in range(len(gate_admission_prime_offsets)):",
    "        gate_admission_prime_offsets[i] = -1",
    "        gate_admission_prime_counts[i] = 0",
    "    for i in range(rational_group_count):",
    "        prime = int(factor_initial_primes[i])",
    "        gate_admission_prime_offsets[prime] = factor_initial_offsets[i]",
    "        gate_admission_prime_counts[prime] = factor_initial_counts[i]",
    "    for i in range(factor_count):",
    "        gate_packet_ids[i] = i + 1",
    "        descriptor = int(factor_selected_indices[i])",
    "        gate_packet_generators[3 * i] = factor_catalog_generators[3 * descriptor]",
    "        gate_packet_generators[3 * i + 1] = factor_catalog_generators[3 * descriptor + 1]",
    "        gate_packet_generators[3 * i + 2] = factor_catalog_generators[3 * descriptor + 2]",
    "        gate_outer_perm[i] = factor_permutation[i]",
    "    diagnostic_stage_switch(1)",
    `    status = ${COLLECTOR}(`,
  );
  for (const [name] of collectorSig) {
    const expression = name === "scalar_prefix_count" ? "initial_count" :
      name === "search_count" ? "factor_count" :
      name === "packet_ids" ?
        "integer_buffer_view(gate_packet_ids, 0, factor_count)" :
      (COLLECTOR_ALIASES[name] || `gate_${name}`);
    lines.push(`        ${expression},`);
  }
  lines.push(
    "    )",
    "    if status != 0 and status != 1:",
    "        return 20 + status",
    "    if initial_relation_state[0] != gate_log_completed[0]:",
    "        return 30",
    "    initial_columns = int(initial_relation_state[0])",
  );
  for (const [name, kind] of hnfSig) {
    if (kind !== "IntegerBuffer" || HNF_ALIASES[name]) continue;
    const length = HNF_INTEGER_LENGTHS[name];
    assert(length, `missing arena HNF length ${name}`);
    lines.push(`    gate_initial_hnf_${name} = gate_workspace.integer_buffer(uint64(${length}), ${hnfWords(name)})`);
  }
  lines.push(
    "    for i in range(factor_count * initial_columns):",
    "        gate_initial_hnf_original[i] = int(initial_relation_records[i])",
    "    for i in range(factor_count):",
    "        gate_initial_hnf_perm[i] = int(factor_permutation[i])",
    "    diagnostic_stage_switch(2)",
    `    status = ${HNF}(`,
  );
  for (const [name] of hnfSig) {
    let expression = HNF_ALIASES[name] || `gate_initial_hnf_${name}`;
    if (name === "rows") expression = "factor_count";
    if (name === "columns") expression = "int(initial_relation_state[0])";
    else if (name === "k0") expression = "int(factor_root_state[7])";
    else if (name === "log_rows")
      expression = "factor_real_places + factor_complex_pairs";
    if (OMITTED_LOGICAL_INPUTS.has(name))
      expression = `checked_int64(${expression})`;
    lines.push(`        ${expression},`);
  }
  lines.push(
    "    )",
    "    if status != 0:",
    "        return 40 + status",
    "    append_lig_ceiling = factor_count - int(gate_initial_hnf_state[2])",
    "    initial_reverse_lig = int(gate_initial_hnf_assembly_state[0]) + int(gate_initial_hnf_assembly_state[1])",
    "    initial_reverse_tail = int(gate_initial_hnf_assembly_state[4])",
    "    if append_lig_ceiling < 1 or append_lig_ceiling > 16:",
    "        return 49",
    "    if initial_reverse_lig < 1 or initial_reverse_lig > factor_count:",
    "        return 50",
    "    if initial_reverse_tail < 0 or initial_reverse_tail > factor_count:",
    "        return 50",
    "    if int(gate_initial_hnf_state[0]) < 1 or int(gate_initial_hnf_state[0]) > 16:",
    "        return 51",
    "    ancestry_trailing_length = initial_reverse_lig * initial_reverse_tail",
    "    if ancestry_trailing_length < 16 * factor_count:",
    "        ancestry_trailing_length = 16 * factor_count",
    "    gate_ancestry_trailing_work = gate_workspace.integer_buffer(",
    "        uint64(ancestry_trailing_length), 32",
    "    )",
    "    append_width_ceiling = 24",
  );
  for (const [name, kind] of appendSig) {
    if (kind !== "IntegerBuffer" || appendBorrowed.has(name)) continue;
    const length = APPEND_INTEGER_LENGTHS[name];
    assert(length, `missing arena append length ${name}`);
    if (APPEND_REUSABLE_INTEGER.has(name)) {
      lines.push(`    gate_append_${name} = gate_workspace.integer_buffer(uint64(${length}), 16)`);
    } else {
      for (const step of [1, 2])
        lines.push(`    gate_append${step}_${name} = gate_workspace.integer_buffer(uint64(${length}), 16)`);
    }
  }
  lines.push(
    "    for i in range(factor_count):",
    "        gate_ancestry_perm1[i] = gate_initial_hnf_perm[i]",
    "    initial_relation_state[4] = initial_columns",
    "    squash = 0",
    "    checkpoint = 0",
    "    diagnostic_stage_switch(3)",
    "    for pass_index in range(13):",
    "        if checkpoint == 0:",
    "            current_h_rows = int(gate_initial_hnf_state[0])",
    "            current_b_columns = int(gate_initial_hnf_state[2])",
    "            current_total = int(gate_initial_hnf_state[7])",
    "        else:",
    "            current_h_rows = int(gate_append1_state[0])",
    "            current_b_columns = int(gate_append1_state[2])",
    "            current_total = int(gate_append1_state[7])",
    "        need = factor_count - current_h_rows - current_b_columns",
    "        if need <= 0:",
    "            break",
    `        status = ${NEXT}(`,
    "            gate_initial_hnf_perm,",
    "            factor_count,",
    "            current_h_rows,",
    "            need,",
    "            squash,",
    "            factor_permutation,",
    "            gate_outer_perm,",
    "            1,",
    "            gate_outer_state,",
    "            initial_relation_state,",
    "            gate_schedule,",
    "            gate_log_completed,",
    "            gate_next_control,",
    "        )",
    "        if status != 0:",
    "            return 60 + status",
    "        squash = int(gate_next_control[1])",
    `        status = ${COLLECTOR}(`,
  );
  for (const [name] of collectorSig) {
    let expression = COLLECTOR_ALIASES[name] || `gate_${name}`;
    if (name === "search_count") expression = "int(gate_next_control[0])";
    else if (name === "scalar_prefix_count") expression = "initial_count";
    else if (name === "packet_ids")
      expression = "integer_buffer_view(gate_packet_ids, 0, factor_count)";
    lines.push(`            ${expression},`);
  }
  lines.push(
    "        )",
    "        if status != 0 and status != 1:",
    "            return 70 + status",
    "        columns = int(initial_relation_state[0])",
    "        if columns == current_total:",
    "            continue",
    "        new_columns = columns - current_total",
    "        if new_columns < 1 or new_columns > 8:",
    "            return 89",
    "        if checkpoint == 0:",
    "            for i in range(factor_count * new_columns):",
    "                gate_append1_new_relations[i] = int(",
    "                    initial_relation_records[factor_count * current_total + i]",
    "                )",
    `            status = ${APPEND}(`,
  );
  function emitAppend(step, inputPrefix) {
    const input = {
      h: `${inputPrefix}_result_h`, dep: `${inputPrefix}_result_dep`,
      b: `${inputPrefix}_result_b`, logs: `${inputPrefix}_result_c`,
      perm: "gate_initial_hnf_perm",
      new_logs: "integer_buffer_view(gate_log_embeddings, log_stride * current_total, log_stride * new_columns)",
      h_rows: "current_h_rows", b_columns: "current_b_columns",
      total_columns: "current_total", log_rows: "factor_real_places + factor_complex_pairs", rows: "factor_count",
      new_columns: "new_columns",
    };
    for (const [name] of appendSig) {
      const expression = input[name] || (APPEND_REUSABLE_INTEGER.has(name) ?
        `gate_append_${name}` : `gate_append${step}_${name}`);
      lines.push(`                ${expression},`);
    }
  }
  emitAppend(1, "gate_initial_hnf");
  lines.push(
    "            )",
    "            if status != 0:",
    "                return 90 + status",
    "            if factor_count - int(gate_append1_state[2]) > append_lig_ceiling:",
    "                return 99",
    "            if int(gate_append1_state[0]) > 16:",
    "                return 100",
    "            initial_relation_state[4] = columns",
    "            for i in range(factor_count):",
    "                gate_ancestry_perm2[i] = gate_initial_hnf_perm[i]",
    "            checkpoint = 1",
    "            if gate_append1_state[0] + gate_append1_state[2] >= factor_count:",
    "                break",
    "        else:",
    "            for i in range(factor_count * new_columns):",
    "                gate_append2_new_relations[i] = int(",
    "                    initial_relation_records[factor_count * current_total + i]",
    "                )",
    `            status = ${APPEND}(`,
  );
  emitAppend(2, "gate_append1");
  lines.push(
    "            )",
    "            if status != 0:",
    "                return 110 + status",
    "            if factor_count - int(gate_append2_state[2]) > append_lig_ceiling:",
    "                return 118",
    "            if int(gate_append2_state[0]) > 16:",
    "                return 118",
    "            initial_relation_state[4] = columns",
    "            checkpoint = 2",
    "            if gate_append2_state[0] + gate_append2_state[2] < factor_count:",
    "                return 119",
    "            break",
    "    diagnostic_stage_switch(4)",
    `    status = ${ANCESTRY}(`,
    "        initial_relation_records,",
    "        gate_log_embeddings,",
    "        factor_count,",
    "        initial_columns,",
    "        checkpoint,",
    "        factor_real_places + factor_complex_pairs,",
    "        gate_initial_hnf_state,",
    "        gate_initial_hnf_assembly_state,",
    "        gate_initial_hnf_original,",
    "        gate_initial_hnf_b,",
    "        gate_initial_hnf_hnf_transform,",
    "        gate_initial_hnf_full_h,",
    "        gate_initial_hnf_full_dep,",
    "        gate_initial_hnf_diagonal,",
    "        gate_append1_rank_state,",
    "        gate_append1_state,",
    "        gate_append1_permuted_b,",
    "        gate_append1_transform,",
    "        gate_append1_full_h,",
    "        gate_append1_full_dep,",
    "        gate_append1_diagonal,",
    "        gate_ancestry_perm1,",
    "        gate_append2_rank_state,",
    "        gate_append2_state,",
    "        gate_append2_permuted_b,",
    "        gate_append2_transform,",
    "        gate_append2_full_h,",
    "        gate_append2_full_dep,",
    "        gate_append2_diagonal,",
    "        gate_ancestry_perm2,",
    "        gate_initial_hnf_result_c,",
    "        gate_append1_result_c,",
    "        gate_append2_result_c,",
    "        gate_initial_hnf_perm,",
    "        gate_ancestry_current,",
    "        gate_ancestry_old,",
    "        gate_ancestry_joined,",
    "        gate_ancestry_work,",
    "        gate_ancestry_trailing_work,",
    "        gate_ancestry_raw_to_all,",
    "        gate_ancestry_accepted_arch,",
    "        gate_ancestry_accepted_signs,",
    "        gate_ancestry_phase_pi,",
    "        gate_ancestry_active_rows,",
    "        gate_ancestry_state,",
    "    )",
    "    if status != 0:",
    "        return 130 + status",
    "    if checkpoint == 0:",
    "        for i in range(9):",
    "            gate_append2_state[i] = gate_initial_hnf_state[i]",
    "        for i in range(gate_initial_hnf_state[0] * gate_initial_hnf_state[0]):",
    "            gate_append2_result_h[i] = gate_initial_hnf_result_h[i]",
    "        initial_lig = factor_count - int(gate_initial_hnf_state[2])",
    "        for i in range(initial_lig * int(gate_initial_hnf_state[2])):",
    "            gate_append2_result_b[i] = gate_initial_hnf_result_b[i]",
    "        for i in range(log_stride * initial_columns):",
    "            gate_append2_result_c[i] = gate_initial_hnf_result_c[i]",
    "    elif checkpoint == 1:",
    "        for i in range(9):",
    "            gate_append2_state[i] = gate_append1_state[i]",
    "        for i in range(gate_append1_state[0] * gate_append1_state[0]):",
    "            gate_append2_result_h[i] = gate_append1_result_h[i]",
    "        append1_lig = factor_count - int(gate_append1_state[2])",
    "        for i in range(append1_lig * int(gate_append1_state[2])):",
    "            gate_append2_result_b[i] = gate_append1_result_b[i]",
    "        for i in range(log_stride * gate_append1_state[7]):",
    "            gate_append2_result_c[i] = gate_append1_result_c[i]",
    "    final_h_rows = int(gate_append2_state[0])",
    "    final_b_columns = int(gate_append2_state[2])",
    "    final_columns = int(gate_append2_state[7])",
    "    final_lig = factor_count - final_b_columns",
    "    if final_h_rows < 1 or final_h_rows > 16 or final_lig < 1 or final_lig > 16:",
    "        return 131",
    "    if len(gate_final_h) < 16 * 16:",
    "        return 132",
    "    if len(gate_final_b) < 16 * factor_count:",
    "        return 133",
    "    if len(gate_final_c) < log_stride * relation_target:",
    "        return 134",
    "    for i in range(final_h_rows * final_h_rows):",
    "        gate_final_h[i] = gate_append2_result_h[i]",
    "    for i in range(final_lig * final_b_columns):",
    "        gate_final_b[i] = gate_append2_result_b[i]",
    "    for i in range(log_stride * final_columns):",
    "        gate_final_c[i] = gate_append2_result_c[i]",
    "    return 0", "", "", `__all__ = [\"${ROOT}\"]`, "",
  );
  const workspaceBodyEnd = lines.lastIndexOf("    return 0");
  assert(workspaceBodyEnd >= workspaceBodyStart);
  for (let i = workspaceBodyStart; i <= workspaceBodyEnd; i++) {
    if (lines[i] !== "") lines[i] = `    ${lines[i]}`;
  }
  // Keep the formatter outside the runtime/source-inspection import path.  It
  // loads Ruff's WASM module and is needed only when regenerating this file.
  const { formatPythonSource } = require("../../tools/python-format.cjs");
  return formatPythonSource(lines.join("\n"));
}

if (require.main === module) process.stdout.write(generate());
module.exports = { COLLECTOR_ALIASES, HNF_ALIASES, ROOT,
  WORKSPACE_LIMIT_BYTES, generate, signature, workspaceAccounting };
