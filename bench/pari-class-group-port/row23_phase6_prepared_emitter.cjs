"use strict";

// Mechanical composer for the authenticated prepared-input -> exact units
// row-23 graph.  The emitted public ABI omits every retained factor answer:
// the private factor root writes those owners before the existing aggregate
// consumes them in the same native call.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FACTOR_SOURCE = path.join(__dirname,
  "row23_phase6_prepared_factor_root.py");
const AGGREGATE_SOURCE = path.join(__dirname,
  "row23_phase6_aggregate_root.py");
const OUTPUT_SOURCE = path.join(__dirname,
  "row23_phase6_prepared_root.generated.py");
const FACTOR_EXPORT = "pari_row23_phase6_prepared_factor_root";
const AGGREGATE_EXPORT = "pari_row23_phase6_aggregate_root";
const EXPORT = "pari_row23_phase6_prepared_root";

function signature(sourcePath, exportName) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const match = source.match(new RegExp(
    `def ${exportName}\\(([\\s\\S]*?)\\n\\) -> int:`));
  assert(match, `missing ${exportName} signature`);
  return match[1].trim().split("\n").map(line => {
    const clean = line.trim().replace(/,$/, "");
    const at = clean.indexOf(":");
    assert(at > 0, `invalid ${exportName} argument ${line}`);
    return [clean.slice(0, at), clean.slice(at + 1).trim()];
  });
}

const FACTOR_TO_AGGREGATE = Object.freeze({
  polynomial: "analytic_polynomial",
  basis_table: "basis_table",
  matrix_m: "admission_matrix_m",
  matrix_p: "admission_matrix_p",
  matrix_e: "admission_matrix_e",
  discriminant: "analytic_discriminant",
  selected_primes: "initial_primes",
  prime_offsets: "admission_prime_offsets",
  prime_counts: "admission_prime_counts",
  admission_group_tau: "admission_group_tau",
  admission_group_e: "admission_group_e",
  admission_group_f: "admission_group_f",
  admission_group_inert: "admission_group_inert",
  relation_primes: "relation_primes",
  ramification: "ramification",
  search_ideals: "search_ideals",
  packet_ids: "packet_ids",
  packet_ideals: "packet_ideals",
  packet_norms: "packet_norms",
  packet_primes: "packet_primes",
  packet_generators: "packet_generators",
  packet_inert: "packet_inert",
  initial_offsets: "initial_offsets",
  initial_counts: "initial_counts",
  initial_complete: "initial_complete",
  hnf_perm: "hnf_perm",
  outer_state: "outer_state",
  outer_minidx: "outer_minidx",
  outer_present: "outer_present",
  outer_live: "outer_live",
  outer_perm: "outer_perm",
  outer_multiplier: "outer_multiplier",
  subfactor: "subfactor",
});

const SHARED_FACTOR_NAMES = new Set(Object.keys(FACTOR_TO_AGGREGATE));

function publicFactorName(name) {
  return SHARED_FACTOR_NAMES.has(name) ? FACTOR_TO_AGGREGATE[name] :
    `factor_${name}`;
}

function emitPreparedSource() {
  const factor = signature(FACTOR_SOURCE, FACTOR_EXPORT);
  const aggregate = signature(AGGREGATE_SOURCE, AGGREGATE_EXPORT);
  const aggregateByName = new Map(aggregate);
  for (const [factorName, aggregateName] of Object.entries(FACTOR_TO_AGGREGATE)) {
    const factorType = factor.find(([name]) => name === factorName)?.[1];
    assert(factorType, `missing mapped factor argument ${factorName}`);
    assert.equal(aggregateByName.get(aggregateName), factorType,
      `mapped ABI kind differs for ${factorName}/${aggregateName}`);
  }

  const declarations = [];
  const seen = new Set();
  for (const [name, kind] of factor) {
    const publicName = publicFactorName(name);
    if (SHARED_FACTOR_NAMES.has(name)) continue;
    assert(!seen.has(publicName), `duplicate prepared ABI name ${publicName}`);
    seen.add(publicName); declarations.push([publicName, kind]);
  }
  for (const [name, kind] of aggregate) {
    if (name === "admission_factor_product") continue;
    assert(!seen.has(name), `duplicate prepared ABI name ${name}`);
    seen.add(name); declarations.push([name, kind]);
  }

  const factorArgs = factor.map(([name]) =>
    `        ${publicFactorName(name)},`).join("\n");
  const aggregateArgs = aggregate.map(([name]) =>
    `        ${name === "admission_factor_product" ?
      "factor_base_state[6]" : name},`).join("\n");
  const parameters = declarations.map(([name, kind]) =>
    `    ${name}: ${kind},`).join("\n");

  return `\"\"\"Generated authenticated prepared-input row-23 class/unit root.\"\"\"\n\n` +
`from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native\n` +
`from .row23_phase6_prepared_factor_root import ${FACTOR_EXPORT}\n` +
`from .row23_phase6_aggregate_root import ${AGGREGATE_EXPORT}\n\n\n` +
`@native\ndef ${EXPORT}(\n${parameters}\n) -> int:\n` +
`    if len(aggregate_state) < 4:\n` +
`        raise ValueError(\"short row-23 prepared aggregate state\")\n` +
`    for i in range(4):\n        aggregate_state[i] = 0\n` +
`    aggregate_state[0] = -2\n` +
`    status = ${FACTOR_EXPORT}(\n${factorArgs}\n    )\n` +
`    if status != 0:\n` +
`        aggregate_state[1] = status\n        return 10 + status\n` +
`    status = ${AGGREGATE_EXPORT}(\n${aggregateArgs}\n    )\n` +
`    if status != 0:\n        return 20 + status\n` +
`    return 0\n\n\n__all__ = [\"${EXPORT}\"]\n`;
}

function writePreparedSource() {
  const source = emitPreparedSource();
  if (!fs.existsSync(OUTPUT_SOURCE) ||
      fs.readFileSync(OUTPUT_SOURCE, "utf8") !== source)
    fs.writeFileSync(OUTPUT_SOURCE, source);
  return OUTPUT_SOURCE;
}

module.exports = { AGGREGATE_EXPORT, AGGREGATE_SOURCE, EXPORT,
  FACTOR_EXPORT, FACTOR_SOURCE, FACTOR_TO_AGGREGATE, OUTPUT_SOURCE,
  emitPreparedSource, publicFactorName, signature, writePreparedSource };

if (require.main === module) process.stdout.write(`${writePreparedSource()}\n`);
