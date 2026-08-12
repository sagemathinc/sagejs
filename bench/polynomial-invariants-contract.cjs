#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const helper = readFileSync(
  join(root, "src/lib/sagejs/polynomial_algorithms/invariants.py"),
  "utf8",
);
const workload = String.raw`
import time

def median(operation):
    samples = []
    for _repeat in range(7):
        started = time.perf_counter()
        operation()
        samples.append(1000*(time.perf_counter() - started))
    samples.sort()
    return samples[len(samples)//2]

coefficients = [0 for _index in range(100000)]
coefficients[50000] = 17
count = lambda source: len(source)
coefficient = lambda source, index: source[index]

factors = [([-index, 1], 1) for index in range(1, 501)]
source = [1, 1]
factorization = lambda _source: (1, factors)
root_operation = lambda: polynomial_default_roots_from_factorization(
    source,
    0,
    count,
    coefficient,
    factorization,
    lambda factor: len(factor) - 1,
    lambda factor: -factor[0] // factor[1],
    lambda root: (True, root),
    lambda: (_ for _item in []).throw(ValueError("zero roots")),
)

leading_ms = median(
    lambda: polynomial_leading_coefficient(coefficients, 0, count, coefficient)
)
valuation_ms = median(
    lambda: polynomial_valuation_reference(
        coefficients, 0, object(), count, coefficient
    )
)
valuation_boundary_ms = median(
    lambda: polynomial_valuation(
        coefficients, object(), lambda _source: 50000
    )
)
roots_ms = median(root_operation)
roots = root_operation()
assert roots[0] == (1, 1)
assert roots[-1] == (500, 1)

RZ = PolynomialRing(ZZ, "x")
x = RZ.gen()
squarefree_part = RZ(1)
for root in range(1, 61):
    squarefree_part *= x - root
repeated = squarefree_part**2 * (x + 1001)**3

def primitive_is_squarefree(polynomial, _scalar):
    return polynomial.gcd(polynomial.derivative()).degree() == 0

def primitive_squarefree_part(polynomial, _scalar):
    return polynomial // polynomial.gcd(polynomial.derivative())

squarefree_operation = lambda: polynomial_is_squarefree(
    repeated,
    lambda polynomial: polynomial == 0,
    lambda _polynomial: ZZ(1),
    lambda _scalar: True,
    primitive_is_squarefree,
)
radical_operation = lambda: polynomial_radical_from_squarefree_part(
    repeated,
    lambda polynomial: polynomial == 0,
    lambda _polynomial: ZZ(1),
    lambda scalar: scalar,
    primitive_squarefree_part,
    lambda scalar, part: scalar*part,
)
squarefree_ms = median(squarefree_operation)
radical_ms = median(radical_operation)
assert squarefree_operation() is False
assert radical_operation() == squarefree_part*(x + 1001)

print(
    leading_ms,
    valuation_ms,
    valuation_boundary_ms,
    roots_ms,
    squarefree_ms,
    radical_ms,
)
`;

const directory = mkdtempSync(join(tmpdir(), "sagejs-polynomial-invariants-bench-"));
const filename = join(directory, "workload.py");
try {
  writeFileSync(filename, `${helper}\n${workload}\n`);
  const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
  const result = spawnSync(process.execPath, [executable, filename], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const [leading, valuationReference, valuationBoundary, roots, squarefree, radical] =
    result.stdout.trim().split(/\s+/).map(Number);
  assert.ok(
    [leading, valuationReference, valuationBoundary, roots, squarefree, radical]
      .every(Number.isFinite),
    result.stdout,
  );
  console.log(JSON.stringify({
    schema: "sagejs.benchmark/polynomial-invariants-contract-v1",
    implementation: "ordinary-storage-neutral-python",
    workload: {
      coefficients: 100000,
      trailingZeroCoefficients: 49999,
      exactLinearFactors: 500,
      repeatedPolynomialDegree: 123,
      valuationReferenceOnly: true,
      productionValuationBoundary: "one callback or compiled borrowed traversal",
    },
    milliseconds: {
      leading,
      valuationReference,
      valuationBoundary,
      roots,
      squarefree,
      radical,
    },
  }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
