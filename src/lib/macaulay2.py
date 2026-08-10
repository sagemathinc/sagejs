"""Compatibility helpers for the experimental Macaulay2 frontend."""

from __future__ import annotations

from typing import Any

import sagejs as sage


def _untyped(value: Any) -> Any:
    return value


def polynomial_ring(base: Any, names: tuple[str, ...]) -> Any:
    return _untyped(sage.PolynomialRing)(base, names)


def ideal(*generators: Any) -> Any:
    values = list(generators)
    if len(values) == 1 and isinstance(values[0], (list, tuple)):
        values = list(values[0])
    if len(values) == 0:
        raise ValueError("ideal requires at least one generator")
    parent = values[0].parent()
    return parent.ideal(values)


def gb(value: Any) -> Any:
    if hasattr(value, "groebner_basis"):
        return value.groebner_basis()
    raise TypeError("gb expects an ideal or module with a Groebner basis")


def gens(value: Any) -> Any:
    if hasattr(value, "gens"):
        return value.gens()
    try:
        return tuple(value)
    except TypeError:
        raise TypeError(  # noqa: B904
            "gens expects a ring, ideal, module, or basis"
        )


def mingens(value: Any) -> Any:
    if hasattr(value, "minimal_generators"):
        return value.minimal_generators()
    return gens(value)


def numgens(value: Any) -> int:
    return len(gens(value))


def degree(value: Any) -> Any:
    if hasattr(value, "degree"):
        return value.degree()
    raise TypeError("degree is not defined for this value")


def dim(value: Any) -> Any:
    if hasattr(value, "dimension"):
        return value.dimension()
    if hasattr(value, "krull_dimension"):
        return value.krull_dimension()
    raise TypeError("dim is not defined for this value")
