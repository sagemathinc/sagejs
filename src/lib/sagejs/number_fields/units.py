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
    _exact_roots,
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


class FundamentalBoxUnitCertificate:
    """Exact saturation evidence from a logarithmic fundamental box.

    Every coset of the candidate unit subgroup has a representative whose log
    vector lies in its half-open fundamental parallelepiped.  Exact embedding
    bounds put every such representative in the recorded coefficient box.
    Exhausting that box and expressing every unit found in the candidate
    subgroup proves index one.
    """

    def __init__(
        self,
        coefficient_bounds: list[int],
        candidate_cap: int,
        exponent_cap: int,
        units_checked: list[tuple[tuple[int, ...], tuple[int, tuple[int, ...]]]],
        lattice_candidates: int,
        independence_certificate: MultiplicativeIndependenceCertificate,
    ) -> None:
        self.kind = "exact-log-fundamental-box"
        self.coefficient_bounds = tuple(coefficient_bounds)
        self.candidate_cap = candidate_cap
        self.exponent_cap = exponent_cap
        self.units_checked = tuple(units_checked)
        self.lattice_candidates = lattice_candidates
        self.independence_certificate = independence_certificate
        self.proof_status = "exact"

    def verify(self, result: UnitSubgroupResult) -> bool:
        if not result.complete:
            return False
        if not self.independence_certificate.verify(
            result.field, list(result.generators)
        ):
            return False
        try:
            replay = _fundamental_box_saturation(
                result.field,
                list(result.generators),
                result.torsion,
                self.candidate_cap,
                self.exponent_cap,
            )
        except (TypeError, ValueError, ArithmeticError):
            return False
        return (
            replay.coefficient_bounds == self.coefficient_bounds
            and replay.units_checked == self.units_checked
            and replay.lattice_candidates == self.lattice_candidates
            and replay.independence_certificate.sign_rows
            == self.independence_certificate.sign_rows
        )


class MultiplicativeIndependenceCertificate:
    """Exact full-rank evidence from absolute-value sign patterns.

    For rank one, a nonzero logarithm proves nontorsion.  For rank two, two
    embeddings whose products of logarithm signs differ rule out a nonzero
    relation: one row would require the exponents to have the same signs and
    the other would require opposite signs.  Only exact comparisons of
    algebraic absolute values with `1` are used.
    """

    def __init__(self, sign_rows: list[tuple[int, ...]]) -> None:
        self.sign_rows = tuple(sign_rows)
        self.proof_status = "exact"

    def verify(self, field: Any, generators: list[Any]) -> bool:
        replay = _embedding_log_sign_rows(field, generators)
        if replay != self.sign_rows:
            return False
        rank = len(generators)
        if rank == 1:
            return any(row[0] != 0 for row in replay)
        if rank == 2:
            products = [
                row[0] * row[1] for row in replay if row[0] != 0 and row[1] != 0
            ]
            return any(value > 0 for value in products) and any(
                value < 0 for value in products
            )
        return rank == 0


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
        completion_certificate: Any = None,
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
        certificate_type = type(self.completion_certificate)
        return (
            self.complete
            and self.completion_certificate is not None
            and certificate_type
            in (UnitCompletionCertificate, FundamentalBoxUnitCertificate)
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


def _bounded_coordinate_vectors(bounds: list[int]) -> list[list[int]]:
    vectors: list[list[int]] = [[]]
    for bound in bounds:
        next_vectors = []
        for prefix in vectors:
            for value in range(-bound, bound + 1):
                next_vectors.append(prefix + [value])
        vectors = next_vectors
    return vectors


def _exact_matrix_inverse(rows: list[list[Any]]) -> list[list[Any]]:
    size = len(rows)
    matrix = [
        list(row)
        + [row[0].parent()(1 if index == column else 0) for column in range(size)]
        for index, row in enumerate(rows)
    ]
    for column in range(size):
        pivot = column
        while pivot < size and matrix[pivot][column] == 0:
            pivot += 1
        if pivot == size:
            raise ArithmeticError("the exact embedding matrix is singular")
        matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
        pivot_value = matrix[column][column]
        matrix[column] = [value / pivot_value for value in matrix[column]]
        for row in range(size):
            if row == column:
                continue
            scalar = matrix[row][column]
            if scalar != 0:
                matrix[row] = [
                    matrix[row][index] - scalar * matrix[column][index]
                    for index in range(2 * size)
                ]
    return [row[size:] for row in matrix]


def _exact_ceiling(value: Any) -> int:
    candidate = int(float(value.n(53)))
    while value > candidate:
        candidate += 1
    while candidate > 0 and value <= candidate - 1:
        candidate -= 1
    return candidate


def _evaluate_coefficients(coefficients: list[int], root: Any) -> Any:
    value = root.parent()(0)
    for coefficient in reversed(coefficients):
        value = value * root + root.parent()(coefficient)
    return value


def _embedding_log_sign_rows(
    field: Any, generators: list[Any]
) -> tuple[tuple[int, ...], ...]:
    rows = []
    for root in _exact_roots(field):
        row = []
        for generator in generators:
            absolute_value = _evaluate_coefficients(list(generator.list()), root).abs()
            if absolute_value > 1:
                row.append(1)
            elif absolute_value < 1:
                row.append(-1)
            else:
                row.append(0)
        rows.append(tuple(row))
    return tuple(rows)


def _power_table(value: Any, bound: int) -> list[Any]:
    return [value**exponent for exponent in range(-bound, bound + 1)]


def _subgroup_witness(
    field: Any,
    unit: Any,
    generators: list[Any],
    torsion: RootsOfUnityResult,
    exponent_cap: int,
) -> tuple[int, tuple[int, ...]] | None:
    tables = [_power_table(generator, exponent_cap) for generator in generators]
    vectors = _coefficient_vectors(len(generators), exponent_cap)
    # `_coefficient_vectors` is symmetric around zero and has the desired
    # exponent range, despite its historical coefficient-oriented name.
    for torsion_index in range(len(torsion.elements)):
        for shifted in vectors:
            value = torsion.elements[torsion_index]
            for index in range(len(generators)):
                exponent = shifted[index]
                value *= tables[index][exponent + exponent_cap]
            if value == unit:
                return (torsion_index, tuple(shifted))
    return None


def _fundamental_box_saturation(
    field: Any,
    generators: list[Any],
    torsion: RootsOfUnityResult,
    candidate_cap: int,
    exponent_cap: int,
) -> FundamentalBoxUnitCertificate:
    if candidate_cap < 1 or exponent_cap < 1:
        raise ValueError("saturation resource caps must be positive")
    rank = sum(exact_signature(field)) - 1
    if len(generators) != rank:
        raise ValueError("a saturation candidate needs one generator per unit rank")
    if not torsion.complete or not torsion.verify():
        raise ValueError("unit saturation needs complete roots of unity")
    order = field.maximal_order()
    power_basis = []
    power = field.one()
    for _index in range(field.degree()):
        power_basis.append(power)
        power *= field.gen()
    if list(order.basis()) != power_basis:
        raise ValueError(
            "the exact fundamental-box slice requires a maximal power basis"
        )
    for generator in generators:
        verified, _norm = exact_norm_is_unit(field, generator)
        if not verified or generator not in order:
            raise ValueError("a proposed free generator is not an exact unit")
    independence = MultiplicativeIndependenceCertificate(
        list(_embedding_log_sign_rows(field, generators))
    )
    if not independence.verify(field, generators):
        raise ValueError("the proposed free units have no exact full-rank certificate")

    roots = _exact_roots(field)
    vandermonde = []
    for root in roots:
        row = []
        power = root.parent()(1)
        for _index in range(field.degree()):
            row.append(power)
            power *= root
        vandermonde.append(row)
    inverse = _exact_matrix_inverse(vandermonde)

    embedding_bounds = []
    for root in roots:
        bound = root.abs().parent()(1)
        for generator in generators:
            absolute_value = _evaluate_coefficients(list(generator.list()), root).abs()
            if absolute_value > 1:
                bound *= absolute_value
        embedding_bounds.append(bound)
    coefficient_bounds = []
    for row in inverse:
        bound = row[0].abs().parent()(0)
        for index in range(len(row)):
            bound += row[index].abs() * embedding_bounds[index]
        coefficient_bounds.append(_exact_ceiling(bound))
    total = 1
    for bound in coefficient_bounds:
        total *= 2 * bound + 1
        if total > candidate_cap:
            raise ValueError(
                "the exact unit coefficient box has "
                + str(total)
                + " candidates, exceeding candidate_cap="
                + str(candidate_cap)
            )

    units_checked = []
    for vector in _bounded_coordinate_vectors(coefficient_bounds):
        element = field._from_coefficients(vector)
        verified, _norm = exact_norm_is_unit(field, element)
        if not verified:
            continue
        witness = _subgroup_witness(field, element, generators, torsion, exponent_cap)
        if witness is None:
            raise ArithmeticError(
                "the proposed units are not saturated: exact unit "
                + str(element)
                + " has no subgroup witness within the certified box"
            )
        units_checked.append((tuple(vector), witness))
    return FundamentalBoxUnitCertificate(
        coefficient_bounds,
        candidate_cap,
        exponent_cap,
        units_checked,
        total,
        independence,
    )


def certified_small_cubic_unit_group(
    field: Any,
    candidate_cap: int = 1_000,
    exponent_cap: int = 8,
) -> UnitSubgroupResult:
    """Return certified full units for the two smallest cubic test fields."""
    if field.degree() != 3:
        raise ValueError("the certified small slice requires a cubic field")
    key = tuple(
        (int(value._numerator), int(value._denominator))
        for value in field._defining_coefficients
    )
    generator = field.gen()
    if key == ((-1, 1), (-1, 1), (0, 1), (1, 1)):
        generators = [generator]
    elif key == ((1, 1), (-2, 1), (-1, 1), (1, 1)):
        generators = [field.one() + generator - generator**2, generator]
    else:
        raise ValueError("this bounded certified slice does not recognize the cubic")
    torsion = roots_of_unity(field)
    saturation = _fundamental_box_saturation(
        field, generators, torsion, candidate_cap, exponent_cap
    )
    certificates = []
    for unit in generators:
        verified, norm = exact_norm_is_unit(field, unit)
        if not verified:
            raise ArithmeticError("a certified cubic generator stopped being a unit")
        certificates.append(UnitCertificate(unit, norm, True, True))
    result = UnitSubgroupResult(
        field,
        torsion,
        generators,
        certificates,
        len(generators),
        True,
        "exact exhaustion of a logarithmic fundamental-parallelepiped coefficient box",
        max(saturation.coefficient_bounds),
        saturation.lattice_candidates,
        saturation,
    )
    if not result.verify_completion():
        raise ArithmeticError("cubic unit saturation certificate replay failed")
    return result


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
    "FundamentalBoxUnitCertificate",
    "MultiplicativeIndependenceCertificate",
    "RegulatorResult",
    "RootsOfUnityResult",
    "UnitCertificate",
    "UnitCompletionCertificate",
    "UnitSubgroupResult",
    "bounded_unit_subgroup",
    "certified_small_cubic_unit_group",
    "real_quadratic_unit_group",
    "roots_of_unity",
    "subgroup_regulator",
]
