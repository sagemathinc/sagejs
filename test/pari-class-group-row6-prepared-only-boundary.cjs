#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../bench/pari-class-group-port");
const gate = require(path.join(ROOT, "row6_phase6_gate_prefix_host.cjs"));
const whole = require(path.join(ROOT, "row6_phase6_whole_prepared_host.cjs"));
const source = require(path.join(ROOT, "row6_phase6_gate_prefix_source.cjs"));

function sourceText(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

function test(name, fn) {
  try { fn(); process.stdout.write(`ok - ${name}\n`); }
  catch (error) { process.stderr.write(`not ok - ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

test("public preparation boundary has one argument", () => {
  assert.equal(gate.prepare.length, 1);
  assert.equal(gate.createProcessCoordinatorAdapter.length, 1);
  assert.equal(whole.prepare.length, 1);
  assert.equal(whole.createProcessCoordinatorAdapter.length, 1);
});

test("public hosts contain no serialized owner parameter", () => {
  for (const file of ["row6_phase6_gate_prefix_host.cjs",
    "row6_phase6_whole_prepared_host.cjs"]) {
    const text = sourceText(file);
    assert(!/\bfactorOwner\b|\binitialOwner\b/.test(text), file);
    assert(!/prepare\s*\([^)]*,/.test(text), file);
  }
});

test("layout is immutable and uses policy ceilings", () => {
  const layout = gate.ROW6_PREPARED_LAYOUT;
  assert.equal(layout.schema,
    "sagejs.pari-class-group/row6-prepared-only-layout-v1");
  assert(Object.isFrozen(layout));
  assert(Object.isFrozen(layout.dimensions));
  assert.equal(layout.dimensions.maxRelationColumns,
    layout.dimensions.maxFactorIdeals +
      layout.dimensions.maxAdditionalRelations);
  assert.equal(layout.dimensions.maxRelationCapacity,
    10 * layout.dimensions.maxRelationColumns + 50);
  assert(layout.appendCeilings.maxNewColumnsPerCheckpoint > 3);
  assert.equal(whole.ROW6_PREPARED_LAYOUT, layout);
  assert.equal(gate.STORAGE_PLAN_REVIEWED, false,
    "unsafe maximum allocation must remain fail-closed pending reuse review");
});

test("append storage does not encode observed 3 then 1 answer", () => {
  const lengths = gate.appendLayoutLengths();
  assert.equal(lengths.new_relations,
    gate.ROW6_PREPARED_LAYOUT.dimensions.maxFactorIdeals *
      gate.ROW6_PREPARED_LAYOUT.appendCeilings.maxNewColumnsPerCheckpoint);
  assert(lengths.new_relations > 3);
  assert.equal(lengths.result_c, 7 *
    gate.ROW6_PREPARED_LAYOUT.dimensions.places *
    gate.ROW6_PREPARED_LAYOUT.dimensions.maxRelationColumns);
});

test("native root derives logical state from live prefix", () => {
  const generated = sourceText("row6_phase6_gate_prefix_root.generated.py");
  assert(generated.includes("gate_outer_state[0] = relation_target - initial_count"));
  assert(generated.includes("factor_count = int(factor_root_state[3])"));
  assert(generated.includes("relation_capacity = 10 * relation_target + 50"));
  assert(generated.includes("int(initial_relation_state[0]),"));
  assert(generated.includes("int(factor_root_state[7]),"));
  assert(!generated.includes("        gate_scalar_prefix_count,\n    )"));
  assert.equal(generated, source.generate());
});

test("reverse append correction uses the live permutation split", () => {
  const ancestry = sourceText("row6_phase6_gate_ancestry_private.py");
  assert(ancestry.includes("int(permutation[lig + k])"));
  assert(!ancestry.includes("int(permutation[width + k])"));
  const factorCount = 1130;
  assert.equal(factorCount - 1124, 6, "append1 live permutation split");
  assert.equal(factorCount - 1127, 3, "append2 live permutation split");
});

test("computation sources contain no frozen row-6 trajectory dimensions", () => {
  for (const file of [
    "row6_phase6_gate_prefix_source.cjs",
    "row6_phase6_gate_prefix_root.generated.py",
    "row6_phase6_whole_prepared_source.cjs",
    "row6_phase6_whole_prepared_root.generated.py",
    "row6_phase6_gate_ancestry_private.py",
    "row6_phase6_resident_class_private.py",
    "row6_phase6_resident_unit_private.py",
  ]) {
    const text = sourceText(file);
    assert(!/\b(?:1130|1133|1136|1137|11420|1122|1124|1128|151|979)\b/.test(text), file);
    assert(!/gate_scalar_prefix_count|gate_initial_hnf_(?:columns|k0)/.test(text), file);
  }
});

test("prepared seed carries no relation or capacity fixture", () => {
  const marker = ["1", "2", "3"];
  const input = gate.preparedCollectorInput({ data: {
    admission_matrix_m: marker, admission_matrix_p: marker,
    admission_matrix_e: marker, preparation_rounded_embedding: marker,
    preparation_embedding: marker,
  } });
  for (const forbidden of ["relation_state", "relation_basis", "relation_records",
    "relation_hashes", "relation_metadata", "generators", "outer_state",
    "packet_ids", "packet_generators", "admission_prime_offsets"])
    assert.equal(input[forbidden], undefined, forbidden);
  assert.equal(input.scalar_prefix_count, 0);
});

test("extra owner-shaped boundary fields reject", () => {
  assert.throws(() => gate.validatePreparedOnlyBoundary({
    authoritySha256: "x", data: {}, factorOwner: {},
  }), /accepts only the prepared-number-field/);
  assert.throws(() => gate.validatePreparedOnlyBoundary({
    authoritySha256: "x", data: {}, initialOwner: {},
  }), /accepts only the prepared-number-field/);
  const nested = Object.fromEntries([
    "admission_factorlimit", "admission_matrix_e", "admission_matrix_m",
    "admission_matrix_p", "admission_prime_limit", "admission_primes",
    "admission_products", "admission_real_count", "analytic_discriminant",
    "analytic_primes", "analytic_roots_of_unity", "basis_table", "n",
    "precision", "prep_index", "prep_invzk", "prep_polynomial", "prep_zk",
    "prep_zk_degrees", "prep_zkden", "preparation_embedding",
    "preparation_rounded_embedding",
  ].map(key => [key, null]));
  nested.relationCapacity = 1;
  assert.throws(() => gate.validatePreparedOnlyBoundary({
    authoritySha256: "x", data: nested,
  }), /unreviewed field/);
  const exactKeys = { ...nested };
  delete exactKeys.relationCapacity;
  assert.doesNotThrow(() => gate.validatePreparedEnvelopeShape({
    authoritySha256: "authentic", data: exactKeys,
  }));
  assert.throws(() => gate.assertAuthenticatedEnvelope({
    authoritySha256: "forged", data: exactKeys,
  }, { sha256: "authentic" }), /authority is not authenticated data/);
});
