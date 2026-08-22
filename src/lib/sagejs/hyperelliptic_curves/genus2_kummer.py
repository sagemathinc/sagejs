"""Exact genus-2 Kummer coordinates for rational Mumford divisors.

The coordinates are those of Cassels--Flynn and Mueller.  For a divisor with
Mumford representation

```text
u(X) = X^2 - s*X + p,       v(X) = a*X + b,
```

on `Y^2 + h(X)Y = f(X)`, they are `(1,s,p,k4)`, where `k4` is evaluated by
the division-free identity in `_degree_two_coordinates`.  This identity is
important when `u` has a double root: the geometric formula has denominator
`(x_1-x_2)^2`, whereas the expression below remains defined.

This module deliberately does not manufacture an even-degree transformation.
The existing Sage.js Mumford group law uses a distinguished rational point at
infinity, so the exact capability envelope here is the same odd-degree model.
"""

from __future__ import annotations

from typing import Any, cast


# Sparse specialization of Flynn, Appendix C, to the odd-degree case f6=0.
# The source worksheet is published at
# https://people.maths.ox.ac.uk/flynn/genus2/kummer/duplication and the paper
# at https://people.maths.ox.ac.uk/flynn/arts/art5.pdf.
# Each row is (integer coefficient, exponents of k1..k4,
# exponents of f0..f5).  Keeping the published quartics as immutable exact
# data makes their coefficient audit and the dynamic fallback inspectable.
_CLASSICAL_DELTA_1 = (
    (-16, 4, 0, 0, 0, 1, 0, 1, 0, 1, 0),
    (4, 4, 0, 0, 0, 1, 0, 0, 2, 0, 0),
    (4, 4, 0, 0, 0, 0, 2, 0, 0, 1, 0),
    (-32, 3, 1, 0, 0, 1, 0, 1, 0, 0, 1),
    (8, 3, 1, 0, 0, 0, 2, 0, 0, 0, 1),
    (-16, 3, 0, 1, 0, 1, 0, 0, 1, 0, 1),
    (-16, 3, 0, 0, 1, 1, 0, 0, 0, 1, 0),
    (4, 3, 0, 0, 1, 0, 1, 0, 1, 0, 0),
    (-8, 2, 2, 0, 0, 1, 0, 0, 1, 0, 1),
    (-16, 2, 1, 1, 0, 1, 0, 0, 0, 1, 1),
    (-4, 2, 1, 1, 0, 0, 1, 0, 1, 0, 1),
    (-32, 2, 1, 0, 1, 1, 0, 0, 0, 0, 1),
    (16, 2, 0, 2, 0, 1, 0, 0, 0, 0, 2),
    (-8, 2, 0, 2, 0, 0, 1, 0, 0, 1, 1),
    (-8, 2, 0, 1, 1, 0, 1, 0, 0, 0, 1),
    (4, 2, 0, 0, 2, 0, 0, 1, 0, 0, 0),
    (-16, 1, 2, 1, 0, 1, 0, 0, 0, 0, 2),
    (-4, 1, 2, 0, 1, 0, 1, 0, 0, 0, 1),
    (-8, 1, 1, 2, 0, 0, 1, 0, 0, 0, 2),
    (-8, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1),
    (-4, 1, 0, 2, 1, 0, 0, 0, 1, 0, 1),
    (4, 1, 0, 0, 3, 0, 0, 0, 0, 0, 0),
    (4, 0, 4, 0, 0, 1, 0, 0, 0, 0, 2),
    (4, 0, 3, 1, 0, 0, 1, 0, 0, 0, 2),
    (4, 0, 2, 2, 0, 0, 0, 1, 0, 0, 2),
    (4, 0, 1, 3, 0, 0, 0, 0, 1, 0, 2),
    (-4, 0, 1, 1, 2, 0, 0, 0, 0, 0, 1),
    (4, 0, 0, 4, 0, 0, 0, 0, 0, 1, 2),
    (8, 0, 0, 3, 1, 0, 0, 0, 0, 0, 2),
)

_CLASSICAL_DELTA_2 = (
    (16, 4, 0, 0, 0, 2, 0, 0, 0, 0, 1),
    (-4, 4, 0, 0, 0, 1, 0, 1, 1, 0, 0),
    (1, 4, 0, 0, 0, 0, 2, 0, 1, 0, 0),
    (16, 3, 1, 0, 0, 1, 1, 0, 0, 0, 1),
    (-4, 3, 1, 0, 0, 1, 0, 0, 2, 0, 0),
    (-32, 3, 0, 1, 0, 1, 0, 1, 0, 0, 1),
    (16, 3, 0, 1, 0, 1, 0, 0, 1, 1, 0),
    (16, 3, 0, 1, 0, 0, 2, 0, 0, 0, 1),
    (-6, 3, 0, 1, 0, 0, 1, 0, 2, 0, 0),
    (4, 3, 0, 0, 1, 1, 0, 0, 1, 0, 0),
    (-4, 2, 2, 0, 0, 1, 0, 0, 1, 1, 0),
    (4, 2, 2, 0, 0, 0, 2, 0, 0, 0, 1),
    (-20, 2, 1, 1, 0, 1, 0, 0, 1, 0, 1),
    (32, 2, 1, 1, 0, 1, 0, 0, 0, 2, 0),
    (16, 2, 1, 1, 0, 0, 1, 1, 0, 0, 1),
    (-12, 2, 1, 1, 0, 0, 1, 0, 1, 1, 0),
    (16, 2, 1, 0, 1, 1, 0, 0, 0, 1, 0),
    (2, 2, 1, 0, 1, 0, 1, 0, 1, 0, 0),
    (-14, 2, 0, 2, 0, 0, 1, 0, 1, 0, 1),
    (16, 2, 0, 2, 0, 0, 1, 0, 0, 2, 0),
    (16, 2, 0, 2, 0, 0, 0, 2, 0, 0, 1),
    (-20, 2, 0, 2, 0, 0, 0, 1, 1, 1, 0),
    (5, 2, 0, 2, 0, 0, 0, 0, 3, 0, 0),
    (-16, 2, 0, 1, 1, 1, 0, 0, 0, 0, 1),
    (16, 2, 0, 1, 1, 0, 1, 0, 0, 1, 0),
    (-12, 2, 0, 1, 1, 0, 0, 1, 1, 0, 0),
    (4, 2, 0, 0, 2, 0, 1, 0, 0, 0, 0),
    (-4, 1, 3, 0, 0, 1, 0, 0, 1, 0, 1),
    (32, 1, 2, 1, 0, 1, 0, 0, 0, 1, 1),
    (-8, 1, 2, 1, 0, 0, 1, 0, 1, 0, 1),
    (8, 1, 2, 0, 1, 1, 0, 0, 0, 0, 1),
    (8, 1, 2, 0, 1, 0, 1, 0, 0, 1, 0),
    (32, 1, 1, 2, 0, 1, 0, 0, 0, 0, 2),
    (16, 1, 1, 2, 0, 0, 1, 0, 0, 1, 1),
    (-12, 1, 1, 2, 0, 0, 0, 1, 1, 0, 1),
    (16, 1, 1, 1, 1, 0, 1, 0, 0, 0, 1),
    (16, 1, 1, 1, 1, 0, 0, 1, 0, 1, 0),
    (-10, 1, 1, 1, 1, 0, 0, 0, 2, 0, 0),
    (8, 1, 1, 0, 2, 0, 0, 1, 0, 0, 0),
    (16, 1, 0, 3, 0, 0, 1, 0, 0, 0, 2),
    (-6, 1, 0, 3, 0, 0, 0, 0, 2, 0, 1),
    (16, 1, 0, 2, 1, 0, 0, 1, 0, 0, 1),
    (-12, 1, 0, 2, 1, 0, 0, 0, 1, 1, 0),
    (-8, 1, 0, 1, 2, 0, 0, 0, 1, 0, 0),
    (8, 0, 3, 1, 0, 1, 0, 0, 0, 0, 2),
    (4, 0, 3, 0, 1, 0, 1, 0, 0, 0, 1),
    (4, 0, 2, 2, 0, 0, 1, 0, 0, 0, 2),
    (8, 0, 2, 1, 1, 0, 0, 1, 0, 0, 1),
    (5, 0, 2, 0, 2, 0, 0, 0, 1, 0, 0),
    (2, 0, 1, 2, 1, 0, 0, 0, 1, 0, 1),
    (8, 0, 1, 1, 2, 0, 0, 0, 0, 1, 0),
    (4, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0),
    (1, 0, 0, 4, 0, 0, 0, 0, 1, 0, 2),
    (4, 0, 0, 2, 2, 0, 0, 0, 0, 0, 1),
)

_CLASSICAL_DELTA_3 = (
    (-16, 4, 0, 0, 0, 2, 0, 0, 0, 1, 0),
    (8, 4, 0, 0, 0, 1, 1, 0, 1, 0, 0),
    (-16, 4, 0, 0, 0, 1, 0, 2, 0, 0, 0),
    (4, 4, 0, 0, 0, 0, 2, 1, 0, 0, 0),
    (-32, 3, 1, 0, 0, 2, 0, 0, 0, 0, 1),
    (-16, 3, 1, 0, 0, 1, 0, 1, 1, 0, 0),
    (4, 3, 1, 0, 0, 0, 2, 0, 1, 0, 0),
    (-16, 3, 0, 1, 0, 1, 1, 0, 0, 0, 1),
    (-8, 3, 0, 1, 0, 1, 0, 0, 2, 0, 0),
    (-32, 3, 0, 0, 1, 1, 0, 1, 0, 0, 0),
    (8, 3, 0, 0, 1, 0, 2, 0, 0, 0, 0),
    (-8, 2, 2, 0, 0, 1, 1, 0, 0, 0, 1),
    (-16, 2, 2, 0, 0, 1, 0, 1, 0, 1, 0),
    (4, 2, 2, 0, 0, 0, 2, 0, 0, 1, 0),
    (-16, 2, 1, 1, 0, 1, 0, 0, 1, 1, 0),
    (-8, 2, 1, 1, 0, 0, 2, 0, 0, 0, 1),
    (-24, 2, 1, 0, 1, 1, 0, 0, 1, 0, 0),
    (24, 2, 0, 2, 0, 1, 0, 0, 1, 0, 1),
    (-16, 2, 0, 2, 0, 1, 0, 0, 0, 2, 0),
    (-8, 2, 0, 2, 0, 0, 1, 1, 0, 0, 1),
    (-16, 2, 0, 1, 1, 1, 0, 0, 0, 1, 0),
    (-4, 2, 0, 1, 1, 0, 1, 0, 1, 0, 0),
    (-12, 2, 0, 0, 2, 1, 0, 0, 0, 0, 0),
    (-16, 1, 3, 0, 0, 1, 0, 1, 0, 0, 1),
    (4, 1, 3, 0, 0, 0, 2, 0, 0, 0, 1),
    (-24, 1, 2, 1, 0, 1, 0, 0, 1, 0, 1),
    (-16, 1, 2, 0, 1, 1, 0, 0, 0, 1, 0),
    (-16, 1, 1, 2, 0, 1, 0, 0, 0, 1, 1),
    (-4, 1, 1, 2, 0, 0, 1, 0, 1, 0, 1),
    (-24, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1),
    (-8, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0),
    (-4, 1, 1, 0, 2, 0, 1, 0, 0, 0, 0),
    (-16, 1, 0, 3, 0, 1, 0, 0, 0, 0, 2),
    (-8, 1, 0, 2, 1, 0, 1, 0, 0, 0, 1),
    (-8, 0, 3, 0, 1, 1, 0, 0, 0, 0, 1),
    (12, 0, 2, 2, 0, 1, 0, 0, 0, 0, 2),
    (-4, 0, 2, 1, 1, 0, 1, 0, 0, 0, 1),
    (8, 0, 1, 3, 0, 0, 1, 0, 0, 0, 2),
    (4, 0, 0, 4, 0, 0, 0, 1, 0, 0, 2),
    (4, 0, 0, 3, 1, 0, 0, 0, 1, 0, 1),
    (4, 0, 0, 2, 2, 0, 0, 0, 0, 1, 0),
    (4, 0, 0, 1, 3, 0, 0, 0, 0, 0, 0),
)

_CLASSICAL_DELTA_4 = (
    (-16, 4, 0, 0, 0, 2, 0, 0, 1, 0, 1),
    (16, 4, 0, 0, 0, 2, 0, 0, 0, 2, 0),
    (8, 4, 0, 0, 0, 1, 1, 1, 0, 0, 1),
    (-8, 4, 0, 0, 0, 1, 1, 0, 1, 1, 0),
    (16, 4, 0, 0, 0, 1, 0, 2, 0, 1, 0),
    (-4, 4, 0, 0, 0, 1, 0, 1, 2, 0, 0),
    (-2, 4, 0, 0, 0, 0, 3, 0, 0, 0, 1),
    (-4, 4, 0, 0, 0, 0, 2, 1, 0, 1, 0),
    (1, 4, 0, 0, 0, 0, 2, 0, 2, 0, 0),
    (32, 3, 1, 0, 0, 2, 0, 0, 0, 1, 1),
    (-16, 3, 1, 0, 0, 1, 1, 0, 1, 0, 1),
    (32, 3, 1, 0, 0, 1, 0, 2, 0, 0, 1),
    (-8, 3, 1, 0, 0, 0, 2, 1, 0, 0, 1),
    (32, 3, 0, 1, 0, 2, 0, 0, 0, 0, 2),
    (16, 3, 0, 1, 0, 1, 0, 1, 1, 0, 1),
    (-4, 3, 0, 1, 0, 0, 2, 0, 1, 0, 1),
    (32, 3, 0, 0, 1, 1, 0, 1, 0, 1, 0),
    (-8, 3, 0, 0, 1, 1, 0, 0, 2, 0, 0),
    (-8, 3, 0, 0, 1, 0, 2, 0, 0, 1, 0),
    (16, 2, 2, 0, 0, 2, 0, 0, 0, 0, 2),
    (8, 2, 2, 0, 0, 1, 0, 1, 1, 0, 1),
    (-2, 2, 2, 0, 0, 0, 2, 0, 1, 0, 1),
    (16, 2, 1, 1, 0, 1, 1, 0, 0, 0, 2),
    (8, 2, 1, 1, 0, 1, 0, 0, 2, 0, 1),
    (48, 2, 1, 0, 1, 1, 0, 1, 0, 0, 1),
    (-12, 2, 1, 0, 1, 0, 2, 0, 0, 0, 1),
    (-32, 2, 0, 2, 0, 1, 0, 1, 0, 0, 2),
    (8, 2, 0, 2, 0, 1, 0, 0, 1, 1, 1),
    (12, 2, 0, 2, 0, 0, 2, 0, 0, 0, 2),
    (16, 2, 0, 1, 1, 1, 0, 0, 1, 0, 1),
    (8, 2, 0, 0, 2, 1, 0, 0, 0, 1, 0),
    (-2, 2, 0, 0, 2, 0, 1, 0, 1, 0, 0),
    (8, 1, 2, 0, 1, 1, 0, 0, 1, 0, 1),
    (-8, 1, 1, 2, 0, 1, 0, 0, 1, 0, 2),
    (4, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1),
    (8, 1, 1, 0, 2, 1, 0, 0, 0, 0, 1),
    (-4, 1, 0, 3, 0, 0, 1, 0, 1, 0, 2),
    (-8, 1, 0, 2, 1, 1, 0, 0, 0, 0, 2),
    (-4, 0, 4, 0, 0, 1, 0, 1, 0, 0, 2),
    (1, 0, 4, 0, 0, 0, 2, 0, 0, 0, 2),
    (-8, 0, 3, 1, 0, 1, 0, 0, 1, 0, 2),
    (-16, 0, 2, 2, 0, 1, 0, 0, 0, 1, 2),
    (-2, 0, 2, 2, 0, 0, 1, 0, 1, 0, 2),
    (-16, 0, 2, 1, 1, 1, 0, 0, 0, 0, 2),
    (-8, 0, 1, 3, 0, 1, 0, 0, 0, 0, 3),
    (-8, 0, 1, 3, 0, 0, 1, 0, 0, 1, 2),
    (-12, 0, 1, 2, 1, 0, 1, 0, 0, 0, 2),
    (-2, 0, 0, 4, 0, 0, 1, 0, 0, 0, 3),
    (-4, 0, 0, 4, 0, 0, 0, 1, 0, 1, 2),
    (1, 0, 0, 4, 0, 0, 0, 0, 2, 0, 2),
    (-8, 0, 0, 3, 1, 0, 0, 1, 0, 0, 2),
    (-2, 0, 0, 2, 2, 0, 0, 0, 1, 0, 1),
    (1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0),
)


class Genus2KummerCapabilityError(NotImplementedError):
    """The model or divisor lies outside the checked Kummer envelope."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self.diagnostics = dict(diagnostics)


class Genus2KummerCapability:
    """Machine-readable result of exact Kummer capability detection."""

    def __init__(
        self,
        supported: bool,
        reason: str,
        diagnostics: dict[str, Any],
    ) -> None:
        self.supported = bool(supported)
        self.reason = str(reason)
        self.diagnostics = dict(diagnostics)

    def require(self) -> None:
        if not self.supported:
            raise Genus2KummerCapabilityError(self.reason, self.diagnostics)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-kummer-capability.v1",
            "supported": self.supported,
            "reason": self.reason,
            "diagnostics": dict(self.diagnostics),
        }

    def __bool__(self) -> bool:
        return self.supported

    def __repr__(self) -> str:
        return (
            "Genus2KummerCapability(supported="
            + repr(self.supported)
            + ", reason="
            + repr(self.reason)
            + ")"
        )


def _rational_pair(value: Any) -> tuple[int, int]:
    numerator_method = getattr(value, "numerator", None)
    denominator_method = getattr(value, "denominator", None)
    if callable(numerator_method) and callable(denominator_method):
        numerator = int(str(numerator_method()))
        denominator = int(str(denominator_method()))
    elif isinstance(value, int) and not isinstance(value, bool):
        numerator = int(value)
        denominator = 1
    else:
        raise TypeError("a Kummer coordinate must be rational")
    if denominator <= 0:
        raise ValueError("a rational coordinate needs a positive denominator")
    return numerator, denominator


def _rational_text(value: Any) -> str:
    numerator, denominator = _rational_pair(value)
    if denominator == 1:
        return str(numerator)
    return str(numerator) + "/" + str(denominator)


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def _lcm(left: int, right: int) -> int:
    if left == 0 or right == 0:
        return 0
    return abs((left // _gcd(left, right)) * right)


def _primitive_integer_coordinates(values: tuple[Any, ...]) -> tuple[int, ...]:
    pairs = [_rational_pair(value) for value in values]
    common_denominator = 1
    for _numerator, denominator in pairs:
        common_denominator = _lcm(common_denominator, denominator)
    integers = [
        numerator * (common_denominator // denominator)
        for numerator, denominator in pairs
    ]
    common = 0
    for value in integers:
        common = _gcd(common, value)
    if common == 0:
        raise ValueError("projective Kummer coordinates cannot all vanish")
    integers = [value // common for value in integers]
    for value in integers:
        if value:
            if value < 0:
                integers = [-entry for entry in integers]
            break
    return tuple(integers)


def _polynomial_coefficients(polynomial: Any, length: int) -> tuple[Any, ...]:
    base = polynomial.parent().base_ring()
    zero = base(0)
    return tuple(
        polynomial[index] if index <= polynomial.degree() else zero
        for index in range(length)
    )


def exact_model_capability(jacobian: Any) -> Genus2KummerCapability:
    """Return whether `jacobian` has the checked exact QQ Kummer model."""
    diagnostics: dict[str, Any] = {
        "algorithm": "mueller-cassels-flynn-odd-degree-kummer",
        "reference": "Mueller, LMS J. Comput. Math. 13 (2010), Sections 2-4",
    }
    dimension_method = getattr(jacobian, "dimension", None)
    if not callable(dimension_method) or int(str(dimension_method())) != 2:
        diagnostics["dimension"] = (
            None if not callable(dimension_method) else int(str(dimension_method()))
        )
        return Genus2KummerCapability(
            False, "exact Kummer coordinates require a genus-2 Jacobian", diagnostics
        )
    base_method = getattr(jacobian, "base_ring", None)
    base = None if not callable(base_method) else base_method()
    diagnostics["base_kind"] = getattr(base, "_kind", None)
    if getattr(base, "_kind", None) != "QQ":
        return Genus2KummerCapability(
            False,
            "exact arithmetic heights currently require base ring QQ",
            diagnostics,
        )
    f_value = jacobian.f()
    h_value = jacobian.h()
    diagnostics["f_degree"] = int(f_value.degree())
    diagnostics["h_degree"] = int(h_value.degree())
    diagnostics["model_degree"] = max(int(f_value.degree()), 2 * int(h_value.degree()))
    if diagnostics["model_degree"] != 5:
        diagnostics["even_degree_transform"] = "not inferred"
        return Genus2KummerCapability(
            False,
            "exact Kummer coordinates require the checked odd-degree model with "
            "one rational point at infinity",
            diagnostics,
        )
    try:
        for coefficient in _polynomial_coefficients(f_value, 7):
            _rational_pair(coefficient)
        for coefficient in _polynomial_coefficients(h_value, 4):
            _rational_pair(coefficient)
    except (TypeError, ValueError) as error:
        diagnostics["coefficient_error"] = str(error)
        return Genus2KummerCapability(
            False, "the Kummer model coefficients must be exact rationals", diagnostics
        )
    diagnostics["generalized_h"] = not h_value.is_zero()
    diagnostics["generalized_h_formula"] = (
        "direct" if diagnostics["generalized_h"] else "classical"
    )
    diagnostics["even_degree_transform"] = "not needed"
    return Genus2KummerCapability(True, "supported", diagnostics)


def exact_divisor_capability(divisor: Any) -> Genus2KummerCapability:
    """Return exact Kummer capability without prime-field serialization."""
    parent_method = getattr(divisor, "parent", None)
    jacobian = None if not callable(parent_method) else parent_method()
    model = exact_model_capability(jacobian)
    diagnostics = dict(model.diagnostics)
    if not model.supported:
        return Genus2KummerCapability(False, model.reason, diagnostics)
    uv_method = getattr(divisor, "uv", None)
    if not callable(uv_method):
        return Genus2KummerCapability(
            False, "the point must have a rational Mumford representation", diagnostics
        )
    try:
        uv_value = uv_method()
        if not isinstance(uv_value, tuple) or len(uv_value) != 2:
            raise TypeError("uv() must return a pair")
        u_value, v_value = uv_value
        degree = int(u_value.degree())
        diagnostics["divisor_degree"] = degree
        if degree < 0 or degree > 2:
            return Genus2KummerCapability(
                False,
                "a reduced genus-2 Mumford divisor has degree at most 2",
                diagnostics,
            )
        for coefficient in u_value.list():
            _rational_pair(coefficient)
        for coefficient in v_value.list():
            _rational_pair(coefficient)
    except (TypeError, ValueError) as error:
        diagnostics["divisor_error"] = str(error)
        return Genus2KummerCapability(
            False, "the Mumford coefficients must be exact rationals", diagnostics
        )
    return Genus2KummerCapability(True, "supported", diagnostics)


def divisor_provenance(divisor: Any) -> dict[str, Any]:
    """Return exact QQ model/divisor data independent of finite-field `to_data`."""
    capability = exact_divisor_capability(divisor)
    capability.require()
    jacobian = divisor.parent()
    f_value = jacobian.f()
    h_value = jacobian.h()
    u_value, v_value = divisor.uv()
    return {
        "schema": "sagejs.hyperelliptic.qq-mumford-divisor.v1",
        "genus": 2,
        "model": {
            "equation": "y^2 + h(x)*y = f(x)",
            "f_coefficients_ascending": tuple(
                _rational_text(value) for value in _polynomial_coefficients(f_value, 6)
            ),
            "h_coefficients_ascending": tuple(
                _rational_text(value) for value in _polynomial_coefficients(h_value, 3)
            ),
            "point_at_infinity": "unique-rational-weierstrass-point",
        },
        "u_coefficients_ascending": tuple(
            _rational_text(value) for value in u_value.list()
        ),
        "v_coefficients_ascending": tuple(
            _rational_text(value) for value in v_value.list()
        ),
    }


def _degree_two_coordinates(
    jacobian: Any, u_value: Any, v_value: Any
) -> tuple[Any, ...]:
    base = jacobian.base_ring()
    f_values = _polynomial_coefficients(jacobian.f(), 7)
    h_values = _polynomial_coefficients(jacobian.h(), 4)
    s_value = -u_value[1]
    p_value = u_value[0]
    a_value = v_value[1] if v_value.degree() >= 1 else base(0)
    f2, f3, f4, f5, f6 = f_values[2:7]
    h1, h2, h3 = h_values[1:4]

    # This is the polynomial continuation of
    # (F0(x1,x2)-2*y1*y2-h(x1)*y2-h(x2)*y1)/(x1-x2)^2.
    # It is invariant under v -> -h-v and remains valid when u has a double root.
    fourth = (
        a_value * a_value
        + a_value * (h1 + h2 * s_value + h3 * (s_value * s_value - p_value))
        - f2
        - f3 * s_value
        - f4 * s_value * s_value
        + f5 * p_value * s_value
        - f5 * s_value**3
        - f6 * p_value * p_value
        + 2 * f6 * p_value * s_value * s_value
        - f6 * s_value**4
    )
    return base(1), s_value, p_value, fourth


def _evaluate_sparse_quartic(
    coordinates: tuple[Any, Any, Any, Any],
    coefficients: tuple[Any, ...],
    terms: Any,
) -> Any:
    answer = coefficients[0] * 0
    values = coordinates + coefficients
    for term in terms:
        contribution = term[0]
        for index in range(10):
            exponent = term[index + 1]
            if exponent:
                contribution *= values[index] ** exponent
        answer += contribution
    return answer


def _evaluate_sparse_quartic_mod(
    coordinates: tuple[int, int, int, int],
    coefficients: tuple[int, ...],
    terms: Any,
    modulus: int,
) -> int:
    answer = 0
    values = coordinates + coefficients
    for term in terms:
        contribution = int(term[0]) % modulus
        for index in range(10):
            exponent = int(term[index + 1])
            if exponent:
                contribution = (
                    contribution * pow(int(values[index]), exponent, modulus)
                ) % modulus
        answer = (answer + contribution) % modulus
    return answer


def _classical_duplication_values(
    coordinates: tuple[Any, Any, Any, Any],
    coefficients: tuple[Any, ...],
) -> tuple[Any, Any, Any, Any]:
    tables = (
        _CLASSICAL_DELTA_1,
        _CLASSICAL_DELTA_2,
        _CLASSICAL_DELTA_3,
        _CLASSICAL_DELTA_4,
    )
    return cast(
        tuple[Any, Any, Any, Any],
        tuple(
            _evaluate_sparse_quartic(coordinates, coefficients, terms)
            for terms in tables
        ),
    )


def _direct_duplication_values(
    jacobian: Any, coordinates: tuple[int, int, int, int]
) -> tuple[Any, Any, Any, Any]:
    """Evaluate Flynn's exact odd-degree quartics, with Mueller's h-transform."""
    capability = exact_model_capability(jacobian)
    capability.require()
    f_value = jacobian.f()
    h_value = jacobian.h()
    base = jacobian.base_ring()
    h0, h1, h2 = _polynomial_coefficients(h_value, 3)
    k1, k2, k3, k4 = tuple(base(value) for value in coordinates)

    if h_value.is_zero():
        return _classical_duplication_values(
            (k1, k2, k3, k4), _polynomial_coefficients(f_value, 6)
        )

    # Mueller's linear Kummer isomorphism for y' = 2y+h sends our generalized
    # model to y'^2 = 4f+h^2.  In the checked odd-degree envelope h3=0.
    classical_f = 4 * f_value + h_value * h_value
    classical_coefficients = _polynomial_coefficients(classical_f, 6)
    classical_coordinates = (
        k1,
        k2,
        k3,
        4 * k4 - 2 * (h0 * h2 * k1 + h1 * h2 * k3),
    )
    d1, d2, d3, d4_classical = _classical_duplication_values(
        classical_coordinates, classical_coefficients
    )
    d4 = (d4_classical + 2 * (h0 * h2 * d1 + h1 * h2 * d3)) / 4
    return d1, d2, d3, d4


def classical_duplication_l1_bound(jacobian: Any) -> int:
    """Return an audited model-specific L1 bound for Flynn's quartics.

    If `x` has integral coordinates and `H=max(abs(x_i))`, every raw
    duplication coordinate is at most `bound*H^4`. The result is obtained
    directly from the checked-in sparse quartic tables.
    """
    capability = exact_model_capability(jacobian)
    capability.require()
    if not jacobian.h().is_zero() or int(jacobian.f().degree()) != 5:
        raise Genus2KummerCapabilityError(
            "the classical duplication L1 bound requires h=0 and degree(f)=5",
            dict(capability.diagnostics),
        )
    coefficient_values: list[int] = []
    for value in _polynomial_coefficients(jacobian.f(), 6):
        numerator, denominator = _rational_pair(value)
        if denominator != 1:
            raise Genus2KummerCapabilityError(
                "the classical duplication L1 bound requires integral coefficients",
                dict(capability.diagnostics),
            )
        coefficient_values.append(numerator)
    bounds: list[int] = []
    for terms in (
        _CLASSICAL_DELTA_1,
        _CLASSICAL_DELTA_2,
        _CLASSICAL_DELTA_3,
        _CLASSICAL_DELTA_4,
    ):
        total = 0
        for term in terms:
            contribution = abs(int(term[0]))
            for index in range(6):
                exponent = int(term[index + 5])
                if exponent:
                    contribution *= abs(coefficient_values[index]) ** exponent
            total += contribution
        bounds.append(total)
    return max(1, max(bounds))


def classical_duplication_raw(
    jacobian: Any,
    coordinates: tuple[int, int, int, int],
    *,
    modulus: int | None = None,
) -> tuple[int, int, int, int]:
    """Evaluate exact classical quartics, optionally modulo `modulus`.

    This operation deliberately does not projectively normalize. It is the
    factorization-free primitive used by finite local-height correction.
    """
    capability = exact_model_capability(jacobian)
    capability.require()
    if not jacobian.h().is_zero() or int(jacobian.f().degree()) != 5:
        raise Genus2KummerCapabilityError(
            "raw classical duplication requires h=0 and degree(f)=5",
            dict(capability.diagnostics),
        )
    coefficient_values: list[int] = []
    for value in _polynomial_coefficients(jacobian.f(), 6):
        numerator, denominator = _rational_pair(value)
        if denominator != 1:
            raise Genus2KummerCapabilityError(
                "raw classical duplication requires integral coefficients",
                dict(capability.diagnostics),
            )
        coefficient_values.append(numerator)
    integer_coordinates = cast(
        tuple[int, int, int, int], tuple(int(value) for value in coordinates)
    )
    integer_coefficients = tuple(coefficient_values)
    tables = (
        _CLASSICAL_DELTA_1,
        _CLASSICAL_DELTA_2,
        _CLASSICAL_DELTA_3,
        _CLASSICAL_DELTA_4,
    )
    if modulus is None:
        return cast(
            tuple[int, int, int, int],
            tuple(
                int(
                    _evaluate_sparse_quartic(
                        integer_coordinates, integer_coefficients, terms
                    )
                )
                for terms in tables
            ),
        )
    modulus = int(modulus)
    if modulus <= 0:
        raise ValueError("a duplication modulus must be positive")
    return cast(
        tuple[int, int, int, int],
        tuple(
            _evaluate_sparse_quartic_mod(
                integer_coordinates, integer_coefficients, terms, modulus
            )
            for terms in tables
        ),
    )


class KummerCoordinates:
    """Primitive integral projective Kummer coordinates with exact provenance."""

    def __init__(self, divisor: Any, values: tuple[Any, ...]) -> None:
        self._divisor = divisor
        self._jacobian = divisor.parent()
        self._coordinates = _primitive_integer_coordinates(values)
        self._provenance = divisor_provenance(divisor)
        self._duplication_steps = 0
        self._raw_from_previous: tuple[Any, ...] | None = None

    @classmethod
    def _from_duplication(
        cls, source: KummerCoordinates, values: tuple[Any, ...]
    ) -> KummerCoordinates:
        answer = cls.__new__(cls)
        answer._divisor = None
        answer._jacobian = source._jacobian
        answer._coordinates = _primitive_integer_coordinates(values)
        answer._provenance = source._provenance
        answer._duplication_steps = source._duplication_steps + 1
        answer._raw_from_previous = values
        return answer

    def divisor(self) -> Any:
        if self._divisor is None:
            raise ValueError(
                "a directly duplicated Kummer point has no chosen Mumford lift"
            )
        return self._divisor

    def jacobian(self) -> Any:
        return self._jacobian

    def coordinates(self) -> tuple[int, int, int, int]:
        return cast(tuple[int, int, int, int], self._coordinates)

    def duplicate(self) -> KummerCoordinates:
        return duplicate_kummer_coordinates(self)

    def raw_coordinates_before_normalization(self) -> tuple[Any, ...]:
        """Return raw quartic output for this duplication step."""
        if self._raw_from_previous is None:
            raise ValueError("the initial Kummer point has no preceding duplication")
        return self._raw_from_previous

    def naive_height_integer(self) -> int:
        return max(abs(value) for value in self._coordinates)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-kummer-point.v1",
            "coordinates": tuple(str(value) for value in self._coordinates),
            "divisor": self._provenance,
            "normalization": "primitive-integral-first-nonzero-positive",
            "theta_normalization": "Cassels-Flynn 2Theta Kummer embedding",
            "direct_duplication_steps": self._duplication_steps,
            "duplication_algorithm": "flynn-odd-quintic-quartics.v1",
        }

    def __iter__(self) -> Any:
        yield from self._coordinates

    def __getitem__(self, index: int) -> int:
        return self._coordinates[index]

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, KummerCoordinates)
            and self._coordinates == other._coordinates
            and self._provenance["model"] == other._provenance["model"]
        )

    def __hash__(self) -> int:
        return hash((self._coordinates, repr(self._provenance["model"])))

    def __repr__(self) -> str:
        return "KummerCoordinates" + repr(self._coordinates)


def kummer_coordinates(divisor: Any) -> KummerCoordinates:
    """Return exact primitive Kummer coordinates for a rational divisor."""
    capability = exact_divisor_capability(divisor)
    capability.require()
    jacobian = divisor.parent()
    base = jacobian.base_ring()
    u_value, v_value = divisor.uv()
    degree = int(u_value.degree())
    if degree == 0:
        values = (base(0), base(0), base(0), base(1))
    elif degree == 1:
        x_value = -u_value[0]
        f5 = _polynomial_coefficients(jacobian.f(), 6)[5]
        values = (base(0), base(1), x_value, f5 * x_value * x_value)
    else:
        values = _degree_two_coordinates(jacobian, u_value, v_value)
    return KummerCoordinates(divisor, values)


def duplicate_kummer(divisor: Any) -> KummerCoordinates:
    """Exactly duplicate a divisor using direct Kummer quartics."""
    capability = exact_divisor_capability(divisor)
    capability.require()
    return duplicate_kummer_coordinates(kummer_coordinates(divisor))


def duplicate_kummer_coordinates(point: KummerCoordinates) -> KummerCoordinates:
    """Exactly duplicate an existing Kummer point without a Mumford lift.

    Flynn's published classical quartics are evaluated from sparse immutable
    term tables.  Generalized odd-degree models use Mueller's exact linear
    transformation to `y'^2=4f+h^2`, followed by the inverse transformation.
    """
    if not isinstance(point, KummerCoordinates):
        raise TypeError("direct Kummer duplication expects KummerCoordinates")
    values = _direct_duplication_values(point.jacobian(), point.coordinates())
    return KummerCoordinates._from_duplication(point, values)


__all__ = [
    "classical_duplication_l1_bound",
    "classical_duplication_raw",
    "Genus2KummerCapability",
    "Genus2KummerCapabilityError",
    "KummerCoordinates",
    "divisor_provenance",
    "duplicate_kummer",
    "duplicate_kummer_coordinates",
    "exact_divisor_capability",
    "exact_model_capability",
    "kummer_coordinates",
]
