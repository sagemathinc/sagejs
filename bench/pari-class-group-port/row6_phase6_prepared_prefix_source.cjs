"use strict";

// Generate the connected prepared-input factor-base -> initial-relation root.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FACTOR_FILE = "row6_prepared_factor_base_root.py";
const FACTOR_NAME = "pari_row6_prepared_factor_base_root";
const INITIAL_FILE = "row6_prepared_initial_relations.py";
const INITIAL_NAME = "pari_row6_prepared_initial_relations";
const BORROWED_INITIAL = new Set([
  "polynomial", "discriminant", "real_places", "complex_pairs", "precision",
  "equation_index", "factor_state", "random_state", "rational_primes",
  "group_offsets", "group_counts", "group_complete", "ramification",
]);

function signature(filename, name) {
  const source = fs.readFileSync(path.join(__dirname, filename), "utf8");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\) -> int:`));
  assert(match, `missing ${name}`);
  return match[1].trim().split("\n").map(line => {
    const fields = line.trim().replace(/,$/, "").split(": ");
    assert.equal(fields.length, 2, line);
    return fields;
  });
}

function generate() {
  const factor = signature(FACTOR_FILE, FACTOR_NAME);
  const initial = signature(INITIAL_FILE, INITIAL_NAME);
  const lines = [
    '"""Generated connected row-6 prepared factor/initial prefix."""',
    "",
    "from sagejs.native import Float64Buffer, IntegerBuffer, integer_buffer_view, native",
    `from .${FACTOR_FILE.replace(/\.py$/, "")} import ${FACTOR_NAME}`,
    `from .${INITIAL_FILE.replace(/\.py$/, "")} import ${INITIAL_NAME}`,
    "", "", "@native", "def pari_row6_phase6_prepared_prefix_root(",
  ];
  for (const [name, kind] of factor) lines.push(`    factor_${name}: ${kind},`);
  for (const [name, kind] of initial)
    if (!BORROWED_INITIAL.has(name)) lines.push(`    initial_${name}: ${kind},`);
  lines.push(") -> int:", '    """Run factor selection and initial relations without a host owner boundary."""');
  lines.push(`    count = ${FACTOR_NAME}(`);
  for (const [name] of factor) lines.push(`        factor_${name},`);
  lines.push("    )", "    if count != 1130:", "        return 1");
  const aliases = {
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
  lines.push(`    initial_count = ${INITIAL_NAME}(`);
  for (const [name] of initial)
    lines.push(`        ${aliases[name] || `initial_${name}`},`);
  lines.push("    )", "    if initial_count != 203:", "        return 2",
    "    return 0", "", "", '__all__ = ["pari_row6_phase6_prepared_prefix_root"]', "");
  return lines.join("\n");
}

if (require.main === module) process.stdout.write(generate());
module.exports = { generate, signature };
