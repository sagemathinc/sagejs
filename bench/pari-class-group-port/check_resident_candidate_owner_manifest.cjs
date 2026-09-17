#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("./resident_candidate_owner_manifest.cjs");

const sourcePath = path.join(__dirname, "resident_generated_class_attempt.py");
const source = fs.readFileSync(sourcePath, "utf8");
const rootChecker = fs.readFileSync(path.join(
  __dirname, "check_resident_generated_class_attempt.cjs"), "utf8");
assert.match(rootChecker, /resident_candidate_owner_manifest\.cjs/);
assert.doesNotMatch(rootChecker,
  /Object\.entries\(raw\).*\.length|Object\.entries\(a\).*\.length/,
  "unified root still derives logical owner capacity from a fixture");
const signature = source.match(
  /def pari_resident_generated_class_attempt\(([\s\S]*?)\n\)/,
)[1].trim().split("\n").map(line =>
  line.trim().replace(/,$/, "").split(": "));

function primeCount(limit) {
  const sieve = new Uint8Array(limit + 1).fill(1);
  sieve[0] = 0;
  sieve[1] = 0;
  for (let prime = 2; prime * prime <= limit; prime += 1) {
    if (!sieve[prime]) continue;
    for (let multiple = prime * prime; multiple <= limit; multiple += prime)
      sieve[multiple] = 0;
  }
  let count = 0;
  for (let value = 2; value <= limit; value += 1) count += sieve[value];
  return count;
}

const dimensions = manifest.dimensions;
const catalogPrimeCount = primeCount(dimensions.catalog_prime_ceiling);
const runtimePrimeCount = primeCount(dimensions.runtime_prime_ceiling);
assert.equal(catalogPrimeCount, 1230);
assert.equal(runtimePrimeCount, 6543);

const expectedLengths = {
  length_3: dimensions.degree,
  length_4: dimensions.degree + 1,
  length_9: dimensions.degree ** 2,
  length_12: dimensions.degree * (dimensions.degree + 1),
  length_18: 2 * dimensions.degree ** 2,
  length_21: 7 * dimensions.degree,
  length_27: dimensions.degree ** 3,
  length_30: dimensions.degree * (dimensions.degree ** 2 + 1),
  length_36: 4 * dimensions.degree ** 2,
  length_48: dimensions.degree * (4 + dimensions.degree + dimensions.degree ** 2),
  length_66: dimensions.factor_base_budget,
  length_594: dimensions.degree ** 2 * dimensions.factor_base_budget,
  length_780: dimensions.relation_row_budget,
  length_1230: catalogPrimeCount,
  length_1231: catalogPrimeCount + 1,
  length_1232: catalogPrimeCount + 2,
  length_2340: dimensions.degree * dimensions.relation_row_budget,
  length_3690: dimensions.degree * catalogPrimeCount,
  catalog_slots: dimensions.degree * catalogPrimeCount,
  length_4096: dimensions.acceptance_entry_budget,
  length_4356: dimensions.factor_base_budget ** 2,
  length_6543: runtimePrimeCount,
  length_10008: dimensions.catalog_prime_ceiling + 1,
  length_11070: dimensions.degree ** 2 * catalogPrimeCount,
  sub_stack: 3 * dimensions.degree * catalogPrimeCount + 3,
  length_16380: 7 * dimensions.degree * dimensions.relation_row_budget,
  length_19321: dimensions.hnf_dimension_budget ** 2,
  length_33210: dimensions.degree ** 3 * catalogPrimeCount,
  length_51480: dimensions.factor_base_budget * dimensions.relation_row_budget,
  length_160000: dimensions.cup_entry_budget,
};
for (const [rule, expected] of Object.entries(expectedLengths))
  assert.equal(manifest.length_rules[rule].length, expected, rule);

const allowedDerivations = new Set([
  "prepared_nf_dimension", "source_constant", "catalog_ceiling",
  "resource_ceiling", "predeclared_budget",
]);
let fixtureDerivedCapacity = 0;
for (const [name, rule] of Object.entries(manifest.length_rules)) {
  assert(allowedDerivations.has(rule.derivation), `invalid derivation: ${name}`);
  if (rule.derivation === "fixture_derived_capacity") fixtureDerivedCapacity += 1;
  assert(rule.length === null || Number.isSafeInteger(rule.length) && rule.length >= 0,
    `invalid resolved length: ${name}`);
}

const owners = new Map();
for (const group of manifest.owner_groups) {
  assert(Object.hasOwn(manifest.length_rules, group.length_rule),
    `unknown length rule: ${group.length_rule}`);
  assert(Object.hasOwn(manifest.capacity_rules, group.capacity),
    `unknown capacity rule: ${group.capacity}`);
  for (const name of group.owners) {
    assert(!owners.has(name), `duplicate owner: ${name}`);
    owners.set(name, {
      kind: group.kind,
      length: manifest.length_rules[group.length_rule].length,
      derivation: manifest.length_rules[group.length_rule].derivation,
      capacity: group.capacity,
    });
  }
}

assert.equal(signature.length, 351);
assert.equal(owners.size, 351);
for (const [name, kind] of signature) {
  assert(owners.has(name), `unclassified owner: ${name}`);
  const owner = owners.get(name);
  assert.equal(owner.kind, kind, `stale owner kind: ${name}`);
  if (kind.endsWith("Buffer")) assert(Number.isSafeInteger(owner.length));
  else assert.equal(owner.length, null, `scalar has a logical length: ${name}`);
  if (kind === "IntegerBuffer")
    assert(["prepared_input_exact", "mutable_p192"].includes(owner.capacity));
  else if (kind === "Int64Buffer") assert.equal(owner.capacity, "int64");
  else if (kind === "Float64Buffer") assert.equal(owner.capacity, "float64");
  else assert.equal(owner.capacity, "scalar");
}

// These were previously inherited from fixture array lengths.  Their new
// capacities must follow the catalog frontier even when a successful run used
// fewer live entries.
for (const name of [
  "relation", "relation_primes", "ramification", "search_ideals",
  "packet_ids", "packet_norms", "hnf_perm", "class_invariants",
  "admission_group_e", "admission_group_f", "admission_group_inert",
  "prep_bad", "prep_sub_order", "prep_sub_scratch", "prep_sub_chosen",
  "prep_sub_rejected", "initial_primes", "initial_offsets", "initial_counts",
  "initial_complete",
]) assert.equal(owners.get(name).length, dimensions.degree * catalogPrimeCount, name);
assert.equal(owners.get("prep_sub_stack").length,
  3 * dimensions.degree * catalogPrimeCount + 3);

assert.equal(fixtureDerivedCapacity, 0);
const counts = { int: 0, IntegerBuffer: 0, Int64Buffer: 0, Float64Buffer: 0 };
for (const owner of owners.values()) counts[owner.kind] += 1;
console.log(JSON.stringify({
  schema: "sagejs.pari-class-group/resident-candidate-owner-manifest-check-v1",
  owners: owners.size,
  counts,
  catalogPrimeCount,
  runtimePrimeCount,
  catalogSlots: dimensions.degree * catalogPrimeCount,
  fixture_derived_capacity: fixtureDerivedCapacity,
}));
