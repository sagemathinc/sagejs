#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const helper = readFileSync(
  join(root, "src/lib/sagejs/polynomial_algorithms/cyclotomic_core.py"),
  "utf8",
);
const workload = String.raw`
import time

field = CyclotomicField(12)
zeta = field.gen()
zero = field.zero()
one = field.one()

def product(factors):
    answer = [one]
    for factor in factors:
        answer = dense_multiply(answer, factor, zero)
    return answer

common = product([
    [-zeta, one],
    [zeta**2, one],
    [-(zeta+1), one],
    [-(zeta**3-zeta), one],
])
left = dense_multiply(
    common,
    product([[-field(index), one] for index in range(1, 9)]),
    zero,
)
right = dense_multiply(
    common,
    product([[-field(index), one] for index in range(11, 18)]),
    zero,
)

def median(operation):
    samples = []
    for _repeat in range(5):
        started = time.perf_counter()
        operation()
        samples.append(1000*(time.perf_counter()-started))
    samples.sort()
    return samples[len(samples)//2]

derivative_ms = median(lambda: dense_derivative(left, zero))
divrem_ms = median(lambda: dense_divrem(left, right, zero))
gcd_ms = median(lambda: dense_gcd(left, right, zero))
xgcd_ms = median(lambda: dense_xgcd(left, right, zero, one))
format_ms = median(lambda: dense_format(left, "x", zero, one))
serialize_ms = median(
    lambda: dense_serialization_payload(
        12, "x", left, zero, field._serialization_coefficients
    )
)

assert dense_gcd(left, right, zero) == dense_monic(common, zero)
print(
    len(left)-1,
    len(right)-1,
    derivative_ms,
    divrem_ms,
    gcd_ms,
    xgcd_ms,
    format_ms,
    serialize_ms,
)
`;

const directory = mkdtempSync(join(tmpdir(), "sagejs-cyclotomic-poly-bench-"));
const filename = join(directory, "workload.py");
try {
  writeFileSync(filename, `${helper}\n${workload}\n`);
  const result = spawnSync(process.execPath, [join(root, "bin/sagejs"), filename], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const values = result.stdout.trim().split(/\s+/).map(Number);
  assert.equal(values.length, 8, result.stdout);
  assert.ok(values.every(Number.isFinite), result.stdout);
  const [leftDegree, rightDegree, derivative, divrem, gcd, xgcd, format, serialize] = values;
  console.log(JSON.stringify({
    schema: "sagejs.benchmark/cyclotomic-field-polynomial-v1",
    coefficientField: "CyclotomicField(12)",
    degrees: { left: leftDegree, right: rightDegree },
    implementation: "ordinary-exact-python",
    milliseconds: { derivative, divrem, gcd, xgcd, format, serialize },
  }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
