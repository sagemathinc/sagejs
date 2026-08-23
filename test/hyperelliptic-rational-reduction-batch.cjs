"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const reductionSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "rational_reduction_kernels.py",
);
const finiteSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_kernels.py",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 300_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const witness = String.raw`
from sagejs.native import is_compiled
from sagejs.hyperelliptic_curves.rational_reduction_kernels import (
    reduce_rational_mumford_many_primes,
)
from sagejs.hyperelliptic_curves.torsion import (
    PreparedRationalReductionBatch,
    RationalReductionCancelledError,
    RationalTorsionCapabilityError,
    certify_supplied_torsion,
    rational_two_torsion,
    torsion_bound,
    verify_torsion_result_certificate,
)
from sagejs.hyperelliptic_curves.saturation import (
    search_rational_mumford_division,
    verify_division_search_certificate,
)

assert is_compiled(reduce_rational_mumford_many_primes)


def packed_rows(rows):
    answer = []
    for row in rows:
        context = row["reduced_jacobian"].prepared_arithmetic(
            algorithm="auto", max_batch_items=max(1, len(row["divisors"]))
        )
        answer.append(
            tuple(None if value is None else context.pack(value) for value in row["divisors"])
        )
    return tuple(answer)


def check_curve(curve):
    J = curve.jacobian()
    P = J((0, 1))
    divisors = tuple(P.scalar_multiple(index, algorithm="reference") for index in range(-4, 9))
    prepared = PreparedRationalReductionBatch(J, divisors, max_kernel_pairs=1000)
    native, diagnostics = prepared.reduce_many(
        (107, 101, 103),
        algorithm="native",
        allow_nonintegral=True,
        diagnostics=True,
    )
    reference = prepared.reduce_many(
        (101, 103, 107), algorithm="reference", allow_nonintegral=True
    )
    assert diagnostics["selected"] == "native"
    assert diagnostics["kernel_crossings"] == 1
    assert diagnostics["prime_count"] == 3
    assert tuple(row["prime"] for row in native) == (101, 103, 107)
    assert packed_rows(native) == packed_rows(reference)
    assert all(
        not divisor.is_materialized()
        for row in native
        for divisor in row["divisors"]
        if divisor is not None
    )
    return diagnostics["divisor_count"]


R = PolynomialRing(QQ, "x")
x = R.gen()
assert check_curve(HyperellipticCurve(x**5 + x + 1)) == 13
assert check_curve(HyperellipticCurve(x**5 + x + 1, x)) == 13
assert check_curve(HyperellipticCurve(x**7 + x + 1)) == 13
assert check_curve(HyperellipticCurve(x**7 + x + 1, x**2)) == 13

# The source point 5*P has a denominator divisible by 5.  A partial batch
# records only that pair as unavailable; it is never interpreted as a failed
# finite-field divisibility test.
J = HyperellipticCurve(x**5 + x + 1).jacobian()
P = J((0, 1))
five = P.scalar_multiple(5, algorithm="reference")
partial = PreparedRationalReductionBatch(J, (P, five)).reduce_many(
    (5, 11), algorithm="native", allow_nonintegral=True
)
assert partial[0]["divisors"][0] is not None
assert partial[0]["divisors"][1] is None
assert partial[1]["divisors"][1] is not None
reference_partial = PreparedRationalReductionBatch(J, (P, five)).reduce_many(
    (5, 11), algorithm="reference", allow_nonintegral=True
)
assert packed_rows(partial) == packed_rows(reference_partial)
packed_partial = PreparedRationalReductionBatch(J, (P, five)).reduce_many(
    (5, 11), algorithm="native", allow_nonintegral=True, packed=True
)
assert tuple(packed_partial[0]["divisors"])[1] is None
assert tuple(packed_partial[1]["divisors"]) == packed_rows(reference_partial)[1]

try:
    PreparedRationalReductionBatch(J, (P, five), max_kernel_pairs=3).reduce_many((5, 11))
except RationalTorsionCapabilityError as error:
    assert error.diagnostics["pair_count"] == 4
else:
    raise AssertionError("the packed pair bound was ignored")

cancelled = PreparedRationalReductionBatch(J, (P,), cancel=lambda: True)
try:
    cancelled.reduce_many((5, 11), algorithm="native")
except RationalReductionCancelledError:
    pass
else:
    raise AssertionError("many-prime cancellation was ignored")

# Native filtering may discard candidates during construction, but replay is
# forced through the exact reference reduction path and reproduces every
# count.  Thus a negative finite filter is never trusted without replay.
target = P.scalar_multiple(2, algorithm="reference")
search = search_rational_mumford_division(
    J,
    target,
    2,
    numerator_bound=1,
    denominator_bound=1,
    max_candidate_tuples=100,
    filter_primes=(5, 7, 11),
    filter_chunk_size=8,
    filter_algorithm="native",
)
assert search["status"] == "found" and search["point"] == P
assert search["filtered_candidate_divisors"] > 0
assert verify_division_search_certificate(J, target, search)

# Torsion factor-and-strip consumes the same retained packed rows, while the
# result verifier recomputes every order and specialization witness exactly.
A = HyperellipticCurve(x**5 - x).jacobian()
two_torsion = rational_two_torsion(A)
bound = torsion_bound(A, primes=(3, 7, 11), algorithm="exhaustive")
certified = certify_supplied_torsion(A, two_torsion.generators, bound=bound)
assert verify_torsion_result_certificate(A, certified.certificate)

print("HYPERELLIPTIC_RATIONAL_REDUCTION_BATCH_OK")
`;

test("one-crossing rational reductions replay exactly in genus 2 and 3", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-rational-reduction-batch-"));
  const cache = join(temporary, "cache");
  const program = join(temporary, "witness.py");
  try {
    writeFileSync(program, witness);
    run(process.execPath, [
      sagejs,
      "native",
      "compile",
      finiteSource,
      "--cache-root",
      cache,
    ]);
    run(process.execPath, [
      sagejs,
      "native",
      "compile",
      reductionSource,
      "--cache-root",
      cache,
    ]);
    const output = run(process.execPath, [sagejs, program], {
      env: { SAGEJS_NATIVE_CACHE_DIR: cache },
    });
    assert.match(output, /HYPERELLIPTIC_RATIONAL_REDUCTION_BATCH_OK/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
