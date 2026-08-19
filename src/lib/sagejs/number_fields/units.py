"""Bounded, proof-status-aware unit computations.

This module provides complete algorithms for fields with a real embedding and
unit rank zero, for imaginary quadratic roots of unity, and for real quadratic
fundamental units.  Higher-rank enumeration is deliberately returned as a
subgroup search: finding independent units is not a saturation proof.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
from sagejs.number_fields.embeddings import (
    archimedean_data,
    exact_norm_is_unit,
    exact_signature,
)


def _isqrt(value: int) -> int:
    if value < 0:
        raise ValueError("integer square root needs a nonnegative value")
    if value < 2:
        return value
    estimate = 1 << ((value.bit_length() + 1) // 2)
    while True:
        next_estimate = (estimate + value // estimate) // 2
        if next_estimate >= estimate:
            return estimate
        estimate = next_estimate


class RootsOfUnityResult:
    """A finite torsion result with explicit completeness evidence."""

    def __init__(
        self,
        elements: list[Any],
        generator: Any,
        order: int,
        complete: bool,
        reason: str,
    ) -> None:
        if order < 1:
            raise ValueError("a roots-of-unity order must be positive")
        self.elements = tuple(elements)
        self.generator = generator
        self.order = order
        self.complete = complete
        self.reason = reason
        self.proof_status = "exact" if complete else "incomplete"
        if complete and len(self.elements) != order:
            raise ValueError("a complete torsion list must have the claimed order")

    def verify(self) -> bool:
        expected = _powers(self.generator, self.order)
        if len(_unique(expected)) != self.order:
            return False
        if len(self.elements) != self.order:
            return False
        return all(
            self.elements[index] == expected[index] for index in range(self.order)
        )

    def __repr__(self) -> str:
        label = "complete" if self.complete else "incomplete"
        return "Roots of unity of known order " + str(self.order) + " (" + label + ")"


class UnitCertificate:
    """Exact order-membership and norm evidence for one unit."""

    def __init__(self, unit: Any, norm: int, integral: bool, verified: bool) -> None:
        self.unit = unit
        self.norm = norm
        self.integral = integral
        self.verified = verified
        self.proof_status = "exact" if verified else "failed"

    def verify(self, field: Any) -> bool:
        answer, norm = exact_norm_is_unit(field, self.unit)
        return answer and norm == self.norm and self.unit in field.maximal_order()


class RegulatorResult:
    """A regulator approximation tied to the subgroup used to compute it."""

    def __init__(
        self,
        value: float,
        precision: int,
        subgroup_complete: bool,
        unit_rank: int,
    ) -> None:
        self.value = value
        self.requested_precision = precision
        self.effective_precision_bits = min(53, precision)
        self.precision = self.effective_precision_bits
        self.unit_rank = unit_rank
        self.subgroup_complete = subgroup_complete
        self.status = "numerical-approximation"
        self.proof_status = (
            "complete-subgroup-numerical-regulator"
            if subgroup_complete
            else "incomplete-subgroup-numerical-regulator"
        )

    def __repr__(self) -> str:
        return str(self.value) + " (" + self.proof_status + ")"


class UnitCompletionCertificate:
    """Replay interface for a proof that a unit subgroup is saturated."""

    def __init__(self, kind: str) -> None:
        self.kind = kind
        self.proof_status = "exact"

    def verify(self, result: UnitSubgroupResult) -> bool:
        if self.kind == "rank-zero":
            r1, r2 = exact_signature(result.field)
            return (
                r1 + r2 - 1 == 0
                and result.unit_rank == 0
                and len(result.generators) == 0
                and len(result.certificates) == 0
                and result.torsion.complete
                and result.torsion.verify()
            )
        if self.kind == "real-quadratic-minimal-pell":
            if exact_signature(result.field) != (2, 0):
                return False
            try:
                unit, norm, checked = _real_quadratic_unit(
                    result.field, result.search_bound
                )
            except ValueError:
                return False
            return (
                result.unit_rank == 1
                and len(result.generators) == 1
                and len(result.certificates) == 1
                and checked == result.search_bound
                and unit == result.generators[0]
                and norm == result.certificates[0].norm
                and result.certificates[0].verify(result.field)
                and result.torsion.complete
                and result.torsion.verify()
            )
        return False


class UnitSubgroupResult:
    """Torsion plus free generators, never silently promoted to the full group."""

    def __init__(
        self,
        field: Any,
        torsion: RootsOfUnityResult,
        generators: list[Any],
        certificates: list[UnitCertificate],
        unit_rank: int,
        complete: bool,
        reason: str,
        search_bound: int,
        candidates_checked: int,
        completion_certificate: UnitCompletionCertificate | None = None,
    ) -> None:
        self.field = field
        self.torsion = torsion
        self.generators = tuple(generators)
        self.certificates = tuple(certificates)
        self.unit_rank = unit_rank
        self.complete = complete
        self.reason = reason
        self.search_bound = search_bound
        self.candidates_checked = candidates_checked
        self.completion_certificate = completion_certificate
        self.proof_status = "exact" if complete else "incomplete"
        self.index_bound = 1 if complete else None
        if complete and len(self.generators) != unit_rank:
            raise ValueError("a complete unit result needs one generator per free rank")
        if complete and not torsion.complete:
            raise ValueError("a complete unit result needs complete torsion")
        if complete and completion_certificate is None:
            raise ValueError("a complete unit result needs a saturation certificate")

    def regulator(self, prec: int = 53) -> RegulatorResult:
        return subgroup_regulator(self, prec)

    def verify_completion(self) -> bool:
        return (
            self.complete
            and self.completion_certificate is not None
            and self.completion_certificate.verify(self)
        )

    def __repr__(self) -> str:
        noun = "Unit group" if self.complete else "Unit subgroup"
        return (
            noun
            + " with torsion order "
            + str(self.torsion.order)
            + " and "
            + str(len(self.generators))
            + " free generators ("
            + self.proof_status
            + ")"
        )


def _unique(values: tuple[Any, ...] | list[Any]) -> list[Any]:
    answer = []
    for value in values:
        if not any(value == known for known in answer):
            answer.append(value)
    return answer


def _rational_parts(value: Any) -> tuple[int, int]:
    return (int(value._numerator), int(value._denominator))


def _rational_square_root(value: Any) -> Any:
    numerator, denominator = _rational_parts(value)
    if numerator < 0:
        raise ValueError("a rational square root needs a nonnegative value")
    numerator_root = _isqrt(numerator)
    denominator_root = _isqrt(denominator)
    if numerator_root * numerator_root != numerator:
        raise ArithmeticError("a required rational numerator is not a square")
    if denominator_root * denominator_root != denominator:
        raise ArithmeticError("a required rational denominator is not a square")
    return sage.QQ(numerator_root) / sage.QQ(denominator_root)


def _quadratic_square_root_element(field: Any) -> tuple[int, Any]:
    """Return squarefree `d` and the field element `sqrt(d)`."""
    if field.degree() != 2:
        raise ValueError("quadratic data requires a degree-two field")
    if getattr(field, "_kind", None) == "QuadraticField":
        squarefree = int(field._squarefree_radicand)
        square_root = field.gen() / field._root_scale
        if square_root * square_root != field(squarefree):
            raise ArithmeticError("special quadratic square-root transport failed")
        return (squarefree, square_root)
    discriminant = int(field.discriminant())
    squarefree = discriminant if discriminant % 4 == 1 else discriminant // 4
    coefficients = list(field._defining_coefficients)
    constant = coefficients[0]
    linear = coefficients[1]
    polynomial_discriminant = linear * linear - 4 * constant
    ratio = polynomial_discriminant / squarefree
    scale = _rational_square_root(ratio)
    square_root = (2 * field.gen() + field(linear)) / scale
    if square_root * square_root != field(squarefree):
        raise ArithmeticError("quadratic square-root transport failed")
    return (squarefree, square_root)


def _powers(generator: Any, order: int) -> list[Any]:
    answer = []
    value = generator.parent().one()
    for _index in range(order):
        answer.append(value)
        value *= generator
    return answer


def roots_of_unity(field: Any) -> RootsOfUnityResult:
    """Compute complete torsion in certified rank-zero and real-place cases."""
    r1, r2 = exact_signature(field)
    minus_one = field(-1)
    if r1 > 0 or field.degree() == 1:
        # Every root of unity maps to a real root of unity under a real place.
        return RootsOfUnityResult(
            [field(1), minus_one],
            minus_one,
            2,
            True,
            "a real embedding forces every root of unity to be +1 or -1",
        )
    if field.degree() == 2 and r2 == 1:
        squarefree, square_root = _quadratic_square_root_element(field)
        if squarefree == -1:
            generator = square_root
            order = 4
            reason = "the field is Q(sqrt(-1))"
        elif squarefree == -3:
            generator = (field(1) + square_root) / 2
            order = 6
            reason = "the field is Q(sqrt(-3))"
        else:
            generator = minus_one
            order = 2
            reason = "classification of roots of unity in imaginary quadratic fields"
        elements = _powers(generator, order)
        result = RootsOfUnityResult(elements, generator, order, True, reason)
        if not result.verify():
            raise ArithmeticError("roots-of-unity certificate replay failed")
        return result
    return RootsOfUnityResult(
        [field(1), minus_one],
        minus_one,
        2,
        False,
        "higher-degree totally imaginary torsion has not been exhausted",
    )


def _real_quadratic_unit(field: Any, max_y: int) -> tuple[Any, int, int]:
    if max_y < 1:
        raise ValueError("max_y must be positive")
    squarefree, square_root = _quadratic_square_root_element(field)
    if squarefree <= 0:
        raise ValueError("a real quadratic unit needs positive squarefree radicand")
    for y_value in range(1, max_y + 1):
        dy2 = squarefree * y_value * y_value
        for norm4 in (-4, 4):
            x2 = dy2 + norm4
            if x2 <= 0:
                continue
            x_value = _isqrt(x2)
            if x_value * x_value != x2 or (x_value - y_value) % 2:
                continue
            unit = (field(x_value) + field(y_value) * square_root) / 2
            verified, norm = exact_norm_is_unit(field, unit)
            if verified and unit in field.maximal_order():
                return (unit, norm, y_value)
    raise ValueError(
        "no fundamental real-quadratic unit was found through y=" + str(max_y)
    )


def real_quadratic_unit_group(field: Any, max_y: int = 1_000_000) -> UnitSubgroupResult:
    """Return the full real-quadratic unit group by bounded Pell enumeration.

    Once a solution is found, completeness is exact: every smaller positive
    `y` was checked, so the returned unit is the least unit greater than one
    modulo sign and hence is fundamental.
    """
    if field.degree() != 2 or exact_signature(field) != (2, 0):
        raise ValueError("this algorithm requires a real quadratic field")
    unit, norm, checked = _real_quadratic_unit(field, max_y)
    certificate = UnitCertificate(unit, norm, True, True)
    if not certificate.verify(field):
        raise ArithmeticError("real-quadratic unit certificate replay failed")
    return UnitSubgroupResult(
        field,
        roots_of_unity(field),
        [unit],
        [certificate],
        1,
        True,
        "least positive Pell-type solution proves a fundamental unit",
        checked,
        2 * checked,
        UnitCompletionCertificate("real-quadratic-minimal-pell"),
    )


def _coefficient_vectors(rank: int, bound: int) -> list[list[int]]:
    vectors: list[list[int]] = [[]]
    for _index in range(rank):
        next_vectors = []
        for prefix in vectors:
            for value in range(-bound, bound + 1):
                next_vectors.append(prefix + [value])
        vectors = next_vectors
    return vectors


def bounded_unit_subgroup(
    field: Any,
    coefficient_bound: int = 2,
    max_candidates: int = 100_000,
) -> UnitSubgroupResult:
    """Enumerate a bounded unit subgroup with honest completeness status."""
    if coefficient_bound < 0:
        raise ValueError("coefficient_bound must be nonnegative")
    if max_candidates < 1:
        raise ValueError("max_candidates must be positive")
    r1, r2 = exact_signature(field)
    unit_rank = r1 + r2 - 1
    torsion = roots_of_unity(field)
    if unit_rank == 0 and torsion.complete:
        return UnitSubgroupResult(
            field,
            torsion,
            [],
            [],
            0,
            True,
            "Dirichlet unit rank zero and complete torsion",
            coefficient_bound,
            0,
            UnitCompletionCertificate("rank-zero"),
        )
    if field.degree() == 2 and (r1, r2) == (2, 0):
        return real_quadratic_unit_group(field, max_candidates)

    order = field.maximal_order()
    basis = list(order.basis())
    total = (2 * coefficient_bound + 1) ** len(basis)
    if total > max_candidates:
        raise ValueError(
            "bounded unit box contains "
            + str(total)
            + " candidates, exceeding max_candidates="
            + str(max_candidates)
        )
    units = []
    certificates = []
    checked = 0
    for vector in _coefficient_vectors(len(basis), coefficient_bound):
        checked += 1
        element = field(0)
        for basis_index in range(len(basis)):
            element += vector[basis_index] * basis[basis_index]
        verified, norm = exact_norm_is_unit(field, element)
        if not verified:
            continue
        if any(element == torsion_element for torsion_element in torsion.elements):
            continue
        if any(element == known for known in units):
            continue
        units.append(element)
        certificates.append(UnitCertificate(element, norm, True, True))
    return UnitSubgroupResult(
        field,
        torsion,
        units,
        certificates,
        unit_rank,
        False,
        "bounded enumeration supplies units but no saturation/index certificate",
        coefficient_bound,
        checked,
        None,
    )


def _floating_determinant(rows: list[list[float]]) -> float:
    size = len(rows)
    if size == 0:
        return 1.0
    matrix = [list(row) for row in rows]
    determinant = 1.0
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(matrix[row][column]))
        if matrix[pivot][column] == 0:
            return 0.0
        if pivot != column:
            matrix[pivot], matrix[column] = matrix[column], matrix[pivot]
            determinant = -determinant
        value = matrix[column][column]
        determinant *= value
        for row in range(column + 1, size):
            factor = matrix[row][column] / value
            for index in range(column + 1, size):
                matrix[row][index] -= factor * matrix[column][index]
    return abs(determinant)


def subgroup_regulator(subgroup: UnitSubgroupResult, prec: int = 53) -> RegulatorResult:
    """Compute the weighted-log regulator of the supplied subgroup."""
    if prec < 2:
        raise ValueError("precision must be at least 2")
    if not subgroup.complete:
        raise ValueError(
            "an incomplete bounded search has no certified independent unit basis"
        )
    rank = subgroup.unit_rank
    if rank == 0:
        return RegulatorResult(1.0, prec, subgroup.complete, 0)
    if len(subgroup.generators) < rank:
        raise ValueError("not enough free generators to form a regulator")
    data = archimedean_data(subgroup.field)
    columns = [
        data.logarithmic_image(unit, prec)[:-1] for unit in subgroup.generators[:rank]
    ]
    rows = [[columns[column][row] for column in range(rank)] for row in range(rank)]
    determinant = _floating_determinant(rows)
    if determinant == 0:
        raise ArithmeticError("the supplied units have zero numerical regulator")
    return RegulatorResult(determinant, prec, subgroup.complete, rank)


__all__ = [
    "RegulatorResult",
    "RootsOfUnityResult",
    "UnitCertificate",
    "UnitCompletionCertificate",
    "UnitSubgroupResult",
    "bounded_unit_subgroup",
    "real_quadratic_unit_group",
    "roots_of_unity",
    "subgroup_regulator",
]
