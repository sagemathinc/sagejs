// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const sagejs =
  process.env.SAGEJS_TEST_EXECUTABLE || join(root, "bin", "sagejs");
const fixturePath = join(
  __dirname,
  "fixtures",
  "number-field-class-group-factor-base.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

function run(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-factor-base-"));
  try {
    const filename = join(directory, "test.py");
    writeFileSync(filename, source);
    const result = spawnSync(sagejs, ["--python", filename], {
      cwd: root,
      encoding: "utf8",
      timeout: 180_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("packed BDF interval assembly matches exact scalar endpoints", () => {
  const output = run(String.raw`
import sagejs.number_fields.bl_composite_kernel as kernels
import sagejs.number_fields.class_group_factor_base as factor_bases
from sagejs.native import is_compiled

R = PolynomialRing(QQ, "x")
x = R.gen()
saved = factor_bases._bdf_interval_kernel_override
packed_kernel = kernels.packed_bdf_interval_in_place
dynamic_kernel = getattr(packed_kernel, "__sagejs_native_source__", packed_kernel)

for candidate in (2, 4, 8, 16, 12, 10, 11):
    scalar_field = NumberField(x**3 - x**2 + 7*x + 8, "s" + str(candidate))
    scalar_order = scalar_field.maximal_order()
    factor_bases._bdf_interval_kernel_override = False
    scalar = factor_bases._BDFEvaluator(scalar_order, 100).inequality(
        candidate, 3, 1, 4027, 64
    )
    for index, kernel in enumerate((dynamic_kernel, packed_kernel)):
        packed_field = NumberField(
            x**3 - x**2 + 7*x + 8,
            "p" + str(candidate) + str(index),
        )
        factor_bases._bdf_interval_kernel_override = kernel
        packed = factor_bases._BDFEvaluator(
            packed_field.maximal_order(), 100
        ).inequality(candidate, 3, 1, 4027, 64)
        assert packed[0] == scalar[0]
        assert packed[1].to_dict() == scalar[1].to_dict()
        assert packed[2].to_dict() == scalar[2].to_dict()

factor_bases._bdf_interval_kernel_override = False
scalar_field = NumberField(x**3 - x**2 + 7*x + 8, "scalar")
scalar_bound = factor_bases.bdf_bound(scalar_field.maximal_order())
factor_bases._bdf_interval_kernel_override = packed_kernel
packed_field = NumberField(x**3 - x**2 + 7*x + 8, "packed")
packed_bound = factor_bases.bdf_bound(packed_field.maximal_order())
factor_bases._bdf_interval_kernel_override = saved
assert packed_bound.to_dict() == scalar_bound.to_dict()

# A floating search hint is never accepted as evidence.  Deliberately wrong
# low and high hints must reproduce the same exact interval certificate.
saved_hint = factor_bases._bdf_search_hint_override
for hint in (2, 11, 100):
    factor_bases._bdf_search_hint_override = hint
    hinted_field = NumberField(x**3 - x**2 + 7*x + 8, "hint" + str(hint))
    hinted_bound = factor_bases.bdf_bound(
        hinted_field.maximal_order(), max_bound=100
    )
    assert hinted_bound.to_dict() == scalar_bound.to_dict()
factor_bases._bdf_search_hint_override = saved_hint
assert packed_bound.bound == 11
assert packed_bound.interval.to_dyadic_dict(64) == {
    "scale_bits": 64,
    "lower_numerator": 4305529790576860134,
    "upper_numerator": 4305529790576860135,
}
assert is_compiled(packed_kernel)
print("packed-bdf-exact")
`);
  assert.equal(output, "packed-bdf-exact");
});

test("exact factor-base bounds and norm streams match Sage/PARI/Magma fixtures", () => {
  assert.equal(fixture.systems.sage_pari.status, "executed");
  assert.match(fixture.systems.magma.command, /ClassGroup\(O\)/);
  assert.match(fixture.systems.bdf.command, /strict/);

  const output = run(String.raw`
import json
import time
import sagejs.number_fields.class_group_factor_base as factor_bases
from sagejs.number_fields.class_group_factor_base import (
    bach_bound,
    bdf_bound,
    build_factor_base,
    factor_base_plan,
    factor_base_prime_from_dict,
    minkowski_bound,
    prime_ideal_norm_stream,
)

fixture = json.loads(${JSON.stringify(JSON.stringify(fixture))})
R = PolynomialRing(QQ, "x")
x = R.gen()
plans = {}
fields = {}
results = []
bdf_margins_64 = {
    "real-quadratic-d5": [17429225712700933122, 17429225712700933123],
    "real-quadratic-index-two": [17429225712700933122, 17429225712700933123],
    "gaussian": [13619903642533639228, 13619903642533639229],
    "cubic-discriminant-minus23": [11023082158359826261, 11023082158359826262],
    "cubic-discriminant-minus59": [11726742603809046431, 11726742603809046432],
    "pure-cubic-minus108": [8000612063363591694, 8000612063363591695],
    "cyclotomic-eight": [6398189639187723695, 6398189639187723696],
    "quintic-class-c4": [3201983944431722600, 3201983944431722601],
}

for case in fixture["cases"]:
    polynomial = R(case["polynomial"])
    field = NumberField(polynomial, "a")
    fields[case["id"]] = field
    order = field.maximal_order()
    assert list(field.signature()) == case["signature"]
    assert int(order.discriminant()) == case["discriminant"]

    minkowski = minkowski_bound(order)
    bach = bach_bound(order)
    bdf = bdf_bound(order, max_bound=10000)
    assert minkowski.bound == case["bounds"]["minkowski"]
    assert bach.bound == case["bounds"]["bach"]
    assert bdf.bound == case["bounds"]["bdf"]
    assert minkowski.assumptions == ()
    assert bach.assumptions == ("GRH for the Dedekind zeta function",)
    assert bdf.details["strict_inequality"] is True
    assert bdf.interval.lower.numerator > 0
    margin = bdf.interval.to_dyadic_dict(64)
    assert [margin["lower_numerator"], margin["upper_numerator"]] == (
        bdf_margins_64[case["id"]]
    )

    plan = factor_base_plan(
        order,
        proof=False,
        theorem="bdf",
        max_bound=10000,
    )
    plans[case["id"]] = plan
    assert plan.fits_caps
    assert len(json.dumps(plan.to_dict(), sort_keys=True)) < 3000
    records = ()
    # Two cubics cover ramified, split, and irrelevant higher-degree primes.
    # The other entries remain bound and Sage/PARI/Magma splitting oracles;
    # their complete HNF materialization belongs to relation integration.
    stream_case = case["id"] in (
        "real-quadratic-index-two",
        "cubic-discriminant-minus23",
        "pure-cubic-minus108",
    )
    if stream_case:
        records = build_factor_base(plan)
        compact = [
            {
                "p": record.rational_prime,
                "norm": record.norm,
                "e": record.ramification_index,
                "f": record.residue_degree,
            }
            for record in records
        ]
        assert compact == case["bdf_factor_base"]
        assert [record.index for record in records] == list(range(len(records)))
        assert [record.norm for record in records] == sorted(
            record.norm for record in records
        )
        assert all(record.two_generator is not None for record in records)
    results.append(
        [
            case["id"],
            minkowski.bound,
            bach.bound,
            bdf.bound,
            len(records) if stream_case else None,
        ]
    )

# The pure cubic exercises authentication of ramified and split prime records.
pure_plan = plans["pure-cubic-minus108"]
pure_records = build_factor_base(pure_plan)
record = pure_records[0]
restored = factor_base_prime_from_dict(pure_plan.order, record.to_dict())
assert restored.to_dict() == record.to_dict()
corrupt = pure_records[0].to_dict()
corrupt["norm"] += 1
try:
    factor_base_prime_from_dict(pure_plan.order, corrupt)
    raise AssertionError("a corrupted norm passed factor-base authentication")
except ValueError:
    pass
for path in (("f",), ("index",), ("hnf_fingerprint", 0, 0, 0)):
    corrupt = pure_records[0].to_dict()
    target = corrupt
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = True
    try:
        factor_base_prime_from_dict(pure_plan.order, corrupt)
        raise AssertionError("a boolean integer passed factor-base authentication")
    except (TypeError, ValueError):
        pass
for path in (
    ("e",),
    ("norm",),
    ("valuation_metadata", "rational_prime_valuation"),
    ("residue_modulus", 0),
    ("two_generator", "second_generator", 0, 0),
):
    corrupt = pure_records[0].to_dict()
    target = corrupt
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = True if target[path[-1]] == 1 else float(target[path[-1]])
    try:
        factor_base_prime_from_dict(pure_plan.order, corrupt)
        raise AssertionError("a noncanonical number passed factor-base authentication")
    except (TypeError, ValueError):
        pass

# A tiny-degree presentation with one enormous coefficient must be rejected by
# preflight even though the former fixed 192 + 32*n^2 formula would report
# only 640 bytes for its two-record upper estimate.  This synthetic order is
# sufficient because FactorBasePlan's resource policy reads only canonical
# presentation data and the already-certified bound record.
huge_coefficient = 1 << 262144
class HugeHeightField:
    _defining_coefficients = (QQ(-huge_coefficient), QQ(0), QQ(1))
    _integral_equation_scale_cache = ZZ(1)
class HugeHeightOrder:
    _basis_rows = (
        (QQ(1), QQ(0)),
        (QQ(0), QQ(1)),
    )
    def __init__(self):
        self._field = HugeHeightField()
    def number_field(self):
        return self._field
    def degree(self):
        return 2
height_bound = factor_bases.FactorBaseBound(
    "height-regression",
    (),
    2,
    2,
    (2, 0),
    5,
    0,
    None,
)
height_plan = factor_bases.FactorBasePlan(
    HugeHeightOrder(),
    height_bound,
    2,
    2,
    2,
    1_000_000,
)
assert height_plan.presentation_coefficient_bits == 262145
assert height_plan.estimated_memory_bytes > height_plan.max_memory_bytes
assert not height_plan.fits_caps and height_plan.cap_failures == ("memory",)
assert height_plan.to_dict()["estimates"]["presentation_coefficient_bits"] == 262145
try:
    height_plan.require_feasible()
    raise AssertionError("a huge-height plan passed preflight")
except ValueError:
    pass

# Dynamic accounting is independently fail-closed if an actual canonical
# encoding exceeds preflight: the oversized record is never retained, its
# transient selected-prime group is released, and the checked total stays 0.
runtime_cap_plan = factor_base_plan(
    fields["pure-cubic-minus108"],
    proof=False,
    theorem="bdf",
    max_bound=10000,
)
original_record_memory = factor_bases._factor_base_record_memory_bytes
def oversized_record_memory(_record):
    return runtime_cap_plan.max_memory_bytes + 1
factor_bases._factor_base_record_memory_bytes = oversized_record_memory
try:
    list(prime_ideal_norm_stream(runtime_cap_plan))
    raise AssertionError("an oversized canonical record was retained")
except ValueError as error:
    assert "before retaining record 0" in str(error)
finally:
    factor_bases._factor_base_record_memory_bytes = original_record_memory
assert runtime_cap_plan._record_cache == {}
assert runtime_cap_plan._record_memory_bytes == {}
assert runtime_cap_plan._selected_prime_cache == {}
assert runtime_cap_plan.progress()["retained_memory_bytes"] == 0

# Compact splitting data must suppress irrelevant high-degree decompositions:
# at bound seven this cubic has norm-8 and norm-27 primes over 2 and 3, while
# only the degree-one primes over 5 and 7 enter the factor base.
stream_plan = factor_base_plan(
    fields["cubic-discriminant-minus23"],
    proof=False,
    theorem="bdf",
    max_bound=10000,
)
original_factor = factor_bases._prime_ideals.factor_rational_prime
factor_calls = []
def tracked_factor(order, prime, *args, **kwargs):
    factor_calls.append(int(prime))
    return original_factor(order, prime, *args, **kwargs)
factor_bases._prime_ideals.factor_rational_prime = tracked_factor
try:
    streamed = list(prime_ideal_norm_stream(stream_plan))
finally:
    factor_bases._prime_ideals.factor_rational_prime = original_factor
assert [record.rational_prime for record in streamed] == [5, 7]
assert factor_calls == []
assert stream_plan.progress()["eligible_prime_ideals"] == 2

# The alternate x^2-5 presentation has equation-order index two.  Its
# splitting scan performs the required full finite-algebra decomposition only
# at p=2; construction then reuses that cached certificate while p=5 remains
# selective Dedekind--Kummer work.
index_plan = factor_base_plan(
    fields["real-quadratic-index-two"],
    proof=False,
    theorem="bdf",
    max_bound=10000,
)
factor_calls = []
factor_bases._prime_ideals.factor_rational_prime = tracked_factor
try:
    index_records = build_factor_base(index_plan)
finally:
    factor_bases._prime_ideals.factor_rational_prime = original_factor
assert [record.norm for record in index_records] == [4, 5]
assert factor_calls == [2]

# Preflight caps reject work before allocating any ideal record.
large_field = fields["quintic-class-c4"]
infeasible = factor_base_plan(
    large_field,
    proof=True,
    theorem="minkowski",
    max_memory_bytes=1,
)
assert not infeasible.fits_caps and "memory" in infeasible.cap_failures
try:
    build_factor_base(infeasible)
    raise AssertionError("an infeasible factor-base plan was materialized")
except ValueError:
    pass

# Representative construction benchmark and differential oracle.  Every
# quintic prime here is on the p-maximal Dedekind--Kummer path, so construction
# must create exactly the 12 eligible ideals and no irrelevant siblings or
# complete rational-prime decompositions.  One mixed prime is then compared
# to the independently verified full public decomposition.
quintic_case = [
    case for case in fixture["cases"] if case["id"] == "quintic-class-c4"
][0]
quintic_plan = factor_base_plan(
    large_field,
    proof=True,
    theorem="minkowski",
)
assert quintic_plan.estimated_rational_primes == 19
assert quintic_plan.estimated_prime_ideals == 95
assert quintic_plan.progress()["splitting_scan_complete"] is False
assert quintic_plan.progress()["materialized_prime_ideals"] == 0
original_prime_candidate = factor_bases._prime_ideals._dedekind_kummer_prime_candidate
factor_calls = []
prime_ideal_constructions = []
def tracked_prime_candidate(*args, **kwargs):
    prime_ideal_constructions.append(int(args[1]))
    return original_prime_candidate(*args, **kwargs)
factor_bases._prime_ideals.factor_rational_prime = tracked_factor
factor_bases._prime_ideals._dedekind_kummer_prime_candidate = tracked_prime_candidate
try:
    construction_started = time.perf_counter()
    interrupted_stream = prime_ideal_norm_stream(quintic_plan)
    first_quintic_record = next(interrupted_stream)
    partial_progress = quintic_plan.progress()
    assert partial_progress["splitting_scan_complete"] is True
    assert partial_progress["factor_base_complete"] is False
    assert partial_progress["materialized_prime_ideals"] == 1
    assert 0 < partial_progress["retained_memory_bytes"] <= quintic_plan.max_memory_bytes
    quintic_records = build_factor_base(quintic_plan)
    construction_seconds = time.perf_counter() - construction_started
    cache_started = time.perf_counter()
    cached_records = build_factor_base(quintic_plan)
    cache_seconds = time.perf_counter() - cache_started
finally:
    factor_bases._prime_ideals.factor_rational_prime = original_factor
    factor_bases._prime_ideals._dedekind_kummer_prime_candidate = original_prime_candidate
quintic_compact = [
    {
        "p": record.rational_prime,
        "norm": record.norm,
        "e": record.ramification_index,
        "f": record.residue_degree,
    }
    for record in quintic_records
]
assert quintic_compact == quintic_case["minkowski_factor_base"]
assert factor_calls == []
assert len(prime_ideal_constructions) == fixture["benchmark"]["selected_prime_ideals"]
assert len(prime_ideal_constructions) < fixture["benchmark"]["baseline_materialized_siblings"]
assert construction_seconds < fixture["benchmark"]["maximum_seconds"]
assert cache_seconds < fixture["benchmark"]["warm_cache_maximum_seconds"]
assert cached_records is quintic_records
assert quintic_records[0] is first_quintic_record
assert quintic_plan._retained_memory_bytes == sum(
    quintic_plan._record_memory_bytes.values()
)
assert quintic_plan.progress() == {
    "schema": "sagejs.number-fields/factor-base-progress-v1",
    "bound": 38,
    "splitting_scan_complete": True,
    "factor_base_complete": True,
    "eligible_rational_primes": 8,
    "eligible_prime_ideals": 12,
    "materialized_prime_ideals": 12,
    "retained_memory_bytes": sum(
        factor_bases._factor_base_record_memory_bytes(record)
        for record in quintic_records
    ),
    "max_memory_bytes": quintic_plan.max_memory_bytes,
}

selective_17 = [
    record for record in quintic_records if record.rational_prime == 17
]
full_17 = [
    prime_ideal
    for prime_ideal in original_factor(quintic_plan.order, 17).prime_ideals()
    if 17 ** int(prime_ideal.residue_class_degree()) <= quintic_plan.bound
]
assert len(selective_17) == len(full_17) == 1
assert selective_17[0].hnf_fingerprint == factor_bases._encode_rows(
    full_17[0]._basis_rows
)
restored_17 = factor_base_prime_from_dict(
    quintic_plan.order, selective_17[0].to_dict()
)
assert restored_17.to_dict() == selective_17[0].to_dict()

print(json.dumps(results, separators=(",", ":")))
`);

  const expected = fixture.cases.map((entry) => [
    entry.id,
    entry.bounds.minkowski,
    entry.bounds.bach,
    entry.bounds.bdf,
    [
      "real-quadratic-index-two",
      "cubic-discriminant-minus23",
      "pure-cubic-minus108",
    ].includes(entry.id)
      ? entry.bdf_factor_base.length
      : null,
  ]);
  assert.deepEqual(JSON.parse(output), expected);
});

test("degree 6--10 plans construct and replay only exact eligible prime ideals", () => {
  const output = run(String.raw`
import json
import time
import sagejs.number_fields.class_group_factor_base as factor_bases
from sagejs.number_fields.class_group_factor_base import (
    build_factor_base,
    factor_base_plan,
    factor_base_prime_from_dict,
)

fixture = json.loads(${JSON.stringify(JSON.stringify(fixture))})
R = PolynomialRing(QQ, "x")
x = R.gen()
prepared = []
for case in fixture["high_degree_cases"]:
    field = NumberField(R(case["polynomial"]), "a")
    order = field.maximal_order()
    assert order.degree() == case["degree"]
    assert list(field.signature()) == case["signature"]
    assert int(order.discriminant()) == case["discriminant"]
    equation_polynomial = (
        factor_bases._prime_ideals._maximal.integral_equation_polynomial(field)
    )
    index_squared = abs(int(equation_polynomial.discriminant())) // abs(
        int(order.discriminant())
    )
    assert index_squared == case["equation_index_squared"]
    prepared.append((case, order))

original_factor = factor_bases._prime_ideals.factor_rational_prime
original_prime_candidate = factor_bases._prime_ideals._dedekind_kummer_prime_candidate
factor_calls = []
prime_ideal_constructions = []
def tracked_factor(order, prime, *args, **kwargs):
    factor_calls.append(int(prime))
    return original_factor(order, prime, *args, **kwargs)
def tracked_prime_candidate(*args, **kwargs):
    prime_ideal_constructions.append(int(args[1]))
    return original_prime_candidate(*args, **kwargs)

factor_bases._prime_ideals.factor_rational_prime = tracked_factor
factor_bases._prime_ideals._dedekind_kummer_prime_candidate = tracked_prime_candidate
plans_and_records = []
started = time.perf_counter()
try:
    for case, order in prepared:
        plan = factor_base_plan(order, proof=True, theorem="minkowski")
        assert plan.bound == case["minkowski_bound"]
        records = build_factor_base(plan)
        compact = [
            {
                "p": record.rational_prime,
                "norm": record.norm,
                "e": record.ramification_index,
                "f": record.residue_degree,
            }
            for record in records
        ]
        assert compact == case["factor_base"]
        assert plan.progress()["eligible_prime_ideals"] == len(records)
        assert build_factor_base(plan) is records
        plans_and_records.append((case, plan, records))
    construction_seconds = time.perf_counter() - started
    constructions_after_build = len(prime_ideal_constructions)

    cache_started = time.perf_counter()
    for _case, plan, records in plans_and_records:
        assert build_factor_base(plan) is records
    cache_seconds = time.perf_counter() - cache_started

    replay_started = time.perf_counter()
    for case, plan, records in plans_and_records:
        exact = case["exact_prime"]
        record = records[exact["index"]]
        assert record.rational_prime == exact["p"]
        assert record.norm == exact["norm"]
        assert record.ramification_index == exact["e"]
        assert record.residue_degree == exact["f"]
        assert record.two_generator["second_generator"] == exact["second_generator"]
        assert list(record.residue_modulus) == exact["residue_modulus"]
        restored = factor_base_prime_from_dict(plan.order, record.to_dict())
        assert restored.to_dict() == record.to_dict()
    replay_seconds = time.perf_counter() - replay_started
finally:
    factor_bases._prime_ideals.factor_rational_prime = original_factor
    factor_bases._prime_ideals._dedekind_kummer_prime_candidate = original_prime_candidate

# Only p=2 in the transformed sextic divides its equation-order index.  The
# compact scan must use and cache one complete finite-algebra decomposition
# there.  All 36 eligible p-maximal ideals, including replay, remain selective.
assert factor_calls == [2]
assert constructions_after_build == fixture["high_degree_benchmark"]["selected_prime_ideals"]
assert constructions_after_build < fixture["high_degree_benchmark"]["baseline_materialized_siblings"]
assert construction_seconds < fixture["high_degree_benchmark"]["maximum_seconds"]
assert cache_seconds < fixture["high_degree_benchmark"]["warm_cache_maximum_seconds"]

# Independently materialize the complete public decomposition at each oracle
# prime and require exact HNF equality with the selective fixture record.
for case, plan, records in plans_and_records:
    exact = case["exact_prime"]
    record = records[exact["index"]]
    full = original_factor(plan.order, exact["p"])
    matching = [
        prime_ideal
        for prime_ideal in full.prime_ideals()
        if factor_bases._encode_rows(prime_ideal._basis_rows)
        == record.hnf_fingerprint
    ]
    assert len(matching) == 1

print(json.dumps({
    "construction_seconds": construction_seconds,
    "replay_seconds": replay_seconds,
    "cache_seconds": cache_seconds,
    "selected": constructions_after_build,
    "baseline_siblings": fixture["high_degree_benchmark"]["baseline_materialized_siblings"],
}, separators=(",", ":")))
`);

  const measured = JSON.parse(output);
  assert.equal(
    fixture.high_degree_cases.reduce(
      (total, entry) => total + entry.baseline_materialized_siblings,
      0,
    ),
    fixture.high_degree_benchmark.baseline_materialized_siblings,
  );
  assert.equal(
    measured.selected,
    fixture.high_degree_benchmark.selected_prime_ideals,
  );
  assert.equal(
    measured.baseline_siblings,
    fixture.high_degree_benchmark.baseline_materialized_siblings,
  );
  assert.ok(
    measured.construction_seconds < fixture.high_degree_benchmark.maximum_seconds,
  );
});

test("anchored log intervals preserve BDF and auto selects a tiny unconditional base", () => {
  const output = run(String.raw`
import json
import time
import sagejs.number_fields.class_group_factor_base as factor_bases
from sagejs.number_fields.class_group_factor_base import (
    bdf_bound,
    build_factor_base,
    factor_base_plan,
    grh_bound,
    minkowski_bound,
)

fixture = json.loads(${JSON.stringify(JSON.stringify(fixture))})
benchmark = fixture["small_bound_benchmark"]
case = [
    entry
    for entry in fixture["cases"]
    if entry["id"] == "cubic-discriminant-minus59"
][0]
R = PolynomialRing(QQ, "x")
field = NumberField(R(case["polynomial"]), "a")
order = field.maximal_order()
assert list(field.signature()) == case["signature"]
assert int(order.discriminant()) == case["discriminant"]

# This is a cold exact BDF call in a fresh process.  Its bound and strict
# outward certificate must be unchanged by rational interval anchoring.
bdf_started = time.perf_counter()
bdf = bdf_bound(order, max_bound=10000)
bdf_seconds = time.perf_counter() - bdf_started
assert bdf.bound == benchmark["bdf_bound"] == case["bounds"]["bdf"]
assert bdf.assumptions == ("GRH for the Dedekind zeta function",)
assert bdf.details["strict_inequality"] is True
assert bdf.interval.lower.numerator > 0
assert bdf_seconds < benchmark["maximum_anchored_bdf_seconds"]

# Every primitive enclosure must equal an outward dyadic compression of its
# scalar exact-rational series at several working precisions.  Compression may
# widen an endpoint but can never move it inward.
for precision in (32, 64, 96, 128):
    rational = factor_bases._Rational(1083, 5)
    pairs = (
        (
            factor_bases._pi_scalar_interval(precision),
            factor_bases._pi_interval(precision),
        ),
        (
            factor_bases._log_rational_scalar_interval(rational, precision),
            factor_bases._log_rational_interval(rational, precision),
        ),
        (
            factor_bases._euler_gamma_scalar_interval(precision),
            factor_bases._euler_gamma_interval(precision),
        ),
        (
            factor_bases._catalan_scalar_interval(precision),
            factor_bases._catalan_interval(precision),
        ),
    )
    for scalar, compressed in pairs:
        replay = factor_bases._outward_dyadic_interval(
            scalar,
            precision + factor_bases.DYADIC_GUARD_BITS,
        )
        assert compressed.lower == replay.lower
        assert compressed.upper == replay.upper
        assert compressed.lower <= scalar.lower
        assert scalar.upper <= compressed.upper
        for endpoint in (compressed.lower, compressed.upper):
            denominator = endpoint.denominator
            assert denominator > 0
            assert denominator & (denominator - 1) == 0

# Replay the anchored identity exactly at the precision used by the first BDF
# decision.  The optimized enclosure equals the compressed explicit outward
# interval and overlaps the independent direct endpoint enclosure.
bits = 76
pi = factor_bases._pi_interval(bits)
anchored = factor_bases._log_interval(pi, bits)
anchor = factor_bases._Rational(3)
work_bits = bits + 4
anchor_log = factor_bases._log_rational_interval(anchor, work_bits)
scaled = pi / factor_bases._Interval.exact(anchor)
scaled_lower = factor_bases._log_rational_interval(scaled.lower, work_bits)
scaled_upper = factor_bases._log_rational_interval(scaled.upper, work_bits)
explicit_scalar = anchor_log + factor_bases._Interval(
    scaled_lower.lower,
    scaled_upper.upper,
)
explicit = factor_bases._outward_dyadic_interval(
    explicit_scalar,
    bits + factor_bases.DYADIC_GUARD_BITS,
)
assert anchored.lower == explicit.lower
assert anchored.upper == explicit.upper
direct_lower = factor_bases._log_rational_interval(pi.lower, bits)
direct_upper = factor_bases._log_rational_interval(pi.upper, bits)
direct = factor_bases._Interval(direct_lower.lower, direct_upper.upper)
assert anchored.lower <= direct.upper and direct.lower <= anchored.upper

# Both auto and explicit GRH selection must test the cheap exact Minkowski
# floor first.  Tiny bounds have at most the rational primes 2 and 3, so the
# assumption-free base is preferred without paying for BDF.  The cached
# Minkowski result itself remains unmodified.
original_bdf = factor_bases.bdf_bound
def unexpected_bdf(*_args, **_kwargs):
    raise AssertionError("the small unconditional cutoff entered BDF search")
factor_bases.bdf_bound = unexpected_bdf
try:
    auto_started = time.perf_counter()
    auto_plan = factor_base_plan(order, proof=False, theorem="auto")
    auto_records = build_factor_base(auto_plan)
    auto_seconds = time.perf_counter() - auto_started
    explicit_grh = grh_bound(order, max_bdf_bound=10000)
    comparison_x = R.gen()
    comparison_field = NumberField(
        comparison_x**3 + 4 * comparison_x - 1, "b"
    )
    comparison_order = comparison_field.maximal_order()
    comparison_plan = factor_base_plan(
        comparison_order, proof=False, theorem="auto"
    )
    comparison_records = build_factor_base(comparison_plan)
finally:
    factor_bases.bdf_bound = original_bdf

minkowski = minkowski_bound(order)
assert minkowski.bound == benchmark["auto_bound"] == case["bounds"]["minkowski"]
assert auto_plan.bound == explicit_grh.bound == minkowski.bound
assert auto_plan.theorem == explicit_grh.theorem == "Minkowski"
assert auto_plan.assumptions == explicit_grh.assumptions == ()
assert auto_plan.bound_result is not minkowski
assert auto_plan.bound_result.details["selection"] == (
    "unconditional-small-minkowski-bound"
)
assert auto_plan.bound_result.details["automatic_minkowski_bound_limit"] == 4
assert auto_plan.bound_result.details["grh_search_minimum"] == 2
assert "selection" not in minkowski.details
assert comparison_plan.bound == 4
assert comparison_plan.theorem == "Minkowski"
assert comparison_plan.assumptions == ()
assert len(comparison_records) == 3
compact = [
    {
        "p": record.rational_prime,
        "norm": record.norm,
        "e": record.ramification_index,
        "f": record.residue_degree,
    }
    for record in auto_records
]
assert compact == case["minkowski_factor_base"]

# A classical rational enclosure decides ordinary Minkowski floors without
# evaluating the high-height Machin interval.  Its endpoints contain the
# independent direct exact-rational construction.  A deliberately near-
# integer imaginary quadratic bound still enters the full precision loop.
coarse_pi = factor_bases._Interval(
    factor_bases._Rational(333, 106), factor_bases._Rational(355, 113)
)
direct_pi = factor_bases._pi_scalar_interval(256)
assert coarse_pi.lower < direct_pi.lower < direct_pi.upper < coarse_pi.upper
saved_pi_interval = factor_bases._pi_interval
def forbidden_pi_interval(bits):
    raise AssertionError("a coarse Minkowski decision evaluated Machin pi")
factor_bases._pi_interval = forbidden_pi_interval
coarse_x = R.gen()
coarse_field = NumberField(
    coarse_x**3 - coarse_x**2 - 6 * coarse_x - 12, "coarse"
)
assert minkowski_bound(coarse_field.maximal_order()).bound == 9
factor_bases._pi_interval = saved_pi_interval

pi_calls = [0]
def counted_pi_interval(bits):
    pi_calls[0] += 1
    return saved_pi_interval(bits)
factor_bases._pi_interval = counted_pi_interval
near_x = R.gen()
near_integer = NumberField(near_x**2 + 1481, "near")
assert minkowski_bound(near_integer.maximal_order()).bound == 48
factor_bases._pi_interval = saved_pi_interval
assert pi_calls[0] >= 1
assert len(auto_records) == benchmark["auto_factor_base_size"]
assert auto_seconds < benchmark["maximum_auto_factor_base_seconds"]

print(json.dumps({
    "bdf_seconds": bdf_seconds,
    "auto_seconds": auto_seconds,
    "bdf_bound": bdf.bound,
    "auto_bound": auto_plan.bound,
    "auto_size": len(auto_records),
}, separators=(",", ":")))
`);

  const measured = JSON.parse(output);
  assert.equal(measured.bdf_bound, fixture.small_bound_benchmark.bdf_bound);
  assert.equal(measured.auto_bound, fixture.small_bound_benchmark.auto_bound);
  assert.equal(
    measured.auto_size,
    fixture.small_bound_benchmark.auto_factor_base_size,
  );
});

test("complex cubic Minkowski floors use the identical exact coarse interval", () => {
  const corpus = JSON.parse(
    readFileSync(
      join(
        __dirname,
        "fixtures",
        "number-field-lmfdb-cubic-class-numbers.json",
      ),
      "utf8",
    ),
  );
  const output = run(String.raw`
import json
import sagejs.number_fields.class_group_factor_base as factor_bases

records = json.loads(${JSON.stringify(JSON.stringify(corpus.records))})
coarse_pi = factor_bases._Interval(
    factor_bases._Rational(333, 106),
    factor_bases._Rational(355, 113),
)
coefficient = factor_bases._Rational(8, 9)
generic_sqrt = factor_bases._sqrt_rational_interval

def reference(discriminant):
    interval = (
        generic_sqrt(factor_bases._Rational(discriminant), 64)
        * factor_bases._Interval.exact(coefficient)
        / coarse_pi
    )
    return factor_bases._same_integer(interval, "floor"), interval

discriminants = [
    int(record["discriminant_absolute"]) for record in records
]
discriminants += [1, 2, 3, 4, 10**12 + 39, (1 << 119) + 12345]
state = 1729
for _index in range(96):
    state = (
        6364136223846793005 * state + 1442695040888963407
    ) % (1 << 127)
    discriminants.append(state + 1)
for bound in range(1, 96):
    numerator = 9 * 333 * bound
    denominator = 8 * 106
    center = numerator * numerator // (denominator * denominator)
    for delta in range(-2, 3):
        if center + delta > 0:
            discriminants.append(center + delta)

declines = 0
for discriminant in discriminants:
    expected_bound, expected_interval = reference(discriminant)
    fast_bound, fast_interval = (
        factor_bases._complex_cubic_minkowski_coarse_interval(discriminant)
    )
    assert fast_bound == expected_bound
    assert fast_interval.to_dict() == expected_interval.to_dict()
    if fast_bound is None:
        declines += 1

# Every pinned complex cubic takes the integer path, but its complete public
# theorem/bound payload remains byte-for-byte the former generic interval.
saved_sqrt = generic_sqrt
def forbidden_sqrt(*_args, **_kwargs):
    raise AssertionError("a decided complex-cubic floor used the generic square root")
factor_bases._sqrt_rational_interval = forbidden_sqrt
try:
    R = PolynomialRing(QQ, "x")
    x = R.gen()
    for index, record in enumerate(records):
        polynomial = R(0)
        for exponent in range(len(record["coefficients"])):
            polynomial += int(record["coefficients"][exponent]) * x**exponent
        field = NumberField(polynomial, "a" + str(index))
        order = field.maximal_order()
        discriminant = abs(int(order.discriminant()))
        expected_bound, expected_interval = reference(discriminant)
        result = factor_bases.minkowski_bound(order)
        expected = factor_bases.FactorBaseBound(
            "Minkowski",
            (),
            expected_bound,
            3,
            (1, 1),
            discriminant,
            64,
            expected_interval,
            {
                "formula": "floor((4/pi)^r2*n!/n^n*sqrt(abs(D)))",
                "rounding": "floor-certified-rational-interval",
                "pi_enclosure": "333/106 < pi < 355/113",
            },
        )
        assert result.to_dict() == expected.to_dict()
finally:
    factor_bases._sqrt_rational_interval = saved_sqrt

# A coarse decline must still enter the existing arbitrary-precision path.
saved_fast = factor_bases._complex_cubic_minkowski_coarse_interval
saved_pi = factor_bases._pi_interval
pi_calls = [0]
def declined(discriminant):
    _bound, interval = saved_fast(discriminant)
    return None, interval
def counted_pi(bits):
    pi_calls[0] += 1
    return saved_pi(bits)
factor_bases._complex_cubic_minkowski_coarse_interval = declined
factor_bases._pi_interval = counted_pi
try:
    fallback_field = NumberField(x**3 + 2*x - 1, "fallback")
    assert factor_bases.minkowski_bound(fallback_field.maximal_order()).bound == 2
finally:
    factor_bases._complex_cubic_minkowski_coarse_interval = saved_fast
    factor_bases._pi_interval = saved_pi
assert pi_calls[0] >= 1
assert declines >= 1
print(json.dumps({"checked": len(discriminants), "declines": declines}))
`);
  const result = JSON.parse(output);
  assert.ok(result.checked > 500);
  assert.ok(result.declines > 0);
});

test("index-prime packed factors retain canonical second generators", () => {
  const output = run(String.raw`
import hashlib
import json
import sagejs.number_fields.class_group_factor_base as factor_bases
import sagejs.number_fields.cubic_class_number as cubic
import sagejs.number_fields.prime_ideals as prime_ideals

R = PolynomialRing(QQ, "x")
x = R.gen()
cases = (
    (
        "3.1.1083.1",
        x**3 - x**2 - 6*x - 12,
        "2262d9dce3278741e3b73e9d95eb70a2d81c2b86cc3436198cda58efcbfc5456",
    ),
    (
        "3.1.2856.1",
        x**3 - x**2 + 9*x - 21,
        "887ede9701973aae1679eb1bf5ae8dcb7093bc42c4af62915fdbc8abfa77fc14",
    ),
)
results = []
for index, (label, polynomial, expected_hash) in enumerate(cases):
    field = NumberField(polynomial, "a" + str(index))
    order = field.maximal_order()
    plan = factor_bases.factor_base_plan(
        order, proof=True, theorem="minkowski"
    )
    packed = cubic.packed_cubic_factor_records(plan)
    assert packed is not None
    assert all(record._second_generator_payload is not None for record in packed)
    payload = [record.to_dict() for record in packed]
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    assert hashlib.sha256(encoded.encode("utf-8")).hexdigest() == expected_hash

    # Both ordinary materialization and the independently produced generic
    # factor base must reproduce the exact historical payload.
    ordinary, _ideals = cubic._materialize_packed_cubic_factor_records(packed)
    generic_plan = factor_bases.factor_base_plan(
        order, proof=True, theorem="minkowski"
    )
    generic = factor_bases.build_factor_base(generic_plan)
    assert [record.to_dict() for record in ordinary] == payload
    assert [record.to_dict() for record in generic] == payload

    # The finite-algebra producer itself supplies the canonical payload.  Once
    # supplied, constructing a packed record must not redo the modular ideal
    # generator search at the consumer boundary.
    prime = 2
    requested = {
        residue_degree
        for residue_degree in range(1, 4)
        if prime**residue_degree <= int(plan.bound)
    }
    table = prime_ideals._modular_table(order, prime)
    one = [value % prime for value in prime_ideals._order_one_coordinates(order)]
    candidates = prime_ideals.packed_finite_algebra_candidates(
        order,
        prime,
        prime_ideals.DEFAULT_MAX_PRIMITIVE_CANDIDATES,
        requested,
        modular_table=table,
        one_coordinates=one,
        packed_order_basis=prime_ideals._packed_candidate_order_basis(order),
    )
    assert candidates is not None
    assert all(candidate.get("second_generator_payload") is not None for candidate in candidates)
    original_generated = prime_ideals._subspace_ideal_generated_by
    def forbidden_generated(*_args, **_kwargs):
        raise AssertionError("a supplied second generator was rediscovered")
    prime_ideals._subspace_ideal_generated_by = forbidden_generated
    try:
        for candidate_index, candidate in enumerate(candidates):
            retained = cubic.PackedCubicFactorRecord(
                order,
                candidate_index,
                prime,
                candidate["e"],
                candidate["f"],
                candidate["rows"],
                candidate["subspace"],
                candidate["presentation"],
                candidate["second_generator_payload"],
                candidate["table"],
                candidate["one"],
                False,
            )
            assert retained._second_generator_payload is not None
    finally:
        prime_ideals._subspace_ideal_generated_by = original_generated
    results.append([label, int(plan.bound), len(payload), expected_hash])
print(json.dumps(results, separators=(",", ":")))
`);
  assert.deepEqual(JSON.parse(output), [
    [
      "3.1.1083.1",
      9,
      5,
      "2262d9dce3278741e3b73e9d95eb70a2d81c2b86cc3436198cda58efcbfc5456",
    ],
    [
      "3.1.2856.1",
      15,
      6,
      "887ede9701973aae1679eb1bf5ae8dcb7093bc42c4af62915fdbc8abfa77fc14",
    ],
  ]);
});

test("dyadic BDF compression preserves the h=3 cubic certificate", () => {
  const output = run(String.raw`
import json
import time

from sagejs.number_fields.class_group_factor_base import bdf_bound

R = PolynomialRing(QQ, "x")
x = R.gen()
field = NumberField(x**3 - x**2 - 6*x - 12, "a")
order = field.maximal_order()
started = time.perf_counter()
bound = bdf_bound(order, max_bound=10000)
seconds = time.perf_counter() - started
margin = bound.interval.to_dyadic_dict(64)
assert int(order.discriminant()) == -1083
assert bound.bound == 9
assert bound.precision_bits == 64
assert bound.assumptions == ("GRH for the Dedekind zeta function",)
assert margin == {
    "scale_bits": 64,
    "lower_numerator": 12923988274345410010,
    "upper_numerator": 12923988274345410011,
}
assert seconds < 1.75
print(json.dumps({
    "seconds": seconds,
    "bound": bound.bound,
    "precision_bits": bound.precision_bits,
    "margin": {
        "scale_bits": margin["scale_bits"],
        "lower_numerator": str(margin["lower_numerator"]),
        "upper_numerator": str(margin["upper_numerator"]),
    },
}, separators=(",", ":")))
`);

  const measured = JSON.parse(output);
  assert.equal(measured.bound, 9);
  assert.equal(measured.precision_bits, 64);
  assert.deepEqual(measured.margin, {
    scale_bits: 64,
    lower_numerator: "12923988274345410010",
    upper_numerator: "12923988274345410011",
  });
  assert.ok(measured.seconds < 1.75);
});
