"use strict";

// Capacity-only allocation for the row-18 fresh prepared transaction.  The
// values come from authenticated prepared NF data; every other owner is new.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("./resident_candidate_owner_manifest.cjs");

const SOURCE = path.join(__dirname, "resident_generated_class_attempt.py");

function signature() {
  const source = fs.readFileSync(SOURCE, "utf8");
  const match = source.match(
    /def pari_resident_generated_class_attempt\(([\s\S]*?)\n\)/,
  );
  assert(match, "missing resident generated signature");
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

function capacities() {
  const result = {};
  for (const group of manifest.owner_groups) {
    const length = manifest.length_rules[group.length_rule].length;
    for (const name of group.owners) {
      if (group.kind.endsWith("Buffer")) result[name] = length;
    }
  }
  return result;
}

function makeFreshInput(prepared) {
  const names = signature();
  const capacity = capacities();
  const explicit = Object.fromEntries(Object.entries(prepared).map(
    ([name, value]) => [name, structuredClone(value)]));
  const input = Object.fromEntries(names.map(([name, kind]) => {
    if (Object.hasOwn(explicit, name)) return [name, explicit[name]];
    assert(kind.endsWith("Buffer"), `unclassified scalar ${name}`);
    assert(Number.isInteger(capacity[name]) && capacity[name] >= 0,
      `unclassified owner capacity ${name}`);
    return [name, Array(capacity[name]).fill(0)];
  }));
  // Sentinels prove that the analytic values are computed rather than passed.
  input.accept_inverse_hr = [-991, -992, -993];
  input.analytic_log_discriminant = [-999];
  return { input, names };
}

module.exports = { SOURCE, capacities, makeFreshInput, signature };
