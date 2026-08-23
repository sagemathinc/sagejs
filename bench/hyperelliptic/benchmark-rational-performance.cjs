#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");

const { createSage } = require("../../dist/tools/kernel.js");

function magmaReductionBatch() {
  const executable = process.env.MAGMA;
  if (!executable) {
    return { status: "not-requested", reason: "set MAGMA to a Magma executable" };
  }
  const source = String.raw`
major, minor, patch := GetVersion();
printf "VERSION|%o.%o.%o\n", major, minor, patch;
primes := [3,7,11,13,17,19,23,29];
times := [];
for trial in [1..9] do
  started := Cputime(); checksum := 0;
  for batch in [1..200] do
    for p in primes do
      F := GF(p); R<x> := PolynomialRing(F);
      C := HyperellipticCurve(x^5-x); J := Jacobian(C);
      us := [R|1,x,x-1,x^2-x,x+1,x^2+x,x^2-1,x^2+1];
      points := [elt<J|[u,0],Degree(u)> : u in us cat us];
      checksum +:= &+[Order(point) : point in points];
    end for;
  end for;
  Append(~times, Cputime(started)/200.0);
  assert checksum eq 48000;
end for;
printf "TIMES|%o\n", times;
quit;
`;
  const result = spawnSync(executable, ["-b"], {
    input: source,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Magma failed\n${result.stdout}${result.stderr}`);
  }
  if (result.stdout.includes("User error")) {
    throw new Error(`Magma reported a user error\n${result.stdout}`);
  }
  const version = result.stdout.match(/VERSION\|([^\n]+)/)?.[1]?.trim();
  const sampleText = result.stdout.match(/TIMES\|\[([^\]]+)\]/s)?.[1];
  if (!version || !sampleText) throw new Error("Magma omitted benchmark sentinels");
  const samples = sampleText.split(",").map((value) => Number(value.trim()));
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    status: "ok",
    version,
    contract:
      "construct 8 finite Jacobians and 16 exact 2-torsion Mumford points each",
    repetitions: samples.length,
    inner_batches_per_sample: 200,
    cpu_seconds_per_batch: samples,
    median_cpu_seconds_per_batch: sorted[Math.floor(sorted.length / 2)],
    exact_checksum_per_batch: 240,
  };
}

async function main() {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
import json
import time
from sagejs.hyperelliptic_curves.torsion import (
    PreparedRationalReductionBatch,
    _reduce_rational_divisor,
    rational_mumford_fingerprint,
    rational_two_torsion,
)
from sagejs.hyperelliptic_curves.saturation import search_rational_mumford_division

R = PolynomialRing(QQ, "x")
x = R.gen()
A = HyperellipticCurve(x**5 - x).jacobian()
generators = rational_two_torsion(A).generators
basis_values = []
for mask in range(8):
    value = A.zero()
    for index, generator in enumerate(generators):
        if (mask >> index) & 1:
            value += generator
    basis_values.append(value)
basis = tuple(basis_values + basis_values)
primes = (3,7,11,13,17,19,23,29)

started = time.perf_counter()
reference = tuple(
    tuple(_reduce_rational_divisor(A, point, prime) for point in basis)
    for prime in primes
)
reference_seconds = time.perf_counter() - started

prepared = PreparedRationalReductionBatch(A, basis)
started = time.perf_counter()
rows = tuple(row for chunk in prepared.iter_chunks(primes, chunk_size=2) for row in chunk)
prepared_seconds = time.perf_counter() - started
def finite_key(point):
    u_value, v_value = point.uv()
    return (
        tuple(int(value) for value in u_value.list()),
        tuple(int(value) for value in v_value.list()),
    )
prepared_keys = tuple(tuple(finite_key(point) for point in row["divisors"]) for row in rows)
reference_keys = tuple(tuple(finite_key(point) for point in row) for row in reference)
assert prepared_keys == reference_keys
digest = reference_keys

J = HyperellipticCurve(x**5 + x + 1).jacobian()
Q = J((0,1))
target = 2*Q
started = time.perf_counter()
plain = search_rational_mumford_division(
    J, target, 2,
    numerator_bound=2,
    denominator_bound=2,
    max_candidate_tuples=100000,
)
plain_seconds = time.perf_counter() - started
started = time.perf_counter()
filtered = search_rational_mumford_division(
    J, target, 2,
    numerator_bound=2,
    denominator_bound=2,
    max_candidate_tuples=100000,
    filter_primes=(5,11),
    filter_chunk_size=64,
)
filtered_seconds = time.perf_counter() - started
assert plain["point"] == filtered["point"] == Q

print(json.dumps({
    "schema": "sagejs.hyperelliptic-rational-performance-benchmark/v1",
    "reduction_curve": "y^2=x^5-x",
    "division_curve": "y^2=x^5+x+1",
    "genus": 2,
    "basis_size": len(basis),
    "reduction_primes": list(primes),
    "reference_reduction_seconds": reference_seconds,
    "prepared_reduction_seconds": prepared_seconds,
    "reduction_speedup": reference_seconds/prepared_seconds,
    "result_fingerprint_count": sum(len(row) for row in digest),
    "plain_division_seconds": plain_seconds,
    "filtered_division_seconds": filtered_seconds,
    "plain_exact_tests": plain["exact_division_tests"],
    "filtered_exact_tests": filtered["exact_division_tests"],
    "filtered_by_reduction": filtered["filtered_candidate_divisors"],
}, sort_keys=True))
True`,
      { timeout: 300_000 },
    );
    if (result.repr !== "True") {
      throw new Error(`benchmark failed exact checks: ${result.repr}`);
    }
    const output = JSON.parse(result.stdout.trim());
    output.magma = magmaReductionBatch();
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
