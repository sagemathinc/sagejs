"""Exact row-19 class maps for integral ideals supported on the factor base.

The public input to `factor_supported_ideal` is an arbitrary integral cubic
ideal HNF.  It is accepted only when its complete prime-ideal factorization is
contained in the 424 retained factor-base primes.  Prepared prime-ideal
valuations authenticate that factorization.  The raw Smith identity
`U R V = D` then supplies class coordinates and exact signed combinations of
the 430 retained principal relations.

This is intentionally not a factorization algorithm for ideals containing a
prime outside the retained base, nor is it a fractional-ideal denominator
adapter.  Those inputs fail closed.

PARI 2.17.4 valuation algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import json
from typing import Any

from .valuation import pari_prepared_hnf_valuation


ROWS = 430
COLUMNS = 424
DEGREE = 3
TAIL = 415
INVARIANTS = (3, 3, 3, 3, 3, 3, 3, 3, 6)


class Row19GeneralMapFailure(ValueError):
    """An input or retained owner failed the supported-ideal map contract."""


def _integers(value: Any, length: int, name: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row19GeneralMapFailure(name + " has the wrong shape")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row19GeneralMapFailure(name + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row19GeneralMapFailure(name + " is not canonical integer data")
        answer.append(integer)
    return answer


def _determinant3(matrix: Sequence[int]) -> int:
    if len(matrix) != 9:
        raise Row19GeneralMapFailure("cubic ideal HNF has the wrong shape")
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7])
        - matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6])
        + matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6])
    )


def _valuation(
    ideal: list[int], tau: list[int], p: int, e: int, f: int, inert: int
) -> int:
    return pari_prepared_hnf_valuation(
        ideal,
        tau,
        [0] * 9,
        [0] * 9,
        [0] * 3,
        [0] * 3,
        DEGREE,
        p,
        e,
        f,
        inert,
    )


def _row_times_matrix(
    row: Sequence[int], matrix: Sequence[int], width: int
) -> list[int]:
    if len(row) * width != len(matrix):
        raise Row19GeneralMapFailure("matrix product has incompatible dimensions")
    return [
        sum(row[inner] * matrix[inner * width + column] for inner in range(len(row)))
        for column in range(width)
    ]


def _owner(payload: Mapping[str, Any], name: str) -> Any:
    storage = payload.get("storage")
    if not isinstance(storage, list):
        raise Row19GeneralMapFailure("retained storage is absent")
    matches = [entry for entry in storage if entry.get("name") == name]
    if len(matches) != 1:
        raise Row19GeneralMapFailure("retained owner " + name + " is absent")
    owner = matches[0]
    entries = owner.get("entries")
    if not isinstance(entries, list) or owner.get("logicalLength") != str(len(entries)):
        raise Row19GeneralMapFailure("retained owner " + name + " changed")
    return entries


def _source(payload: Mapping[str, Any], proof: Mapping[str, Any]) -> dict[str, Any]:
    if (
        payload.get("field", {}).get("degree") != "3"
        or payload.get("classGroup", {}).get("classNumber") != "39366"
        or proof.get("identity") != "U R V = D"
        or proof.get("diagonalFactors")
        != ["1"] * TAIL + [str(value) for value in INVARIANTS]
    ):
        raise Row19GeneralMapFailure("wrong row-19 result or raw Smith proof")
    factor_entries = _owner(payload, "factor-base")
    factor = json.loads(
        bytes(_integers(factor_entries, len(factor_entries), "factor-base"))
    )
    ideals = [
        _integers(value, 9, "factor-base ideal")
        for value in factor.get("idealHnfs", [])
    ]
    tau = [_integers(value, 9, "factor-base tau") for value in factor.get("tau", [])]
    if len(ideals) != COLUMNS or len(tau) != COLUMNS or factor.get("size") != COLUMNS:
        raise Row19GeneralMapFailure("factor-base owner changed")
    fields = {}
    for name in (
        "norms",
        "rationalPrimes",
        "ramificationIndices",
        "residueDegrees",
        "inertFlags",
    ):
        fields[name] = _integers(factor.get(name), COLUMNS, "factor-base " + name)
    relations = _integers(
        _owner(payload, "relation-records"), ROWS * COLUMNS, "relations"
    )
    generators = _integers(
        _owner(payload, "relation-generators"), ROWS * DEGREE, "principal generators"
    )
    class_ideals_flat = _integers(
        _owner(payload, "class-generator-ideals"), 9 * 9, "class ideals"
    )
    class_order = (1, 2, 3, 4, 5, 6, 7, 8, 0)
    class_ideals = [
        class_ideals_flat[9 * index : 9 * (index + 1)] for index in class_order
    ]
    material = proof.get("material", {})
    u = _integers(material.get("u"), ROWS * ROWS, "raw Smith U")
    v = _integers(material.get("v"), COLUMNS * COLUMNS, "raw Smith V")
    hashes = proof.get("materialSha256", {})
    if (
        hashes.get("u") != _digest(material.get("u"))
        or hashes.get("v") != _digest(material.get("v"))
        or hashes.get("d") != _digest(material.get("d"))
    ):
        raise Row19GeneralMapFailure("raw Smith material digest changed")
    return {
        "ideals": ideals,
        "tau": tau,
        "relations": relations,
        "generators": generators,
        "classIdeals": class_ideals,
        "u": u,
        "v": v,
        **fields,
    }


def _factor(source: Mapping[str, Any], ideal_hnf: Sequence[Any]) -> list[int]:
    ideal = _integers(list(ideal_hnf), 9, "input ideal")
    norm = abs(_determinant3(ideal))
    if norm == 0:
        raise Row19GeneralMapFailure("zero ideal is not supported")
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
        raise Row19GeneralMapFailure("ideal norm has support outside the factor base")
    exponents = [0] * COLUMNS
    for prime, norm_valuation in rational_valuations.items():
        positions = [
            index
            for index, value in enumerate(source["rationalPrimes"])
            if value == prime
        ]
        if not positions:
            raise Row19GeneralMapFailure("factor-base prime group is absent")
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
                raise Row19GeneralMapFailure("integral ideal has a negative valuation")
            exponents[index] = value
            weighted += source["residueDegrees"][index] * value
        if weighted != norm_valuation:
            raise Row19GeneralMapFailure("factor-base prime group is incomplete")
    reconstructed_norm = 1
    for factor_norm, exponent in zip(source["norms"], exponents, strict=True):
        reconstructed_norm *= factor_norm**exponent
    if reconstructed_norm != norm:
        raise Row19GeneralMapFailure(
            "prime-ideal factorization does not reconstruct the norm"
        )
    return exponents


def _coordinates(source: Mapping[str, Any], exponents: Sequence[int]) -> list[int]:
    transformed = _row_times_matrix(exponents, source["v"], COLUMNS)
    return [
        transformed[TAIL + index] % modulus for index, modulus in enumerate(INVARIANTS)
    ]


def _relation_witness(
    source: Mapping[str, Any], exponents: Sequence[int], representative: Sequence[int]
) -> list[int]:
    difference = [a - b for a, b in zip(exponents, representative, strict=True)]
    transformed = _row_times_matrix(difference, source["v"], COLUMNS)
    diagonal = [1] * TAIL + list(INVARIANTS)
    if any(value % diagonal[index] for index, value in enumerate(transformed)):
        raise Row19GeneralMapFailure("representative has a different class")
    diagonal_coefficients = [
        transformed[index] // diagonal[index] for index in range(COLUMNS)
    ] + [0] * (ROWS - COLUMNS)
    coefficients = _row_times_matrix(diagonal_coefficients, source["u"], ROWS)
    replay = [0] * COLUMNS
    for relation, coefficient in enumerate(coefficients):
        if coefficient == 0:
            continue
        offset = relation * COLUMNS
        for column in range(COLUMNS):
            replay[column] += coefficient * source["relations"][offset + column]
    if replay != difference:
        raise Row19GeneralMapFailure("principal-relation witness failed exact replay")
    return coefficients


def _reduce(source: Mapping[str, Any], exponents: Sequence[int]) -> dict[str, Any]:
    values = _integers(list(exponents), COLUMNS, "factor exponent tape")
    coordinates = _coordinates(source, values)
    representative = [0] * COLUMNS
    generator_factorizations = []
    for index, ideal in enumerate(source["classIdeals"]):
        factors = _factor(source, ideal)
        expected = [int(position == index) for position in range(len(INVARIANTS))]
        if _coordinates(source, factors) != expected:
            raise Row19GeneralMapFailure(
                "published class ideal does not map to its generator"
            )
        generator_factorizations.append(factors)
        for position, exponent in enumerate(factors):
            representative[position] += coordinates[index] * exponent
    coefficients = _relation_witness(source, values, representative)
    support = [index for index, value in enumerate(coefficients) if value]
    return {
        "classCoordinates": coordinates,
        "factorBaseExponents": values,
        "representativeFactorBaseExponents": representative,
        "representativeGeneratorPowers": coordinates,
        "principalRelationCoefficients": coefficients,
        "principalGeneratorRelationIndices": support,
        "principalGeneratorExponents": [coefficients[index] for index in support],
        "principalGenerators": [
            source["generators"][3 * index : 3 * (index + 1)] for index in support
        ],
        "generatorFactorizations": generator_factorizations,
    }


def factor_supported_ideal(
    payload: Mapping[str, Any], proof: Mapping[str, Any], ideal_hnf: Sequence[Any]
) -> dict[str, Any]:
    """Factor and reduce any integral ideal supported on the retained base."""
    source = _source(payload, proof)
    factors = _factor(source, ideal_hnf)
    return _reduce(source, factors)


def factor_supported_fractional_ideal(
    payload: Mapping[str, Any],
    proof: Mapping[str, Any],
    numerator_hnf: Sequence[Any],
    denominator: Any,
) -> dict[str, Any]:
    """Factor `numerator_hnf / denominator` on the retained prime base."""
    if isinstance(denominator, bool) or not isinstance(denominator, (str, int)):
        raise Row19GeneralMapFailure("fractional-ideal denominator is not an integer")
    divisor = int(denominator)
    if str(divisor) != str(denominator) or divisor <= 0:
        raise Row19GeneralMapFailure(
            "fractional-ideal denominator is not positive canonical data"
        )
    source = _source(payload, proof)
    factors = _factor(source, numerator_hnf)
    residual = divisor
    for prime in dict.fromkeys(source["rationalPrimes"]):
        value = 0
        while residual % prime == 0:
            residual //= prime
            value += 1
        if value == 0:
            continue
        positions = [
            index
            for index, entry in enumerate(source["rationalPrimes"])
            if entry == prime
        ]
        if (
            sum(
                source["ramificationIndices"][index] * source["residueDegrees"][index]
                for index in positions
            )
            != DEGREE
        ):
            raise Row19GeneralMapFailure(
                "denominator prime decomposition is incomplete"
            )
        for index in positions:
            factors[index] -= source["ramificationIndices"][index] * value
    if residual != 1:
        raise Row19GeneralMapFailure("denominator has support outside the factor base")
    result = _reduce(source, factors)
    result["fractionalDenominator"] = divisor
    return result


def reduce_supported_exponents(
    payload: Mapping[str, Any], proof: Mapping[str, Any], exponents: Sequence[int]
) -> dict[str, Any]:
    """Reduce an authenticated nonnegative factor-base exponent tape."""
    return _reduce(_source(payload, proof), exponents)


def combine_supported(
    payload: Mapping[str, Any],
    proof: Mapping[str, Any],
    left: Sequence[int],
    right: Sequence[int],
) -> dict[str, Any]:
    """Combine two supported integral ideals in factor coordinates."""
    left_values = _integers(list(left), COLUMNS, "left factor tape")
    right_values = _integers(list(right), COLUMNS, "right factor tape")
    source = _source(payload, proof)
    result = _reduce(
        source,
        [a + b for a, b in zip(left_values, right_values, strict=True)],
    )
    expected = [
        (a + b) % modulus
        for a, b, modulus in zip(
            _coordinates(source, left_values),
            _coordinates(source, right_values),
            INVARIANTS,
            strict=True,
        )
    ]
    if result["classCoordinates"] != expected:
        raise Row19GeneralMapFailure("combine class law failed")
    return result


def _canonical(value: Any) -> bytes:
    return json.dumps(value, separators=(",", ":"), sort_keys=True).encode("ascii")


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def replay_general_maps(
    payload: Mapping[str, Any], proof: Mapping[str, Any]
) -> dict[str, Any]:
    """Exercise integral/fractional factor, reduce, and combine laws."""
    source = _source(payload, proof)
    identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    identity_result = factor_supported_ideal(payload, proof, identity)
    if identity_result["classCoordinates"] != [0] * len(INVARIANTS):
        raise Row19GeneralMapFailure("identity ideal has a nonzero class")

    for index, ideal in enumerate(source["ideals"]):
        expected = [0] * COLUMNS
        expected[index] = 1
        if _factor(source, ideal) != expected:
            raise Row19GeneralMapFailure("factor-base prime round trip changed")

    generator_results = [
        factor_supported_ideal(payload, proof, ideal) for ideal in source["classIdeals"]
    ]
    for index, result in enumerate(generator_results):
        expected = [int(position == index) for position in range(len(INVARIANTS))]
        if result["classCoordinates"] != expected:
            raise Row19GeneralMapFailure("class generator round trip changed")

    left = generator_results[0]["factorBaseExponents"]
    right = generator_results[-1]["factorBaseExponents"]
    combined = combine_supported(payload, proof, left, right)
    if combined["classCoordinates"] != [1] + [0] * 7 + [1]:
        raise Row19GeneralMapFailure("mixed-order combine result changed")

    # Dividing by a retained rational prime is a nonintegral supported ideal,
    # but its class must be unchanged because the denominator is principal.
    rational_prime = source["rationalPrimes"][0]
    fractional = factor_supported_fractional_ideal(
        payload, proof, source["classIdeals"][0], rational_prime
    )
    if fractional["classCoordinates"] != generator_results[0]["classCoordinates"]:
        raise Row19GeneralMapFailure("principal denominator changed the class")

    outside = max(source["rationalPrimes"]) + 1
    while any(outside % prime == 0 for prime in range(2, int(outside**0.5) + 1)):
        outside += 1
    rejected = 0
    try:
        factor_supported_ideal(
            payload,
            proof,
            [outside, 0, 0, 0, outside, 0, 0, 0, outside],
        )
    except Row19GeneralMapFailure:
        rejected += 1
    try:
        factor_supported_fractional_ideal(payload, proof, identity, outside)
    except Row19GeneralMapFailure:
        rejected += 1
    if rejected != 2:
        raise Row19GeneralMapFailure("out-of-support ideal was accepted")

    body = {
        "schema": "sagejs.pari-class-group/row19-general-ideal-maps-v1",
        "domain": "arbitrary-fractional-cubic-ideal-hnf-supported-on-retained-factor-base",
        "classNumber": "39366",
        "factorBaseSize": str(COLUMNS),
        "relationCount": str(ROWS),
        "invariantFactors": [str(value) for value in INVARIANTS],
        "maps": {"combine": True, "factor": True, "reduce": True},
        "factorBasePrimeRoundTrips": COLUMNS,
        "integralGeneratorRoundTrips": len(generator_results),
        "fractionalPrincipalDenominatorRoundTrips": 1,
        "outOfSupportRejections": rejected,
        "exactRelationWitnessesReplayed": len(generator_results) + 3,
        "qualifiedTiming": False,
    }
    return {**body, "contentSha256": _digest(body)}


__all__ = [
    "Row19GeneralMapFailure",
    "combine_supported",
    "factor_supported_ideal",
    "factor_supported_fractional_ideal",
    "replay_general_maps",
    "reduce_supported_exponents",
]
