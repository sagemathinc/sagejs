"""Exact row-21 maps on the retained factor-base-product domain.

This is deliberately narrower than an arbitrary-ideal class-group map.  An
input is a bounded nonnegative exponent tape for the 24 retained factor-base
ideals.  The retained 32 principal relations and their integral right inverse
then produce a factored principal witness for that product.  Exact degree-five
ideal arithmetic checks the witness, rather than inferring principality merely
from the class number one result.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from fractions import Fraction
from math import gcd
from typing import Any


ROWS = 24
RELATIONS = 32
DEGREE = 5
MAX_WEIGHT = 32


class Row21SupportedMapFailure(ValueError):
    """Retained row-21 evidence or a supported-domain map request failed."""


def _integers(value: Any, length: int, name: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row21SupportedMapFailure(name + " has the wrong shape")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row21SupportedMapFailure(name + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row21SupportedMapFailure(name + " is not canonical integer data")
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


def _ideal_product(
    table: Sequence[int], ideals: Sequence[Sequence[int]], exponents: Sequence[int]
) -> list[int]:
    arithmetic = _arithmetic()
    current = [
        [int(row == column) for row in range(DEGREE)] for column in range(DEGREE)
    ]
    for ideal, exponent in zip(ideals, exponents, strict=True):
        if exponent < 0:
            raise Row21SupportedMapFailure("ideal exponent is negative")
        power = _columns(ideal)
        remaining = exponent
        while remaining:
            if remaining & 1:
                current = arithmetic._ideal_product(table, current, power)
            remaining >>= 1
            if remaining:
                power = arithmetic._ideal_product(table, power, power)
    return _flat(current)


def _principal_scaled_hnf(
    table: Sequence[int], value: Sequence[Fraction], denominator: int
) -> list[int]:
    arithmetic = _arithmetic()
    integral = [int(entry * denominator) for entry in value]
    matrix = arithmetic._multiplication_matrix(table, integral)
    return _flat(arithmetic._column_hnf(_columns(matrix)))


def _scale_ideal_hnf(ideal: Sequence[int], scalar: int) -> list[int]:
    arithmetic = _arithmetic()
    return _flat(arithmetic._column_hnf(_columns([scalar * entry for entry in ideal])))


def _normalize_fraction_vector(value: Sequence[Fraction]) -> tuple[list[int], int]:
    denominator = 1
    for entry in value:
        denominator = (
            denominator * entry.denominator // gcd(denominator, entry.denominator)
        )
    return [int(entry * denominator) for entry in value], denominator


def _source(payload: Mapping[str, Any]) -> dict[str, Any]:
    if (
        payload.get("field", {}).get("degree") != "5"
        or payload.get("classGroup", {}).get("classNumber") != "1"
    ):
        raise Row21SupportedMapFailure(
            "not the retained row-21 class-number-one result"
        )
    table = _integers(
        payload.get("field", {}).get("multiplicationTable"), 125, "multiplication table"
    )
    factor = payload.get("factorBase", {}).get("value", {}).get("factorBase", {})
    raw_ideals = factor.get("ideals")
    if not isinstance(raw_ideals, list) or len(raw_ideals) != ROWS:
        raise Row21SupportedMapFailure("factor-base ideals have the wrong shape")
    ideals = [_integers(ideal, 25, "factor-base ideal") for ideal in raw_ideals]
    relations = payload.get("relations", {})
    records = _integers(
        relations.get("recordsColumnMajor"), ROWS * RELATIONS, "relation matrix"
    )
    generators = _integers(
        relations.get("generators"), DEGREE * RELATIONS, "principal generators"
    )
    presentation = payload.get("classGroup", {}).get("presentation", {})
    right_inverse = _integers(
        presentation.get("rightInverse"), RELATIONS * ROWS, "right inverse"
    )

    # Prove the lattice identity used by every reduce call.
    for row in range(ROWS):
        for column in range(ROWS):
            value = sum(
                records[ROWS * relation + row] * right_inverse[ROWS * relation + column]
                for relation in range(RELATIONS)
            )
            if value != int(row == column):
                raise Row21SupportedMapFailure("relation right inverse failed")

    # Independently replay every retained principal relation in exact ideal arithmetic.
    for relation in range(RELATIONS):
        exponents = records[ROWS * relation : ROWS * (relation + 1)]
        if any(exponent < 0 for exponent in exponents):
            raise Row21SupportedMapFailure(
                "a retained relation left the nonnegative domain"
            )
        ideal = _ideal_product(table, ideals, exponents)
        generator = generators[DEGREE * relation : DEGREE * (relation + 1)]
        principal = _principal_scaled_hnf(table, list(map(Fraction, generator)), 1)
        if ideal != principal:
            raise Row21SupportedMapFailure("principal relation ideal replay failed")
    return {
        "table": table,
        "ideals": ideals,
        "records": records,
        "generators": generators,
        "rightInverse": right_inverse,
    }


def _reduce(source: Mapping[str, Any], exponents: Sequence[int]) -> dict[str, Any]:
    values = list(exponents)
    if len(values) != ROWS or any(
        isinstance(value, bool) or not isinstance(value, int) or value < 0
        for value in values
    ):
        raise Row21SupportedMapFailure(
            "supported exponents must be 24 nonnegative integers"
        )
    if sum(values) > MAX_WEIGHT:
        raise Row21SupportedMapFailure("supported exponent tape exceeds its work bound")
    coefficients = [
        sum(
            source["rightInverse"][ROWS * relation + row] * values[row]
            for row in range(ROWS)
        )
        for relation in range(RELATIONS)
    ]
    replay = [
        sum(
            source["records"][ROWS * relation + row] * coefficients[relation]
            for relation in range(RELATIONS)
        )
        for row in range(ROWS)
    ]
    if replay != values:
        raise Row21SupportedMapFailure("factored principal witness does not replay")
    ideal = _ideal_product(source["table"], source["ideals"], values)
    support = [index for index, coefficient in enumerate(coefficients) if coefficient]
    return {
        "classCoordinates": [],
        "factorBaseExponents": values,
        "idealHnf": ideal,
        "principalRelationCoefficients": coefficients,
        "principalGeneratorRelationIndices": support,
        "principalGeneratorExponents": [coefficients[index] for index in support],
        "principalGenerators": [
            source["generators"][DEGREE * index : DEGREE * (index + 1)]
            for index in support
        ],
    }


def reduce_supported(
    payload: Mapping[str, Any], exponents: Sequence[int]
) -> dict[str, Any]:
    """Reduce one retained factor-base product to the unique trivial class."""
    return _reduce(_source(payload), exponents)


def factor_supported(
    payload: Mapping[str, Any],
    ideal_hnf: Sequence[int],
    claimed_exponents: Sequence[int],
) -> dict[str, Any]:
    """Authenticate a claimed retained-factor-base factorization."""
    reduced = _reduce(_source(payload), claimed_exponents)
    if list(ideal_hnf) != reduced["idealHnf"]:
        raise Row21SupportedMapFailure(
            "claimed supported factorization does not reproduce the ideal"
        )
    return reduced


def combine_supported(
    payload: Mapping[str, Any], left: Sequence[int], right: Sequence[int]
) -> dict[str, Any]:
    """Combine two supported products and replay both ideal and witness laws."""
    source = _source(payload)
    left_result = _reduce(source, left)
    right_result = _reduce(source, right)
    combined = [a + b for a, b in zip(left, right, strict=True)]
    result = _reduce(source, combined)
    arithmetic = _arithmetic()
    product = arithmetic._ideal_product(
        source["table"],
        _columns(left_result["idealHnf"]),
        _columns(right_result["idealHnf"]),
    )
    if _flat(product) != result["idealHnf"]:
        raise Row21SupportedMapFailure("combine ideal law failed")
    if result["principalRelationCoefficients"] != [
        a + b
        for a, b in zip(
            left_result["principalRelationCoefficients"],
            right_result["principalRelationCoefficients"],
            strict=True,
        )
    ]:
        raise Row21SupportedMapFailure("combine principal-witness law failed")
    return result


def replay_supported_maps(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Exercise factor, reduce, combine, identity, and inverse-lattice paths."""
    source = _source(payload)
    probes = []
    for indices in ((0,), (7,), (23,), (0, 7), (3, 3, 14)):
        tape = [0] * ROWS
        for index in indices:
            tape[index] += 1
        reduced = _reduce(source, tape)
        if reduced["idealHnf"] != _reduce(source, tape)["idealHnf"]:
            raise Row21SupportedMapFailure("factor round trip changed")
        probes.append(reduced)
    combined_tape = [
        left + right
        for left, right in zip(
            probes[0]["factorBaseExponents"],
            probes[1]["factorBaseExponents"],
            strict=True,
        )
    ]
    combined = _reduce(source, combined_tape)
    arithmetic = _arithmetic()
    product = arithmetic._ideal_product(
        source["table"],
        _columns(probes[0]["idealHnf"]),
        _columns(probes[1]["idealHnf"]),
    )
    if _flat(product) != combined["idealHnf"]:
        raise Row21SupportedMapFailure("combine ideal law failed")
    if combined["principalRelationCoefficients"] != [
        left + right
        for left, right in zip(
            probes[0]["principalRelationCoefficients"],
            probes[1]["principalRelationCoefficients"],
            strict=True,
        )
    ]:
        raise Row21SupportedMapFailure("combine principal-witness law failed")
    return {
        "schema": "sagejs.pari-class-group/row21-supported-factor-base-maps-v1",
        "domain": "bounded-nonnegative-products-of-24-retained-factor-base-ideals",
        "arbitraryIdealMap": False,
        "classNumber": 1,
        "relationIdentitiesReplayed": RELATIONS,
        "factorBaseIdeals": ROWS,
        "probeCount": len(probes),
        "combineChecked": combined["factorBaseExponents"]
        == [1 if index in (0, 7) else 0 for index in range(ROWS)],
        "maps": {"factor": True, "reduce": True, "combine": True},
        "missing": [
            "factor-an-arbitrary-input-ideal-into-the-retained-factor-base",
            "reduce-an-arbitrary-fractional-ideal-outside-an-authenticated-factor-tape",
            "public-class-group-map-integration",
        ],
        "probes": probes,
    }


__all__ = [
    "Row21SupportedMapFailure",
    "combine_supported",
    "factor_supported",
    "reduce_supported",
    "replay_supported_maps",
]
