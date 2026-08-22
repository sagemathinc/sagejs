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


class _MockCurve:
    def root_number(self) -> int:
        return -1


class _MockLFunctionInit:
    def leading_derivative(self) -> tuple[int, complex]:
        return 1, complex(3.25, 0)

    def curve(self) -> _MockCurve:
        return _MockCurve()


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
    )
    generic_result = BSDAnalyticQuotient(generic)
    assert _exact(generic_result.bsd_quotient()) == (6, 5)
    _expect(BSDValidationError, generic_result.sha_over_index_squared)

    # An integral basis reversal makes a generic dual-pairing determinant
    # negative; the regulator is its absolute covolume.
    nonsymmetric = RegulatorData.from_pairing(2, [[0, 1], [2, 0]], symmetric=False)
    assert _exact(nonsymmetric.signed_determinant) == (-2, 1)
    assert _exact(nonsymmetric.value) == (2, 1)

    # A certified index promotes Q_Gamma to analytic Sha.  An unknown index
    # remains explicit and never triggers integer recognition or rounding.
    _expect(BSDSubgroupIndexUnknownError, rank_two.analytic_sha)
    indexed = rank_two.with_subgroup_index(
        3,
        certificate={"method": "global-saturation", "basis": [[1, 0], [0, 1]]},
    )
    assert _exact(indexed.analytic_sha()) == (36, 1)

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

    # Prepared analytic objects cross the lazy boundary by behavior rather
    # than by importing lseries.py into this portable module.
    prepared = LeadingTermData.from_lfunction_init(
        _MockLFunctionInit(), precision_bits=160
    )
    assert prepared.rank.value == 1
    assert prepared.rank.status == "probable"
    assert prepared.derivative.kind == "decimal"
    assert prepared.derivative.value == "3.25"
    assert prepared.functional_equation_sign == -1
    assert prepared.refinement_status == "not_supplied"
    assert not prepared.rigorous

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

    # Versioned serialization is canonical, recomputed on input, and directly
    # suitable for a TEXT payload plus indexed scalar columns in SQLite.
    payload = indexed.to_json()
    assert payload == indexed.to_json()
    decoded = BSDAnalyticQuotient.from_json(payload)
    assert decoded.to_json() == payload
    input_payload = indexed.input.to_json()
    assert BSDArithmeticInput.from_json(input_payload).to_json() == input_payload
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
            provenance=proved,
        )
    )
    assert fully_certified.rigorous

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
