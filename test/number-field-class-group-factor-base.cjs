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
stream_plan = plans["cubic-discriminant-minus23"]
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
assert factor_calls == [5, 7]

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

print(json.dumps(results, separators=(",", ":")))
`);

  const expected = fixture.cases.map((entry) => [
    entry.id,
    entry.bounds.minkowski,
    entry.bounds.bach,
    entry.bounds.bdf,
    ["cubic-discriminant-minus23", "pure-cubic-minus108"].includes(entry.id)
      ? entry.bdf_factor_base.length
      : null,
  ]);
  assert.deepEqual(JSON.parse(output), expected);
});
