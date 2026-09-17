"""Single-call exact unit reconstruction from live real-cubic resident owners.

No logarithm, reconstructed unit, factor coordinate, fixture, or PARI answer is
an input.  The caller supplies the retained principal-relation generators and
the three live integer transformations already produced by the resident HNF
and unit-lattice path.  Exact rational cubic arithmetic then reconstructs the
seven kernel factors and the two selected units.
"""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
import hashlib
import json
from typing import Any, Sequence


DEGREE = 3
RELATIONS = 73
ACTIVE_COLUMNS = 15
KERNEL_COLUMNS = 7
UNIT_RANK = 2


class LiveExactUnitFailure(ValueError):
    """The live relation owners do not define the requested exact units."""


@dataclass(frozen=True)
class LiveExactUnitComponent:
    exact_units: tuple[tuple[int, int, int], tuple[int, int, int]]
    unit_norms: tuple[int, int]
    kernel_factors: tuple[tuple[int, int, int], ...]
    kernel_norms: tuple[int, ...]
    kernel_relation_provenance: tuple[int, ...]
    retained_relation_provenance: tuple[int, ...]
    principal_generators_sha256: str
    transforms_sha256: str
    output_sha256: str


def _integers(values: Sequence[Any], length: int, name: str) -> list[int]:
    if isinstance(values, (str, bytes)) or len(values) != length:
        raise LiveExactUnitFailure(name + " has the wrong exact shape")
    answer: list[int] = []
    for value in values:
        if isinstance(value, bool) or isinstance(value, (bytes, bytearray, float)):
            raise LiveExactUnitFailure(name + " is not integral")
        try:
            integer = int(value)
        except (TypeError, ValueError, OverflowError) as error:
            raise LiveExactUnitFailure(name + " is not integral") from error
        if isinstance(value, str) and str(integer) != value:
            raise LiveExactUnitFailure(name + " is not canonical decimal")
        if not isinstance(value, str) and integer != value:
            raise LiveExactUnitFailure(name + " is not integral")
        answer.append(integer)
    return answer


def _canonical_sha256(value: Any) -> str:
    raw = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    ).encode("ascii")
    return hashlib.sha256(raw).hexdigest()


def _multiply(
    left: Sequence[Any], right: Sequence[Any], tensor: Sequence[int]
) -> tuple[Any, Any, Any]:
    matrix = [sum(left[k] * tensor[9 * k + i] for k in range(3)) for i in range(9)]
    return tuple(
        sum(matrix[3 * column + row] * right[column] for column in range(3))
        for row in range(3)
    )


def _determinant3(matrix: Sequence[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[7] * matrix[5])
        - matrix[3] * (matrix[1] * matrix[8] - matrix[7] * matrix[2])
        + matrix[6] * (matrix[1] * matrix[5] - matrix[4] * matrix[2])
    )


def _norm(element: Sequence[int], tensor: Sequence[int]) -> int:
    matrix = [sum(element[k] * tensor[9 * k + i] for k in range(3)) for i in range(9)]
    return _determinant3(matrix)


def _power(
    element: Sequence[int], exponent: int, tensor: Sequence[int]
) -> tuple[int, int, int]:
    answer = (1, 0, 0)
    base = tuple(element)
    while exponent:
        if exponent & 1:
            answer = _multiply(answer, base, tensor)
        exponent >>= 1
        if exponent:
            base = _multiply(base, base, tensor)
    return answer


def _divide_exact(
    numerator: Sequence[int], denominator: Sequence[int], tensor: Sequence[int]
) -> tuple[int, int, int]:
    matrix = [
        sum(denominator[k] * tensor[9 * k + i] for k in range(3)) for i in range(9)
    ]
    determinant = _determinant3(matrix)
    if determinant == 0:
        raise LiveExactUnitFailure("a principal relation generator product is zero")
    inverse = (
        Fraction(matrix[4] * matrix[8] - matrix[7] * matrix[5], determinant),
        Fraction(matrix[2] * matrix[7] - matrix[1] * matrix[8], determinant),
        Fraction(matrix[1] * matrix[5] - matrix[2] * matrix[4], determinant),
    )
    quotient = _multiply(numerator, inverse, tensor)
    if any(value.denominator != 1 for value in quotient):
        raise LiveExactUnitFailure("a retained relation product is not integral")
    return tuple(int(value) for value in quotient)


def _relation_product(
    generators: Sequence[Sequence[int]], exponents: Sequence[int], tensor: Sequence[int]
) -> tuple[int, int, int]:
    positive = (1, 0, 0)
    negative = (1, 0, 0)
    for generator, exponent in zip(generators, exponents):
        if exponent > 0:
            positive = _multiply(positive, _power(generator, exponent, tensor), tensor)
        elif exponent < 0:
            negative = _multiply(negative, _power(generator, -exponent, tensor), tensor)
    return _divide_exact(positive, negative, tensor)


def reconstruct_live_cubic_units(
    principal_generators: Sequence[Any],
    cleanup_transform: Sequence[Any],
    active_hnf_transform: Sequence[Any],
    unit_kernel_provenance: Sequence[Any],
    multiplication_tensor: Sequence[Any],
) -> LiveExactUnitComponent:
    """Reconstruct both selected units from the live resident exact owners.

    Layouts follow the translated PARI path:

    - generators: 73 consecutive integral-basis triples;
    - cleanup transform: 73 column-major columns of length 73;
    - active HNF transform: 15 column-major columns of length 15;
    - unit provenance: two row-major rows over seven kernel columns;
    - multiplication tensor: three column-major 3 by 3 tables.

    The result is allocated only after every kernel factor and both independent
    reconstruction routes have passed exact checks.
    """
    generator_words = _integers(
        principal_generators, RELATIONS * DEGREE, "principal generators"
    )
    cleanup = _integers(cleanup_transform, RELATIONS * RELATIONS, "cleanup transform")
    active = _integers(
        active_hnf_transform,
        ACTIVE_COLUMNS * ACTIVE_COLUMNS,
        "active HNF transform",
    )
    unit_kernel = _integers(
        unit_kernel_provenance,
        UNIT_RANK * KERNEL_COLUMNS,
        "unit kernel provenance",
    )
    tensor = _integers(multiplication_tensor, DEGREE**3, "multiplication tensor")
    generators = [
        generator_words[DEGREE * relation : DEGREE * (relation + 1)]
        for relation in range(RELATIONS)
    ]
    kernel_relation: list[int] = []
    factors: list[tuple[int, int, int]] = []
    factor_norms: list[int] = []
    for kernel in range(KERNEL_COLUMNS):
        exponents = [
            sum(
                active[ACTIVE_COLUMNS * kernel + column]
                * cleanup[RELATIONS * column + relation]
                for column in range(ACTIVE_COLUMNS)
            )
            for relation in range(RELATIONS)
        ]
        kernel_relation.extend(exponents)
        factor = _relation_product(generators, exponents, tensor)
        norm = _norm(factor, tensor)
        if norm not in (-1, 1):
            raise LiveExactUnitFailure("a kernel relation is not an algebraic unit")
        factors.append(factor)
        factor_norms.append(norm)
    retained: list[int] = []
    units: list[tuple[int, int, int]] = []
    unit_norms: list[int] = []
    for unit in range(UNIT_RANK):
        exponents = [
            sum(
                unit_kernel[KERNEL_COLUMNS * unit + kernel]
                * kernel_relation[RELATIONS * kernel + relation]
                for kernel in range(KERNEL_COLUMNS)
            )
            for relation in range(RELATIONS)
        ]
        # `kernel_relation` is factor-major; retain the composed final row in
        # unit-major, relation-minor order.
        retained.extend(exponents)
        direct = _relation_product(generators, exponents, tensor)
        factored = (1, 0, 0)
        for kernel, exponent in enumerate(
            unit_kernel[KERNEL_COLUMNS * unit : KERNEL_COLUMNS * (unit + 1)]
        ):
            if exponent > 0:
                factored = _multiply(
                    factored, _power(factors[kernel], exponent, tensor), tensor
                )
            elif exponent < 0:
                factored = _divide_exact(
                    factored, _power(factors[kernel], -exponent, tensor), tensor
                )
        if direct != factored:
            raise LiveExactUnitFailure("direct and factored unit products disagree")
        norm = _norm(direct, tensor)
        if norm not in (-1, 1):
            raise LiveExactUnitFailure("a selected relation product is not a unit")
        units.append(direct)
        unit_norms.append(norm)
    generator_digest = _canonical_sha256([str(value) for value in generator_words])
    transforms_digest = _canonical_sha256(
        {
            "cleanup": [str(value) for value in cleanup],
            "active": [str(value) for value in active],
            "unit_kernel": [str(value) for value in unit_kernel],
        }
    )
    output_digest = _canonical_sha256(
        {
            "units": [[str(value) for value in unit] for unit in units],
            "norms": [str(value) for value in unit_norms],
            "retained": [str(value) for value in retained],
        }
    )
    return LiveExactUnitComponent(
        exact_units=(units[0], units[1]),
        unit_norms=(unit_norms[0], unit_norms[1]),
        kernel_factors=tuple(factors),
        kernel_norms=tuple(factor_norms),
        kernel_relation_provenance=tuple(kernel_relation),
        retained_relation_provenance=tuple(retained),
        principal_generators_sha256=generator_digest,
        transforms_sha256=transforms_digest,
        output_sha256=output_digest,
    )


__all__ = [
    "LiveExactUnitComponent",
    "LiveExactUnitFailure",
    "reconstruct_live_cubic_units",
]
