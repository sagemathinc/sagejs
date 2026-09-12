// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, validate, requests, smokeIds, hash, jsonl} = require("./freeze.cjs");
const data = load();
function mutated(change, rehash = true) {
  const copy = structuredClone(data);
  change(copy);
  if (rehash) {
    copy.manifest.coverage_sha256 = hash(jsonl(copy.fields));
    copy.manifest.observations_sha256 = hash(jsonl(copy.observations));
  }
  return () => validate(copy.fields, copy.manifest, copy.observations);
}

test("frozen field membership has exact degree,role,signature and discovery quotas", () => {
  assert.deepEqual(validate(data.fields, data.manifest, data.observations), {coverage: 1800, performance: 360, smoke: 90, one: 152, ten: 46});
  assert.equal(data.manifest.m0_complete, false);
  assert.equal(data.manifest.performance_qualified, false);
  assert.equal(data.fields.filter((r) => r.class_number === null).length, 89);
  assert.equal(data.observations.filter((r) => !r.paired).length, 87);
});
test("smoke covers every signature and never opens holdouts", () => {
  const smoke = new Set(data.manifest.smoke_ids);
  const rows = data.fields.filter((r) => smoke.has(r.id));
  assert.equal(rows.length, 90);
  assert.ok(rows.every((r) => r.role === "development"));
  assert.equal(new Set(rows.map((r) => JSON.stringify([r.degree, r.signature]))).size, 34);
  assert.deepEqual(smokeIds(data.fields.toReversed()), data.manifest.smoke_ids);
});
test("runtime requests carry only labels and coefficients, not expected answers", () => {
  for (const [set, count] of [["smoke", 90], ["development", 1080], ["development-performance", 216]]) {
    const result = requests(data, set);
    assert.equal(result.length, count);
    assert.ok(result.every((r) => Object.keys(r).sort().join(",") === "coefficients,label"));
  }
  assert.throws(() => requests(data, "holdout"), /candidate-freeze/);
  assert.throws(() => requests(data, "all"), /candidate-freeze/);
  const first = requests(data)[0];
  first.coefficients[0] = "999";
  assert.notEqual(requests(data)[0].coefficients[0], "999");
});
test("content hashes reject unrecorded fixture mutation", () => {
  assert.throws(mutated((d) => {d.fields[0].class_number = "999";}, false), /coverage content hash/);
  assert.throws(mutated((d) => {d.observations[0].status = "invented";}, false), /observations content hash/);
});
test("structural checks reject duplicate identities and altered exact inputs", () => {
  assert.throws(mutated((d) => {d.fields[0].id = d.fields[1].id;}));
  assert.throws(mutated((d) => {d.fields[0].coefficients[0] = "999";}));
  assert.throws(mutated((d) => {d.fields[0].signature = [0, 0];}));
  assert.throws(mutated((d) => {d.fields[0].coefficients[0] = "01";}));
});
test("development-only generated entries cannot be moved to holdout", () => {
  assert.throws(mutated((d) => {
    d.fields.find((r) => r.source.declared_role === "development-only").role = "holdout";
  }));
});
test("panel members require actual successful reference evidence", () => {
  assert.throws(mutated((d) => {
    const selected = d.fields.find((r) => r.performance);
    d.observations.find((r) => r.id === selected.id).paired = false;
  }));
  assert.throws(mutated((d) => {
    const selected = d.fields.find((r) => r.performance);
    d.observations.find((r) => r.id === selected.id).faster_worker_nanoseconds = "-1";
  }));
  assert.throws(mutated((d) => {d.observations.pop();}));
});
test("smoke membership and qualification status cannot drift", () => {
  assert.throws(mutated((d) => {d.manifest.smoke_ids[0] = d.fields.find((r) => r.role === "holdout").id;}));
  assert.throws(mutated((d) => {d.manifest.performance_qualified = true;}));
  assert.throws(mutated((d) => {d.manifest.m0_complete = true;}));
});
test("request export revalidates a mutated manifest before exposing any field", () => {
  const copy = structuredClone(data);
  copy.manifest.smoke_ids[0] = copy.fields.find((r) => r.role === "holdout").id;
  assert.throws(() => requests(copy, "smoke"));
});
test("accepted source pins and plan authorization are mandatory", () => {
  assert.throws(mutated((d) => {d.manifest.source_pins = {};}));
  assert.throws(mutated((d) => {d.manifest.selection_uses_sagejs_results = true;}));
  assert.throws(mutated((d) => {d.manifest.optimization_campaign_limit = 99;}));
});
test("paired metadata cannot drift even with a recomputed fixture digest", () => {
  const smoke = new Set(data.manifest.smoke_ids);
  const id = data.fields.find((r) => r.performance && !smoke.has(r.id)).id;
  assert.throws(mutated((d) => {
    const row = d.fields.find((r) => r.id === id);
    row.discriminant = String(4n * BigInt(row.discriminant));
  }));
});
