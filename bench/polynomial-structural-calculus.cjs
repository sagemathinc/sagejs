#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const helper = readFileSync(
  join(root, "src/lib/sagejs/polynomial_algorithms/structural_calculus.py"),
  "utf8",
);

const workload = String.raw`
import time

def median(operation):
    operation()
    samples = []
    for _repeat in range(5):
        started = time.perf_counter()
        operation()
        samples.append(1000*(time.perf_counter()-started))
    samples.sort()
    return samples[len(samples)//2]

def measure(label, base, exact_quotient, coefficient):
    zero = base(0)
    one = base(1)
    linear = [coefficient(index) for index in range(192)]
    if linear[-1] == zero:
        linear[-1] = one
    outer = [coefficient(index) for index in range(19)]
    inner = [coefficient(3), coefficient(-2), one]
    left = [coefficient(index*index + 3*index + 1) for index in range(10)]
    right = [coefficient(2*index*index - index + 3) for index in range(9)]
    if left[-1] == zero:
        left[-1] = one
    if right[-1] == zero:
        right[-1] = one
    if base is ZZ:
        integral_coefficients = [QQ(value) for value in linear]
        integral_zero = QQ(0)
        integral_divisor = lambda value, denominator: value / QQ(denominator)
    else:
        integral_coefficients = linear
        integral_zero = zero
        integral_divisor = lambda value, denominator: value / base(denominator)

    timings = [
        median(lambda: dense_compose(outer, inner, zero)),
        median(lambda: dense_reverse(linear, zero, 255)),
        median(lambda: dense_truncate(linear, zero, 96)),
        median(lambda: dense_shift(linear, zero, 64)),
        median(
            lambda: dense_integral(
                integral_coefficients,
                integral_zero,
                integral_divisor,
            )
        ),
        median(lambda: dense_resultant(left, right, zero, one, exact_quotient)),
        median(lambda: dense_discriminant(left, zero, one, exact_quotient)),
    ]
    print(label + "|" + "|".join(str(value) for value in timings))

measure(
    "ZZ",
    ZZ,
    lambda numerator, denominator: numerator // denominator,
    lambda value: ZZ(value),
)
measure(
    "QQ",
    QQ,
    lambda numerator, denominator: numerator / denominator,
    lambda value: QQ(value) / QQ(abs(value) % 5 + 1),
)
prime = GF(65521)
measure(
    "GF(65521)",
    prime,
    lambda numerator, denominator: numerator / denominator,
    lambda value: prime(value),
)
`;

const directory = mkdtempSync(join(tmpdir(), "sagejs-poly-structural-bench-"));
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

  const operations = [
    "compose",
    "reverse",
    "truncate",
    "shift",
    "integral",
    "resultant",
    "discriminant",
  ];
  const domains = {};
  for (const line of result.stdout.trim().split("\n")) {
    const [domain, ...raw] = line.split("|");
    assert.equal(raw.length, operations.length, line);
    const values = raw.map(Number);
    assert.ok(values.every(Number.isFinite), line);
    domains[domain] = Object.fromEntries(
      operations.map((operation, index) => [operation, values[index]]),
    );
  }
  assert.deepEqual(Object.keys(domains), [
    "ZZ",
    "QQ",
    "GF(65521)",
  ]);
  console.log(JSON.stringify({
    schema: "sagejs.benchmark/polynomial-structural-calculus-v1",
    implementation: "ordinary-storage-neutral-python",
    representation: "normalized-low-to-high-dense-lists",
    samples: 5,
    workloads: {
      structuralDegree: 191,
      compositionDegrees: { outer: 18, inner: 2 },
      resultantDegrees: { left: 9, right: 8 },
    },
    milliseconds: domains,
  }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
