"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const rationalFixture = String.raw`
from sagejs.hyperelliptic_curves.saturation import (
    ASSUMPTION_SCHEMA,
    SaturationResult,
    division_search_exhaustion_value,
    index_bound_from_height,
    index_bound_from_regulator,
    reduction_constraint,
    saturate_subgroup,
    search_rational_mumford_division,
    verify_division_search_certificate,
    verify_reduction_constraint,
)
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x**5 + x + 1)
J = C.jacobian()
Q = J((0,1))

def typed_assumption(kind, value, source):
    return {
        "schema": ASSUMPTION_SCHEMA,
        "kind": kind,
        "value": value,
        "verifier_id": "fixture-verifier",
        "source": source,
        "proved": True,
    }

def verify_fixture(certificate, context):
    return (
        certificate["schema"] == ASSUMPTION_SCHEMA
        and certificate["verifier_id"] == "fixture-verifier"
        and context["curve_digest"] is not None
        and context["basis_digest"] is not None
    )

verifiers = {"fixture-verifier": verify_fixture}
`;

test("unverified injected reductions remain conditional evidence", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${rationalFixture}
import json

constraint = reduction_constraint(2, 3, (4, 12), ((1, 3), (1, 5)))
assert constraint["equation_rows"] == ((1,1), (1,1))
assert constraint["equation_rank"] == 1
assert constraint["kernel_basis"] == ((1,1),)
assert constraint["verification_status"] == "conditional-unverified"
assert verify_reduction_constraint(constraint)
assert verify_reduction_constraint(json.loads(json.dumps(constraint)))

def forged_provider(jacobian, basis, prime):
    # Full-rank coordinates alone are not a good-reduction or group-map proof.
    return {
        "invariants": (2,2),
        "point_coordinates": ((1,0),),
        "curve_digest": "forged",
        "basis_digest": "forged",
        "good_reduction_certificate": {"replayed": True},
        "map_certificate": {"map_verified": True},
    }

result = saturate_subgroup(
    J,
    (Q,),
    primes=(2,),
    reduction_primes=(3,),
    reduction_provider=forged_provider,
    independence_certificate=typed_assumption("independence", 1, "fixture"),
    assumption_verifiers=verifiers,
)
row = result.prime_results[0]
assert row["constraint_rank"] == 0
assert row["conditional_constraint_rank"] == 1
assert len(row["reduction_certificates"]) == 0
assert len(row["conditional_reduction_constraints"]) == 1
assert not row["ell_division_relations_ruled_out"]
assert not row["free_quotient_saturated"]
assert result.s_saturated_primes == ()
assert result.ell_division_relations_ruled_out_primes == ()
assert result.rank_status["full_rank_proved"] is False
assert result.rank_status["analytic_rank_used"] is False
payload = result.to_dict()
assert payload["schema"] == "sagejs.hyperelliptic.saturation-result.v2"
assert SaturationResult.from_dict(J, payload, assumption_verifiers=verifiers).to_dict() == payload
True`,
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("live saturation results and private records are deeply sealed", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${rationalFixture}
unproved = saturate_subgroup(J, (Q,), use_height_pairing=False)
assert not unproved.global_saturation_proved
assert unproved.free_quotient_saturated_primes == ()
for name, forged_value in (
    ("global_saturation_proved", True),
    ("global_free_quotient_saturation_proved", True),
    ("full_mordell_weil_group_proved", True),
    ("free_quotient_saturated_primes", (2,3,5)),
    ("s_saturated_primes", (2,3,5)),
    ("ell_division_relations_ruled_out_primes", (2,3,5)),
    ("index_factor_from_input", 99),
):
    try:
        setattr(unproved, name, forged_value)
        blocked = False
    except (AttributeError, TypeError):
        blocked = True
    assert blocked

try:
    unproved.rank_status._entries = ()
    private_rebind_blocked = False
except (AttributeError, TypeError):
    private_rebind_blocked = True
assert private_rebind_blocked
try:
    unproved.rank_status._entries[0] = ("full_rank_proved", True)
    private_tuple_blocked = False
except (AttributeError, TypeError):
    private_tuple_blocked = True
assert private_tuple_blocked
try:
    unproved.rank_status._values = {"full_rank_proved": True}
    old_storage_blocked = False
except (AttributeError, TypeError):
    old_storage_blocked = True
assert old_storage_blocked
try:
    unproved._raw_inputs._entries = ()
    raw_rebind_blocked = False
except (AttributeError, TypeError):
    raw_rebind_blocked = True
assert raw_rebind_blocked
try:
    unproved.__dict__["global_saturation_proved"] = True
    direct_dict_blocked = False
except (AttributeError, TypeError):
    direct_dict_blocked = True
if not direct_dict_blocked:
    assert unproved.global_saturation_proved is False
    assert unproved.verify()

original_entries = unproved.rank_status._entries
forged_entries = tuple(
    (key, True if key == "full_rank_proved" else value)
    for key, value in original_entries
)
try:
    unproved.rank_status.__dict__["_entries"] = forged_entries
    private_dict_blocked = False
except (AttributeError, TypeError):
    private_dict_blocked = True
if not private_dict_blocked:
    assert unproved.rank_status._entries == original_entries
    assert not unproved.rank_status["full_rank_proved"]
    assert unproved.verify()

derived = unproved.to_dict()["derived"]
assert derived["global_saturation_proved"] is False
assert derived["global_free_quotient_saturation_proved"] is False
assert derived["free_quotient_saturated_primes"] == ()
assert derived["s_saturated_primes"] == ()
assert unproved.verify()
assert "global_saturation_proved=False" in repr(unproved)
True`,
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("classical Mumford division enlarges an exact rational basis", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${rationalFixture}
import json

P = Q.__rmul__(2)
search = search_rational_mumford_division(
    J, P, 2, numerator_bound=1, denominator_bound=1, max_candidate_tuples=100
)
assert search["status"] == "found", "bounded search did not find the root"
assert search["point"] == Q, "bounded search found the wrong root"
assert search["global_complete"] is False, "finite box claimed global completion"
assert verify_division_search_certificate(J, P, search), "search did not replay"

result = saturate_subgroup(
    J,
    (P,),
    primes=(2,),
    division_search_bound={
        "numerator_bound": 1,
        "denominator_bound": 1,
        "max_candidate_tuples": 100,
    },
    independence_certificate=typed_assumption("independence", 1, "fixture"),
    algebraic_rank=1,
    algebraic_rank_provenance=typed_assumption("algebraic-rank", 1, "descent"),
    exact_subgroup_index=2,
    exact_subgroup_index_provenance=typed_assumption("exact-subgroup-index", 2, "height bound"),
    torsion_order=1,
    torsion_provenance=typed_assumption("rational-torsion-order", 1, "reduction bound"),
    assumption_verifiers=verifiers,
)
assert result.basis == (Q,), "saturation returned the wrong basis"
assert result.index_factor_from_input == 2, "wrong accumulated index factor"
assert len(result.basis_steps) == 1, "wrong basis-chain length"
assert result.basis_steps[0]["old_basis_from_new"] == ((2,),), "wrong basis matrix"
assert result.global_status["remaining_index_bound"] == 1, "wrong residual index"
assert result.global_free_quotient_saturation_proved, "global free quotient not proved"
assert result.full_mordell_weil_group_proved, "full Mordell-Weil group not proved"
assert result.verify(), "live result did not replay"

payload = result.to_dict()
roundtrip = SaturationResult.from_dict(J, json.loads(json.dumps(payload)), assumption_verifiers=verifiers)
assert roundtrip.to_dict() == payload, "JSON roundtrip changed payload"
try:
    result.rank_status["full_rank_proved"] = False
    mutation_blocked = False
except TypeError:
    mutation_blocked = True
assert mutation_blocked, "immutable result accepted mutation"
forged = json.loads(json.dumps(payload))
forged["derived"]["rank_status"]["full_rank_proved"] = False
try:
    SaturationResult.from_dict(J, forged, assumption_verifiers=verifiers)
    forgery_blocked = False
except ArithmeticError:
    forgery_blocked = True
assert forgery_blocked, "derived-field forgery was accepted"
forged = json.loads(json.dumps(payload))
forged["derived"]["prime_results"][0]["kernel_basis"] = []
try:
    SaturationResult.from_dict(J, forged, assumption_verifiers=verifiers)
    kernel_forgery_blocked = False
except ArithmeticError:
    kernel_forgery_blocked = True
assert kernel_forgery_blocked, "kernel forgery was accepted"
forged = json.loads(json.dumps(payload))
forged["derived"]["prime_results"][0]["status"] = "free_quotient_saturated"
try:
    SaturationResult.from_dict(J, forged, assumption_verifiers=verifiers)
    status_forgery_blocked = False
except ArithmeticError:
    status_forgery_blocked = True
assert status_forgery_blocked, "status forgery was accepted"
forged = json.loads(json.dumps(payload))
forged["derived"]["global_status"]["global_saturation_proved"] = False
try:
    SaturationResult.from_dict(J, forged, assumption_verifiers=verifiers)
    global_forgery_blocked = False
except ArithmeticError:
    global_forgery_blocked = True
assert global_forgery_blocked, "global-saturation forgery was accepted"
forged = json.loads(json.dumps(payload))
forged["derived"]["global_saturation_proved"] = False
try:
    SaturationResult.from_dict(J, forged, assumption_verifiers=verifiers)
    promoted_global_forgery_blocked = False
except ArithmeticError:
    promoted_global_forgery_blocked = True
assert promoted_global_forgery_blocked, "promoted global alias forgery was accepted"
forged = json.loads(json.dumps(payload))
forged["derived"]["free_quotient_saturated_primes"] = ["2"]
try:
    SaturationResult.from_dict(J, forged, assumption_verifiers=verifiers)
    free_alias_forgery_blocked = False
except ArithmeticError:
    free_alias_forgery_blocked = True
assert free_alias_forgery_blocked, "free-quotient alias forgery was accepted"
forged = json.loads(json.dumps(payload))
forged["derived"]["full_mordell_weil_group_proved"] = False
try:
    SaturationResult.from_dict(J, forged, assumption_verifiers=verifiers)
    full_group_forgery_blocked = False
except ArithmeticError:
    full_group_forgery_blocked = True
assert full_group_forgery_blocked, "full-Mordell-Weil forgery was accepted"
True`,
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("negative boxes and external proved booleans do not certify", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${rationalFixture}
negative = search_rational_mumford_division(
    J, Q, 2, numerator_bound=0, denominator_bound=1, max_candidate_tuples=3
)
assert negative["status"] == "not_found_in_box"
assert negative["box_complete"]
assert not negative["global_complete"]
assert verify_division_search_certificate(J, Q, negative)

conditional = saturate_subgroup(
    J,
    (Q,),
    primes=(2,),
    division_search_bound={
        "numerator_bound": 0,
        "denominator_bound": 1,
        "max_candidate_tuples": 3,
    },
    independence_certificate={"proved": True, "source": "bare assertion"},
    algebraic_rank=1,
    algebraic_rank_provenance={"proved": True, "source": "bare assertion"},
    global_index_bound=2,
    global_index_bound_provenance={"proved": True, "source": "bare assertion"},
)
assert not conditional.independence["proved"]
assert not conditional.rank_status["full_rank_proved"]
assert not conditional.prime_results[0]["ell_division_relations_ruled_out"]
assert not conditional.global_saturation_proved
assert conditional.prime_results[0]["division_searches"][0]["certificate"]["box_complete"]
assert conditional.prime_results[0]["division_searches"][0]["exhaustive"] is False

exhaustion_value = division_search_exhaustion_value(J, Q, negative)
exhaustion = typed_assumption(
    "global-division-search-bound",
    exhaustion_value,
    "proved global height-to-Mumford-coefficient bound",
)
certified = saturate_subgroup(
    J,
    (Q,),
    primes=(2,),
    division_search_bound={
        "numerator_bound": 0,
        "denominator_bound": 1,
        "max_candidate_tuples": 3,
    },
    division_exhaustion_provenance={
        exhaustion_value["target_digest"]: exhaustion
    },
    independence_certificate=typed_assumption("independence", 1, "fixture"),
    torsion_order=1,
    torsion_provenance=typed_assumption(
        "rational-torsion-order", 1, "certified reduction gcd"
    ),
    assumption_verifiers=verifiers,
)
assert certified.prime_results[0]["division_searches"][0]["exhaustive"]
assert certified.prime_results[0]["ell_division_relations_ruled_out"]
assert certified.prime_results[0]["free_quotient_saturated"]
assert certified.verify()
True`,
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("real genus-2 reductions certify only torsion-controlled saturation", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${rationalFixture}
torsion_unknown = saturate_subgroup(
    J,
    (Q,),
    primes=(2,),
    reduction_primes=(5,),
    independence_certificate=typed_assumption("independence", 1, "fixture"),
    assumption_verifiers=verifiers,
    max_group_operations=1000000,
    max_baby_steps=100000,
)
assert torsion_unknown.prime_results[0]["ell_division_relations_ruled_out"]
assert not torsion_unknown.prime_results[0]["free_quotient_saturated"]
assert torsion_unknown.s_saturated_primes == ()

result = saturate_subgroup(
    J,
    (Q,),
    primes=(2,),
    reduction_primes=(3,5),
    independence_certificate=typed_assumption("independence", 1, "fixture"),
    torsion_order=1,
    torsion_provenance=typed_assumption(
        "rational-torsion-order", 1, "certified reduction gcd"
    ),
    assumption_verifiers=verifiers,
    max_group_operations=1000000,
    max_baby_steps=100000,
)
row = result.prime_results[0]
assert row["constraint_rank"] == 1
assert row["ell_division_relations_ruled_out"]
assert row["free_quotient_saturated"]
assert row["status"] == "free_quotient_saturated"
assert len(row["reduction_certificates"]) == 1
certificate = row["reduction_certificates"][0]
assert certificate["reduction_prime"] == 5
assert certificate["verification_status"] == "internally-replayed"
assert certificate["binding"]["curve_digest"] == result.to_dict()["curve_digest"]
assert certificate["binding"]["finite_map_verified"]
assert certificate["binding"]["good_reduction_certificate"]["replayed"]
assert len(row["reduction_failures"]) == 1
assert row["reduction_failures"][0]["prime"] == 3
assert "bad reduction" in row["reduction_failures"][0]["reason"]
assert result.s_saturated_primes == (2,)
assert result.verify()
True`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("typed bounds work and contradictory proved rank claims fail", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${rationalFixture}
regulator = index_bound_from_regulator(
    QQ(100), QQ(4),
    provenance=typed_assumption("regulator-index-bound", None, "rigorous balls"),
    assumption_verifiers=verifiers,
    context={"curve_digest": "fixture", "basis_digest": "fixture"},
)
assert regulator["value"] == 5 and regulator["verified"]
height = index_bound_from_height(
    QQ(100), QQ(2), 2, QQ(2),
    provenance=typed_assumption("height-index-bound", None, "height theorem"),
    assumption_verifiers=verifiers,
    context={"curve_digest": "fixture", "basis_digest": "fixture"},
)
assert height["value"] == 10 and height["verified"]
try:
    index_bound_from_regulator(QQ(100), QQ(4), provenance={"proved": True})
    assert False
except ValueError:
    pass

try:
    saturate_subgroup(
        J,
        (Q,),
        algebraic_rank=2,
        algebraic_rank_provenance={"proved": True, "source": "claimed exact rank"},
        selmer_rank_upper_bound=1,
        selmer_provenance={"proved": True, "source": "claimed Selmer bound"},
    )
    assert False
except ArithmeticError:
    pass
True`,
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});
