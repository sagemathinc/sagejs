#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "../..");
const sagejs = join(root, "bin", "sagejs");
const divisorCount = Number(process.env.SAGEJS_RATIONAL_REDUCTION_DIVISORS || 4096);
const primeCount = Number(process.env.SAGEJS_RATIONAL_REDUCTION_PRIMES || 64);
const scalarCount = Number(process.env.SAGEJS_RATIONAL_SCALAR_BATCH_ITEMS || 10000);
for (const [name, value] of Object.entries({ divisorCount, primeCount, scalarCount })) {
  assert.ok(Number.isSafeInteger(value) && value > 0, `${name} must be positive`);
}
assert.equal(divisorCount % 8, 0, "divisor count must be divisible by eight");

const sources = [
  "jacobian_kernels.py",
  "rational_reduction_kernels.py",
  "jacobian_rational_native.py",
].map((name) =>
  join(root, "src", "lib", "sagejs", "hyperelliptic_curves", name),
);

function checkedSpawn(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function sageProgram() {
  return String.raw`
import json
import time
from sagejs.native import is_compiled
from sagejs.hyperelliptic_curves.rational_reduction_kernels import reduce_rational_mumford_many_primes
from sagejs.hyperelliptic_curves.torsion import (
    PreparedRationalReductionBatch,
    _packed_scalar_batch_rows,
    certify_supplied_torsion,
    rational_two_torsion,
    torsion_bound,
    verify_torsion_result_certificate,
)

divisor_count = ${divisorCount}
prime_count = ${primeCount}
scalar_count = ${scalarCount}
assert is_compiled(reduce_rational_mumford_many_primes)


def timer_resolution_ns():
    values = []
    for _index in range(16):
        first = time.perf_counter_ns()
        second = first
        while second == first:
            second = time.perf_counter_ns()
        values.append(second - first)
    return min(values)


R = PolynomialRing(QQ, "x")
x = R.gen()
J = HyperellipticCurve(x**5 - x).jacobian()
two = rational_two_torsion(J)
generators = two.generators
base = []
for mask in range(8):
    value = J.zero()
    for index, generator in enumerate(generators):
        if (mask >> index) & 1:
            value = value.add(generator, algorithm="reference")
    base.append(value)
basis = tuple(base[index % 8] for index in range(divisor_count))
primes = tuple(
    value
    for value in range(3, 2000, 2)
    if is_prime(value)
)[:prime_count]
assert len(primes) == prime_count

started = time.perf_counter_ns()
prepared = PreparedRationalReductionBatch(
    J, basis, max_kernel_pairs=divisor_count * prime_count
)
prepare_ns = time.perf_counter_ns() - started
started = time.perf_counter_ns()
rows, diagnostics = prepared.reduce_many(
    primes, algorithm="native", packed=True, diagnostics=True
)
reduction_ns = time.perf_counter_ns() - started
assert diagnostics["kernel_crossings"] == 1
assert diagnostics["selected"] == "native"

started = time.perf_counter_ns()
nonzero = 0
for row in rows:
    values = row["divisors"]
    doubled = _packed_scalar_batch_rows(
        row["reduced_jacobian"],
        values,
        (2 for _value in values),
        algorithm="native",
    )
    assert all(value[0] == 0 for value in doubled)
    nonzero += sum(0 if value[0] == 0 else 1 for value in values)
witness_ns = time.perf_counter_ns() - started
assert nonzero == divisor_count * prime_count * 7 // 8

# Replay one complete base block at every prime via the old exact construction
# path.  It proves the packed batch's canonical rows without making the timed
# native result pay for a second full research-size materialization.
sample = PreparedRationalReductionBatch(J, tuple(base))
reference_rows = sample.reduce_many(primes, algorithm="reference", packed=True)
for native_row, reference_row in zip(rows, reference_rows, strict=True):
    assert tuple(native_row["divisors"])[:8] == reference_row["divisors"]

started = time.perf_counter_ns()
bound = torsion_bound(J, primes=primes[:8], algorithm="exhaustive")
certified = certify_supplied_torsion(J, generators, bound=bound)
assert verify_torsion_result_certificate(J, certified.certificate)
certificate_replay_ns = time.perf_counter_ns() - started

T = J((0, 0))
huge = 2**256 + 1
context = J.prepared_arithmetic(algorithm="native", max_batch_items=scalar_count)
points = (T,) * scalar_count
scalars = (huge,) * scalar_count
started = time.perf_counter_ns()
batch_products = context.scalar_batch(points, scalars)
scalar_batch_ns = time.perf_counter_ns() - started
assert all(value == T for value in batch_products)
started = time.perf_counter_ns()
for _index in range(scalar_count):
    singleton = context.scalar_batch((T,), (huge,))[0]
scalar_singletons_ns = time.perf_counter_ns() - started
assert singleton == T

print(json.dumps({
    "schema": "sagejs.hyperelliptic.rational-reduction-batch-benchmark.v1",
    "engine": "sagejs",
    "timer": "time.perf_counter_ns",
    "timer_resolution_ns": timer_resolution_ns(),
    "curve": "y^2=x^5-x",
    "divisor_count": divisor_count,
    "prime_count": prime_count,
    "prime_divisor_pairs": divisor_count * prime_count,
    "prepare_ns": prepare_ns,
    "one_crossing_qq_to_retained_packed_rows_ns": reduction_ns,
    "finite_factor_strip_witness_ns": witness_ns,
    "finite_reduction_and_witness_ns": reduction_ns + witness_ns,
    "certificate_construction_and_reference_replay_ns": certificate_replay_ns,
    "packed_output_bytes": diagnostics["packed_output_bytes"],
    "kernel_crossings": diagnostics["kernel_crossings"],
    "exact_nonzero_checksum": nonzero,
    "reference_rows_replayed": 8 * prime_count,
    "scalar_items": scalar_count,
    "scalar_batch_ns": scalar_batch_ns,
    "scalar_singletons_ns": scalar_singletons_ns,
    "scalar_batch_over_singletons": scalar_batch_ns / scalar_singletons_ns,
    "scalar_kernel_crossings": scalar_count,
    "scalar_batch_note": "v1 scalar_batch crosses the QQ Cantor kernel once per item",
}, sort_keys=True))
`;
}

function magmaProgram() {
  return String.raw`
major, minor, patch := GetVersion();
printf "VERSION|%o.%o.%o\n", major, minor, patch;
divisor_count := ${divisorCount};
prime_count := ${primeCount};
scalar_count := ${scalarCount};
primes := [ p : p in [3..2000 by 2] | IsPrime(p) ][1..prime_count];
Q := Rationals(); Qx<x> := PolynomialRing(Q);
CQ := HyperellipticCurve(x^5-x); JQ := Jacobian(CQ);
T := elt<JQ | [Qx!x, Qx!0], 1>;
huge := 2^256 + 1;

reduction_times := []; witness_times := []; scalar_times := [];
checksum := 0;
for trial in [1..5] do
  rows := [* *];
  started := Cputime();
  for p in primes do
    F := GF(p); Fx<z> := PolynomialRing(F);
    C := HyperellipticCurve(z^5-z); J := Jacobian(C);
    us := [Fx|1,z,z-1,z^2-z,z+1,z^2+z,z^2-1,z^2+1];
    base := [ elt<J | [u,Fx!0], Degree(u)> : u in us ];
    values := [ base[(index mod 8)+1] : index in [0..divisor_count-1] ];
    Append(~rows, <J, values>);
  end for;
  Append(~reduction_times, Cputime(started));

  started := Cputime(); trial_checksum := 0;
  for entry in rows do
    J := entry[1]; values := entry[2]; zero := J!0;
    for value in values do
      assert 2*value eq zero;
      if value ne zero then trial_checksum +:= 1; end if;
    end for;
  end for;
  Append(~witness_times, Cputime(started));
  assert trial_checksum eq divisor_count*prime_count*7 div 8;
  checksum := trial_checksum;

  started := Cputime();
  for index in [1..scalar_count] do assert huge*T eq T; end for;
  Append(~scalar_times, Cputime(started));
end for;
printf "REDUCTION|%o\n", reduction_times;
printf "WITNESS|%o\n", witness_times;
printf "SCALAR|%o\n", scalar_times;
printf "CHECKSUM|%o\n", checksum;
quit;
`;
}

function parseMagmaList(output, label) {
  const text = output.match(new RegExp(`${label}\\|\\[([^\\]]+)\\]`, "s"))?.[1];
  assert.ok(text, `Magma omitted ${label}`);
  return text.split(",").map((value) => Number(value.trim()));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function runMagma() {
  const executable = process.env.MAGMA;
  if (!executable) {
    return { status: "not-requested", reason: "set MAGMA to a Magma executable" };
  }
  const output = checkedSpawn(executable, ["-b"], { input: magmaProgram() });
  assert.ok(!output.includes("User error"), output);
  const reduction = parseMagmaList(output, "REDUCTION");
  const witness = parseMagmaList(output, "WITNESS");
  const scalar = parseMagmaList(output, "SCALAR");
  const checksum = Number(output.match(/CHECKSUM\|([^\n]+)/)?.[1]);
  assert.equal(checksum, (divisorCount * primeCount * 7) / 8);
  return {
    status: "ok",
    version: output.match(/VERSION\|([^\n]+)/)?.[1]?.trim(),
    timer: "Cputime",
    repetitions: 5,
    reduction_and_publication_cpu_seconds: reduction,
    reduction_and_publication_median_cpu_seconds: median(reduction),
    finite_factor_strip_witness_cpu_seconds: witness,
    finite_factor_strip_witness_median_cpu_seconds: median(witness),
    finite_construction_and_witness_median_cpu_seconds:
      median(reduction) + median(witness),
    resident_256_bit_scalar_cpu_seconds: scalar,
    resident_256_bit_scalar_median_cpu_seconds: median(scalar),
    exact_nonzero_checksum: checksum,
    certificate_replay: "N/A: no equal Magma serialized Sage.js certificate contract",
  };
}

function main() {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-rational-reduction-bench-"));
  const cache = join(temporary, "cache");
  const program = join(temporary, "benchmark.py");
  try {
    writeFileSync(program, sageProgram());
    for (const source of sources) {
      checkedSpawn(process.execPath, [
        sagejs,
        "native",
        "compile",
        source,
        "--cache-root",
        cache,
      ]);
    }
    const stdout = checkedSpawn(process.execPath, [sagejs, program], {
      env: { SAGEJS_NATIVE_CACHE_DIR: cache },
    });
    const sage = JSON.parse(stdout.trim());
    const report = {
      ...sage,
      contract:
        "prepared QQ basis; one packed reduction crossing for all prime/divisor pairs; lazily retained packed finite rows; exact [2] witness materializes/consumes every row; sampled reference construction; certified torsion replay; compare Sage reduction+witness against Magma construction+witness",
      magma: runMagma(),
    };
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

main();
