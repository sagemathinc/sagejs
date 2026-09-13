"""Bounded Euclidean fallbacks using ordinary exact-field polynomials."""

from __future__ import annotations

from time import monotonic
from typing import Any

from sagejs.polynomial_algorithms.exact_field import ExactField

MAX_DEGREE = 4096
MAX_SECONDS = 30.0


def _inputs(left: Any, right: Any) -> Any:
    parent = left.parent()
    if right.parent() is not parent:
        raise TypeError("Euclidean polynomial operands must have the same parent")
    ExactField(parent.base_ring())
    if max(left.degree(), right.degree()) > MAX_DEGREE:
        raise ValueError("exact-field Euclidean fallback supports degree <= 4096")
    return parent


def _remainder(left: Any, right: Any, started: float) -> Any:
    if monotonic() - started > MAX_SECONDS:
        raise RuntimeError("exact-field Euclidean fallback time limit exceeded")
    quotient, remainder = left.quo_rem(right)
    if not remainder.is_zero() and remainder.degree() >= right.degree():
        raise ArithmeticError("exact polynomial division did not decrease degree")
    return quotient, remainder


def _scale(polynomial: Any, divisor: Any) -> Any:
    return polynomial.parent()._from_coefficients(
        [coefficient / divisor for coefficient in polynomial.coefficients()]
    )


def monic_gcd(left: Any, right: Any) -> Any:
    """Exact monic gcd, including `gcd(0, 0) = 0`.

    The existing division implementation owns coefficient arithmetic. Strict
    degree descent bounds iterations; a deadline is checked between divisions.
    It does not interrupt an individual foreign/coefficient operation.
    """
    _inputs(left, right)
    started = monotonic()
    while not right.is_zero():
        _quotient, remainder = _remainder(left, right, started)
        left, right = right, remainder
    if left.is_zero():
        return left
    return _scale(left, left.coefficients()[-1])


def monic_xgcd(left: Any, right: Any) -> Any:
    """Return the monic gcd and exact Bezout coefficients in the same parent."""
    parent = _inputs(left, right)
    source_left, source_right = left, right
    old_left, new_left = parent(1), parent(0)
    old_right, new_right = parent(0), parent(1)
    started = monotonic()
    while not right.is_zero():
        quotient, remainder = _remainder(left, right, started)
        left, right = right, remainder
        old_left, new_left = new_left, old_left - quotient * new_left
        old_right, new_right = new_right, old_right - quotient * new_right
    if left.is_zero():
        return left, parent(0), parent(0)
    leading = left.coefficients()[-1]
    gcd, first, second = (
        _scale(left, leading),
        _scale(old_left, leading),
        _scale(old_right, leading),
    )
    if first * source_left + second * source_right != gcd:
        raise ArithmeticError("exact polynomial Bezout certificate failed")
    return gcd, first, second
