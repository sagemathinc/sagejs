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
    fmpq_polynomial_workspace_copy_pair_out,
    fmpq_polynomial_workspace_load_pair,
)
from sagejs.hyperelliptic_curves.jacobian_rational_native import (
    PreparedRationalJacobianArithmetic,
    rational_cantor_add,
    rational_cantor_add_pairs,
    rational_cantor_scalar,
    rational_cantor_scalar_pair,
)

compiled = is_compiled(rational_cantor_add)
assert compiled == is_compiled(rational_cantor_scalar)
assert compiled == is_compiled(rational_cantor_add_pairs)
assert compiled == is_compiled(rational_cantor_scalar_pair)
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
    raw_pair = fmpq_polynomial_workspace_copy_pair_out(raw_workspace, 6, 7)
    assert not raw_pair.closed
    assert not hasattr(raw_pair, "u") and not hasattr(raw_pair, "v")
    dynamic_add_pairs = getattr(
        rational_cantor_add_pairs, "javascript", rational_cantor_add_pairs
    )
    assert dynamic_add_pairs(
        raw_output,
        raw_workspace,
        J.f()._exact_polynomial_resource(),
        J.h()._exact_polynomial_resource(),
        raw_pair,
        raw_pair,
        J.genus(),
    )
    assert context._unpack_output(raw_output) == P._scalar_multiple_reference(4)
    dynamic_scalar_pair = getattr(
        rational_cantor_scalar_pair, "javascript", rational_cantor_scalar_pair
    )
    assert dynamic_scalar_pair(
        raw_output,
        raw_workspace,
        J.f()._exact_polynomial_resource(),
        J.h()._exact_polynomial_resource(),
        raw_pair,
        3,
        J.genus(),
        32,
    )
    assert context._unpack_output(raw_output) == P._scalar_multiple_reference(6)
    assert fmpq_polynomial_workspace_load_pair(raw_workspace, 14, 15, raw_pair)
    try:
        fmpq_polynomial_workspace_load_pair(raw_workspace, 14, 14, raw_pair)
    except ValueError:
        pass
    else:
        raise AssertionError("an overlapping opaque pair load was accepted")
    raw_pair.close()
    raw_pair.close()
    assert raw_pair.closed
    try:
        fmpq_polynomial_workspace_load_pair(raw_workspace, 14, 15, raw_pair)
    except ValueError:
        pass
    else:
        raise AssertionError("a closed opaque pair resource was loaded")
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
    expected_negatives = tuple(value._negate_reference() for value in values)
    assert context.negate_batch(values) == expected_negatives
    public_negative, negative_diagnostics = P.negate(diagnostics=True)
    assert public_negative == P._negate_reference()
    assert -P == public_negative
    assert P - P == J.zero()
    assert negative_diagnostics["operation"] == "negate_batch"
    assert negative_diagnostics["selected"] == ("native" if compiled else "reference")
    assert P + P == P.add(P, algorithm="reference")
    assert P.double() == P.double(algorithm="reference")
    public_sum, public_diagnostics = P.add(P, diagnostics=True)
    assert public_sum == P + P
    assert public_diagnostics["selected"] == ("native" if compiled else "reference")
    if compiled:
        retained = P + P
        assert not retained.is_materialized()
        retained_row = public_context.pack(retained)
        retained_hash = hash(retained)
        # Later workspace activity and a chained public operation must consume
        # the opaque retained pair without publishing or mutating its exact row.
        for index in range(2, 9):
            context.scalar_batch((P,), (index,))
        chained = retained + P
        assert not retained.is_materialized()
        assert not chained.is_materialized()
        assert chained == P.scalar_multiple(3, algorithm="reference")
        assert public_context.pack(retained) == retained_row
        assert hash(retained) == retained_hash
        public_context.close()
        recreated = J.prepared_arithmetic()
        assert recreated is not public_context and not recreated.closed
        assert retained + P == chained
        assert not retained.is_materialized()
        u_value, v_value = retained.uv()
        assert u_value is not None and v_value is not None
        assert retained.is_materialized()
        assert recreated.pack(retained) == retained_row
        assert hash(retained) == retained_hash
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


# The rational retained binding is not a writable module attribute or object
# slot.  Rebinding public module helpers and injecting plausible attributes
# therefore cannot forge, transplant, or split its exact representation.
import sagejs.hyperelliptic_curves.jacobian_rational_native as rational_module

security_curve = HyperellipticCurve(x**5 + x + 1)
security_jacobian = security_curve.jacobian()
security_point = security_jacobian((0, 1))
security_result = security_point + security_point
assert not security_result.is_materialized()
security_context = security_jacobian.prepared_arithmetic()
security_row = security_context.pack(security_result)
security_hash = hash(security_result)
assert not hasattr(rational_module, "_install_retained_rational_mumford_state")
for forbidden in (
    "_RationalMumfordBinding",
    "_retained_rational_weak_map",
    "_retained_rational_publisher",
    "_retained_rational_token",
):
    assert not hasattr(rational_module, forbidden)

for name in (
    "_rational_mumford_binding",
    "_RationalMumfordBinding",
    "_retained_rational_pair",
):
    try:
        object.__setattr__(security_result, name, (security_point, security_row))
    except AttributeError:
        pass
assert security_context.pack(security_result) == security_row
assert hash(security_result) == security_hash
object.__setattr__(security_result, "_packed_hash", -1234567)
assert hash(security_result) == security_hash

saved_values = rational_module.integer_buffer_values
saved_copy = rational_module.fmpq_polynomial_workspace_copy_pair_out
saved_load = rational_module.fmpq_polynomial_workspace_load
saved_resource = rational_module._resource
saved_add_pairs = rational_module.rational_cantor_add_pairs
try:
    rational_module.integer_buffer_values = None
    rational_module.fmpq_polynomial_workspace_copy_pair_out = None
    rational_module.fmpq_polynomial_workspace_load = None
    rational_module._resource = None
    rational_module.rational_cantor_add_pairs = None
    guarded = security_result + security_point
    assert guarded == security_point.scalar_multiple(3, algorithm="reference")
finally:
    rational_module.integer_buffer_values = saved_values
    rational_module.fmpq_polynomial_workspace_copy_pair_out = saved_copy
    rational_module.fmpq_polynomial_workspace_load = saved_load
    rational_module._resource = saved_resource
    rational_module.rational_cantor_add_pairs = saved_add_pairs

assert security_context.pack(security_result) == security_row
assert hash(security_result) == security_hash
reconstructor, arguments = security_result.__reduce__()
restored = reconstructor(*arguments)
assert restored == security_result
assert restored.__reduce__()[1] == arguments
assert security_context.pack(security_result) == security_row
assert hash(security_result) == security_hash

foreign_jacobian = HyperellipticCurve(x**5 + x + 1).jacobian()
foreign_point = foreign_jacobian((0, 1))
original_parent = security_result._parent
try:
    object.__setattr__(security_result, "_parent", foreign_jacobian)
    try:
        foreign_point + security_result
    except (ArithmeticError, TypeError):
        pass
    else:
        raise AssertionError("a retained pair was transplanted to another Jacobian")
finally:
    object.__setattr__(security_result, "_parent", original_parent)
assert security_context.pack(security_result) == security_row


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

retained_limit = PreparedRationalJacobianArithmetic(T.parent())
retained_limit._max_memory_bytes = (
    fmpq_polynomial_workspace_allocated_bytes(retained_limit._workspace)
    + retained_limit._retained_pair_bound
    - 1
)
try:
    retained_limit.add_batch((T,), (T,))
except RuntimeError as error:
    assert "max_memory_bytes" in str(error)
else:
    raise AssertionError("opaque retained output memory bound was ignored")
assert not retained_limit._busy
retained_limit._max_memory_bytes = None
assert retained_limit.add_batch((T,), (T,))[0] == T + T
retained_limit.close()

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
    for (const functionName of [
      "rational_cantor_add_pairs",
      "rational_cantor_scalar_pair",
    ]) {
      const retainedExplanation = run(process.execPath, [
        sagejs,
        "native",
        "explain",
        source,
        "--function",
        functionName,
      ]);
      assert.match(retainedExplanation, /host-isolated core: yes/);
      assert.match(retainedExplanation, /0 callbacks inside core/);
      assert.match(retainedExplanation, /FmpqPolynomialPair/);
    }
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
