"use strict";

// Generate the connected prepared factor/initial/collector/first-HNF root.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const prefix = require("./row6_phase6_prepared_prefix_source.cjs");

const ROOT = "pari_row6_phase6_gate_prefix_root";
const PREFIX = "pari_row6_phase6_prepared_prefix_root";
const FACTOR = "pari_row6_prepared_factor_base_root";
const INITIAL = "pari_row6_prepared_initial_relations";
const COLLECTOR = "pari_collect_and_log_relations";
const HNF = "pari_hnfspec_complete";
const NEXT = "pari_row14_prepare_next_pass";
const APPEND = "pari_hnfadd";
const ANCESTRY = "pari_row6_phase6_gate_ancestry_private";

function signature(file, name) {
  const source = fs.readFileSync(path.join(__dirname, file), "utf8");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\) -> int:`));
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
  admission_group_tau: "integer_buffer_view(factor_selected_tau, 0, 1130 * 9)",
  admission_group_e: "integer_buffer_view(factor_ramification, 0, 1130)",
  admission_group_f: "integer_buffer_view(factor_residue_degrees, 0, 1130)",
  admission_group_inert: "integer_buffer_view(factor_inert_flags, 0, 1130)",
  subfactor: "integer_buffer_view(factor_subfactor, 0, 4)",
  relation_primes: "integer_buffer_view(factor_relation_primes, 0, 1130)",
  ramification: "integer_buffer_view(factor_ramification, 0, 1130)",
  relation_state: "initial_relation_state",
  relation_basis: "initial_relation_basis",
  relation_records: "initial_relation_records",
  relation_hashes: "initial_relation_hashes",
  relation_metadata: "initial_relation_metadata",
  relation: "initial_relation",
  relation_scratch: "initial_relation_scratch",
  generators: "initial_relation_generators",
  search_ideals: "integer_buffer_view(factor_permutation, 0, 1130)",
  packet_ideals: "integer_buffer_view(factor_packet_ideals, 0, 1130 * 9)",
  packet_norms: "integer_buffer_view(factor_packet_norms, 0, 1130)",
  basis_table: "factor_basis_table",
  packet_primes: "integer_buffer_view(factor_relation_primes, 0, 1130)",
  packet_inert: "integer_buffer_view(factor_inert_flags, 0, 1130)",
  outer_minidx: "integer_buffer_view(factor_minidx, 0, 1130)",
});

const HNF_ALIASES = Object.freeze({
  original: "gate_initial_hnf_original",
  rows: "gate_initial_hnf_rows",
  columns: "gate_initial_hnf_columns",
  perm: "gate_initial_hnf_perm",
  k0: "gate_initial_hnf_k0",
  logs: "gate_log_embeddings",
  log_rows: "gate_initial_hnf_log_rows",
});

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
    "from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, integer_buffer_view, native",
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
    if (!COLLECTOR_ALIASES[name]) lines.push(`    gate_${name}: ${kind},`);
  }
  for (const [name, kind] of hnfSig) {
    if (!HNF_ALIASES[name]) lines.push(`    gate_initial_hnf_${name}: ${kind},`);
    else if (name !== "logs") lines.push(`    ${HNF_ALIASES[name]}: ${kind},`);
  }
  lines.push("    gate_next_control: Int64Buffer,");
  for (const step of [1, 2]) for (const [name, kind] of appendSig) {
    if (kind.endsWith("Buffer") && !appendBorrowed.has(name))
      lines.push(`    gate_append${step}_${name}: ${kind},`);
  }
  for (const [name, kind] of [
    ["perm1", "Int64Buffer"], ["perm2", "Int64Buffer"],
    ["current", "IntegerBuffer"], ["old", "IntegerBuffer"],
    ["joined", "IntegerBuffer"], ["work", "IntegerBuffer"],
    ["trailing_work", "IntegerBuffer"], ["raw_to_all", "IntegerBuffer"],
    ["accepted_arch", "IntegerBuffer"],
    ["accepted_signs", "Int64Buffer"], ["phase_pi", "IntegerBuffer"],
    ["active_rows", "Int64Buffer"], ["state", "Int64Buffer"],
  ]) lines.push(`    gate_ancestry_${name}: ${kind},`);
  lines.push(
    ") -> int:",
    '    \"\"\"Run the authenticated prefix, relation pass, logs and first HNF.\"\"\"',
    `    count = ${FACTOR}(`,
  );
  for (const [name] of factorSig) lines.push(`        factor_${name},`);
  lines.push("    )", "    if count != 1130:", "        return 11");
  const initialAliases = {
    polynomial: "factor_polynomial", discriminant: "factor_discriminant",
    real_places: "factor_real_places", complex_pairs: "factor_complex_pairs",
    precision: "factor_precision", equation_index: "factor_equation_index",
    factor_state: "factor_root_state", random_state: "factor_random_state",
    rational_primes: "integer_buffer_view(factor_initial_primes, 0, 740)",
    group_offsets: "integer_buffer_view(factor_initial_offsets, 0, 740)",
    group_counts: "integer_buffer_view(factor_initial_counts, 0, 740)",
    group_complete: "integer_buffer_view(factor_initial_complete, 0, 740)",
    ramification: "integer_buffer_view(factor_ramification, 0, 1130)",
  };
  lines.push(`    initial_count = ${INITIAL}(`);
  for (const [name] of initialSig) {
    const expression = initialAliases[name] || `initial_${name}`;
    lines.push(`        ${expression},`);
  }
  lines.push("    )", "    if initial_count != 203:", "        return 12");
  // Derive every factor-dependent collector table from the live prefix.
  lines.push(
    "    for i in range(len(gate_admission_prime_offsets)):",
    "        gate_admission_prime_offsets[i] = -1",
    "        gate_admission_prime_counts[i] = 0",
    "    for i in range(740):",
    "        prime = int(factor_initial_primes[i])",
    "        gate_admission_prime_offsets[prime] = factor_initial_offsets[i]",
    "        gate_admission_prime_counts[prime] = factor_initial_counts[i]",
    "    for i in range(1130):",
    "        gate_packet_ids[i] = i + 1",
    "        descriptor = int(factor_selected_indices[i])",
    "        gate_packet_generators[3 * i] = factor_catalog_generators[3 * descriptor]",
    "        gate_packet_generators[3 * i + 1] = factor_catalog_generators[3 * descriptor + 1]",
    "        gate_packet_generators[3 * i + 2] = factor_catalog_generators[3 * descriptor + 2]",
    "        gate_outer_perm[i] = factor_permutation[i]",
    `    status = ${COLLECTOR}(`,
  );
  for (const [name] of collectorSig)
    lines.push(`        ${COLLECTOR_ALIASES[name] || `gate_${name}`},`);
  lines.push(
    "    )",
    "    if status != 0 and status != 1:",
    "        return 20 + status",
    "    if initial_relation_state[0] != 1133 or gate_log_completed[0] != 1133:",
    "        return 30",
    "    for i in range(1130 * 1133):",
    "        gate_initial_hnf_original[i] = int(initial_relation_records[i])",
    "    for i in range(1130):",
    "        gate_initial_hnf_perm[i] = int(factor_permutation[i])",
    `    status = ${HNF}(`,
  );
  for (const [name] of hnfSig)
    lines.push(`        ${HNF_ALIASES[name] || `gate_initial_hnf_${name}`},`);
  lines.push(
    "    )",
    "    if status != 0:",
    "        return 40 + status",
    "    if gate_initial_hnf_state[0] != 2 or gate_initial_hnf_state[2] != 1124:",
    "        return 50",
    "    for i in range(1130):",
    "        gate_ancestry_perm1[i] = gate_initial_hnf_perm[i]",
    "    initial_relation_state[4] = 1133",
    "    squash = 0",
    "    checkpoint = 0",
    "    for pass_index in range(13):",
    "        if checkpoint == 0:",
    "            current_h_rows = int(gate_initial_hnf_state[0])",
    "            current_b_columns = int(gate_initial_hnf_state[2])",
    "            current_total = int(gate_initial_hnf_state[7])",
    "        else:",
    "            current_h_rows = int(gate_append1_state[0])",
    "            current_b_columns = int(gate_append1_state[2])",
    "            current_total = int(gate_append1_state[7])",
    "        need = 1130 - current_h_rows - current_b_columns",
    `        status = ${NEXT}(`,
    "            gate_initial_hnf_perm,",
    "            1130,",
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
    "        if checkpoint == 0:",
    "            if columns != 1136 or new_columns != 3:",
    "                return 80",
    "            for i in range(1130 * new_columns):",
    "                gate_append1_new_relations[i] = int(",
    "                    initial_relation_records[1130 * current_total + i]",
    "                )",
    `            status = ${APPEND}(`,
  );
  function emitAppend(step, inputPrefix) {
    const input = {
      h: `${inputPrefix}_result_h`, dep: `${inputPrefix}_result_dep`,
      b: `${inputPrefix}_result_b`, logs: `${inputPrefix}_result_c`,
      perm: "gate_initial_hnf_perm",
      new_logs: "integer_buffer_view(gate_log_embeddings, 21 * current_total, 21 * new_columns)",
      h_rows: "current_h_rows", b_columns: "current_b_columns",
      total_columns: "current_total", log_rows: "3", rows: "1130",
      new_columns: "new_columns",
    };
    for (const [name] of appendSig) {
      const expression = input[name] || `gate_append${step}_${name}`;
      lines.push(`                ${expression},`);
    }
  }
  emitAppend(1, "gate_initial_hnf");
  lines.push(
    "            )",
    "            if status != 0:",
    "                return 90 + status",
    "            initial_relation_state[4] = columns",
    "            for i in range(1130):",
    "                gate_ancestry_perm2[i] = gate_initial_hnf_perm[i]",
    "            checkpoint = 1",
    "        else:",
    "            if columns != 1137 or new_columns != 1:",
    "                return 100",
    "            for i in range(1130 * new_columns):",
    "                gate_append2_new_relations[i] = int(",
    "                    initial_relation_records[1130 * current_total + i]",
    "                )",
    `            status = ${APPEND}(`,
  );
  emitAppend(2, "gate_append1");
  lines.push(
    "            )",
    "            if status != 0:",
    "                return 110 + status",
    "            initial_relation_state[4] = columns",
    "            checkpoint = 2",
    "            break",
    "    if checkpoint != 2:",
    "        return 120",
    "    if gate_append2_state[0] != 2 or gate_append2_state[2] != 1128:",
    "        return 121",
    `    status = ${ANCESTRY}(`,
    "        initial_relation_records,",
    "        gate_log_embeddings,",
    "        gate_initial_hnf_assembly_state,",
    "        gate_initial_hnf_transform,",
    "        gate_initial_hnf_b,",
    "        gate_initial_hnf_hnf_transform,",
    "        gate_initial_hnf_full_h,",
    "        gate_initial_hnf_full_dep,",
    "        gate_initial_hnf_diagonal,",
    "        gate_append1_rank_state,",
    "        gate_append1_permuted_b,",
    "        gate_append1_transform,",
    "        gate_append1_full_h,",
    "        gate_append1_full_dep,",
    "        gate_append1_diagonal,",
    "        gate_ancestry_perm1,",
    "        gate_append2_rank_state,",
    "        gate_append2_permuted_b,",
    "        gate_append2_transform,",
    "        gate_append2_full_h,",
    "        gate_append2_full_dep,",
    "        gate_append2_diagonal,",
    "        gate_ancestry_perm2,",
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
    "    return 0", "", "", `__all__ = [\"${ROOT}\"]`, "",
  );
  // Keep the formatter outside the runtime/source-inspection import path.  It
  // loads Ruff's WASM module and is needed only when regenerating this file.
  const { formatPythonSource } = require("../../tools/python-format.cjs");
  return formatPythonSource(lines.join("\n"));
}

if (require.main === module) process.stdout.write(generate());
module.exports = { COLLECTOR_ALIASES, HNF_ALIASES, ROOT, generate, signature };
