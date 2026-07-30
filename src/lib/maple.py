"""Compatibility helpers for the experimental Maple frontend."""

from typing import Any, Callable

import sagejs as sage

infinity = 1e309
CATALAN = 0.915965594177219


def _runtime_type_name(value: Any) -> str:
    name = type(value).__name__
    if name.startswith("ρσ_"):
        return name[3:]
    return name


def whattype(value: Any) -> str:
    """Return a Maple-style type name for a shared evaluator object."""

    names = {
        "bool": "boolean",
        "int": "integer",
        "Integer": "integer",
        "Rational": "fraction",
        "float": "float",
        "RealLiteral": "float",
        "RealNumberElement": "float",
        "complex": "complex",
        "ComplexNumberElement": "complex",
        "str": "string",
        "list": "list",
        "list_constructor": "list",
        "tuple": "exprseq",
        "set": "set",
        "dict": "table",
        "ndarray": "Array",
        "PolynomialRingParent": "polynom",
        "PolynomialElement": "polynom",
        "Expression": "expression",
        "Graphics": "PLOT",
        "Graphics3d": "PLOT3D",
    }
    name = _runtime_type_name(value)
    return names[name] if name in names else name


def nops(value: Any) -> int:
    if hasattr(value, "shape"):
        result = 1
        for dimension in value.shape:
            result *= int(dimension)
        return result
    try:
        return len(value)
    except TypeError:
        return 0


def maple_range(start: int, stop: int, step: int = 1) -> list[int]:
    if step == 0:
        raise ValueError("Maple range step must not be zero")
    boundary = stop + (1 if step > 0 else -1)
    return list(range(start, boundary, step))


def seq(
    function: Callable[[Any], Any],
    start: int,
    stop: int,
    step: int = 1,
) -> list[Any]:
    return [function(value) for value in maple_range(start, stop, step)]


def ithprime(index: int) -> int:
    if index < 1:
        raise ValueError("prime index must be positive")
    found = 0
    candidate = 1
    while found < index:
        candidate += 1
        if sage.is_prime(candidate):
            found += 1
    return candidate


def factorial(value: int) -> int:
    if value < 0:
        raise ValueError("factorial is not defined for negative integers")
    result = 1
    for factor in range(2, value + 1):
        result *= factor
    return result
