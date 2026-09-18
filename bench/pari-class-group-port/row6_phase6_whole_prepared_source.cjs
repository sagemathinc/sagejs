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
  const match = source.match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\) -> int:`));
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
  factor_count: "1130",
  h_rows: "2",
  b_columns: "1128",
  c_columns: "1137",
  places: "3",
  degree: "3",
  h: "integer_buffer_view(gate_append2_result_h, 0, 4)",
  c: "gate_append2_result_c",
  factor_base_state: "factor_base_state",
  unit_accepted_arch: "gate_ancestry_accepted_arch",
  unit_accepted_signs: "gate_ancestry_accepted_signs",
  unit_phase_pi: "gate_ancestry_phase_pi",
  unit_preparation_embedding: "gate_preparation_embedding",
  unit_multiplication_basis: "factor_basis_table",
  class_raw_relations:
    "integer_buffer_view(initial_relation_records, 0, 1130 * 1137)",
  class_principal_generators:
    "integer_buffer_view(initial_relation_generators, 0, 3 * 1137)",
  class_factor_ideals: "integer_buffer_view(factor_packet_ideals, 0, 9 * 1130)",
  class_factor_norms: "integer_buffer_view(factor_packet_norms, 0, 1130)",
  class_descriptor_generators: "gate_packet_generators",
  class_descriptor_primes:
    "integer_buffer_view(factor_relation_primes, 0, 1130)",
  class_descriptor_e: "integer_buffer_view(factor_ramification, 0, 1130)",
  class_descriptor_f:
    "integer_buffer_view(factor_residue_degrees, 0, 1130)",
  class_descriptor_inert: "integer_buffer_view(factor_inert_flags, 0, 1130)",
  class_multiplication_basis: "factor_basis_table",
  class_raw_to_unit_kernel:
    "integer_buffer_view(gate_ancestry_raw_to_all, 0, 7 * 1137)",
  class_raw_to_presentation:
    "integer_buffer_view(gate_ancestry_raw_to_all, 7 * 1137, 2 * 1137)",
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
    "from typing import TypedDict",
    "from sagejs.native import uint64",
    `from .row6_phase6_resident_terminal_root import ${TERMINAL}`,
    "",
    "",
    "class Row6UnitManifest(TypedDict):",
    "    columns: uint64",
    "    precision: uint64",
    "    unit_rank: uint64",
    "    expect_large: bool",
    "",
    "",
    "class Row6ClassManifest(TypedDict):",
    "    rows: uint64",
    "    columns: uint64",
    "    degree: uint64",
    "    kernel_columns: uint64",
    "    class_columns: uint64",
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
    "    index_row = -1",
    "    for i in range(1130):",
    "        if factor_relation_primes[i] == 3:",
    "            index_row = i",
    "            break",
    "    if index_row < 0:",
    "        return 140",
    "    for i in range(9):",
    "        terminal_index_ideals[i] = factor_selected_tau[9 * index_row + i]",
    "    terminal_index_ranks[0] = 2",
    `    status = ${TERMINAL}(`,
  );
  for (const [name] of terminal)
    lines.push(`        ${TERMINAL_ALIASES[name] || `terminal_${name}`},`);
  lines.push(
    "    )",
    "    if status != 0:",
    "        return 200 + status",
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
