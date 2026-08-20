"""Certified odd-prime local factors for bad hyperelliptic reduction.

The genus-2 almost-good implementation follows Algorithms 1--7 of
Maistret--Sutherland, *Computing Euler factors of genus 2 curves at odd
primes of almost good reduction*.  The semistable path proves a narrower
but useful case directly: the completed integral model has an ordinary
nodal special fibre with either geometrically integral normalization or two
geometrically rational components.  Its local factor is the product of the
normalization factor and the Frobenius polynomial on the first homology of
the dual graph.

Every successful result includes enough intermediate exact data to check
which theorem applies.  Unsupported reduction types raise a structured
exception; this module never substitutes point counts on a singular plane
model for the inertia-invariant Euler factor.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

MAX_ALMOST_GOOD_ITERATIONS = 128
MAX_QUADRATIC_EXTENSION_ORDER = 250_000


class LocalReductionUnsupportedError(NotImplementedError):
    """The requested local factor is outside the certified implementation."""

    def __init__(self, message: str, diagnostics: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.diagnostics = {} if diagnostics is None else dict(diagnostics)


class LocalReductionData:
    """An exact bad- or good-prime local-reduction certificate."""

    def __init__(
        self,
        prime: int,
        genus: int,
        coefficients: list[int],
        conductor_exponent: int,
        *,
        reduction_type: str,
        curve_good_reduction: bool,
        jacobian_good_reduction: bool,
        semistable: bool | None,
        toric_rank: int,
        backend: str,
        certificate: dict[str, Any],
    ) -> None:
        self.prime = sage.ZZ(prime)
        self.genus = int(genus)
        self.coefficients = tuple(sage.ZZ(value) for value in coefficients)
        self.euler_factor = _frobenius().lpolynomial(list(self.coefficients))
        self.conductor_exponent = sage.ZZ(conductor_exponent)
        self.reduction_type = reduction_type
        self.curve_good_reduction = bool(curve_good_reduction)
        self.jacobian_good_reduction = bool(jacobian_good_reduction)
        self.semistable = semistable
        self.toric_rank = sage.ZZ(toric_rank)
        self.backend = backend
        self.certified = True
        self.certificate = dict(certificate)

    def __getitem__(self, name: str) -> Any:
        if not hasattr(self, name):
            raise KeyError(name)
        return getattr(self, name)

    def __repr__(self) -> str:
        return (
            "LocalReductionData(prime="
            + str(self.prime)
            + ", reduction_type="
            + repr(self.reduction_type)
            + ", conductor_exponent="
            + str(self.conductor_exponent)
            + ", euler_factor="
            + repr(self.euler_factor)
            + ")"
        )


def _frobenius() -> Any:
    return __import__(
        "sagejs.hyperelliptic_curves.frobenius",
        fromlist=["rational_local_lpolynomial"],
    )


def _local_polygons() -> Any:
    return __import__(
        "sagejs.number_fields.local_polygons",
        fromlist=["factor_mod_prime"],
    )


def _trim(values: list[int]) -> list[int]:
    answer = list(values)
    while len(answer) > 1 and answer[-1] == 0:
        answer.pop()
    return answer if answer else [0]


def _degree(values: list[int]) -> int:
    values = _trim(values)
    return -1 if len(values) == 1 and values[0] == 0 else len(values) - 1


def _valuation(value: int, prime: int) -> int:
    if value == 0:
        return 10**9
    value = abs(value)
    answer = 0
    while value % prime == 0:
        value //= prime
        answer += 1
    return answer


def _ceil_div(numerator: int, denominator: int) -> int:
    return -((-numerator) // denominator)


def _binomial(n_value: int, k_value: int) -> int:
    if k_value < 0 or k_value > n_value:
        return 0
    k_value = min(k_value, n_value - k_value)
    answer = 1
    for index in range(1, k_value + 1):
        answer = answer * (n_value - index + 1) // index
    return answer


def _multiply(left: list[int], right: list[int]) -> list[int]:
    answer = [0 for _ in range(len(left) + len(right) - 1)]
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            answer[left_index + right_index] += left_value * right_value
    return _trim(answer)


def _multiply_mod(left: list[int], right: list[int], prime: int) -> list[int]:
    return _trim([value % prime for value in _multiply(left, right)])


def _translate_scale(values: list[int], scale: int, shift: int) -> list[int]:
    """Return the exact coefficients of `f(scale*x + shift)`."""
    degree = _degree(values)
    answer = [0 for _ in range(degree + 1)]
    for source_degree, coefficient in enumerate(values):
        for target_degree in range(source_degree + 1):
            answer[target_degree] += (
                coefficient
                * _binomial(source_degree, target_degree)
                * shift ** (source_degree - target_degree)
                * scale**target_degree
            )
    return _trim(answer)


def _exact_scalar_divide(values: list[int], divisor: int) -> list[int]:
    if divisor == 0:
        raise ZeroDivisionError("polynomial scalar division by zero")
    answer = []
    for value in values:
        if value % divisor != 0:
            raise ArithmeticError("an almost-good blowup was not integral")
        answer.append(value // divisor)
    return _trim(answer)


def _divmod_mod(
    dividend: list[int], divisor: list[int], prime: int
) -> tuple[list[int], list[int]]:
    remainder = _trim([value % prime for value in dividend])
    divisor = _trim([value % prime for value in divisor])
    if _degree(divisor) < 0:
        raise ZeroDivisionError("finite-field polynomial division by zero")
    if _degree(remainder) < _degree(divisor):
        return [0], remainder
    quotient = [0 for _ in range(_degree(remainder) - _degree(divisor) + 1)]
    inverse = pow(divisor[-1], prime - 2, prime)
    while _degree(remainder) >= _degree(divisor) and _degree(remainder) >= 0:
        offset = _degree(remainder) - _degree(divisor)
        scalar = remainder[-1] * inverse % prime
        quotient[offset] = scalar
        for index, value in enumerate(divisor):
            remainder[index + offset] = (
                remainder[index + offset] - scalar * value
            ) % prime
        remainder = _trim(remainder)
    return _trim(quotient), remainder


def _remainder_mod(values: list[int], modulus: list[int], prime: int) -> list[int]:
    return _divmod_mod(values, modulus, prime)[1]


def _powmod_polynomial(
    base: list[int], exponent: int, modulus: list[int], prime: int
) -> list[int]:
    answer = [1]
    power = _remainder_mod(base, modulus, prime)
    remaining = exponent
    while remaining:
        if remaining & 1:
            answer = _remainder_mod(_multiply_mod(answer, power, prime), modulus, prime)
        remaining //= 2
        if remaining:
            power = _remainder_mod(_multiply_mod(power, power, prime), modulus, prime)
    return _trim(answer)


def _factor_mod(values: list[int], prime: int) -> list[dict[str, Any]]:
    return list(_local_polygons().factor_mod_prime(values, prime))


def _multiplicity_part(values: list[int], prime: int, minimum: int) -> list[int]:
    answer = [1]
    for item in _factor_mod(values, prime):
        multiplicity = int(item["multiplicity"])
        if multiplicity < minimum:
            continue
        factor = [int(value) for value in item["factor"]]
        for _index in range(multiplicity - minimum + 1):
            answer = _multiply_mod(answer, factor, prime)
    return _trim(answer)


def _is_squarefree_cubic(values: list[int], prime: int) -> bool:
    values = _trim([value % prime for value in values])
    if _degree(values) != 3:
        return False
    return all(int(item["multiplicity"]) == 1 for item in _factor_mod(values, prime))


def _square_root_mod(value: int, prime: int) -> int:
    value %= prime
    if value == 0:
        return 0
    if pow(value, (prime - 1) // 2, prime) != 1:
        raise ArithmeticError("a required finite-field square root does not exist")
    if prime % 4 == 3:
        return pow(value, (prime + 1) // 4, prime)
    odd = prime - 1
    exponent = 0
    while odd % 2 == 0:
        odd //= 2
        exponent += 1
    nonsquare = 2
    while pow(nonsquare, (prime - 1) // 2, prime) != prime - 1:
        nonsquare += 1
    current = pow(value, odd, prime)
    root = pow(value, (odd + 1) // 2, prime)
    factor = pow(nonsquare, odd, prime)
    level = exponent
    while current != 1:
        index = 1
        probe = current * current % prime
        while index < level and probe != 1:
            probe = probe * probe % prime
            index += 1
        correction = pow(factor, 1 << (level - index - 1), prime)
        root = root * correction % prime
        factor = correction * correction % prime
        current = current * factor % prime
        level = index
    return root


def _convolution(left: list[int], right: list[int]) -> list[int]:
    return _multiply(left, right)


def _exact_polynomial_quotient(dividend: list[int], divisor: list[int]) -> list[int]:
    """Return the exact quotient of two ascending integral polynomials."""
    remainder = _trim(dividend)
    divisor = _trim(divisor)
    if _degree(divisor) < 0:
        raise ZeroDivisionError("polynomial division by zero")
    if _degree(remainder) < _degree(divisor):
        raise ArithmeticError("polynomial quotient is not exact")
    quotient = [0 for _ in range(_degree(remainder) - _degree(divisor) + 1)]
    leading = divisor[-1]
    while _degree(remainder) >= _degree(divisor):
        if remainder[-1] % leading != 0:
            raise ArithmeticError("polynomial quotient is not integral")
        offset = _degree(remainder) - _degree(divisor)
        scalar = remainder[-1] // leading
        quotient[offset] = scalar
        for index, value in enumerate(divisor):
            remainder[index + offset] -= scalar * value
        remainder = _trim(remainder)
    if remainder != [0]:
        raise ArithmeticError("polynomial quotient is not exact")
    return _trim(quotient)


def _elliptic_cubic_lpolynomial(values: list[int], prime: int) -> list[int]:
    values = _trim([value % prime for value in values])
    if not _is_squarefree_cubic(values, prime):
        raise ArithmeticError("an elliptic normalization cubic is singular")
    leading = values[3]
    a2 = values[2] % prime
    a4 = leading * values[1] % prime
    a6 = leading * leading * values[0] % prime
    elliptic_curves = __import__(
        "sagejs._baselib.elliptic_curves", fromlist=["EllipticCurve"]
    )
    elliptic = elliptic_curves.EllipticCurve([0, a2, 0, a4, a6])
    trace = int(elliptic.ap(prime))
    return [1, -trace, prime]


def _normalize_almost_good(values: list[int], prime: int) -> list[int]:
    values = _trim(values)
    if _degree(values) not in [5, 6]:
        raise LocalReductionUnsupportedError(
            "the almost-good algorithm requires branch degree 5 or 6"
        )
    if _degree(values) == 5:
        shift = 0
        translated = values
        while translated[0] == 0:
            shift += 1
            translated = _translate_scale(values, 1, shift)
            if shift > 32:
                raise ArithmeticError("failed to move a finite branch point")
        padded = translated + [0 for _ in range(7 - len(translated))]
        values = list(reversed(padded))

    leading_valuation = _valuation(values[6], prime)
    finite_minimum = min(_valuation(value, prime) for value in values[:6])
    if leading_valuation > 1 or leading_valuation > finite_minimum:
        exponent = max(
            _ceil_div(leading_valuation - _valuation(values[index], prime), 6 - index)
            for index in range(6)
        )
        removed = 2 * (leading_valuation // 2)
        values = [
            value * prime ** ((6 - index) * exponent - removed)
            for index, value in enumerate(values)
        ]
        leading_valuation = _valuation(values[6], prime)

    normalized = _exact_scalar_divide(values, prime**leading_valuation)
    for _iteration in range(MAX_ALMOST_GOOD_ITERATIONS):
        repeated = _multiplicity_part(normalized, prime, 6)
        if _degree(repeated) == 0:
            return [value * prime**leading_valuation for value in normalized]
        if _degree(repeated) != 1:
            raise LocalReductionUnsupportedError(
                "the almost-good normalization found a non-rational six-root cluster",
                {"sixfold_factor": repeated},
            )
        root = -repeated[0] % prime
        normalized = _exact_scalar_divide(
            _translate_scale(normalized, prime, root), prime**6
        )
    raise LocalReductionUnsupportedError("the almost-good normalization did not stop")


def _almost_good_type(values: list[int], prime: int) -> tuple[str, list[int]]:
    leading_valuation = _valuation(values[-1], prime)
    primitive = _exact_scalar_divide(values, prime**leading_valuation)
    repeated = _multiplicity_part(primitive, prime, 3)
    degree = _degree(repeated)
    if degree == 1:
        return "1", repeated
    if degree == 2:
        discriminant = (repeated[1] * repeated[1] - 4 * repeated[0]) % prime
        square = discriminant == 0 or pow(discriminant, (prime - 1) // 2, prime) == 1
        return ("2a" if square else "2b"), repeated
    if degree == 3:
        return "4", repeated
    raise LocalReductionUnsupportedError(
        "the reduction is not one of the genus-2 almost-good cluster types",
        {"triple_factor": repeated},
    )


def _type1(values: list[int], prime: int) -> tuple[list[int], dict[str, Any]]:
    reduced = [value % prime for value in values]
    repeated = _multiplicity_part(reduced, prime, 3)
    if _degree(repeated) != 1:
        raise ArithmeticError("type 1 requires one rational triple cluster")
    root = -repeated[0] % prime
    shifted = _translate_scale(reduced, 1, root)
    first = [shifted[6 - index] % prime for index in range(4)]
    factors = [_elliptic_cubic_lpolynomial(first, prime)]
    current = values
    depth = 0
    for index in range(1, MAX_ALMOST_GOOD_ITERATIONS + 1):
        current = _exact_scalar_divide(_translate_scale(current, prime, root), prime**3)
        cubic = [value % prime for value in current]
        if index % 2 == 0 and _is_squarefree_cubic(cubic, prime):
            factors.append(_elliptic_cubic_lpolynomial(cubic, prime))
            depth = index
            break
        repeated = _multiplicity_part(cubic, prime, 3)
        if _degree(repeated) != 1:
            raise LocalReductionUnsupportedError(
                "type 1 refinement left the certified cluster pattern"
            )
        root = -repeated[0] % prime
    if len(factors) != 2:
        raise LocalReductionUnsupportedError("type 1 refinement did not stop")
    return _convolution(factors[0], factors[1]), {
        "elliptic_factors": factors,
        "refinement_depth": depth,
    }


def _type2a(values: list[int], prime: int) -> tuple[list[int], dict[str, Any]]:
    leading_valuation = _valuation(values[-1], prime)
    if leading_valuation == 1:
        values = _exact_scalar_divide(values, prime)
    repeated = _multiplicity_part(values, prime, 3)
    if _degree(repeated) != 2:
        raise ArithmeticError("type 2a requires a quadratic triple factor")
    discriminant = (repeated[1] * repeated[1] - 4 * repeated[0]) % prime
    square_root = _square_root_mod(discriminant, prime)
    inverse_two = (prime + 1) // 2
    roots = [
        (-repeated[1] + square_root) * inverse_two % prime,
        (-repeated[1] - square_root) * inverse_two % prime,
    ]
    factors = []
    depths = []
    for initial_root in roots:
        current = values
        root = initial_root
        for depth in range(1, MAX_ALMOST_GOOD_ITERATIONS + 1):
            current = _exact_scalar_divide(
                _translate_scale(current, prime, root), prime**3
            )
            cubic = [value % prime for value in current]
            if _is_squarefree_cubic(cubic, prime):
                factors.append(_elliptic_cubic_lpolynomial(cubic, prime))
                depths.append(depth)
                break
            nested = _multiplicity_part(cubic, prime, 3)
            if _degree(nested) != 1:
                raise LocalReductionUnsupportedError(
                    "type 2a refinement left the certified cluster pattern"
                )
            root = -nested[0] % prime
    if len(factors) != 2:
        raise LocalReductionUnsupportedError("type 2a refinement did not stop")
    return _convolution(factors[0], factors[1]), {
        "elliptic_factors": factors,
        "refinement_depths": depths,
    }


def _type4(values: list[int], prime: int) -> tuple[list[int], dict[str, Any]]:
    if all(value % prime == 0 for value in values):
        values = _exact_scalar_divide(values, prime)
    repeated = _multiplicity_part(values, prime, 5)
    if _degree(repeated) != 1:
        raise ArithmeticError("type 4 requires a rational five-root cluster")
    root = -repeated[0] % prime
    current = values
    first = None
    outer_depth = 0
    for iteration in range(1, MAX_ALMOST_GOOD_ITERATIONS + 1):
        depth = iteration
        current = _exact_scalar_divide(_translate_scale(current, prime, root), prime**5)
        reduced = [value % prime for value in current]
        triple = _multiplicity_part(reduced, prime, 3)
        if _degree(triple) == 1:
            root = -triple[0] % prime
            quotient = _divmod_mod(reduced, _multiply_mod(triple, triple, prime), prime)
            if _degree(quotient[1]) >= 0 and quotient[1] != [0]:
                raise ArithmeticError("type 4 normalization quotient was not exact")
            first_cubic = quotient[0]
            if not _is_squarefree_cubic(first_cubic, prime):
                raise LocalReductionUnsupportedError(
                    "type 4 outer elliptic component is singular"
                )
            first = _elliptic_cubic_lpolynomial(first_cubic, prime)
            outer_depth = depth
            break
        repeated = _multiplicity_part(reduced, prime, 5)
        if _degree(repeated) != 1:
            raise LocalReductionUnsupportedError(
                "type 4 refinement left the certified cluster pattern"
            )
        root = -repeated[0] % prime
    if first is None:
        raise LocalReductionUnsupportedError("type 4 outer refinement did not stop")
    second = None
    inner_depth = 0
    for depth in range(1, MAX_ALMOST_GOOD_ITERATIONS + 1):
        current = _exact_scalar_divide(_translate_scale(current, prime, root), prime**3)
        cubic = [value % prime for value in current]
        if _is_squarefree_cubic(cubic, prime):
            second = _elliptic_cubic_lpolynomial(cubic, prime)
            inner_depth = depth
            break
        triple = _multiplicity_part(cubic, prime, 3)
        if _degree(triple) != 1:
            raise LocalReductionUnsupportedError(
                "type 4 inner refinement left the certified cluster pattern"
            )
        root = -triple[0] % prime
    if second is None:
        raise LocalReductionUnsupportedError("type 4 inner refinement did not stop")
    return _convolution(first, second), {
        "elliptic_factors": [first, second],
        "outer_refinement_depth": outer_depth,
        "inner_refinement_depth": inner_depth,
    }


def _pair_add(
    left: tuple[int, int], right: tuple[int, int], prime: int
) -> tuple[int, int]:
    return ((left[0] + right[0]) % prime, (left[1] + right[1]) % prime)


def _pair_multiply(
    left: tuple[int, int],
    right: tuple[int, int],
    modulus: list[int],
    prime: int,
) -> tuple[int, int]:
    constant = (left[0] * right[0] - left[1] * right[1] * modulus[0]) % prime
    linear = (
        left[0] * right[1] + left[1] * right[0] - left[1] * right[1] * modulus[1]
    ) % prime
    return constant, linear


def _pair_multiply_integer(
    left: tuple[int, int], right: tuple[int, int], modulus: list[int]
) -> tuple[int, int]:
    return (
        left[0] * right[0] - left[1] * right[1] * modulus[0],
        left[0] * right[1] + left[1] * right[0] - left[1] * right[1] * modulus[1],
    )


def _pair_pow(
    value: tuple[int, int], exponent: int, modulus: list[int], prime: int
) -> tuple[int, int]:
    answer = (1, 0)
    power = value
    remaining = exponent
    while remaining:
        if remaining & 1:
            answer = _pair_multiply(answer, power, modulus, prime)
        remaining //= 2
        if remaining:
            power = _pair_multiply(power, power, modulus, prime)
    return answer


def _extension_elliptic_trace(
    cubic: list[tuple[int, int]], modulus: list[int], prime: int
) -> int:
    field_order = prime * prime
    if field_order > MAX_QUADRATIC_EXTENSION_ORDER:
        raise LocalReductionUnsupportedError(
            "type 2b needs an elliptic point count over F_(p^2) beyond the current bound",
            {
                "field_order": field_order,
                "maximum_field_order": MAX_QUADRATIC_EXTENSION_ORDER,
            },
        )
    total = 0
    exponent = (field_order - 1) // 2
    for constant in range(prime):
        for linear in range(prime):
            x_value = (constant, linear)
            value = (0, 0)
            for coefficient in reversed(cubic):
                value = _pair_add(
                    _pair_multiply(value, x_value, modulus, prime),
                    coefficient,
                    prime,
                )
            if value == (0, 0):
                continue
            character = _pair_pow(value, exponent, modulus, prime)
            if character == (1, 0):
                total += 1
            elif character == ((prime - 1) % prime, 0):
                total -= 1
            else:
                raise ArithmeticError("quadratic character left the prime subfield")
    return -total


def _pair_poly_translate_scale_integer(
    values: list[tuple[int, int]],
    scale: int,
    shift: tuple[int, int],
    modulus: list[int],
) -> list[tuple[int, int]]:
    degree = len(values) - 1
    answer = [(0, 0) for _ in range(degree + 1)]
    powers = [(1, 0)]
    for _index in range(degree):
        powers.append(_pair_multiply_integer(powers[-1], shift, modulus))
    for source_degree, coefficient in enumerate(values):
        for target_degree in range(source_degree + 1):
            scalar = _binomial(source_degree, target_degree) * scale**target_degree
            term = _pair_multiply_integer(
                coefficient, powers[source_degree - target_degree], modulus
            )
            previous = answer[target_degree]
            answer[target_degree] = (
                previous[0] + scalar * term[0],
                previous[1] + scalar * term[1],
            )
    return answer


def _pair_text(value: tuple[int, int]) -> str:
    constant, linear = value
    if linear == 0:
        return str(constant)
    linear_term = "z" if abs(linear) == 1 else str(abs(linear)) + "*z"
    if linear < 0:
        linear_term = "-" + linear_term
    if constant == 0:
        return linear_term
    return "(" + str(constant) + ("+" if linear > 0 else "") + linear_term + ")"


def _quadratic_elliptic_trace_smalljac(
    cubic: list[tuple[int, int]], modulus: list[int], prime: int
) -> int | None:
    field_order = prime * prime
    if field_order > 17_592_186_044_415:
        return None
    leading = cubic[3]
    a2 = cubic[2]
    a4 = _pair_multiply(leading, cubic[1], modulus, prime)
    a6 = _pair_multiply(
        _pair_multiply(leading, leading, modulus, prime),
        cubic[0],
        modulus,
        prime,
    )
    curve_text = (
        "[0,"
        + _pair_text(a2)
        + ",0,"
        + _pair_text(a4)
        + ","
        + _pair_text(a6)
        + "]/(z^2+"
        + str(modulus[1])
        + "*z+"
        + str(modulus[0])
        + ")"
    )
    try:
        backend = runtime.flint_backend()
        function = runtime.reflect.get(backend, "smalljacLpolyBatch")
        if function is runtime.undefined:
            return None
        options = runtime.object.create(None)
        runtime.reflect.set(options, "maxRows", 1)
        batch = runtime.reflect.apply(
            function,
            backend,
            [
                curve_text,
                runtime.bigint(field_order),
                runtime.bigint(field_order),
                options,
            ],
        )
        if (
            int(runtime.reflect.get(batch, "status")) != 0
            or int(runtime.reflect.get(batch, "genus")) != 1
            or int(runtime.reflect.get(batch, "rowCount")) != 1
        ):
            return None
        primes = runtime.reflect.get(batch, "primes")
        good = runtime.reflect.get(batch, "good")
        counts = runtime.reflect.get(batch, "coefficientCounts")
        coefficients = runtime.reflect.get(batch, "coefficients")
        if (
            runtime.integer_bigint(primes[0]) != runtime.bigint(field_order)
            or int(good[0]) != 1
            or int(counts[0]) != 1
        ):
            return None
        return -int(runtime.integer_bigint(coefficients[0]))
    except Exception:
        return None


def _type2b(values: list[int], prime: int) -> tuple[list[int], dict[str, Any]]:
    leading_valuation = _valuation(values[-1], prime)
    if leading_valuation == 1:
        values = _exact_scalar_divide(values, prime)
    repeated = _multiplicity_part(values, prime, 3)
    if _degree(repeated) != 2:
        raise ArithmeticError("type 2b requires an irreducible quadratic triple factor")
    modulus = [value % prime for value in repeated]
    # Exact coefficient pairs in Z[theta], theta^2+b*theta+c=0.
    current = [(value, 0) for value in values]
    shift = (0, 1)
    depth = 0
    cubic: list[tuple[int, int]] | None = None
    for iteration in range(1, MAX_ALMOST_GOOD_ITERATIONS + 1):
        depth = iteration
        translated = _pair_poly_translate_scale_integer(current, prime, shift, modulus)
        divided = []
        for coefficient in translated:
            divisor = prime**3
            if coefficient[0] % divisor != 0 or coefficient[1] % divisor != 0:
                raise ArithmeticError("type 2b refinement was not integral")
            divided.append((coefficient[0] // divisor, coefficient[1] // divisor))
        current = divided
        reduced = [
            (coefficient[0] % prime, coefficient[1] % prime) for coefficient in current
        ]
        # A cubic over F_(p^2) is smooth precisely when its discriminant is nonzero.
        a, b, c, d = reduced[:4]
        b2 = _pair_multiply(b, b, modulus, prime)
        c2 = _pair_multiply(c, c, modulus, prime)
        discriminant = (0, 0)
        terms = [
            (
                18,
                _pair_multiply(
                    _pair_multiply(
                        _pair_multiply(a, b, modulus, prime), c, modulus, prime
                    ),
                    d,
                    modulus,
                    prime,
                ),
            ),
            (
                -4,
                _pair_multiply(
                    _pair_multiply(
                        _pair_multiply(b, b, modulus, prime), b, modulus, prime
                    ),
                    d,
                    modulus,
                    prime,
                ),
            ),
            (1, _pair_multiply(b2, c2, modulus, prime)),
            (
                -4,
                _pair_multiply(
                    a,
                    _pair_multiply(
                        _pair_multiply(c, c, modulus, prime), c, modulus, prime
                    ),
                    modulus,
                    prime,
                ),
            ),
            (
                -27,
                _pair_multiply(
                    _pair_multiply(a, a, modulus, prime),
                    _pair_multiply(d, d, modulus, prime),
                    modulus,
                    prime,
                ),
            ),
        ]
        for scalar, term in terms:
            discriminant = _pair_add(
                discriminant, (scalar * term[0], scalar * term[1]), prime
            )
        if discriminant != (0, 0):
            cubic = reduced[:4]
            break
        leading = reduced[3]
        if leading == (0, 0):
            raise ArithmeticError("type 2b refinement did not produce a cubic")
        leading_inverse = _pair_pow(leading, prime * prime - 2, modulus, prime)
        if prime == 3:
            root_cube = _pair_multiply(
                ((-reduced[0][0]) % prime, (-reduced[0][1]) % prime),
                leading_inverse,
                modulus,
                prime,
            )
            root = _pair_pow(root_cube, 3, modulus, prime)
        else:
            root = _pair_multiply(
                ((-reduced[2][0]) % prime, (-reduced[2][1]) % prime),
                _pair_pow(
                    ((3 * leading[0]) % prime, (3 * leading[1]) % prime),
                    prime * prime - 2,
                    modulus,
                    prime,
                ),
                modulus,
                prime,
            )
        root_square = _pair_multiply(root, root, modulus, prime)
        root_cube = _pair_multiply(root_square, root, modulus, prime)
        value = _pair_add(
            _pair_add(
                reduced[0],
                _pair_multiply(reduced[1], root, modulus, prime),
                prime,
            ),
            _pair_add(
                _pair_multiply(reduced[2], root_square, modulus, prime),
                _pair_multiply(reduced[3], root_cube, modulus, prime),
                prime,
            ),
            prime,
        )
        derivative = _pair_add(
            reduced[1],
            _pair_add(
                _pair_multiply(
                    (2 * reduced[2][0], 2 * reduced[2][1]),
                    root,
                    modulus,
                    prime,
                ),
                _pair_multiply(
                    (3 * reduced[3][0], 3 * reduced[3][1]),
                    root_square,
                    modulus,
                    prime,
                ),
                prime,
            ),
            prime,
        )
        second_derivative = _pair_add(
            (2 * reduced[2][0], 2 * reduced[2][1]),
            _pair_multiply(
                (6 * reduced[3][0], 6 * reduced[3][1]),
                root,
                modulus,
                prime,
            ),
            prime,
        )
        if value != (0, 0) or derivative != (0, 0) or second_derivative != (0, 0):
            raise ArithmeticError("singular type 2b cubic has no triple root")
        shift = root
    if cubic is None:
        raise LocalReductionUnsupportedError("type 2b refinement did not stop")
    trace = _quadratic_elliptic_trace_smalljac(cubic, modulus, prime)
    trace_backend = "smalljac-quadratic"
    if trace is None:
        trace = _extension_elliptic_trace(cubic, modulus, prime)
        trace_backend = "quadratic-character-sum"
    return [1, 0, -trace, 0, prime * prime], {
        "quadratic_factor": modulus,
        "elliptic_trace_over_quadratic_field": trace,
        "elliptic_trace_backend": trace_backend,
        "refinement_depth": depth,
    }


def _completed_integral_branch(
    curve: Any, prime: int
) -> tuple[list[int], dict[str, Any]]:
    model = curve._smalljac_integral_model_data()
    excluded = int(model["excluded_denominator"])
    if excluded % prime == 0:
        raise LocalReductionUnsupportedError(
            "the checked integral model is not valid at this prime",
            {"excluded_denominator": excluded},
        )
    f_values = [int(value) for value in model["f_coefficients"]]
    h_values = [int(value) for value in model["h_coefficients"]]
    branch = _multiply(h_values, h_values)
    if len(branch) < len(f_values):
        branch.extend([0 for _ in range(len(f_values) - len(branch))])
    for index, value in enumerate(f_values):
        branch[index] += 4 * value
    return _trim(branch), {
        "transform": model["transform"],
        "excluded_denominator": excluded,
    }


def _integer_gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def _rational_pair(value: Any) -> tuple[int, int]:
    rational = sage.QQ(value)
    numerator = int(rational._numerator)
    denominator = int(rational._denominator)
    if denominator < 0:
        numerator = -numerator
        denominator = -denominator
    return numerator, denominator


def _rational_reduce(numerator: int, denominator: int) -> tuple[int, int]:
    if denominator == 0:
        raise ZeroDivisionError("rational denominator is zero")
    if denominator < 0:
        numerator = -numerator
        denominator = -denominator
    divisor = _integer_gcd(numerator, denominator)
    return numerator // divisor, denominator // divisor


def _rational_subtract(
    left: tuple[int, int], right: tuple[int, int]
) -> tuple[int, int]:
    return _rational_reduce(left[0] * right[1] - right[0] * left[1], left[1] * right[1])


def _rational_multiply(
    left: tuple[int, int], right: tuple[int, int]
) -> tuple[int, int]:
    return _rational_reduce(left[0] * right[0], left[1] * right[1])


def _rational_valuation(value: tuple[int, int], prime: int) -> int:
    if value[0] == 0:
        raise ArithmeticError("distinct branch roots unexpectedly coincide")
    return _valuation(value[0], prime) - _valuation(value[1], prime)


def _rational_unit_mod(value: tuple[int, int], prime: int) -> int:
    numerator, denominator = value
    valuation = _rational_valuation(value, prime)
    if valuation >= 0:
        numerator //= prime**valuation
    else:
        denominator //= prime ** (-valuation)
    if denominator % prime == 0:
        raise ArithmeticError("a rational unit retained a prime denominator")
    return numerator % prime * pow(denominator % prime, prime - 2, prime) % prime


def _split_branch_roots(values: list[int], prime: int) -> tuple[list[Any], int]:
    ring = sage.PolynomialRing(sage.QQ, "x_cluster")
    factorization = ring(values).factor()
    roots = []
    for factor, exponent in factorization:
        coefficients = list(factor)
        if int(exponent) != 1 or len(coefficients) != 2:
            raise LocalReductionUnsupportedError(
                "the semistable cluster path currently requires a split rational branch locus"
            )
        root = _rational_reduce(
            -int(coefficients[0]._numerator), int(coefficients[0]._denominator)
        )
        linear = _rational_pair(coefficients[1])
        root = _rational_reduce(root[0] * linear[1], root[1] * linear[0])
        if root[1] % prime == 0:
            raise LocalReductionUnsupportedError(
                "the split cluster path requires p-integral rational branch roots",
                {"root": root},
            )
        roots.append(root)
    if len(roots) != _degree(values):
        raise ArithmeticError("the rational branch factorization has the wrong degree")
    return roots, int(values[-1])


def _split_cluster_tree(
    roots: list[Any], prime: int
) -> tuple[dict[str, Any], list[Any]]:
    size = len(roots)
    distances = [[0 for _column in range(size)] for _row in range(size)]
    values = []
    for left in range(size):
        for right in range(left + 1, size):
            valuation = _rational_valuation(
                _rational_subtract(roots[left], roots[right]), prime
            )
            if valuation < 0:
                raise LocalReductionUnsupportedError(
                    "the split cluster path requires p-integral pairwise distances"
                )
            distances[left][right] = valuation
            distances[right][left] = valuation
            values.append(valuation)
    top_depth = min(values)
    maximum_depth = max(values)
    clusters: dict[tuple[int, ...], dict[str, Any]] = {}
    top_key = tuple(range(size))
    top = {"roots": top_key, "depth": top_depth, "parent": None, "children": []}
    clusters[top_key] = top
    for depth in range(top_depth + 1, maximum_depth + 1):
        unseen = set(range(size))
        while unseen:
            seed = min(unseen)
            component = {seed}
            frontier = [seed]
            unseen.remove(seed)
            while frontier:
                current = frontier.pop()
                neighbours = [
                    index
                    for index in list(unseen)
                    if distances[current][index] >= depth
                ]
                for index in neighbours:
                    unseen.remove(index)
                    component.add(index)
                    frontier.append(index)
            if len(component) > 1:
                key = tuple(sorted(component))
                if key not in clusters:
                    clusters[key] = {
                        "roots": key,
                        "depth": depth,
                        "parent": None,
                        "children": [],
                    }
                else:
                    clusters[key]["depth"] = depth
    nodes = list(clusters.values())
    for node in nodes:
        if node is top:
            continue
        candidates = [
            parent
            for parent in nodes
            if len(parent["roots"]) > len(node["roots"])
            and all(index in parent["roots"] for index in node["roots"])
        ]
        parent = min(candidates, key=lambda item: len(item["roots"]))
        node["parent"] = parent
        parent["children"].append(node)
    for node in nodes:
        covered = set()
        for child in node["children"]:
            covered.update(child["roots"])
        for index in node["roots"]:
            if index not in covered:
                node["children"].append(
                    {
                        "roots": (index,),
                        "depth": None,
                        "parent": node,
                        "children": [],
                    }
                )
        node["children"].sort(key=_cluster_root_indices)
    return top, nodes


def _cluster_root_indices(node: dict[str, Any]) -> tuple[int, ...]:
    return node["roots"]


def _cluster_ubereven(node: dict[str, Any]) -> bool:
    return len(node["roots"]) % 2 == 0 and all(
        len(child["roots"]) % 2 == 0 for child in node["children"]
    )


def _cluster_cotwin(node: dict[str, Any], top: dict[str, Any], genus: int) -> bool:
    return not _cluster_ubereven(node) and any(
        len(child["roots"]) == 2 * genus for child in node["children"]
    )


def _cluster_principal(node: dict[str, Any], top: dict[str, Any], genus: int) -> bool:
    if len(node["roots"]) <= 2 or _cluster_cotwin(node, top, genus):
        return False
    if node is top and len(node["roots"]) % 2 == 0:
        return len(node["children"]) >= 3
    return True


def _cluster_nu(
    node: dict[str, Any], top: dict[str, Any], leading: int, prime: int
) -> int:
    answer = _valuation(leading, prime) + len(node["roots"]) * int(node["depth"])
    for index in top["roots"]:
        if index in node["roots"]:
            continue
        meet = node
        while index not in meet["roots"]:
            meet = meet["parent"]
        answer += int(meet["depth"])
    return answer


def _cluster_child_residue(
    child: dict[str, Any], node: dict[str, Any], roots: list[Any], prime: int
) -> int:
    difference = _rational_subtract(roots[child["roots"][0]], roots[node["roots"][0]])
    depth = int(node["depth"])
    numerator, denominator = difference
    if depth >= 0:
        divisor = prime**depth
        if numerator % divisor != 0:
            raise ArithmeticError("a child centre has insufficient cluster depth")
        numerator //= divisor
    else:
        denominator *= prime ** (-depth)
    return numerator % prime * pow(denominator % prime, prime - 2, prime) % prime


def _split_component_polynomial(
    node: dict[str, Any], roots: list[Any], leading: int, prime: int
) -> list[int]:
    polynomial = [
        _rational_unit_mod(_cluster_theta_squared(node, roots, leading), prime)
    ]
    for child in node["children"]:
        if len(child["roots"]) % 2 == 1:
            residue = _cluster_child_residue(child, node, roots, prime)
            polynomial = _multiply_mod(polynomial, [(-residue) % prime, 1], prime)
    return _trim(polynomial)


def _cluster_theta_squared(
    node: dict[str, Any], roots: list[Any], leading: int
) -> tuple[int, int]:
    theta_squared = (leading, 1)
    center = roots[node["roots"][0]]
    for index, root in enumerate(roots):
        if index not in node["roots"]:
            theta_squared = _rational_multiply(
                theta_squared, _rational_subtract(center, root)
            )
    return theta_squared


def _cluster_star(
    node: dict[str, Any], top: dict[str, Any], genus: int
) -> dict[str, Any]:
    if _cluster_cotwin(node, top, genus):
        for child in node["children"]:
            if len(child["roots"]) == 2 * genus:
                return child
        raise ArithmeticError("a cotwin has no 2g child")
    answer = node
    while answer["parent"] is not None and _cluster_ubereven(answer["parent"]):
        answer = answer["parent"]
    return answer


def _cluster_frobenius_sign(
    node: dict[str, Any], roots: list[Any], leading: int, prime: int
) -> int:
    unit = _rational_unit_mod(_cluster_theta_squared(node, roots, leading), prime)
    character = pow(unit, (prime - 1) // 2, prime)
    if character == 1:
        return 1
    if character == prime - 1:
        return -1
    raise ArithmeticError("a split cluster theta value is not a unit")


def _split_cluster_certificate_node(
    node: dict[str, Any], top: dict[str, Any], genus: int
) -> dict[str, Any]:
    return {
        "root_indices": list(node["roots"]),
        "depth": node["depth"],
        "principal": _cluster_principal(node, top, genus),
        "ubereven": _cluster_ubereven(node),
        "children": [
            _split_cluster_certificate_node(child, top, genus)
            for child in node["children"]
        ],
    }


def _semistable_split_cluster_data(curve: Any, prime: int) -> LocalReductionData:
    branch, model_certificate = _completed_integral_branch(curve, prime)
    roots, leading = _split_branch_roots(branch, prime)
    top, nodes = _split_cluster_tree(roots, prime)
    genus = curve.genus()
    if len(nodes) == 1:
        raise LocalReductionUnsupportedError(
            "the split picture has no proper bad-reduction cluster"
        )
    principal = [node for node in nodes if _cluster_principal(node, top, genus)]
    if not principal:
        raise LocalReductionUnsupportedError(
            "the split branch picture has no principal cluster"
        )
    for node in principal:
        nu = _cluster_nu(node, top, leading, prime)
        if nu % 2 != 0:
            raise LocalReductionUnsupportedError(
                "the split cluster picture fails the semistability parity criterion",
                {"root_indices": list(node["roots"]), "nu": nu},
            )
    component_factors = []
    component_certificates = []
    abelian_coefficients = [1]
    for node in principal:
        component_polynomial = _split_component_polynomial(node, roots, leading, prime)
        odd_children = sum(
            1 for child in node["children"] if len(child["roots"]) % 2 == 1
        )
        component_genus = max(0, (odd_children - 1) // 2)
        factor = _normalization_factor(component_polynomial, prime)
        if _degree(factor) != 2 * component_genus:
            raise ArithmeticError(
                "a split cluster component factor has the wrong degree"
            )
        component_factors.append(factor)
        abelian_coefficients = _convolution(abelian_coefficients, factor)
        component_certificates.append(
            {
                "root_indices": list(node["roots"]),
                "depth": node["depth"],
                "nu": _cluster_nu(node, top, leading, prime),
                "genus": component_genus,
                "polynomial_mod_p_ascending": component_polynomial,
                "euler_coefficients": factor,
            }
        )
    relevant_even = [
        node
        for node in nodes
        if node is not top
        and len(node["roots"]) % 2 == 0
        and not _cluster_ubereven(node)
    ]
    toric_rank = len(relevant_even) - (1 if _cluster_ubereven(top) else 0)
    if toric_rank < 0:
        raise ArithmeticError("the split cluster toric rank is negative")
    graph_basis = []
    top_ubereven = _cluster_ubereven(top)
    top_star_nodes = []
    for node in relevant_even:
        star = _cluster_star(node, top, genus)
        if top_ubereven and star is top:
            top_star_nodes.append(node)
            continue
        sign = _cluster_frobenius_sign(star, roots, leading, prime)
        graph_basis.append(
            {
                "root_indices": list(node["roots"]),
                "star_root_indices": list(star["roots"]),
                "frobenius_sign": sign,
            }
        )
    if top_star_nodes:
        sign = _cluster_frobenius_sign(top, roots, leading, prime)
        for node in top_star_nodes[1:]:
            graph_basis.append(
                {
                    "root_indices": list(node["roots"]),
                    "star_root_indices": list(top["roots"]),
                    "frobenius_sign": sign,
                    "relation_quotient": True,
                }
            )
    if len(graph_basis) != toric_rank:
        raise ArithmeticError("the split cluster Frobenius basis has the wrong rank")
    graph_coefficients = [1]
    for item in graph_basis:
        graph_coefficients = _convolution(
            graph_coefficients, [1, -int(item["frobenius_sign"])]
        )
    coefficients = _convolution(abelian_coefficients, graph_coefficients)
    if _degree(coefficients) != 2 * genus - toric_rank:
        raise ArithmeticError("the split cluster local factor has the wrong degree")
    certificate = {
        "theorem": "split semistable cluster-picture decomposition",
        "completed_branch_coefficients_ascending": branch,
        "rational_roots": [list(root) for root in roots],
        "cluster_picture": _split_cluster_certificate_node(top, top, genus),
        "component_curves": component_certificates,
        "abelian_euler_coefficients": abelian_coefficients,
        "dual_graph_euler_coefficients": graph_coefficients,
        "toric_basis": graph_basis,
        "frobenius_action": "split-diagonal-with-theta-signs",
        **model_certificate,
    }
    return LocalReductionData(
        prime,
        genus,
        coefficients,
        toric_rank,
        reduction_type="semistable_split_cluster",
        curve_good_reduction=False,
        jacobian_good_reduction=toric_rank == 0,
        semistable=True,
        toric_rank=toric_rank,
        backend="semistable-split-cluster-picture",
        certificate=certificate,
    )


def _almost_good_data(curve: Any, prime: int) -> LocalReductionData:
    if curve.genus() != 2:
        raise LocalReductionUnsupportedError(
            "almost-good reduction is currently implemented only in genus 2"
        )
    branch, model_certificate = _completed_integral_branch(curve, prime)
    normalized = _normalize_almost_good(branch, prime)
    kind, repeated = _almost_good_type(normalized, prime)
    if kind == "1":
        coefficients, details = _type1(normalized, prime)
    elif kind == "2a":
        coefficients, details = _type2a(normalized, prime)
    elif kind == "2b":
        coefficients, details = _type2b(normalized, prime)
    else:
        coefficients, details = _type4(normalized, prime)
    _frobenius()._validate_lpolynomial(prime, 2, coefficients, [])
    certificate = {
        "theorem": "Maistret-Sutherland Algorithm 7",
        "almost_good_type": kind,
        "normalized_branch_coefficients_ascending": normalized,
        "triple_factor_mod_p": repeated,
        **model_certificate,
        **details,
    }
    return LocalReductionData(
        prime,
        2,
        coefficients,
        0,
        reduction_type="almost_good_type_" + kind,
        curve_good_reduction=False,
        jacobian_good_reduction=True,
        semistable=None,
        toric_rank=0,
        backend="maistret-sutherland",
        certificate=certificate,
    )


def _mobius_move_infinity(
    values: list[int], genus: int, prime: int
) -> tuple[list[int], int]:
    projective_degree = 2 * genus + 2
    padded = list(values) + [0 for _ in range(projective_degree + 1 - len(values))]
    shift = 0
    while shift < prime:
        evaluation = 0
        for coefficient in reversed(padded):
            evaluation = (evaluation * shift + coefficient) % prime
        if evaluation != 0:
            answer = [0 for _ in range(projective_degree + 1)]
            for source_degree, coefficient in enumerate(padded):
                for inverse_power in range(source_degree + 1):
                    target_degree = projective_degree - inverse_power
                    answer[target_degree] += (
                        coefficient
                        * _binomial(source_degree, inverse_power)
                        * shift ** (source_degree - inverse_power)
                    )
            return _trim(answer), shift
        shift += 1
    raise LocalReductionUnsupportedError("the branch polynomial vanishes modulo p")


def _quadratic_character_mod_factor(
    values: list[int], factor: list[int], prime: int
) -> int:
    degree = _degree(factor)
    reduced = _remainder_mod(values, factor, prime)
    if reduced == [0]:
        raise ArithmeticError("a node also lies on the normalization branch locus")
    character = _powmod_polynomial(reduced, (prime**degree - 1) // 2, factor, prime)
    character = _trim([value % prime for value in character])
    if character == [1]:
        return 1
    if character == [prime - 1]:
        return -1
    raise ArithmeticError("a finite-field quadratic character was not scalar")


def _normalization_factor(values: list[int], prime: int) -> list[int]:
    degree = _degree(values)
    genus = max(0, (degree - 1) // 2)
    if genus == 0:
        return [1]
    if genus == 1:
        infinity_points = 1
        if degree % 2 == 0:
            character = pow(values[-1] % prime, (prime - 1) // 2, prime)
            infinity_points = 2 if character == 1 else 0
        character_sum = 0
        for x_value in range(prime):
            evaluation = 0
            for coefficient in reversed(values):
                evaluation = (evaluation * x_value + coefficient) % prime
            if evaluation == 0:
                continue
            character = pow(evaluation, (prime - 1) // 2, prime)
            character_sum += 1 if character == 1 else -1
        trace = 1 - infinity_points - character_sum
        return [1, -trace, prime]
    if genus in [2, 3]:
        finite_fields = __import__("sagejs._baselib.finite_fields", fromlist=["GF"])
        field = finite_fields.GF(prime)
        ring = sage.PolynomialRing(field, "x")
        model = __import__(
            "sagejs.hyperelliptic_curves.model", fromlist=["HyperellipticCurve"]
        )
        reduced_curve = model.HyperellipticCurve(ring(values))
        return [int(value) for value in reduced_curve._lpolynomial_coefficients("auto")]
    raise LocalReductionUnsupportedError(
        "the semistable normalization has unsupported positive genus",
        {"normalization_genus": genus},
    )


def _semistable_data(curve: Any, prime: int) -> LocalReductionData:
    attempts = []
    try:
        return _semistable_nodal_data(curve, prime)
    except (ArithmeticError, LocalReductionUnsupportedError) as error:
        attempts.append({"method": "ordinary-nodal-model", "error": str(error)})
    try:
        return _semistable_split_cluster_data(curve, prime)
    except (ArithmeticError, LocalReductionUnsupportedError) as error:
        attempts.append({"method": "split-cluster-picture", "error": str(error)})
    raise LocalReductionUnsupportedError(
        "no certified semistable genus-2/3 theorem applies",
        {"attempts": attempts},
    )


def _semistable_nodal_data(curve: Any, prime: int) -> LocalReductionData:
    branch, model_certificate = _completed_integral_branch(curve, prime)
    common = min(_valuation(value, prime) for value in branch if value != 0)
    removed = 2 * (common // 2)
    branch = _exact_scalar_divide(branch, prime**removed)
    if all(value % prime == 0 for value in branch):
        raise LocalReductionUnsupportedError(
            "an odd scalar valuation requires a ramified reduction analysis",
            {"common_valuation": common},
        )
    moved = False
    shift = 0
    projective_degree = 2 * curve.genus() + 2
    if len(branch) <= projective_degree or branch[projective_degree] % prime == 0:
        branch, shift = _mobius_move_infinity(branch, curve.genus(), prime)
        moved = True
    reduced = [value % prime for value in branch]
    leading = reduced[-1] % prime
    factors = _factor_mod(reduced, prime)
    if all(int(item["multiplicity"]) == 1 for item in factors):
        raise LocalReductionUnsupportedError("the selected model has good reduction")
    if any(int(item["multiplicity"]) not in [1, 2] for item in factors):
        raise LocalReductionUnsupportedError(
            "the special fibre is not an ordinary nodal one-component model",
            {"factorization": factors},
        )
    node_factors = [
        [int(value) for value in item["factor"]]
        for item in factors
        if int(item["multiplicity"]) == 2
    ]
    normalization = [leading]
    for item in factors:
        if int(item["multiplicity"]) == 1:
            normalization = _multiply_mod(
                normalization,
                [int(value) for value in item["factor"]],
                prime,
            )
    if _degree(normalization) <= 0:
        component_character = pow(leading, (prime - 1) // 2, prime)
        if component_character not in [1, prime - 1]:
            raise ArithmeticError("the component character is not quadratic")
        component_sign = 1 if component_character == 1 else -1
        edge_coefficients = [1]
        graph_orbits = []
        for factor in node_factors:
            degree = _degree(factor)
            orbit_sign = component_sign**degree
            orbit_factor = [0 for _ in range(degree + 1)]
            orbit_factor[0] = 1
            orbit_factor[degree] = -orbit_sign
            edge_coefficients = _convolution(edge_coefficients, orbit_factor)
            graph_orbits.append(
                {
                    "irreducible_node_factor": factor,
                    "orbit_degree": degree,
                    "branch_sign": orbit_sign,
                    "factor": orbit_factor,
                }
            )
        component_factor = [1, -component_sign]
        graph_coefficients = _exact_polynomial_quotient(
            edge_coefficients, component_factor
        )
        toric_rank = sum(_degree(factor) for factor in node_factors) - 1
        if toric_rank != curve.genus():
            raise ArithmeticError("the split nodal graph has the wrong rank")
        certificate = {
            "theorem": "normalization-dual-graph semistable factorization",
            "completed_branch_coefficients_ascending": branch,
            "special_fibre_factorization": factors,
            "normalization_components": 2,
            "component_frobenius_sign": component_sign,
            "normalization_euler_coefficients": [1],
            "edge_permutation_coefficients": edge_coefficients,
            "component_permutation_quotient": component_factor,
            "dual_graph_euler_coefficients": graph_coefficients,
            "node_orbits": graph_orbits,
            "removed_even_scalar_valuation": removed,
            "mobius_infinity_move": moved,
            "mobius_shift": shift,
            **model_certificate,
        }
        return LocalReductionData(
            prime,
            curve.genus(),
            graph_coefficients,
            toric_rank,
            reduction_type="semistable_nodal_two_components",
            curve_good_reduction=False,
            jacobian_good_reduction=False,
            semistable=True,
            toric_rank=toric_rank,
            backend="semistable-normalization-graph",
            certificate=certificate,
        )
    normalization_coefficients = _normalization_factor(normalization, prime)
    graph_coefficients = [1]
    graph_orbits = []
    toric_rank = 0
    for factor in node_factors:
        degree = _degree(factor)
        sign = _quadratic_character_mod_factor(normalization, factor, prime)
        orbit_factor = [0 for _ in range(degree + 1)]
        orbit_factor[0] = 1
        orbit_factor[degree] = -sign
        graph_coefficients = _convolution(graph_coefficients, orbit_factor)
        toric_rank += degree
        graph_orbits.append(
            {
                "irreducible_node_factor": factor,
                "orbit_degree": degree,
                "branch_sign": sign,
                "factor": orbit_factor,
            }
        )
    coefficients = _convolution(normalization_coefficients, graph_coefficients)
    expected_degree = 2 * curve.genus() - toric_rank
    if _degree(coefficients) != expected_degree:
        raise ArithmeticError("the semistable local factor has the wrong degree")
    certificate = {
        "theorem": "normalization-dual-graph semistable factorization",
        "completed_branch_coefficients_ascending": branch,
        "special_fibre_factorization": factors,
        "normalization_branch_mod_p": normalization,
        "normalization_euler_coefficients": normalization_coefficients,
        "dual_graph_euler_coefficients": graph_coefficients,
        "node_orbits": graph_orbits,
        "removed_even_scalar_valuation": removed,
        "mobius_infinity_move": moved,
        "mobius_shift": shift,
        **model_certificate,
    }
    return LocalReductionData(
        prime,
        curve.genus(),
        coefficients,
        toric_rank,
        reduction_type="semistable_nodal",
        curve_good_reduction=False,
        jacobian_good_reduction=False,
        semistable=True,
        toric_rank=toric_rank,
        backend="semistable-normalization-graph",
        certificate=certificate,
    )


def local_reduction(
    curve: Any, prime: Any, algorithm: str = "auto"
) -> LocalReductionData:
    """Return certified local Euler and conductor data at one prime.

    Supported algorithms are `auto`, `good`, `almost_good`, and
    `semistable`.  The latter currently proves ordinary nodal reduction with
    one geometrically integral component or two geometrically rational
    components. Prime 2 is deliberately excluded from every bad-reduction
    path because wild inertia needs a different implementation.
    """
    prime = _frobenius()._checked_prime(prime)
    if algorithm not in ["auto", "good", "almost_good", "semistable"]:
        raise ValueError("unknown local-reduction algorithm " + repr(algorithm))
    if algorithm in ["auto", "good"]:
        try:
            reduced = _frobenius()._rational_reduction(curve, prime)
        except ArithmeticError:
            if algorithm == "good":
                raise LocalReductionUnsupportedError(
                    "the curve does not have good reduction in the supplied model"
                ) from None
        else:
            coefficients = reduced._lpolynomial_coefficients("auto")
            return LocalReductionData(
                prime,
                curve.genus(),
                coefficients,
                0,
                reduction_type="good",
                curve_good_reduction=True,
                jacobian_good_reduction=True,
                semistable=True,
                toric_rank=0,
                backend="good-reduction-frobenius",
                certificate={"theorem": "smooth proper base change"},
            )
    if prime == 2:
        raise LocalReductionUnsupportedError(
            "certified bad reduction at 2 is not implemented",
            {"wild_prime": True},
        )
    errors = []
    if algorithm in ["auto", "almost_good"] and curve.genus() == 2:
        try:
            return _almost_good_data(curve, prime)
        except (ArithmeticError, LocalReductionUnsupportedError) as error:
            errors.append({"algorithm": "almost_good", "error": str(error)})
            if algorithm == "almost_good":
                raise
    if algorithm in ["auto", "semistable"]:
        try:
            return _semistable_data(curve, prime)
        except (ArithmeticError, LocalReductionUnsupportedError) as error:
            errors.append({"algorithm": "semistable", "error": str(error)})
            if algorithm == "semistable":
                raise
    raise LocalReductionUnsupportedError(
        "no certified odd-prime local-reduction theorem applies",
        {"prime": prime, "attempts": errors},
    )


def local_euler_factor(curve: Any, prime: Any, algorithm: str = "auto") -> Any:
    """Return `det(1-Frob*T | H^1_et(C)^I_p)` at `prime`."""
    return local_reduction(curve, prime, algorithm).euler_factor


def conductor_exponent(curve: Any, prime: Any, algorithm: str = "auto") -> Any:
    """Return the certified local Artin-conductor exponent at `prime`."""
    return local_reduction(curve, prime, algorithm).conductor_exponent


__all__ = [
    "LocalReductionData",
    "LocalReductionUnsupportedError",
    "conductor_exponent",
    "local_euler_factor",
    "local_reduction",
]
