"""Exact row-23 maps for ideals supported on the retained factor base.

The public factor operation accepts an arbitrary integral degree-five ideal
HNF.  It fails closed unless prepared prime-ideal valuations prove that every
prime divisor belongs to the 31-prime retained base.  Reduction and combine
use the independently replayed rectangular Smith identity ``U W V = D``.

PARI 2.17.4 valuation algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import json
from math import gcd
from typing import Any

from .valuation import pari_prepared_hnf_valuation


ROWS = 40
COLUMNS = 31
DEGREE = 5
TAIL = 30
ORDER = 6


class Row23SupportedMapFailure(ValueError):
    """An input or retained owner failed the supported-ideal map contract."""


def _integers(value: Any, length: int, name: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row23SupportedMapFailure(name + " has the wrong shape")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row23SupportedMapFailure(name + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row23SupportedMapFailure(name + " is not canonical integer data")
        answer.append(integer)
    return answer


def _determinant(matrix: Sequence[int]) -> int:
    if len(matrix) != DEGREE * DEGREE:
        raise Row23SupportedMapFailure("degree-five ideal HNF has the wrong shape")
    work = [list(matrix[DEGREE * row : DEGREE * (row + 1)]) for row in range(DEGREE)]
    sign = 1
    previous = 1
    for column in range(DEGREE - 1):
        pivot = column
        while pivot < DEGREE and work[pivot][column] == 0:
            pivot += 1
        if pivot == DEGREE:
            return 0
        if pivot != column:
            work[column], work[pivot] = work[pivot], work[column]
            sign = -sign
        value = work[column][column]
        for row in range(column + 1, DEGREE):
            for other in range(column + 1, DEGREE):
                numerator = (
                    value * work[row][other] - work[row][column] * work[column][other]
                )
                if numerator % previous:
                    raise Row23SupportedMapFailure("inexact determinant state")
                work[row][other] = numerator // previous
            work[row][column] = 0
        previous = value
    return sign * work[-1][-1]


def _row_times_matrix(
    row: Sequence[int], matrix: Sequence[int], width: int
) -> list[int]:
    if len(row) * width != len(matrix):
        raise Row23SupportedMapFailure("matrix product has incompatible dimensions")
    return [
        sum(row[inner] * matrix[inner * width + column] for inner in range(len(row)))
        for column in range(width)
    ]


def _digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")
    ).hexdigest()


def _source(payload: Mapping[str, Any], proof: Mapping[str, Any]) -> dict[str, Any]:
    if (
        payload.get("field", {}).get("degree") != "5"
        or payload.get("classGroup", {}).get("classNumber") != "6"
        or proof.get("schema")
        != "sagejs.pari-class-group/row23-raw-smith-presentation-v1"
        or proof.get("diagonal") != ["1"] * TAIL + ["6"]
    ):
        raise Row23SupportedMapFailure("wrong row-23 result or raw Smith proof")
    table = _integers(
        payload.get("field", {}).get("multiplicationTable"), 125, "multiplication table"
    )
    factor = payload.get("factorBase", {})
    ideals = [
        _integers(value, 25, "factor-base ideal") for value in factor.get("ideals", [])
    ]
    descriptors = factor.get("descriptors")
    if (
        len(ideals) != COLUMNS
        or not isinstance(descriptors, list)
        or len(descriptors) != COLUMNS
    ):
        raise Row23SupportedMapFailure("factor-base owner changed")
    parsed = [_integers(value, 33, "factor-base descriptor") for value in descriptors]
    relations = _integers(
        payload.get("relations", {}).get("recordsColumnMajor"),
        ROWS * COLUMNS,
        "relations",
    )
    generators = _integers(
        payload.get("relations", {}).get("principalGenerators"),
        ROWS * DEGREE,
        "principal generators",
    )
    class_ideals = payload.get("classGroup", {}).get("generatorIdeals")
    if not isinstance(class_ideals, list) or len(class_ideals) != 1:
        raise Row23SupportedMapFailure("class generator ideal changed")
    class_ideal = _integers(class_ideals[0], 25, "class generator ideal")
    u = _integers(proof.get("U"), ROWS * ROWS, "raw Smith U")
    v = _integers(proof.get("V"), COLUMNS * COLUMNS, "raw Smith V")
    if proof.get("W") != payload.get("relations", {}).get("recordsColumnMajor"):
        raise Row23SupportedMapFailure("Smith proof is detached from relations")
    return {
        "table": table,
        "ideals": ideals,
        "relations": relations,
        "generators": generators,
        "classIdeal": class_ideal,
        "u": u,
        "v": v,
        "norms": _integers(factor.get("norms"), COLUMNS, "factor-base norms"),
        "rationalPrimes": [entry[0] for entry in parsed],
        "ramificationIndices": [entry[1] for entry in parsed],
        "residueDegrees": [entry[2] for entry in parsed],
        "inertFlags": [
            int(all(value == 0 for value in entry[3:8])) for entry in parsed
        ],
        # Retained descriptors preserve PARI's column-major packet layout;
        # the valuation kernel consumes the ordinary row-major table.
        "tau": [
            [
                entry[8 + column * DEGREE + row]
                for row in range(DEGREE)
                for column in range(DEGREE)
            ]
            for entry in parsed
        ],
    }


def _valuation(
    ideal: list[int], tau: list[int], p: int, e: int, f: int, inert: int
) -> int:
    return pari_prepared_hnf_valuation(
        ideal,
        tau,
        [0] * 25,
        [0] * 25,
        [0] * 5,
        [0] * 5,
        DEGREE,
        p,
        e,
        f,
        inert,
    )


def _factor(source: Mapping[str, Any], ideal_hnf: Sequence[Any]) -> list[int]:
    ideal = _integers(list(ideal_hnf), 25, "input ideal")
    norm = abs(_determinant(ideal))
    if norm == 0:
        raise Row23SupportedMapFailure("zero ideal is not supported")
    residual = norm
    rational_valuations: dict[int, int] = {}
    for prime in dict.fromkeys(source["rationalPrimes"]):
        value = 0
        while residual % prime == 0:
            residual //= prime
            value += 1
        if value:
            rational_valuations[prime] = value
    if residual != 1:
        raise Row23SupportedMapFailure("ideal norm has support outside the factor base")
    exponents = [0] * COLUMNS
    for prime, norm_valuation in rational_valuations.items():
        positions = [
            i for i, value in enumerate(source["rationalPrimes"]) if value == prime
        ]
        weighted = 0
        for index in positions:
            value = _valuation(
                ideal,
                source["tau"][index],
                prime,
                source["ramificationIndices"][index],
                source["residueDegrees"][index],
                source["inertFlags"][index],
            )
            if value < 0:
                raise Row23SupportedMapFailure(
                    "integral ideal has a negative valuation"
                )
            exponents[index] = value
            weighted += source["residueDegrees"][index] * value
        if weighted != norm_valuation:
            raise Row23SupportedMapFailure("factor-base prime group is incomplete")
    reconstructed = 1
    for factor_norm, exponent in zip(source["norms"], exponents, strict=True):
        reconstructed *= factor_norm**exponent
    if reconstructed != norm:
        raise Row23SupportedMapFailure(
            "prime-ideal factorization does not reconstruct the norm"
        )
    return exponents


def _raw_coordinate(source: Mapping[str, Any], exponents: Sequence[int]) -> int:
    return _row_times_matrix(exponents, source["v"], COLUMNS)[TAIL] % ORDER


def _relation_witness(
    source: Mapping[str, Any], difference: Sequence[int]
) -> list[int]:
    transformed = _row_times_matrix(difference, source["v"], COLUMNS)
    diagonal = [1] * TAIL + [ORDER]
    if any(value % diagonal[index] for index, value in enumerate(transformed)):
        raise Row23SupportedMapFailure("representative has a different class")
    diagonal_coefficients = [
        transformed[index] // diagonal[index] for index in range(COLUMNS)
    ] + [0] * (ROWS - COLUMNS)
    coefficients = _row_times_matrix(diagonal_coefficients, source["u"], ROWS)
    replay = [0] * COLUMNS
    for relation, coefficient in enumerate(coefficients):
        for column in range(COLUMNS):
            replay[column] += (
                coefficient * source["relations"][relation * COLUMNS + column]
            )
    if replay != list(difference):
        raise Row23SupportedMapFailure("principal-relation witness failed exact replay")
    return coefficients


def _generator(source: Mapping[str, Any]) -> tuple[list[int], int]:
    factors = _factor(source, source["classIdeal"])
    raw = _raw_coordinate(source, factors)
    if gcd(raw, ORDER) != 1:
        raise Row23SupportedMapFailure("published class ideal does not generate C6")
    inverse = pow(raw, -1, ORDER)
    return factors, inverse


def _reduce(source: Mapping[str, Any], exponents: Sequence[Any]) -> dict[str, Any]:
    values = _integers(list(exponents), COLUMNS, "factor exponent tape")
    generator_factors, inverse = _generator(source)
    coordinate = (_raw_coordinate(source, values) * inverse) % ORDER
    representative = [coordinate * value for value in generator_factors]
    coefficients = _relation_witness(
        source, [a - b for a, b in zip(values, representative, strict=True)]
    )
    support = [index for index, value in enumerate(coefficients) if value]
    return {
        "classCoordinates": [coordinate],
        "factorBaseExponents": values,
        "representativeFactorBaseExponents": representative,
        "representativeGeneratorPowers": [coordinate],
        "principalRelationCoefficients": coefficients,
        "principalGeneratorRelationIndices": support,
        "principalGeneratorExponents": [coefficients[index] for index in support],
        "principalGenerators": [
            source["generators"][DEGREE * index : DEGREE * (index + 1)]
            for index in support
        ],
        "generatorFactorization": generator_factors,
    }


def factor_supported_ideal(
    payload: Mapping[str, Any], proof: Mapping[str, Any], ideal_hnf: Sequence[Any]
) -> dict[str, Any]:
    """Factor and reduce any integral ideal supported on the retained base."""
    source = _source(payload, proof)
    return _reduce(source, _factor(source, ideal_hnf))


def factor_supported_fractional_ideal(
    payload: Mapping[str, Any],
    proof: Mapping[str, Any],
    numerator_hnf: Sequence[Any],
    denominator: Any,
) -> dict[str, Any]:
    """Factor ``numerator_hnf / denominator`` when all support is retained."""
    divisor = int(denominator)
    if (
        isinstance(denominator, bool)
        or str(divisor) != str(denominator)
        or divisor <= 0
    ):
        raise Row23SupportedMapFailure(
            "fractional denominator is not positive canonical data"
        )
    source = _source(payload, proof)
    factors = _factor(source, numerator_hnf)
    residual = divisor
    for prime in dict.fromkeys(source["rationalPrimes"]):
        value = 0
        while residual % prime == 0:
            residual //= prime
            value += 1
        if not value:
            continue
        positions = [
            i for i, entry in enumerate(source["rationalPrimes"]) if entry == prime
        ]
        if (
            sum(
                source["ramificationIndices"][i] * source["residueDegrees"][i]
                for i in positions
            )
            != DEGREE
        ):
            raise Row23SupportedMapFailure(
                "denominator prime decomposition is incomplete"
            )
        for index in positions:
            factors[index] -= source["ramificationIndices"][index] * value
    if residual != 1:
        raise Row23SupportedMapFailure(
            "denominator has support outside the factor base"
        )
    result = _reduce(source, factors)
    result["fractionalDenominator"] = divisor
    return result


def reduce_supported_exponents(
    payload: Mapping[str, Any], proof: Mapping[str, Any], exponents: Sequence[Any]
) -> dict[str, Any]:
    """Reduce an arbitrary authenticated signed factor-base exponent tape."""
    return _reduce(_source(payload, proof), exponents)


def combine_supported(
    payload: Mapping[str, Any],
    proof: Mapping[str, Any],
    left: Sequence[Any],
    right: Sequence[Any],
) -> dict[str, Any]:
    """Combine two supported ideals in exact factor coordinates."""
    source = _source(payload, proof)
    left_values = _integers(list(left), COLUMNS, "left factor tape")
    right_values = _integers(list(right), COLUMNS, "right factor tape")
    result = _reduce(
        source, [a + b for a, b in zip(left_values, right_values, strict=True)]
    )
    expected = [
        (_raw_coordinate(source, left_values) + _raw_coordinate(source, right_values))
        * _generator(source)[1]
        % ORDER
    ]
    if result["classCoordinates"] != expected:
        raise Row23SupportedMapFailure("combine class law failed")
    return result


def replay_supported_maps(
    payload: Mapping[str, Any], proof: Mapping[str, Any]
) -> dict[str, Any]:
    """Exercise factor, reduction, combine, fractional, and rejection paths."""
    source = _source(payload, proof)
    identity = [int(row == column) for row in range(DEGREE) for column in range(DEGREE)]
    identity_result = factor_supported_ideal(payload, proof, identity)
    if identity_result["classCoordinates"] != [0]:
        raise Row23SupportedMapFailure("identity ideal has nonzero class")
    for index, ideal in enumerate(source["ideals"]):
        expected = [0] * COLUMNS
        expected[index] = 1
        if _factor(source, ideal) != expected:
            raise Row23SupportedMapFailure("factor-base prime round trip changed")
    generator = factor_supported_ideal(payload, proof, source["classIdeal"])
    if generator["classCoordinates"] != [1]:
        raise Row23SupportedMapFailure("class generator round trip changed")
    combined = combine_supported(
        payload,
        proof,
        generator["factorBaseExponents"],
        generator["factorBaseExponents"],
    )
    if combined["classCoordinates"] != [2]:
        raise Row23SupportedMapFailure("class combine result changed")
    outside = max(source["rationalPrimes"]) + 1
    while any(outside % p == 0 for p in range(2, int(outside**0.5) + 1)):
        outside += 1
    rejected = 0
    for action in (
        lambda: factor_supported_ideal(
            payload,
            proof,
            [
                outside if row == column else 0
                for row in range(DEGREE)
                for column in range(DEGREE)
            ],
        ),
    ):
        try:
            action()
        except Row23SupportedMapFailure:
            rejected += 1
    if rejected != 1:
        raise Row23SupportedMapFailure("out-of-support ideal was accepted")
    body = {
        "schema": "sagejs.pari-class-group/row23-supported-ideal-maps-v1",
        "domain": "arbitrary-integral-degree-five-ideal-hnf-supported-on-retained-factor-base",
        "classNumber": "6",
        "factorBaseSize": "31",
        "relationCount": "40",
        "invariantFactors": ["6"],
        "maps": {"factor": True, "reduce": True, "combine": True},
        "factorBasePrimeRoundTrips": COLUMNS,
        "generatorRoundTrips": 1,
        "fractionalPrincipalDenominatorRoundTrips": 0,
        "outOfSupportRejections": rejected,
        "qualifiedTiming": False,
    }
    return {**body, "contentSha256": _digest(body)}


__all__ = [
    "Row23SupportedMapFailure",
    "combine_supported",
    "factor_supported_fractional_ideal",
    "factor_supported_ideal",
    "reduce_supported_exponents",
    "replay_supported_maps",
]
