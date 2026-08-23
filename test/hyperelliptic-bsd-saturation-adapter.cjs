// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("BSD subgroup indices close-replay saturation of the original basis", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(String.raw`
from sagejs.hyperelliptic_curves.bsd import (
    BSDArithmeticInput,
    BSDSubgroupIndexUnknownError,
    BSDValidationError,
    LeadingTermData,
    Provenance,
    RankEvidence,
    SubgroupIndexCertificate,
    assemble_bsd_analytic_quotient,
    bsd_saturation_assumption_certificate,
    bsd_saturation_verifier_authorities,
    subgroup_index_certificate_from_saturation,
)
from sagejs.hyperelliptic_curves.saturation import (
    ASSUMPTION_SCHEMA,
    _curve_payload,
    _divisor_wire,
    saturate_subgroup,
)
import json

R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x**5 + x + 1)
J = C.jacobian()
proof = Provenance("proved", "focused saturation-adapter fixture")

def rank_zero_input(curve, jacobian):
    return BSDArithmeticInput.supplied_jacobian(
        leading_term=LeadingTermData.supplied(
            0, 12, 1, rank_status="proved", provenance=proof
        ),
        real_period=2,
        tamagawa_numbers={},
        bad_primes=(),
        torsion_order=1,
        real_component_factor=1,
        period_differential_basis="Neron top differential fixture",
        real_period_is_total=True,
        regulator=1,
        algebraic_rank=RankEvidence("proved", 0, proof),
        subgroup_status="full_rank_finite_index",
        subgroup_basis=(),
        curve_model=_curve_payload(jacobian),
        backend_versions={"sagejs": "focused-fixture"},
        provenance=proof,
    )

A = rank_zero_input(C, J)
rank_certificate = bsd_saturation_assumption_certificate(A, "algebraic-rank", 0)
torsion_certificate = bsd_saturation_assumption_certificate(
    A, "rational-torsion-order", 1
)
index_one_certificate = bsd_saturation_assumption_certificate(
    A, "exact-subgroup-index", 1
)
S = saturate_subgroup(
    J,
    (),
    algebraic_rank=0,
    algebraic_rank_provenance=rank_certificate,
    torsion_order=1,
    torsion_provenance=torsion_certificate,
    exact_subgroup_index=1,
    exact_subgroup_index_provenance=index_one_certificate,
    assumption_verifiers=bsd_saturation_verifier_authorities(A),
)
assert S.full_mordell_weil_group_proved
certificate = subgroup_index_certificate_from_saturation(A, S)
assert certificate.verification_status == "replayed_full_mordell_weil_saturation"
assert certificate.mathematically_verified
assert certificate.certified_index == S.index_factor_from_input == 1
B = assemble_bsd_analytic_quotient(A).with_subgroup_index(
    S.index_factor_from_input, certificate=certificate
)
assert B.input.subgroup_index.status == "certified"
assert B.analytic_sha().to_dict()["numerator"] == "6"

# Reauthentication alone cannot forge a closed proof: the mathematical replay
# rejects a changed promoted field in the serialized saturation result.
tampered_evidence = json.loads(json.dumps(certificate.to_dict()["evidence"]))
tampered_evidence["saturation_result"]["derived"][
    "full_mordell_weil_group_proved"
] = False
forged = SubgroupIndexCertificate._create(
    verification_status="replayed_full_mordell_weil_saturation",
    method="full-mordell-weil-saturation-original-basis",
    verifier="sagejs.bsd.saturation-index-v1",
    certified_index=1,
    object_sha256=certificate.object_sha256,
    basis_sha256=certificate.basis_sha256,
    regulator_sha256=certificate.regulator_sha256,
    evidence=tampered_evidence,
)
try:
    assemble_bsd_analytic_quotient(A).with_subgroup_index(1, certificate=forged)
    tamper_rejected = False
except BSDValidationError:
    tamper_rejected = True
assert tamper_rejected

# Object hashes and exact model reconstruction both prevent transplanting a
# proof to another curve with the same rank, empty basis, and regulator.
C2 = HyperellipticCurve(x**5 + x + 2)
J2 = C2.jacobian()
A2 = rank_zero_input(C2, J2)
try:
    assemble_bsd_analytic_quotient(A2).with_subgroup_index(1, certificate=certificate)
    transplant_rejected = False
except BSDValidationError:
    transplant_rejected = True
assert transplant_rejected

# A live proof accepted by an arbitrary callback is retained, but remains an
# external/conditional index and therefore cannot unlock analytic_sha().
Q = J((0, 1))
basis_record = _divisor_wire(Q)
A1 = BSDArithmeticInput.supplied_jacobian(
    leading_term=LeadingTermData.supplied(
        1, 5, -1, rank_status="proved", provenance=proof
    ),
    real_period=2,
    tamagawa_numbers={},
    bad_primes=(),
    torsion_order=1,
    real_component_factor=1,
    period_differential_basis="Neron top differential fixture",
    real_period_is_total=True,
    height_pairing=[[1]],
    algebraic_rank=RankEvidence("proved", 1, proof),
    subgroup_status="full_rank_finite_index",
    subgroup_basis=(basis_record,),
    curve_model=_curve_payload(J),
    backend_versions={"sagejs": "focused-fixture"},
    provenance=proof,
)

def fixture_claim(kind, value):
    return {
        "schema": ASSUMPTION_SCHEMA,
        "kind": kind,
        "value": value,
        "verifier_id": "arbitrary-fixture-authority",
        "source": "test-only callback",
        "proved": True,
    }

def trust_fixture(certificate, context):
    return certificate["verifier_id"] == "arbitrary-fixture-authority"

S1 = saturate_subgroup(
    J,
    (Q,),
    independence_certificate=fixture_claim("independence", 1),
    algebraic_rank=1,
    algebraic_rank_provenance=fixture_claim("algebraic-rank", 1),
    torsion_order=1,
    torsion_provenance=fixture_claim("rational-torsion-order", 1),
    exact_subgroup_index=1,
    exact_subgroup_index_provenance=fixture_claim("exact-subgroup-index", 1),
    assumption_verifiers={"arbitrary-fixture-authority": trust_fixture},
)
assert S1.full_mordell_weil_group_proved
conditional = subgroup_index_certificate_from_saturation(A1, S1)
assert conditional.verification_status == "external_unverified"
assert not conditional.mathematically_verified
B1 = assemble_bsd_analytic_quotient(A1).with_subgroup_index(
    1, certificate=conditional
)
assert B1.input.subgroup_index.status == "external_unverified"
try:
    B1.analytic_sha()
    conditional_blocked = False
except BSDSubgroupIndexUnknownError:
    conditional_blocked = True
assert conditional_blocked

# Even the conditional adapter refuses a different original ordered basis.
minus_Q_record = _divisor_wire(-Q)
A1_transplanted = BSDArithmeticInput.supplied_jacobian(
    leading_term=A1.leading_term,
    real_period=2,
    tamagawa_numbers={},
    bad_primes=(),
    torsion_order=1,
    real_component_factor=1,
    period_differential_basis="Neron top differential fixture",
    real_period_is_total=True,
    height_pairing=[[1]],
    algebraic_rank=A1.algebraic_rank,
    subgroup_status="full_rank_finite_index",
    subgroup_basis=(minus_Q_record,),
    curve_model=_curve_payload(J),
    backend_versions={"sagejs": "focused-fixture"},
    provenance=proof,
)
try:
    subgroup_index_certificate_from_saturation(A1_transplanted, S1)
    basis_transplant_rejected = False
except BSDValidationError:
    basis_transplant_rejected = True
assert basis_transplant_rejected
True
`);
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});
