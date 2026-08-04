# Lazy advanced elliptic-curve algorithms.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _untyped(value: Any) -> Any:
    return value


_core_global = runtime.global_object
_ec_bigint_power = runtime.reflect.get(_core_global, '_ec_bigint_power')
_ec_change_rst = runtime.reflect.get(_core_global, '_ec_change_rst')
_ec_invariants = runtime.reflect.get(_core_global, '_ec_invariants')
_ec_legendre = runtime.reflect.get(_core_global, '_ec_legendre')
_ec_valuation = runtime.reflect.get(_core_global, '_ec_valuation')
_curve_constructor = runtime.reflect.get(_core_global, 'EllipticCurve')
_parent_class = runtime.reflect.get(_core_global, 'EllipticCurveParent')
_point_class = runtime.reflect.get(_core_global, 'EllipticCurvePoint')


def _ec_poly_trim(poly: list[int]) -> list[int]:
    while len(poly) > 1 and poly[-1] == 0:
        poly.pop()
    return poly


def _ec_poly_mod(
    dividend: list[int], divisor: list[int], prime: int,
) -> list[int]:
    answer = [value % prime for value in dividend]
    divisor = _ec_poly_trim([value % prime for value in divisor])
    inverse = pow(divisor[-1], prime - 2, prime)
    while len(answer) >= len(divisor) and not (
        len(answer) == 1 and answer[0] == 0
    ):
        factor = answer[-1] * inverse % prime
        offset = len(answer) - len(divisor)
        for index, coefficient in enumerate(divisor):
            answer[offset + index] = (
                answer[offset + index] - factor * coefficient) % prime
        _ec_poly_trim(answer)
    return answer


def _ec_poly_mul_mod(
    left: list[int], right: list[int], modulus: list[int], prime: int,
) -> list[int]:
    product = [0] * (len(left) + len(right) - 1)
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            product[left_index + right_index] = (
                product[left_index + right_index]
                + left_value * right_value
            ) % prime
    return _ec_poly_mod(product, modulus, prime)


def _ec_cubic_root_count(a_value: Any, b_value: Any, prime: int) -> int:
    modulus = [
        runtime.number(runtime.integer_bigint(b_value) % prime),
        runtime.number(runtime.integer_bigint(a_value) % prime),
        0,
        1,
    ]
    power = [0, 1]
    base = [0, 1]
    exponent = prime
    while exponent:
        if exponent % 2:
            power = _ec_poly_mul_mod(power, base, modulus, prime)
        exponent //= 2
        if exponent:
            base = _ec_poly_mul_mod(base, base, modulus, prime)
    difference = list(power)
    while len(difference) < 2:
        difference.append(0)
    difference[1] = (difference[1] - 1) % prime
    left = _ec_poly_trim(modulus)
    right = _ec_poly_trim(difference)
    while not (len(right) == 1 and right[0] == 0):
        left, right = right, _ec_poly_mod(left, right, prime)
    return len(left) - 1


def _ec_numroots3(
    a_value: int, b_value: int, c_value: int, prime: int,
) -> tuple[int, int]:
    if prime == 2:
        if (c_value + a_value * b_value) % 2:
            return 3, 0
        return (2 if (a_value + b_value) % 2 else 1), b_value % 2
    if a_value % 3 == 0:
        return (3 if b_value % 3 else 1), (-c_value) % 3
    multiple = a_value * b_value % 3
    if b_value % 3 == 2:
        return (2 if (a_value + c_value) % 3 == 0 else 3), multiple
    return (3 if c_value % 3 else 2), multiple


def _ec_numroots2(
    a_value: int, b_value: int, c_value: int, prime: int,
) -> tuple[int, int]:
    if prime == 2:
        return (2 if b_value % 2 else 1), c_value % 2
    roots = 2 if (b_value * b_value - a_value * c_value) % 3 else 1
    return roots, a_value * b_value % 3


class KodairaSymbol:
    """A compact Sage-compatible Kodaira fiber symbol."""

    def __init__(self, code: int) -> None:
        self._code = code
        if code == 1:
            self._roman, self._n, self._starred = 1, 0, False
        elif code in [2, 3, 4]:
            self._roman, self._n, self._starred = code, 0, False
        elif code >= 5:
            self._roman, self._n, self._starred = 1, code - 4, False
        elif code == -1:
            self._roman, self._n, self._starred = 1, 0, True
        elif code in [-2, -3, -4]:
            self._roman, self._n, self._starred = -code, 0, True
        else:
            self._roman, self._n, self._starred = 1, -code - 4, True

    def __repr__(self) -> str:
        if self._roman == 1:
            answer = 'I' + str(self._n)
        else:
            answer = ['', 'I', 'II', 'III', 'IV'][self._roman]
        return answer + ('*' if self._starred else '')

    __str__ = __repr__
    toString = __repr__

    def __eq__(self, other: object) -> bool:
        return isinstance(other, KodairaSymbol) and self._code == other._code


class EllipticCurveLocalData:
    """Exact output of Tate's algorithm for an elliptic curve over ``QQ``."""

    def __init__(
        self,
        curve: Any,
        prime: int,
        minimal_model: Any,
        discriminant_valuation: int,
        conductor_valuation: int,
        kodaira_code: int,
        tamagawa_number: int,
        reduction_type: Any,
    ) -> None:
        self._curve = curve
        self._prime = prime
        self._minimal_model = minimal_model
        self._val_disc = discriminant_valuation
        self._fp = conductor_valuation
        self._kodaira = KodairaSymbol(kodaira_code)
        self._cp = tamagawa_number
        self._reduction_type = reduction_type

    def prime(self) -> int:
        return self._prime

    def curve(self) -> Any:
        return self._curve

    def minimal_model(self, reduce: bool = True) -> Any:
        _ = reduce
        return self._minimal_model

    def discriminant_valuation(self) -> int:
        return self._val_disc

    def conductor_valuation(self) -> int:
        return self._fp

    def kodaira_symbol(self) -> KodairaSymbol:
        return self._kodaira

    def tamagawa_number(self) -> int:
        return self._cp

    def tamagawa_exponent(self) -> int:
        if (
            self._cp == 4 and self._kodaira._roman == 1
            and self._kodaira._starred and self._kodaira._n % 2 == 0
        ):
            return 2
        return self._cp

    def bad_reduction_type(self) -> Any:
        return self._reduction_type

    def has_good_reduction(self) -> bool:
        return self._reduction_type is None

    def has_bad_reduction(self) -> bool:
        return not self.has_good_reduction()

    def has_multiplicative_reduction(self) -> bool:
        return self._reduction_type in [-1, 1]

    def has_split_multiplicative_reduction(self) -> bool:
        return self._reduction_type == 1

    def has_nonsplit_multiplicative_reduction(self) -> bool:
        return self._reduction_type == -1

    def has_additive_reduction(self) -> bool:
        return self._reduction_type == 0

    def __repr__(self) -> str:
        if self._reduction_type is None:
            reduction = 'good'
        elif self._reduction_type == 1:
            reduction = 'bad split multiplicative'
        elif self._reduction_type == -1:
            reduction = 'bad non-split multiplicative'
        else:
            reduction = 'bad additive'
        return '\n'.join([
            'Local data at ' + str(self._prime) + ':',
            'Reduction type: ' + reduction,
            'Local minimal model: ' + str(self._minimal_model),
            'Minimal discriminant valuation: ' + str(self._val_disc),
            'Conductor exponent: ' + str(self._fp),
            'Kodaira Symbol: ' + str(self._kodaira),
            'Tamagawa Number: ' + str(self._cp),
        ])

    __str__ = __repr__
    toString = __repr__


def _ec_tate_large_prime(
    values: list[Any], prime: int,
) -> tuple[int, int, int, Any]:
    """Tate's algorithm for a minimal integral model at ``p > 3``."""
    invariants = _ec_invariants(values)
    c4 = invariants['c4']
    c6 = invariants['c6']
    discriminant = invariants['discriminant']
    discriminant_valuation = _ec_valuation(discriminant, prime)
    if discriminant_valuation == 0:
        return 0, 1, 1, None

    j_denominator_valuation = max(
        0,
        discriminant_valuation - 3 * _ec_valuation(c4, prime),
    )
    if j_denominator_valuation > 0:
        difference = discriminant_valuation - j_denominator_valuation
        if difference == 0:
            split = _ec_legendre(-c6, prime) == 1
            tamagawa = (
                discriminant_valuation if split
                else (1 if discriminant_valuation % 2 else 2)
            )
            reduction = 1 if split else -1
            return 1, 4 + j_denominator_valuation, tamagawa, reduction
        if difference == 6:
            residue = (
                discriminant
                // _ec_bigint_power(
                    prime, 6 + j_denominator_valuation)
            )
            if j_denominator_valuation % 2:
                residue *= c6 // _ec_bigint_power(prime, 3)
            tamagawa = 3 + _ec_legendre(residue, prime)
            return 2, -4 - j_denominator_valuation, tamagawa, 0
        raise ArithmeticError(
            "Tate's algorithm reached an impossible potentially "
            'multiplicative branch')

    if discriminant_valuation == 2:
        return 2, 2, 1, 0
    if discriminant_valuation == 3:
        return 2, 3, 2, 0
    if discriminant_valuation == 4:
        tamagawa = 2 + (
            _ec_legendre(-6, prime)
            * _ec_legendre(c6 // _ec_bigint_power(prime, 2), prime)
        )
        return 2, 4, tamagawa, 0
    if discriminant_valuation == 6:
        p2 = _ec_bigint_power(prime, 2)
        cubic_linear = runtime.integer_bigint(c4 // p2)
        cubic_constant = runtime.integer_bigint(
            c6 // runtime.native_mul(p2, runtime.bigint(prime)))
        roots = _ec_cubic_root_count(
            runtime.native_mul(runtime.bigint(-3), cubic_linear),
            runtime.native_mul(runtime.bigint(-2), cubic_constant),
            prime,
        )
        return 2, -1, 1 + roots, 0
    if discriminant_valuation == 8:
        tamagawa = 2 + (
            _ec_legendre(-6, prime)
            * _ec_legendre(c6 // _ec_bigint_power(prime, 4), prime)
        )
        return 2, -4, tamagawa, 0
    if discriminant_valuation == 9:
        return 2, -3, 2, 0
    if discriminant_valuation == 10:
        return 2, -2, 1, 0
    raise ArithmeticError(
        "Tate's algorithm reached an impossible discriminant valuation")


def _ec_tate_small_prime(
    original_values: list[Any], prime: int,
) -> tuple[int, int, int, Any]:
    """The long form of Tate's algorithm at 2 and 3.

    The branch structure follows PARI's GPL-licensed ``localred_23``;
    arithmetic is expressed here using Sage.js exact integers and immutable
    coefficient lists instead of PARI's stack-based ``GEN`` objects.
    """
    values = list(original_values)
    invariants = _ec_invariants(values)
    discriminant_valuation = _ec_valuation(
        invariants['discriminant'], prime)
    if discriminant_valuation == 0:
        return 0, 1, 1, None

    p2 = prime ** 2
    p3 = prime ** 3
    p4 = prime ** 4
    p5 = prime ** 5
    if invariants['b2'] % runtime.bigint(prime):
        split = (
            (-invariants['c6'])
            % runtime.bigint(8 if prime == 2 else 3)
        ) == 1
        tamagawa = (
            discriminant_valuation if split
            else (1 if discriminant_valuation % 2 else 2)
        )
        reduction = 1 if split else -1
        return 1, 4 + discriminant_valuation, tamagawa, reduction

    a1, a2, a3, a4, a6 = values
    if prime == 2:
        r_value = runtime.number(a4 % runtime.bigint(2))
        s_value = runtime.number(a2 % runtime.bigint(2))
        t_value = runtime.number(a6 % runtime.bigint(2))
        if r_value:
            t_value = (s_value + t_value) & 1
            s_value = (s_value + 1) & 1
    else:
        r_value = -runtime.number(
            invariants['b6'] % runtime.bigint(3))
        s_value = runtime.number(a1 % runtime.bigint(3))
        t_value = runtime.number(a3 % runtime.bigint(3))
        if s_value:
            t_value = (t_value + r_value * s_value) % 3
    if r_value or s_value or t_value:
        values = _ec_change_rst(values, r_value, s_value, t_value)
    invariants = _ec_invariants(values)
    a1, a2, a3, a4, a6 = values

    if a6 % runtime.bigint(p2):
        return discriminant_valuation, 2, 1, 0
    if invariants['b8'] % runtime.bigint(p3):
        return discriminant_valuation - 1, 3, 2, 0
    if invariants['b6'] % runtime.bigint(p3):
        modulus = 32 if prime == 2 else 27
        tamagawa = (
            3 if invariants['b6'] % runtime.bigint(modulus) == p2
            else 1
        )
        return discriminant_valuation - 2, 4, tamagawa, 0

    if a6 % runtime.bigint(p3):
        t_value = (
            2 if prime == 2
            else runtime.number(a3 % runtime.bigint(9))
        )
        values = _ec_change_rst(values, 0, 0, t_value)
    a1, a2, a3, a4, a6 = values
    a21 = runtime.number(
        (a2 % runtime.bigint(p2)) // runtime.bigint(prime))
    a42 = runtime.number(
        (a4 % runtime.bigint(p3)) // runtime.bigint(p2))
    a63 = runtime.number(
        (a6 % runtime.bigint(p4)) // runtime.bigint(p3))
    root_count, repeated_root = _ec_numroots3(
        a21, a42, a63, prime)

    if root_count == 3:
        tamagawa = 1 if a63 else 2
        if prime == 2:
            tamagawa += (a21 + a42 + a63) & 1
        else:
            if (1 + a21 + a42 + a63) % 3 == 0:
                tamagawa += 1
            if (1 - a21 + a42 - a63) % 3 == 0:
                tamagawa += 1
        return discriminant_valuation - 4, -1, tamagawa, 0

    if root_count == 2:
        if repeated_root:
            values = _ec_change_rst(
                values, repeated_root * prime, 0, 0)
        nu_value = 1
        pk = p2
        p2k = p4
        while True:
            _a1, a2, a3, a4, a6 = values
            beta = runtime.number((a3 // pk) % prime)
            gamma = -runtime.number((a6 // p2k) % prime)
            alpha = 1
            roots, repeated_root = _ec_numroots2(
                alpha, beta, gamma, prime)
            if roots == 2:
                break
            if repeated_root:
                values = _ec_change_rst(
                    values, 0, 0, repeated_root * pk)
            pk_previous = pk
            pk *= prime
            p2k *= prime
            nu_value += 1

            _a1, a2, a3, a4, a6 = values
            alpha = a21
            beta = runtime.number((a4 // pk) % prime)
            gamma = runtime.number((a6 // p2k) % prime)
            roots, repeated_root = _ec_numroots2(
                alpha, beta, gamma, prime)
            if roots == 2:
                break
            if repeated_root:
                values = _ec_change_rst(
                    values, repeated_root * pk_previous, 0, 0)
            p2k *= prime
            nu_value += 1
        if prime == 2:
            tamagawa = 2 if gamma % 2 else 4
        else:
            tamagawa = 3 + _ec_legendre(
                beta * beta - alpha * gamma, 3)
        conductor_exponent = discriminant_valuation - 4 - nu_value
        return conductor_exponent, -4 - nu_value, tamagawa, 0

    if repeated_root:
        values = _ec_change_rst(
            values, repeated_root * prime, 0, 0)
    _a1, _a2, a3, a4, a6 = values
    a32 = runtime.number(
        (a3 % runtime.bigint(p3)) // runtime.bigint(p2))
    a64 = runtime.number(
        (a6 % runtime.bigint(p5)) // runtime.bigint(p4))
    roots, repeated_root = _ec_numroots2(1, a32, -a64, prime)
    if roots == 2:
        if prime == 2:
            tamagawa = 3 - 2 * a64
        else:
            tamagawa = 2 + _ec_legendre(a32 * a32 + a64, 3)
        return discriminant_valuation - 6, -4, tamagawa, 0
    if repeated_root:
        values = _ec_change_rst(
            values, 0, 0, repeated_root * p2)
    if values[3] % runtime.bigint(p4):
        return discriminant_valuation - 7, -3, 2, 0
    return discriminant_valuation - 8, -2, 1, 0


def _ec_tate_local_data(
    values: list[Any], prime: int,
) -> tuple[int, int, int, Any]:
    if prime in [2, 3]:
        return _ec_tate_small_prime(values, prime)
    return _ec_tate_large_prime(values, prime)


def _ec_lift_x(curve: Any, x_value: Any, all_roots: bool = False) -> Any:
    x_parent = runtime.coercion_model.parentOf(x_value)
    base = curve._base
    if (
        getattr(x_parent, '_kind', None) in ['RDF', 'RealField']
        and getattr(base, '_kind', None) not in ['RDF', 'RealField']
    ):
        return curve.base_extend(x_parent).lift_x(x_value, all_roots)
    x_value = base(x_value)
    a1, a2, a3, a4, a6 = curve._ainvs
    characteristic = 0
    if hasattr(base, 'characteristic'):
        characteristic = base.characteristic()
    if characteristic == 2 and (a1 != 0 or a3 != 0):
        raise NotImplementedError(
            'lift_x for long Weierstrass models in characteristic 2 '
            'is not implemented')
    right = x_value ** 3 + a2 * x_value ** 2 + a4 * x_value + a6
    linear = a1 * x_value + a3
    if characteristic == 2:
        discriminant = right
    else:
        discriminant = linear ** 2 + base(4) * right
    try:
        if hasattr(discriminant, 'sqrt'):
            square_root = discriminant.sqrt()
        elif getattr(base, '_kind', None) in ['RDF', 'RealField']:
            if discriminant < 0:
                raise ValueError('not a square')
            square_root = base(runtime.math.sqrt(float(discriminant)))
        else:
            raise ValueError('not a square')
    except ValueError:
        if all_roots:
            return []
        raise ValueError(  # noqa: B904 - compiler lacks ``raise from`` here
            'the x-coordinate does not lift over the base ring')

    if characteristic == 2:
        y_value = square_root
    else:
        first = (-linear - square_root) / base(2)
        second = (-linear + square_root) / base(2)
        if getattr(base, '_kind', None) in ['GF', 'ZMOD']:
            # Sage orders prime-field lifts by integer y-coordinate,
            # independent of the square-root backend's choice of sign.
            y_value = first if first.lift() <= second.lift() else second
        else:
            y_value = first if first <= second else second
    point = runtime.reflect.construct(
        _point_class, [curve, x_value, y_value, False, False])
    if all_roots:
        negative = -point
        return [point] if negative == point else [point, negative]
    return point


_elliptic_advanced_exports = [_ec_tate_local_data, _ec_lift_x]


class EllipticCurveIsogeny:
    """A normalized separable isogeny computed by Vélu's formulas.

    The implementation deliberately stores the small collection of kernel
    representatives modulo negation.  Those records suffice both to derive
    the codomain and to evaluate the rational map without constructing large
    symbolic numerator and denominator polynomials.
    """

    def __init__(
        self,
        domain: Any,
        kernel: Any,
        codomain: Any = None,
        degree: Any = None,
        model: Any = None,
        check: bool = True,
        algorithm: Any = None,
    ) -> None:
        if model is not None:
            raise NotImplementedError(
                'post-isogeny codomain model selection is not implemented')
        if algorithm not in [None, 'velu']:
            raise NotImplementedError(
                'only explicit-point Vélu kernels are implemented')
        self._domain = domain
        self._kernel_points = self._generate_kernel(kernel, check)
        self._degree = len(self._kernel_points)
        if degree is not None and int(degree) != self._degree:
            raise ValueError('the requested degree does not match the kernel')

        base = domain.base_ring()
        a1, a2, a3, a4, a6 = domain.ainvs()
        zero = base(0)
        v_value = zero
        w_value = zero
        self._kernel_records = []
        kernel_x_values = []
        for point in self._kernel_representatives:
            if point.is_zero():
                continue
            x_value, y_value = point.xy()
            if self._contains_x(kernel_x_values, x_value):
                continue
            gx_value = (
                (base(3) * x_value + base(2) * a2) * x_value
                + a4 - a1 * y_value
            )
            gy_value = (
                0 - base(2) * y_value - a1 * x_value - a3)
            u_value = gy_value ** 2
            if base(2) * y_value == 0 - a1 * x_value - a3:
                local_v = gx_value
            else:
                local_v = base(2) * gx_value - a1 * gy_value
            self._kernel_records.append([
                x_value, y_value, gx_value, gy_value,
                local_v, u_value,
            ])
            kernel_x_values.append(x_value)
            v_value += local_v
            w_value += u_value + x_value * local_v
        computed_codomain = runtime.reflect.apply(
            _curve_constructor,
            runtime.undefined,
            [base, [
                a1,
                a2,
                a3,
                a4 - base(5) * v_value,
                a6 - (a1 ** 2 + base(4) * a2) * v_value
                - base(7) * w_value,
            ]],
        )
        if codomain is not None:
            if not isinstance(codomain, _untyped(_parent_class)):
                raise TypeError('codomain must be an elliptic curve')
            if list(codomain.ainvs()) != list(computed_codomain.ainvs()):
                raise NotImplementedError(
                    'post-composition with a codomain isomorphism is not '
                    'implemented')
            self._codomain = codomain
        else:
            self._codomain = computed_codomain

    @staticmethod
    def _contains_point(
        points: list[Any], candidate: Any,
    ) -> bool:
        for point in points:
            if point == candidate:
                return True
        return False

    @staticmethod
    def _contains_x(values: list[Any], candidate: Any) -> bool:
        for value in values:
            if value == candidate:
                return True
        return False

    def _cyclic_points(
        self, generator: Any, limit: int,
    ) -> list[Any]:
        if generator._parent is not self._domain:
            raise ValueError('kernel points must lie on the isogeny domain')
        if generator.is_zero():
            return [self._domain(0)]
        answer = [self._domain(0)]
        point = generator
        while not point.is_zero():
            if len(answer) >= limit:
                raise ValueError(
                    'explicit Vélu kernel exceeds the safety limit')
            answer.append(point)
            point = point + generator
        return answer

    def _generate_kernel(
        self, kernel: Any, check: bool,
    ) -> list[Any]:
        if isinstance(kernel, _untyped(_point_class)):
            generators = [kernel]
        else:
            generators = list(kernel)
            for generator in generators:
                if not isinstance(generator, _untyped(_point_class)):
                    raise TypeError(
                        'polynomial and coefficient-list kernels are not '
                        'implemented')
        if check:
            base = self._domain.base_ring()
            if base is sage.QQ or getattr(base, '_kind', None) == 'QQ':
                for generator in generators:
                    if not generator.has_finite_order():
                        raise ValueError(
                            'given kernel contains a point of infinite order')

        subgroup = [self._domain(0)]
        # Traditional Vélu is linear in the kernel size.  The explicit limit
        # prevents an accidental infinite-order point from becoming an
        # unbounded evaluation when checking was disabled.
        limit = 1000000
        if len(generators) == 1:
            cyclic = self._cyclic_points(generators[0], limit)
            self._kernel_representatives = cyclic[
                1:len(cyclic) // 2 + 1]
            return cyclic
        for generator in generators:
            cyclic = self._cyclic_points(generator, limit)
            previous = list(subgroup)
            combined = []
            for point in previous:
                for multiple in cyclic:
                    candidate = point + multiple
                    if not self._contains_point(combined, candidate):
                        combined.append(candidate)
                    if len(combined) > limit:
                        raise ValueError(
                            'explicit Vélu kernel exceeds the safety limit')
            subgroup = combined
        representatives = []
        x_values = []
        for point in subgroup:
            if point.is_zero():
                continue
            x_value = point.xy()[0]
            if not self._contains_x(x_values, x_value):
                representatives.append(point)
                x_values.append(x_value)
        self._kernel_representatives = representatives
        return subgroup

    def domain(self) -> Any:
        return self._domain

    def codomain(self) -> Any:
        return self._codomain

    def degree(self) -> int:
        return self._degree

    def is_separable(self) -> bool:
        return True

    def is_normalized(self) -> bool:
        return True

    def kernel_points(self) -> list[Any]:
        return list(self._kernel_points)

    def kernel_polynomial(self) -> Any:
        ring = _untyped(sage.PolynomialRing)(
            self._domain.base_ring(), 'x')
        variable = ring.gen()
        answer = ring(1)
        for record in self._kernel_records:
            answer *= variable - record[0]
        return answer

    def __call__(self, point: Any) -> Any:
        if not isinstance(point, _untyped(_point_class)):
            point = self._domain(point)
        if point._parent is not self._domain:
            raise ValueError('point must lie on the isogeny domain')
        if point.is_zero():
            return self._codomain(0)
        x_value, y_value = point.xy()
        for record in self._kernel_records:
            if x_value == record[0]:
                return self._codomain(0)

        a1, _a2, a3, _a4, _a6 = self._domain.ainvs()
        image_x = x_value
        image_y = y_value
        for record in self._kernel_records:
            kernel_x, kernel_y, gx_value, gy_value, v_value, u_value = (
                record)
            difference = x_value - kernel_x
            inverse = difference ** (-1)
            inverse_squared = inverse ** 2
            inverse_cubed = inverse_squared * inverse
            image_x += (
                v_value * inverse + u_value * inverse_squared)
            y_term_zero = (
                u_value * (2 * y_value + a1 * x_value + a3))
            y_term_one = (
                v_value * (a1 * difference + y_value - kernel_y))
            y_term_two = a1 * u_value - gx_value * gy_value
            image_y -= (
                y_term_zero * inverse_cubed
                + (y_term_one + y_term_two) * inverse_squared
            )
        return runtime.reflect.construct(
            _point_class,
            [self._codomain, image_x, image_y, False, False],
        )

    def __repr__(self) -> str:
        return (
            'Isogeny of degree ' + str(self._degree) + '\n from '
            + str(self._domain) + '\n   to ' + str(self._codomain)
        )

    __str__ = __repr__
    toString = __repr__
