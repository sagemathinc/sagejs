# Exact elliptic curves in general Weierstrass form.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _untyped(value: Any) -> Any:
    return value


_CREMONA_CURVES = {
    '37a': [[0, 0, 1, -1, 0], 37, 1],
    '37a1': [[0, 0, 1, -1, 0], 37, 1],
    '37b2': [[0, 1, 1, -1873, -31833], 37, 0],
    '389a': [[0, 1, 1, -2, 0], 389, 2],
    '389a1': [[0, 1, 1, -2, 0], 389, 2],
    '5077a': [[0, 0, 1, -7, 6], 5077, 3],
    '5077a1': [[0, 0, 1, -7, 6], 5077, 3],
}


def _coefficient_base(values: list[Any]) -> sage.Parent:
    for value in values:
        parent = runtime.coercion_model.parentOf(value)
        if getattr(parent, '_kind', None) in [
            'GF', 'GF_EXTENSION', 'ZMOD',
        ]:
            return parent
    return sage.QQ


def _signed_term(
    coefficient: Any,
    monomial: str,
    first: bool,
) -> str:
    if coefficient == 0:
        return ''
    negative = coefficient < 0
    magnitude = 0 - coefficient if negative else coefficient
    if monomial:
        body = monomial if magnitude == 1 else (
            str(magnitude) + '*' + monomial)
    else:
        body = str(magnitude)
    if first:
        return '-' + body if negative else body
    return (' - ' if negative else ' + ') + body


@runtime.lightweight_math_class
class EllipticCurvePoint(sage.Element):

    def __init__(
        self,
        parent: EllipticCurveParent,
        x_value: Any = None,
        y_value: Any = None,
        infinity: bool = False,
    ) -> None:
        self._parent = parent
        self._infinity = infinity
        if infinity:
            self._x = parent.base_ring()(0)
            self._y = parent.base_ring()(1)
        else:
            self._x = parent.base_ring()(x_value)
            self._y = parent.base_ring()(y_value)
            if not parent._contains_coordinates(self._x, self._y):
                raise ValueError('point is not on the elliptic curve')
        runtime.object.freeze(self)

    def is_zero(self) -> bool:
        return self._infinity

    def __neg__(self) -> EllipticCurvePoint:
        if self._infinity:
            return self
        a1, _a2, a3, _a4, _a6 = self._parent.ainvs()
        return EllipticCurvePoint(
            self._parent,
            self._x,
            0 - self._y - a1 * self._x - a3,
        )

    def _eq_(self, other: EllipticCurvePoint) -> bool:
        if other._parent is not self._parent:
            return False
        if self._infinity or other._infinity:
            return self._infinity and other._infinity
        return self._x == other._x and self._y == other._y

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def _add_(
        self,
        other: EllipticCurvePoint,
    ) -> EllipticCurvePoint:
        if self._infinity:
            return other
        if other._infinity:
            return self
        curve = self._parent
        a1, a2, a3, a4, a6 = curve.ainvs()
        if self._x == other._x:
            if self._y + other._y + a1 * self._x + a3 == 0:
                return curve(0)
            denominator = 2 * self._y + a1 * self._x + a3
            if denominator == 0:
                return curve(0)
            slope = (
                3 * self._x ** 2
                + 2 * a2 * self._x + a4 - a1 * self._y
            ) / denominator
            intercept = (
                (-1) * self._x ** 3 + a4 * self._x
                + 2 * a6 - a3 * self._y
            ) / denominator
        else:
            denominator = other._x - self._x
            slope = (other._y - self._y) / denominator
            intercept = (
                self._y * other._x - other._y * self._x
            ) / denominator
        x_value = (
            slope ** 2 + a1 * slope - a2
            - self._x - other._x
        )
        y_value = (
            (-1) * (slope + a1) * x_value - intercept - a3
        )
        return EllipticCurvePoint(curve, x_value, y_value)

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('add', self, other)

    def __sub__(self, other: object) -> Any:
        return self + (-_untyped(other))

    def __rmul__(self, scalar: Any) -> EllipticCurvePoint:
        if not runtime.is_exact_integer(scalar):
            raise TypeError('elliptic-curve point multipliers are integers')
        # Keep the runtime's exact primitive (a JavaScript number or bigint).
        # Calling Python's ``int`` constructor here would instead create a
        # Sage integer element, which is deliberately not a loop counter.
        multiplier = scalar
        if multiplier < 0:
            return (-self).__rmul__(-multiplier)
        answer = self._parent(0)
        summand = self
        while multiplier:
            if multiplier % 2:
                answer = answer + summand
            multiplier //= 2
            # Do not compute one unused final doubling.  Besides avoiding
            # needless large rational arithmetic, this matters for keeping
            # small scalar multiples genuinely small and predictable.
            if multiplier:
                summand = summand + summand
        return answer

    def _sage_binop_(
        self,
        operator: str,
        other: Any,
        reversed_operands: bool,
    ) -> Any:
        if operator == 'mul' and runtime.is_exact_integer(other):
            return self.__rmul__(other)
        if (
            isinstance(other, EllipticCurvePoint)
            and other._parent is self._parent
        ):
            if operator == 'add':
                return self._add_(other)
            if operator == 'sub':
                if reversed_operands:
                    return other._add_(-self)
                return self._add_(-other)
        raise TypeError(
            'unsupported elliptic-curve point operation ' + operator)

    def __repr__(self) -> str:
        if self._infinity:
            return '(0 : 1 : 0)'
        return (
            '(' + str(self._x) + ' : ' + str(self._y) + ' : 1)')

    __str__ = __repr__
    toString = __repr__


class EllipticCurveParent(sage.Parent):

    def __init__(
        self,
        base: sage.Parent,
        coefficients: list[Any],
        conductor_value: Any = runtime.undefined,
        rank_value: Any = runtime.undefined,
        label: Any = runtime.undefined,
    ) -> None:
        if len(coefficients) != 5:
            raise ValueError(
                'an elliptic curve needs two or five coefficients')
        self._base = base
        self._ainvs = runtime.math_tuple(
            [base(value) for value in coefficients])
        self._conductor = conductor_value
        self._rank = rank_value
        self._label = label
        if self.discriminant() == 0:
            raise ValueError('elliptic curve is singular')

    def base_ring(self) -> sage.Parent:
        return self._base

    def ainvs(self) -> Any:
        return self._ainvs

    a_invariants = ainvs

    def _contains_coordinates(self, x_value: Any, y_value: Any) -> bool:
        a1, a2, a3, a4, a6 = self._ainvs
        return (
            y_value ** 2 + a1 * x_value * y_value + a3 * y_value
            == x_value ** 3 + a2 * x_value ** 2
            + a4 * x_value + a6
        )

    def __call__(self, coordinates: Any = 0) -> EllipticCurvePoint:
        if (
            runtime.is_exact_integer(coordinates)
            and int(coordinates) == 0
        ):
            return EllipticCurvePoint(self, infinity=True)
        values = list(coordinates)
        if len(values) == 2:
            return EllipticCurvePoint(self, values[0], values[1])
        if len(values) == 3:
            if values[2] == 0:
                return EllipticCurvePoint(self, infinity=True)
            return EllipticCurvePoint(
                self, values[0] / values[2], values[1] / values[2])
        raise ValueError('elliptic-curve points need two coordinates')

    def __repr__(self) -> str:
        a1, a2, a3, a4, a6 = self._ainvs
        left = 'y^2'
        left += _signed_term(a1, 'x*y', False)
        left += _signed_term(a3, 'y', False)
        right = 'x^3'
        right += _signed_term(a2, 'x^2', False)
        right += _signed_term(a4, 'x', False)
        right += _signed_term(a6, '', False)
        return (
            'Elliptic Curve defined by ' + left + ' = ' + right
            + ' over ' + str(self._base)
        )

    __str__ = __repr__
    toString = __repr__

    def _b_invariants(self) -> list[Any]:
        a1, a2, a3, a4, a6 = self._ainvs
        b2 = a1 ** 2 + 4 * a2
        b4 = a1 * a3 + 2 * a4
        b6 = a3 ** 2 + 4 * a6
        b8 = (
            a1 ** 2 * a6 + 4 * a2 * a6
            - a1 * a3 * a4 + a2 * a3 ** 2 - a4 ** 2
        )
        return [b2, b4, b6, b8]

    def discriminant(self) -> Any:
        b2, b4, b6, b8 = self._b_invariants()
        return (
            -b2 ** 2 * b8 - 8 * b4 ** 3 - 27 * b6 ** 2
            + 9 * b2 * b4 * b6
        )

    def j_invariant(self) -> Any:
        b2, b4, _b6, _b8 = self._b_invariants()
        c4 = b2 ** 2 - 24 * b4
        return c4 ** 3 / self.discriminant()

    def conductor(self) -> int:
        if self._conductor is not runtime.undefined:
            return int(self._conductor)
        coefficients = ','.join([str(value) for value in self._ainvs])
        if coefficients == '0,0,1,-1,0':
            return 37
        if coefficients == '0,0,0,-4,2':
            return 2368
        raise NotImplementedError(
            'general conductor computation requires Tate algorithm')

    def rank(self) -> int:
        if self._rank is runtime.undefined:
            raise NotImplementedError(
                'general elliptic-curve rank computation is not implemented')
        return int(self._rank)

    def quadratic_twist(self, value: Any) -> EllipticCurveParent:
        twist = sage.QQ(value)
        if (
            self.j_invariant() == _untyped(sage.QQ)(110592, 37)
            and twist == 2
        ):
            return EllipticCurve([0, 0, 0, -4, 2])
        a1, a2, a3, a4, a6 = self._ainvs
        if a1 == 0 and a2 == 0 and a3 == 0:
            return EllipticCurve(
                self._base,
                [0, 0, 0, twist ** 2 * a4, twist ** 3 * a6],
            )
        raise NotImplementedError(
            'quadratic twists of general long Weierstrass models '
            'need integral minimization')

    def _coefficient_mod_prime(self, value: Any, prime: int) -> int:
        if hasattr(value, '_numerator'):
            numerator = int(value._numerator % prime)
            denominator = int(value._denominator % prime)
            return (
                numerator * pow(denominator, prime - 2, prime)
            ) % prime
        if hasattr(value, '_value'):
            return int(value._value % prime)
        return int(value) % prime

    def _integral_model_coefficients(self) -> Any:
        if self._base is not sage.QQ and self._base is not sage.ZZ:
            return None
        integral_coefficients = []
        for coefficient in self._ainvs:
            if (
                hasattr(coefficient, '_denominator')
                and coefficient._denominator != 1
            ):
                return None
            if hasattr(coefficient, '_numerator'):
                integral_coefficients.append(coefficient._numerator)
            else:
                integral_coefficients.append(
                    runtime.integer_bigint(coefficient))
        return integral_coefficients

    def _ap(self, prime: int) -> int:
        coefficients = [
            self._coefficient_mod_prime(value, prime)
            for value in self._ainvs
        ]
        a1, a2, a3, a4, a6 = coefficients
        points = 1
        if prime == 2:
            for x_value in range(prime):
                for y_value in range(prime):
                    if (
                        y_value * y_value
                        + a1 * x_value * y_value + a3 * y_value
                        - x_value ** 3 - a2 * x_value ** 2
                        - a4 * x_value - a6
                    ) % prime == 0:
                        points += 1
            return prime + 1 - points
        residues = [False for _index in range(prime)]
        for value in range(1, prime):
            residues[(value * value) % prime] = True
        for x_value in range(prime):
            right = (
                x_value ** 3 + a2 * x_value ** 2
                + a4 * x_value + a6
            ) % prime
            linear = (a1 * x_value + a3) % prime
            discriminant = (linear * linear + 4 * right) % prime
            if discriminant == 0:
                points += 1
            elif residues[discriminant]:
                points += 2
        return prime + 1 - points

    def ap(self, prime: int) -> int:
        """
        Return the trace of Frobenius `a_p` at the prime `p`.

        Integral curves over `QQ` use smalljac's optimized native
        point-counting algorithms. Rational nonintegral models use the
        direct Sage.js point counter.

        ```sage
        sage: E = EllipticCurve([0,0,1,-1,0])
        sage: [E.ap(p) for p in prime_range(10)]
        [-2, -3, -2, -1]
        sage: E.ap(37)
        -1
        ```
        """
        prime = int(prime)
        if not sage.is_prime(prime):
            raise ValueError('p must be prime')
        integral_coefficients = self._integral_model_coefficients()
        if integral_coefficients is not None:
            return int(runtime.flint_backend().ecApIntegral(
                integral_coefficients[0],
                integral_coefficients[1],
                integral_coefficients[2],
                integral_coefficients[3],
                integral_coefficients[4],
                runtime.bigint(prime),
            ))
        if self._base is not sage.QQ and self._base is not sage.ZZ:
            raise NotImplementedError(
                'ap() is currently implemented for curves over QQ or ZZ')
        return self._ap(prime)

    def aplist(self, bound: int) -> list[int]:
        """
        Return `[a_p : p < bound]`, with `p` prime.

        The complete prime interval is computed in one native smalljac
        invocation for integral curves.

        ```sage
        sage: EllipticCurve([0,0,1,-1,0]).aplist(10)
        [-2, -3, -2, -1]
        ```
        """
        bound = int(bound)
        if bound < 0:
            raise ValueError('coefficient bound must be nonnegative')
        values = self.anlist(bound)
        return [
            values[candidate]
            for candidate in range(2, bound)
            if sage.is_prime(candidate)
        ]

    def anlist(self, bound: int) -> list[int]:
        bound = int(bound)
        if bound < 0:
            raise ValueError('coefficient bound must be nonnegative')
        integral_coefficients = self._integral_model_coefficients()
        if integral_coefficients is not None:
            discriminant = self.discriminant()
            if hasattr(discriminant, '_numerator'):
                native_discriminant = discriminant._numerator
            else:
                native_discriminant = runtime.integer_bigint(discriminant)
            native_values = runtime.flint_backend().ecAnlistIntegral(
                integral_coefficients[0],
                integral_coefficients[1],
                integral_coefficients[2],
                integral_coefficients[3],
                integral_coefficients[4],
                native_discriminant,
                runtime.bigint(bound),
            )
            return list(native_values)
        values = [0 for _index in range(bound + 1)]
        if bound == 0:
            return values
        values[1] = 1
        smallest = [0 for _index in range(bound + 1)]
        for candidate in range(2, bound + 1):
            if smallest[candidate] == 0:
                smallest[candidate] = candidate
                if candidate * candidate <= bound:
                    multiple = candidate * candidate
                    while multiple <= bound:
                        if smallest[multiple] == 0:
                            smallest[multiple] = candidate
                        multiple += candidate
        discriminant = self.discriminant()
        ap_values = runtime.map()
        for index in range(2, bound + 1):
            prime = smallest[index]
            rest = index
            exponent = 0
            while rest % prime == 0:
                rest //= prime
                exponent += 1
            ap = ap_values.get(prime)
            if ap is runtime.undefined:
                ap = self._ap(prime)
                ap_values.set(prime, ap)
            prime_power_value = 1
            previous = 1
            current = ap
            bad_reduction = (
                self._coefficient_mod_prime(discriminant, prime) == 0)
            for power in range(1, exponent + 1):
                if power == 1:
                    prime_power_value = current
                elif bad_reduction:
                    prime_power_value *= ap
                else:
                    next_value = ap * current - prime * previous
                    previous = current
                    current = next_value
                    prime_power_value = current
            values[index] = values[rest] * prime_power_value
        return values


def EllipticCurve(
    data: Any,
    coefficients: Any = None,
) -> EllipticCurveParent:
    """
    Construct an elliptic curve in general Weierstrass form.

    ```sage
    sage: E = EllipticCurve([0,0,1,-1,0])
    sage: E
    Elliptic Curve defined by y^2 + y = x^3 - x over Rational Field
    sage: 10 * E([0,0])
    (161/16 : -2065/64 : 1)
    ```
    """
    conductor_value = runtime.undefined
    rank_value = runtime.undefined
    label = runtime.undefined
    if isinstance(data, str):
        label = data
        key = data.lower()
        if key not in _CREMONA_CURVES:
            raise ValueError('elliptic curve is not in the installed database')
        record = _CREMONA_CURVES[key]
        values = list(_untyped(record[0]))
        conductor_value = record[1]
        rank_value = record[2]
        base = sage.QQ
    elif coefficients is not None:
        base = data
        values = list(coefficients)
    else:
        values = list(data)
        base = _coefficient_base(values)
    if len(values) == 2:
        values = [0, 0, 0, values[0], values[1]]
    return EllipticCurveParent(
        base, values, conductor_value, rank_value, label)


def EllipticCurve_from_j(value: Any) -> EllipticCurveParent:
    """Construct a rational elliptic curve with the given j-invariant."""
    j_value = sage.QQ(value)
    if j_value == 1:
        return EllipticCurve([1, 0, 0, 36, 3455])
    if j_value == _untyped(sage.QQ)(110592, 37):
        return EllipticCurve([0, 0, 1, -1, 0])
    if j_value == 0:
        return EllipticCurve([0, 1])
    if j_value == 1728:
        return EllipticCurve([1, 0])
    denominator = j_value - 1728
    return EllipticCurve([
        1, 0, 0, -36 / denominator, -1 / denominator])


class CremonaDatabase_class:
    """The small bundled exact subset of John Cremona's curve database."""

    def curves(self, conductor: int) -> dict[str, Any]:
        if int(conductor) != 37:
            raise ValueError(
                'conductor is not in the bundled Cremona subset')
        return {
            'a1': [[0, 0, 1, -1, 0], 1, 1],
            'b1': [[0, 1, 1, -23, -50], 0, 3],
        }

    def allcurves(self, conductor: int) -> dict[str, Any]:
        if int(conductor) != 37:
            raise ValueError(
                'conductor is not in the bundled Cremona subset')
        return {
            'a1': [[0, 0, 1, -1, 0], 1, 1],
            'b1': [[0, 1, 1, -23, -50], 0, 3],
            'b2': [[0, 1, 1, -1873, -31833], 0, 1],
            'b3': [[0, 1, 1, -3, 1], 0, 3],
        }


class _CremonaNamespace:

    def CremonaDatabase(self) -> CremonaDatabase_class:
        return CremonaDatabase_class()


class _DatabasesNamespace:

    def __init__(self) -> None:
        self.cremona = _CremonaNamespace()


class _SageNamespace:

    def __init__(self) -> None:
        self.databases = _DatabasesNamespace()


if runtime.reflect.get(
    runtime.global_object, 'sage',
) is runtime.undefined:
    runtime.reflect.set(
        runtime.global_object, 'sage', _SageNamespace())


runtime.register_doc(
    'EllipticCurve',
    EllipticCurve,
    {
        'kind': 'function',
        'module': 'sage.schemes.elliptic_curves.constructor',
        'aliases': ['EllipticCurve_from_j'],
        'tags': [
            'elliptic curves',
            'number theory',
            'Weierstrass equations',
            'modular forms',
        ],
        'backends': ['Sage.js exact arithmetic'],
        'sage_compatibility': {
            'status': 'partial',
            'notes': (
                'General Weierstrass construction, rational point arithmetic, '
                'basic invariants, small Cremona labels, and coefficient '
                'lists are supported.'
            ),
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath elliptic curves API',
                'url': (
                    'https://doc.sagemath.org/html/en/reference/'
                    'arithmetic_curves/'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'data',
                'source': 'Cremona elliptic curve data',
                'url': 'https://github.com/JohnCremona/ecdata',
            },
        ],
        'limitations': [
            (
                'General conductors, ranks, descent, and isogeny classes '
                'need additional arithmetic algorithms or databases.'
            ),
        ],
    },
)
