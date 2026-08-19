"""Riemann-zeta numerical policy and an independent mpmath reference.

The production provider is expected to use FLINT/Arb's `acb_dirichlet_zeta`
and `acb_dirichlet_zeta_jet`.  This module freezes the provider contract and
keeps a readable reference implementation for differential testing.  Jets in
this API contain actual derivatives, not Taylor coefficients.

FLINT's `deflate` flag computes derivatives of
`h(s)=zeta(s)-1/(s-1)`.  Raw derivatives away from the pole are reconstructed
by adding `(-1)^k*k!/(s-1)^(k+1)`.  At the pole only the deflated jet is
defined.  No input close to one is ever snapped to the pole.
"""

from __future__ import annotations

from math import factorial
from typing import Any

from mpmath import mp

__all__ = [
    "RiemannZetaEvaluator",
    "ZetaPoleError",
    "reference_riemann_xi",
    "reference_riemann_zeta_jet",
    "reference_riemann_zeta_value",
]


class ZetaPoleError(ArithmeticError):
    """Evaluation requested the pole of a meromorphic zeta function."""


def _precision(value: Any) -> int:
    result = int(value)
    if result < 16:
        raise ValueError("precision must be at least 16 bits")
    return result


def _order(value: Any) -> int:
    result = int(value)
    if result < 0 or result != value:
        raise ValueError("derivative order must be a nonnegative integer")
    return result


def _point(value: Any) -> Any:
    if isinstance(value, (tuple, list)):
        if len(value) != 2:
            raise ValueError("a complex point pair must have two entries")
        return mp.mpc(value[0], value[1])
    try:
        return mp.mpc(value)
    except (TypeError, ValueError):
        real = value.real()
        imaginary = value.imag()
        return mp.mpc(str(real), str(imaginary))


def _is_one(point: Any) -> bool:
    return point.real == 1 and point.imag == 0


def _decimal_equals_integer(text: str, integer: int) -> bool:
    """Compare a finite decimal string to an integer without rounding."""

    value = text.strip().lower()
    sign = 1
    if value.startswith(("+", "-")):
        if value[0] == "-":
            sign = -1
        value = value[1:]
    parts = value.split("e")
    if len(parts) > 2:
        return False
    mantissa = parts[0]
    try:
        exponent = int(parts[1]) if len(parts) == 2 else 0
    except ValueError:
        return False
    if abs(exponent) > 100_000:
        return integer == 0 and mantissa.replace(".", "").strip("0") == ""
    pieces = mantissa.split(".")
    if len(pieces) > 2:
        return False
    whole = pieces[0]
    fraction = pieces[1] if len(pieces) == 2 else ""
    digits = whole + fraction
    if not digits or not digits.isdigit():
        return False
    numerator = sign * int(digits)
    scale = len(fraction) - exponent
    if scale <= 0:
        return numerator * 10 ** (-scale) == integer
    return numerator == integer * 10**scale


def _is_exact_point(value: Any, real: int) -> bool:
    def equals_integer(scalar: Any, integer: int) -> bool:
        if isinstance(scalar, str):
            return _decimal_equals_integer(scalar, integer)
        return scalar == integer

    if isinstance(value, (tuple, list)):
        return (
            len(value) == 2
            and equals_integer(value[0], real)
            and equals_integer(value[1], 0)
        )
    real_part = getattr(value, "real", value)
    imaginary_part = getattr(value, "imag", 0)
    if callable(real_part):
        real_part = real_part()
    if callable(imaginary_part):
        imaginary_part = imaginary_part()
    return equals_integer(real_part, real) and equals_integer(imaginary_part, 0)


def _deflated_value(point: Any) -> Any:
    if _is_one(point):
        return mp.euler
    return mp.zeta(point) - 1 / (point - 1)


def reference_riemann_zeta_jet(
    value: Any,
    order: Any,
    *,
    precision_bits: Any = 53,
    deflate: bool = False,
) -> list[Any]:
    """Return derivatives zero through `order` using mpmath.

    With `deflate=True`, these are derivatives of
    `zeta(s)-1/(s-1)`, including the finite values at `s=1`.
    """

    precision = _precision(precision_bits)
    maximum_order = _order(order)
    with mp.workprec(precision + 40):
        point = _point(value)
        if _is_one(point) and not deflate:
            raise ZetaPoleError("the Riemann zeta function has a pole at s=1")
        if _is_one(point) and deflate:
            # zeta(s) = 1/(s-1) + sum((-1)^n*gamma_n/n!*(s-1)^n).
            # Using this exact Laurent expansion avoids catastrophic
            # cancellation in numerical differentiation at the pole.
            answer = [
                (-1) ** derivative * mp.stieltjes(derivative)
                for derivative in range(maximum_order + 1)
            ]
        else:
            function = _deflated_value if deflate else mp.zeta
            answer = [
                mp.diff(function, point, derivative)
                for derivative in range(maximum_order + 1)
            ]
    return answer


def reference_riemann_zeta_value(
    value: Any,
    *,
    derivative: Any = 0,
    precision_bits: Any = 53,
) -> Any:
    """Return one Riemann-zeta derivative using the reference path."""

    derivative_order = _order(derivative)
    return reference_riemann_zeta_jet(
        value,
        derivative_order,
        precision_bits=precision_bits,
    )[derivative_order]


def reference_riemann_xi(value: Any, *, precision_bits: Any = 53) -> Any:
    """Return `s*(s-1)*Gamma_R(s)*zeta(s)` (no factor `1/2`)."""

    precision = _precision(precision_bits)
    with mp.workprec(precision + 40):
        point = _point(value)
        if _is_one(point) or (point.real == 0 and point.imag == 0):
            return mp.mpc(1)
        if point.imag == 0 and point.real < 0 and point.real == int(point.real):
            return reference_riemann_xi(1 - point, precision_bits=precision)
        return (
            point
            * (point - 1)
            * mp.power(mp.pi, -point / 2)
            * mp.gamma(point / 2)
            * mp.zeta(point)
        )


class RiemannZetaEvaluator:
    """Precision-aware Riemann zeta evaluator with an injectable provider.

    A native provider implements
    `jet(s, first_order, count, deflate, precision_bits)` and returns actual
    derivatives.  It may additionally implement `values(points, derivative,
    precision_bits)` and `xi(s, precision_bits)`.  Without a provider this
    class is the portable mpmath reference and returns mpmath numbers.
    """

    def __init__(self, precision: Any = 53, provider: Any = None) -> None:
        self._precision = _precision(precision)
        self._provider = provider

    def precision(self) -> int:
        return self._precision

    prec = precision

    def jet(
        self,
        value: Any,
        order: Any,
        *,
        first_order: Any = 0,
        deflate: bool = False,
        prec: Any = None,
    ) -> list[Any]:
        maximum_order = _order(order)
        first = _order(first_order)
        if first > maximum_order:
            return []
        precision = self._precision if prec is None else _precision(prec)
        if _is_exact_point(value, 1) and not deflate:
            raise ZetaPoleError("the Riemann zeta function has a pole at s=1")
        if self._provider is not None:
            return list(
                self._provider.jet(
                    value,
                    first,
                    maximum_order - first + 1,
                    bool(deflate),
                    precision,
                )
            )
        full = reference_riemann_zeta_jet(
            value,
            maximum_order,
            precision_bits=precision,
            deflate=deflate,
        )
        return full[first:]

    def derivative(self, value: Any, D: Any = 1, *, prec: Any = None) -> Any:
        derivative = _order(D)
        return self.jet(value, derivative, first_order=derivative, prec=prec)[0]

    def value(self, value: Any, *, derivative: Any = 0, prec: Any = None) -> Any:
        return self.derivative(value, derivative, prec=prec)

    def __call__(self, value: Any) -> Any:
        return self.value(value)

    def values(
        self,
        points: list[Any] | tuple[Any, ...],
        *,
        derivative: Any = 0,
        prec: Any = None,
    ) -> list[Any]:
        if not isinstance(points, (list, tuple)) or not points:
            raise ValueError("points must be a nonempty list or tuple")
        derivative_order = _order(derivative)
        precision = self._precision if prec is None else _precision(prec)
        if self._provider is not None and hasattr(self._provider, "values"):
            return list(self._provider.values(points, derivative_order, precision))
        return [
            self.value(point, derivative=derivative_order, prec=precision)
            for point in points
        ]

    def deflated_jet(self, value: Any, order: Any, *, prec: Any = None) -> list[Any]:
        return self.jet(value, order, deflate=True, prec=prec)

    def residue(self, value: Any = 1) -> int:
        if not _is_exact_point(value, 1):
            raise ValueError("the Riemann zeta function has no pole at this point")
        return 1

    def xi(self, value: Any, *, prec: Any = None) -> Any:
        precision = self._precision if prec is None else _precision(prec)
        if self._provider is not None and hasattr(self._provider, "xi"):
            # The provider contract uses the plan's no-half normalization.
            return self._provider.xi(value, precision)
        return reference_riemann_xi(value, precision_bits=precision)

    def reconstruct_raw_from_deflated(
        self,
        value: Any,
        deflated_derivative: Any,
        derivative: Any,
    ) -> Any:
        """Add the exact polar derivative to a deflated derivative."""

        derivative_order = _order(derivative)
        point = _point(value)
        if _is_one(point):
            raise ZetaPoleError("raw zeta derivatives are undefined at s=1")
        polar = (
            ((-1) ** derivative_order)
            * factorial(derivative_order)
            / (point - 1) ** (derivative_order + 1)
        )
        return deflated_derivative + polar
