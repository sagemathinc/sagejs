#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true
const assert = require("node:assert/strict");
const {
  inputWordCapacity,
  integerWordLength,
  planIntegerBufferCapacities,
  precisionWordCapacity,
} = require("./integer_buffer_capacity_policy.cjs");

assert.equal(integerWordLength(0n), 1);
assert.equal(integerWordLength(-(1n << 64n)), 2);
assert.equal(inputWordCapacity([0n, (1n << 94041n)]), 1470);
assert.equal(precisionWordCapacity(192, 4), 16);
assert.equal(precisionWordCapacity(2176, 2), 128);

const entry = { effects: { externalWrites: ["smallMutable", "wideMutable"] } };
const names = [
  ["widePreparedProduct", "IntegerBuffer"],
  ["smallMutable", "IntegerBuffer"],
  ["wideMutable", "IntegerBuffer"],
  ["state", "Int64Buffer"],
];
const input = {
  widePreparedProduct: [1n << 94041n],
  smallMutable: [0n, 1n],
  wideMutable: [-(1n << 1087n)],
  state: [0n],
};
const plan = planIntegerBufferCapacities({
  entry,
  names,
  input,
  mutableWordCapacity: precisionWordCapacity(192, 4),
  maximumBytes: 32 * 1024,
});
assert.deepEqual(plan.capacities, {
  widePreparedProduct: 1470,
  smallMutable: 16,
  wideMutable: 17,
});
assert.deepEqual(plan.mutability, {
  widePreparedProduct: "read-only",
  smallMutable: "mutable",
  wideMutable: "mutable",
});
assert.equal(plan.bytes, 12168);

assert.throws(() => planIntegerBufferCapacities({
  entry, names, input, mutableWordCapacity: 16, maximumBytes: plan.bytes - 1,
}), /byte budget/);
assert.throws(() => planIntegerBufferCapacities({
  entry: {}, names, input, mutableWordCapacity: 16,
}), /externalWrites/);

console.log(JSON.stringify({
  schema: "sagejs.pari-class-group/integer-buffer-capacity-policy-check-v1",
  candidateMutableWords: precisionWordCapacity(192, 4),
  replayMutableWords: precisionWordCapacity(2176, 2),
  isolatedPreparedProductWords: plan.capacities.widePreparedProduct,
  syntheticOwnerBytes: plan.bytes,
}));
