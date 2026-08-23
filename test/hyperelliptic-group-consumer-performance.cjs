"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");

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

test("bounded integer factorization proves and recursively splits tails", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.group_structure import (
    JacobianResourceLimitError,
    factor_integer_bounded,
)

assert factor_integer_bounded(101, 0) == [(101, 1)]
assert factor_integer_bounded(2*101, 1) == [(2, 1), (101, 1)]
assert factor_integer_bounded(4179926624207, 1000000) == [
    (4179926624207, 1)
]
assert factor_integer_bounded(1000003*1000033, 0) == [
    (1000003, 1), (1000033, 1)
]
assert factor_integer_bounded(1009^4, 0) == [(1009, 4)]
assert factor_integer_bounded(17139710183594, 1000000) == [
    (2, 1), (2741009, 1), (3126533, 1)
]
assert factor_integer_bounded(3*101, 2, 0) == [(3, 1), (101, 1)]

for composite, budget in ((101*103, 0), (2*101*103, 1)):
    try:
        factor_integer_bounded(composite, budget, 0)
        raise AssertionError("an unfactored composite tail was accepted")
    except JacobianResourceLimitError:
        pass

try:
    factor_integer_bounded(15, 0, -1)
    raise AssertionError("a negative rho budget was accepted")
except ValueError:
    pass
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("group consumers reuse prepared scalar, addition, and sum batches", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.group_structure import (
    GroupOperationBudget,
    add_pairs_batched,
    element_order_from_multiple,
    group_element_key,
)
R = PolynomialRing(GF(5), "x")
x = R.gen()
J = HyperellipticCurve(x**5 + x + 1, x**2 + 1).jacobian()
points = J.points()
D = next(value for value in points if not value.is_zero())

class InstrumentedPrepared:
    def __init__(self):
        self.native_available = True
        self.scalar_batches = 0
        self.add_batches = 0
        self.sums = 0
        self.pack_calls = 0
        self.model_fingerprint = "instrumented-model"
    def scalar_batch(
        self, elements, scalars, algorithm=None, max_group_operations=None
    ):
        self.scalar_batches += 1
        return tuple(
            element._scalar_multiple_reference(scalar)
            for element, scalar in zip(elements, scalars)
        )
    def add_batch(self, left, right):
        self.add_batches += 1
        answer = []
        for a, b in zip(left, right):
            u, v = J._compose(a[0], a[1], b[0], b[1])
            answer.append(J._element(u, v, False))
        return tuple(answer)
    def sum(self, elements):
        self.sums += 1
        answer = J.zero()
        for element in elements:
            u, v = J._compose(answer[0], answer[1], element[0], element[1])
            answer = J._element(u, v, False)
        return answer
    def pack(self, element):
        self.pack_calls += 1
        return (3, 1, 2, 3, 4, 5, 6, 7)

prepared = InstrumentedPrepared()
def prepared_factory(algorithm="auto", max_batch_items=100000):
    return prepared
J.prepared_arithmetic = prepared_factory

factors = [(2, 5)]
actual_order = element_order_from_multiple(
    D, 32, factors, scalar_algorithm="auto"
)
assert actual_order == D.order(
    multiple=32, factorization=factors, algorithm="reference"
)
assert prepared.scalar_batches == 1

budget = GroupOperationBudget(100000, 1000, 1024*1024, "auto")
value = budget.linear_combination(
    (3, 5), (D, D._scalar_multiple_reference(2))
)
assert value == D._scalar_multiple_reference(13)
assert prepared.scalar_batches == 2
assert prepared.sums == 1

pair = add_pairs_batched(
    (D, D._scalar_multiple_reference(2)),
    (D._scalar_multiple_reference(3), D._scalar_multiple_reference(4)),
    algorithm="auto",
)
assert pair == (
    D._scalar_multiple_reference(4), D._scalar_multiple_reference(6)
)
assert prepared.add_batches == 1
assert group_element_key(D) == group_element_key(J(D))
class PackedOnly:
    def parent(self):
        return J
    def uv(self):
        raise AssertionError("prepared keys must not materialize u,v")
assert group_element_key(PackedOnly(), prepared) == (
    "prepared-prime-field-mumford",
    "instrumented-model",
    (3, 1, 2, 3, 4, 5, 6, 7),
)
assert prepared.pack_calls == 1

prepared.native_available = False
fallback_budget = GroupOperationBudget(100000, 1000, 1024*1024, "auto")
assert fallback_budget.linear_combination(
    (3, 5), (D, D._scalar_multiple_reference(2))
) == D._scalar_multiple_reference(13)
assert prepared.scalar_batches == 2
assert prepared.sums == 1
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("packed genus-three candidate filtering matches dynamic exact replay", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-g3-candidate-stream-"));
  const cache = join(temporary, "cache");
  const program = join(temporary, "witness.py");
  const source = join(
    root,
    "src",
    "lib",
    "sagejs",
    "hyperelliptic_curves",
    "genus3_candidate_kernel.py",
  );
  const witness = String.raw`
from sagejs.hyperelliptic_curves.certified_genus3 import _order_progressions
from sagejs.hyperelliptic_curves.genus3_candidate_kernel import scan_genus3_candidate_progressions
from sagejs.hyperelliptic_curves.genus3_completion import (
    _candidate_word_capacity,
    enumerate_genus3_weil_candidates,
    jacobian_order_from_coefficients,
    progression_order_count,
    summarize_genus3_candidate_progressions,
    twist_order_from_coefficients,
)
from sagejs.native import integer_buffer_values, kernel_integer_buffer, kernel_integer_zeros

p = 101
residues = (12, 56, 85)
old = enumerate_genus3_weil_candidates(p, residues)

def direct(primary=(), twist=(), kind=0, capacity=100):
    output = [0 for _index in range(7 + 2*capacity)]
    status = scan_genus3_candidate_progressions.__wrapped__(
        output, p, residues[0], residues[1], residues[2],
        list(primary) or [1], len(primary), list(twist) or [1], len(twist),
        kind, 2_000_000,
    )
    progressions = tuple(
        {"base": output[7+2*i], "stride": p, "count": output[8+2*i]}
        for i in range(output[3])
    )
    orders = tuple(
        progression["base"] + i*p
        for progression in progressions
        for i in range(progression["count"])
    )
    candidate = None if output[1] != 1 else tuple(output[4:7])
    return status, output[:4], progressions, orders, candidate

native = summarize_genus3_candidate_progressions(p, residues)
dynamic = direct()
old_orders = tuple(jacobian_order_from_coefficients(c, p) for c in old["candidates"])
assert native["candidate_count"] == old["candidate_count"] == dynamic[1][0] == 50
assert native["survivor_count"] == dynamic[1][1] == 50
assert native["progressions"] == dynamic[2] == _order_progressions(old["candidates"], p, "jacobian")
assert set(native["orders"]) == set(dynamic[3]) == set(old_orders)
assert native["orders"] == tuple(sorted(set(old_orders)))
compact = summarize_genus3_candidate_progressions(
    p, residues, materialize_orders=False
)
assert compact["orders"] is None
assert compact["order_count"] == len(set(old_orders))
assert progression_order_count(native["progressions"], p, (149,)) == len(
    set(order for order in old_orders if order % 149 == 0)
)
assert _candidate_word_capacity(100000) == 1
assert _candidate_word_capacity(1 << 21) == 2

primary = summarize_genus3_candidate_progressions(
    p, residues, primary_witnesses=(149,)
)
primary_dynamic = direct(primary=(149,))
primary_expected = tuple(c for c in old["candidates"] if jacobian_order_from_coefficients(c,p) % 149 == 0)
assert primary["survivor_count"] == primary_dynamic[1][1] == len(primary_expected) == 1
assert primary["candidate"] == primary_dynamic[4] == primary_expected[0] == (12,56,186)

twist = summarize_genus3_candidate_progressions(
    p, residues, twist_witnesses=(17,), order_kind="twist"
)
twist_dynamic = direct(twist=(17,), kind=1)
twist_expected = tuple(c for c in old["candidates"] if twist_order_from_coefficients(c,p) % 17 == 0)
assert twist["survivor_count"] == twist_dynamic[1][1] == len(twist_expected) == 2
assert set(twist["orders"]) == set(twist_dynamic[3]) == set(
    twist_order_from_coefficients(c,p) for c in twist_expected
)

small = kernel_integer_zeros(scan_genus3_candidate_progressions, 7)
empty = kernel_integer_buffer(scan_genus3_candidate_progressions, (1,))
status = scan_genus3_candidate_progressions(
    small, p, residues[0], residues[1], residues[2],
    empty, 0, empty, 0, 0, 2_000_000,
)
metadata = integer_buffer_values(small)
assert status == -3 and int(metadata[0]) == 50 and int(metadata[3]) == 4
limited = summarize_genus3_candidate_progressions(
    p, residues, max_combinations=10
)
assert limited["status"] == "resource_limit"
assert limited["diagnostics"]["combinations_examined"] == 10
print("G3_CANDIDATE_STREAM_OK")
`;
  try {
    writeFileSync(program, witness);
    const explanation = run(process.execPath, [
      sagejs,
      "native",
      "explain",
      source,
      "--function",
      "scan_genus3_candidate_progressions",
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
    const output = run(process.execPath, [sagejs, program], {
      env: { SAGEJS_NATIVE_CACHE_DIR: cache },
    });
    assert.match(output, /G3_CANDIDATE_STREAM_OK/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("rank-three structure and maps retain exact reference certificates", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
R = PolynomialRing(GF(5), "x")
x = R.gen()
J = HyperellipticCurve(x**5 + x + 1, x**2 + 1).jacobian()
assert J.order() == 32
assert J.group_structure(algorithm="basis", seed=3) == (2, 2, 8)
assert J.group_structure(algorithm="exhaustive", seed=3) == (2, 2, 8)
original_generic_basis = J._generic_group_basis
original_points = J.points
point_enumerations = [0]
def forbidden_repeated_basis(*_args, **_kwds):
    raise AssertionError("a complete tiny group must reuse exhaustive points")
def counted_points(*args, **kwds):
    point_enumerations[0] += 1
    return original_points(*args, **kwds)
J._generic_group_basis = forbidden_repeated_basis
J.points = counted_points
try:
    G, phi = J.abelian_group(algorithm="exhaustive", seed=3)
finally:
    J._generic_group_basis = original_generic_basis
    J.points = original_points
assert point_enumerations[0] == 1
assert G.invariants() == (2, 2, 8)
assert len(phi._inverse_coordinates) == 32
assert phi._certificate is None
assert phi.verify()
certificate = J.group_structure_certificate(algorithm="basis", seed=3)
assert certificate["algorithms"]["group_law"] == "generalized-cantor-odd-degree.v1"
assert J.verify_group_structure_certificate(certificate)
for coordinates in ((0,0,0), (1,0,0), (0,1,0), (1,1,7), (0,0,4)):
    value = G(coordinates)
    assert phi.preimage(phi(value)) == value
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("genus-three completion memoizes duplicate exact annihilation queries", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.genus3_completion import (
    complete_genus3_lpolynomial,
    enumerate_genus3_weil_candidates,
    jacobian_order_from_coefficients,
)
p = 101
residues = (12, 56, 85)
candidates = enumerate_genus3_weil_candidates(p, residues)["candidates"]
counts = {}
def test_order(order):
    counts[order] = counts.get(order, 0) + 1
    return order % 149 == 0
answer = complete_genus3_lpolynomial(
    p,
    residues,
    jacobian_annihilation_tests=(test_order,),
)
assert answer["status"] == "unique"
assert answer["coefficients"] == (12, 56, 186)
unique_orders = set(jacobian_order_from_coefficients(c, p) for c in candidates)
assert all(count == 1 for count in counts.values())
assert len(counts) <= len(unique_orders)
assert answer["diagnostics"]["annihilation_test_calls"]["jacobian"] == len(counts)
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("genus-three prime streams reuse the exact completed-square model", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.certified_genus3 import (
    _rational_completed_square_data,
    _rational_completed_square_reduction,
    _reduce_rational_curve,
)
R = PolynomialRing(QQ, "x")
x = R.gen()
h = x**3 + 1
C = HyperellipticCurve((x**7 + x + 1 - h**2)/4, h)
data = _rational_completed_square_data(C)
assert data == _rational_completed_square_data(C)
for prime in (3, 5, 13, 19):
    reduced = _reduce_rational_curve(C, prime)
    reduced_f, reduced_h = reduced.hyperelliptic_polynomials()
    expected = reduced_h*reduced_h + reduced.base_ring()(4)*reduced_f
    actual = _rational_completed_square_reduction(C, prime, data)
    actual_f, actual_h = actual.hyperelliptic_polynomials()
    assert actual_h.is_zero() and actual_f == expected
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("packed genus-three witnesses match public reductions and detach certificates", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.certified_genus3 import (
    _deterministic_elements,
    _deterministic_packed_divisor,
    _least_nonsquare,
    _packed_cantor_kernels,
    _packed_completed_square_model,
    _packed_progression_certificate,
    _rational_completed_square_data,
    _rational_completed_square_reduction,
)
R = PolynomialRing(QQ, "x")
x = R.gen()
h = x**3 + 1
C = HyperellipticCurve((x**7 + x + 1 - h**2)/4, h)
data = _rational_completed_square_data(C)
for prime in (3, 5, 13, 19):
    packed_model = _packed_completed_square_model(data, prime)
    reduced = _rational_completed_square_reduction(C, prime, data)
    reduced_f, reduced_h = reduced.hyperelliptic_polynomials()
    expected_model = tuple(int(reduced_f[index]) for index in range(8))
    expected_model += tuple(int(reduced_h[index]) for index in range(4))
    assert packed_model == expected_model
    packed_divisor = _deterministic_packed_divisor(packed_model, prime, prime)
    J = reduced.jacobian()
    public_divisor = _deterministic_elements(
        J, prime, max_x_values=prime, max_elements=1)[0]
    u, v = public_divisor.uv()
    expected_divisor = (int(u.degree()),)
    expected_divisor += tuple(int(u[index]) for index in range(4))
    expected_divisor += tuple(int(v[index]) for index in range(3))
    assert packed_divisor == expected_divisor
    nonsquare = _least_nonsquare(prime)
    twist_model = _packed_completed_square_model(data, prime, nonsquare)
    assert twist_model[:8] == tuple(
        nonsquare*value % prime for value in packed_model[:8])

try:
    _packed_completed_square_model((((QQ(1)/3),), "x", 1), 3)
    raise AssertionError("a denominator prime was accepted")
except ArithmeticError:
    pass

if _packed_cantor_kernels() is not None:
    prime = 5
    model = _packed_completed_square_model(data, prime)
    divisor = _deterministic_packed_divisor(model, prime, prime)
    raw = _packed_progression_certificate(
        model,
        divisor,
        prime,
        ({"base":41, "stride":7, "count":5},),
        {
            "max_trial_divisions":1000,
            "max_baby_steps":1000,
            "max_group_operations":1000,
        },
    )
    assert raw["status"] == "found"
    certificate = raw["certificate"]
    assert certificate["element_order"] == 55
    assert certificate["prime_factors"] == ((5,1),(11,1))
    assert certificate["verification"] == "native_exact_factor_and_strip"
    assert certificate["witness_representation"] == "packed-mumford-v1"
    assert "divisor" not in certificate
    payload = certificate["packed_divisor"]
    assert payload == ("packed-mumford-v1", prime, model, divisor)
    mutable_model = list(model)
    mutable_model[0] += 1
    assert payload[2] == model and isinstance(payload[2], tuple)
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("prepared genus-three BSGS uses packed progressions and exact factor strip", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.certified_genus3 import (
    _deterministic_elements,
    _fused_prepared_order_certificates,
    _native_order_certificates,
    _prepared_order_certificates,
)
import sagejs.hyperelliptic_curves.certified_genus3 as certified_genus3
from sagejs.hyperelliptic_curves.group_structure import group_element_key
R = PolynomialRing(GF(5), "x")
x = R.gen()
J = HyperellipticCurve(x**7 + x + 1).jacobian()
original_add_pairs_batched = certified_genus3.add_pairs_batched
def forbidden_single_witness_add(*_args, **_kwds):
    raise AssertionError("one deterministic witness needs no group addition")
certified_genus3.add_pairs_batched = forbidden_single_witness_add
try:
    D = _deterministic_elements(J, 5, max_x_values=5, max_elements=1)[0]
finally:
    certified_genus3.add_pairs_batched = original_add_pairs_batched
assert not D.is_zero() and D.parent() == J
budgets = {
    "max_trial_divisions": 1000,
    "max_baby_steps": 1000,
    "max_group_operations": 1000,
}
legacy = _native_order_certificates(J, D, 41, 7, 5, "jacobian", budgets)
assert legacy["status"] == "found"
assert legacy["annihilating_multiple"] == 55
assert legacy["certificate"]["element_order"] == 55
assert legacy["diagnostics"].get("preparedProgressions") is None

class InstrumentedPrepared:
    def __init__(self):
        self.native_available = True
        self.search_available = True
        self.scalar_batches = 0
        self.progression_batches = 0
        self.searches = 0
    def scalar_batch(
        self, elements, scalars, algorithm=None, max_group_operations=None
    ):
        self.scalar_batches += 1
        return tuple(
            element._scalar_multiple_reference(scalar)
            for element, scalar in zip(elements, scalars)
        )
    def progression_batch(
        self, start, step, count, packed=False, max_group_operations=None
    ):
        self.progression_batches += 1
        values = []
        current = start
        for index in range(count):
            values.append(group_element_key(current) if packed else current)
            if index + 1 < count:
                u, v = J._compose(current[0], current[1], step[0], step[1])
                current = J._element(u, v, False)
        return tuple(values)
    def search_progression(
        self, element, base, stride, count, baby_count=None,
        diagnostics=False, max_group_operations=None,
    ):
        self.searches += 1
        found = None
        for index in range(count):
            if element._scalar_multiple_reference(base + index*stride).is_zero():
                found = index
                break
        class Record:
            group_operations = 18
            scalar_bits = 12
            baby_steps = 3
            giant_steps = 2
            hash_collisions = 1
            kernel_ns = 1000
        return (found, Record()) if diagnostics else found

prepared = InstrumentedPrepared()
def prepared_factory(algorithm="auto", max_batch_items=100000):
    return prepared
J.prepared_arithmetic = prepared_factory

answer = _prepared_order_certificates(
    J,
    D,
    41,
    7,
    5,
    budgets,
)
assert answer["status"] == "found"
assert answer["annihilating_multiple"] == 55
assert answer["certificate"]["element_order"] == 55
assert answer["certificate"]["prime_factors"] == ((5, 1), (11, 1))
assert answer["diagnostics"]["preparedProgressions"] == 2
assert answer["diagnostics"]["packedProgressions"] == 2
assert answer["diagnostics"]["groupOperations"] == 43
assert prepared.progression_batches == 2
assert prepared.scalar_batches == 2
assert (55*D).is_zero() and not (11*D).is_zero() and not (5*D).is_zero()
fused = _fused_prepared_order_certificates(J, D, 41, 7, 5, budgets)
assert fused["status"] == "found"
assert fused["annihilating_multiple"] == 55
assert fused["certificate"]["element_order"] == 55
assert fused["diagnostics"]["preparedFusedSearches"] == 1
assert fused["diagnostics"]["groupOperations"] == 38
assert prepared.searches == 1 and prepared.scalar_batches == 6
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});
