"""Native factor/reduce/combine maps for supported row-21 ideals.

An input is an arbitrary integral degree-five ideal HNF, not a caller-supplied
factor tape.  The native factor boundary computes its determinant and uses the
prepared PARI-derived prime-ideal valuation translation to recover every
valuation.  It accepts only when those valuations exhaust the norm.  Positive
rational denominators are handled by subtracting the complete decomposition
of their principal ideals.  Thus ideals outside the retained factor base fail
closed.

PARI 2.17.4 valuation algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import json
from typing import Any

from sagejs.native import IntegerBuffer, native

from .valuation import pari_prepared_hnf_valuation


DEGREE = 5
COLUMNS = 24
RELATIONS = 32


class Row21NativeMapFailure(ValueError):
    """An input or retained owner failed the supported-ideal map contract."""


@native
def _row21_bareiss_determinant(matrix: IntegerBuffer, work: IntegerBuffer) -> int:
    """Exact determinant of one row-major 5 by 5 matrix."""
    if len(matrix) < 25 or len(work) < 25:
        raise ValueError("short row21 determinant storage")
    for i in range(25):
        work[i] = matrix[i]
    sign = 1
    previous = 1
    for column in range(4):
        pivot_row = column
        while pivot_row < 5 and work[pivot_row * 5 + column] == 0:
            pivot_row += 1
        if pivot_row == 5:
            return 0
        if pivot_row != column:
            for j in range(5):
                temporary = work[column * 5 + j]
                work[column * 5 + j] = work[pivot_row * 5 + j]
                work[pivot_row * 5 + j] = temporary
            sign = -sign
        pivot = work[column * 5 + column]
        for row in range(column + 1, 5):
            for j in range(column + 1, 5):
                numerator = (
                    work[row * 5 + j] * pivot
                    - work[row * 5 + column] * work[column * 5 + j]
                )
                if column != 0:
                    if numerator % previous != 0:
                        raise ValueError("row21 Bareiss division was not exact")
                    numerator //= previous
                work[row * 5 + j] = numerator
            work[row * 5 + column] = 0
        previous = pivot
    return sign * work[24]


@native
def pari_row21_factor_supported_hnf(
    ideal: IntegerBuffer,
    descriptor_primes: IntegerBuffer,
    descriptor_e: IntegerBuffer,
    descriptor_f: IntegerBuffer,
    descriptor_inert: IntegerBuffer,
    descriptor_tau: IntegerBuffer,
    group_primes: IntegerBuffer,
    group_offsets: IntegerBuffer,
    group_counts: IntegerBuffer,
    exponents: IntegerBuffer,
    determinant_work: IntegerBuffer,
    tau: IntegerBuffer,
    primitive: IntegerBuffer,
    columns: IntegerBuffer,
    values: IntegerBuffer,
    temporary: IntegerBuffer,
    state: IntegerBuffer,
    descriptor_count: int,
    group_count: int,
) -> int:
    """Factor one integral HNF on the retained row-21 prime-ideal base.

    `state=[status,abs_norm,residual,reconstructed_norm,groups_used]`.
    Status 0 is success; 1 is the zero ideal, 2 outside rational support,
    3 an incomplete prime group, and 4 an inconsistent retained norm.
    """
    if (
        descriptor_count != 24
        or group_count < 1
        or group_count > 24
        or len(ideal) < 25
        or len(descriptor_primes) < descriptor_count
        or len(descriptor_e) < descriptor_count
        or len(descriptor_f) < descriptor_count
        or len(descriptor_inert) < descriptor_count
        or len(descriptor_tau) < 25 * descriptor_count
        or len(group_primes) < group_count
        or len(group_offsets) < group_count
        or len(group_counts) < group_count
        or len(exponents) < descriptor_count
        or len(determinant_work) < 25
        or len(tau) < 25
        or len(primitive) < 25
        or len(columns) < 25
        or len(values) < 5
        or len(temporary) < 5
        or len(state) < 5
    ):
        raise ValueError("invalid row21 supported-factor storage")
    for i in range(descriptor_count):
        exponents[i] = 0
    determinant = _row21_bareiss_determinant(ideal, determinant_work)
    if determinant < 0:
        determinant = -determinant
    state[0] = 1
    state[1] = determinant
    state[2] = determinant
    state[3] = 1
    state[4] = 0
    if determinant == 0:
        return 1
    residual = determinant
    for group in range(group_count):
        prime = group_primes[group]
        norm_valuation = 0
        while residual % prime == 0:
            residual //= prime
            norm_valuation += 1
        if norm_valuation == 0:
            continue
        offset = group_offsets[group]
        count = group_counts[group]
        if offset < 0 or count < 1 or offset + count > descriptor_count:
            raise ValueError("invalid row21 retained prime group")
        weighted = 0
        for local in range(count):
            index = offset + local
            if descriptor_primes[index] != prime:
                raise ValueError("row21 descriptor group changed")
            for cell in range(25):
                tau[cell] = descriptor_tau[25 * index + cell]
            valuation = pari_prepared_hnf_valuation(
                ideal,
                tau,
                primitive,
                columns,
                values,
                temporary,
                5,
                prime,
                descriptor_e[index],
                descriptor_f[index],
                descriptor_inert[index],
            )
            if valuation < 0:
                state[0] = 3
                return 3
            exponents[index] = valuation
            weighted += descriptor_f[index] * valuation
        if weighted != norm_valuation:
            state[0] = 3
            state[2] = residual
            return 3
        state[4] += 1
    state[2] = residual
    if residual != 1:
        state[0] = 2
        return 2
    reconstructed = 1
    for index in range(descriptor_count):
        prime = descriptor_primes[index]
        for repetition in range(descriptor_f[index] * exponents[index]):
            reconstructed *= prime
    state[3] = reconstructed
    if reconstructed != determinant:
        state[0] = 4
        return 4
    state[0] = 0
    return 0


def _integers(value: Any, length: int, name: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row21NativeMapFailure(name + " has the wrong shape")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row21NativeMapFailure(name + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row21NativeMapFailure(name + " is not canonical integer data")
        answer.append(integer)
    return answer


def _source(payload: Mapping[str, Any]) -> dict[str, Any]:
    if (
        payload.get("field", {}).get("degree") != "5"
        or payload.get("classGroup", {}).get("classNumber") != "1"
    ):
        raise Row21NativeMapFailure("wrong row-21 result")
    factor = payload.get("factorBase", {}).get("value", {}).get("factorBase", {})
    descriptors = factor.get("descriptors")
    if not isinstance(descriptors, list) or len(descriptors) != COLUMNS:
        raise Row21NativeMapFailure("factor-base descriptors changed")
    parsed = [_integers(record, 33, "factor-base descriptor") for record in descriptors]
    ideals = [
        _integers(ideal, 25, "factor-base ideal") for ideal in factor.get("ideals", [])
    ]
    if len(ideals) != COLUMNS:
        raise Row21NativeMapFailure("factor-base ideals changed")
    descriptor_primes = [record[0] for record in parsed]
    descriptor_e = [record[1] for record in parsed]
    descriptor_f = [record[2] for record in parsed]
    descriptor_inert = [
        int(all(entry == 0 for entry in record[3:8])) for record in parsed
    ]
    descriptor_tau = []
    for record in parsed:
        column_major = record[8:33]
        descriptor_tau.extend(
            column_major[column * 5 + row] for row in range(5) for column in range(5)
        )
    group_primes = []
    group_offsets = []
    group_counts = []
    position = 0
    while position < COLUMNS:
        prime = descriptor_primes[position]
        end = position + 1
        while end < COLUMNS and descriptor_primes[end] == prime:
            end += 1
        group_primes.append(prime)
        group_offsets.append(position)
        group_counts.append(end - position)
        position = end
    relations = payload.get("relations", {})
    records = _integers(
        relations.get("recordsColumnMajor"), RELATIONS * COLUMNS, "relation matrix"
    )
    generators = _integers(
        relations.get("generators"), RELATIONS * DEGREE, "principal generators"
    )
    right_inverse = _integers(
        payload.get("classGroup", {}).get("presentation", {}).get("rightInverse"),
        RELATIONS * COLUMNS,
        "right inverse",
    )
    for row in range(COLUMNS):
        for column in range(COLUMNS):
            value = sum(
                records[COLUMNS * relation + row]
                * right_inverse[COLUMNS * relation + column]
                for relation in range(RELATIONS)
            )
            if value != int(row == column):
                raise Row21NativeMapFailure("relation right inverse failed")
    return {
        "descriptorPrimes": descriptor_primes,
        "descriptorE": descriptor_e,
        "descriptorF": descriptor_f,
        "descriptorInert": descriptor_inert,
        "descriptorTau": descriptor_tau,
        "groupPrimes": group_primes,
        "groupOffsets": group_offsets,
        "groupCounts": group_counts,
        "ideals": ideals,
        "records": records,
        "generators": generators,
        "rightInverse": right_inverse,
    }


def _factor(source: Mapping[str, Any], ideal_hnf: Sequence[Any]) -> list[int]:
    ideal = _integers(list(ideal_hnf), 25, "input ideal")
    exponents = [0] * COLUMNS
    state = [0] * 5
    status = pari_row21_factor_supported_hnf(
        ideal,
        source["descriptorPrimes"],
        source["descriptorE"],
        source["descriptorF"],
        source["descriptorInert"],
        source["descriptorTau"],
        source["groupPrimes"],
        source["groupOffsets"],
        source["groupCounts"],
        exponents,
        [0] * 25,
        [0] * 25,
        [0] * 25,
        [0] * 25,
        [0] * 5,
        [0] * 5,
        state,
        COLUMNS,
        len(source["groupPrimes"]),
    )
    if status != 0:
        raise Row21NativeMapFailure(
            "ideal is outside the retained factor-base support " + str(state)
        )
    return exponents


def _reduce(source: Mapping[str, Any], exponents: Sequence[Any]) -> dict[str, Any]:
    values = _integers(list(exponents), COLUMNS, "factor exponent tape")
    coefficients = [
        sum(
            source["rightInverse"][COLUMNS * relation + row] * values[row]
            for row in range(COLUMNS)
        )
        for relation in range(RELATIONS)
    ]
    replay = [
        sum(
            source["records"][COLUMNS * relation + row] * coefficients[relation]
            for relation in range(RELATIONS)
        )
        for row in range(COLUMNS)
    ]
    if replay != values:
        raise Row21NativeMapFailure("principal-relation witness failed exact replay")
    support = [index for index, value in enumerate(coefficients) if value]
    return {
        "classCoordinates": [],
        "factorBaseExponents": values,
        "principalRelationCoefficients": coefficients,
        "principalGeneratorRelationIndices": support,
        "principalGeneratorExponents": [coefficients[index] for index in support],
        "principalGenerators": [
            source["generators"][5 * index : 5 * (index + 1)] for index in support
        ],
    }


def factor_supported_ideal(
    payload: Mapping[str, Any], ideal_hnf: Sequence[Any]
) -> dict[str, Any]:
    """Factor and reduce any integral ideal supported on the retained base."""
    source = _source(payload)
    return _reduce(source, _factor(source, ideal_hnf))


def factor_supported_fractional_ideal(
    payload: Mapping[str, Any],
    numerator_hnf: Sequence[Any],
    denominator: Any,
) -> dict[str, Any]:
    """Factor `numerator_hnf / denominator` on the retained prime base."""
    if isinstance(denominator, bool) or not isinstance(denominator, (str, int)):
        raise Row21NativeMapFailure("fractional denominator is not integer data")
    divisor = int(denominator)
    if str(divisor) != str(denominator) or divisor <= 0:
        raise Row21NativeMapFailure(
            "fractional denominator is not positive canonical data"
        )
    source = _source(payload)
    factors = _factor(source, numerator_hnf)
    residual = divisor
    for group, prime in enumerate(source["groupPrimes"]):
        value = 0
        while residual % prime == 0:
            residual //= prime
            value += 1
        if value == 0:
            continue
        offset = source["groupOffsets"][group]
        count = source["groupCounts"][group]
        if (
            sum(
                source["descriptorE"][index] * source["descriptorF"][index]
                for index in range(offset, offset + count)
            )
            != DEGREE
        ):
            raise Row21NativeMapFailure("denominator prime decomposition is incomplete")
        for index in range(offset, offset + count):
            factors[index] -= source["descriptorE"][index] * value
    if residual != 1:
        raise Row21NativeMapFailure("denominator lies outside retained support")
    result = _reduce(source, factors)
    result["fractionalDenominator"] = divisor
    return result


def reduce_supported_exponents(
    payload: Mapping[str, Any], exponents: Sequence[Any]
) -> dict[str, Any]:
    """Reduce one authenticated signed factor-base exponent tape."""
    return _reduce(_source(payload), exponents)


def combine_supported(
    payload: Mapping[str, Any], left: Sequence[Any], right: Sequence[Any]
) -> dict[str, Any]:
    """Combine two supported fractional ideals in factor coordinates."""
    left_values = _integers(list(left), COLUMNS, "left factor tape")
    right_values = _integers(list(right), COLUMNS, "right factor tape")
    return _reduce(
        _source(payload),
        [a + b for a, b in zip(left_values, right_values, strict=True)],
    )


def _digest(value: Any) -> str:
    raw = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("ascii")
    return hashlib.sha256(raw).hexdigest()


def replay_native_supported_maps(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Exercise arbitrary HNF factorization, fractional reduction and combine."""
    source = _source(payload)
    identity = [int(row == column) for row in range(5) for column in range(5)]
    identity_result = factor_supported_ideal(payload, identity)
    if identity_result["factorBaseExponents"] != [0] * COLUMNS:
        raise Row21NativeMapFailure("identity ideal factorization changed")
    round_trips = []
    for index, ideal in enumerate(source["ideals"]):
        result = factor_supported_ideal(payload, ideal)
        expected = [int(position == index) for position in range(COLUMNS)]
        if result["factorBaseExponents"] != expected:
            raise Row21NativeMapFailure("factor-base prime round trip changed")
        round_trips.append(result)
    combined = combine_supported(
        payload,
        round_trips[0]["factorBaseExponents"],
        round_trips[-1]["factorBaseExponents"],
    )
    expected_combined = [int(index in (0, COLUMNS - 1)) for index in range(COLUMNS)]
    if combined["factorBaseExponents"] != expected_combined:
        raise Row21NativeMapFailure("combine law changed")
    fractional_checks = 0
    for group, prime in enumerate(source["groupPrimes"]):
        offset = source["groupOffsets"][group]
        count = source["groupCounts"][group]
        if (
            sum(
                source["descriptorE"][index] * source["descriptorF"][index]
                for index in range(offset, offset + count)
            )
            == DEGREE
        ):
            fractional = factor_supported_fractional_ideal(payload, identity, prime)
            expected = [0] * COLUMNS
            for index in range(offset, offset + count):
                expected[index] = -source["descriptorE"][index]
            if fractional["factorBaseExponents"] != expected:
                raise Row21NativeMapFailure("fractional denominator law changed")
            fractional_checks = 1
            break
    outside = max(source["groupPrimes"]) + 1
    while any(outside % prime == 0 for prime in range(2, int(outside**0.5) + 1)):
        outside += 1
    rejected = 0
    try:
        factor_supported_ideal(
            payload,
            [
                outside if row == column else 0
                for row in range(5)
                for column in range(5)
            ],
        )
    except Row21NativeMapFailure:
        rejected += 1
    try:
        factor_supported_fractional_ideal(payload, identity, outside)
    except Row21NativeMapFailure:
        rejected += 1
    if rejected != 2:
        raise Row21NativeMapFailure("out-of-support input was accepted")
    body = {
        "schema": "sagejs.pari-class-group/row21-native-supported-ideal-maps-v1",
        "domain": "arbitrary-fractional-quintic-ideal-hnf-supported-on-retained-factor-base",
        "classNumber": "1",
        "factorBaseSize": str(COLUMNS),
        "relationCount": str(RELATIONS),
        "nativeFactorBoundary": True,
        "maps": {"combine": True, "factor": True, "reduce": True},
        "factorBasePrimeRoundTrips": COLUMNS,
        "fractionalPrincipalDenominatorRoundTrips": fractional_checks,
        "outOfSupportRejections": rejected,
        "qualifiedTiming": False,
    }
    return {**body, "contentSha256": _digest(body)}


__all__ = [
    "Row21NativeMapFailure",
    "combine_supported",
    "factor_supported_fractional_ideal",
    "factor_supported_ideal",
    "pari_row21_factor_supported_hnf",
    "reduce_supported_exponents",
    "replay_native_supported_maps",
]
