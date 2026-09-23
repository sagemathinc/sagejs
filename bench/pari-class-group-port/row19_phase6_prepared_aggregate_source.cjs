"use strict";

// Generate the shortest honest row-19 prepared-input aggregate.  Every owner
// is allocated and every native artifact is resolved by the host before the
// single root call; the generated graph starts with neutral prepared nf data.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const COMPONENTS = Object.freeze({
  factor: ["row19_phase6_prepared_factor_root.py",
    "pari_row19_phase6_prepared_factor_root"],
  collector: ["collected_log_embeddings.py", "pari_collect_and_log_relations"],
  hnf: ["hnfspec_complete.py", "pari_hnfspec_complete"],
  next: ["row14_next_pass.py", "pari_row14_prepare_next_pass"],
  analytic: ["row14_post806_terminal.py", "pari_row14_analytic_inverse_hr"],
  terminal: ["connected_hnfadd_acceptance.py",
    "pari_connected_hnfadd_acceptance"],
  cup: ["row19_hnfadd_cup_suffix.py", "pari_row19_hnfadd_cup_suffix"],
  acceptance: ["post_hnf_acceptance.py", "pari_post_hnf_acceptance"],
  class: ["row19_phase6_resident_class_private.py",
    "pari_row19_phase6_resident_class_private"],
  kernel: ["row19_phase6_resident_kernel_private.py",
    "pari_row19_phase6_resident_kernel_private"],
  unit: ["row19_phase6_resident_unit_private.py",
    "pari_row19_phase6_resident_unit_private"],
  witness: ["row19_phase6_resident_witness_private.py",
    "pari_row19_phase6_resident_witness_private"],
});

function signature(filename, name) {
  const source = fs.readFileSync(path.join(__dirname, filename), "utf8");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(
    `def ${escaped}\\(([\\s\\S]*?)\\n\\) -> [^:]+:`,
  ));
  assert(match, `missing ${name}`);
  return match[1].trim().split("\n").map(line => {
    const fields = line.trim().replace(/,$/, "").split(": ");
    assert.equal(fields.length, 2, line);
    return fields;
  });
}

function generate() {
  const sig = Object.fromEntries(Object.entries(COMPONENTS).map(
    ([key, [file, name]]) => [key, signature(file, name)],
  ));
  const names = Object.fromEntries(Object.entries(COMPONENTS).map(
    ([key, [, name]]) => [key, name],
  ));
  const lines = [
    '"""Generated private row-19 prepared-input class-and-unit aggregate."""',
    "",
    "from typing import TypedDict",
    "",
    "from sagejs.native import (",
    "    Float64Buffer,",
    "    Int64Buffer,",
    "    IntegerBuffer,",
    "    integer_buffer_view,",
    "    native,",
    "    uint64,",
    ")",
  ];
  for (const [file, name] of Object.values(COMPONENTS)) {
    if (name.length + file.length > 76) lines.push(
      `from .${file.replace(/\.py$/, "")} import (`,
      `    ${name},`,
      ")",
    );
    else lines.push(`from .${file.replace(/\.py$/, "")} import ${name}`);
  }
  lines.push(
    "",
    "",
    "class Row19ClassManifest(TypedDict):",
    "    factor_count: uint64",
    "    relation_count: uint64",
    "    class_dimension: uint64",
    "",
    "",
    "class Row19KernelManifest(TypedDict):",
    "    factor_count: uint64",
    "    first_columns: uint64",
    "    relation_count: uint64",
    "    kernel_rank: uint64",
    "",
    "",
    "class Row19UnitManifest(TypedDict):",
    "    relation_count: uint64",
    "    kernel_rank: uint64",
    "    log_stride: uint64",
    "    degree: uint64",
    "",
    "",
    "class Row19WitnessManifest(TypedDict):",
    "    factor_count: uint64",
    "    relation_count: uint64",
    "    class_dimension: uint64",
    "",
    "",
    "@native",
    "def pari_row19_phase6_prepared_aggregate_root(",
  );

  const parameters = new Map();
  const add = (name, kind) => {
    const old = parameters.get(name);
    assert(old === undefined || old === kind, `conflicting ${name}`);
    parameters.set(name, kind);
  };
  for (const [name, kind] of sig.factor) add(`factor_${name}`, kind);

  const collectorAliases = {
    n: "3", precision: "factor_precision", scale: "477.46482927568604",
    track_small: "1", admission_matrix_m: "factor_embedding_m",
    admission_matrix_p: "factor_embedding_p",
    admission_matrix_e: "factor_embedding_e", admission_real_count: "1",
    admission_mode: "2", admission_factor_product: "factor_factor_product[0]",
    admission_primes: "factor_runtime_primes",
    admission_products: "factor_runtime_products",
    admission_factorlimit: "factor_factor_limit",
    admission_prime_limit: "factor_prime_limit",
    admission_prime_offsets: "factor_prime_offsets",
    admission_prime_counts: "factor_prime_counts",
    admission_group_tau: "factor_selected_tau",
    admission_group_e: "factor_ramification",
    admission_group_f: "factor_residue_degrees",
    admission_group_inert: "factor_inert_flags",
    nrelid: "4", track_fact: "1", jid0: "0", e0: "0",
    subfactor: "integer_buffer_view(factor_subfactor, 0, 3)",
    extra_count: "-1", relation_primes: "factor_relation_primes",
    ramification: "factor_ramification", relation_state: "factor_relation_state",
    relation_basis: "factor_relation_basis",
    relation_records: "factor_relation_records",
    relation_hashes: "factor_relation_hashes",
    relation_metadata: "factor_relation_metadata",
    generators: "factor_relation_generators",
    preparation_rounded_embedding: "factor_preparation_rounded_embedding",
    preparation_embedding: "factor_preparation_embedding",
    search_ideals: "factor_permutation", search_count: "424",
    packet_ideals: "factor_packet_ideals", packet_norms: "factor_packet_norms",
    construct_primes: "0", basis_table: "factor_basis_table",
    packet_primes: "factor_relation_primes",
    packet_inert: "factor_inert_flags", outer_mode: "1", outer_ru: "2",
    log_precision: "192", scalar_prefix_count: "71",
  };
  for (const [name, kind] of sig.collector)
    if (collectorAliases[name] === undefined) add(`collector_${name}`, kind);

  const hnfAliases = {
    original: "hnf_original", rows: "424", columns: "423", perm: "hnf_perm",
    k0: "3", logs: "hnf_logs", log_rows: "2",
  };
  add("hnf_original", "Int64Buffer");
  add("hnf_perm", "Int64Buffer");
  add("hnf_logs", "IntegerBuffer");
  for (const [name, kind] of sig.hnf)
    if (hnfAliases[name] === undefined) add(`hnf_${name}`, kind);
  add("next_control", "Int64Buffer");

  const analyticAliases = {
    discriminant: "factor_discriminant", real_places: "1", complex_places: "1",
    roots_of_unity: "factor_roots_of_unity", primes: "factor_analytic_primes",
    offsets: "factor_analytic_offsets", counts: "factor_analytic_counts",
    degrees: "factor_analytic_degrees",
    multiplicities: "factor_analytic_multiplicities",
  };
  for (const [name, kind] of sig.analytic)
    if (analyticAliases[name] === undefined) add(`analytic_${name}`, kind);

  const terminalAliases = {
    h: "hnf_result_h", h_rows: "9", dep: "hnf_result_dep",
    b: "hnf_result_b", b_columns: "408", logs: "hnf_result_c",
    total_columns: "423", log_rows: "2", perm: "hnf_perm", rows: "424",
    new_relations: "terminal_new_relations", new_columns: "7",
    new_logs: "integer_buffer_view(collector_log_embeddings, 14 * 423, 14 * 7)",
    accept_degree: "3", accept_inverse_hr: "analytic_inverse_hr",
    accept_cache_changed: "True",
  };
  add("terminal_new_relations", "Int64Buffer");
  for (const [name, kind] of sig.terminal)
    if (terminalAliases[name] === undefined) add(`terminal_${name}`, kind);

  const cupAliases = {
    joined: "terminal_joined", width: "16", lig: "16",
    joined_logs: "terminal_joined_logs", logs: "hnf_result_c", log_rows: "2",
    b: "terminal_permuted_b", b_columns: "408", perm: "hnf_perm",
    total_columns: "423", new_columns: "7",
  };
  for (const [name, kind] of sig.cup) {
    if (cupAliases[name] !== undefined) continue;
    const terminalKind = sig.terminal.find(([candidate]) => candidate === name)?.[1];
    if (terminalKind !== undefined) cupAliases[name] = `terminal_${name}`;
    else add(`cup_${name}`, kind);
  }

  const acceptanceAliases = {
    factor_count: "424", h_rows: "9", b_columns: "415", c_columns: "430",
    places: "2", degree: "3", h: "terminal_result_h",
    c: "terminal_result_c", inverse_hr: "analytic_inverse_hr",
    cache_changed: "True",
  };
  for (const [name] of sig.acceptance)
    if (acceptanceAliases[name] === undefined)
      acceptanceAliases[name] = `terminal_accept_${name}`;

  add("class_manifest", "Row19ClassManifest");
  for (const [name, kind] of sig.class)
    if (name !== "manifest" && name !== "terminal_h_owner")
      add(`class_${name}`, kind);
  add("kernel_manifest", "Row19KernelManifest");
  const kernelAliases = {
    manifest: "kernel_manifest", relation_records: "factor_relation_records",
    first_cleanup_transform: "hnf_transform", first_transform: "hnf_hnf_transform",
    first_full_h: "hnf_full_h", first_full_dep: "hnf_full_dep",
    first_trailing: "hnf_b", first_diagonal: "hnf_diagonal",
    terminal_transform: "terminal_transform", terminal_full_h: "terminal_full_h",
    terminal_full_dep: "terminal_full_dep",
    terminal_trailing: "terminal_permuted_b",
    terminal_diagonal: "terminal_diagonal", terminal_permutation: "hnf_perm",
    terminal_result_h: "terminal_result_h",
  };
  for (const [name, kind] of sig.kernel)
    if (kernelAliases[name] === undefined) add(`kernel_${name}`, kind);
  add("unit_manifest", "Row19UnitManifest");
  const unitAliases = {
    manifest: "unit_manifest", kernel: "kernel_kernel_output",
    logs: "collector_log_embeddings", regulator: "terminal_accept_regulator",
    generators: "factor_relation_generators",
  };
  for (const [name, kind] of sig.unit)
    if (unitAliases[name] === undefined) add(`unit_${name}`, kind);
  add("witness_manifest", "Row19WitnessManifest");
  const witnessAliases = {
    manifest: "witness_manifest", raw_presentation: "kernel_presentation_output",
    m1: "class_m1_output", uir: "class_uir_output",
    invariants: "class_invariants_output",
    relation_records: "factor_relation_records",
    relation_generators: "factor_relation_generators",
    terminal_permutation: "hnf_perm",
  };
  for (const [name, kind] of sig.witness)
    if (witnessAliases[name] === undefined) add(`witness_${name}`, kind);
  for (const [name, kind] of parameters) lines.push(`    ${name}: ${kind},`);
  lines.push(
    ") -> int:",
    '    """Compute the complete retained row-19 factored result in one call."""',
    `    count = ${names.factor}(`,
  );
  for (const [name] of sig.factor) lines.push(`        factor_${name},`);
  lines.push(
    "    )",
    "    if count != 424:",
    "        return 11",
    "    for i in range(20):",
    "        collector_outer_state[i] = 0",
    "    collector_outer_state[0] = 359",
    "    collector_outer_state[1] = 4",
    "    collector_outer_state[4] = 425",
    "    for i in range(4):",
    "        collector_schedule[i] = 0",
    "    collector_log_completed[0] = 0",
    "    for i in range(424):",
    "        collector_packet_ids[i] = i + 1",
    "        collector_outer_minidx[i] = i + 1",
    "        collector_outer_perm[i] = factor_permutation[i]",
    "        selected = factor_selected_indices[i]",
    "        for coordinate in range(3):",
    "            collector_packet_generators[3 * i + coordinate] = factor_catalog_generators[",
    "                3 * selected + coordinate",
    "            ]",
    `    status = ${names.collector}(`,
  );
  for (const [name] of sig.collector)
    lines.push(`        ${collectorAliases[name] ?? `collector_${name}`},`);
  lines.push(
    "    )",
    "    if status != 0 and status != 1:",
    "        return 20 + status",
    "    if factor_relation_state[0] != 423 or collector_log_completed[0] != 423:",
    "        return 30",
    "    for i in range(424 * 423):",
    "        hnf_original[i] = factor_relation_records[i]",
    "    for i in range(424):",
    "        hnf_perm[i] = collector_outer_perm[i]",
    "    for i in range(14 * 423):",
    "        hnf_logs[i] = collector_log_embeddings[i]",
    `    status = ${names.hnf}(`,
  );
  for (const [name] of sig.hnf)
    lines.push(`        ${hnfAliases[name] ?? `hnf_${name}`},`);
  lines.push(
    "    )",
    "    if status != 0 or hnf_state[0] != 9 or hnf_state[2] != 408:",
    "        return 40 + status",
    `    status = ${names.next}(`,
    "        hnf_perm,",
    "        424,",
    "        9,",
    "        7,",
    "        0,",
    "        factor_permutation,",
    "        collector_outer_perm,",
    "        1,",
    "        collector_outer_state,",
    "        factor_relation_state,",
    "        collector_schedule,",
    "        collector_log_completed,",
    "        next_control,",
    "    )",
    "    if status != 0:",
    "        return 50 + status",
    `    status = ${names.collector}(`,
  );
  for (const [name] of sig.collector) {
    let expression = collectorAliases[name] ?? `collector_${name}`;
    if (name === "search_count") expression = "int(next_control[0])";
    lines.push(`        ${expression},`);
  }
  lines.push(
    "    )",
    "    if status != 0 and status != 1:",
    "        return 60 + status",
    "    if factor_relation_state[0] != 430 or collector_log_completed[0] != 430:",
    "        return 70",
    `    status = ${names.analytic}(`,
  );
  for (const [name] of sig.analytic)
    lines.push(`        ${analyticAliases[name] ?? `analytic_${name}`},`);
  lines.push(
    "    )",
    "    if status != 0:",
    "        return 80 + status",
    "    for i in range(424 * 7):",
    "        terminal_new_relations[i] = factor_relation_records[424 * 423 + i]",
    `    status = ${names.terminal}(`,
  );
  for (const [name] of sig.terminal)
    lines.push(`        ${terminalAliases[name] ?? `terminal_${name}`},`);
  lines.push(
    "    )",
    "    if status != -2 or terminal_attempt_state[1] != -2:",
    "        return 90 + status",
    `    status = ${names.cup}(`,
  );
  for (const [name] of sig.cup)
    lines.push(`        ${cupAliases[name] ?? `cup_${name}`},`);
  lines.push(
    "    )",
    "    if status != 0:",
    "        return 100 + status",
    `    status = ${names.acceptance}(`,
  );
  for (const [name] of sig.acceptance)
    lines.push(`        ${acceptanceAliases[name]},`);
  lines.push(
    "    )",
    "    if status != 0:",
    "        return 110 + status",
    "    terminal_attempt_state[0] = 3",
    "    terminal_attempt_state[1] = status",
    "    terminal_attempt_state[2] = terminal_accept_multiple_state[1]",
    "    factor_relation_state[4] = 430",
    `    status = ${names.class}(`,
    "        class_manifest,",
    "        terminal_result_h,",
    "        class_invariants_output,",
    "        class_class_number_output,",
    "        class_m1_output,",
    "        class_uir_output,",
    "        class_class_state_output,",
    "    )",
    "    if status != 0:",
    "        return 120 + status",
    `    status = ${names.kernel}(`,
  );
  for (const [name] of sig.kernel)
    lines.push(`        ${kernelAliases[name] ?? `kernel_${name}`},`);
  lines.push(
    "    )",
    "    if status != 0:",
    "        return 130 + status",
    `    status = ${names.unit}(`,
  );
  for (const [name] of sig.unit)
    lines.push(`        ${unitAliases[name] ?? `unit_${name}`},`);
  lines.push(
    "    )",
    "    if status != 0:",
    "        return 140 + status",
    `    status = ${names.witness}(`,
  );
  for (const [name] of sig.witness)
    lines.push(`        ${witnessAliases[name] ?? `witness_${name}`},`);
  lines.push(
    "    )",
    "    if status != 0:",
    "        return 150 + status",
    "    return 0",
    "",
    "",
    '__all__ = ["pari_row19_phase6_prepared_aggregate_root"]',
    "",
  );
  return lines.join("\n");
}

if (require.main === module) process.stdout.write(generate());
module.exports = { COMPONENTS, generate, signature };
