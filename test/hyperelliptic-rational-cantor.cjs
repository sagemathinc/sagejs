"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const source = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_rational_native.py",
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
from sagejs.ffi.flint import (
    fmpq_polynomial_workspace,
    fmpq_polynomial_workspace_allocated_bytes,
)
from sagejs.hyperelliptic_curves.jacobian_rational_native import (
    PreparedRationalJacobianArithmetic,
    rational_cantor_add,
    rational_cantor_scalar,
)

compiled = is_compiled(rational_cantor_add)
assert compiled == is_compiled(rational_cantor_scalar)
selected = "native" if compiled else "reference"


def check_curve(curve):
    J = curve.jacobian()
    P = J((0, 1))
    context = PreparedRationalJacobianArithmetic(J)
    reference = PreparedRationalJacobianArithmetic(J, algorithm="reference")
    public_context = J.prepared_arithmetic()
    assert public_context is J.prepared_arithmetic()
    assert public_context.native_available == compiled
    public_context.close()
    replacement_context = J.prepared_arithmetic()
    assert replacement_context is not public_context
    assert not replacement_context.closed
    assert replacement_context is J.prepared_arithmetic()
    public_context = replacement_context
    assert context.capability().schema == "sagejs.hyperelliptic.rational-mumford.v1"
    assert context.capability().model_kind == "odd-degree-one-infinity"
    assert context.unpack(context.pack(P)) == P
    assert context.fingerprint(P) == context.fingerprint(J(list(P.uv())))
    dynamic_add = getattr(rational_cantor_add, "javascript", rational_cantor_add)
    raw_output = [0] * 16
    raw_workspace = fmpq_polynomial_workspace(48)
    assert dynamic_add(
        raw_output,
        raw_workspace,
        J.f()._exact_polynomial_resource(),
        J.h()._exact_polynomial_resource(),
        P[0]._exact_polynomial_resource(),
        P[1]._exact_polynomial_resource(),
        P[0]._exact_polynomial_resource(),
        P[1]._exact_polynomial_resource(),
        J.genus(),
    )
    assert context._unpack_output(raw_output) == P._scalar_multiple_reference(2)
    assert fmpq_polynomial_workspace_allocated_bytes(raw_workspace) > 0
    raw_workspace.close()
    assert raw_workspace.closed
    values = tuple(P._scalar_multiple_reference(index) for index in range(-4, 8))
    rights = tuple(values[(5 * index + 3) % len(values)] for index in range(len(values)))
    expected = reference.add_batch(values, rights, algorithm="reference")
    actual, diagnostics = context.add_batch(values, rights, diagnostics=True)
    assert actual == expected
    assert diagnostics["selected"] == ("native" if compiled else "reference")
    assert context.double_batch(values) == reference.double_batch(values, algorithm="reference")
    assert P + P == P.add(P, algorithm="reference")
    assert P.double() == P.double(algorithm="reference")
    public_sum, public_diagnostics = P.add(P, diagnostics=True)
    assert public_sum == P + P
    assert public_diagnostics["selected"] == ("native" if compiled else "reference")
    scalars = (-17, -3, -1, 0, 1, 2, 7, 19)
    points = tuple(values[index] for index in range(len(scalars)))
    products = context.scalar_batch(points, scalars)
    expected_products = tuple(
        point._scalar_multiple_reference(scalar)
        for point, scalar in zip(points, scalars)
    )
    assert products == expected_products
    assert P.scalar_multiple(19) == P.scalar_multiple(19, algorithm="reference")
    assert context.sum(values) == reference.sum(values, algorithm="reference")
    certificate = context.operation_certificate("add", P, P)
    assert context.verify_operation_certificate(certificate)
    certificate["answer"] = context.pack(J.zero())
    try:
        context.verify_operation_certificate(certificate)
    except ArithmeticError:
        pass
    else:
        raise AssertionError("tampered rational Cantor certificate was accepted")
    return context.model_fingerprint


R = PolynomialRing(QQ, "x")
x = R.gen()
fingerprints = (
    check_curve(HyperellipticCurve(x**5 + x + 1)),
    check_curve(HyperellipticCurve(x**5 + x + 1, x)),
    check_curve(HyperellipticCurve(x**7 + x + 1)),
    check_curve(HyperellipticCurve(x**7 + x + 1, x**2)),
)
assert len(set(fingerprints)) == 4


def check_rational_two_torsion(polynomial):
    J = HyperellipticCurve(polynomial).jacobian()
    context = PreparedRationalJacobianArithmetic(J)
    reference = PreparedRationalJacobianArithmetic(J, algorithm="reference")
    points = tuple(J((root, 0)) for root in (-1, 0, 1))
    divisors = points + (
        reference.add_batch((points[0],), (points[1],), algorithm="reference")[0],
        reference.add_batch((points[1],), (points[2],), algorithm="reference")[0],
    )
    rights = tuple(reversed(divisors))
    assert context.add_batch(divisors, rights) == reference.add_batch(
        divisors, rights, algorithm="reference"
    )
    assert context.double_batch(divisors) == (J.zero(),) * len(divisors)
    return context, points[1]


torsion_context, T = check_rational_two_torsion(x**5 - x)
check_rational_two_torsion(x**7 - x)

# A 256-bit scalar contract whose exact answer stays small enough for a stable
# cross-system benchmark: (x,0) is rational 2-torsion on y^2=x^5-x.
huge = 2**256 + 1
assert torsion_context.scalar_batch((T,), (huge,))[0] == T
assert torsion_context.scalar_batch((T,), (-huge,))[0] == T
assert huge * T == T
assert T.scalar_multiple(huge, algorithm="reference") == T
scalar_certificate = torsion_context.operation_certificate("scalar", T, huge)
assert torsion_context.verify_operation_certificate(scalar_certificate)
try:
    torsion_context.scalar_batch((T,), (huge,), max_group_operations=1)
except RuntimeError:
    pass
else:
    raise AssertionError("scalar resource bound was ignored")

try:
    PreparedRationalJacobianArithmetic(T.parent(), max_batch_items=1).add_batch(
        (T, T), (T, T)
    )
except RuntimeError:
    pass
else:
    raise AssertionError("batch resource bound was ignored")

try:
    PreparedRationalJacobianArithmetic(T.parent(), max_batch_items=1).add_batch(
        (point for point in (T, T)), (T,)
    )
except RuntimeError:
    pass
else:
    raise AssertionError("generator batch was materialized past its resource bound")

try:
    PreparedRationalJacobianArithmetic(
        T.parent(), cancel=lambda: True
    ).add_batch((T,), (T,))
except RuntimeError as error:
    assert "cancelled" in str(error)
else:
    raise AssertionError("prepared cancellation was ignored")

try:
    PreparedRationalJacobianArithmetic(
        T.parent(), max_memory_bytes=1
    ).add_batch((T,), (T,))
except RuntimeError as error:
    assert "max_memory_bytes" in str(error)
else:
    raise AssertionError("prepared workspace memory bound was ignored")

lifecycle = PreparedRationalJacobianArithmetic(T.parent())
assert not lifecycle.closed
lifecycle.close()
assert lifecycle.closed
lifecycle.close()
try:
    lifecycle.add_batch((T,), (T,))
except RuntimeError as error:
    assert "closed" in str(error)
else:
    raise AssertionError("closed prepared workspace was reused")

print("compiled=" + str(compiled))
print("HYPERELLIPTIC_RATIONAL_CANTOR_OK")
`;

test("prepared rational Cantor arithmetic differentially replays genus 2 and 3", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-rational-cantor-"));
  const cache = join(temporary, "cache");
  const program = join(temporary, "witness.py");
  try {
    writeFileSync(program, witness);
    const explanation = run(process.execPath, [
      sagejs,
      "native",
      "explain",
      source,
      "--function",
      "rational_cantor_scalar",
    ]);
    assert.match(explanation, /host-isolated core: yes/);
    assert.match(explanation, /0 callbacks inside core/);
    assert.match(explanation, /FmpqPolynomialWorkspace/);
    run(process.execPath, [
      sagejs,
      "native",
      "compile",
      source,
      "--cache-root",
      cache,
    ]);
    const native = run(process.execPath, [sagejs, program], {
      env: { SAGEJS_NATIVE_CACHE_DIR: cache },
    });
    assert.match(native, /compiled=True/);
    assert.match(native, /HYPERELLIPTIC_RATIONAL_CANTOR_OK/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
