#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("strict Python decodes and owns the direct number-field order resource", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "from sagejs.number_fields.order_resource import native_order_from_polynomial",
      "r = native_order_from_polynomial([-5, 0, 1], [2])",
      "[r.complete, r.status, r.basis.numerator, r.basis.denominator,",
      " r.index, r.equation_discriminant, r.order_discriminant, r.fallback_prime]",
    ].join("\n"));
    assert.equal(result.repr, "[True, 0, [[1, 1], [0, 2]], 2, 2, 20, 5, 0]");

    const fallback = await session.evaluate([
      "from sagejs.number_fields.order_resource import native_order_from_polynomial",
      "p = 18446744073709551629",
      "r = native_order_from_polynomial([-p, 0, 1], [p])",
      "[r.complete, r.status, r.fallback_prime == p, r.resolved_primes]",
    ].join("\n"));
    assert.equal(fallback.repr, "[False, 1, True, 0]");

    const noStatusAccessor = await session.evaluate([
      "import sagejs.ffi.flint as flint",
      "saved_status_accessor = flint.number_field_order_resource_status",
      "def forbidden_status_accessor(resource):",
      "    raise AssertionError('the compact payload already carries its status')",
      "flint.number_field_order_resource_status = forbidden_status_accessor",
      "try:",
      "    r = native_order_from_polynomial([-5, 0, 1], [2])",
      "    answer = [r.complete, r.status, r.index]",
      "finally:",
      "    flint.number_field_order_resource_status = saved_status_accessor",
      "answer",
    ].join("\n"));
    assert.equal(noStatusAccessor.repr, "[True, 0, 2]");
  } finally {
    await session.close();
  }
});
