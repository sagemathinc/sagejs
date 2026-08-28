r"""Mestre eigenpackets and exact modular $q$-expansions.

For a mass-orthogonal simultaneous Brandt eigenvector, Mestre's identity
recovers the corresponding weight-two cusp form modulo the characteristic of
the supersingular module. The implementation works directly with truncated
power-series coefficient lists, so no Laurent-series cancellation or formatted
finite-field representation is trusted.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

from .modular_polynomial import j_invariant_unit_series


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _machine_integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


def _series_inverse(source: list[Any], precision: int, field: Any) -> list[Any]:
    if len(source) == 0 or source[0] != field(1):
        raise ValueError("power-series inversion requires constant coefficient one")
    answer = [field(0) for _index in range(precision)]
    answer[0] = field(1)
    for index in range(1, precision):
        total = field(0)
        stop = min(index, len(source) - 1)
        for source_index in range(1, stop + 1):
            total += source[source_index] * answer[index - source_index]
        answer[index] = -total
    return answer


def _series_product(
    left: list[Any], right: list[Any], precision: int, field: Any
) -> list[Any]:
    answer = [field(0) for _index in range(precision)]
    for left_index, left_value in enumerate(left):
        if left_index >= precision:
            break
        if left_value == field(0):
            continue
        stop = min(len(right), precision - left_index)
        for right_index in range(stop):
            if right[right_index] != field(0):
                answer[left_index + right_index] += left_value * right[right_index]
    return answer


def _rational_to_field(value: Any, field: Any) -> Any:
    rational = sage.QQ(value)
    return field(rational.numerator()) / field(rational.denominator())


def _field_kernel_basis(rows: list[list[Any]], field: Any) -> list[list[Any]]:
    """Return an exact right-kernel basis using ordinary field elimination."""
    if len(rows) == 0:
        return []
    column_count = len(rows[0])
    matrix = [[field(value) for value in row] for row in rows]
    if any(len(row) != column_count for row in matrix):
        raise ValueError("kernel matrix rows have different lengths")
    pivot_columns = []
    pivot_row = 0
    for column in range(column_count):
        selected = -1
        for row in range(pivot_row, len(matrix)):
            if matrix[row][column] != field(0):
                selected = row
                break
        if selected < 0:
            continue
        if selected != pivot_row:
            matrix[pivot_row], matrix[selected] = matrix[selected], matrix[pivot_row]
        inverse = field(1) / matrix[pivot_row][column]
        matrix[pivot_row] = [value * inverse for value in matrix[pivot_row]]
        for row in range(len(matrix)):
            if row == pivot_row or matrix[row][column] == field(0):
                continue
            multiplier = matrix[row][column]
            matrix[row] = [
                matrix[row][index] - multiplier * matrix[pivot_row][index]
                for index in range(column_count)
            ]
        pivot_columns.append(column)
        pivot_row += 1
        if pivot_row == len(matrix):
            break
    free_columns = [
        column for column in range(column_count) if column not in pivot_columns
    ]
    answer = []
    for free_column in free_columns:
        vector = [field(0) for _index in range(column_count)]
        vector[free_column] = field(1)
        for row, column in enumerate(pivot_columns):
            vector[column] = -matrix[row][free_column]
        answer.append(vector)
    return answer


def _cuspidal_ambient_vector(
    module: Any, coordinates: list[Any], field: Any
) -> list[Any]:
    dimension = module.dimension()
    if len(coordinates) != max(0, dimension - 1):
        raise ValueError("vector length does not match the cuspidal module")
    if dimension == 0:
        return []
    masses = module.mass_weights()
    weighted = field(0)
    for index, value in enumerate(coordinates):
        weighted += _rational_to_field(masses[index], field) * field(value)
    anchor_mass = _rational_to_field(masses[dimension - 1], field)
    return [field(value) for value in coordinates] + [-weighted / anchor_mass]


def _cuspidal_apply(
    module: Any, index: int, coordinates: list[Any], field: Any
) -> list[Any]:
    ambient = _cuspidal_ambient_vector(module, coordinates, field)
    image = []
    operator = module.hecke_operator(index)
    for row in range(module.dimension()):
        total = field(0)
        for column, multiplicity in operator.row(row):
            total += field(multiplicity) * ambient[column]
        image.append(total)
    masses = module.mass_weights()
    weighted = field(0)
    for position, value in enumerate(image):
        weighted += _rational_to_field(masses[position], field) * value
    if weighted != field(0):
        raise ArithmeticError("a Hecke operator did not preserve the cuspidal space")
    return image[: max(0, module.dimension() - 1)]


def _simultaneous_eigenvalue(
    module: Any, index: int, coordinates: list[Any], field: Any
) -> Any:
    image = _cuspidal_apply(module, index, coordinates, field)
    pivot = -1
    for position, value in enumerate(coordinates):
        if pivot < 0 and value != field(0):
            pivot = position
    if pivot < 0:
        raise ArithmeticError("a Hecke eigenvector is zero")
    eigenvalue = image[pivot] / coordinates[pivot]
    for position, value in enumerate(coordinates):
        if image[position] != eigenvalue * value:
            raise ValueError("the eigenspace is not simultaneous for T_" + str(index))
    return eigenvalue


def _mestre_relation_coefficients(
    module: Any,
    vector: list[Any],
    eigenvalues: list[tuple[int, Any]],
    bound: int,
) -> tuple[list[Any], Any]:
    """Evaluate Mestre's relation for one exact residue-field eigenvector."""
    field = module.finite_field()
    points = module.supersingular_points()[0]
    masses = module.mass_weights()
    if len(points) != len(vector) or len(masses) != len(vector):
        raise ArithmeticError("Mestre eigenpacket data have inconsistent lengths")

    weighted = []
    weighted_sum = field(0)
    relation_denominator = field(0)
    for index, value in enumerate(vector):
        coefficient = field(value) * _rational_to_field(masses[index], field)
        weighted.append(coefficient)
        weighted_sum += coefficient
        relation_denominator += coefficient * points[index]
    if weighted_sum != field(0):
        raise ArithmeticError(
            "the mass-weighted eigenvector is not an ordinary cusp relation"
        )
    if relation_denominator == field(0):
        raise ArithmeticError("Mestre's normalization denominator vanishes")

    integral_j = j_invariant_unit_series(bound - 1)
    unit_j = [field(value) for value in integral_j]
    rational_sum = [field(0) for _index in range(bound)]
    for point, coefficient in zip(points, weighted, strict=True):
        denominator = list(unit_j[:bound])
        denominator[1] -= point
        inverse = _series_inverse(denominator, bound, field)
        for index in range(bound):
            rational_sum[index] += coefficient * inverse[index]

    derivative_factor = [field(index - 1) * unit_j[index] for index in range(bound)]
    raw = _series_product(derivative_factor, rational_sum, bound, field)
    if raw[0] != field(0):
        raise ArithmeticError("Mestre's expression has a noncuspidal constant term")
    if raw[1] != -relation_denominator:
        raise ArithmeticError("Mestre's leading coefficient failed exact replay")
    inverse_leading = field(1) / raw[1]
    coefficients = [value * inverse_leading for value in raw]
    if coefficients[0] != field(0) or coefficients[1] != field(1):
        raise ArithmeticError("Mestre q-expansion failed normalization")
    for ell, eigenvalue in eigenvalues:
        if ell < bound and ell != module.prime():
            if coefficients[ell] != field(eigenvalue):
                raise ArithmeticError(
                    "Mestre coefficient disagrees with the T_"
                    + str(ell)
                    + " eigenvalue"
                )
    return (coefficients, relation_denominator)


def _integer_factorization(value: int) -> list[tuple[int, int]]:
    remaining = value
    factors = []
    prime = 2
    while prime * prime <= remaining:
        exponent = 0
        while remaining % prime == 0:
            remaining //= prime
            exponent += 1
        if exponent:
            factors.append((prime, exponent))
        prime = 3 if prime == 2 else prime + 2
    if remaining > 1:
        factors.append((remaining, 1))
    return factors


def _reduce_number_field_element(value: Any, root: Any, residue_field: Any) -> Any:
    answer = residue_field(0)
    power = residue_field(1)
    for coordinate in value.list():
        answer += _rational_to_field(coordinate, residue_field) * power
        power *= root
    return answer


class MestreQExpansion:
    """An exact normalized $q$-expansion obtained from Mestre's identity."""

    def __init__(
        self,
        packet: Any,
        coefficients: list[Any],
        relation_denominator: Any,
    ) -> None:
        self._packet = packet
        self._coefficients = tuple(coefficients)
        self._relation_denominator = relation_denominator
        runtime.object.freeze(self)

    def base_field(self) -> Any:
        return self._packet.module().finite_field()

    def precision(self) -> int:
        return len(self._coefficients)

    def coefficient(self, index: Any) -> Any:
        position = _machine_integer(index, "q-expansion index")
        if position < 0 or position >= len(self._coefficients):
            return self.base_field()(0)
        return self._coefficients[position]

    def coefficients(self) -> tuple[Any, ...]:
        return self._coefficients

    def relation_denominator(self) -> Any:
        return self._relation_denominator

    def polynomial(self, variable: str = "q") -> Any:
        """Return the exact truncated polynomial, without the $O(q^n)$ tag."""
        ring = _global("PolynomialRing")(self.base_field(), variable)
        return ring(list(self._coefficients))

    def q_expansion(self) -> MestreQExpansion:
        return self

    def __getitem__(self, index: Any) -> Any:
        return self.coefficient(index)

    def __repr__(self) -> str:
        polynomial = repr(self.polynomial())
        bigoh = "O(q^" + str(len(self._coefficients)) + ")"
        return polynomial + " + " + bigoh if polynomial != "0" else bigoh

    __str__ = __repr__
    toString = __repr__


class SupersingularEigenpacket:
    """A proved rational simultaneous cuspidal Brandt eigenvector."""

    def __init__(
        self,
        module: Any,
        vector: list[Any],
        eigenvalues: list[tuple[int, Any]],
    ) -> None:
        self._module = module
        self._vector = tuple(sage.ZZ(value) for value in vector)
        self._eigenvalues = tuple(
            (index, sage.ZZ(value)) for index, value in eigenvalues
        )
        if not module.is_cuspidal(self._vector):
            raise ArithmeticError("a supersingular eigenpacket is not cuspidal")
        runtime.object.freeze(self)

    def module(self) -> Any:
        return self._module

    def vector(self) -> Any:
        return _global("vector")(sage.ZZ, list(self._vector))

    def eigenvalues(self) -> tuple[tuple[int, Any], ...]:
        return self._eigenvalues

    def eigenvalue(self, index: Any) -> Any:
        ell = _machine_integer(index, "Hecke index")
        for prime, value in self._eigenvalues:
            if prime == ell:
                return value
        raise KeyError(ell)

    def q_expansion(
        self,
        precision: Any = 20,
        *,
        max_series_terms: Any = 10000,
    ) -> MestreQExpansion:
        bound = _machine_integer(precision, "q-expansion precision")
        limit = _machine_integer(max_series_terms, "q-expansion term limit")
        if bound < 2:
            raise ValueError("Mestre q-expansion precision must be at least 2")
        if limit < 2 or bound > limit:
            raise MemoryError(
                "Mestre q-expansion precision "
                + str(bound)
                + " exceeds the explicit term limit "
                + str(limit)
            )
        coefficients, relation_denominator = _mestre_relation_coefficients(
            self._module,
            list(self._vector),
            list(self._eigenvalues),
            bound,
        )
        return MestreQExpansion(self, coefficients, relation_denominator)

    def __repr__(self) -> str:
        return (
            "Rational supersingular eigenpacket at level "
            + str(self._module.prime())
            + " with Hecke data "
            + repr(self._eigenvalues)
        )

    __str__ = __repr__
    toString = __repr__


class AlgebraicHeckeQExpansion:
    """A normalized characteristic-zero $q$-expansion over a number field."""

    def __init__(
        self,
        packet: AlgebraicSupersingularEigenpacket,
        coefficients: list[Any],
        eigenvalues: list[tuple[int, Any]],
    ) -> None:
        self._packet = packet
        self._coefficients = tuple(coefficients)
        self._eigenvalues = tuple(eigenvalues)
        runtime.object.freeze(self)

    def base_field(self) -> Any:
        return self._packet.coefficient_field()

    def precision(self) -> int:
        return len(self._coefficients)

    def coefficient(self, index: Any) -> Any:
        position = _machine_integer(index, "q-expansion index")
        if position < 0 or position >= len(self._coefficients):
            return self.base_field()(0)
        return self._coefficients[position]

    def coefficients(self) -> tuple[Any, ...]:
        return self._coefficients

    def verified_hecke_eigenvalues(self) -> tuple[tuple[int, Any], ...]:
        return self._eigenvalues

    def polynomial(self, variable: str = "q") -> Any:
        ring = _global("PolynomialRing")(self.base_field(), variable)
        return ring(list(self._coefficients))

    def q_expansion(self) -> AlgebraicHeckeQExpansion:
        return self

    def __getitem__(self, index: Any) -> Any:
        return self.coefficient(index)

    def __repr__(self) -> str:
        polynomial = repr(self.polynomial())
        bigoh = "O(q^" + str(len(self._coefficients)) + ")"
        return polynomial + " + " + bigoh if polynomial != "0" else bigoh

    __str__ = __repr__
    toString = __repr__


class AlgebraicSupersingularEigenpacket:
    """A proved simple Brandt eigenpacket over its exact coefficient field."""

    def __init__(
        self,
        module: Any,
        defining_factor: Any,
        coefficient_field: Any,
        coordinates: list[Any],
        eigenvalues: list[tuple[int, Any]],
    ) -> None:
        self._module = module
        self._defining_factor = defining_factor
        self._field = coefficient_field
        pivot = -1
        for index, value in enumerate(coordinates):
            if pivot < 0 and value != coefficient_field(0):
                pivot = index
        if pivot < 0:
            raise ArithmeticError("an algebraic Hecke eigenvector is zero")
        scale = coefficient_field(1) / coordinates[pivot]
        self._coordinates = tuple(value * scale for value in coordinates)
        self._ambient = tuple(
            _cuspidal_ambient_vector(module, list(self._coordinates), coefficient_field)
        )
        checked = []
        for index, value in eigenvalues:
            expected = _simultaneous_eigenvalue(
                module, index, list(self._coordinates), coefficient_field
            )
            if expected != value:
                raise ArithmeticError("stored algebraic Hecke eigenvalue failed replay")
            checked.append((index, value))
        self._eigenvalues = tuple(checked)
        runtime.object.freeze(self)

    def module(self) -> Any:
        return self._module

    def coefficient_field(self) -> Any:
        return self._field

    def defining_factor(self) -> Any:
        return self._defining_factor

    def coordinates(self) -> tuple[Any, ...]:
        return self._coordinates

    def ambient_vector(self) -> tuple[Any, ...]:
        return self._ambient

    def eigenvalues(self) -> tuple[tuple[int, Any], ...]:
        return self._eigenvalues

    def eigenvalue(self, index: Any) -> Any:
        ell = _machine_integer(index, "Hecke index")
        for prime, value in self._eigenvalues:
            if prime == ell:
                return value
        return _simultaneous_eigenvalue(
            self._module, ell, list(self._coordinates), self._field
        )

    def q_expansion(
        self,
        precision: Any = 20,
        *,
        max_series_terms: Any = 10000,
        max_hecke_index: Any = 97,
    ) -> AlgebraicHeckeQExpansion:
        bound = _machine_integer(precision, "q-expansion precision")
        term_limit = _machine_integer(max_series_terms, "q-expansion term limit")
        hecke_limit = _machine_integer(max_hecke_index, "Hecke index limit")
        if bound < 2:
            raise ValueError("q-expansion precision must be at least 2")
        if term_limit < 2 or bound > term_limit:
            raise MemoryError("q-expansion precision exceeds the explicit term limit")
        field = self._field
        level = self._module.prime()
        prime_values = []
        for value in range(2, bound):
            if not bool(sage.is_prime(value)):
                continue
            if value == level:
                raise NotImplementedError(
                    "the bad-prime coefficient is not implemented"
                )
            if value > hecke_limit:
                raise MemoryError("q-expansion needs a Hecke index above the limit")
            prime_values.append((value, self.eigenvalue(value)))
        coefficients = [field(0) for _index in range(bound)]
        coefficients[1] = field(1)
        for index in range(2, bound):
            value = field(1)
            for prime, exponent in _integer_factorization(index):
                eigenvalue = field(0)
                for stored_prime, stored_value in prime_values:
                    if stored_prime == prime:
                        eigenvalue = stored_value
                        break
                previous_previous = field(1)
                previous = eigenvalue
                for _power in range(2, exponent + 1):
                    current = eigenvalue * previous - field(prime) * previous_previous
                    previous_previous, previous = previous, current
                value *= previous
            coefficients[index] = value
        for prime, eigenvalue in prime_values:
            if coefficients[prime] != eigenvalue:
                raise ArithmeticError("a Hecke recurrence failed exact replay")
        return AlgebraicHeckeQExpansion(self, coefficients, prime_values)

    def mestre_residue_q_expansion(
        self,
        precision: Any = 20,
        *,
        root_index: Any = 0,
        max_series_terms: Any = 10000,
        max_hecke_index: Any = 97,
    ) -> MestreQExpansion:
        """Reduce the packet modulo the level and verify Mestre's identity."""
        bound = _machine_integer(precision, "q-expansion precision")
        root_position = _machine_integer(root_index, "residue root index")
        characteristic_expansion = self.q_expansion(
            bound,
            max_series_terms=max_series_terms,
            max_hecke_index=max_hecke_index,
        )
        residue_field = self._module.finite_field()
        polynomial_ring = _global("PolynomialRing")(residue_field, "z")
        reduced_factor = polynomial_ring(
            [
                _rational_to_field(value, residue_field)
                for value in self._defining_factor.coefficients()
            ]
        )
        roots = reduced_factor.roots(multiplicities=False)
        if root_position < 0 or root_position >= len(roots):
            raise ValueError("the coefficient field has no requested residue root")
        root = roots[root_position]
        residue_vector = [
            _reduce_number_field_element(value, root, residue_field)
            for value in self._ambient
        ]
        residue_eigenvalues = [
            (
                index,
                _reduce_number_field_element(value, root, residue_field),
            )
            for index, value in characteristic_expansion.verified_hecke_eigenvalues()
        ]
        coefficients, relation_denominator = _mestre_relation_coefficients(
            self._module,
            residue_vector,
            residue_eigenvalues,
            bound,
        )
        for index, value in enumerate(characteristic_expansion.coefficients()):
            if (
                _reduce_number_field_element(value, root, residue_field)
                != coefficients[index]
            ):
                raise ArithmeticError(
                    "Mestre residue expansion disagrees with characteristic zero"
                )
        return MestreQExpansion(self, coefficients, relation_denominator)

    def __repr__(self) -> str:
        return (
            "Algebraic supersingular eigenpacket at level "
            + str(self._module.prime())
            + " over "
            + repr(self._field)
        )

    __str__ = __repr__
    toString = __repr__


def algebraic_supersingular_eigenpacket(
    module: Any,
    factor: Any,
    *,
    index: Any = 2,
    check_primes: Any = (3, 5),
    field_name: str = "a",
) -> AlgebraicSupersingularEigenpacket:
    """Construct and prove one simple coefficient-field Brandt eigenpacket."""
    ell = _machine_integer(index, "Hecke index")
    ring = _global("PolynomialRing")(sage.QQ, "x")
    defining_factor = ring(factor)
    if defining_factor.degree() <= 1 or not defining_factor.is_irreducible():
        raise ValueError(
            "the coefficient-field factor must be irreducible of degree > 1"
        )
    leading = defining_factor.coefficients()[-1]
    defining_factor = ring(
        [coefficient / leading for coefficient in defining_factor.coefficients()]
    )
    characteristic = ring(module.cuspidal_operator(ell).matrix().charpoly())
    _quotient, remainder = characteristic.quo_rem(defining_factor)
    if remainder != ring(0):
        raise ValueError("the polynomial is not a factor of the cuspidal Hecke action")
    field = _global("NumberField")(defining_factor, field_name)
    generator = field.gen()
    source = module.cuspidal_operator(ell).matrix()
    rows = []
    for row in range(source.nrows()):
        values = []
        for column in range(source.ncols()):
            value = field(source[row, column])
            if row == column:
                value -= generator
            values.append(value)
        rows.append(values)
    kernel = _field_kernel_basis(rows, field)
    if len(kernel) != 1:
        raise ValueError("the coefficient-field Hecke factor is not simple")
    eigenvalues = [(ell, generator)]
    seen = {ell: True}
    for candidate in check_primes:
        prime = _machine_integer(candidate, "check-prime index")
        if prime in seen:
            continue
        seen[prime] = True
        eigenvalues.append(
            (prime, _simultaneous_eigenvalue(module, prime, kernel[0], field))
        )
    eigenvalues.sort()
    return AlgebraicSupersingularEigenpacket(
        module, defining_factor, field, kernel[0], eigenvalues
    )


__all__ = [
    "AlgebraicHeckeQExpansion",
    "AlgebraicSupersingularEigenpacket",
    "MestreQExpansion",
    "SupersingularEigenpacket",
    "algebraic_supersingular_eigenpacket",
]
