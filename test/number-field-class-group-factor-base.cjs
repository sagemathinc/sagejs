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

# Auto planning tries the cheap exact Minkowski theorem before entering the
# expensive BDF search.  The motivating quintic is below the deliberately
# small practical cutoff, so its proof=False plan is already unconditional.
original_grh_bound = factor_bases.grh_bound
def forbidden_grh_bound(*args, **kwargs):
    raise AssertionError("the small auto plan unnecessarily entered BDF")
factor_bases.grh_bound = forbidden_grh_bound
try:
    automatic_quintic = factor_base_plan(large_field, proof=False, theorem="auto")
finally:
    factor_bases.grh_bound = original_grh_bound
assert automatic_quintic.bound == 38
assert automatic_quintic.bound <= factor_bases.DEFAULT_AUTO_MINKOWSKI_MAX_BOUND
assert automatic_quintic.theorem == "Minkowski"
assert automatic_quintic.assumptions == ()

# Caps still take precedence over the automatic preference.  When the larger
# Minkowski factor base cannot fit, planning falls through to the smaller GRH
# theorem and reports its own feasibility result normally.
capped_automatic = factor_base_plan(
    large_field,
    proof=False,
    theorem="auto",
    max_prime_ideals=40,
)
assert capped_automatic.theorem == "Belabas--Diaz y Diaz--Friedman"
assert capped_automatic.assumptions == ("GRH for the Dedekind zeta function",)
assert capped_automatic.fits_caps

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
original_prime_from_ideal = factor_bases._prime_ideals._prime_from_ideal
factor_calls = []
prime_ideal_constructions = []
def tracked_prime_from_ideal(*args, **kwargs):
    prime_ideal_constructions.append(int(args[1]))
    return original_prime_from_ideal(*args, **kwargs)
factor_bases._prime_ideals.factor_rational_prime = tracked_factor
factor_bases._prime_ideals._prime_from_ideal = tracked_prime_from_ideal
try:
    construction_started = time.perf_counter()
    interrupted_stream = prime_ideal_norm_stream(quintic_plan)
    first_quintic_record = next(interrupted_stream)
    partial_progress = quintic_plan.progress()
    assert partial_progress["splitting_scan_complete"] is True
    assert partial_progress["factor_base_complete"] is False
    assert partial_progress["materialized_prime_ideals"] == 1
    quintic_records = build_factor_base(quintic_plan)
    construction_seconds = time.perf_counter() - construction_started
    cache_started = time.perf_counter()
    cached_records = build_factor_base(quintic_plan)
    cache_seconds = time.perf_counter() - cache_started
finally:
    factor_bases._prime_ideals.factor_rational_prime = original_factor
    factor_bases._prime_ideals._prime_from_ideal = original_prime_from_ideal
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
assert quintic_plan.progress() == {
    "schema": "sagejs.number-fields/factor-base-progress-v1",
    "bound": 38,
    "splitting_scan_complete": True,
    "factor_base_complete": True,
    "eligible_rational_primes": 8,
    "eligible_prime_ideals": 12,
    "materialized_prime_ideals": 12,
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
