#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { cpus, platform, release, arch } = require("node:os");
const { join } = require("node:path");

const root = process.env.SAGEJS_BENCH_ROOT || join(__dirname, "..");
const { createSage } = require(join(root, "dist", "tools", "kernel.js"));
const sampleIndex = process.argv.indexOf("--samples");
const samples = sampleIndex < 0 ? 21 : Number(process.argv[sampleIndex + 1]);
if (!Number.isInteger(samples) || samples < 3) {
  throw new Error("--samples must be an integer of at least 3");
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function digest(path) {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function summarize(rows) {
  const keys = Object.keys(rows[0]);
  const medians = {};
  for (const key of keys) medians[key] = median(rows.map((row) => row[key]));
  return { medians_ns: medians, raw_samples_ns: rows };
}

async function main() {
  const session = await createSage();
  let payload;
  try {
    const evaluated = await session.evaluate(
      [
        "import json",
        "import time",
        "import sagejs.runtime as runtime",
        "R.<x> = QQ[]",
        "K_lazy = NumberField(x^2 - 8, 'lazy')",
        "nf_baselib = __import__('sagejs._baselib.number_fields', fromlist=['number_fields'])",
        "module_started = time.perf_counter_ns()",
        "eng = nf_baselib._nf_maximal_order_engine_module()",
        "lazy_module_ns = time.perf_counter_ns() - module_started",
        "first_started = time.perf_counter_ns()",
        "first_order = K_lazy.maximal_order()",
        "first_public_ns = time.perf_counter_ns() - first_started",
        "assert first_order.is_maximal()",
        "metrics = {'integral_polynomial': 0, 'equation_order': 0, 'decomposition': 0, 'local_selection': 0, 'native_resource': 0, 'certification': 0, 'internal_order_materialization': 0, 'basis_conversion': 0}",
        "orig_integral = eng._integral_polynomial_data",
        "def wrapped_integral(field):",
        "    started = time.perf_counter_ns()",
        "    result = orig_integral(field)",
        "    metrics['integral_polynomial'] = metrics['integral_polynomial'] + time.perf_counter_ns() - started",
        "    return result",
        "eng._integral_polynomial_data = wrapped_integral",
        "orig_decomposition = eng.decompose_discriminant",
        "def wrapped_decomposition(coefficients, discriminant, hints=None):",
        "    started = time.perf_counter_ns()",
        "    result = orig_decomposition(coefficients, discriminant, hints=hints)",
        "    metrics['decomposition'] = metrics['decomposition'] + time.perf_counter_ns() - started",
        "    return result",
        "eng.decompose_discriminant = wrapped_decomposition",
        "orig_proven = eng._proven_prime_components",
        "def wrapped_proven(decomposition, requested):",
        "    started = time.perf_counter_ns()",
        "    result = orig_proven(decomposition, requested)",
        "    metrics['local_selection'] = metrics['local_selection'] + time.perf_counter_ns() - started",
        "    return result",
        "eng._proven_prime_components = wrapped_proven",
        "orig_plan = eng._local_selection_plan",
        "def wrapped_plan(coefficients, discriminant, primes, algorithm, worker_capability=False):",
        "    started = time.perf_counter_ns()",
        "    result = orig_plan(coefficients, discriminant, primes, algorithm, worker_capability=worker_capability)",
        "    metrics['local_selection'] = metrics['local_selection'] + time.perf_counter_ns() - started",
        "    return result",
        "eng._local_selection_plan = wrapped_plan",
        "orig_native = eng.native_order_from_polynomial",
        "def wrapped_native(coefficients, primes):",
        "    started = time.perf_counter_ns()",
        "    result = orig_native(coefficients, primes)",
        "    metrics['native_resource'] = metrics['native_resource'] + time.perf_counter_ns() - started",
        "    return result",
        "eng.native_order_from_polynomial = wrapped_native",
        "orig_certify = eng.certify_global_order",
        "def wrapped_certify(adapter, order, decomposition, witnesses):",
        "    started = time.perf_counter_ns()",
        "    result = orig_certify(adapter, order, decomposition, witnesses)",
        "    metrics['certification'] = metrics['certification'] + time.perf_counter_ns() - started",
        "    return result",
        "eng.certify_global_order = wrapped_certify",
        "orig_materialize = eng._order_from_basis",
        "def wrapped_materialize(field, basis, scale, discriminant):",
        "    started = time.perf_counter_ns()",
        "    result = orig_materialize(field, basis, scale, discriminant)",
        "    metrics['internal_order_materialization'] = metrics['internal_order_materialization'] + time.perf_counter_ns() - started",
        "    return result",
        "eng._order_from_basis = wrapped_materialize",
        "orig_basis = eng._basis_from_order",
        "def wrapped_basis(order, scale):",
        "    started = time.perf_counter_ns()",
        "    result = orig_basis(order, scale)",
        "    metrics['basis_conversion'] = metrics['basis_conversion'] + time.perf_counter_ns() - started",
        "    return result",
        "eng._basis_from_order = wrapped_basis",
        "probe = NumberField(x^2 - 8, 'probe')",
        "number_field_type = type(probe)",
        "orig_equation_order = number_field_type.equation_order",
        "def wrapped_equation_order(self):",
        "    started = time.perf_counter_ns()",
        "    result = orig_equation_order(self)",
        "    metrics['equation_order'] = metrics['equation_order'] + time.perf_counter_ns() - started",
        "    return result",
        "number_field_type.equation_order = wrapped_equation_order",
        "case_specs = [",
        "    ('quadratic-p2', x^2 - 8, '[1, 1/2*a]', 8),",
        "    ('cubic-p2', x^3 + x^2 - 2*x + 8, '[1, 1/2*a^2 + 1/2*a, a^2]', -503),",
        "    ('degree7-ordinary', x^7 - 2*x + 3, '[1, a, a^2, a^3, a^4, a^5, a^6]', -594390879),",
        "    ('equation-maximal', x^3 - x - 1, '[1, a, a^2]', -23),",
        "]",
        `sample_count = ${samples}`,
        "case_results = []",
        "for case_name, polynomial, expected_basis, expected_discriminant in case_specs:",
        "    fields = [NumberField(polynomial, 'a') for _index in range(sample_count + 2)]",
        "    fields[0].maximal_order()",
        "    rows = []",
        "    for K in fields[2:]:",
        "        for key in metrics:",
        "            metrics[key] = 0",
        "        started = time.perf_counter_ns()",
        "        O = K.maximal_order()",
        "        total_ns = time.perf_counter_ns() - started",
        "        materialization_started = time.perf_counter_ns()",
        "        basis = O.basis()",
        "        discriminant = O.discriminant()",
        "        public_materialization_ns = time.perf_counter_ns() - materialization_started",
        "        assert str(basis) == expected_basis",
        "        assert discriminant == expected_discriminant",
        "        assert O.is_maximal()",
        "        assert O is K.ring_of_integers()",
        "        accounted = 0",
        "        for value in metrics.values():",
        "            accounted = accounted + value",
        "        row = dict(metrics)",
        "        row['public_total'] = total_ns",
        "        row['public_materialization'] = public_materialization_ns",
        "        row['control_residual'] = max(0, total_ns - accounted)",
        "        rows.append(row)",
        "    case_results.append({'id': case_name, 'expected_basis': expected_basis, 'expected_discriminant': expected_discriminant, 'rows': rows})",
        "maxmod = eng._maximal_order_module()",
        "def legacy_equation_order(field):",
        "    scale = runtime.bigint(1)",
        "    for coefficient in field._defining_coefficients:",
        "        scale = nf_baselib._nf_lcm(scale, coefficient._denominator)",
        "    integral_generator = field(scale) * field.gen()",
        "    rows = []",
        "    power = field.one()",
        "    for _index in range(field.degree()):",
        "        rows.append(nf_baselib._nf_coordinates(power, field.degree()))",
        "        power = power * integral_generator",
        "    order = nf_baselib.NumberFieldOrder(field, rows, False, False)",
        "    order._discriminant_cache = maxmod.integral_equation_polynomial(field).discriminant()",
        "    return order",
        "optimization_specs = case_specs + [('rational-scale', x^3 + QQ(1,2)*x + 1, '', -1760)]",
        "optimization_results = []",
        "optimization_samples = 51",
        "for case_name, polynomial, _expected_basis, _expected_discriminant in optimization_specs:",
        "    legacy_samples = []",
        "    optimized_samples = []",
        "    for _index in range(optimization_samples):",
        "        legacy_field = NumberField(polynomial, 'a')",
        "        maxmod.integral_equation_polynomial(legacy_field)",
        "        started = time.perf_counter_ns()",
        "        legacy_order = legacy_equation_order(legacy_field)",
        "        legacy_samples.append(time.perf_counter_ns() - started)",
        "        optimized_field = NumberField(polynomial, 'a')",
        "        maxmod.integral_equation_polynomial(optimized_field)",
        "        started = time.perf_counter_ns()",
        "        optimized_order = orig_equation_order(optimized_field)",
        "        optimized_samples.append(time.perf_counter_ns() - started)",
        "        assert legacy_order._basis_rows == optimized_order._basis_rows",
        "        assert legacy_order.discriminant() == optimized_order.discriminant()",
        "    optimization_results.append({'id': case_name, 'legacy_ns': legacy_samples, 'optimized_ns': optimized_samples})",
        "print(json.dumps({'lazy_module_ns': lazy_module_ns, 'first_public_ns': first_public_ns, 'cases': case_results, 'optimization_ab': optimization_results}))",
      ].join("\n"),
    );
    payload = JSON.parse(evaluated.stdout.trim().split("\n").at(-1));
  } finally {
    await session.close();
  }

  const nativePaths = [
    "packages/flint/build/generated-ffi/sagejs_flint_ffi.node",
    "packages/flint/build/Release/sagejs_flint.node",
  ];
  const report = {
    schema: "sagejs.benchmark/number-field-maximal-order-public-micro-v1",
    generated_at: new Date().toISOString(),
    provenance: {
      sagejs_commit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      node: process.version,
      platform: `${platform()}-${arch()}`,
      os_release: release(),
      cpu: cpus()[0]?.model ?? "unknown",
      native_artifacts: Object.fromEntries(
        nativePaths.map((path) => [path, digest(join(root, path))]),
      ),
      sage_oracle: "/home/user/bin/sagelite (Sage 10.8, PARI 2.17.3)",
    },
    policy: {
      samples,
      warmups_per_case: 1,
      field_construction: "outside every timed public sample",
      cache: "fresh field and uncached order for every sample",
      lazy_boundary:
        "engine module import and first native public call are recorded separately",
      instrumentation:
        "wrapped exact engine boundaries; medians are robust but include wrapper-clock overhead",
      public_gate_ns: 2_000_000,
    },
    lazy: {
      engine_module_import_ns: payload.lazy_module_ns,
      first_public_after_engine_import_ns: payload.first_public_ns,
    },
    cases: payload.cases.map((entry) => ({
      id: entry.id,
      oracle: {
        basis: entry.expected_basis,
        discriminant: entry.expected_discriminant,
      },
      ...summarize(entry.rows),
      public_gate_met: median(entry.rows.map((row) => row.public_total)) <= 2_000_000,
    })),
    optimization_ab: payload.optimization_ab.map((entry) => ({
      id: entry.id,
      boundary:
        "equation_order after the integral equation polynomial has been computed, matching public engine order",
      samples: entry.legacy_ns.length,
      legacy_median_ns: median(entry.legacy_ns),
      optimized_median_ns: median(entry.optimized_ns),
      speedup:
        median(entry.legacy_ns) / median(entry.optimized_ns),
      exact_lattice_and_discriminant_equal: true,
      legacy_raw_ns: entry.legacy_ns,
      optimized_raw_ns: entry.optimized_ns,
    })),
    interpretation:
      "The 2 ms gate applies to fresh uncached field objects after lazy loading. " +
      "Post-return basis materialization is separate. Exclusive wrapped stages and " +
      "the control residual explain the warm public total without moving work into field construction.",
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
