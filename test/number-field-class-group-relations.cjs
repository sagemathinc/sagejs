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
import hashlib
import time

from sagejs.number_fields.class_group_relations import (
    _exact_lll_reduce_with_transform,
    _gram_schmidt,
    _integer_determinant,
    _matrix_times_rows,
    _nearest_integer,
    AutomorphismOrbitPlan,
    ExactRelationCollector,
    FactorBaseIdealReconstructor,
    FactoredPrincipalWitness,
    IdealReductionCancelled,
    IdealReductionResourceLimit,
    IdealReductionState,
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
    reconstruct_factor_base_ideal,
    reduce_ideal_over_base,
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

# The reconstruction accelerator is collector-local, bounded, and exactly
# differential against the uncached public construction for signed rows.
cached_reconstructor = FactorBaseIdealReconstructor(
    O, factor_base, max_rows=3, max_powers=2
)
cache_rows = ((0, 0), (1, 0), (0, -1), (2, 1), (-1, 2))
for cache_row in cache_rows:
    expected = reconstruct_factor_base_ideal(O, factor_base, cache_row)
    assert cached_reconstructor.reconstruct(cache_row) == expected
    assert cached_reconstructor.reconstruct(cache_row) == expected
cache_diagnostics = cached_reconstructor.diagnostics()
assert cache_diagnostics["row_hits"] >= len(cache_rows)
assert cache_diagnostics["row_entries"] <= 3
assert cache_diagnostics["power_entries"] <= 2
assert cache_diagnostics["retained_ideal_objects"] <= 5
assert cache_diagnostics["max_retained_ideal_objects"] == 5
assert cache_diagnostics["row_evictions"] > 0
assert cache_diagnostics["power_evictions"] > 0

independent_reconstructor = FactorBaseIdealReconstructor(O, factor_base)
assert independent_reconstructor.diagnostics()["row_requests"] == 0

class Context: pass
context = Context()
context.relations = []
context.add_relation = lambda relation: context.relations.append(relation)
collector = ExactRelationCollector(O, factor_base, context=context)
order_type = type(O)
saved_factor_rational_prime = order_type.factor_rational_prime
def forbidden_refactor(self, rational_prime, *args, **kwargs):
    raise AssertionError("initial rational relations refactored a certified prime")
order_type.factor_rational_prime = forbidden_refactor
try:
    initial = initial_rational_prime_relations(collector)
finally:
    order_type.factor_rational_prime = saved_factor_rational_prime
assert [list(item.record.row) for item in initial] == case["initial_rows"]
assert collector.rank_screen.rank == case["initial_modular_rank"]
assert len(context.relations) == len(initial)
assert [[list(pair) for pair in item.record.sparse_row()] for item in initial] == [
    [[0, 1]],
    [[1, 2]],
]
collector_cache = collector.reconstruction_diagnostics()
assert collector_cache["row_hits"] > 0
assert collector_cache["retained_ideal_objects"] <= (
    collector_cache["max_retained_ideal_objects"]
)

# Live admission receipts bind the collector's exact order and factor-base
# objects plus the complete canonical record payload.  Public/detached replay
# receives no verifier and therefore remains cold.
receipt_before = collector.admission_receipt_diagnostics()
assert receipt_before["entries"] == len(initial)
assert receipt_before["entries"] <= receipt_before["max_entries"]
assert initial[0].record.verify(
    O,
    factor_base,
    reconstructor=collector,
    admission_verifier=collector,
)["certified"]
receipt_hit = collector.admission_receipt_diagnostics()
assert receipt_hit["requests"] == receipt_before["requests"] + 1
assert receipt_hit["hits"] == receipt_before["hits"] + 1
assert not collector.verify_admission_receipt(object(), factor_base, initial[0].record)
assert not collector.verify_admission_receipt(
    O, tuple(object() for _prime in factor_base), initial[0].record
)
saved_provenance = dict(initial[0].record.provenance)
initial[0].record.provenance["receipt-mutation"] = True
assert not collector.verify_admission_receipt(O, factor_base, initial[0].record)
assert initial[0].record.verify(
    O,
    factor_base,
    reconstructor=collector,
    admission_verifier=collector,
)["certified"]
initial[0].record.provenance = saved_provenance

limited_receipts = ExactRelationCollector(
    O, factor_base, max_admission_receipts=1
)
limited_first = limited_receipts.admit_witness(K(2)).record
limited_second = limited_receipts.admit_witness(K(4)).record
limited_diagnostics = limited_receipts.admission_receipt_diagnostics()
assert limited_diagnostics["entries"] == limited_diagnostics["max_entries"] == 1
assert limited_diagnostics["evictions"] == 1
assert not limited_receipts.verify_admission_receipt(
    O, factor_base, limited_first
)
assert limited_receipts.verify_admission_receipt(O, factor_base, limited_second)

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

live_reconstruction_rows = []
def live_reconstructor(row):
    live_reconstruction_rows.append(tuple(row))
    return reconstruct_factor_base_ideal(O, factor_base, row)

cold_verification = source_relation.record.verify(O, factor_base)
live_verification = source_relation.record.verify(
    O, factor_base, reconstructor=live_reconstructor
)
assert live_verification == cold_verification == {"certified": True, "failures": []}
assert live_reconstruction_rows == [
    source_relation.record.source_row,
    source_relation.record.quotient_row,
    source_relation.record.row,
]
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


def full_recompute_lll(rows):
    """Historical exact oracle that recomputes Gram--Schmidt after each edit."""
    basis = [[int(value) for value in row] for row in rows]
    transform = [
        [1 if row == column else 0 for column in range(len(basis))]
        for row in range(len(basis))
    ]
    mu, norms = _gram_schmidt(basis)
    index = 1
    while index < len(basis):
        for previous in range(index - 1, -1, -1):
            multiple = _nearest_integer(mu[index][previous])
            if multiple:
                basis[index] = [
                    value - multiple * basis[previous][column]
                    for column, value in enumerate(basis[index])
                ]
                transform[index] = [
                    value - multiple * transform[previous][column]
                    for column, value in enumerate(transform[index])
                ]
                mu, norms = _gram_schmidt(basis)
        if (
            norms[index]
            >= (QQ(3) / QQ(4) - mu[index][index - 1] ** 2) * norms[index - 1]
        ):
            index += 1
        else:
            basis[index], basis[index - 1] = basis[index - 1], basis[index]
            transform[index], transform[index - 1] = (
                transform[index - 1],
                transform[index],
            )
            mu, norms = _gram_schmidt(basis)
            index = max(1, index - 1)
    return basis, transform


# Exact differential against the previous full-recompute path covers size
# reductions before and after swaps, negative multiples, and large integers.
lll_cases = (
    [[1, 1], [1, -1]],
    [[105, 821, 404], [281, 88, 197], [37, 401, 999]],
    [[8, 3, -2, 7], [21, -5, 4, 1], [6, 17, 9, -3], [11, 2, 25, 4]],
    [
        [2**40 + 1, 3, 5, 7, 11],
        [2**39 - 1, 13, 17, 19, 23],
        [29, 2**38 + 1, 31, 37, 41],
        [43, 47, 2**37 - 1, 53, 59],
        [61, 67, 71, 2**36 + 1, 73],
    ],
)
for lll_rows in lll_cases:
    expected_basis, expected_transform = full_recompute_lll(lll_rows)
    actual_basis, actual_transform = _exact_lll_reduce_with_transform(lll_rows)
    assert actual_basis == expected_basis
    assert actual_transform == expected_transform
    assert _matrix_times_rows(actual_transform, lll_rows) == actual_basis
    assert abs(_integer_determinant(actual_transform)) == 1

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

# Inert and ramified primes are fixed by quadratic conjugation.  The exact
# capability exists, but the collector deterministically declines a redundant
# orbit relation.
orbit_plan = plan_automorphism_orbits(K, factor_base)
assert orbit_plan.available and not orbit_plan.useful and orbit_plan.verify()
assert orbit_plan.strategy == "quadratic-conjugation-factor-base-permutation"
assert orbit_plan.permutation == (0, 1)
assert orbit_plan.derive(initial[0].record) is None
assert collector.admit_automorphism_orbit(initial[0].record, plan=orbit_plan) is None
assert AutomorphismOrbitPlan.from_dict(
    K, factor_base, orbit_plan.to_dict()
).to_dict() == orbit_plan.to_dict()

# SageMath/PARI differential oracle: 11 splits in Q(sqrt(5)).  For the model
# a^2-a-1=0, the nontrivial automorphism is a -> 1-a, so it swaps the two
# primes, maps 4*a+1 to 5-4*a, and preserves trace and norm exactly.
orbit_case = case["quadratic_conjugation"]
split_base = O.factor_rational_prime(orbit_case["split_prime"]).prime_ideals()
split_plan = plan_automorphism_orbits(K, split_base)
assert split_plan.available and split_plan.useful and split_plan.verify()
assert list(split_plan.permutation) == orbit_case["permutation"]
assert split_plan.conjugate_element(K.gen()) == K(1) - K.gen()
parent_element = K(R(orbit_case["parent_element_coefficients"]))
conjugate_element = K(R(orbit_case["conjugate_element_coefficients"]))
assert split_plan.conjugate_element(parent_element) == conjugate_element
assert split_plan.conjugate_element(conjugate_element) == parent_element
assert conjugate_element.trace() == parent_element.trace()
assert conjugate_element.norm() == parent_element.norm()
for index, prime in enumerate(split_base):
    assert split_plan.conjugate_ideal(prime) == split_base[split_plan.permutation[index]]

# The same public construction covers imaginary quadratics: 3 splits in
# Q(sqrt(-5)), conjugation is b -> -b, and the two exact prime ideals swap.
I = NumberField(x**2 + 5, "i")
IO = I.maximal_order()
imaginary_base = IO.factor_rational_prime(3).prime_ideals()
imaginary_plan = plan_automorphism_orbits(I, imaginary_base)
assert imaginary_plan.available and imaginary_plan.useful
assert imaginary_plan.verify() and imaginary_plan.permutation == (1, 0)
assert imaginary_plan.conjugate_element(I.gen()) == -I.gen()
for index, prime in enumerate(imaginary_base):
    assert imaginary_plan.conjugate_ideal(prime) == imaginary_base[
        imaginary_plan.permutation[index]
    ]

orbit_collector = ExactRelationCollector(O, split_base)
orbit_parent = orbit_collector.admit_witness(
    parent_element, provenance={"algorithm": "quadratic-orbit-parent-oracle"}
)
assert list(orbit_parent.record.row) == orbit_case["parent_row"]
orbit_derived = orbit_collector.admit_automorphism_orbit(
    orbit_parent, plan=split_plan
)
assert orbit_derived is not None
assert list(orbit_derived.record.row) == orbit_case["derived_row"]
assert orbit_derived.record.provenance["algorithm"] == (
    "quadratic-conjugation-orbit"
)
assert RelationRecord.from_dict(orbit_derived.record.to_dict()).verify(
    O, split_base
)["certified"]
mapped_witness = FactoredPrincipalWitness.from_dict(
    K, orbit_derived.record.witness
)
assert mapped_witness.evaluate() == conjugate_element

# A rational-prime row is fixed even when the factor-base action is useful.
fixed_split_relation = orbit_collector.admit_witness(K(11))
assert orbit_collector.admit_automorphism_orbit(
    fixed_split_relation, plan=split_plan
) is None

# Mutation differential: both a stale hash and a maliciously rehashed wrong
# permutation are rejected against fresh exact ideal images.  A derived record
# with its mapped row changed also fails detached relation replay.
stale_plan = json.loads(json.dumps(split_plan.to_dict()))
stale_plan["permutation"] = [0, 1]
try:
    AutomorphismOrbitPlan.from_dict(K, split_base, stale_plan)
    raise AssertionError("accepted a mutated automorphism permutation")
except ValueError:
    pass
rehashed_plan = json.loads(json.dumps(stale_plan))
rehashed_body = dict(rehashed_plan)
del rehashed_body["content_sha256"]
rehashed_plan["content_sha256"] = hashlib.sha256(
    json.dumps(
        rehashed_body,
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
).hexdigest()
try:
    AutomorphismOrbitPlan.from_dict(K, split_base, rehashed_plan)
    raise AssertionError("accepted a rehashed false automorphism permutation")
except ValueError:
    pass
mutated_orbit_relation = json.loads(json.dumps(orbit_derived.record.to_dict()))
mutated_orbit_relation["row"] = orbit_case["parent_row"]
assert not verify_relation_record(
    O, split_base, mutated_orbit_relation
)["certified"]

# Omitting one prime from a split orbit is an explicit unavailable capability;
# unsupported degrees keep the independent Minkowski-search fallback.
incomplete_plan = plan_automorphism_orbits(K, split_base[:1])
assert not incomplete_plan.available and not incomplete_plan.useful
assert "complete supplied factor base" in incomplete_plan.reason
assert ExactRelationCollector(O, split_base[:1]).admit_automorphism_orbit(
    orbit_parent.record, plan=incomplete_plan
) is None
cubic_orbit_plan = plan_automorphism_orbits(C, ())
assert not cubic_orbit_plan.available
assert cubic_orbit_plan.strategy == "independent-minkowski-relation-search"
assert "generic field self-map API" in cubic_orbit_plan.reason
try:
    cubic_orbit_plan.derive(initial[0].record)
    raise AssertionError("unsupported automorphism orbits produced a relation")
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

# Degenerate random settings retain the deterministic reduced-basis prefix and
# terminate without consuming the replayable PRNG stream.
for zero_setting in (
    {"random_terms": 0, "coefficient_bound": 2},
    {"random_terms": 2, "coefficient_bound": 0},
):
    finite = LLLRelationSearch(
        collector,
        seed=case["search_seed"],
        max_candidates_per_ideal=10,
        random_terms=zero_setting["random_terms"],
        coefficient_bound=zero_setting["coefficient_bound"],
    )
    initial_random_state = finite.state.random_state
    finite_elements = finite.short_elements(O.ideal(1))
    assert len(finite_elements) == 4
    assert finite.state.random_state == initial_random_state

# A pathological reducer that returns only zero rows can never yield an
# accepted random candidate, so it exercises the independent attempt bound.
bounded = LLLRelationSearch(
    collector,
    seed=1,
    max_candidates_per_ideal=10,
    random_terms=2,
    coefficient_bound=1,
    basis_reducer=lambda _rows: [[0, 0], [0, 0]],
)
bounded_elements = bounded.short_elements(O.ideal(1))
assert not bounded_elements
assert bounded.last_random_attempts == 8 * (10 - 4)

# A nonprincipal fractional ideal in Q(sqrt(-5)) needs the ramified prime over
# 2 to represent its class.  Three candidates are insufficient; the immutable
# cursor resumes at the fourth and the returned principal equality replays.
reduction_case = fixture["fractional_ideal_reduction"]
H = NumberField(R(reduction_case["polynomial_low_to_high"]), "b")
HO = H.maximal_order()
reduction_base = tuple(
    HO.factor_rational_prime(reduction_case["factor_base_prime"]).prime_ideals()
)
hard_prime = HO.factor_rational_prime(reduction_case["ideal_prime"]).prime_ideals()[0]
hard_ideal = hard_prime ** reduction_case["ideal_power"]
try:
    reduce_ideal_over_base(
        hard_ideal,
        reduction_base,
        max_candidates=reduction_case["first_budget"],
    )
    raise AssertionError("the explicit ideal-reduction budget was ignored")
except IdealReductionResourceLimit as error:
    reduction_checkpoint = error.state
assert reduction_checkpoint.candidates_tested == reduction_case["first_budget"]
checkpoint_payload = reduction_checkpoint.to_dict()
assert IdealReductionState.from_dict(checkpoint_payload).to_dict() == checkpoint_payload
assert reduction_checkpoint.stable_hash() == checkpoint_payload["content_sha256"]

def rehash_reduction_state(payload):
    body = dict(payload)
    del body["content_sha256"]
    payload["content_sha256"] = hashlib.sha256(
        json.dumps(
            body,
            allow_nan=False,
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()

mutated_checkpoint = json.loads(json.dumps(checkpoint_payload))
mutated_checkpoint["cube_index"] += 1
try:
    IdealReductionState.from_dict(mutated_checkpoint)
    raise AssertionError("checkpoint mutation retained an obsolete hash")
except ValueError:
    pass
rehash_reduction_state(mutated_checkpoint)
try:
    IdealReductionState.from_dict(mutated_checkpoint)
    raise AssertionError("a rehashed checkpoint skipped a shell candidate")
except ValueError:
    pass
skipping_checkpoint = json.loads(json.dumps(checkpoint_payload))
skipping_checkpoint["cube_index"] += 1
skipping_checkpoint["candidates_tested"] += 1
rehash_reduction_state(skipping_checkpoint)
skipping_state = IdealReductionState.from_dict(skipping_checkpoint)
try:
    reduce_ideal_over_base(
        hard_ideal,
        reduction_base,
        max_candidates=1,
        checkpoint=skipping_state,
    )
    raise AssertionError("a rehashed checkpoint skipped a successful generator")
except ValueError as error:
    assert "skipped a successful candidate" in str(error)
extra_checkpoint = json.loads(json.dumps(checkpoint_payload))
extra_checkpoint["unexpected"] = 1
try:
    IdealReductionState.from_dict(extra_checkpoint)
    raise AssertionError("checkpoint accepted an unexpected key")
except ValueError:
    pass
boolean_checkpoint = json.loads(json.dumps(checkpoint_payload))
boolean_checkpoint["radius"] = True
rehash_reduction_state(boolean_checkpoint)
try:
    IdealReductionState.from_dict(boolean_checkpoint)
    raise AssertionError("checkpoint accepted a Boolean cursor")
except TypeError:
    pass
oversize_checkpoint = json.loads(json.dumps(checkpoint_payload))
oversize_checkpoint["radius"] = 1 << 40
rehash_reduction_state(oversize_checkpoint)
try:
    IdealReductionState.from_dict(oversize_checkpoint)
    raise AssertionError("checkpoint exponentiated an oversized radius")
except ValueError:
    pass
work_checkpoint = json.loads(json.dumps(checkpoint_payload))
work_checkpoint["radius"] = 1 << 20
work_checkpoint["dimension"] = 64
work_checkpoint["cube_index"] = 0
work_checkpoint["candidates_tested"] = 0
rehash_reduction_state(work_checkpoint)
try:
    IdealReductionState.from_dict(work_checkpoint)
    raise AssertionError("checkpoint exceeded the verifier work limit")
except ValueError:
    pass
resumed_row, resumed_witness = reduce_ideal_over_base(
    hard_ideal,
    reduction_base,
    max_candidates=reduction_case["resume_budget"],
    checkpoint=checkpoint_payload,
)
assert list(resumed_row) == reduction_case["quotient_row"]
assert str(resumed_witness.evaluate()) == reduction_case["witness"]
assert resumed_witness.principal_ideal(HO) == (
    hard_ideal * reconstruct_factor_base_ideal(HO, reduction_base, resumed_row)
)
total_row, total_witness = reduce_ideal_over_base(hard_ideal, reduction_base)
assert total_row == resumed_row
assert total_witness.evaluate() == resumed_witness.evaluate()
try:
    reduce_ideal_over_base(hard_ideal, reduction_base, cancelled=lambda: True)
    raise AssertionError("ideal reduction ignored cancellation")
except IdealReductionCancelled as error:
    assert str(error) == "class/unit computation cancelled"
    assert error.state.candidates_tested == 0

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
    "reconstruction_cache": cache_diagnostics,
    "collector_reconstruction_cache": collector.reconstruction_diagnostics(),
    "replay_ms": replay_ms,
}, sort_keys=True))
`;

test("exact class-group relations admit, replay, mutate, and search deterministically", () => {
  const configured = process.env.SAGEJS_TEST_EXECUTABLE;
  const executable =
    configured ||
    (process.platform === "win32"
      ? process.execPath
      : join(root, "bin", "sagejs"));
  const arguments_ =
    process.platform === "win32" && !configured
      ? [join(root, "bin", "sagejs-source.cjs"), "--python", "-"]
      : ["--python", "-"];
  const result = spawnSync(executable, arguments_, {
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
  assert.ok(report.reconstruction_cache.row_hits >= 5);
  assert.ok(report.collector_reconstruction_cache.row_hits > 0);
  assert.ok(report.replay_ms < fixture.golden_ratio.replay_budget_ms);
});
