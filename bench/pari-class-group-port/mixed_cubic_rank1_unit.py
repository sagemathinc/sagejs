"""Source-derived rank-one C5/C6 unit reconstruction for mixed cubics."""

from __future__ import annotations

from fractions import Fraction
from math import gcd
from typing import Any

from .panel1_exact_unit_authority import _determinant3, _multiply, _norm, _power


SCHEMA = "sagejs.pari-class-group/mixed-cubic-rank1-unit-v1"
PRESENTATION_SCHEMA = "sagejs.pari-class-group/mixed-cubic-presentation-v1"
SUPPORTED_FIELDS = {"3.1.1002718428660.2", "3.1.1005907102200.3"}


class MixedCubicRank1UnitFailure(ValueError):
    """Rank-one logarithmic cleanup or exact factorback failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise MixedCubicRank1UnitFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise MixedCubicRank1UnitFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise MixedCubicRank1UnitFailure(label + " is not canonical")
        result.append(integer)
    return result


def _strings(values: list[int]) -> list[str]:
    return [str(value) for value in values]


def _dyadic(triple: list[int]) -> Fraction:
    mantissa, precision, exponent = triple
    if precision == -1:
        if exponent != 0:
            raise MixedCubicRank1UnitFailure("noncanonical exact packed real")
        return Fraction(mantissa)
    if mantissa == 0 and precision == 0:
        return Fraction(0)
    if (
        precision not in (64, 128, 192)
        or mantissa == 0
        or abs(mantissa).bit_length() != precision
    ):
        raise MixedCubicRank1UnitFailure("unsupported packed-real precision")
    shift = exponent - precision + 1
    if shift >= 0:
        return Fraction(mantissa << shift)
    return Fraction(mantissa, 1 << -shift)


def _nearest(value: Fraction) -> int:
    sign = -1 if value < 0 else 1
    numerator = abs(value.numerator)
    quotient, remainder = divmod(numerator, value.denominator)
    if 2 * remainder >= value.denominator:
        quotient += 1
    return sign * quotient


def _bezout(values: list[int]) -> tuple[int, list[int]]:
    coefficients = [0] * len(values)
    current = 0
    for index, value in enumerate(values):
        if value == 0:
            continue
        old_r, r = current, value
        old_s, s = 1, 0
        old_t, t = 0, 1
        while r:
            quotient = old_r // r
            old_r, r = r, old_r - quotient * r
            old_s, s = s, old_s - quotient * s
            old_t, t = t, old_t - quotient * t
        if old_r < 0:
            old_r, old_s, old_t = -old_r, -old_s, -old_t
        coefficients = [old_s * entry for entry in coefficients]
        coefficients[index] += old_t
        current = old_r
    return current, coefficients


def _divide_exact(
    numerator: tuple[int, int, int],
    denominator: tuple[int, int, int],
    tensor: list[int],
) -> tuple[int, int, int]:
    matrix = [
        sum(denominator[k] * tensor[9 * k + index] for k in range(3))
        for index in range(9)
    ]
    determinant = _determinant3(matrix)
    if determinant == 0:
        raise MixedCubicRank1UnitFailure("zero relation denominator")
    inverse = (
        Fraction(matrix[4] * matrix[8] - matrix[7] * matrix[5], determinant),
        Fraction(matrix[2] * matrix[7] - matrix[1] * matrix[8], determinant),
        Fraction(matrix[1] * matrix[5] - matrix[2] * matrix[4], determinant),
    )
    quotient = _multiply(numerator, inverse, tensor)
    if any(value.denominator != 1 for value in quotient):
        raise MixedCubicRank1UnitFailure("raw relation factorback is not integral")
    return tuple(value.numerator for value in quotient)


def _factorback(
    generators: list[list[int]], exponents: list[int], tensor: list[int]
) -> tuple[int, int, int]:
    positive = (1, 0, 0)
    negative = (1, 0, 0)
    for generator, exponent in zip(generators, exponents, strict=True):
        if exponent > 0:
            positive = _multiply(positive, _power(generator, exponent, tensor), tensor)
        elif exponent < 0:
            negative = _multiply(negative, _power(generator, -exponent, tensor), tensor)
    return _divide_exact(positive, negative, tensor)


def compose_mixed_cubic_rank1_unit(
    owner: dict[str, Any], ancestry: dict[str, Any]
) -> dict[str, Any]:
    """Derive a primitive rank-one log transform and materialize its unit."""
    field_id = owner.get("field", {}).get("id")
    if owner.get("schema") != PRESENTATION_SCHEMA or field_id not in SUPPORTED_FIELDS:
        raise MixedCubicRank1UnitFailure("wrong mixed-cubic presentation owner")
    dimensions = owner.get("dimensions", {})
    relations = int(dimensions.get("relationCount", 0))
    factors = int(dimensions.get("factorBaseSize", 0))
    kernel = int(dimensions.get("kernelRank", 0))
    if relations - factors != kernel or dimensions.get("unitRank") != 1:
        raise MixedCubicRank1UnitFailure("wrong rank-one presentation dimensions")
    presentation = owner.get("presentation", {})
    logs = _integers(presentation.get("kernelLogs"), 14 * kernel, "kernel logs")
    regulator_triple = _integers(
        presentation.get("packedRegulator"), 3, "packed regulator"
    )
    regulator = _dyadic(regulator_triple)
    if regulator <= 0:
        raise MixedCubicRank1UnitFailure("regulator is not positive")
    ratios: list[int] = []
    residuals: list[Fraction] = []
    for column in range(kernel):
        real_log = _dyadic(logs[14 * column + 1 : 14 * column + 4])
        ratio = _nearest(real_log / regulator)
        residual = real_log - ratio * regulator
        # The retained 192-bit computation leaves roughly 180 good absolute
        # bits here. This exact dyadic inequality rejects a loose rounding.
        if abs(residual) >= Fraction(1, 1 << 128):
            raise MixedCubicRank1UnitFailure(
                "kernel log is not an integral regulator multiple"
            )
        ratios.append(ratio)
        residuals.append(residual)
    divisor, transform = _bezout(ratios)
    if divisor != 1 or sum(a * b for a, b in zip(ratios, transform, strict=True)) != 1:
        raise MixedCubicRank1UnitFailure("kernel log multiples are not primitive")
    raw_to_kernel = _integers(
        presentation.get("rawToKernel"), relations * kernel, "raw-to-kernel map"
    )
    raw = [
        sum(
            raw_to_kernel[column * relations + row] * transform[column]
            for column in range(kernel)
        )
        for row in range(relations)
    ]
    relation_matrix = _integers(
        owner.get("relations", {}).get("matrix"), factors * relations, "relations"
    )
    if any(
        sum(
            relation_matrix[column * factors + row] * raw[column]
            for column in range(relations)
        )
        for row in range(factors)
    ):
        raise MixedCubicRank1UnitFailure(
            "raw unit provenance is not a relation dependency"
        )
    tensor = _integers(owner.get("field", {}).get("multiplicationTensor"), 27, "tensor")
    flat_generators = _integers(
        owner.get("relations", {}).get("principalGenerators"),
        3 * relations,
        "generators",
    )
    generators = [
        flat_generators[3 * column : 3 * column + 3] for column in range(relations)
    ]
    unit = _factorback(generators, raw, tensor)
    norm = _norm(unit, tensor)
    if abs(norm) != 1:
        raise MixedCubicRank1UnitFailure("factorback result is not a unit")
    return {
        "schema": SCHEMA,
        "fieldId": field_id,
        "ancestry": dict(ancestry),
        "cleanarch": {
            "kernelLogMultiples": _strings(ratios),
            "bezoutTransform": _strings(transform),
            "gcd": str(divisor),
            "residualBound": "2^-128",
            "allResidualsCertified": all(
                abs(value) < Fraction(1, 1 << 128) for value in residuals
            ),
            "primitiveRegulatorMultiple": "1",
        },
        "factorback": {
            "rawRelationCoefficients": _strings(raw),
            "relationDependencyVerified": True,
            "exactUnit": _strings(list(unit)),
            "unitNorm": str(norm),
            "exactUnitBits": [abs(value).bit_length() for value in unit],
        },
        "outcome": {
            "status": "success",
            "precisionBits": 192,
            "precisionRetry": False,
            "fundamentalUnitDerived": True,
            "usedFrozenFundamentalUnit": False,
        },
    }


__all__ = [
    "MixedCubicRank1UnitFailure",
    "SCHEMA",
    "compose_mixed_cubic_rank1_unit",
]
