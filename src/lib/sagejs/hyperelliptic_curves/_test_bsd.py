"""Focused CPython/Sage.js checks for supplied-data BSD arithmetic."""

from __future__ import annotations

import json

from sagejs.hyperelliptic_curves.bsd import (
    ArithmeticScalar,
    BSDAnalyticQuotient,
    BSDArithmeticInput,
    BSDIncompleteDataError,
    BSDRankMismatchError,
    BSDSubgroupIndexUnknownError,
    BSDValidationError,
    LeadingTermData,
    Provenance,
    RankEvidence,
    RegulatorData,
    SubgroupIndexCertificate,
    SubgroupIndexData,
    TorsionData,
    assemble_bsd_analytic_quotient,
)


def _exact(value: ArithmeticScalar) -> tuple[int, int]:
    assert value.kind == "exact"
    return value.numerator, value.denominator


def _jacobian(
    rank: int,
    derivative: int,
    *,
    pairing: list[list[int]] | None = None,
    regulator: int | None = None,
    tamagawa_numbers: dict[int, int] | None = None,
    bad_primes: tuple[int, ...] = (),
    torsion: int = 1,
    algebraic_rank: RankEvidence | None = None,
) -> BSDArithmeticInput:
    sign = -1 if rank % 2 else 1
    return BSDArithmeticInput.supplied_jacobian(
        leading_term=LeadingTermData.supplied(rank, derivative, sign),
        real_period=2,
        height_pairing=pairing,
        regulator=regulator,
        tamagawa_numbers={} if tamagawa_numbers is None else tamagawa_numbers,
        bad_primes=bad_primes,
        torsion_order=torsion,
        real_component_factor=1,
        period_differential_basis="Neron top differential fixture",
        real_period_is_total=True,
        subgroup_basis=[{"label": "P" + str(index + 1)} for index in range(rank)],
        algebraic_rank=algebraic_rank,
        curve_model={
            "base_ring": "QQ",
            "f_coefficients": ["1", "-1", "0", "0", "0", "1"],
            "h_coefficients": ["0"],
        },
        backend_versions={"sagejs": "test-fixture"},
    )


def _expect(exception: type[BaseException], function: object) -> None:
    try:
        function()  # type: ignore[operator]
    except exception:
        return
    raise AssertionError("expected " + exception.__name__)


def _parse_input_record(value: dict[str, object]) -> BSDArithmeticInput:
    return BSDArithmeticInput.from_dict(value)


def _parse_index_certificate_record(
    value: dict[str, object],
) -> SubgroupIndexCertificate:
    return SubgroupIndexCertificate.from_dict(value)


class _MockCurve:
    def root_number(self) -> int:
        return -1


class _MockLFunctionInit:
    def leading_derivative(self) -> tuple[int, complex]:
        return 1, complex(3.25, 0)

    def curve(self) -> _MockCurve:
        return _MockCurve()

    def diagnostics(self) -> dict[str, object]:
        return {
            "precision_bits": 160,
            "central": {
                "algorithm": "mock-central-weights",
                "analytic_error_status": "refinement-witness-only",
                "refinement_stable": True,
            },
        }


def run() -> dict[str, int | bool]:
    # Rank zero has regulator one even when it is omitted, and 0! is one.
    rank_zero = assemble_bsd_analytic_quotient(_jacobian(0, 12))
    assert _exact(rank_zero.leading_taylor_coefficient()) == (12, 1)
    assert _exact(rank_zero.regulator()) == (1, 1)
    assert _exact(rank_zero.sha_over_index_squared()) == (6, 1)

    # Rank one uses L'(1) without a normalization change.  Ranks two and
    # three explicitly exercise division by r!, not just a parity convention.
    rank_one = assemble_bsd_analytic_quotient(_jacobian(1, 10, regulator=5))
    rank_two = assemble_bsd_analytic_quotient(
        _jacobian(2, 12, pairing=[[2, 1], [1, 2]], torsion=2)
    )
    rank_three = assemble_bsd_analytic_quotient(
        _jacobian(
            3,
            36,
            pairing=[[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        )
    )
    assert _exact(rank_one.leading_taylor_coefficient()) == (10, 1)
    assert _exact(rank_two.leading_taylor_coefficient()) == (6, 1)
    assert _exact(rank_three.leading_taylor_coefficient()) == (6, 1)
    assert _exact(rank_two.sha_over_index_squared()) == (4, 1)

    # M^T H M for M=diag(2,1) multiplies the regulator by det(M)^2=4 and
    # hence divides the subgroup quotient by four.
    changed_basis = assemble_bsd_analytic_quotient(
        _jacobian(2, 12, pairing=[[8, 2], [2, 2]], torsion=2)
    )
    assert _exact(changed_basis.regulator()) == (12, 1)
    assert _exact(changed_basis.sha_over_index_squared()) == (1, 1)

    # The generic A/Adual formula keeps distinct torsion factors.  Here
    # L*/(Omega*Reg*c)=6/(2*3*5), so torsion 2*3 gives 6/5.  Squaring the
    # first order would incorrectly produce 4/5.
    generic = BSDArithmeticInput.supplied_generic(
        leading_term=LeadingTermData.supplied(2, 12, 1),
        real_period=2,
        height_pairing=[[2, 1], [1, 2]],
        tamagawa_numbers={5: 5},
        bad_primes=(5,),
        torsion_order=2,
        dual_torsion_order=3,
        real_component_factor=1,
        period_differential_basis="dual Neron bases fixture",
        real_period_is_total=True,
        subgroup_basis=[
            {"a": {"label": "P1"}, "adual": {"label": "Q1"}},
            {"a": {"label": "P2"}, "adual": {"label": "Q2"}},
        ],
        curve_model={"kind": "oracle-abelian-variety", "label": "A-test"},
        backend_versions={"oracle": "hand-v1"},
    )
    generic_result = BSDAnalyticQuotient(generic)
    assert _exact(generic_result.bsd_quotient()) == (6, 5)
    _expect(BSDValidationError, generic_result.sha_over_index_squared)
    assert generic.subgroup_status == "full_mordell_weil"
    assert generic.subgroup_index.status == "external_unverified"
    assert generic.subgroup_index.value == 1
    assert all(
        "Sha" not in warning for warning in generic_result.diagnostics()["warnings"]
    )

    # The generic quotient currently accepts only a full A/Adual basis.  A
    # single finite index would be mathematically ambiguous because the dual
    # pairing scales by the product of two potentially distinct indices.
    _expect(
        BSDValidationError,
        lambda: BSDArithmeticInput.supplied_generic(
            leading_term=LeadingTermData.supplied(2, 12, 1),
            real_period=2,
            height_pairing=[[2, 1], [1, 2]],
            tamagawa_numbers={},
            bad_primes=(),
            torsion_order=1,
            dual_torsion_order=1,
            real_component_factor=1,
            period_differential_basis="dual Neron bases fixture",
            real_period_is_total=True,
            subgroup_status="full_rank_finite_index",
            subgroup_basis=[
                {"a": {"label": "P1"}, "adual": {"label": "Q1"}},
                {"a": {"label": "P2"}, "adual": {"label": "Q2"}},
            ],
            curve_model={"kind": "oracle-abelian-variety", "label": "A-test"},
            backend_versions={"oracle": "hand-v1"},
        ),
    )

    # An integral basis reversal makes a generic dual-pairing determinant
    # negative; the regulator is its absolute covolume.
    nonsymmetric = RegulatorData.from_pairing(2, [[0, 1], [2, 0]], symmetric=False)
    assert _exact(nonsymmetric.signed_determinant) == (-2, 1)
    assert _exact(nonsymmetric.value) == (2, 1)

    # A typed external binding records an index claim but does not prove it.
    # Unknown and external indices never trigger analytic-Sha promotion.
    _expect(BSDSubgroupIndexUnknownError, rank_two.analytic_sha)
    index_certificate = SubgroupIndexCertificate.bind(
        rank_two.input,
        certified_index=3,
        method="global-saturation",
        verifier="test exact verifier",
        evidence={"basis_change": [[1, 0], [0, 1]]},
    )
    indexed = rank_two.with_subgroup_index(
        3,
        certificate=index_certificate,
    )
    assert indexed.input.subgroup_index.status == "external_unverified"
    _expect(BSDSubgroupIndexUnknownError, indexed.analytic_sha)
    assert rank_zero.input.subgroup_status == "full_rank_finite_index"
    assert rank_zero.input.subgroup_index.status == "unknown"
    assert rank_zero.input.subgroup_index.value == 0

    # Certificates are typed records bound to the exact object, subgroup
    # basis, and regulator.  A certificate made for another basis cannot be
    # transplanted, and a free-form mapping is never accepted as a proof.
    wrong_certificate = SubgroupIndexCertificate.bind(
        changed_basis.input,
        certified_index=3,
        method="global-saturation",
        verifier="test exact verifier",
        evidence={"basis_change": [[2, 0], [0, 1]]},
    )
    _expect(
        BSDValidationError,
        lambda: rank_two.with_subgroup_index(3, certificate=wrong_certificate),
    )
    _expect(
        BSDValidationError,
        lambda: rank_two.with_subgroup_index(4, certificate=index_certificate),
    )
    _expect(
        BSDValidationError,
        lambda: SubgroupIndexData.certified(3, {"method": "untyped"}),  # type: ignore[arg-type]
    )
    _expect(
        BSDValidationError,
        lambda: SubgroupIndexData.certified(3, index_certificate),
    )

    # A hash-bound external claim remains unverified even when it says 999;
    # it can never promote Q_Gamma to analytic Sha.
    absurd_certificate = SubgroupIndexCertificate.bind(
        rank_two.input,
        certified_index=999,
        method="external-claim",
        verifier="not-replayed",
        evidence={"claim": "trust me"},
    )
    absurd = rank_two.with_subgroup_index(999, certificate=absurd_certificate)
    assert absurd.input.subgroup_index.status == "external_unverified"
    _expect(BSDSubgroupIndexUnknownError, absurd.analytic_sha)

    # Authentication covers method, verifier, and evidence as well as the
    # object/basis/regulator hashes.
    for field_name, replacement in (
        ("method", "tampered-method"),
        ("verifier", "tampered-verifier"),
        ("evidence", {"claim": "tampered"}),
    ):
        tampered_certificate = index_certificate.to_dict()
        tampered_certificate[field_name] = replacement
        _expect(
            BSDValidationError,
            lambda: _parse_index_certificate_record(tampered_certificate),
        )

    # Tamagawa assembly is atomic.  Missing a known bad prime and explicitly
    # incomplete global reduction both prevent construction of a quotient.
    missing = _jacobian(
        0,
        12,
        tamagawa_numbers={2: 1},
        bad_primes=(2, 23),
    )
    _expect(BSDIncompleteDataError, lambda: BSDAnalyticQuotient(missing))
    incomplete = BSDArithmeticInput.supplied_jacobian(
        leading_term=LeadingTermData.supplied(0, 12, 1),
        real_period=2,
        tamagawa_numbers={},
        bad_primes=(),
        torsion_order=1,
        real_component_factor=1,
        period_differential_basis="Neron top differential fixture",
        real_period_is_total=True,
        tamagawa_coverage="incomplete",
    )
    _expect(BSDIncompleteDataError, lambda: BSDAnalyticQuotient(incomplete))

    # Rank/dimension mismatch, nonintegral finite data, singular pairings, and
    # indefinite symmetric pairings fail with distinct exact validations.
    proved_rank_one = RankEvidence(
        "proved", 1, Provenance("proved", "2-descent fixture")
    )
    _expect(
        BSDRankMismatchError,
        lambda: _jacobian(
            2,
            12,
            pairing=[[2, 1], [1, 2]],
            algebraic_rank=proved_rank_one,
        ),
    )
    _expect(
        BSDRankMismatchError,
        lambda: _jacobian(2, 12, pairing=[[1]]),
    )
    _expect(
        BSDRankMismatchError,
        lambda: LeadingTermData.supplied(2, 12, -1),
    )
    _expect(
        BSDValidationError,
        lambda: RegulatorData.from_pairing(2, [[1, 1], [1, 1]], symmetric=True),
    )
    _expect(
        BSDValidationError,
        lambda: RegulatorData.from_pairing(2, [[1, 0], [0, -1]], symmetric=True),
    )
    fractional_order: object = (3, 2)
    _expect(
        BSDValidationError,
        lambda: TorsionData(fractional_order, Provenance.supplied()),  # type: ignore[arg-type]
    )
    _expect(
        BSDValidationError,
        lambda: TorsionData(3, Provenance("bounded", "torsion-search-bound")),
    )
    _expect(
        BSDValidationError,
        lambda: TorsionData(3, Provenance.supplied(), "bounded"),
    )
    _expect(BSDValidationError, lambda: _jacobian(0, 12, regulator=2))

    # Prepared analytic objects cross the lazy boundary by behavior rather
    # than by importing lseries.py into this portable module.
    prepared = LeadingTermData.from_lfunction_init(_MockLFunctionInit())
    assert prepared.rank.value == 1
    assert prepared.rank.status == "probable"
    assert prepared.derivative.kind == "decimal"
    assert prepared.derivative.value == "3.25"
    assert prepared.derivative.precision_bits == 160
    assert prepared.functional_equation_sign == -1
    assert prepared.refinement_status == "not_supplied"
    assert not prepared.rigorous

    class _UnstableLFunctionInit(_MockLFunctionInit):
        def diagnostics(self) -> dict[str, object]:
            return {
                "precision_bits": 160,
                "central": {
                    "algorithm": "mock-central-weights",
                    "analytic_error_status": "refinement-witness-only",
                    "refinement_stable": False,
                },
            }

    _expect(
        BSDValidationError,
        lambda: LeadingTermData.from_lfunction_init(_UnstableLFunctionInit()),
    )

    unexpected_tamagawa = _jacobian(
        0,
        12,
        tamagawa_numbers={2: 1, 5: 7},
        bad_primes=(2,),
    )
    _expect(
        BSDIncompleteDataError,
        lambda: BSDAnalyticQuotient(unexpected_tamagawa),
    )

    # Complete records need a reproducible object identity, backend versions,
    # a subgroup basis, and the total real period (including components).
    missing_model = BSDArithmeticInput.supplied_jacobian(
        leading_term=LeadingTermData.supplied(0, 12, 1),
        real_period=2,
        tamagawa_numbers={},
        bad_primes=(),
        torsion_order=1,
        real_component_factor=1,
        period_differential_basis="Neron top differential fixture",
        real_period_is_total=True,
        backend_versions={"sagejs": "test-fixture"},
    )
    missing_backend = BSDArithmeticInput.supplied_jacobian(
        leading_term=LeadingTermData.supplied(0, 12, 1),
        real_period=2,
        tamagawa_numbers={},
        bad_primes=(),
        torsion_order=1,
        real_component_factor=1,
        period_differential_basis="Neron top differential fixture",
        real_period_is_total=True,
        curve_model={"kind": "hyperelliptic", "f": ["1", "0", "1"]},
    )
    partial_period = BSDArithmeticInput.supplied_jacobian(
        leading_term=LeadingTermData.supplied(0, 12, 1),
        real_period=2,
        tamagawa_numbers={},
        bad_primes=(),
        torsion_order=1,
        real_component_factor=1,
        period_differential_basis="Neron top differential fixture",
        real_period_is_total=False,
        curve_model={"kind": "hyperelliptic", "f": ["1", "0", "1"]},
        backend_versions={"sagejs": "test-fixture"},
    )
    _expect(BSDIncompleteDataError, lambda: BSDAnalyticQuotient(missing_model))
    _expect(BSDIncompleteDataError, lambda: BSDAnalyticQuotient(missing_backend))
    _expect(BSDIncompleteDataError, lambda: BSDAnalyticQuotient(partial_period))

    # Versioned serialization is canonical, recomputed on input, and directly
    # suitable for a TEXT payload plus indexed scalar columns in SQLite.
    payload = indexed.to_json()
    assert payload == indexed.to_json()
    decoded = BSDAnalyticQuotient.from_json(payload)
    assert decoded.to_json() == payload
    input_payload = indexed.input.to_json()
    assert BSDArithmeticInput.from_json(input_payload).to_json() == input_payload

    # JSON decoding is deliberately strict: booleans are not truthy values,
    # integer fields are not truncated, and a certificate digest authenticates
    # its precise object/basis/regulator binding.
    strict_records: list[dict[str, object]] = []
    strict_symmetric = json.loads(input_payload)
    strict_symmetric["regulator"]["symmetric"] = "false"
    strict_records.append(strict_symmetric)
    strict_principal = json.loads(input_payload)
    strict_principal["polarization"]["principal"] = 1
    strict_records.append(strict_principal)
    strict_rank = json.loads(input_payload)
    strict_rank["leading_term"]["rank"]["value"] = 2.9
    strict_records.append(strict_rank)
    strict_sign = json.loads(input_payload)
    strict_sign["leading_term"]["functional_equation_sign"] = 1.0
    strict_records.append(strict_sign)
    strict_certificate = json.loads(input_payload)
    strict_certificate["subgroup_index"]["certificate"]["basis_sha256"] = "0" * 64
    strict_records.append(strict_certificate)
    for record in strict_records:
        _expect(
            BSDValidationError,
            lambda: _parse_input_record(record),
        )

    rank_zero_record = rank_zero.input.to_dict()
    rank_zero_record["subgroup_index"]["value"] = "3"
    _expect(
        BSDValidationError,
        lambda: BSDArithmeticInput.from_dict(rank_zero_record),
    )

    scalar_record = ArithmeticScalar.interval(
        "1", "2", precision_bits=160, rigorous=True
    ).to_dict()
    scalar_record["rigorous"] = "false"
    _expect(BSDValidationError, lambda: ArithmeticScalar.from_dict(scalar_record))
    scalar_precision = ArithmeticScalar.interval(
        "1", "2", precision_bits=160, rigorous=True
    ).to_dict()
    scalar_precision["precision_bits"] = 159.9
    _expect(BSDValidationError, lambda: ArithmeticScalar.from_dict(scalar_precision))

    regulator_record = rank_two.input.regulator.to_dict()
    assert RegulatorData.from_dict(regulator_record).to_dict() == regulator_record
    for path in ("value", "signed_determinant"):
        tampered_regulator = json.loads(json.dumps(regulator_record))
        tampered_regulator[path]["numerator"] = "999"
        _expect(
            BSDValidationError,
            lambda record=tampered_regulator: RegulatorData.from_dict(record),
        )
    asymmetric_regulator = json.loads(json.dumps(regulator_record))
    asymmetric_regulator["pairing_matrix"][0][1]["numerator"] = "3"
    _expect(
        BSDValidationError,
        lambda: RegulatorData.from_dict(asymmetric_regulator),
    )
    scalar_regulator = rank_one.input.regulator.to_dict()
    tampered_scalar = json.loads(json.dumps(scalar_regulator))
    tampered_scalar["signed_determinant"]["numerator"] = "999"
    _expect(BSDValidationError, lambda: RegulatorData.from_dict(tampered_scalar))
    sqlite = indexed.sqlite_record()
    assert sqlite["payload_json"] == payload
    assert sqlite["quotient_numerator"] == "4"
    assert sqlite["quotient_denominator"] == "1"
    assert sqlite["rigorous"] == 0
    assert not rank_zero.rigorous
    assert len(str(sqlite["record_sha256"])) == 64
    json.dumps(sqlite, sort_keys=True)

    proved = Provenance("proved", "exact oracle fixture")
    fully_certified = BSDAnalyticQuotient(
        BSDArithmeticInput.supplied_jacobian(
            leading_term=LeadingTermData.supplied(
                0, 12, 1, rank_status="proved", provenance=proved
            ),
            algebraic_rank=RankEvidence("proved", 0, proved),
            real_period=2,
            tamagawa_numbers={},
            bad_primes=(),
            torsion_order=1,
            real_component_factor=1,
            period_differential_basis="Neron top differential fixture",
            real_period_is_total=True,
            provenance=proved,
            curve_model={"kind": "hyperelliptic", "f": ["1", "0", "1"]},
            backend_versions={"oracle": "proved-v1"},
        )
    )
    assert fully_certified.rigorous
    assert fully_certified.input.subgroup_status == "full_mordell_weil"
    assert fully_certified.input.subgroup_index.status == "certified"
    assert fully_certified.input.subgroup_index.value == 1
    assert _exact(fully_certified.analytic_sha()) == (6, 1)

    certified_interval_leading = LeadingTermData.supplied(
        0,
        ArithmeticScalar.interval(
            "11.999", "12.001", precision_bits=160, rigorous=True
        ),
        1,
        rank_status="proved",
        provenance=proved,
    )
    interval_quotient = BSDAnalyticQuotient(
        BSDArithmeticInput.supplied_jacobian(
            leading_term=certified_interval_leading,
            algebraic_rank=RankEvidence("proved", 0, proved),
            real_period=2,
            tamagawa_numbers={},
            bad_primes=(),
            torsion_order=1,
            real_component_factor=1,
            period_differential_basis="Neron top differential fixture",
            real_period_is_total=True,
            provenance=proved,
            curve_model={"kind": "hyperelliptic", "f": ["1", "0", "1"]},
            backend_versions={"oracle": "proved-v1"},
        )
    )
    assert certified_interval_leading.rigorous
    assert not interval_quotient.leading_taylor_coefficient().rigorous
    assert not interval_quotient.numerator().rigorous
    assert interval_quotient.denominator().rigorous
    assert not interval_quotient.bsd_quotient().rigorous
    assert not interval_quotient.rigorous

    # Deserialization never trusts cached factor arithmetic.
    tampered = json.loads(payload)
    tampered["quotient"]["numerator"] = "999"
    _expect(BSDValidationError, lambda: BSDAnalyticQuotient.from_dict(tampered))

    # Approximate/interval schemas retain precision and never inherit a proof
    # claim from ordinary decimal arithmetic.
    interval = ArithmeticScalar.interval(
        "0.999", "1.001", precision_bits=160, rigorous=True
    )
    approximate = interval.multiply(ArithmeticScalar.exact(2))
    assert approximate.kind == "interval"
    assert not approximate.rigorous
    negative_interval = ArithmeticScalar.interval(
        "-2", "-1", precision_bits=160, rigorous=True
    )
    derived_intervals = (
        interval.negate(),
        interval.add(ArithmeticScalar.exact(1)),
        interval.subtract(ArithmeticScalar.exact(1)),
        interval.multiply(ArithmeticScalar.exact(2)),
        interval.divide(ArithmeticScalar.exact(2)),
        interval.absolute(),
        negative_interval.absolute(),
    )
    assert all(not value.rigorous for value in derived_intervals)
    assert ArithmeticScalar.from_dict(interval.to_dict()) == interval

    return {
        "rank_normalization_checks": 4,
        "atomicity_checks": 2,
        "validation_checks": 5,
        "serialization_round_trips": 2,
        "ok": True,
    }


if __name__ == "__main__":
    print(run())
