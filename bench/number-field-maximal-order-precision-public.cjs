#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { arch, cpus, hostname, loadavg, platform, release } = require("node:os");
const { join, resolve } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const { verifyOracleResult } = require("../tools/number-field-maximal-order/verify.cjs");

const root = resolve(__dirname, "..");
const corpus = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const precisionCase = corpus.cases.find(
  (entry) => entry.id === "hecke-precision-degree-12",
);
assert.ok(precisionCase, "missing precision-sensitive corpus case");

const samples = Number(process.env.SAGEJS_NF_PRECISION_PUBLIC_SAMPLES ?? "3");
const includeTraceControl =
  process.env.SAGEJS_NF_PRECISION_PUBLIC_TRACE_CONTROL !== "0";
const thresholdMs = Number(
  process.env.SAGEJS_NF_PRECISION_PUBLIC_THRESHOLD_MS ?? "5000",
);
assert.ok(Number.isSafeInteger(samples) && samples >= 1);
assert.ok(Number.isFinite(thresholdMs) && thresholdMs > 0);

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function compactVerification(verification) {
  return {
    verified: verification.verified,
    errors: verification.errors,
    degree: verification.degree,
    equation_order_index: verification.equation_order_index,
    field_discriminant: verification.field_discriminant,
    canonical_basis_digest: verification.canonical_basis?.digest ?? null,
    basis_size_bytes: verification.basis_size_bytes,
    checks: verification.checks,
  };
}

function pythonSource() {
  return [
    "import json",
    "import time",
    "import sagejs.number_fields.maximal_order_engine as engine",
    "import sagejs.number_fields.field_analysis_resource as analysis_resource",
    "from sagejs.native import is_compiled",
    "from sagejs.number_fields.bl_composite_kernel import packed_composite_dedekind_basis_in_place, packed_order_table_in_place, packed_row_hnf_in_place",
    "from sagejs.number_fields.field_analysis_resource import packed_field_analysis_decode_integers, packed_field_analysis_fixed_points_are_valid",
    `coefficients = [${precisionCase.polynomial.coefficients.join(",")}]`,
    "ring = PolynomialRing(QQ, 'x')",
    "polynomial = ring(coefficients)",
    "NumberField(ring([-1, -1, 1]), 'warm').maximal_order()",
    "",
    "def rational_text(value):",
    "    return str(value.numerator()) + '/' + str(value.denominator())",
    "",
    "def materialize(order):",
    "    return [[rational_text(entry) for entry in element.list()] for element in order.basis()]",
    "",
    "def measure_default():",
    "    metrics = {}",
    "    calls = {}",
    "    originals = []",
    "    def instrument(owner, attribute, label):",
    "        original = getattr(owner, attribute)",
    "        def measured(*args, **kwds):",
    "            started = time.perf_counter_ns()",
    "            try:",
    "                return original(*args, **kwds)",
    "            finally:",
    "                metrics[label] = metrics.get(label, 0) + time.perf_counter_ns() - started",
    "                calls[label] = calls.get(label, 0) + 1",
    "        setattr(owner, attribute, measured)",
    "        originals.append((owner, attribute, original))",
    "    instrument(engine, '_authenticated_default_field_analysis', 'authenticated_field_analysis')",
    "    instrument(analysis_resource, 'native_field_analysis', 'native_field_analysis')",
    "    instrument(engine, '_order_from_basis', 'order_materialization')",
    "    instrument(engine, 'certify_global_order', 'global_certification')",
    "    field = NumberField(polynomial, 'a')",
    "    started = time.perf_counter_ns()",
    "    try:",
    "        order = field.maximal_order()",
    "        total_ns = time.perf_counter_ns() - started",
    "    finally:",
    "        for owner, attribute, original in reversed(originals):",
    "            setattr(owner, attribute, original)",
    "    certificate = order.maximality_certificate()",
    "    return order, {'total_ns': total_ns, 'inclusive_stage_ns': metrics, 'calls': calls, 'certified': certificate['certified'], 'field_discriminant': str(order.discriminant()), 'equation_order_index': str(certificate['index']), 'trace': order.maximal_order_trace(), 'certificate_keys': sorted(certificate.keys())}",
    "",
    "default_rows = []",
    "default_order = None",
    `for _sample in range(${samples}):`,
    "    default_order, row = measure_default()",
    "    default_rows.append(row)",
    "",
    "trace_control = None",
    `if ${includeTraceControl ? "True" : "False"}:`,
    "    field = NumberField(polynomial, 'trace_control')",
    "    started = time.perf_counter_ns()",
    "    traced_order = field.maximal_order(trace=True)",
    "    total_ns = time.perf_counter_ns() - started",
    "    certificate = traced_order.maximality_certificate()",
    "    trace_control = {'total_ns': total_ns, 'certified': certificate['certified'], 'field_discriminant': str(traced_order.discriminant()), 'equation_order_index': str(certificate['index']), 'stages': [{'stage': event['stage'], 'state': event['state'], 'duration_ns': event.get('duration_ns', 0)} for event in traced_order.maximal_order_trace()['events']], 'basis': materialize(traced_order)}",
    "",
    "compiled = {",
    "    'packed_row_hnf_in_place': is_compiled(packed_row_hnf_in_place),",
    "    'packed_composite_dedekind_basis_in_place': is_compiled(packed_composite_dedekind_basis_in_place),",
    "    'packed_order_table_in_place': is_compiled(packed_order_table_in_place),",
    "    'packed_field_analysis_fixed_points_are_valid': is_compiled(packed_field_analysis_fixed_points_are_valid),",
    "    'packed_field_analysis_decode_integers': is_compiled(packed_field_analysis_decode_integers),",
    "}",
    "print(json.dumps({'default_rows': default_rows, 'default_basis': materialize(default_order), 'trace_control': trace_control, 'compiled': compiled}, sort_keys=True))",
    "None",
  ].join("\n");
}

async function main() {
  const hostStarted = process.hrtime.bigint();
  const session = await createSage();
  let payload;
  try {
    const evaluated = await session.evaluate(pythonSource());
    payload = JSON.parse(evaluated.stdout.trim().split(/\r?\n/).at(-1));
  } finally {
    await session.close();
  }
  const hostWallNs = Number(process.hrtime.bigint() - hostStarted);

  const caseSpec = {
    polynomial: { coefficients: precisionCase.polynomial.coefficients },
    expected: {
      polynomial_discriminant: precisionCase.equationDiscriminant,
      field_discriminant: precisionCase.fieldDiscriminant,
      equation_order_index: precisionCase.equationOrderIndex,
      canonical_basis_digest: precisionCase.basis.digest,
    },
  };
  const verify = (basis, fieldDiscriminant) =>
    verifyOracleResult(caseSpec, {
      irreducible_verified: true,
      basis,
      field_discriminant: fieldDiscriminant,
    });
  const defaultVerification = verify(
    payload.default_basis,
    payload.default_rows.at(-1).field_discriminant,
  );
  const traceVerification = payload.trace_control
    ? verify(payload.trace_control.basis, payload.trace_control.field_discriminant)
    : null;
  const timingsMs = payload.default_rows.map((row) => row.total_ns / 1e6);
  const medianMs = median(timingsMs);

  const report = {
    schema: "sagejs.number-fields/maximal-order-precision-public-v1",
    generated_at: new Date().toISOString(),
    identity: {
      source_commit: git(["rev-parse", "HEAD"]),
      source_tree: git(["rev-parse", "HEAD^{tree}"]),
      tracked_worktree_clean:
        git(["status", "--porcelain", "--untracked-files=no"]) === "",
      node: process.version,
      platform: `${platform()}-${arch()}`,
      release: release(),
      hostname: hostname(),
      cpu: cpus()[0]?.model ?? "unknown",
      logical_cpus: cpus().length,
      load_average: loadavg(),
    },
    policy: {
      boundary: "fresh NumberField.maximal_order() with default public arguments",
      field_construction: "outside every timed sample",
      runtime_warmup: "one unrelated quadratic public call; no target-field warmup",
      target_cache: "fresh field and uncached order for every sample",
      samples,
      threshold_ms: thresholdMs,
      trace_control:
        "fresh maximal_order(trace=True) diagnostic; this intentionally bypasses the fused default hook",
    },
    case: {
      id: precisionCase.id,
      degree: precisionCase.polynomial.degree,
      coefficient_height_bits: precisionCase.polynomial.coefficientHeightBits,
      polynomial_digest: precisionCase.polynomial.digest,
      frozen_basis_digest: precisionCase.basis.digest,
    },
    native_compiled: payload.compiled,
    default_public: {
      timings_ms: timingsMs,
      median_ms: medianMs,
      below_five_second_gate: medianMs < thresholdMs,
      raw_samples: payload.default_rows,
      verification: compactVerification(defaultVerification),
    },
    trace_control: payload.trace_control
      ? {
          total_ms: payload.trace_control.total_ns / 1e6,
          stages: payload.trace_control.stages.map((event) => ({
            ...event,
            duration_ms: event.duration_ns / 1e6,
          })),
          certified: payload.trace_control.certified,
          field_discriminant: payload.trace_control.field_discriminant,
          equation_order_index: payload.trace_control.equation_order_index,
          verification: compactVerification(traceVerification),
        }
      : null,
    host_wall_ms: hostWallNs / 1e6,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
