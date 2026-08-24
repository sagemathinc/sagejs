"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
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

function filesNamed(directory, name) {
  const answer = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      answer.push(...filesNamed(path, name));
    } else if (entry === name) {
      answer.push(path);
    }
  }
  return answer;
}

function cFunction(source, signature) {
  const start = source.lastIndexOf(signature);
  assert.notEqual(start, -1, `missing generated function ${signature}`);
  const open = source.indexOf("{", start);
  assert.notEqual(open, -1, `missing body for ${signature}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated generated function ${signature}`);
}

const witness = String.raw`
from sagejs.native import is_compiled, kernel_uint64_buffer
import sagejs.runtime as runtime
import pickle
from sagejs.hyperelliptic_curves.jacobian_kernels import (
    packed_cantor_add_batch,
    packed_cantor_copy_batch,
    packed_cantor_progression_batch,
    packed_cantor_search_progression,
    packed_cantor_search_progressions,
    packed_cantor_scalar_batch,
    packed_cantor_validate_batch,
)
from sagejs.hyperelliptic_curves.jacobian_native import PreparedDivisorBatch

compiled = is_compiled(packed_cantor_add_batch)
capsule_factory = runtime.immutable_uint64_capsule
assert compiled == is_compiled(packed_cantor_scalar_batch)
assert compiled == is_compiled(packed_cantor_copy_batch)
assert compiled == is_compiled(packed_cantor_progression_batch)
assert compiled == is_compiled(packed_cantor_search_progression)
assert compiled == is_compiled(packed_cantor_search_progressions)
assert compiled == is_compiled(packed_cantor_validate_batch)
selected = "native" if compiled else "reference"


def scalar_operations(scalar):
    magnitude = abs(scalar)
    bits = 0
    ones = 0
    while magnitude:
        bits += 1
        ones += magnitude % 2
        magnitude //= 2
    return ones + max(0, bits - 1)


def check_curve(curve, exhaustive):
    J = curve.jacobian()
    context = J.prepared_arithmetic()
    assert context is J.prepared_arithmetic()
    capability = context.capability()
    assert capability.schema == "sagejs.hyperelliptic.packed-mumford.odd.v1"
    assert capability.model_kind == "odd-degree-one-infinity"
    assert capability.selected == selected
    assert capability.validation_available == compiled
    assert capability.search_available == compiled
    assert capability.multi_search_available == compiled
    points = J.points(max_elements=10000, max_candidates=100000)

    for point in points:
        row = context.pack(point)
        assert len(row) == 8
        assert context.unpack(row) == point
        assert context.fingerprint(point) == context.fingerprint(point)

    sample = points if exhaustive else points[:min(48, len(points))]
    serialized_rows = [context.pack(point) for point in sample]
    authenticated = context.unpack_batch(serialized_rows, algorithm=selected)
    reference_authenticated = context.unpack_batch(
        serialized_rows, algorithm="reference"
    )
    assert isinstance(authenticated, PreparedDivisorBatch)
    assert authenticated.published_count == 0
    assert authenticated == tuple(sample)
    assert reference_authenticated == tuple(sample)
    assert context.prepare_batch(authenticated) is authenticated
    if serialized_rows:
        mutable_rows = [list(row) for row in serialized_rows]
        isolated = context.unpack_batch(mutable_rows, algorithm=selected)
        mutable_rows[0][0] = 99
        assert isolated == tuple(sample)
    if exhaustive:
        left = [a for a in sample for _b in sample]
        right = [b for _a in sample for b in sample]
    else:
        left = sample
        right = [sample[(17 * index + 3) % len(sample)] for index in range(len(sample))]
    expected = J.prepared_arithmetic(algorithm="reference").add_batch(
        left, right, algorithm="reference"
    )
    actual, diagnostics = context.add_batch(
        left, right, algorithm=selected, diagnostics=True
    )
    if compiled:
        assert isinstance(actual, PreparedDivisorBatch)
        assert actual.published_count == 0
    assert actual == expected
    if compiled:
        # Equality compares canonical rows and a subsequent operation consumes
        # the frozen packed sequence without publishing individual divisors.
        assert actual.published_count == 0
        pipeline = context.add_batch(actual, actual, algorithm="native")
        assert actual.published_count == 0
        assert isinstance(pipeline, PreparedDivisorBatch)
        assert pipeline.published_count == 0
        pipeline_reference = context.add_batch(
            expected, expected, algorithm="reference"
        )
        assert pipeline == pipeline_reference
        assert pipeline.published_count == 0
        frozen_rows = pipeline._rows_for(context)
        try:
            frozen_rows[0] = 99
        except TypeError:
            pass
        else:
            raise AssertionError("packed batch storage was mutable")
        lazy_sample = actual[:min(8, len(actual))]
        assert actual.published_count == len(lazy_sample)
        assert all(not divisor.is_materialized() for divisor in lazy_sample)
        # Canonical-key equality, hashing, truth, and another prepared pack do
        # not force polynomial allocation.
        for divisor in lazy_sample:
            row = context.pack(divisor)
            assert context.fingerprint(divisor)
            assert hash(divisor) == hash(divisor)
            assert divisor.degree() == row[0]
            assert bool(divisor) == (row[0] != 0)
            changed = list(row)
            changed[-1] = (changed[-1] + 1) % context.prime
            assert context.pack(divisor) == row
        assert all(not divisor.is_materialized() for divisor in lazy_sample)
        forced, forced_diagnostics = context.add_batch(
            left[:8],
            right[:8],
            algorithm="native",
            diagnostics=True,
            materialize=True,
        )
        assert forced == expected[:8]
        assert isinstance(forced, tuple)
        assert all(divisor.is_materialized() for divisor in forced)
        timings = diagnostics.to_dict()["timings_ns"]
        assert "publication" in timings and "materialization" in timings
        assert diagnostics.materialization_ns == 0
        assert forced_diagnostics.materialization_ns >= 0
        serialized = J._divisor_data(lazy_sample[0])
        assert lazy_sample[0].is_materialized()
        assert J.divisor_from_data(serialized) == lazy_sample[0]
    assert diagnostics.selected == selected
    observed_statuses = set(diagnostics.statuses) if compiled else set()
    if not compiled:
        # Exercise the exact same typed source body as the native artifact, not
        # merely the public reference fallback selected when artifacts are off.
        raw_output = [0] * (8 * len(left))
        raw_status = [0] * len(left)
        assert packed_cantor_add_batch(
            raw_output,
            raw_status,
            list(context.model_coefficients),
            [word for point in left for word in context.pack(point)],
            [word for point in right for word in context.pack(point)],
            len(left),
            context.genus,
            context.prime,
        )
        source_answer = tuple(
            context.unpack(raw_output[8 * index:8 * index + 8])
            for index in range(len(left))
        )
        assert source_answer == expected
        if exhaustive:
            observed_statuses = set(raw_status)

    doubled = context.double_batch(sample, algorithm=selected)
    doubled_reference = J.prepared_arithmetic(algorithm="reference").double_batch(
        sample, algorithm="reference"
    )
    assert doubled == doubled_reference

    negated, negate_diagnostics = context.negate_batch(
        sample, algorithm=selected, diagnostics=True
    )
    negated_reference = tuple(point._negate_reference() for point in sample)
    assert negated == negated_reference
    assert negate_diagnostics.operation == "negate"
    shifted = tuple(sample[(index + 1) % len(sample)] for index in range(len(sample)))
    differences, subtract_diagnostics = context.subtract_batch(
        sample, shifted, algorithm=selected, diagnostics=True
    )
    difference_reference = context.add_batch(
        sample,
        tuple(point._negate_reference() for point in shifted),
        algorithm="reference",
    )
    assert differences == difference_reference
    assert subtract_diagnostics.operation == "subtract"
    if compiled:
        assert isinstance(negated, PreparedDivisorBatch)
        assert isinstance(differences, PreparedDivisorBatch)
        assert negated.published_count == 0
        assert differences.published_count == 0
        prepared_sample = context.prepare_batch(sample[:min(16, len(sample))])
        assert isinstance(prepared_sample, PreparedDivisorBatch)
        assert context.prepare_batch(prepared_sample) is prepared_sample
        assert prepared_sample == tuple(sample[:len(prepared_sample)])
        assert prepared_sample.published_count == 0
        packed_total, sum_diagnostics = context.sum(
            prepared_sample,
            algorithm="native",
            diagnostics=True,
        )
        reference_total = context.sum(
            sample[:len(prepared_sample)], algorithm="reference"
        )
        assert packed_total == reference_total
        assert prepared_sample.published_count == 0
        assert sum_diagnostics.operation == "sum"
    assert sample[1].negate(algorithm=selected) == negated_reference[1]
    assert sample[1].subtract(sample[2], algorithm=selected) == difference_reference[1]

    progression = context.progression_batch(
        sample[0], sample[1], 19, algorithm=selected
    )
    progression_reference = context.progression_batch(
        sample[0], sample[1], 19, algorithm="reference"
    )
    assert progression == progression_reference
    packed_progression = context.progression_batch(
        sample[0], sample[1], 19, algorithm=selected, packed=True
    )
    assert tuple(context.unpack(row) for row in packed_progression) == progression_reference
    if not compiled:
        raw_output = [0] * (19 * 8)
        raw_status = [0] * 19
        assert packed_cantor_progression_batch(
            raw_output,
            raw_status,
            list(context.model_coefficients),
            list(context.pack(sample[0])),
            list(context.pack(sample[1])),
            19,
            context.genus,
            context.prime,
        )
        source_progression = tuple(
            context.unpack(raw_output[8 * index:8 * index + 8])
            for index in range(19)
        )
        assert source_progression == progression_reference

    scalars = [
        -(2**130 + 17), -257, -1, 0, 1, 2, 17, 2**128 + 12345
    ]
    scalar_points = [sample[index % len(sample)] for index in range(len(scalars))]
    products, scalar_diagnostics = context.scalar_batch(
        scalar_points, scalars, algorithm=selected, diagnostics=True
    )
    reference_products = J.prepared_arithmetic(algorithm="reference").scalar_batch(
        scalar_points, scalars, algorithm="reference"
    )
    assert products == reference_products
    operation_statuses = tuple(
        scalar_operations(scalar) + 1 for scalar in scalars
    )
    if compiled:
        assert scalar_diagnostics.statuses == operation_statuses
    if not compiled:
        maximum_bits = max(abs(value).bit_length() for value in scalars)
        words_per_scalar = max(1, (maximum_bits + 63) // 64)
        scalar_words = []
        signs = []
        for scalar in scalars:
            signs.append(1 if scalar < 0 else 0)
            magnitude = abs(scalar)
            for _index in range(words_per_scalar):
                scalar_words.append(magnitude % (1 << 64))
                magnitude //= 1 << 64
        raw_output = [0] * (8 * len(scalars))
        raw_status = [0] * len(scalars)
        assert packed_cantor_scalar_batch(
            raw_output,
            raw_status,
            list(context.model_coefficients),
            [word for point in scalar_points for word in context.pack(point)],
            scalar_words,
            signs,
            len(scalars),
            words_per_scalar,
            context.genus,
            context.prime,
        )
        source_products = tuple(
            context.unpack(raw_output[8 * index:8 * index + 8])
            for index in range(len(scalars))
        )
        assert source_products == reference_products
        assert tuple(raw_status) == operation_statuses

    search_point = sample[1]
    search_order = search_point.order(multiple=J.order(), algorithm="reference")
    found, search_diagnostics = context.search_progression(
        search_point,
        1,
        1,
        search_order,
        algorithm=selected,
        diagnostics=True,
    )
    assert found == search_order - 1
    assert search_diagnostics.status == "found"
    assert search_diagnostics.selected == selected
    duplicate = context.search_progression(
        search_point, search_order, search_order, 17, algorithm=selected
    )
    assert duplicate == 0
    missing, missing_diagnostics = context.search_progression(
        search_point,
        1,
        search_order,
        17,
        algorithm=selected,
        diagnostics=True,
    )
    assert missing is None
    assert missing_diagnostics.status == "not_found"
    ordered, ordered_diagnostics = context.search_progressions(
        search_point,
        (1, search_order),
        1,
        (search_order, 3),
        algorithm=selected,
        diagnostics=True,
    )
    assert ordered == (0, search_order - 1)
    assert ordered_diagnostics.status == "found"
    assert ordered_diagnostics.progressions_scanned == 1
    if compiled:
        assert ordered_diagnostics.table_bytes > 0
    assert context.search_progressions(
        search_point,
        (search_order, 1),
        1,
        (3, search_order),
        algorithm=selected,
    ) == (0, 0)
    multi_missing, multi_missing_diagnostics = context.search_progressions(
        search_point,
        (1, 1),
        search_order,
        (1, 1),
        algorithm=selected,
        diagnostics=True,
    )
    assert multi_missing is None
    assert multi_missing_diagnostics.status == "not_found"
    assert multi_missing_diagnostics.progressions_scanned == 2
    try:
        context.search_progressions(
            search_point,
            (1, search_order),
            1,
            (search_order, 3),
            algorithm=selected,
            max_group_operations=0,
        )
    except RuntimeError:
        pass
    else:
        raise AssertionError("multi-search operation resource limit was ignored")
    try:
        context.search_progression(
            search_point,
            1,
            1,
            search_order,
            algorithm=selected,
            max_group_operations=0,
        )
    except RuntimeError:
        pass
    else:
        raise AssertionError("search operation resource limit was ignored")
    if not compiled:
        baby_count = 1
        while baby_count * baby_count < search_order:
            baby_count += 1
        raw_output = [0]
        raw_status = [0]
        raw_diagnostics = [0] * 5
        assert packed_cantor_search_progression(
            raw_output,
            raw_status,
            raw_diagnostics,
            list(context.model_coefficients),
            list(context.pack(search_point)),
            [1],
            [1],
            1,
            search_order,
            baby_count,
            10000,
            context.genus,
            context.prime,
        )
        assert raw_status == [1]
        assert raw_output == [search_order - 1]
        raw_multi_output = [99, 99]
        raw_multi_status = [0]
        raw_multi_diagnostics = [0] * 7
        assert packed_cantor_search_progressions(
            raw_multi_output,
            raw_multi_status,
            raw_multi_diagnostics,
            list(context.model_coefficients),
            list(context.pack(search_point)),
            [1, search_order],
            [1],
            [search_order, 3],
            2,
            1,
            baby_count,
            10000,
            context.genus,
            context.prime,
        )
        assert raw_multi_status == [1]
        assert raw_multi_output == [0, search_order - 1]

    # Exhaust every small-field divisor against a literal represented interval.
    # This covers identity keys, repeated baby rows, found/not-found outcomes,
    # and both genera without assuming a cyclic Jacobian.
    search_domain = points if exhaustive and len(points) <= 64 else points[:8]
    for point in search_domain:
        for base, stride, count in ((1, 1, 9), (2, 3, 11)):
            expected_index = None
            for index in range(count):
                if context._reference_scalar(point, base + index * stride).is_zero():
                    expected_index = index
                    break
            assert context.search_progression(
                point, base, stride, count, algorithm=selected
            ) == expected_index
            assert context.search_progression(
                point, base, stride, count, algorithm="reference"
            ) == expected_index
        bases = (1, 2, 5)
        counts = (3, 4, 5)
        stride = 3
        expected_multi = None
        for progression, (base, count) in enumerate(
            zip(bases, counts, strict=True)
        ):
            for index in range(count):
                if context._reference_scalar(
                    point, base + index * stride
                ).is_zero():
                    expected_multi = (progression, index)
                    break
            if expected_multi is not None:
                break
        assert context.search_progressions(
            point, bases, stride, counts, algorithm=selected
        ) == expected_multi
        assert context.search_progressions(
            point, bases, stride, counts, algorithm="reference"
        ) == expected_multi

    assert context.sum(sample, algorithm=selected) == context.sum(
        sample, algorithm="reference"
    )
    try:
        J.prepared_arithmetic(max_batch_items=2).add_batch(sample[:3], sample[:3])
    except RuntimeError:
        pass
    else:
        raise AssertionError("batch resource limit was ignored")
    try:
        context.scalar_batch(sample[:1], [17], max_group_operations=2)
    except RuntimeError:
        pass
    else:
        raise AssertionError("scalar operation resource limit was ignored")
    try:
        context.progression_batch(
            sample[0], sample[1], 4, max_group_operations=2
        )
    except RuntimeError:
        pass
    else:
        raise AssertionError("progression operation resource limit was ignored")
    return len(points), context.model_fingerprint, tuple(sorted(observed_statuses))


R = PolynomialRing(GF(3), "x")
x = R.gen()
rows = []
rows.append(check_curve(HyperellipticCurve(x**5 + x**2 + 1), True))
rows.append(check_curve(HyperellipticCurve(x**5 + x**2 + 2, x), True))
rows.append(check_curve(HyperellipticCurve(x**7 + x + 2), False))
rows.append(check_curve(HyperellipticCurve(x**7 + x + 2, x**2 + 1), False))
assert set(rows[0][2] + rows[1][2]) == {1, 2, 3, 4, 5}

# Parent and curve identity are never inferred from coincident coefficients.
J0 = HyperellipticCurve(x**5 + x**2 + 1).jacobian()
J1 = HyperellipticCurve(x**5 + x**2 + 2, x).jacobian()
try:
    J0.prepared_arithmetic().pack(J1.zero())
except ValueError:
    pass
else:
    raise AssertionError("cross-model divisor accepted")
assert J0.prepared_arithmetic().model_fingerprint != J1.prepared_arithmetic().model_fingerprint
assert not hasattr(J0, "_packed_element")
try:
    type(J0.zero())(
        J0,
        None,
        None,
        False,
        packed_row=(0, 1, 0, 0, 0, 0, 0, 0),
    )
except TypeError:
    pass
else:
    raise AssertionError("the public divisor constructor accepted a packed bypass")
try:
    J0.prepared_arithmetic().unpack((1, 0, 1, 0, 0, 0, 0, 0))
except ValueError as error:
    assert "does not divide" in str(error)
else:
    raise AssertionError("public unpack accepted a row outside the curve relation")
attack_points = J0.points(max_elements=10000, max_candidates=100000)
attack_context = J0.prepared_arithmetic()
valid_row = attack_context.pack(attack_points[0])
invalid_relation_row = (1, 0, 1, 0, 0, 0, 0, 0)
for invalid_rows, expected_error in (
    ((valid_row[:-1],), ValueError),
    (((True,) + valid_row[1:],), TypeError),
    (((1.5,) + valid_row[1:],), ValueError),
    (((-1,) + valid_row[1:],), ValueError),
    ((((1 << 64),) + valid_row[1:],), OverflowError),
    ((invalid_relation_row,), ValueError),
):
    try:
        attack_context.unpack_batch(invalid_rows, algorithm=selected)
    except expected_error:
        pass
    else:
        raise AssertionError("authenticated batch ingress accepted invalid input")

# Directly check the source/native kernel's fail-atomic output contract.  A
# valid first row followed by an invalid relation may update diagnostic
# statuses, but may not copy even the first output row.
atomic_rows = list(valid_row + invalid_relation_row)
atomic_output = kernel_uint64_buffer(packed_cantor_validate_batch, [99] * 16)
atomic_status = kernel_uint64_buffer(packed_cantor_validate_batch, [7, 7])
atomic_model = kernel_uint64_buffer(
    packed_cantor_validate_batch, attack_context.model_coefficients
)
atomic_input = kernel_uint64_buffer(packed_cantor_validate_batch, atomic_rows)
assert not packed_cantor_validate_batch(
    atomic_output,
    atomic_status,
    atomic_model,
    atomic_input,
    2,
    attack_context.genus,
    attack_context.prime,
)
assert tuple(int(value) for value in atomic_output) == (99,) * 16
P = attack_context.unpack(attack_context.pack(attack_points[1]))
Q = attack_context.unpack(attack_context.pack(attack_points[2]))
foreign_context = J1.prepared_arithmetic()
foreign_zero = foreign_context.unpack(foreign_context.pack(J1.zero()))
foreign_invalid_row = None
for foreign_point in J1.points(max_elements=10000, max_candidates=100000):
    candidate = foreign_context.pack(foreign_point)
    try:
        attack_context.unpack_batch((candidate,), algorithm="reference")
    except ValueError:
        foreign_invalid_row = candidate
        break
assert foreign_invalid_row is not None
for attack_algorithm in (selected, "reference"):
    try:
        attack_context.unpack_batch((foreign_invalid_row,), algorithm=attack_algorithm)
    except ValueError:
        pass
    else:
        raise AssertionError("authenticated ingress accepted a foreign-model row")
for attack_algorithm in (selected, "reference"):
    try:
        attack_context.add_batch(
            (P,), (foreign_zero,), algorithm=attack_algorithm
        )
    except ValueError as error:
        assert "this Jacobian" in str(error)
    else:
        raise AssertionError(
            "authenticated gathering accepted a divisor from another parent"
        )
serialized_source = attack_context.add_batch((P,), (J0.zero(),))[0]
serialized_packet = pickle.dumps(serialized_source)
serialized_roundtrip = pickle.loads(serialized_packet)
serialized_context = serialized_roundtrip.parent().prepared_arithmetic()
assert serialized_context.model_fingerprint == attack_context.model_fingerprint
assert serialized_context.pack(serialized_roundtrip) == attack_context.pack(
    serialized_source
)

# check=False retains its public compatibility semantics, but an invalid pair
# is never registered as canonical and still fails a prepared boundary.
unchecked_invalid = type(P)(J0, x, R(0), False)
assert getattr(unchecked_invalid, "_MumfordDivisor__packed_row_binding") is None
try:
    attack_context.prepare_batch((unchecked_invalid,))
except (ArithmeticError, TypeError, ValueError):
    pass
else:
    raise AssertionError("unchecked invalid construction gained a packed capsule")
try:
    PreparedDivisorBatch(attack_context, (0, 1, 0, 0, 0, 0, 0, 0), 1)
except TypeError:
    pass
else:
    raise AssertionError("the public packed-batch constructor accepted forged rows")
P_hash = hash(P)
P_repr = repr(P)
Q_row = attack_context.pack(Q)
try:
    object.__setattr__(P, "_packed_row", Q_row)
except (AttributeError, TypeError):
    pass
else:
    raise AssertionError("object.__setattr__ replaced an opaque packed binding")
binding_name = "_MumfordDivisor__packed_row_binding"
P_binding = getattr(P, binding_name)
Q_binding = getattr(Q, binding_name)
object.__setattr__(P, binding_name, (P, Q_row))
try:
    attack_context.pack(P)
except (ArithmeticError, TypeError, ValueError) as error:
    assert "capsule" in str(error) or "binding was corrupted" in str(error)
else:
    raise AssertionError("an owner-rebound tuple row became authoritative")
object.__setattr__(P, binding_name, P_binding)
object.__setattr__(P, binding_name, Q_binding)
try:
    attack_context.pack(P)
except ArithmeticError as error:
    assert "binding was corrupted" in str(error)
else:
    raise AssertionError("a transplanted hidden binding did not fail closed")
object.__setattr__(P, binding_name, P_binding)
object.__setattr__(P, binding_name, (P, Q_binding[1]))
try:
    attack_context.pack(P)
except (ArithmeticError, TypeError, ValueError) as error:
    assert "binding mismatch" in str(error)
else:
    raise AssertionError("an owner-rebound foreign divisor capsule was accepted")
object.__setattr__(P, binding_name, P_binding)
assert P != Q
assert hash(P) == P_hash
assert repr(P) == P_repr
assert attack_context.add_batch((P,), (J0.zero(),))[0] == P
first_batch = attack_context.prepare_batch((P,))
second_batch = attack_context.prepare_batch((Q,))
batch_binding_name = "_PreparedDivisorBatch__binding"
first_binding = getattr(first_batch, batch_binding_name)
second_binding = getattr(second_batch, batch_binding_name)
assert "packed" not in repr(first_binding[2]).lower()
assert "0" not in repr(first_binding[2])
object.__setattr__(first_batch, batch_binding_name, second_binding)
try:
    first_batch[0]
except ArithmeticError as error:
    assert "binding was corrupted" in str(error)
else:
    raise AssertionError("a transplanted batch binding did not fail closed")
# Even repairing the visible self slot cannot transplant another batch's
# opaque storage: the runtime capsule rechecks its original owner identity.
object.__setattr__(
    first_batch,
    batch_binding_name,
    (first_batch, attack_context, second_binding[2], second_binding[3]),
)
try:
    first_batch._rows_for(attack_context)
except (ArithmeticError, TypeError, ValueError) as error:
    assert "binding mismatch" in str(error)
else:
    raise AssertionError("a rebound foreign capsule did not fail closed")
same_J = HyperellipticCurve(x**5 + x**2 + 1).jacobian()
same_context = same_J.prepared_arithmetic()
object.__setattr__(
    first_batch,
    batch_binding_name,
    (first_batch, same_context, first_binding[2], first_binding[3]),
)
try:
    first_batch._rows_for(same_context)
except (ArithmeticError, TypeError, ValueError) as error:
    assert "binding mismatch" in str(error)
else:
    raise AssertionError("a batch moved to an equal-model parent context")
object.__setattr__(first_batch, batch_binding_name, first_binding)
try:
    capsule_factory(
        second_batch._rows_for(attack_context),
        first_batch,
        attack_context.model_fingerprint + ":" + str(id(attack_context)),
        "sagejs.hyperelliptic.packed-mumford.odd.v1.batch8",
        1,
    )
except (ArithmeticError, TypeError, ValueError) as error:
    assert "already registered" in str(error)
else:
    raise AssertionError("a batch owner accepted a second forged capsule")
object.__setattr__(first_batch, batch_binding_name, first_binding)
assert first_batch[0] == P

# A public materialized divisor computes its row from (u,v) before trying to
# cache it.  Malicious capsule pre-registration can only make that cache step
# fail; the attacker's unrelated row is never consulted as provenance.
source_R = attack_points[3]
u_R, v_R = source_R.uv()
# Deliberately bypass the public constructor to model a malicious owner
# pre-registration against otherwise valid materialized provenance.
R_public = object.__new__(type(source_R))
R_public._parent = J0
R_public._u = u_R
R_public._v = v_R
object.__setattr__(R_public, binding_name, None)
R_public._packed_hash = None
R_capsule = capsule_factory(
    Q_row,
    R_public,
    attack_context.model_fingerprint + ":" + str(id(J0)),
    "sagejs.hyperelliptic.packed-mumford.odd.v1.divisor8",
    1,
)
object.__setattr__(R_public, binding_name, (R_public, R_capsule))
try:
    attack_context.pack(R_public)
except (ArithmeticError, TypeError, ValueError) as error:
    assert "disagrees with its provenance" in str(error)
else:
    raise AssertionError("malicious pre-registration authenticated a public row")

try:
    HyperellipticCurve(x**6 + x + 1).jacobian()
except NotImplementedError as error:
    assert "odd-degree model" in str(error)
else:
    raise AssertionError("even-degree Jacobian was ambiguously accepted by v1")

print("compiled=" + str(compiled))
print("rows=" + repr(rows))
print("HYPERELLIPTIC_NATIVE_CANTOR_OK")
`;

test("prepared packed Cantor arithmetic is exact in dynamic and native modes", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-cantor-native-"));
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
      "packed_cantor_add_batch",
    ]);
    assert.match(explanation, /host-isolated core: yes/);
    assert.match(explanation, /0 callbacks inside core/);
    run(process.execPath, [
      sagejs,
      "native",
      "compile",
      source,
      "--cache-root",
      cache,
    ]);
    const core = filesNamed(cache, "kernel_core.c")
      .map((path) => readFileSync(path, "utf8"))
      .find((text) => text.includes("sagejs_kernel_packed_cantor_add_batch"));
    assert.ok(core, "compiled Cantor core source was not inspectable");
    for (const signature of [
      "int sagejs_kernel__cantor_add_one(",
      "int sagejs_kernel__poly_xgcd(",
    ]) {
      const body = cFunction(core, signature);
      assert.match(body, /word__poly_copy/);
      assert.doesNotMatch(body, /sagejs_kernel__poly_copy/);
      assert.doesNotMatch(body, /native__poly_copy|mpz_|SAGEJS_WORD_PROMOTE/);
    }
    for (const signature of [
      "SAGEJS_WORD_INLINE int word__poly_copy(",
      "SAGEJS_WORD_INLINE int word__poly_clear(",
    ]) {
      const body = cFunction(core, signature);
      assert.doesNotMatch(body, /native__|mpz_|SAGEJS_WORD_PROMOTE/);
    }
    const searchBody = cFunction(
      core,
      "int sagejs_kernel_packed_cantor_search_progression(",
    );
    for (const helper of [
      "word__row_hash",
      "word__row_copy",
      "word__row_equal",
      "word__search_record",
    ]) {
      assert.match(searchBody, new RegExp(helper));
    }
    assert.doesNotMatch(
      searchBody,
      /native__row_|native__search_record|mpz_|SAGEJS_WORD_PROMOTE/,
    );
    const multiSearchBody = cFunction(
      core,
      "int sagejs_kernel_packed_cantor_search_progressions(",
    );
    for (const helper of [
      "word__row_hash",
      "word__row_copy",
      "word__row_equal",
      "word__multi_search_record",
    ]) {
      assert.match(multiSearchBody, new RegExp(helper));
    }
    assert.doesNotMatch(
      multiSearchBody,
      /native__row_|native__multi_search_record|mpz_|SAGEJS_WORD_PROMOTE/,
    );
    const dynamic = run(process.execPath, [sagejs, program], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cache,
        SAGEJS_NATIVE_DISABLE: "1",
      },
    });
    const native = run(process.execPath, [sagejs, program], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cache,
      },
    });
    assert.match(native, /compiled=True/);
    assert.match(dynamic, /compiled=False/);
    assert.match(native, /HYPERELLIPTIC_NATIVE_CANTOR_OK/);
    assert.match(dynamic, /HYPERELLIPTIC_NATIVE_CANTOR_OK/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("packed Cantor kernels retain an ordinary CPython fallback", () => {
  const program = [
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
    "from sagejs.hyperelliptic_curves.jacobian_kernels import packed_cantor_add_batch, packed_cantor_copy_batch, packed_cantor_progression_batch, packed_cantor_search_progression, packed_cantor_search_progressions, packed_cantor_scalar_batch, packed_cantor_validate_batch",
    "model = [1,1,0,0,0,1,0,0] + [0]*4",
    "identity = [0,1,0,0,0,0,0,0]",
    "out = [99]*16; status = [0,0]",
    "assert packed_cantor_add_batch(out,status,model,identity*2,identity*2,2,2,3)",
    "assert out == identity*2 and status == [5,5]",
    "copy_out = [99]*16; copy_status = [0,0]",
    "assert packed_cantor_copy_batch(copy_out,copy_status,model,identity*2,identity*2,2,2,3)",
    "assert copy_out == identity*2 and copy_status == [1,1]",
    "validate_out = [99]*16; validate_status = [7,7]",
    "assert packed_cantor_validate_batch(validate_out,validate_status,model,identity*2,2,2,3)",
    "assert validate_out == identity*2 and validate_status == [1,1]",
    "invalid = [1,0,1,0,0,0,0,0]",
    "validate_out = [99]*16; validate_status = [7,7]",
    "assert not packed_cantor_validate_batch(validate_out,validate_status,model,identity+invalid,2,2,3)",
    "assert validate_out == [99]*16 and validate_status == [1,0]",
    "progression_out = [99]*16; progression_status = [0,0]",
    "assert packed_cantor_progression_batch(progression_out,progression_status,model,identity,identity,2,2,3)",
    "assert progression_out == identity*2 and progression_status == [5,5]",
    "scalar_out = [99]*8; scalar_status = [0]",
    "assert packed_cantor_scalar_batch(scalar_out,scalar_status,model,identity,[0],[0],1,1,2,3)",
    "assert scalar_out == identity",
    "search_out = [99]; search_status = [0]; search_diagnostics = [0]*5",
    "assert packed_cantor_search_progression(search_out,search_status,search_diagnostics,model,identity,[1],[1],1,4,2,10,2,3)",
    "assert search_out == [0] and search_status == [1]",
    "multi_out = [99,99]; multi_status = [0]; multi_diagnostics = [0]*7",
    "assert packed_cantor_search_progressions(multi_out,multi_status,multi_diagnostics,model,identity,[1,2],[1],[4,4],2,1,2,20,2,3)",
    "assert multi_out == [0,0] and multi_status == [1]",
    "print('cpython-ok')",
  ].join("\n");
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  assert.equal(run(python, ["-I", "-c", program]), "cpython-ok");
});
