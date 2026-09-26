"use strict";

const assert = require("node:assert/strict");

const shared = require("./row1_phase6_matched_kernel_host.cjs");

function factorProductWordCapacity(input) {
  assert(Array.isArray(input.analytic_primes) && input.analytic_primes.length > 0,
    "row 4 factor-product capacity requires the prepared prime catalog");
  let productBitBound = 0;
  for (const raw of input.analytic_primes) {
    const prime = BigInt(raw);
    assert(prime >= 2n, "row 4 prepared prime catalog must be positive");
    // The factor-base product is the product of a subset of this catalog.
    // Since p < 2^bit_length(p), the sum is a conservative bit bound for
    // every possible selected subset without precomputing the selection.
    productBitBound += prime.toString(2).length;
  }
  return Math.ceil(productBitBound / 64);
}

function ownerWordCapacity(name, input, inputWords) {
  if (name === "prep_base_state")
    return Math.max(inputWords, factorProductWordCapacity(input));
  return Math.max(16, inputWords);
}

function allocate(fn, names, input) {
  return Object.fromEntries(names.map(([name, kind]) => {
    const raw = input[name];
    assert.notEqual(raw, undefined, `missing root input ${name}`);
    if (!kind.endsWith("Buffer")) {
      return [name, kind === "bool" ? Boolean(raw) :
        kind === "float" ? Number(raw) : BigInt(raw)];
    }
    if (kind === "Float64Buffer")
      return [name, fn.createFloat64Buffer(raw.map(Number))];
    if (kind === "Int64Buffer")
      return [name, fn.createInt64Buffer(raw.map(BigInt))];
    const integers = raw.map(BigInt);
    const inputWords = integers.reduce((maximum, value) => {
      const absolute = value < 0n ? -value : value;
      return Math.max(maximum,
        Math.ceil(Math.max(1, absolute.toString(2).length) / 64) + 2);
    }, 1);
    return [name, fn.createIntegerBuffer(raw.length,
      ownerWordCapacity(name, input, inputWords), integers)];
  }));
}

module.exports = {
  ROW: 4,
  prepareInvocation(resident) {
    const generated = resident.config.makeFreshInput(resident.prepared);
    const names = generated.names;
    const input = generated.input || generated;
    assert(Array.isArray(names), "fresh input lacks the native ABI");
    return { names, owners: allocate(resident.fn, names, input),
      capacityPolicy: Object.freeze({ prepBaseStateWordCapacity:
        factorProductWordCapacity(input), preparedPrimeCount:
        input.analytic_primes.length }) };
  },
  prepareResident(prepared) { return shared.prepareResident(4, prepared); },
  projection: shared.projection,
  runInvocation: shared.runInvocation,
  factorProductWordCapacity,
  ownerWordCapacity,
};
