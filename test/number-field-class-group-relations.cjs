"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const fixture = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-class-group-relations.json"),
    "utf8",
  ),
);

const source = String.raw`
import json
import time

from sagejs.number_fields.class_group_relations import (
    ExactRelationCollector,
    FactoredPrincipalWitness,
    LLLRelationSearch,
    ModularRankScreen,
    RelationNotSmoothError,
    RelationRecord,
    RelationSearchState,
    exact_lll_reduce,
    factor_ideal_over_base,
    initial_rational_prime_relations,
    minkowski_lll_lattice,
    plan_automorphism_orbits,
    verify_relation_record,
)

fixture = json.loads(${JSON.stringify(JSON.stringify(fixture))})
case = fixture["golden_ratio"]
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(R(case["polynomial_low_to_high"]), "a")
O = K.maximal_order()
assert int(O.discriminant()) == case["discriminant"]

factor_base = []
for rational_prime in case["rational_primes"]:
    factor_base.extend(O.factor_rational_prime(rational_prime).prime_ideals())
factor_base = tuple(factor_base)
actual_factor_base = [
    {
        "prime": int(P.rational_prime()),
        "e": P.ramification_index(),
        "f": P.residue_class_degree(),
        "norm": int(P.norm()._numerator),
    }
    for P in factor_base
]
assert actual_factor_base == case["factor_base"]

class Context: pass
context = Context()
context.relations = []
context.add_relation = lambda relation: context.relations.append(relation)
collector = ExactRelationCollector(O, factor_base, context=context)
initial = initial_rational_prime_relations(collector)
assert [list(item.record.row) for item in initial] == case["initial_rows"]
assert collector.rank_screen.rank == case["initial_modular_rank"]
assert len(context.relations) == len(initial)
assert [[list(pair) for pair in item.record.sparse_row()] for item in initial] == [
    [[0, 1]],
    [[1, 2]],
]

serialized = [item.record.to_dict() for item in initial]
for payload in serialized:
    restored = RelationRecord.from_dict(payload)
    assert restored.to_dict() == payload
    assert restored.verify(O, factor_base)["certified"]
    replay = restored.replay(O, factor_base)
    assert replay["certified"] and replay["principal_ideal"] == replay["reconstructed"]

# The relation witness adapter accepts shared factored-element objects by their
# factors() protocol and canonicalizes cancellation without expansion.
class SharedFactored:
    def factors(self):
        return ((K(2), 2), (K(2), -1))

duck_collector = ExactRelationCollector(O, factor_base)
duck = duck_collector.admit_witness(
    SharedFactored(), provenance={"algorithm": "duck-typed-factored-element"}
)
assert list(duck.record.row) == case["initial_rows"][0]
assert FactoredPrincipalWitness.from_dict(K, duck.record.witness).evaluate() == K(2)

# A source ideal remains separately authenticated while the matrix-facing row
# is the complete principal factorization.
ramified = factor_base[1]
uniformizer = ramified.uniformizer()
uniformizer_case = case["ramified_uniformizer"]
assert int(uniformizer.norm()._numerator) == uniformizer_case["norm"]
assert O.ideal(uniformizer) == ramified
source_relation = collector.admit_witness(
    uniformizer,
    source_ideal=ramified,
    source_row=uniformizer_case["source_row"],
    archimedean_logs=["offline-oracle-placeholder"],
    log_precision=100,
    provenance={"algorithm": "prime-uniformizer"},
)
assert list(source_relation.record.source_row) == uniformizer_case["source_row"]
assert list(source_relation.record.quotient_row) == uniformizer_case["quotient_row"]
assert list(source_relation.record.row) == uniformizer_case["relation_row"]
assert source_relation.record.log_precision == 100
assert source_relation.record.verify(O, factor_base)["certified"]
assert factor_ideal_over_base(ramified ** -1, factor_base) == (0, -1)

coefficients = case["nonsmooth_element_coefficients"]
nonsmooth = K(coefficients[0]) + K(coefficients[1]) * K.gen()
assert abs(int(nonsmooth.norm()._numerator)) == case["nonsmooth_norm"]
try:
    collector.admit_witness(nonsmooth)
    raise AssertionError("a nonsmooth principal ideal was admitted")
except RelationNotSmoothError:
    pass

# Each exact certificate component is live evidence, not decorative metadata.
mutations = []
mutated = json.loads(json.dumps(serialized[0]))
mutated["row"][0] += 1
mutations.append(mutated)
mutated = json.loads(json.dumps(serialized[0]))
mutated["witness"]["factors"][0]["element"][0][0] += 1
mutations.append(mutated)
mutated = json.loads(json.dumps(serialized[0]))
mutated["principal_ideal"]["basis"][0][0][0] += 1
mutations.append(mutated)
mutated = json.loads(json.dumps(serialized[0]))
mutated["norm_smoothness"]["principal_norm"][0] += 1
mutations.append(mutated)
mutated = json.loads(json.dumps(serialized[0]))
mutated["field_order"]["discriminant"] += 1
mutations.append(mutated)
for mutation in mutations:
    assert not verify_relation_record(O, factor_base, mutation)["certified"]
assert not initial[0].record.verify(O, tuple(reversed(factor_base)))["certified"]

screen = ModularRankScreen(3, 101)
assert screen.add([1, 0, 1]) == (True, 0)
assert screen.add([2, 0, 2]) == (False, None)
assert screen.add([0, 1, 1]) == (True, 1)
assert screen.rank == 2 and screen.missing_pivots() == (2,)

assert exact_lll_reduce([[1, 1], [1, -1]]) == [[1, 1], [1, -1]]
unit_plan = minkowski_lll_lattice(O.ideal(1), precision=128)
assert unit_plan.verify(O.ideal(1))
assert unit_plan.signature == (2, 0)
assert [list(row) for row in unit_plan.transform] == case["minkowski_transform"]
assert [list(row) for row in unit_plan.exact_rows] == case["minkowski_exact_rows"]
assert minkowski_lll_lattice(O.ideal(1), precision=80).transform == unit_plan.transform

# Differential oracle: SageMath's documented Minkowski embedding of
# Q[x]/(x^3+2), including sqrt(2)-weighted real and imaginary coordinates.
cubic_case = fixture["nonreal_cubic_minkowski"]
C = NumberField(R(cubic_case["polynomial_low_to_high"]), "b")
CO = C.maximal_order()
cubic_plan = minkowski_lll_lattice(CO.ideal(1), precision=128)
scale = float(2 ** cubic_plan.scale_bits)
actual_embedding = [
    [float(value) / scale for value in row] for row in cubic_plan.embedded_rows
]
for actual_row, expected_row in zip(
    actual_embedding, cubic_case["rows"], strict=True
):
    for actual, expected in zip(actual_row, expected_row, strict=True):
        assert abs(actual - expected) < cubic_case["absolute_tolerance"]
assert cubic_plan.verify(CO.ideal(1))

orbit_plan = plan_automorphism_orbits(K, factor_base)
assert not orbit_plan.available
assert orbit_plan.strategy == "independent-minkowski-relation-search"
assert not any(orbit_plan.detected.values())
try:
    orbit_plan.derive(initial[0].record)
    raise AssertionError("unavailable automorphism orbits produced a relation")
except NotImplementedError:
    pass

search_one = LLLRelationSearch(
    collector, seed=case["search_seed"], max_candidates_per_ideal=10
)
search_two = LLLRelationSearch(
    collector, seed=case["search_seed"], max_candidates_per_ideal=10
)
short_one = [str(value) for value in search_one.short_elements(O.ideal(1))]
short_two = [str(value) for value in search_two.short_elements(O.ideal(1))]
assert short_one == short_two
assert short_one[:len(case["short_element_prefix"])] == case["short_element_prefix"]

first_ideal, first_row = search_one.random_factor_base_ideal()
checkpoint = search_one.state.to_dict()
resumed = LLLRelationSearch(
    collector,
    state=RelationSearchState.from_dict(checkpoint),
    max_candidates_per_ideal=10,
)
next_ideal, next_row = search_one.random_factor_base_ideal()
resumed_ideal, resumed_row = resumed.random_factor_base_ideal()
assert first_ideal == factor_base[0] ** first_row[0] * factor_base[1] ** first_row[1]
assert next_row == resumed_row and next_ideal == resumed_ideal

search_collector = ExactRelationCollector(O, factor_base)
search = LLLRelationSearch(
    search_collector, seed=case["search_seed"], max_candidates_per_ideal=10
)
found = search.search_ideal(O.ideal(1), source_row=[0, 0], stop_after=2)
assert len(found) == 2
assert all(item.record.verify(O, factor_base)["certified"] for item in found)
assert all(
    item.record.provenance["algorithm"] == "minkowski-fixed-point-lll"
    for item in found
)
assert search.state.candidates_tested == 2
assert search.state.relations_admitted == 2

started = time.perf_counter_ns()
for _index in range(case["replay_iterations"]):
    RelationRecord.from_dict(serialized[0]).replay(O, factor_base)
replay_ms = (time.perf_counter_ns() - started) / 1000000
assert replay_ms < case["replay_budget_ms"]

print(json.dumps({
    "factor_base": actual_factor_base,
    "initial_rows": [list(item.record.row) for item in initial],
    "rank": collector.rank_screen.rank,
    "source_row": list(source_relation.record.row),
    "short_prefix": short_one[:len(case["short_element_prefix"])],
    "minkowski_transform": [list(row) for row in unit_plan.transform],
    "cubic_embedding": actual_embedding,
    "automorphism_plan": orbit_plan.to_dict(),
    "search_rows": [list(item.record.row) for item in found],
    "replay_ms": replay_ms,
}, sort_keys=True))
`;

test("exact class-group relations admit, replay, mutate, and search deterministically", () => {
  const executable = process.env.SAGEJS_TEST_EXECUTABLE || join(root, "bin", "sagejs");
  const result = spawnSync(executable, ["--python", "-"], {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout: 120_000,
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout.trim());
  assert.deepEqual(report.initial_rows, fixture.golden_ratio.initial_rows);
  assert.deepEqual(report.factor_base, fixture.golden_ratio.factor_base);
  assert.equal(report.rank, fixture.golden_ratio.initial_modular_rank);
  assert.ok(report.replay_ms < fixture.golden_ratio.replay_budget_ms);
});
