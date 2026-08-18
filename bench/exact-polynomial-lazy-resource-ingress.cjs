#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { cpus, platform, arch } = require("node:os");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const samples = Number(process.env.SAGEJS_POLYNOMIAL_LAZY_INGRESS_SAMPLES || 9);
assert.ok(Number.isSafeInteger(samples) && samples >= 3 && samples % 2 === 1);

const source = String.raw`
import json
import time
import sagejs.runtime as runtime
import sagejs._baselib.polynomial as polynomial_module

samples = ${samples}
R = PolynomialRing(ZZ, "x")
values = []
for index in range(65):
    magnitude = 2 ** (169 + (index % 5) * 127) + 31 * index + 1
    values.append(-magnitude if index % 2 else magnitude)
values[-1] = 1
capacity = polynomial_module._integer_word_capacity(values)
expected = R(values)
expected_bytes = list(expected._packed_exact_polynomial())

elapsed = []
serialized = []
for sample in range(samples):
    storage = polynomial_module._FmpzPolynomialResourceStorage(
        runtime.undefined,
        runtime.integer_buffer(values, capacity),
    )
    candidate = polynomial_module.PolynomialElement(R, storage)
    started = time.perf_counter_ns()
    candidate._exact_polynomial_resource()
    elapsed.append(time.perf_counter_ns() - started)
    started = time.perf_counter_ns()
    candidate_bytes = list(candidate._packed_exact_polynomial())
    serialized.append(time.perf_counter_ns() - started)
    assert candidate_bytes == expected_bytes
    assert candidate == expected

print(json.dumps({
    "schema": "sagejs.benchmark/exact-polynomial-lazy-resource-ingress-v1",
    "sample_count": samples,
    "coefficient_count": len(values),
    "maximum_coefficient_bits": max(abs(value).bit_length() for value in values),
    "alternating_signs": True,
    "materialization_ns": elapsed,
    "serialization_ns": serialized,
    "packed_byte_count": len(expected_bytes),
    "exact_resource_equality": True,
}))
`;

const executed = spawnSync(
  process.execPath,
  [resolve(root, "bin/sagejs"), "--python"],
  {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout: 30_000,
  },
);
assert.equal(executed.status, 0, `${executed.stdout}\n${executed.stderr}`);
const report = JSON.parse(executed.stdout.trim().split(/\r?\n/).at(-1));
const median = (values) => [...values].sort((left, right) => left - right)[
  Math.floor(values.length / 2)
];
report.statistics = {
  materialization_median_ns: median(report.materialization_ns),
  serialization_median_ns: median(report.serialization_ns),
};
report.identity = {
  polynomial_source_sha256: createHash("sha256")
    .update(readFileSync(resolve(root, "src/baselib/polynomial.py")))
    .digest("hex"),
  node: process.version,
};
report.host = {
  platform: platform(),
  architecture: arch(),
  cpu: cpus()[0]?.model || "unknown",
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
