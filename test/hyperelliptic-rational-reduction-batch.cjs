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
from sagejs.hyperelliptic_curves.jacobian_kernels import (
    packed_cantor_scalar_many_primes,
)
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
assert is_compiled(packed_cantor_scalar_many_primes)
dynamic_reduction = getattr(
    reduce_rational_mumford_many_primes,
    "javascript",
    reduce_rational_mumford_many_primes,
)
dynamic_output = [0] * 16
dynamic_statuses = [0] * 2
assert dynamic_reduction(
    dynamic_output,
    dynamic_statuses,
    [1],
    [1, 1, 0, 0, 0, 0, 0],
    [5, 1, 1, 1, 1, 1, 1],
    [5, 7],
    1,
    2,
)
assert dynamic_statuses == [0, 1]
assert dynamic_output[:8] == [1, 0, 1, 0, 0, 0, 0, 0]
assert dynamic_output[8:] == [1, 3, 1, 0, 0, 0, 0, 0]


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
    native_packed = prepared.reduce_many(
        (101, 103, 107),
        algorithm="native",
        allow_nonintegral=True,
        packed=True,
    )
    reference_packed = prepared.reduce_many(
        (101, 103, 107),
        algorithm="reference",
        allow_nonintegral=True,
        packed=True,
    )
    for native_row, reference_row in zip(native_packed, reference_packed, strict=True):
        reference_context = reference_row["reduced_jacobian"].prepared_arithmetic(
            algorithm="auto", max_batch_items=len(divisors)
        )
        assert native_row["model_coefficients"] == reference_context.model_coefficients
    zero_scalars = tuple(
        tuple(0 for _divisor in divisors) for _row in native_packed
    )
    fused, fused_diagnostics = prepared.scalar_zero_many(
        native_packed, zero_scalars, algorithm="native", diagnostics=True
    )
    replay = prepared.scalar_zero_many(
        reference_packed, zero_scalars, algorithm="reference"
    )
    assert fused == replay
    assert all(value in (None, True) for row in fused for value in row)
    assert fused_diagnostics["kernel_crossings"] == 1
    fused_uniform, uniform_diagnostics = prepared.scalar_zero_many(
        native_packed, 2, algorithm="native", packed=True, diagnostics=True
    )
    replay_uniform = prepared.scalar_zero_many(
        reference_packed, 2, algorithm="reference"
    )
    assert tuple(tuple(row) for row in fused_uniform) == replay_uniform
    assert uniform_diagnostics["matches_target_count"] == sum(
        value is True for row in replay_uniform for value in row
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

memory_probe = PreparedRationalReductionBatch(J, (P,))
memory_limited = PreparedRationalReductionBatch(
    J, (P,), max_memory_bytes=memory_probe.estimated_bytes + 200
)
try:
    memory_limited.reduce_many((5, 11), algorithm="native", packed=True)
except RationalTorsionCapabilityError as error:
    assert error.diagnostics["estimated_materialized_bytes"] == 128
else:
    raise AssertionError("lazy packed-row materialization escaped its memory bound")

fused_limited = PreparedRationalReductionBatch(
    J, (P,), max_memory_bytes=memory_probe.estimated_bytes + 300
)
fused_limited_rows = fused_limited.reduce_many(
    (5, 11), algorithm="native", packed=True
)
try:
    fused_limited.scalar_zero_many(fused_limited_rows, 2, algorithm="native")
except RationalTorsionCapabilityError as error:
    assert error.diagnostics["fused_output_bytes"] > 300
else:
    raise AssertionError("fused scalar buffers escaped their memory bound")

cancelled = PreparedRationalReductionBatch(J, (P,), cancel=lambda: True)
try:
    cancelled.reduce_many((5, 11), algorithm="native")
except RationalReductionCancelledError:
    pass
else:
    raise AssertionError("many-prime cancellation was ignored")

cancel_state = [False]
lazy_cancelled = PreparedRationalReductionBatch(
    J, (P,), cancel=lambda: cancel_state[0]
).reduce_many((5, 11), algorithm="native", packed=True)
cancel_state[0] = True
try:
    tuple(lazy_cancelled[0]["divisors"])
except RationalReductionCancelledError:
    pass
else:
    raise AssertionError("lazy packed-row materialization ignored cancellation")

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
