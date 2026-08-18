#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { cpus, loadavg, release, tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const sagejs = resolve(process.env.SAGEJS_BIN || join(root, "bin", "sagejs"));
const samples = Number(process.env.SAGEJS_NF_PUBLIC_HOOK_SAMPLES || 7);
const warmups = Number(process.env.SAGEJS_NF_PUBLIC_HOOK_WARMUPS || 3);
assert(Number.isSafeInteger(samples) && samples >= 3);
assert(Number.isSafeInteger(warmups) && warmups >= 0);

const temporary = mkdtempSync(join(tmpdir(), "sagejs-nf-public-hook-"));
const program = join(temporary, "benchmark.py");

try {
  writeFileSync(program, `
import json
import time
import sagejs.number_fields.maximal_order_engine as engine

identifiers = ${JSON.stringify([
    "motivating-degree-7",
    "sage-essential-discriminant",
    "lmfdb-3.1.431.1",
    "lmfdb-5.1.17161.1",
    "pari-2510",
    "pari-1710",
  ])}
coefficient_cases = ${JSON.stringify([
    [3, -2, 0, 0, 0, 0, 0, 1],
    [8, -2, 1, 1],
    [-8, -1, 0, 1],
    [2, 1, -1, 2, -1, 1],
    [3136, 0, -3136, 0, 840, 0, -56, 0, 1],
    [-25772600, 0, 0, 0, 0, -29080, 0, 0, 0, 0, 1],
  ])}
round_cases = [3, 3, 3, 2, 1, 1]
samples = ${samples}
warmups = ${warmups}
ring = PolynomialRing(QQ, "x")
saved_hook = engine._authenticated_default_field_analysis
saved_analysis = engine.field_analysis_resource.native_field_analysis
saved_order = engine.native_order_from_polynomial

def median(values):
    return sorted(values)[len(values) // 2]

def measure(operation, rounds):
    for unused in range(warmups):
        operation()
    values = []
    for unused in range(samples):
        started = time.perf_counter()
        for repeat in range(rounds):
            operation()
        values.append(1000 * (time.perf_counter() - started) / rounds)
    return {"medianMs": median(values), "samplesMs": values}

def public_order(coefficients):
    field = NumberField(ring(coefficients), "a")
    order = field.maximal_order()
    assert order.is_maximal()
    return order

results = []
for identifier, coefficients, rounds in zip(
    identifiers, coefficient_cases, round_cases
):
    engine._authenticated_default_field_analysis = saved_hook
    fused_probe = public_order(coefficients)
    engine._authenticated_default_field_analysis = lambda *args: None
    control_probe = public_order(coefficients)
    assert fused_probe.basis_matrix() == control_probe.basis_matrix()
    assert fused_probe.discriminant() == control_probe.discriminant()
    assert fused_probe.maximality_certificate() == control_probe.maximality_certificate()

    engine._authenticated_default_field_analysis = lambda *args: None
    control = measure(lambda: public_order(coefficients), rounds)
    engine._authenticated_default_field_analysis = saved_hook
    fused = measure(lambda: public_order(coefficients), rounds)

    analysis_calls = [0]
    order_calls = [0]
    def counted_analysis(*args):
        analysis_calls[0] = analysis_calls[0] + 1
        return saved_analysis(*args)
    def counted_order(*args):
        order_calls[0] = order_calls[0] + 1
        return saved_order(*args)
    engine.field_analysis_resource.native_field_analysis = counted_analysis
    engine.native_order_from_polynomial = counted_order
    public_order(coefficients)
    engine.field_analysis_resource.native_field_analysis = saved_analysis
    engine.native_order_from_polynomial = saved_order

    results.append({
        "id": identifier,
        "roundsPerSample": rounds,
        "establishedPublic": control,
        "fusedPublic": fused,
        "speedup": control["medianMs"] / fused["medianMs"],
        "fusedAnalysisCalls": analysis_calls[0],
        "fusedOrderResourceCalls": order_calls[0],
        "certificateEqual": True,
    })

engine._authenticated_default_field_analysis = saved_hook
print(json.dumps({
    "schema": "sagejs.number-fields/field-analysis-public-hook-benchmark-v1",
    "samples": samples,
    "warmups": warmups,
    "results": results,
}))
`);

  const executed = spawnSync(process.execPath, [sagejs, program], {
    cwd: root,
    encoding: "utf8",
    timeout: 300_000,
    env: {
      ...process.env,
      OPENBLAS_NUM_THREADS: "1",
      OMP_NUM_THREADS: "1",
    },
  });
  assert.equal(
    executed.status,
    0,
    `public-hook benchmark failed\n${executed.stdout}\n${executed.stderr}`,
  );
  const report = JSON.parse(executed.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(
    report.schema,
    "sagejs.number-fields/field-analysis-public-hook-benchmark-v1",
  );
  for (const result of report.results) {
    assert.equal(result.fusedAnalysisCalls, 1);
    assert.equal(result.fusedOrderResourceCalls, 0);
    assert.equal(result.certificateEqual, true);
  }
  report.environment = {
    platform: process.platform,
    architecture: process.arch,
    release: release(),
    cpu: cpus()[0]?.model || "unknown",
    logicalCpus: cpus().length,
    loadAverage: loadavg(),
    node: process.version,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
