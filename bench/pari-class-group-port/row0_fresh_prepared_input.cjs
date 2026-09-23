"use strict";

// Allocate the resident row-0 graph solely from the authenticated normalized
// prepared-NF projection.  Every other argument is fresh capacity derived from
// the reviewed resident owner manifest; no retained relation, HNF, W0, or
// terminal owner enters this boundary.

const assert = require("node:assert/strict");

const manifest = require("./resident_candidate_owner_manifest.cjs");
const unified = require("./h1_unified_complete_adapter.cjs");

function residentCapacities() {
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
  assert(prepared && typeof prepared === "object" && !Array.isArray(prepared));
  const specification = unified.rootSpecification();
  const capacity = residentCapacities();
  const explicit = Object.fromEntries(Object.entries(prepared).map(
    ([name, value]) => [name, structuredClone(value)]));
  const input = Object.fromEntries(specification.residentNames.map(([name, kind]) => {
    if (Object.hasOwn(explicit, name)) return [name, explicit[name]];
    assert(kind.endsWith("Buffer"), `unclassified row-0 scalar ${name}`);
    assert(Number.isInteger(capacity[name]) && capacity[name] >= 0,
      `unclassified row-0 capacity ${name}`);
    return [name, Array(capacity[name]).fill(0)];
  }));
  // These are output/work owners, not imported analytic answers.  Poisoning
  // their initial cells ensures the live root actually overwrites them.
  input.accept_inverse_hr = [-991, -992, -993];
  input.analytic_log_discriminant = [-999];
  return { input, names: specification.residentNames };
}

module.exports = { makeFreshInput, residentCapacities };
