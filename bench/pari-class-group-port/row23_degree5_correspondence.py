"""Expanded row-23 ideal correspondence and degree-five ``idealred`` replay.

This is a source-derived translation of the row-23 path through PARI 2.17.4
``idealred0``/``idealpseudomin`` plus exact ideal arithmetic.  PARI algorithm,
copyright (C) The PARI group; GPL-2.0-or-later, without warranty.
"""

from __future__ import annotations

from fractions import Fraction
import hashlib
from typing import Any, Sequence


SCHEMA = "sagejs.pari-class-group/row23-degree5-correspondence-v1"
CLASS_SCHEMA = "sagejs.pari-class-group/row23-cyclic-class-witness-v1"
FACTOR_SCHEMA = "sagejs.pari-class-group/row23-prepared-factor-base-v1"
DEGREE = 5


class Row23CorrespondenceFailure(ValueError):
    """Authenticated degree-five correspondence failed closed."""


def _ints(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row23CorrespondenceFailure(label + " has the wrong length")
    result = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row23CorrespondenceFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row23CorrespondenceFailure(label + " is not canonical")
        result.append(integer)
    return result


def _digest(values: Sequence[int]) -> str:
    return hashlib.sha256("\n".join(map(str, values)).encode()).hexdigest()


def _multiply(
    table: Sequence[int], left: Sequence[Any], right: Sequence[Any]
) -> list[Any]:
    return [
        sum(
            left[i] * right[j] * table[25 * i + 5 * j + k]
            for i in range(5)
            for j in range(5)
        )
        for k in range(5)
    ]


def _multiplication_matrix(table: Sequence[int], value: Sequence[Any]) -> list[Any]:
    return [
        sum(value[i] * table[25 * i + 5 * column + row] for i in range(5))
        for row in range(5)
        for column in range(5)
    ]


def _solve(matrix: Sequence[Any], rhs: Sequence[Any]) -> list[Fraction]:
    work = [
        [Fraction(matrix[5 * i + j]) for j in range(5)] + [Fraction(rhs[i])]
        for i in range(5)
    ]
    for column in range(5):
        pivot = next((row for row in range(column, 5) if work[row][column]), 5)
        if pivot == 5:
            raise Row23CorrespondenceFailure("singular multiplication matrix")
        work[column], work[pivot] = work[pivot], work[column]
        scale = work[column][column]
        work[column] = [entry / scale for entry in work[column]]
        for row in range(5):
            if row != column:
                scale = work[row][column]
                work[row] = [work[row][j] - scale * work[column][j] for j in range(6)]
    return [work[row][5] for row in range(5)]


def _power(table: Sequence[int], value: Sequence[int], exponent: int) -> list[Fraction]:
    base = [Fraction(entry) for entry in value]
    if exponent < 0:
        base = _solve(_multiplication_matrix(table, base), [1, 0, 0, 0, 0])
        exponent = -exponent
    result = [Fraction(1), Fraction(0), Fraction(0), Fraction(0), Fraction(0)]
    while exponent:
        if exponent & 1:
            result = list(map(Fraction, _multiply(table, result, base)))
        base = list(map(Fraction, _multiply(table, base, base)))
        exponent //= 2
    return result


def _extended_gcd(left: int, right: int) -> tuple[int, int, int]:
    old_r, remainder = abs(left), abs(right)
    old_u, u, old_v, v = 1, 0, 0, 1
    while remainder:
        quotient = old_r // remainder
        old_r, remainder = remainder, old_r - quotient * remainder
        old_u, u = u, old_u - quotient * u
        old_v, v = v, old_v - quotient * v
    return old_u if left >= 0 else -old_u, old_v if right >= 0 else -old_v, old_r


def _add_columns(
    matrix: list[list[int]], first: int, second: int, a: int, b: int, c: int, d: int
) -> None:
    if first == second:
        for row in matrix:
            row[first] *= a
        return
    for row in matrix:
        left, right = row[first], row[second]
        row[first], row[second] = a * left + b * right, c * left + d * right


def _column_hnf(columns: Sequence[Sequence[int]]) -> list[list[int]]:
    """Cohen 2.4.5 column operations, retaining the full-rank five-column tail."""
    count = len(columns)
    work = [[int(columns[column][row]) for column in range(count)] for row in range(5)]
    pivot_column = count
    for row in range(4, -1, -1):
        pivot_column -= 1
        for column in range(pivot_column - 1, -1, -1):
            if not work[row][column]:
                continue
            u, v, divisor = _extended_gcd(work[row][pivot_column], work[row][column])
            if not divisor:
                raise Row23CorrespondenceFailure("zero column-HNF divisor")
            r, s = work[row][pivot_column] // divisor, work[row][column] // divisor
            _add_columns(work, pivot_column, column, u, v, -s, r)
        pivot = work[row][pivot_column]
        if pivot < 0:
            _add_columns(work, pivot_column, pivot_column, -1, 0, -1, 0)
            pivot = -pivot
        if not pivot:
            pivot_column += 1
            continue
        for column in range(pivot_column + 1, count):
            quotient = work[row][column] // pivot
            _add_columns(work, column, pivot_column, 1, -quotient, 0, 1)
    if pivot_column != count - 5:
        raise Row23CorrespondenceFailure("ideal product lost rank")
    return [
        [work[row][column] for row in range(5)] for column in range(pivot_column, count)
    ]


def _ideal_product(
    table: Sequence[int], left: Sequence[Sequence[int]], right: Sequence[Sequence[int]]
) -> list[list[int]]:
    return _column_hnf([_multiply(table, a, b) for a in left for b in right])


def _prime_modulus_hnf(matrix: Sequence[int], prime: int) -> list[int]:
    """PARI's quotient-generator modulus HNF, specialized to degree five."""
    columns = [[matrix[5 * row + column] for row in range(5)] for column in range(5)]
    columns.extend(
        [[prime if row == column else 0 for row in range(5)] for column in range(5)]
    )
    result = _column_hnf(columns)
    return [result[column][row] for row in range(5) for column in range(5)]


def _matrix_product(left: Sequence[int], right: Sequence[int]) -> list[int]:
    return [
        sum(left[5 * row + k] * right[5 * k + column] for k in range(5))
        for row in range(5)
        for column in range(5)
    ]


def _nearest(value: Fraction) -> int:
    if value < 0:
        return -_nearest(-value)
    return (2 * value.numerator + value.denominator) // (2 * value.denominator)


def _gram_schmidt(
    basis: Sequence[Sequence[int]],
) -> tuple[list[list[Fraction]], list[Fraction]]:
    orthogonal: list[list[Fraction]] = []
    mu = [[Fraction(0) for _ in basis] for _ in basis]
    norms: list[Fraction] = []
    for i, vector in enumerate(basis):
        current = list(map(Fraction, vector))
        for j in range(i):
            mu[i][j] = (
                sum(Fraction(vector[k]) * orthogonal[j][k] for k in range(5)) / norms[j]
            )
            current = [current[k] - mu[i][j] * orthogonal[j][k] for k in range(5)]
        orthogonal.append(current)
        norms.append(sum(entry * entry for entry in current))
    return mu, norms


def _lll_transform(matrix: Sequence[int]) -> tuple[list[int], list[int]]:
    """Exact delta=.99 equivalent of the five-column ``ZM_lll(...,LLL_IM)`` path."""
    basis = [[matrix[5 * row + column] for row in range(5)] for column in range(5)]
    transform = [[int(i == j) for i in range(5)] for j in range(5)]
    k = 1
    while k < 5:
        mu, norms = _gram_schmidt(basis)
        for j in range(k - 1, -1, -1):
            quotient = _nearest(mu[k][j])
            if quotient:
                basis[k] = [basis[k][i] - quotient * basis[j][i] for i in range(5)]
                transform[k] = [
                    transform[k][i] - quotient * transform[j][i] for i in range(5)
                ]
                mu, norms = _gram_schmidt(basis)
        if norms[k] >= (Fraction(99, 100) - mu[k][k - 1] ** 2) * norms[k - 1]:
            k += 1
        else:
            basis[k], basis[k - 1] = basis[k - 1], basis[k]
            transform[k], transform[k - 1] = transform[k - 1], transform[k]
            k = max(1, k - 1)
    return [entry for vector in transform for entry in vector], [
        entry for vector in basis for entry in vector
    ]


def compose_row23_degree5_correspondence(
    class_owner: dict[str, Any],
    factor_owner: dict[str, Any],
    prepared: dict[str, Any],
    ancestry: dict[str, str],
) -> dict[str, Any]:
    """Expand the compact class witness and independently execute ``idealred``."""
    if (
        class_owner.get("schema") != CLASS_SCHEMA
        or factor_owner.get("schema") != FACTOR_SCHEMA
    ):
        raise Row23CorrespondenceFailure("wrong upstream owner schema")
    if class_owner.get("ancestry", {}).get("factorOwnerSha256") != ancestry.get(
        "factorOwnerSha256"
    ):
        raise Row23CorrespondenceFailure("class witness is detached from factor owner")
    if class_owner.get("ancestry", {}).get("preparedAuthoritySha256") != ancestry.get(
        "preparedAuthoritySha256"
    ):
        raise Row23CorrespondenceFailure(
            "class witness is detached from prepared owner"
        )
    table = _ints(prepared.get("multiplicationTensor"), 125, "multiplication tensor")
    rounded = _ints(prepared.get("roundedEmbedding"), 25, "rounded embedding")
    witness = class_owner.get("compactPrincipalWitness", {})
    generators = [
        _ints(value, 5, "principal generator")
        for value in witness.get("principalGenerators", [])
    ]
    exponents = _ints(
        witness.get("relationExponents"), len(generators), "principal exponents"
    )
    if len(generators) != 22:
        raise Row23CorrespondenceFailure("compact witness support changed")
    alpha: list[Fraction] = [
        Fraction(1),
        Fraction(0),
        Fraction(0),
        Fraction(0),
        Fraction(0),
    ]
    for generator, exponent in zip(generators, exponents, strict=True):
        alpha = list(
            map(Fraction, _multiply(table, alpha, _power(table, generator, exponent)))
        )
    if any(entry.denominator != 1 for entry in alpha):
        raise Row23CorrespondenceFailure("expanded principal generator is not integral")
    alpha_integer = [entry.numerator for entry in alpha]

    ideal = _ints(
        class_owner.get("generator", {}).get("selectedIdealHnf"), 25, "class ideal"
    )
    ideal_columns = [
        [ideal[5 * row + column] for row in range(5)] for column in range(5)
    ]
    identity = [[int(row == column) for row in range(5)] for column in range(5)]
    powers: list[list[int]] = []
    current = identity
    for _ in range(6):
        current = _ideal_product(table, current, ideal_columns)
        powers.append([current[column][row] for row in range(5) for column in range(5)])
    principal_columns = _column_hnf(
        [
            [
                _multiplication_matrix(table, alpha_integer)[5 * row + column]
                for row in range(5)
            ]
            for column in range(5)
        ]
    )
    principal_hnf = [
        principal_columns[column][row] for row in range(5) for column in range(5)
    ]
    if powers[-1] != principal_hnf:
        raise Row23CorrespondenceFailure("expanded J^6 and (alpha) differ")

    descriptors = factor_owner.get("factorBase", {}).get("descriptors", [])
    if not isinstance(descriptors, list) or not descriptors:
        raise Row23CorrespondenceFailure("missing selected prime descriptor")
    descriptor = _ints(descriptors[0], 33, "selected descriptor")
    if descriptor[:3] != [7, 1, 1]:
        raise Row23CorrespondenceFailure("selected prime descriptor changed")
    # The descriptor stores PARI matrix columns consecutively; the local HNF
    # helper consumes row-major matrices.
    quotient_columns = descriptor[8:33]
    quotient_row_major = [
        quotient_columns[5 * column + row] for row in range(5) for column in range(5)
    ]
    inverse_scaled = _prime_modulus_hnf(quotient_row_major, 7)
    inverse_columns = [
        [inverse_scaled[5 * row + column] for row in range(5)] for column in range(5)
    ]
    inverse_product_columns = _ideal_product(table, ideal_columns, inverse_columns)
    inverse_product = [
        inverse_product_columns[column][row] for row in range(5) for column in range(5)
    ]
    seven_identity = [
        7 if row == column else 0 for row in range(5) for column in range(5)
    ]
    if inverse_product != seven_identity:
        raise Row23CorrespondenceFailure(
            "scaled ideal inverse failed exact product replay"
        )
    gj = _matrix_product(rounded, inverse_scaled)
    lll_transform, reduced_embedding = _lll_transform(gj)
    first_coefficients = lll_transform[:5]
    pseudomin = [
        sum(
            inverse_columns[column][row] * first_coefficients[column]
            for column in range(5)
        )
        for row in range(5)
    ]
    if pseudomin != [7, 0, 0, 0, 0]:
        raise Row23CorrespondenceFailure("degree-five idealpseudomin is not scalar 7")
    # idealred0's scalar branch returns I itself, before multiplication/HNF.
    reduced = ideal[:]

    return {
        "schema": SCHEMA,
        "ancestry": dict(ancestry),
        "expandedPrincipalWitness": {
            "alpha": list(map(str, alpha_integer)),
            "alphaSha256": _digest(alpha_integer),
            "powerIdealHnfs": [list(map(str, value)) for value in powers],
            "principalIdealHnf": list(map(str, principal_hnf)),
            "identity": "J^6=(alpha)",
            "degreeFiveIdealProductReplayComplete": True,
            "expandedPrincipalGeneratorMaterialized": True,
        },
        "idealred": {
            "sourcePath": "idealred0 -> idealpseudomin -> ZM_lll(delta=0.99,LLL_IM)",
            "inverseScaledIdealHnf": list(map(str, inverse_scaled)),
            "scaledInverseProductHnf": list(map(str, inverse_product)),
            "roundedEmbeddingTimesInverseIdeal": list(map(str, gj)),
            "lllTransformRows": list(map(str, lll_transform)),
            "lllReducedBasisRows": list(map(str, reduced_embedding)),
            "firstLllCoefficientColumn": list(map(str, first_coefficients)),
            "pseudomin": list(map(str, pseudomin)),
            "scalarShortCircuit": True,
            "reducedGeneratorIdealHnf": list(map(str, reduced)),
            "degreeFiveIdealredExecuted": True,
            "reducedRepresentativePublished": True,
        },
        "completion": {
            "expandedPrincipalIdentityComplete": True,
            "degreeFiveIdealProductReplayComplete": True,
            "degreeFiveIdealredComplete": True,
            "reducedClassGeneratorComplete": True,
            "postcomputeOracleConsumed": False,
        },
    }


__all__ = [
    "Row23CorrespondenceFailure",
    "SCHEMA",
    "compose_row23_degree5_correspondence",
]
