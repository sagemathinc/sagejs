"""Exact exhaustive Frobenius arithmetic for hyperelliptic curves."""

from __future__ import annotations

from typing import Any, Iterator

import sagejs as sage


MAX_EXHAUSTIVE_FIELD_ORDER = 2_000_000
_LPOLYNOMIAL_BACKENDS: dict[str, Any] = {}


def register_lpolynomial_backend(name: str, backend: Any) -> None:
    """Register one exact accelerator behind an explicit algorithm name.

    This is an internal integration hook. A backend returns the full ascending
    Euler-numerator coefficient list; registration alone does not make it the
    `auto` backend unless it is named `smalljac` and accepts the curve.
    """
    if not isinstance(name, str) or name in ["auto", "exhaustive"]:
        raise ValueError("invalid hyperelliptic L-polynomial backend name")
    if not callable(backend):
        raise TypeError("a hyperelliptic L-polynomial backend must be callable")
    _LPOLYNOMIAL_BACKENDS[name] = backend


def select_lpolynomial_algorithm(curve: Any, algorithm: str) -> str:
    if algorithm == "auto":
        smalljac = _LPOLYNOMIAL_BACKENDS.get("smalljac")
        supports = getattr(smalljac, "supports", None)
        if smalljac is not None and (not callable(supports) or supports(curve)):
            return "smalljac"
        return "exhaustive"
    if algorithm == "exhaustive" or algorithm in _LPOLYNOMIAL_BACKENDS:
        return algorithm
    if algorithm == "smalljac":
        raise NotImplementedError(
            "the smalljac hyperelliptic L-polynomial backend is unavailable"
        )
    raise ValueError("unknown hyperelliptic L-polynomial algorithm " + repr(algorithm))


def lpolynomial_coefficients(curve: Any, algorithm: str) -> list[int]:
    """Dispatch to an exact ascending-coefficient implementation."""
    if algorithm == "exhaustive":
        return reference_lpolynomial_coefficients(curve)
    backend = _LPOLYNOMIAL_BACKENDS.get(algorithm)
    if backend is None:
        raise NotImplementedError(
            "the "
            + repr(algorithm)
            + " hyperelliptic L-polynomial backend is unavailable"
        )
    result = list(backend(curve))
    q_value = _field_order(curve.base_ring())
    _validate_lpolynomial(q_value, curve.genus(), result, [])
    return result


def _field_characteristic(field: Any) -> int:
    return int(field.characteristic())


def _field_order(field: Any) -> int:
    return int(field.order())


def _absolute_degree(field: Any) -> int:
    characteristic = _field_characteristic(field)
    order = _field_order(field)
    degree = 0
    value = order
    while value > 1 and value % characteristic == 0:
        value //= characteristic
        degree += 1
    if value != 1:
        raise ValueError("finite-field order is not a power of its characteristic")
    return degree


def _sage_field_elements(field: Any) -> list[Any]:
    """Enumerate a Sage.js finite field without assuming its generator is primitive."""
    order = _field_order(field)
    characteristic = _field_characteristic(field)
    degree = _absolute_degree(field)
    if degree == 1:
        return [field(value) for value in range(order)]
    generator = field.gen()
    powers = [field(1)]
    for _index in range(1, degree):
        powers.append(powers[-1] * generator)
    answer = []
    for encoded in range(order):
        value = field(0)
        digits = encoded
        for index in range(degree):
            value += field(digits % characteristic) * powers[index]
            digits //= characteristic
        answer.append(value)
    return answer


def _tuples(values: list[Any], length: int) -> Iterator[list[Any]]:
    if length == 0:
        yield []
        return
    for prefix in _tuples(values, length - 1):
        for value in values:
            yield prefix + [value]


def _evaluate_coefficients(coefficients: list[Any], value: Any, zero: Any) -> Any:
    answer = zero
    for coefficient in reversed(coefficients):
        answer = answer * value + coefficient
    return answer


def _irreducible_modulus(base: Any, degree: int) -> list[Any]:
    if degree not in [2, 3]:
        raise NotImplementedError("the exhaustive field tower supports degrees 2 and 3")
    elements = _sage_field_elements(base)
    zero = base(0)
    one = base(1)
    for lower in _tuples(elements, degree):
        coefficients = lower + [one]
        has_root = False
        for value in elements:
            if _evaluate_coefficients(coefficients, value, zero) == zero:
                has_root = True
                break
        if not has_root:
            return coefficients
    raise RuntimeError("failed to construct a finite-field extension")


class _ReferenceExtensionElement:
    def __init__(self, parent: _ReferenceExtensionField, coefficients: Any) -> None:
        values = list(coefficients)
        zero = parent._base(0)
        if len(values) < parent._degree:
            values += [zero for _index in range(parent._degree - len(values))]
        self._parent = parent
        self._coefficients = tuple(values[: parent._degree])

    def _coerce(self, other: Any) -> _ReferenceExtensionElement:
        return self._parent(other)

    def _add_(self, other: Any) -> _ReferenceExtensionElement:
        right = self._coerce(other)
        return self._parent(
            [
                self._coefficients[index] + right._coefficients[index]
                for index in range(self._parent._degree)
            ]
        )

    def __add__(self, other: Any) -> _ReferenceExtensionElement:
        return self._add_(other)

    __radd__ = __add__

    def __neg__(self) -> _ReferenceExtensionElement:
        return self._parent([-value for value in self._coefficients])

    def _sub_(self, other: Any) -> _ReferenceExtensionElement:
        return self._add_(-self._coerce(other))

    def __sub__(self, other: Any) -> _ReferenceExtensionElement:
        return self._sub_(other)

    def __rsub__(self, other: Any) -> _ReferenceExtensionElement:
        return self._coerce(other) - self

    def _mul_(self, other: Any) -> _ReferenceExtensionElement:
        right = self._coerce(other)
        degree = self._parent._degree
        zero = self._parent._base(0)
        product = [zero for _index in range(2 * degree - 1)]
        for left_index in range(degree):
            for right_index in range(degree):
                product[left_index + right_index] += (
                    self._coefficients[left_index] * right._coefficients[right_index]
                )
        modulus = self._parent._modulus
        for position in range(2 * degree - 2, degree - 1, -1):
            leading = product[position]
            if leading != zero:
                for index in range(degree):
                    product[position - degree + index] -= leading * modulus[index]
        return self._parent(product[:degree])

    def __mul__(self, other: Any) -> _ReferenceExtensionElement:
        return self._mul_(other)

    __rmul__ = __mul__

    def __pow__(self, exponent: int) -> _ReferenceExtensionElement:
        exponent = int(exponent)
        if exponent < 0:
            return (self ** (self._parent._order - 2)) ** (-exponent)
        result = self._parent(1)
        base = self
        while exponent:
            if exponent & 1:
                result = result * base
            base = base * base
            exponent //= 2
        return result

    def _truediv_(self, other: Any) -> _ReferenceExtensionElement:
        right = self._coerce(other)
        if right == self._parent(0):
            raise ZeroDivisionError("finite field division by zero")
        return self * right ** (self._parent._order - 2)

    def __truediv__(self, other: Any) -> _ReferenceExtensionElement:
        return self._truediv_(other)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, _ReferenceExtensionElement):
            try:
                other = self._coerce(other)
            except (TypeError, ValueError):
                return False
        return (
            self._parent is other._parent and self._coefficients == other._coefficients
        )

    def __hash__(self) -> int:
        return hash(
            (id(self._parent), tuple(repr(value) for value in self._coefficients))
        )

    def __repr__(self) -> str:
        return repr(self._coefficients)


class _ReferenceExtensionField:
    def __init__(self, base: Any, degree: int) -> None:
        self._base = base
        self._degree = degree
        self._order = _field_order(base) ** degree
        self._characteristic = _field_characteristic(base)
        self._absolute_degree = _absolute_degree(base) * degree
        self._modulus = _irreducible_modulus(base, degree)
        self._base_elements = _sage_field_elements(base)

    def __call__(self, value: Any = 0) -> _ReferenceExtensionElement:
        if isinstance(value, _ReferenceExtensionElement):
            if value._parent is not self:
                raise TypeError("incompatible reference finite fields")
            return value
        if isinstance(value, (list, tuple)):
            return _ReferenceExtensionElement(self, value)
        return _ReferenceExtensionElement(self, [self._base(value)])

    def zero(self) -> _ReferenceExtensionElement:
        return self(0)

    def one(self) -> _ReferenceExtensionElement:
        return self(1)

    def characteristic(self) -> int:
        return self._characteristic

    def order(self) -> int:
        return self._order

    def absolute_degree(self) -> int:
        return self._absolute_degree

    def __iter__(self) -> Iterator[_ReferenceExtensionElement]:
        for coefficients in _tuples(self._base_elements, self._degree):
            yield self(coefficients)


def _count_quadratic_solutions(field: Any, linear: Any, constant: Any) -> int:
    """Count solutions of `y^2 + linear*y = constant`."""
    zero = field(0)
    if _field_characteristic(field) != 2:
        discriminant = linear * linear + field(4) * constant
        if discriminant == zero:
            return 1
        symbol = discriminant ** ((_field_order(field) - 1) // 2)
        return 2 if symbol == field(1) else 0
    if linear == zero:
        return 1
    reduced = constant / (linear * linear)
    trace = zero
    value = reduced
    absolute_degree = (
        field.absolute_degree()
        if isinstance(field, _ReferenceExtensionField)
        else _absolute_degree(field)
    )
    for _index in range(absolute_degree):
        trace += value
        value = value * value
    return 2 if trace == zero else 0


def _coefficient_in_field(field: Any, coefficient: Any) -> Any:
    if isinstance(field, _ReferenceExtensionField):
        return field(coefficient)
    return field(coefficient)


def _evaluate_curve_polynomial(polynomial: Any, x_value: Any, field: Any) -> Any:
    answer = field(0)
    for coefficient in reversed(polynomial.list()):
        answer = answer * x_value + _coefficient_in_field(field, coefficient)
    return answer


def _infinity_data(curve: Any, field: Any) -> tuple[Any, Any, bool]:
    f_value, h_value = curve.hyperelliptic_polynomials()
    genus = curve.genus()
    branch_degree = (
        (h_value * h_value + 4 * f_value).degree()
        if _field_characteristic(field) != 2
        else max(f_value.degree(), 2 * h_value.degree())
    )
    if branch_degree == 2 * genus + 1:
        return field(0), field(0), True
    f_leading = f_value[2 * genus + 2]
    h_leading = h_value[genus + 1]
    return (
        _coefficient_in_field(field, h_leading),
        _coefficient_in_field(field, f_leading),
        False,
    )


def _infinity_count(curve: Any, field: Any) -> int:
    linear, constant, unique = _infinity_data(curve, field)
    if unique:
        return 1
    return _count_quadratic_solutions(field, linear, constant)


def infinity_values(curve: Any) -> list[Any]:
    field = curve.base_ring()
    linear, constant, unique = _infinity_data(curve, field)
    if unique:
        return [field(0)]
    return [
        value
        for value in _sage_field_elements(field)
        if value * value + linear * value == constant
    ]


def exhaustive_cardinality(curve: Any, extension_degree: int = 1) -> int:
    """Count points directly over one finite extension."""
    base = curve.base_ring()
    if getattr(base, "_kind", None) not in ["GF", "GF_EXTENSION"]:
        raise TypeError("exhaustive point counting requires a finite field")
    if extension_degree < 1:
        raise ValueError("extension_degree must be positive")
    field: Any = base
    if extension_degree > 1:
        field = _ReferenceExtensionField(base, extension_degree)
    order = _field_order(field)
    if order > MAX_EXHAUSTIVE_FIELD_ORDER:
        raise ValueError(
            "the exhaustive reference field is too large (order " + str(order) + ")"
        )
    f_value, h_value = curve.hyperelliptic_polynomials()
    count = _infinity_count(curve, field)
    elements = (
        list(field)
        if isinstance(field, _ReferenceExtensionField)
        else _sage_field_elements(field)
    )
    for x_value in elements:
        f_at_x = _evaluate_curve_polynomial(f_value, x_value, field)
        h_at_x = _evaluate_curve_polynomial(h_value, x_value, field)
        count += _count_quadratic_solutions(field, h_at_x, f_at_x)
    return count


def rational_points(curve: Any) -> list[Any]:
    """Enumerate all rational points over a modest finite base field."""
    field = curve.base_ring()
    if getattr(field, "_kind", None) not in ["GF", "GF_EXTENSION"]:
        raise TypeError("point enumeration requires a finite field")
    if _field_order(field) > 4096:
        raise ValueError("the finite field is too large to enumerate points")
    answer = [curve([1, value, 0]) for value in infinity_values(curve)]
    elements = _sage_field_elements(field)
    f_value, h_value = curve.hyperelliptic_polynomials()
    for x_value in elements:
        f_at_x = _evaluate_curve_polynomial(f_value, x_value, field)
        h_at_x = _evaluate_curve_polynomial(h_value, x_value, field)
        for y_value in elements:
            if y_value * y_value + h_at_x * y_value == f_at_x:
                answer.append(curve([x_value, y_value]))
    return answer


def _power_sum(coefficients: list[int], degree: int, known: list[int]) -> int:
    polynomial_degree = len(coefficients) - 1
    limit = min(degree - 1, polynomial_degree)
    total = 0
    for index in range(1, limit + 1):
        total += coefficients[index] * known[degree - index]
    if degree <= polynomial_degree:
        total += degree * coefficients[degree]
    return -total


def cardinality_from_lpolynomial(
    q_value: int,
    coefficients: list[int],
    extension_degree: int,
) -> int:
    """Derive `#C(F_(q^n))` from an exact Euler numerator."""
    if extension_degree < 1:
        raise ValueError("extension_degree must be positive")
    sums = [0]
    for degree in range(1, extension_degree + 1):
        sums.append(_power_sum(coefficients, degree, sums))
    return q_value**extension_degree + 1 - sums[extension_degree]


def _validate_lpolynomial(
    q_value: int,
    genus: int,
    coefficients: list[int],
    point_counts: list[int],
) -> None:
    if len(coefficients) != 2 * genus + 1 or coefficients[0] != 1:
        raise ArithmeticError("invalid local L-polynomial degree or constant term")
    if coefficients[-1] != q_value**genus:
        raise ArithmeticError("invalid local L-polynomial leading coefficient")
    for index in range(genus):
        if (
            coefficients[2 * genus - index]
            != q_value ** (genus - index) * coefficients[index]
        ):
            raise ArithmeticError("local L-polynomial is not reciprocal")
    for index in range(1, genus + 1):
        binomial = 1
        for factor in range(1, index + 1):
            binomial = binomial * (2 * genus - factor + 1) // factor
        coefficient = coefficients[index]
        if index % 2 == 0:
            if abs(coefficient) > binomial * q_value ** (index // 2):
                raise ArithmeticError("local L-polynomial violates the Weil bound")
        elif coefficient * coefficient > binomial * binomial * q_value**index:
            raise ArithmeticError("local L-polynomial violates the Weil bound")
    for degree, expected in enumerate(point_counts, start=1):
        observed = cardinality_from_lpolynomial(q_value, coefficients, degree)
        if observed != expected:
            raise ArithmeticError("Newton reconstruction failed its point-count check")
    if sum(coefficients) <= 0:
        raise ArithmeticError("the reconstructed Jacobian order is not positive")


def reference_lpolynomial_coefficients(curve: Any) -> list[int]:
    """Reconstruct the full Euler numerator from the first `g` point counts."""
    base = curve.base_ring()
    if getattr(base, "_kind", None) not in ["GF", "GF_EXTENSION"]:
        raise TypeError("Frobenius reconstruction requires a finite field")
    genus = curve.genus()
    q_value = _field_order(base)
    point_counts = [
        exhaustive_cardinality(curve, degree) for degree in range(1, genus + 1)
    ]
    independent = [1]
    power_sums = [0]
    for degree, count in enumerate(point_counts, start=1):
        power_sums.append(q_value**degree + 1 - count)
        numerator = 0
        for index in range(1, degree + 1):
            numerator += independent[degree - index] * power_sums[index]
        if numerator % degree != 0:
            raise ArithmeticError("Newton identity did not divide exactly")
        independent.append(-(numerator // degree))

    coefficients = [0 for _index in range(2 * genus + 1)]
    for index in range(genus + 1):
        coefficients[index] = independent[index]
    for index in range(genus):
        coefficients[2 * genus - index] = (
            q_value ** (genus - index) * independent[index]
        )
    _validate_lpolynomial(q_value, genus, coefficients, point_counts)
    return coefficients


def lpolynomial(coefficients: list[int]) -> Any:
    ring = sage.PolynomialRing(sage.ZZ, "T")
    return ring(coefficients)


def frobenius_polynomial(coefficients: list[int]) -> Any:
    ring = sage.PolynomialRing(sage.ZZ, "x")
    return ring(list(reversed(coefficients)))


def zeta_function(q_value: int, coefficients: list[int]) -> Any:
    ring = sage.PolynomialRing(sage.QQ, "x")
    fraction_field = ring.fraction_field()
    numerator = fraction_field(ring(coefficients))
    denominator = fraction_field(ring([1, -(q_value + 1), q_value]))
    return numerator / denominator


def _reduce_rational_coefficient(field: Any, value: Any, prime: int) -> Any:
    denominator = getattr(value, "_denominator", 1)
    if int(denominator) % prime == 0:
        raise ArithmeticError("the curve model is not integral at this prime")
    return field(value)


def rational_local_lpolynomial(curve: Any, prime: Any, algorithm: str = "auto") -> Any:
    """Compute one good local factor over `QQ` by exact reduction and counting."""
    original_prime = prime
    prime = int(original_prime)
    if prime != original_prime:
        raise ValueError("p must be prime")
    if prime < 2 or not sage.is_prime(prime):
        raise ValueError("p must be prime")
    finite_fields = __import__(
        "sagejs._baselib.finite_fields",
        fromlist=["GF"],
    )
    field = finite_fields.GF(prime)
    f_value, h_value = curve.hyperelliptic_polynomials()
    ring = sage.PolynomialRing(field, f_value.parent().variable_name())
    reduced_f = ring(
        [_reduce_rational_coefficient(field, value, prime) for value in f_value.list()]
    )
    reduced_h = ring(
        [_reduce_rational_coefficient(field, value, prime) for value in h_value.list()]
    )
    model = __import__(
        "sagejs.hyperelliptic_curves.model",
        fromlist=["HyperellipticCurve_generic"],
    )
    try:
        reduced_curve = model.HyperellipticCurve_generic(reduced_f, reduced_h)
    except ValueError as error:
        raise ArithmeticError("the curve has bad reduction at " + str(prime)) from error
    return lpolynomial(reduced_curve._lpolynomial_coefficients(algorithm))
