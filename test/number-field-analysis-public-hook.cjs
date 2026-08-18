#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test(
  "authenticated field analysis preserves the canonical public result",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(
        [
          "R.<x> = QQ[]",
          "import sagejs.number_fields.maximal_order_engine as engine",
          "import sagejs.number_fields.maximal_order_certification as certification",
          "analysis_calls = []",
          "order_calls = []",
          "lattice_calls = []",
          "saved_analysis = engine.field_analysis_resource._native_field_analysis_projection_from_polynomial_bound",
          "saved_order = engine.native_order_from_polynomial",
          "saved_lattice = certification.check_order_lattice",
          "def counted_analysis(resource, coefficients, scale, bound):",
          "    analysis_calls.append((tuple(coefficients), scale, bound))",
          "    return saved_analysis(resource, coefficients, scale, bound)",
          "def counted_order(coefficients, primes):",
          "    order_calls.append((tuple(coefficients), tuple(primes)))",
          "    return saved_order(coefficients, primes)",
          "def counted_lattice(*args):",
          "    lattice_calls.append(args)",
          "    return saved_lattice(*args)",
          "engine.field_analysis_resource._native_field_analysis_projection_from_polynomial_bound = counted_analysis",
          "engine.native_order_from_polynomial = counted_order",
          "certification.check_order_lattice = counted_lattice",
          "Kfast.<a> = NumberField(x^3 - 2)",
          "fast = Kfast.maximal_order()",
          "cached = Kfast.maximal_order()",
          "fast_lattice_calls = len(lattice_calls)",
          "Kcontrol.<b> = NumberField(x^3 - 2)",
          "control = Kcontrol.maximal_order(trace=True)",
          "control_lattice_calls = len(lattice_calls) - fast_lattice_calls",
          "fast_certificate = fast.maximality_certificate()",
          "control_certificate = control.maximality_certificate()",
          "summary = [len(analysis_calls), len(order_calls), fast_lattice_calls, control_lattice_calls > 0, fast.is_maximal(), fast.basis_matrix() == control.basis_matrix(), fast.discriminant() == control.discriminant(), fast_certificate == control_certificate, cached is fast, fast.maximal_order_trace() == {'schema': 'sagejs.number-fields/maximal-order-trace-v1', 'enabled': False, 'events': []}, control.maximal_order_trace()['enabled'], fast_certificate['component_certificate'] == control_certificate['component_certificate']]",
          "engine.field_analysis_resource._native_field_analysis_projection_from_polynomial_bound = saved_analysis",
          "engine.native_order_from_polynomial = saved_order",
          "certification.check_order_lattice = saved_lattice",
          "summary",
        ].join("\n"),
      );
      assert.equal(
        result.repr,
        "[1, 2, 0, True, True, True, True, True, True, True, True, True]",
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "forced paths and uncertified resources retain the established fallback",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(
        [
          "R.<x> = QQ[]",
          "import sagejs.number_fields.maximal_order_engine as engine",
          "from sagejs.number_fields.field_analysis_resource import ANALYSIS_FALLBACK_UNRESOLVED, ANALYSIS_FALLBACK_ARBITRARY_PRIME, ANALYSIS_FALLBACK_NATIVE_FAILURE",
          "saved_analysis = engine.field_analysis_resource._native_field_analysis_projection_from_polynomial_bound",
          "saved_is_compiled = engine.is_compiled",
          "analysis_calls = []",
          "def forbidden_analysis(*args):",
          "    analysis_calls.append(args)",
          "    raise AssertionError('a bypass entered fused field analysis')",
          "engine.field_analysis_resource._native_field_analysis_projection_from_polynomial_bound = forbidden_analysis",
          "engine.is_compiled = lambda checker: False",
          "Kmissing.<a> = NumberField(x^3 - 2)",
          "missing_order = Kmissing.maximal_order()",
          "missing_cached = Kmissing.maximal_order()",
          "engine.is_compiled = saved_is_compiled",
          "bypass_orders = []",
          "Ktrace.<a> = NumberField(x^3 + x^2 - 2*x + 8)",
          "bypass_orders.append(Ktrace.maximal_order(trace=True))",
          "Klocal.<a> = NumberField(x^3 + x^2 - 2*x + 8)",
          "bypass_orders.append(Klocal.maximal_order(v=2))",
          "for algorithm in ['round2', 'polygon', 'round4', 'native']:",
          "    Kforced.<a> = NumberField(x^3 + x^2 - 2*x + 8)",
          "    bypass_orders.append(Kforced.maximal_order(algorithm=algorithm))",
          "Kom.<a> = NumberField(x^2 - 8)",
          "bypass_orders.append(Kom.maximal_order(algorithm='om-maxmin'))",
          "bypass_count = len(analysis_calls)",
          "class DeferredAnalysis:",
          "    def __init__(self, status):",
          "        self.status = status",
          "        self.certified = False",
          "fallback_orders = []",
          "fallback_labels = []",
          "def run_deferred(label, status):",
          "    def deferred(*args):",
          "        fallback_labels.append(label)",
          "        return DeferredAnalysis(status)",
          "    engine.field_analysis_resource._native_field_analysis_projection_from_polynomial_bound = deferred",
          "    K.<a> = NumberField(x^3 - 2)",
          "    order = K.maximal_order()",
          "    fallback_orders.append((order, K.maximal_order(), order.maximality_certificate()))",
          "run_deferred('partial', ANALYSIS_FALLBACK_UNRESOLVED)",
          "run_deferred('arbitrary', ANALYSIS_FALLBACK_ARBITRARY_PRIME)",
          "run_deferred('native-failure', ANALYSIS_FALLBACK_NATIVE_FAILURE)",
          "def corrupt(*args):",
          "    fallback_labels.append('corrupt')",
          "    raise ValueError('corrupt field-analysis payload')",
          "engine.field_analysis_resource._native_field_analysis_projection_from_polynomial_bound = corrupt",
          "Kcorrupt.<a> = NumberField(x^3 - 2)",
          "corrupt_order = Kcorrupt.maximal_order()",
          "corrupt_cached = Kcorrupt.maximal_order()",
          "fallback_orders.append((corrupt_order, corrupt_cached, corrupt_order.maximality_certificate()))",
          "class ForgedAnalysis:",
          "    certified = True",
          "    polynomial = (-3, 0, 0, 1)",
          "    scale = 1",
          "    trial_bound = 1000",
          "    equation_discriminant = -108",
          "def forged(*args):",
          "    fallback_labels.append('forged')",
          "    return ForgedAnalysis()",
          "engine.field_analysis_resource._native_field_analysis_projection_from_polynomial_bound = forged",
          "Kforged.<a> = NumberField(x^3 - 2)",
          "forged_order = Kforged.maximal_order()",
          "fallback_orders.append((forged_order, Kforged.maximal_order(), forged_order.maximality_certificate()))",
          "engine.field_analysis_resource._native_field_analysis_projection_from_polynomial_bound = saved_analysis",
          "fallback_ok = all(order.is_maximal() and cached is order and certificate['certified'] for order, cached, certificate in fallback_orders)",
          "[bypass_count, missing_order.is_maximal(), missing_cached is missing_order, len(bypass_orders), bypass_orders[0].maximal_order_trace()['enabled'], bypass_orders[1].is_maximal(), fallback_labels, fallback_ok, corrupt_cached is corrupt_order, forged_order.discriminant()]",
        ].join("\n"),
      );
      assert.equal(
        result.repr,
        "[0, True, True, 7, True, False, ['partial', 'arbitrary', 'native-failure', 'corrupt', 'forged'], True, True, -108]",
      );
    } finally {
      await session.close();
    }
  },
);
