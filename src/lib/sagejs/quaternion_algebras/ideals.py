r"""Exact locally principal right ideals in definite quaternion orders.

Positive ideal-class equivalence is certified by an explicit connecting
quaternion and exact lattice replay.  Theta vectors are only negative filters.
The short-vector enumerator uses an exact Gram-LLL reduction and exact norm
comparisons; floating-point values are not part of any proof boundary.
"""

from __future__ import annotations

from itertools import product
from typing import Any, Iterable, Iterator

import sagejs as sage
import sagejs.runtime as runtime

from .algebra import (
    QuaternionElement,
    QuaternionOrder,
    _basis_matrix,
    _canonical_lattice,
    _global,
    _lattice_contains,
    _lattice_intersection,
    _rational_parts,
)

_LOCAL_PRINCIPAL_CONSTRUCTION = object()


def _nearest_integer(value: Any) -> Any:
    numerator, denominator = _rational_parts(value)
    if numerator >= 0:
        return (numerator + denominator // 2) // denominator
    return -((-numerator + denominator // 2) // denominator)


def _integer_sqrt(value: Any) -> Any:
    integer = sage.ZZ(value)
    if integer < 0:
        raise ValueError("an integer square root needs a nonnegative argument")
    if integer < 2:
        return integer
    current = integer
    next_value = (current + 1) // 2
    while next_value < current:
        current = next_value
        next_value = (current + integer // current) // 2
    return current


def _rational_sqrt_bound(value: Any) -> int:
    rational = sage.QQ(value)
    if rational < 0:
        raise ValueError("a coordinate bound must be nonnegative")
    numerator, denominator = _rational_parts(rational)
    # sqrt(n/d) <= floor(sqrt(n*d)/d)+1, with one exact correction below.
    bound = _integer_sqrt(numerator * denominator) // denominator + 1
    while bound > 0 and (bound - 1) * (bound - 1) > rational:
        bound -= 1
    while bound * bound < rational:
        bound += 1
    return runtime.number(bound)


def _dot_gram(left: list[Any], gram: Any, right: list[Any]) -> Any:
    answer = sage.QQ(0)
    for row in range(len(left)):
        if left[row] == 0:
            continue
        for column in range(len(right)):
            if right[column] != 0:
                answer += left[row] * gram[row, column] * right[column]
    return answer


def _gram_lll_transform(gram: Any) -> list[list[Any]]:
    """Return a unimodular row transform reducing a positive Gram matrix."""

    dimension = gram.nrows()
    transform = [
        [sage.ZZ(1 if row == column else 0) for column in range(dimension)]
        for row in range(dimension)
    ]

    def gram_schmidt() -> tuple[list[list[Any]], list[Any]]:
        orthogonal: list[list[Any]] = []
        norms: list[Any] = []
        mu = [[sage.QQ(0) for _column in range(dimension)] for _row in range(dimension)]
        for row in range(dimension):
            vector = [sage.QQ(value) for value in transform[row]]
            for previous in range(row):
                coefficient = (
                    _dot_gram(
                        [sage.QQ(value) for value in transform[row]],
                        gram,
                        orthogonal[previous],
                    )
                    / norms[previous]
                )
                mu[row][previous] = coefficient
                for column in range(dimension):
                    vector[column] -= coefficient * orthogonal[previous][column]
            norm = _dot_gram(vector, gram, vector)
            if norm <= 0:
                raise ArithmeticError(
                    "quaternion norm Gram matrix is not positive definite"
                )
            orthogonal.append(vector)
            norms.append(norm)
        return mu, norms

    index = 1
    while index < dimension:
        mu, norms = gram_schmidt()
        for previous in range(index - 1, -1, -1):
            quotient = _nearest_integer(mu[index][previous])
            if quotient != 0:
                transform[index] = [
                    transform[index][column] - quotient * transform[previous][column]
                    for column in range(dimension)
                ]
                mu, norms = gram_schmidt()
        if (
            norms[index]
            >= (sage.QQ(3) / 4 - mu[index][index - 1] ** 2) * norms[index - 1]
        ):
            index += 1
        else:
            transform[index], transform[index - 1] = (
                transform[index - 1],
                transform[index],
            )
            index = max(1, index - 1)
    return transform


def _linear_combination(
    algebra: Any, coefficients: Iterable[Any], basis: Iterable[QuaternionElement]
) -> QuaternionElement:
    answer = algebra.zero()
    for coefficient, element in zip(coefficients, basis, strict=True):
        answer += element * coefficient
    return answer


def _rational_mod(value: Any, prime: int) -> int:
    numerator, denominator = _rational_parts(value)
    numerator_value = runtime.number(sage.ZZ(numerator) % prime)
    denominator_value = runtime.number(sage.ZZ(denominator) % prime)
    if denominator_value == 0:
        raise ZeroDivisionError("a local quaternion coordinate has bad denominator")
    return numerator_value * pow(denominator_value, prime - 2, prime) % prime


def _enumerate_lattice_by_norm(
    algebra: Any,
    rows: Iterable[Iterable[Any]],
    absolute_bound: Any,
) -> Iterator[tuple[QuaternionElement, Any]]:
    canonical = _canonical_lattice(rows)
    basis = tuple(algebra(row) for row in canonical)
    gram = _global("matrix")(
        sage.QQ,
        [[left.pair(right) / 2 for right in basis] for left in basis],
    )
    transform = _gram_lll_transform(gram)
    reduced = tuple(_linear_combination(algebra, row, basis) for row in transform)
    reduced_gram = _global("matrix")(
        sage.QQ,
        [[left.pair(right) / 2 for right in reduced] for left in reduced],
    )
    inverse = reduced_gram.inverse()
    coordinate_bounds = [
        _rational_sqrt_bound(absolute_bound * inverse[index, index])
        for index in range(4)
    ]
    ranges = [range(-value, value + 1) for value in coordinate_bounds]
    for coordinates in product(*ranges):
        norm = _dot_gram(list(coordinates), reduced_gram, list(coordinates))
        if norm <= absolute_bound:
            yield _linear_combination(algebra, coordinates, reduced), norm


def _matrix_rank_mod(rows: Iterable[Iterable[int]], prime: int) -> int:
    matrix = [[value % prime for value in row] for row in rows]
    if not matrix:
        return 0
    column = 0
    rank = 0
    while rank < len(matrix) and column < len(matrix[0]):
        pivot = rank
        while pivot < len(matrix) and matrix[pivot][column] == 0:
            pivot += 1
        if pivot == len(matrix):
            column += 1
            continue
        matrix[rank], matrix[pivot] = matrix[pivot], matrix[rank]
        inverse = pow(matrix[rank][column], prime - 2, prime)
        matrix[rank] = [(value * inverse) % prime for value in matrix[rank]]
        for row in range(len(matrix)):
            if row == rank:
                continue
            coefficient = matrix[row][column]
            if coefficient:
                matrix[row] = [
                    (left - coefficient * right) % prime
                    for left, right in zip(matrix[row], matrix[rank], strict=True)
                ]
        rank += 1
        column += 1
    return rank


def _vector_matrix(
    vector: tuple[int, ...], matrix: list[list[int]], prime: int
) -> tuple[int, ...]:
    return tuple(
        sum(vector[row] * matrix[row][column] for row in range(len(vector))) % prime
        for column in range(len(matrix[0]))
    )


class QuaternionRightIdeal:
    """A normalized right ideal of a certified quaternion order."""

    def __init__(
        self,
        right_order: QuaternionOrder,
        basis: Iterable[Any],
        *,
        _construction_proof: Any = None,
    ) -> None:
        self._right_order = right_order
        self._algebra = right_order.quaternion_algebra()
        self._basis_rows = _canonical_lattice(
            tuple(self._algebra(value)) for value in basis
        )
        self._basis = tuple(self._algebra(row) for row in self._basis_rows)
        for element in self._basis:
            for order_element in right_order.basis():
                if not self.contains(element * order_element):
                    raise ValueError(
                        "the lattice is not a right ideal of the requested order"
                    )
        self._left_order: QuaternionOrder | None = None
        self._norm: Any | None = None
        self._theta_cache: tuple[int, ...] = ()
        self._local_principality_proven = (
            _construction_proof is _LOCAL_PRINCIPAL_CONSTRUCTION
        )
        if (
            not self._local_principality_proven
            and not self._replay_local_principality()
        ):
            raise ValueError(
                "the right-ideal lattice is not a locally principal proper ideal"
            )
        self._local_principality_proven = True

    def quaternion_algebra(self) -> Any:
        return self._algebra

    def basis(self) -> tuple[QuaternionElement, ...]:
        return self._basis

    gens = basis

    def basis_matrix(self) -> Any:
        return _basis_matrix(self._basis_rows)

    def contains(self, value: Any) -> bool:
        return _lattice_contains(self._basis_rows, self._algebra(value))

    def __contains__(self, value: Any) -> bool:
        return self.contains(value)

    def right_order(self) -> QuaternionOrder:
        return self._right_order

    def _compute_order(self, side: str) -> QuaternionOrder:
        ambient = self._algebra.basis()
        ideal_matrix = self.basis_matrix()
        lattices = []
        for generator in self._basis:
            if side == "left":
                multiplication_rows = [
                    tuple(element * generator) for element in ambient
                ]
            elif side == "right":
                multiplication_rows = [
                    tuple(generator * element) for element in ambient
                ]
            else:
                raise ValueError("side must be left or right")
            multiplication = _global("matrix")(sage.QQ, multiplication_rows)
            lattices.append(
                _canonical_lattice((ideal_matrix * multiplication.inverse()).rows())
            )
        return QuaternionOrder(self._algebra, _lattice_intersection(lattices))

    def left_order(self) -> QuaternionOrder:
        if self._left_order is None:
            self._left_order = self._compute_order("left")
        return self._left_order

    def norm(self) -> Any:
        if self._norm is None:
            gram = self.gram_matrix()
            determinant = gram.determinant() / (2**4)
            if determinant < 0:
                determinant = -determinant
            numerator, denominator = _rational_parts(determinant)
            numerator_integer = sage.ZZ(numerator)
            denominator_integer = sage.ZZ(denominator)
            if not numerator_integer.is_square() or not denominator_integer.is_square():
                raise ArithmeticError("the ideal norm determinant is not a square")
            volume = sage.QQ(_integer_sqrt(numerator_integer)) / _integer_sqrt(
                denominator_integer
            )
            quotient = volume / self._right_order.discriminant()
            numerator, denominator = _rational_parts(quotient)
            numerator_integer = sage.ZZ(numerator)
            denominator_integer = sage.ZZ(denominator)
            if not numerator_integer.is_square() or not denominator_integer.is_square():
                raise ArithmeticError("the ideal reduced norm is not a square")
            self._norm = sage.QQ(_integer_sqrt(numerator_integer)) / _integer_sqrt(
                denominator_integer
            )
        return self._norm

    def _replay_local_principality(self) -> bool:
        left_order = self.left_order()
        if left_order.discriminant() != self._right_order.discriminant():
            return False
        ideal_norm = self.norm()
        product_lattice = _canonical_lattice(
            tuple(left * right.conjugate() / ideal_norm)
            for left in self._basis
            for right in self._basis
        )
        return product_lattice == tuple(
            tuple(element) for element in left_order.basis()
        )

    def is_locally_principal(self, *, replay: bool = False) -> bool:
        """Return the construction proof, or replay $I\bar I=N(I)O_L(I)$."""

        if replay:
            return self._replay_local_principality()
        return self._local_principality_proven

    def gram_matrix(self) -> Any:
        return _global("matrix")(
            sage.QQ,
            [[2 * left.pair(right) for right in self._basis] for left in self._basis],
        )

    def reduced_basis(self) -> tuple[QuaternionElement, ...]:
        transform = _gram_lll_transform(self.gram_matrix())
        return tuple(
            _linear_combination(self._algebra, row, self._basis) for row in transform
        )

    def elements_with_normalized_norm_at_most(
        self, bound: Any
    ) -> Iterator[tuple[QuaternionElement, Any]]:
        normalized_bound = sage.QQ(bound)
        if normalized_bound < 0:
            return
        absolute_bound = normalized_bound * self.norm()
        for element, norm in _enumerate_lattice_by_norm(
            self._algebra, self._basis_rows, absolute_bound
        ):
            yield element, norm / self.norm()

    def theta_series_vector(self, precision: Any) -> tuple[int, ...]:
        bound = runtime.number(runtime.normalize_integer(precision))
        if bound <= 0:
            return ()
        if len(self._theta_cache) >= bound:
            return self._theta_cache[:bound]
        coefficients = [0 for _index in range(bound)]
        for _element, normalized_norm in self.elements_with_normalized_norm_at_most(
            bound - 1
        ):
            numerator, denominator = _rational_parts(normalized_norm)
            if denominator != 1:
                raise ArithmeticError(
                    "a locally principal ideal has a nonintegral normalized norm"
                )
            index = runtime.number(numerator)
            if 0 <= index < bound:
                coefficients[index] += 1
        self._theta_cache = tuple(coefficients)
        return self._theta_cache

    def elements_of_normalized_norm(self, value: Any) -> tuple[QuaternionElement, ...]:
        target = sage.QQ(value)
        return tuple(
            element
            for element, normalized_norm in self.elements_with_normalized_norm_at_most(
                target
            )
            if normalized_norm == target
        )

    def scale(self, value: Any, *, left: bool = True) -> QuaternionRightIdeal:
        scalar = self._algebra(value)
        if scalar.is_zero():
            raise ValueError("an ideal scaling quaternion must be nonzero")
        if left:
            basis = tuple(scalar * element for element in self._basis)
            result = QuaternionRightIdeal(
                self._right_order,
                basis,
                _construction_proof=_LOCAL_PRINCIPAL_CONSTRUCTION,
            )
        else:
            basis = tuple(element * scalar for element in self._basis)
            result = QuaternionRightIdeal(self._compute_order("right"), basis)
        return result

    def conjugate_basis(self) -> tuple[QuaternionElement, ...]:
        return tuple(element.conjugate() for element in self._basis)

    def multiply_by_conjugate(
        self, other: QuaternionRightIdeal
    ) -> tuple[tuple[Any, ...], ...]:
        if other._algebra.invariants() != self._algebra.invariants():
            raise TypeError("quaternion ideals have different ambient algebras")
        return _canonical_lattice(
            tuple(left * right.conjugate())
            for left in self._basis
            for right in other._basis
        )

    def is_equivalent(
        self,
        other: QuaternionRightIdeal,
        *,
        certificate: bool = False,
        theta_precision: int = 6,
    ) -> Any:
        if other.right_order() != self._right_order:
            raise ValueError("equivalent right ideals must have the same right order")
        if theta_precision > 0 and self.theta_series_vector(
            theta_precision
        ) != other.theta_series_vector(theta_precision):
            return (False, None) if certificate else False
        connecting_rows = self.multiply_by_conjugate(other)
        scaled_rows = [
            tuple(value / other.norm() for value in row) for row in connecting_rows
        ]
        target = self.norm() / other.norm()
        for alpha, norm in _enumerate_lattice_by_norm(
            self._algebra, scaled_rows, target
        ):
            if norm != target:
                continue
            if (
                self._basis_rows
                == QuaternionRightIdeal(
                    self._right_order,
                    tuple(alpha * value for value in other._basis),
                    _construction_proof=_LOCAL_PRINCIPAL_CONSTRUCTION,
                )._basis_rows
            ):
                return (True, alpha) if certificate else True
        return (False, None) if certificate else False

    is_right_equivalent = is_equivalent

    def cyclic_right_subideals(self, prime: int) -> tuple[QuaternionRightIdeal, ...]:
        if self._right_order.discriminant() % prime == 0:
            raise ValueError(
                "the neighbor prime must be coprime to the order discriminant"
            )
        order = self._right_order
        alpha: QuaternionElement | None = None
        beta: QuaternionElement | None = None
        centered = tuple(range(-(prime // 2), prime - prime // 2))
        for coefficients in product(centered, repeat=4):
            if all(value == 0 for value in coefficients):
                continue
            candidate = _linear_combination(self._algebra, coefficients, order.basis())
            trace_residue = runtime.number(sage.ZZ(candidate.reduced_trace()) % prime)
            norm_residue = runtime.number(sage.ZZ(candidate.reduced_norm()) % prime)
            discriminant = candidate.reduced_trace() ** 2 - 4 * candidate.reduced_norm()
            residue = runtime.number(sage.ZZ(discriminant) % prime)
            irreducible = (
                trace_residue != 0 and norm_residue != 0
                if prime == 2
                else residue != 0 and pow(residue, (prime - 1) // 2, prime) == prime - 1
            )
            if irreducible:
                alpha = candidate
                break
        if alpha is None:
            raise ArithmeticError(
                "failed to find an irreducible local quaternion generator"
            )
        inverse_order_basis = order.basis_matrix().inverse()
        for coefficients in product(centered, repeat=4):
            candidate = _linear_combination(self._algebra, coefficients, order.basis())
            ambient_rows = [
                tuple(self._algebra.one()),
                tuple(alpha),
                tuple(candidate),
                tuple(alpha * candidate),
            ]
            integral_rows = []
            for row in ambient_rows:
                coordinates = _global("vector")(sage.QQ, row) * inverse_order_basis
                integral_rows.append(
                    [_rational_mod(value, prime) for value in coordinates]
                )
            if _matrix_rank_mod(integral_rows, prime) == 4:
                beta = candidate
                break
        if beta is None:
            raise ArithmeticError("failed to find a second local quaternion generator")

        inverse_basis = self.basis_matrix().inverse()

        def action_matrix(element: QuaternionElement) -> list[list[int]]:
            rows = []
            for basis_element in self._basis:
                coordinates = (
                    _global("vector")(sage.QQ, tuple(basis_element * element))
                    * inverse_basis
                )
                row = []
                for value in coordinates:
                    if value._denominator != 1:
                        raise ArithmeticError("right-ideal action is not integral")
                    row.append(runtime.number(sage.ZZ(value) % prime))
                rows.append(row)
            return rows

        alpha_action = action_matrix(alpha)
        beta_action = action_matrix(beta)
        standard = tuple(
            tuple(1 if row == column else 0 for column in range(4)) for row in range(4)
        )
        first = standard[0]
        first_alpha = _vector_matrix(first, alpha_action, prime)
        second: tuple[int, ...] | None = None
        for candidate in standard[1:]:
            if (
                _matrix_rank_mod(
                    [
                        first,
                        first_alpha,
                        candidate,
                        _vector_matrix(candidate, alpha_action, prime),
                    ],
                    prime,
                )
                == 4
            ):
                second = candidate
                break
        if second is None:
            raise ArithmeticError("failed to split the local ideal module")
        candidates = []
        parameter_vectors = []
        for left in range(prime):
            for right in range(prime):
                alpha_second = _vector_matrix(second, alpha_action, prime)
                parameter_vectors.append(
                    tuple(
                        (
                            first[index]
                            + left * second[index]
                            + right * alpha_second[index]
                        )
                        % prime
                        for index in range(4)
                    )
                )
        parameter_vectors.append(second)
        for vector in parameter_vectors:
            first_row = vector
            second_row = _vector_matrix(vector, alpha_action, prime)
            beta_row = _vector_matrix(vector, beta_action, prime)
            alpha_beta_row = _vector_matrix(second_row, beta_action, prime)
            if (
                _matrix_rank_mod(
                    [first_row, second_row, beta_row, alpha_beta_row], prime
                )
                != 2
            ):
                continue
            rows = [
                tuple(prime * value for value in basis_element)
                for basis_element in self._basis
            ]
            rows.append(
                tuple(_linear_combination(self._algebra, first_row, self._basis))
            )
            rows.append(
                tuple(_linear_combination(self._algebra, second_row, self._basis))
            )
            candidate = QuaternionRightIdeal(
                order,
                rows,
                _construction_proof=_LOCAL_PRINCIPAL_CONSTRUCTION,
            )
            if candidate not in candidates:
                candidates.append(candidate)
            if len(candidates) == prime + 1:
                break
        if len(candidates) != prime + 1:
            raise ArithmeticError(
                "local neighbor enumeration did not produce ell+1 ideals"
            )
        return tuple(candidates)

    def unit_weight(self) -> int:
        units = self.left_order().unit_ideal().elements_of_normalized_norm(1)
        if len(units) % 2:
            raise ArithmeticError(
                "a definite rational unit group must contain plus/minus pairs"
            )
        return len(units) // 2

    def fingerprint(self) -> tuple[Any, ...]:
        return (self.theta_series_vector(12), self.unit_weight(), self._basis_rows)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, QuaternionRightIdeal)
            and other._right_order == self._right_order
            and other._basis_rows == self._basis_rows
        )

    def __hash__(self) -> int:
        return hash((self._right_order, self._basis_rows))

    def __repr__(self) -> str:
        return "Fractional right ideal " + repr(self._basis)

    __str__ = __repr__
    toString = __repr__


__all__ = ["QuaternionRightIdeal"]
