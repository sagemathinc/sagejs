#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("authenticated order bases and certificates materialize lazily", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "R.<x> = QQ[]",
      "K.<a> = NumberField(x^3 - 2)",
      "nf = __import__('sagejs._baselib.number_fields', fromlist=['number_fields'])",
      "source = [1, 0, 0, 0, 1, 0, 0, 0, 1]",
      "order = nf.NumberFieldOrder(K, [], False, False, (source, 1, 1))",
      "order._discriminant_cache = -108",
      "before = order._basis_rows_cache is None",
      "source[0] = 999",
      "certificate_calls = []",
      "def certificate_factory():",
      "    certificate_calls.append(True)",
      "    return {'version': 1, 'certified': True, 'basis_numerator': [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 'basis_denominator': 1}",
      "order._install_authenticated_maximal_order_certificate(certificate_factory)",
      "maximal_without_serialization = order.is_maximal() and len(certificate_calls) == 0",
      "matrix = order.basis_matrix()",
      "after_basis = order._basis_rows_cache is not None",
      "first_certificate = order.maximality_certificate()",
      "second_certificate = order.maximality_certificate()",
      "[before, maximal_without_serialization, matrix == identity_matrix(QQ, 3), after_basis, order.discriminant(), len(certificate_calls), first_certificate is second_certificate, order.is_maximal()]",
    ].join("\n"));
    assert.equal(
      result.repr,
      "[True, True, True, True, -108, 1, True, True]",
    );
  } finally {
    await session.close();
  }
});

test("malformed lazy basis and certificate inputs fail closed", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "R.<x> = QQ[]",
      "K.<a> = NumberField(x^3 - 2)",
      "nf = __import__('sagejs._baselib.number_fields', fromlist=['number_fields'])",
      "checks = []",
      "for projection in [([1, 0], 1, 1), ([1] * 9, 0, 1), ([1] * 9, 1, 0)]:",
      "    try:",
      "        nf.NumberFieldOrder(K, [], False, False, projection)",
      "    except ValueError:",
      "        checks.append(True)",
      "order = nf.NumberFieldOrder(K, [], False, False, ([1,0,0,0,1,0,0,0,1], 1, 1))",
      "try:",
      "    order._install_authenticated_maximal_order_certificate(lambda: {'certified': False})",
      "    order.maximality_certificate()",
      "except ArithmeticError:",
      "    checks.append(True)",
      "checks",
    ].join("\n"));
    assert.equal(result.repr, "[True, True, True, True]");
  } finally {
    await session.close();
  }
});
