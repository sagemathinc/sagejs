r"""Exact classical modular polynomials from integral $q$-expansions.

The implementation constructs the unique symmetric relation between $j(q)$
and $j(q^\ell)$. It is intentionally a bounded ordinary-Python algorithm: it
is a portable source for graph-sized good primes, not a claim to replace
PARI's asymptotically optimized modular-polynomial engine.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _machine_integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


def _prime(value: Any) -> int:
    answer = _machine_integer(value, "modular-polynomial index")
    if answer < 2 or not bool(sage.is_prime(answer)):
        raise ValueError("the modular-polynomial index must be prime")
    return answer


def _series_mul(left: list[Any], right: list[Any], precision: int) -> list[Any]:
    answer = [sage.ZZ(0) for _index in range(precision + 1)]
    for left_index, left_value in enumerate(left):
        if left_index > precision:
            break
        if left_value == 0:
            continue
        stop = min(len(right), precision + 1 - left_index)
        for right_index in range(stop):
            right_value = right[right_index]
            if right_value != 0:
                answer[left_index + right_index] += left_value * right_value
    return answer


def _series_inverse(source: list[Any], precision: int) -> list[Any]:
    if len(source) == 0 or source[0] != 1:
        raise ValueError("series inversion requires constant coefficient one")
    answer = [sage.ZZ(0) for _index in range(precision + 1)]
    answer[0] = sage.ZZ(1)
    for index in range(1, precision + 1):
        total = sage.ZZ(0)
        stop = min(index, len(source) - 1)
        for source_index in range(1, stop + 1):
            total += source[source_index] * answer[index - source_index]
        answer[index] = -total
    return answer


def _divisor_power_sum(value: int, exponent: int) -> Any:
    total = sage.ZZ(0)
    divisor = 1
    while divisor * divisor <= value:
        if value % divisor == 0:
            total += sage.ZZ(divisor) ** exponent
            partner = value // divisor
            if partner != divisor:
                total += sage.ZZ(partner) ** exponent
        divisor += 1
    return total


def _j_unit_series(precision: int) -> list[Any]:
    """Return coefficients of $qj(q)$ through `precision`."""
    working_precision = precision + 1
    e4 = [sage.ZZ(0) for _index in range(working_precision + 1)]
    e6 = [sage.ZZ(0) for _index in range(working_precision + 1)]
    e4[0] = sage.ZZ(1)
    e6[0] = sage.ZZ(1)
    for index in range(1, working_precision + 1):
        e4[index] = 240 * _divisor_power_sum(index, 3)
        e6[index] = -504 * _divisor_power_sum(index, 5)
    e4_cubed = _series_mul(
        _series_mul(e4, e4, working_precision), e4, working_precision
    )
    e6_squared = _series_mul(e6, e6, working_precision)
    delta = [
        (e4_cubed[index] - e6_squared[index]) // 1728
        for index in range(working_precision + 1)
    ]
    if delta[0] != 0 or delta[1] != 1:
        raise ArithmeticError("the integral Delta q-expansion failed normalization")
    delta_unit = delta[1:]
    return _series_mul(
        e4_cubed[: precision + 1],
        _series_inverse(delta_unit, precision),
        precision,
    )


def _primitive_coordinates(vector: Any) -> list[Any]:
    coordinates = [sage.ZZ(value) for value in vector]
    common = sage.ZZ(0)
    for value in coordinates:
        right = abs(value)
        while right != 0:
            common, right = right, common % right
    if common == 0:
        raise ArithmeticError("the modular-polynomial kernel vector is zero")
    return [value // common for value in coordinates]


class ClassicalModularPolynomial:
    r"""An exact symmetric classical modular polynomial $\Phi_\ell(X,Y)$."""

    def __init__(self, index: int, coefficients: dict[tuple[int, int], Any]) -> None:
        self._index = index
        self._degree = index + 1
        ordered = []
        for left in range(self._degree + 1):
            for right in range(left, self._degree + 1):
                value = sage.ZZ(coefficients.get((left, right), 0))
                if value != 0:
                    ordered.append((left, right, value))
        self._coefficients = tuple(ordered)
        if self.coefficient(0, self._degree) != 1:
            raise ArithmeticError("the modular polynomial is not monic")
        if self.coefficient(index, index) != -1:
            raise ArithmeticError("the modular polynomial has the wrong central term")
        runtime.object.freeze(self)

    def index(self) -> int:
        return self._index

    def degree(self) -> int:
        return self._degree

    def coefficient(self, left: Any, right: Any) -> Any:
        left_index = _machine_integer(left, "left exponent")
        right_index = _machine_integer(right, "right exponent")
        if left_index < 0 or right_index < 0:
            return sage.ZZ(0)
        if left_index > right_index:
            left_index, right_index = right_index, left_index
        for first, second, value in self._coefficients:
            if first == left_index and second == right_index:
                return value
        return sage.ZZ(0)

    def terms(self) -> tuple[tuple[int, int, Any], ...]:
        return self._coefficients

    def specialize_y(self, field: Any, value: Any, variable: str = "x") -> Any:
        element = field(value)
        coefficients = [field(0) for _index in range(self._degree + 1)]
        powers = [field(1)]
        for _index in range(self._degree):
            powers.append(powers[-1] * element)
        for left, right, coefficient in self._coefficients:
            converted = field(coefficient)
            coefficients[left] += converted * powers[right]
            if left != right:
                coefficients[right] += converted * powers[left]
        return _global("PolynomialRing")(field, variable)(coefficients)

    def structural_data(self) -> dict[str, Any]:
        return {
            "index": self._index,
            "degree": self._degree,
            "terms": self._coefficients,
        }

    def __repr__(self) -> str:
        return (
            "Classical modular polynomial Phi_"
            + str(self._index)
            + " of bidegree "
            + str(self._degree)
        )

    __str__ = __repr__
    toString = __repr__


_modular_polynomial_cache: dict[int, ClassicalModularPolynomial] = {}


def _construct_modular_polynomial(
    index: int,
    max_unknowns: int,
) -> ClassicalModularPolynomial:
    degree = index + 1
    pairs = [
        (left, right) for left in range(degree + 1) for right in range(left, degree + 1)
    ]
    unknowns = len(pairs)
    if unknowns > max_unknowns:
        raise MemoryError(
            "constructing Phi_"
            + str(index)
            + " needs "
            + str(unknowns)
            + " symmetric unknowns, above the explicit limit "
            + str(max_unknowns)
        )
    minimum_exponent = -degree * (index + 1)
    solve_stop = minimum_exponent + 2 * unknowns + 10
    replay_stop = solve_stop + 12
    precision = replay_stop + degree * (index + 1)
    unit = _j_unit_series(precision)
    powers = [[sage.ZZ(1)] + [sage.ZZ(0) for _index in range(precision)]]
    for _exponent in range(degree):
        powers.append(_series_mul(powers[-1], unit, precision))
    inflated = [sage.ZZ(0) for _index in range(precision + 1)]
    for exponent, value in enumerate(unit):
        if exponent * index <= precision:
            inflated[exponent * index] = value
    inflated_powers = [[sage.ZZ(1)] + [sage.ZZ(0) for _index in range(precision)]]
    for _exponent in range(degree):
        inflated_powers.append(_series_mul(inflated_powers[-1], inflated, precision))

    columns = []
    for left, right in pairs:
        forward = _series_mul(powers[left], inflated_powers[right], precision)
        forward_shift = left + index * right
        reverse = None
        reverse_shift = 0
        if left != right:
            reverse = _series_mul(powers[right], inflated_powers[left], precision)
            reverse_shift = right + index * left
        column = []
        for exponent in range(minimum_exponent, replay_stop + 1):
            source_index = exponent + forward_shift
            value = (
                forward[source_index]
                if 0 <= source_index < len(forward)
                else sage.ZZ(0)
            )
            if reverse is not None:
                reverse_index = exponent + reverse_shift
                if 0 <= reverse_index < len(reverse):
                    value += reverse[reverse_index]
            column.append(value)
        columns.append(column)

    solve_length = solve_stop - minimum_exponent + 1
    rows = []
    for row_index in range(solve_length):
        rows.append([column[row_index] for column in columns])
    kernel = _global("matrix")(sage.ZZ, rows).right_kernel()
    if kernel.dimension() != 1:
        raise ArithmeticError(
            "the modular-polynomial relation does not have a unique kernel"
        )
    coordinates = _primitive_coordinates(kernel.basis()[0])
    leading_position = pairs.index((0, degree))
    if coordinates[leading_position] < 0:
        coordinates = [-value for value in coordinates]
    if coordinates[leading_position] != 1:
        raise ArithmeticError("the modular-polynomial relation is not primitive monic")

    for row_index in range(solve_length, len(columns[0])):
        total = sage.ZZ(0)
        for column_index, coordinate in enumerate(coordinates):
            total += coordinate * columns[column_index][row_index]
        if total != 0:
            raise ArithmeticError(
                "the modular-polynomial relation failed its independent q-replay"
            )
    coefficients = {
        pair: coordinate
        for pair, coordinate in zip(pairs, coordinates, strict=True)
        if coordinate != 0
    }
    return ClassicalModularPolynomial(index, coefficients)


def classical_modular_polynomial(
    index: Any,
    *,
    max_unknowns: Any = 200,
) -> ClassicalModularPolynomial:
    r"""Return the exact classical $\Phi_\ell$ under an explicit size bound."""
    ell = _prime(index)
    limit = _machine_integer(max_unknowns, "maximum symmetric unknowns")
    if limit < 1:
        raise ValueError("maximum symmetric unknowns must be positive")
    cached = _modular_polynomial_cache.get(ell)
    if cached is not None:
        return cached
    answer = _construct_modular_polynomial(ell, limit)
    _modular_polynomial_cache[ell] = answer
    return answer


__all__ = ["ClassicalModularPolynomial", "classical_modular_polynomial"]
