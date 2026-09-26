"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RELATION_SOURCE = path.join(__dirname, "row23_connected_relation_hnf.py");
const OUTPUT_SOURCE = path.join(__dirname, "row23_phase6_aggregate_root.py");

function signature(source, name) {
  const match = fs.readFileSync(source, "utf8").match(
    new RegExp(`def ${name}\\(([\\s\\S]*?)\\n\\) -> int:`));
  if (!match) throw new Error(`missing ${name} signature`);
  return match[1].trim().split("\n").map(line => {
    const clean = line.trim().replace(/,$/, "");
    const at = clean.indexOf(":");
    return [clean.slice(0, at), clean.slice(at + 1).trim()];
  });
}

function emitAggregateSource() {
  const relation = signature(RELATION_SOURCE, "pari_connected_relation_hnf");
  const extras = [
    ["analytic_polynomial", "IntegerBuffer"],
    ["analytic_primes", "IntegerBuffer"],
    ["analytic_prime_count", "int"],
    ["analytic_discriminant", "int"],
    ["analytic_roots_of_unity", "int"],
    ["catalog_workspace", "IntegerBuffer"],
    ["pattern_offsets", "IntegerBuffer"],
    ["pattern_counts", "IntegerBuffer"],
    ["pattern_degrees", "IntegerBuffer"],
    ["pattern_multiplicities", "IntegerBuffer"],
    ["suffix_embedding_matrix", "IntegerBuffer"],
    ["suffix_work_arena", "IntegerBuffer"],
    ["suffix_exact_arena", "IntegerBuffer"],
    ["output_units", "IntegerBuffer"],
    ["output_norms", "IntegerBuffer"],
    ["output_class_number", "IntegerBuffer"],
    ["output_invariants", "IntegerBuffer"],
    ["suffix_state", "Int64Buffer"],
    ["aggregate_state", "Int64Buffer"],
  ];
  const declarations = [...relation, ...extras]
    .map(([name, type]) => `    ${name}: ${type},`).join("\n");
  const relationArgs = relation.map(([name]) => `        ${name},`).join("\n");
  return `\"\"\"Generated one-call row-23 relation/HNF/class/unit root.\"\"\"\n\n` +
`from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native\n` +
`from .row23_connected_relation_hnf import pari_connected_relation_hnf\n` +
`from .row23_phase6_suffix_root import pari_row23_phase6_suffix_root\n\n\n` +
`@native\ndef pari_row23_phase6_aggregate_root(\n${declarations}\n) -> int:\n` +
`    if len(aggregate_state) < 4:\n` +
`        raise ValueError(\"short row-23 aggregate state\")\n` +
`    for i in range(4):\n        aggregate_state[i] = 0\n` +
`    aggregate_state[0] = -1\n` +
`    status = pari_connected_relation_hnf(\n${relationArgs}\n    )\n` +
`    aggregate_state[1] = status\n` +
`    if status != 0:\n        return 1\n` +
`    status = pari_row23_phase6_suffix_root(\n` +
`        analytic_polynomial, basis_table, analytic_primes,\n` +
`        analytic_prime_count, analytic_discriminant, analytic_roots_of_unity,\n` +
`        catalog_workspace, pattern_offsets, pattern_counts, pattern_degrees,\n` +
`        pattern_multiplicities, hnf_result_h, hnf_result_c,\n` +
`        suffix_embedding_matrix, suffix_work_arena, suffix_exact_arena,\n` +
`        output_units, output_norms, output_class_number, output_invariants,\n` +
`        suffix_state,\n    )\n` +
`    aggregate_state[2] = status\n` +
`    if status != 0:\n        return 2\n` +
`    aggregate_state[0] = 0\n    aggregate_state[3] = 1\n    return 0\n\n` +
`__all__ = [\"pari_row23_phase6_aggregate_root\"]\n`;
}

function writeAggregateSource() {
  const source = emitAggregateSource();
  if (!fs.existsSync(OUTPUT_SOURCE) || fs.readFileSync(OUTPUT_SOURCE, "utf8") !== source)
    fs.writeFileSync(OUTPUT_SOURCE, source);
  return OUTPUT_SOURCE;
}

module.exports = { OUTPUT_SOURCE, emitAggregateSource, writeAggregateSource };

if (require.main === module) process.stdout.write(`${writeAggregateSource()}\n`);
