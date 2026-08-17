"""First-order Newton-polygon evidence for maximal-order computation.

This module is an ordinary-Python port of the mathematical stages used by
Hecke's BSD-2-Clause `MaxOrd/Polygons.jl` and
`MaxOrd/DedekindCriterion.jl` at commit
`eab7e5566e56d8864fe9cd7b895811ab9df2fe32`.  It does not import Hecke (or
PARI) at run time.  The external systems are differential oracles only.

Integer polynomials are represented by coefficient lists in increasing degree
order.  All public results contain only integers, booleans, strings, lists,
and dictionaries, so the trace is stable across CPython and Sage.js and is
safe to pass to a native local-order boundary.

The first-order theorem is used conservatively: a regular residual trace
certifies the polygon index and its enlargement lattice.  An irregular trace
returns the useful partial lattice but explicitly selects the existing
`p`-radical/ring-of-multipliers algorithm as the correctness fallback.
"""

from __future__ import annotations

from typing import Any

from .maximal_order_contracts import (
    ComponentSplit,
    DiscriminantComponent,
    LocalOrderResult,
    OrderBasis,
)


class LocalPolygonResult:
    """Stable result record for one Hecke-informed local analysis.

    `status` is one of `p-maximal`, `regular-enlargement`, or
    `fallback-required`.  `to_trace()` returns the serialization-safe full
    stage trace; the short attributes are intentionally convenient for an
    algorithm selector that should not know the trace's internal layout.
    """

    def __init__(self, trace: dict[str, Any]) -> None:
        self.status = trace["status"]
        self.prime = trace["prime"]
        self.algorithm = trace["algorithm"]
        self.predicted_index_exponent = trace["predicted_index_exponent"]
        self.basis_numerators = trace["enlargement_lattice"]["basis_numerators"]
        self.basis_denominator = trace["enlargement_lattice"]["basis_denominator"]
        fallback = trace["fallback"]
        self.fallback_reason = None if fallback is None else fallback["reason"]
        self._trace = trace

    def to_trace(self) -> dict[str, Any]:
        """Return the JSON-compatible evidence trace."""
        return self._trace

    def __getitem__(self, key: str) -> Any:
        """Allow migration code to inspect full trace fields directly."""
        return self._trace[key]

    def to_local_order_result(
        self,
        component: DiscriminantComponent,
        current_discriminant: int | None = None,
    ) -> LocalOrderResult:
        """Map this stable trace into the shared local-solver contract."""
        if not isinstance(component, DiscriminantComponent):
            raise TypeError("component must be a DiscriminantComponent")
        if component.value != self.prime or not component.is_proven_prime:
            raise ValueError("polygon evidence requires its proven-prime component")
        basis = OrderBasis(
            self.basis_numerators,
            self.basis_denominator,
            canonical=True,
        )
        index = self.prime**self.predicted_index_exponent
        discriminant = None
        if current_discriminant is not None:
            divisor = index * index
            if current_discriminant % divisor != 0:
                raise ArithmeticError(
                    "the polygon index does not divide the discriminant"
                )
            discriminant = current_discriminant // divisor
        complete = self.status != "fallback-required"
        return LocalOrderResult(
            "complete" if complete else "not-applicable",
            "dedekind" if self.algorithm == "dedekind" else "polygon",
            component,
            basis=basis,
            index=index,
            discriminant=discriminant,
            evidence=self.to_trace(),
            trace=[
                {
                    "stage": "dedekind",
                    "p_maximal": self._trace["dedekind"]["p_maximal"],
                    "obstruction_degree": self._trace["dedekind"]["obstruction_degree"],
                },
                {
                    "stage": "first-order-newton",
                    "regular": self._trace["regular"],
                    "predicted_index_exponent": self.predicted_index_exponent,
                },
            ],
            message=self.fallback_reason,
        )


def _trim(poly: list[int]) -> list[int]:
    answer = list(poly)
    while len(answer) > 1 and answer[-1] == 0:
        answer.pop()
    return answer if answer else [0]


def _degree(poly: list[int]) -> int:
    return len(_trim(poly)) - 1


def _is_zero(poly: list[int]) -> bool:
    return len(_trim(poly)) == 1 and poly[0] == 0


def _add(left: list[int], right: list[int]) -> list[int]:
    size = max(len(left), len(right))
    answer = [0 for _ in range(size)]
    for index in range(size):
        answer[index] = (left[index] if index < len(left) else 0) + (
            right[index] if index < len(right) else 0
        )
    return _trim(answer)


def _sub(left: list[int], right: list[int]) -> list[int]:
    size = max(len(left), len(right))
    answer = [0 for _ in range(size)]
    for index in range(size):
        answer[index] = (left[index] if index < len(left) else 0) - (
            right[index] if index < len(right) else 0
        )
    return _trim(answer)


def _mul(left: list[int], right: list[int]) -> list[int]:
    if _is_zero(left) or _is_zero(right):
        return [0]
    answer = [0 for _ in range(len(left) + len(right) - 1)]
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            answer[left_index + right_index] += left_value * right_value
    return _trim(answer)


def _mod_coefficients(poly: list[int], prime: int) -> list[int]:
    return _trim([coefficient % prime for coefficient in poly])


def _divmod_mod(
    dividend: list[int], divisor: list[int], prime: int
) -> tuple[list[int], list[int]]:
    divisor = _mod_coefficients(divisor, prime)
    if _is_zero(divisor):
        raise ZeroDivisionError("polynomial division by zero")
    remainder = _mod_coefficients(dividend, prime)
    if _degree(remainder) < _degree(divisor):
        return [0], remainder
    quotient = [0 for _ in range(_degree(remainder) - _degree(divisor) + 1)]
    inverse = pow(divisor[-1], prime - 2, prime)
    while not _is_zero(remainder) and _degree(remainder) >= _degree(divisor):
        offset = _degree(remainder) - _degree(divisor)
        scalar = remainder[-1] * inverse % prime
        quotient[offset] = scalar
        for index, coefficient in enumerate(divisor):
            remainder[index + offset] = (
                remainder[index + offset] - scalar * coefficient
            ) % prime
        remainder = _trim(remainder)
    return _trim(quotient), remainder


def _exact_div_mod(dividend: list[int], divisor: list[int], prime: int) -> list[int]:
    quotient, remainder = _divmod_mod(dividend, divisor, prime)
    if not _is_zero(remainder):
        raise ArithmeticError("inexact finite-field polynomial division")
    return quotient


def _monic(poly: list[int], prime: int) -> list[int]:
    poly = _mod_coefficients(poly, prime)
    if _is_zero(poly):
        return [0]
    inverse = pow(poly[-1], prime - 2, prime)
    return _mod_coefficients([coefficient * inverse for coefficient in poly], prime)


def _gcd_mod(left: list[int], right: list[int], prime: int) -> list[int]:
    a = _mod_coefficients(left, prime)
    b = _mod_coefficients(right, prime)
    while not _is_zero(b):
        _, remainder = _divmod_mod(a, b, prime)
        a, b = b, remainder
    return _monic(a, prime)


def _derivative_mod(poly: list[int], prime: int) -> list[int]:
    if len(poly) <= 1:
        return [0]
    return _mod_coefficients(
        [index * poly[index] for index in range(1, len(poly))], prime
    )


def _powmod_poly(
    base: list[int], exponent: int, modulus: list[int], prime: int
) -> list[int]:
    answer = [1]
    _, power = _divmod_mod(base, modulus, prime)
    remaining = exponent
    while remaining:
        if remaining & 1:
            _, answer = _divmod_mod(_mul(answer, power), modulus, prime)
        remaining //= 2
        if remaining:
            _, power = _divmod_mod(_mul(power, power), modulus, prime)
    return answer


def _pth_root(poly: list[int], prime: int) -> list[int]:
    answer = []
    for exponent in range(0, len(poly), prime):
        answer.append(poly[exponent] % prime)
    for exponent, coefficient in enumerate(poly):
        if exponent % prime != 0 and coefficient % prime != 0:
            raise ArithmeticError("a derivative-zero polynomial was not a p-th power")
    return _trim(answer)


def _squarefree_components(poly: list[int], prime: int) -> list[tuple[list[int], int]]:
    """Return monic squarefree components with their exact multiplicities."""
    f = _monic(poly, prime)
    if _degree(f) <= 0:
        return []
    derivative = _derivative_mod(f, prime)
    if _is_zero(derivative):
        return [
            (factor, multiplicity * prime)
            for factor, multiplicity in _squarefree_components(
                _pth_root(f, prime), prime
            )
        ]
    common = _gcd_mod(f, derivative, prime)
    remaining = _exact_div_mod(f, common, prime)
    answer: list[tuple[list[int], int]] = []
    multiplicity = 1
    while _degree(remaining) > 0:
        next_common = _gcd_mod(remaining, common, prime)
        component = _exact_div_mod(remaining, next_common, prime)
        if _degree(component) > 0:
            answer.append((_monic(component, prime), multiplicity))
        remaining = next_common
        common = _exact_div_mod(common, next_common, prime)
        multiplicity += 1
    if _degree(common) > 0:
        for component, submultiplicity in _squarefree_components(
            _pth_root(common, prime), prime
        ):
            answer.append((component, submultiplicity * prime))
    return answer


def _candidate_polynomial(seed: int, degree: int, prime: int) -> list[int]:
    coefficients = []
    if prime <= 4096:
        value = seed
        for _index in range(degree):
            coefficients.append(value % prime)
            value //= prime
    else:
        # Base-p enumeration would produce constants for the first p seeds.
        # A fixed LCG gives the large-prime path nonconstant deterministic
        # candidates without converting the modulus to a machine word.
        value = seed
        for _index in range(degree):
            value = (1103515245 * value + 12345) % prime
            coefficients.append(value)
    return _trim(coefficients or [0])


def _equal_degree_factors(
    poly: list[int], factor_degree: int, prime: int
) -> list[list[int]]:
    poly = _monic(poly, prime)
    if _degree(poly) == factor_degree:
        return [poly]
    pending = [poly]
    answer: list[list[int]] = []
    while pending:
        current = pending.pop()
        if _degree(current) == factor_degree:
            answer.append(current)
            continue
        split = None
        # Deterministic candidate order makes traces and fixtures stable.  This
        # is Cantor--Zassenhaus, not randomness hidden behind a global seed.
        search_bound = max(64, min(4096, prime ** min(_degree(current), 4)))
        for seed in range(2, search_bound + 2):
            candidate = _candidate_polynomial(seed, _degree(current), prime)
            if prime == 2:
                trace = [0]
                power = candidate
                for _index in range(factor_degree):
                    trace = _add(trace, power)
                    _, trace = _divmod_mod(trace, current, prime)
                    power = _powmod_poly(power, 2, current, prime)
                divisor = _gcd_mod(current, trace, prime)
            else:
                power = _powmod_poly(
                    candidate,
                    (prime**factor_degree - 1) // 2,
                    current,
                    prime,
                )
                divisor = _gcd_mod(current, _sub(power, [1]), prime)
            if 0 < _degree(divisor) < _degree(current):
                split = divisor
                break
        if split is None:
            raise ArithmeticError(
                "deterministic equal-degree factorization did not find a split"
            )
        pending.append(_monic(split, prime))
        pending.append(_monic(_exact_div_mod(current, split, prime), prime))
    answer.sort(key=lambda value: (len(value), value))
    return answer


def _factor_squarefree(poly: list[int], prime: int) -> list[list[int]]:
    remaining = _monic(poly, prime)
    answer: list[list[int]] = []
    x_poly = [0, 1]
    frobenius = list(x_poly)
    factor_degree = 1
    while 2 * factor_degree <= _degree(remaining):
        frobenius = _powmod_poly(frobenius, prime, remaining, prime)
        divisor = _gcd_mod(remaining, _sub(frobenius, x_poly), prime)
        if _degree(divisor) > 0:
            answer.extend(_equal_degree_factors(divisor, factor_degree, prime))
            remaining = _exact_div_mod(remaining, divisor, prime)
            if _degree(remaining) > 0:
                _, frobenius = _divmod_mod(frobenius, remaining, prime)
        factor_degree += 1
    if _degree(remaining) > 0:
        answer.append(_monic(remaining, prime))
    answer.sort(key=lambda value: (len(value), value))
    return answer


def factor_mod_prime(coefficients: list[int], prime: int) -> list[dict[str, Any]]:
    """Factor a polynomial over `GF(prime)` with stable factor ordering."""
    _validate_prime(prime)
    factors: list[dict[str, Any]] = []
    for component, multiplicity in _squarefree_components(coefficients, prime):
        for factor in _factor_squarefree(component, prime):
            factors.append(
                {
                    "factor": factor,
                    "degree": _degree(factor),
                    "multiplicity": multiplicity,
                }
            )
    factors.sort(key=lambda item: (item["degree"], item["factor"]))
    return factors


def _integer_divmod(
    dividend: list[int], divisor: list[int]
) -> tuple[list[int], list[int]]:
    divisor = _trim(divisor)
    if _is_zero(divisor):
        raise ZeroDivisionError("polynomial division by zero")
    if divisor[-1] != 1:
        raise ValueError("phi must be monic")
    remainder = _trim(dividend)
    quotient = [0 for _ in range(max(1, _degree(remainder) - _degree(divisor) + 1))]
    while not _is_zero(remainder) and _degree(remainder) >= _degree(divisor):
        offset = _degree(remainder) - _degree(divisor)
        scalar = remainder[-1]
        quotient[offset] += scalar
        for index, coefficient in enumerate(divisor):
            remainder[index + offset] -= scalar * coefficient
        remainder = _trim(remainder)
    return _trim(quotient), remainder


def phi_adic_development(
    coefficients: list[int], phi: list[int], include_quotients: bool = False
) -> Any:
    """Return `f = sum(a_i*phi^i)` and optionally successive quotients."""
    phi = _trim(phi)
    if _degree(phi) <= 0 or phi[-1] != 1:
        raise ValueError("phi must be a nonconstant monic integer polynomial")
    development: list[list[int]] = []
    quotients: list[list[int]] = []
    remaining = _trim(coefficients)
    while _degree(remaining) >= _degree(phi):
        remaining, remainder = _integer_divmod(remaining, phi)
        development.append(remainder)
        quotients.append(remaining)
    development.append(remaining)
    if include_quotients:
        return {"development": development, "quotients": quotients}
    return development


def _integer_valuation(value: int, prime: int) -> int:
    if value == 0:
        raise ValueError("the p-adic valuation of zero is not finite")
    valuation = 0
    remaining = abs(value)
    while remaining % prime == 0:
        remaining //= prime
        valuation += 1
    return valuation


def polynomial_valuation(coefficients: list[int], prime: int) -> int:
    """Return the minimum `p`-adic valuation of nonzero coefficients."""
    values = [
        _integer_valuation(coefficient, prime)
        for coefficient in coefficients
        if coefficient != 0
    ]
    if not values:
        raise ValueError("the zero polynomial has infinite valuation")
    return min(values)


def _gcd_integer(left: int, right: int) -> int:
    a = abs(left)
    b = abs(right)
    while b:
        a, b = b, a % b
    return a


def lower_newton_polygon(development: list[list[int]], prime: int) -> dict[str, Any]:
    """Return the lower convex hull of the finite phi-adic valuation points."""
    points = [
        [index, polynomial_valuation(coefficient, prime)]
        for index, coefficient in enumerate(development)
        if not _is_zero(coefficient)
    ]
    if len(points) < 2:
        raise ValueError("a Newton polygon requires at least two finite points")
    hull: list[list[int]] = []
    for point in points:
        while len(hull) >= 2:
            first = hull[-2]
            second = hull[-1]
            cross = (second[0] - first[0]) * (point[1] - first[1]) - (
                second[1] - first[1]
            ) * (point[0] - first[0])
            if cross > 0:
                break
            hull.pop()
        hull.append(point)
    sides = []
    for left, right in zip(hull, hull[1:], strict=False):
        numerator = right[1] - left[1]
        denominator = right[0] - left[0]
        divisor = _gcd_integer(numerator, denominator)
        numerator //= divisor
        denominator //= divisor
        sides.append(
            {
                "left": left,
                "right": right,
                "slope_numerator": numerator,
                "slope_denominator": denominator,
                "residual_degree": (right[0] - left[0]) // denominator,
            }
        )
    return {"points": points, "vertices": hull, "sides": sides}


def _polygon_floor(polygon: dict[str, Any], abscissa: int) -> int:
    for side in polygon["sides"]:
        left = side["left"]
        right = side["right"]
        if left[0] <= abscissa <= right[0]:
            numerator = left[1] * (right[0] - left[0]) + (abscissa - left[0]) * (
                right[1] - left[1]
            )
            return numerator // (right[0] - left[0])
    raise ValueError("abscissa is outside the Newton polygon")


def _extension_reduce(value: list[int], phi: list[int], prime: int) -> tuple[int, ...]:
    _, remainder = _divmod_mod(value, phi, prime)
    degree = _degree(phi)
    return tuple(
        (remainder[index] if index < len(remainder) else 0) for index in range(degree)
    )


def _extension_sub(
    left: tuple[int, ...], right: tuple[int, ...], prime: int
) -> tuple[int, ...]:
    return tuple((a - b) % prime for a, b in zip(left, right, strict=True))


def _extension_mul(
    left: tuple[int, ...],
    right: tuple[int, ...],
    phi: list[int],
    prime: int,
) -> tuple[int, ...]:
    return _extension_reduce(_mul(list(left), list(right)), phi, prime)


def _extension_pow(
    base: tuple[int, ...], exponent: int, phi: list[int], prime: int
) -> tuple[int, ...]:
    one = tuple([1] + [0 for _ in range(_degree(phi) - 1)])
    answer = one
    power = base
    remaining = exponent
    while remaining:
        if remaining & 1:
            answer = _extension_mul(answer, power, phi, prime)
        remaining //= 2
        if remaining:
            power = _extension_mul(power, power, phi, prime)
    return answer


def _extension_poly_trim(poly: list[tuple[int, ...]]) -> list[tuple[int, ...]]:
    answer = list(poly)
    while len(answer) > 1 and not any(answer[-1]):
        answer.pop()
    return answer


def _extension_poly_divmod(
    dividend: list[tuple[int, ...]],
    divisor: list[tuple[int, ...]],
    phi: list[int],
    prime: int,
) -> tuple[list[tuple[int, ...]], list[tuple[int, ...]]]:
    zero = tuple(0 for _ in range(_degree(phi)))
    remainder = _extension_poly_trim(dividend)
    divisor = _extension_poly_trim(divisor)
    if len(divisor) == 1 and not any(divisor[0]):
        raise ZeroDivisionError("extension polynomial division by zero")
    quotient = [zero for _ in range(max(1, len(remainder) - len(divisor) + 1))]
    inverse = _extension_pow(divisor[-1], prime ** _degree(phi) - 2, phi, prime)
    while not (len(remainder) == 1 and not any(remainder[0])) and len(remainder) >= len(
        divisor
    ):
        offset = len(remainder) - len(divisor)
        scalar = _extension_mul(remainder[-1], inverse, phi, prime)
        quotient[offset] = scalar
        for index, coefficient in enumerate(divisor):
            remainder[index + offset] = _extension_sub(
                remainder[index + offset],
                _extension_mul(scalar, coefficient, phi, prime),
                prime,
            )
        remainder = _extension_poly_trim(remainder)
    return _extension_poly_trim(quotient), remainder


def _extension_poly_gcd(
    left: list[tuple[int, ...]],
    right: list[tuple[int, ...]],
    phi: list[int],
    prime: int,
) -> list[tuple[int, ...]]:
    a = _extension_poly_trim(left)
    b = _extension_poly_trim(right)
    while not (len(b) == 1 and not any(b[0])):
        _, remainder = _extension_poly_divmod(a, b, phi, prime)
        a, b = b, remainder
    inverse = _extension_pow(a[-1], prime ** _degree(phi) - 2, phi, prime)
    return [_extension_mul(coefficient, inverse, phi, prime) for coefficient in a]


def _residual_polynomial(
    development: list[list[int]],
    side: dict[str, Any],
    phi: list[int],
    prime: int,
) -> dict[str, Any]:
    left = side["left"]
    step = side["slope_denominator"]
    residual_degree = side["residual_degree"]
    coefficients: list[tuple[int, ...]] = []
    for index in range(residual_degree + 1):
        development_index = left[0] + step * index
        valuation_numerator = left[1] * step + index * side["slope_numerator"] * step
        valuation = valuation_numerator // step
        coefficient = development[development_index]
        divisor = prime**valuation
        if any(value % divisor != 0 for value in coefficient):
            raise ArithmeticError("a residual coefficient has insufficient valuation")
        coefficients.append(
            _extension_reduce([value // divisor for value in coefficient], phi, prime)
        )
    zero = tuple(0 for _ in range(_degree(phi)))
    derivative = [
        tuple(index * value % prime for value in coefficients[index])
        for index in range(1, len(coefficients))
    ] or [zero]
    common = _extension_poly_gcd(coefficients, derivative, phi, prime)
    return {
        "coefficients": [list(value) for value in coefficients],
        "degree": len(_extension_poly_trim(coefficients)) - 1,
        "squarefree": len(common) == 1,
    }


def dedekind_evidence(coefficients: list[int], prime: int) -> dict[str, Any]:
    """Return factorization and Dedekind-criterion evidence at `prime`."""
    coefficients = _validate_polynomial(coefficients)
    _validate_prime(prime)
    factors = factor_mod_prime(coefficients, prime)
    radical = [1]
    for item in factors:
        radical = _mod_coefficients(_mul(radical, item["factor"]), prime)
    reduced = _mod_coefficients(coefficients, prime)
    quotient = _exact_div_mod(reduced, radical, prime)
    correction_numerator = _sub(coefficients, _mul(radical, quotient))
    if any(value % prime != 0 for value in correction_numerator):
        raise ArithmeticError("Dedekind correction was not divisible by the prime")
    correction = [value // prime for value in correction_numerator]
    obstruction = _gcd_mod(
        _gcd_mod(radical, quotient, prime),
        _mod_coefficients(correction, prime),
        prime,
    )
    obstruction_degree = _degree(obstruction)
    return {
        "prime": prime,
        "modular_factors": factors,
        "radical": radical,
        "quotient": quotient,
        "correction": correction,
        "obstruction": obstruction,
        "obstruction_degree": obstruction_degree,
        "p_maximal": obstruction_degree == 0,
        "dedekind_index_exponent": obstruction_degree,
    }


def _extended_gcd(left: int, right: int) -> tuple[int, int, int]:
    old_r, r = left, right
    old_s, s = 1, 0
    old_t, t = 0, 1
    while r:
        quotient = old_r // r
        old_r, r = r, old_r - quotient * r
        old_s, s = s, old_s - quotient * s
        old_t, t = t, old_t - quotient * t
    if old_r < 0:
        return -old_s, -old_t, -old_r
    return old_s, old_t, old_r


def _add_columns(
    matrix: list[list[int]],
    first: int,
    second: int,
    a: int,
    b: int,
    c: int,
    d: int,
) -> None:
    for row in matrix:
        first_value = row[first]
        second_value = row[second]
        row[first] = a * first_value + b * second_value
        row[second] = c * first_value + d * second_value


def _column_hermite(matrix: list[list[int]]) -> list[list[int]]:
    """Cohen 2.4.5 column HNF, adapted from the published algorithm."""
    rows = len(matrix)
    columns = len(matrix[0]) if rows else 0
    answer = [list(row) for row in matrix]
    pivot_column = columns
    for row_index in range(rows - 1, -1, -1):
        if pivot_column == 0:
            break
        pivot_column -= 1
        for column in range(pivot_column - 1, -1, -1):
            if answer[row_index][column] != 0:
                u, v, divisor = _extended_gcd(
                    answer[row_index][pivot_column], answer[row_index][column]
                )
                r = answer[row_index][pivot_column] // divisor
                s = answer[row_index][column] // divisor
                _add_columns(answer, pivot_column, column, u, v, -s, r)
        pivot = answer[row_index][pivot_column]
        if pivot < 0:
            _add_columns(answer, pivot_column, pivot_column, -1, 0, -1, 0)
            pivot = -pivot
        if pivot == 0:
            pivot_column += 1
        else:
            for column in range(pivot_column + 1, columns):
                quotient = answer[row_index][column] // pivot
                _add_columns(answer, column, pivot_column, 1, -quotient, 0, 1)
    return [row[pivot_column:] for row in answer]


def _row_hermite(rows: list[list[int]], degree: int) -> list[list[int]]:
    transpose = [
        [rows[row][column] for row in range(len(rows))] for column in range(degree)
    ]
    column_hnf = _column_hermite(transpose)
    if not column_hnf or len(column_hnf[0]) != degree:
        raise ArithmeticError("local enlargement generators do not have full rank")
    return [
        [column_hnf[column][row] for column in range(degree)] for row in range(degree)
    ]


def _shift(poly: list[int], amount: int, degree: int) -> list[int]:
    shifted = [0 for _ in range(amount)] + list(poly)
    return (shifted + [0 for _ in range(degree)])[:degree]


def _enlargement_lattice(
    degree: int, generators: list[dict[str, Any]], prime: int
) -> dict[str, Any]:
    maximum_valuation = max(
        [generator["denominator_valuation"] for generator in generators] or [0]
    )
    denominator = prime**maximum_valuation
    integer_rows = []
    for index in range(degree):
        row = [0 for _ in range(degree)]
        row[index] = denominator
        integer_rows.append(row)
    for generator in generators:
        scale = prime ** (maximum_valuation - generator["denominator_valuation"])
        integer_rows.append([scale * value for value in generator["numerator"]])
    basis = _row_hermite(integer_rows, degree)
    common = denominator
    while common > 1 and all(value % prime == 0 for row in basis for value in row):
        basis = [[value // prime for value in row] for row in basis]
        common //= prime
    return {"basis_numerators": basis, "basis_denominator": common}


def analyze_local_polygons(
    coefficients: list[int],
    prime: int,
    discriminant_valuation: int | None = None,
) -> LocalPolygonResult:
    """Analyze one prime and return an inspectable local-order certificate.

    The optional discriminant valuation is evidence supplied by the caller;
    when present it is checked against the predicted index but is never used
    to promote an irregular first-order result to a certificate.
    """
    coefficients = _validate_polynomial(coefficients)
    evidence = dedekind_evidence(coefficients, prime)
    degree = _degree(coefficients)
    result: dict[str, Any] = {
        "schema": "sagejs.number-fields.local-polygons/v1",
        "source": {
            "algorithm": "Hecke first-order Newton polygons",
            "license": "BSD-2-Clause",
            "commit": "eab7e5566e56d8864fe9cd7b895811ab9df2fe32",
        },
        "polynomial": coefficients,
        "degree": degree,
        "prime": prime,
        "dedekind": evidence,
        "factor_traces": [],
        "regular": True,
        "predicted_index_exponent": 0,
        "enlargement_generators": [],
        "discriminant_valuation": discriminant_valuation,
    }
    if evidence["p_maximal"]:
        result.update(
            {
                "status": "p-maximal",
                "algorithm": "dedekind",
                "certified_p_maximal": True,
                "fallback": None,
                "enlargement_lattice": _enlargement_lattice(degree, [], prime),
            }
        )
        return LocalPolygonResult(result)

    all_generators: list[dict[str, Any]] = []
    predicted_index = 0
    regular = True
    factor_traces = []
    for item in evidence["modular_factors"]:
        multiplicity = item["multiplicity"]
        if multiplicity == 1:
            continue
        phi = list(item["factor"])
        development_data = phi_adic_development(coefficients, phi, True)
        development = development_data["development"]
        quotients = development_data["quotients"]
        polygon = lower_newton_polygon(development, prime)
        residuals = []
        factor_regular = True
        for side in polygon["sides"]:
            if side["slope_numerator"] >= 0:
                continue
            if side["residual_degree"] == 1:
                residual = {
                    "coefficients": [],
                    "degree": 1,
                    "squarefree": True,
                    "automatic": True,
                }
            else:
                residual = _residual_polynomial(development, side, phi, prime)
                residual["automatic"] = False
            residual["side"] = side
            residuals.append(residual)
            factor_regular = factor_regular and residual["squarefree"]
        factor_index = 0
        generators = []
        for quotient_index in range(1, multiplicity + 1):
            valuation = _polygon_floor(polygon, quotient_index)
            if valuation <= 0:
                continue
            factor_index += valuation * item["degree"]
            quotient = quotients[quotient_index - 1]
            for shift in range(item["degree"]):
                generator = {
                    "factor": phi,
                    "quotient_index": quotient_index,
                    "shift": shift,
                    "numerator": _shift(quotient, shift, degree),
                    "denominator_valuation": valuation,
                }
                generators.append(generator)
                all_generators.append(generator)
        predicted_index += factor_index
        regular = regular and factor_regular
        factor_traces.append(
            {
                "phi": phi,
                "degree": item["degree"],
                "multiplicity": multiplicity,
                "development": development,
                "polygon": polygon,
                "residual_polynomials": residuals,
                "regular": factor_regular,
                "index_exponent": factor_index,
                "generators": generators,
            }
        )
    lattice = _enlargement_lattice(degree, all_generators, prime)
    result.update(
        {
            "status": "regular-enlargement" if regular else "fallback-required",
            "factor_traces": factor_traces,
            "regular": regular,
            "predicted_index_exponent": predicted_index,
            "enlargement_generators": all_generators,
            "enlargement_lattice": lattice,
            "algorithm": "first-order-newton" if regular else "multiplier-ring",
            "certified_p_maximal": regular,
            "fallback": None
            if regular
            else {
                "algorithm": "p-radical-multiplier-ring",
                "reason": "a first-order residual polynomial is not squarefree",
                "start_from_polygon_lattice": True,
                "iteration": 0,
                "stop_when": "the multiplier ring does not enlarge the order",
            },
        }
    )
    if discriminant_valuation is not None:
        result["remaining_discriminant_valuation"] = (
            discriminant_valuation - 2 * predicted_index
        )
        if result["remaining_discriminant_valuation"] < 0:
            raise ArithmeticError("polygon index exceeds the discriminant bound")
    return LocalPolygonResult(result)


def select_local_enlargement(
    coefficients: list[int],
    prime: int,
    discriminant_valuation: int | None = None,
    algorithm: str = "auto",
) -> dict[str, Any]:
    """Select the Dedekind, regular-polygon, or multiplier-ring local path."""
    if algorithm not in ("auto", "dedekind", "polygon", "multiplier-ring"):
        raise ValueError("unknown local maximal-order algorithm")
    evidence = analyze_local_polygons(coefficients, prime, discriminant_valuation)
    if algorithm == "dedekind" and not evidence["dedekind"]["p_maximal"]:
        return {
            "algorithm": "multiplier-ring",
            "reason": "Dedekind's criterion found a local index obstruction",
            "evidence": evidence.to_trace(),
        }
    if algorithm == "polygon" and not evidence["regular"]:
        return {
            "algorithm": "multiplier-ring",
            "reason": "the forced first-order polygon path is irregular",
            "evidence": evidence.to_trace(),
        }
    if algorithm == "multiplier-ring":
        return {
            "algorithm": "multiplier-ring",
            "reason": "explicitly requested correctness fallback",
            "evidence": evidence.to_trace(),
        }
    return {"algorithm": evidence["algorithm"], "evidence": evidence.to_trace()}


def multiplier_ring_iteration_plan(
    prior_evidence: LocalPolygonResult | dict[str, Any],
    iteration: int,
    current_discriminant_valuation: int | None = None,
) -> dict[str, Any]:
    """Return explicit evidence for one dynamic fallback iteration."""
    if iteration < 0:
        raise ValueError("iteration must be nonnegative")
    trace = (
        prior_evidence.to_trace()
        if isinstance(prior_evidence, LocalPolygonResult)
        else prior_evidence
    )
    return {
        "algorithm": "p-radical-multiplier-ring",
        "prime": trace["prime"],
        "iteration": iteration,
        "input_basis_numerators": trace["enlargement_lattice"]["basis_numerators"],
        "input_basis_denominator": trace["enlargement_lattice"]["basis_denominator"],
        "current_discriminant_valuation": current_discriminant_valuation,
        "required_stage_evidence": [
            "p-radical-dimension",
            "multiplier-kernel-dimension",
            "basis-index-exponent",
            "output-discriminant-valuation",
        ],
        "stop_when": "multiplier-kernel-dimension is zero",
    }


def analyze_local_component(
    coefficients: list[int],
    component: DiscriminantComponent,
    discriminant_valuation: int | None = None,
    current_discriminant: int | None = None,
) -> LocalOrderResult:
    """Run polygons only for a proven prime and preserve composite outcomes.

    Composite modular arithmetic must never masquerade as finite-field
    arithmetic.  A cheap nontrivial divisor becomes a typed `ComponentSplit`;
    an unresolved component returns `not-applicable` for the lazy component
    scheduler to refine.  No complete factorization is attempted here.
    """
    if not isinstance(component, DiscriminantComponent):
        raise TypeError("component must be a DiscriminantComponent")
    if component.is_proven_prime:
        return analyze_local_polygons(
            coefficients,
            component.value,
            discriminant_valuation,
        ).to_local_order_result(component, current_discriminant)
    divisor = _cheap_component_divisor(component.value)
    if divisor is not None:
        split = ComponentSplit(
            component.value,
            divisor,
            component.value // divisor,
            {
                "stage": "polygon-prime-precondition",
                "reason": "a zero-divisor candidate exposed a nontrivial component gcd",
            },
        )
        return LocalOrderResult(
            "split",
            "polygon",
            component,
            split=split,
            evidence={
                "attempted_stage": "prime-field-construction",
                "finite_field_arithmetic_started": False,
            },
            message="the local component is composite and was split before polygons",
        )
    return LocalOrderResult(
        "not-applicable",
        "polygon",
        component,
        evidence={
            "attempted_stage": "prime-field-construction",
            "finite_field_arithmetic_started": False,
            "component_state": component.state,
        },
        message="first-order polygons require a proven-prime component",
    )


def _cheap_component_divisor(value: int) -> int | None:
    for divisor in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31):
        if value != divisor and value % divisor == 0:
            return divisor
    return None


def _validate_prime(prime: int) -> None:
    if not isinstance(prime, int) or isinstance(prime, bool) or prime < 2:
        raise ValueError("prime must be an integer at least 2")
    # Primality is certified by the local-component layer.  Avoid an accidental
    # trial-division bottleneck here: bad primes routinely exceed one machine
    # word.  Cheap divisors still turn the most common caller mistakes into an
    # actionable error.
    for divisor in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31):
        if prime != divisor and prime % divisor == 0:
            raise ValueError("prime must be a certified prime")


def _validate_polynomial(coefficients: list[int]) -> list[int]:
    if not isinstance(coefficients, list) or not coefficients:
        raise ValueError("coefficients must be a nonempty list")
    if any(
        not isinstance(value, int) or isinstance(value, bool) for value in coefficients
    ):
        raise TypeError("polynomial coefficients must be integers")
    answer = _trim(coefficients)
    if _degree(answer) <= 0 or answer[-1] != 1:
        raise ValueError("the defining polynomial must be monic and nonconstant")
    return answer


__all__ = [
    "LocalPolygonResult",
    "analyze_local_polygons",
    "analyze_local_component",
    "dedekind_evidence",
    "factor_mod_prime",
    "lower_newton_polygon",
    "multiplier_ring_iteration_plan",
    "phi_adic_development",
    "polynomial_valuation",
    "select_local_enlargement",
]
