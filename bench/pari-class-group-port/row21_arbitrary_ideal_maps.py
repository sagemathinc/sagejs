"""Exact replay for the bounded row-21 arbitrary-ideal map owner.

The owner is deliberately external: PARI 2.17.4 executes `idealred` and
`bnfisprincipal`, while this module checks the returned denominators and
multipliers using only exact degree-five arithmetic retained by Sage.js.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from fractions import Fraction
from typing import Any


DEGREE = 5


class Row21ArbitraryMapFailure(ValueError):
    """An arbitrary-ideal request or its owner evidence failed exact replay."""


def _integers(value: Any, length: int, name: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row21ArbitraryMapFailure(name + " has the wrong shape")
    answer = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (int, str)):
            raise Row21ArbitraryMapFailure(name + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row21ArbitraryMapFailure(name + " is not canonical integer data")
        answer.append(integer)
    return answer


def _arithmetic() -> Any:
    return __import__(
        "bench.pari-class-group-port.row23_degree5_correspondence",
        fromlist=["_column_hnf"],
    )


def _columns(matrix: Sequence[int]) -> list[list[int]]:
    return [
        [matrix[DEGREE * row + column] for row in range(DEGREE)]
        for column in range(DEGREE)
    ]


def _flat(columns: Sequence[Sequence[int]]) -> list[int]:
    return [columns[column][row] for row in range(DEGREE) for column in range(DEGREE)]


def _hnf(matrix: Sequence[int]) -> list[int]:
    return _flat(_arithmetic()._column_hnf(_columns(matrix)))


def _ideal_product(
    table: Sequence[int], left: Sequence[int], right: Sequence[int]
) -> list[int]:
    return _flat(_arithmetic()._ideal_product(table, _columns(left), _columns(right)))


def _principal_numerator(table: Sequence[int], value: Sequence[int]) -> list[int]:
    matrix = _arithmetic()._multiplication_matrix(table, value)
    return _flat(_arithmetic()._column_hnf(_columns(matrix)))


def _fractional_equal(
    left: Sequence[int],
    left_denominator: int,
    right: Sequence[int],
    right_denominator: int,
) -> bool:
    if left_denominator <= 0 or right_denominator <= 0:
        return False
    return _hnf([right_denominator * entry for entry in left]) == _hnf(
        [left_denominator * entry for entry in right]
    )


def _multiply_elements(
    table: Sequence[int], left: Sequence[int], right: Sequence[int]
) -> list[int]:
    arithmetic = _arithmetic()
    matrix = arithmetic._multiplication_matrix(table, left)
    columns = _columns(matrix)
    return [
        sum(columns[column][row] * right[column] for column in range(DEGREE))
        for row in range(DEGREE)
    ]


def _check_witness(
    table: Sequence[int],
    ideal: Sequence[int],
    ideal_denominator: int,
    element: Sequence[int],
    element_denominator: int,
) -> None:
    principal = _principal_numerator(table, element)
    if not _fractional_equal(ideal, ideal_denominator, principal, element_denominator):
        raise Row21ArbitraryMapFailure("principal generator does not reproduce ideal")


def verify_owner_candidate(
    payload: Mapping[str, Any], request: Mapping[str, Any], candidate: Mapping[str, Any]
) -> dict[str, Any]:
    """Replay one freshly returned PARI reduction/principality candidate."""
    if payload.get("field", {}).get("degree") != "5":
        raise Row21ArbitraryMapFailure("wrong row-21 field")
    if payload.get("classGroup", {}).get("classNumber") != "1":
        raise Row21ArbitraryMapFailure("row-21 class number changed")
    table = _integers(
        payload.get("field", {}).get("multiplicationTable"),
        125,
        "multiplication table",
    )
    requested = _integers(request.get("numeratorHnf"), 25, "requested ideal")
    requested_denominator = int(request.get("denominator", 0))
    if requested_denominator <= 0:
        raise Row21ArbitraryMapFailure("invalid requested denominator")

    normalized = _integers(
        candidate.get("normalizedNumeratorHnf"), 25, "normalized ideal"
    )
    normalized_denominator = int(candidate.get("normalizedDenominator", 0))
    if not _fractional_equal(
        requested, requested_denominator, normalized, normalized_denominator
    ):
        raise Row21ArbitraryMapFailure("PARI normalized a different fractional ideal")

    classes = candidate.get("classCoordinates")
    if classes != []:
        raise Row21ArbitraryMapFailure("row-21 arbitrary ideal has nontrivial class")
    generator = _integers(
        candidate.get("principalGeneratorNumerator"), 5, "principal generator"
    )
    generator_denominator = int(candidate.get("principalGeneratorDenominator", 0))
    _check_witness(
        table, normalized, normalized_denominator, generator, generator_denominator
    )

    reduced = _integers(candidate.get("reducedNumeratorHnf"), 25, "reduced ideal")
    reduced_denominator = int(candidate.get("reducedDenominator", 0))
    multiplier = _integers(
        candidate.get("reductionMultiplierNumerator"), 5, "reduction multiplier"
    )
    multiplier_denominator = int(candidate.get("reductionMultiplierDenominator", 0))
    multiplier_ideal = _principal_numerator(table, multiplier)
    # PARI's extended-ideal convention returns `[J, a]` with `I = (a) J`.
    # (The user manual's prose phrases the internal reduction multiplier in
    # the reciprocal direction, but its worked prime-ideal example and the
    # exact arithmetic below establish the returned representation law.)
    product = _ideal_product(table, multiplier_ideal, reduced)
    if not _fractional_equal(
        product,
        multiplier_denominator * reduced_denominator,
        normalized,
        normalized_denominator,
    ):
        raise Row21ArbitraryMapFailure("idealred multiplier law failed")

    inverse = _integers(
        candidate.get("reductionToIdentityNumerator"),
        5,
        "identity reduction multiplier",
    )
    inverse_denominator = int(candidate.get("reductionToIdentityDenominator", 0))
    inverse_ideal = _principal_numerator(table, inverse)
    identity = [int(row == column) for row in range(DEGREE) for column in range(DEGREE)]
    identity_product = _ideal_product(table, inverse_ideal, normalized)
    if not _fractional_equal(
        identity_product,
        inverse_denominator * normalized_denominator,
        identity,
        1,
    ):
        raise Row21ArbitraryMapFailure("reduction-to-identity multiplier law failed")

    return {
        "classCoordinates": [],
        "normalizedDenominator": str(normalized_denominator),
        "normalizedNumeratorHnf": list(map(str, normalized)),
        "principalGeneratorDenominator": str(generator_denominator),
        "principalGeneratorNumerator": list(map(str, generator)),
        "reducedDenominator": str(reduced_denominator),
        "reducedNumeratorHnf": list(map(str, reduced)),
        "reductionMultiplierDenominator": str(multiplier_denominator),
        "reductionMultiplierNumerator": list(map(str, multiplier)),
        "reductionToIdentityDenominator": str(inverse_denominator),
        "reductionToIdentityNumerator": list(map(str, inverse)),
    }


def verify_combine(
    payload: Mapping[str, Any],
    left: Mapping[str, Any],
    right: Mapping[str, Any],
    product: Mapping[str, Any],
) -> None:
    """Check the exact arbitrary-ideal combine and generator laws."""
    table = _integers(
        payload.get("field", {}).get("multiplicationTable"), 125, "multiplication table"
    )
    li = _integers(left.get("normalizedNumeratorHnf"), 25, "left ideal")
    ri = _integers(right.get("normalizedNumeratorHnf"), 25, "right ideal")
    pi = _integers(product.get("normalizedNumeratorHnf"), 25, "product ideal")
    ld, rd, pd = (
        int(left["normalizedDenominator"]),
        int(right["normalizedDenominator"]),
        int(product["normalizedDenominator"]),
    )
    if not _fractional_equal(_ideal_product(table, li, ri), ld * rd, pi, pd):
        raise Row21ArbitraryMapFailure("arbitrary ideal combine law failed")
    lg = _integers(left.get("principalGeneratorNumerator"), 5, "left generator")
    rg = _integers(right.get("principalGeneratorNumerator"), 5, "right generator")
    pg = _integers(product.get("principalGeneratorNumerator"), 5, "product generator")
    lgd, rgd, pgd = (
        int(left["principalGeneratorDenominator"]),
        int(right["principalGeneratorDenominator"]),
        int(product["principalGeneratorDenominator"]),
    )
    combined = _multiply_elements(table, lg, rg)
    combined_ideal = _principal_numerator(table, combined)
    product_generator_ideal = _principal_numerator(table, pg)
    if not _fractional_equal(combined_ideal, lgd * rgd, product_generator_ideal, pgd):
        raise Row21ArbitraryMapFailure("principal generator combine law failed")


__all__ = [
    "Row21ArbitraryMapFailure",
    "verify_combine",
    "verify_owner_candidate",
]
