"use strict";

// Generate the one-call prepared row-6 Gate-C/ancestry/class/unit graph.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = "pari_row6_phase6_whole_prepared_root";
const GATE = "pari_row6_phase6_gate_prefix_root";
const TERMINAL = "pari_row6_phase6_resident_terminal_root";

function signature(file, name) {
  const source = fs.readFileSync(path.join(__dirname, file), "utf8");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\) -> (?:int|int64):`));
  assert(match, `missing ${name}`);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

const TERMINAL_ALIASES = Object.freeze({
  coefficients_exact: "factor_polynomial",
  discriminant: "factor_discriminant",
  real_places: "factor_real_places",
  complex_places: "factor_complex_pairs",
  roots_of_unity: "factor_roots_of_unity",
  equation_index: "factor_equation_index",
  analytic_primes: "factor_runtime_primes",
  prime_count: "len(factor_runtime_primes)",
  index_prime: "3",
  index_count: "1",
  catalog_workspace: "factor_degree_workspace",
  factor_degrees: "factor_factor_degrees",
  factor_exponents: "factor_factor_exponents",
  group_degrees: "factor_group_degrees",
  group_counts: "factor_group_counts",
  local_state: "factor_local_state",
  pattern_offsets: "factor_pattern_offsets",
  pattern_counts: "factor_pattern_counts",
  pattern_degrees: "factor_pattern_degrees",
  pattern_multiplicities: "factor_pattern_multiplicities",
  full_offsets: "factor_full_offsets",
  full_counts: "factor_full_counts",
  full_degrees: "factor_full_degrees",
  degree_catalog_ready: "True",
  factor_count: "factor_count",
  h_rows: "class_columns",
  b_columns: "factor_count - class_columns",
  c_columns: "relation_columns",
  places: "places",
  degree: "factor_degree",
  h: "integer_buffer_view(gate_final_h, 0, class_columns * class_columns)",
  c: "integer_buffer_view(gate_final_c, 0, 7 * places * relation_columns)",
  factor_base_state: "factor_base_state",
  unit_columns: "kernel_columns",
  unit_precision: "factor_precision",
  unit_rank: "factor_real_places + factor_complex_pairs - 1",
  unit_accepted_arch: "integer_buffer_view(gate_ancestry_accepted_arch, 0, 7 * places * kernel_columns)",
  unit_accepted_signs: "int64_record(gate_ancestry_accepted_signs, 0, places * kernel_columns)",
  unit_phase_pi: "gate_ancestry_phase_pi",
  unit_preparation_embedding: "gate_preparation_embedding",
  unit_multiplication_basis: "factor_basis_table",
  class_rows: "factor_count",
  class_columns: "relation_columns",
  class_degree: "factor_degree",
  class_kernel_columns: "kernel_columns",
  class_presentation_columns: "class_columns",
  class_raw_relations:
    "integer_buffer_view(initial_relation_records, 0, factor_count * relation_columns)",
  class_principal_generators:
    "integer_buffer_view(initial_relation_generators, 0, factor_degree * relation_columns)",
  class_factor_ideals: "integer_buffer_view(factor_packet_ideals, 0, factor_degree * factor_degree * factor_count)",
  class_factor_norms: "integer_buffer_view(factor_packet_norms, 0, factor_count)",
  class_descriptor_generators: "gate_packet_generators",
  class_descriptor_primes:
    "integer_buffer_view(factor_relation_primes, 0, factor_count)",
  class_descriptor_e: "integer_buffer_view(factor_ramification, 0, factor_count)",
  class_descriptor_f:
    "integer_buffer_view(factor_residue_degrees, 0, factor_count)",
  class_descriptor_inert: "integer_buffer_view(factor_inert_flags, 0, factor_count)",
  class_multiplication_basis: "factor_basis_table",
  class_raw_to_unit_kernel:
    "integer_buffer_view(gate_ancestry_raw_to_all, 0, kernel_columns * relation_columns)",
  class_raw_to_presentation:
    "integer_buffer_view(gate_ancestry_raw_to_all, kernel_columns * relation_columns, class_columns * relation_columns)",
  class_active_rows: "gate_ancestry_active_rows",
});

function generate() {
  const gate = signature("row6_phase6_gate_prefix_root.generated.py", GATE);
  const terminal = signature("row6_phase6_resident_terminal_root.py", TERMINAL);
  const gateSource = fs.readFileSync(path.join(__dirname,
    "row6_phase6_gate_prefix_root.generated.py"), "utf8")
    .replace(/\n__all__ = \[[^\n]+\]\n?$/, "\n");
  const lines = [gateSource,
    "",
    "from sagejs.native import int64_record",
    `from .row6_phase6_resident_terminal_root import ${TERMINAL}`,
    "",
    "",
    "@native",
    `def ${ROOT}(`,
  ];
  for (const [name, kind] of gate) lines.push(`    ${name}: ${kind},`);
  for (const [name, kind] of terminal)
    if (!TERMINAL_ALIASES[name]) lines.push(`    terminal_${name}: ${kind},`);
  lines.push(
    ") -> int:",
    '    """Run the connected prepared prefix and terminal graph."""',
    `    status = ${GATE}(`,
  );
  for (const [name] of gate) lines.push(`        ${name},`);
  lines.push(
    "    )",
    "    if status != 0:",
    "        return status",
    "    factor_count = int(factor_root_state[3])",
    "    factor_degree = len(factor_polynomial) - 1",
    "    places = factor_real_places + factor_complex_pairs",
    "    relation_columns = int(initial_relation_state[0])",
    "    kernel_columns = int(gate_ancestry_state[1])",
    "    class_columns = int(gate_ancestry_state[2])",
    "    terminal_preparation_state[0] = 3",
    "    terminal_preparation_state[2] = factor_count",
    "    terminal_preparation_state[3] = int(factor_root_state[4])",
    "    index_row = -1",
    "    for i in range(factor_count):",
    "        if factor_relation_primes[i] == 3:",
    "            index_row = i",
    "            break",
    "    if index_row < 0:",
    "        return 140",
    "    for i in range(9):",
    "        terminal_index_ideals[i] = factor_selected_tau[9 * index_row + i]",
    "    terminal_index_ranks[0] = 2",
    "    for i in range(4):",
    "        terminal_catalog_state[i] = factor_degree_state[i]",
    "    diagnostic_stage_switch(5)",
    `    status = ${TERMINAL}(`,
  );
  for (const [name] of terminal)
    lines.push(`        ${TERMINAL_ALIASES[name] || `terminal_${name}`},`);
  lines.push(
    "    )",
    "    if status != 0:",
    "        return 200 + status",
    "    diagnostic_stage_switch(6)",
    "    return 0",
    "",
    "",
    `__all__ = ["${ROOT}"]`,
    "",
  );
  const unformatted = lines.join("\n");
  if (typeof WebAssembly !== "undefined") {
    const { formatPythonSource } = require("../../tools/python-format.cjs");
    return formatPythonSource(unformatted);
  }
  // `node --jitless` intentionally removes WebAssembly, while the repository
  // formatter uses Ruff's WASM binding.  Use the native Ruff CLI for the
  // checker's pre-execution source-freshness proof; the byte comparison below
  // remains fail-closed if its formatting ever differs.
  const { execFileSync } = require("node:child_process");
  return execFileSync(
    "ruff",
    ["format", "--stdin-filename", "row6_phase6_whole_prepared_root.generated.py", "-"],
    { encoding: "utf8", input: unformatted },
  );
}

if (require.main === module) process.stdout.write(generate());
module.exports = { GATE, ROOT, TERMINAL, TERMINAL_ALIASES, generate, signature };
