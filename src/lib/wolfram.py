"""Small runtime used by the experimental Wolfram Language frontend."""

from typing import Any, Callable

import sagejs as sage


def _runtime_type_name(value: Any) -> str:
    name = type(value).__name__
    if name.startswith("ρσ_"):
        return name[3:]
    return name


def head(value: Any) -> str:
    """Return the Wolfram head corresponding to a shared evaluator object."""

    names = {
        "bool": "Boolean",
        "int": "Integer",
        "Integer": "Integer",
        "Rational": "Rational",
        "float": "Real",
        "RealLiteral": "Real",
        "RealNumberElement": "Real",
        "complex": "Complex",
        "ComplexNumberElement": "Complex",
        "str": "String",
        "list": "List",
        "list_constructor": "List",
        "tuple": "List",
        "set": "Set",
        "dict": "Association",
        "ndarray": "NumericArray",
        "PolynomialRingParent": "PolynomialRing",
        "PolynomialElement": "Polynomial",
        "Expression": "SageExpression",
        "Graphics": "Graphics",
        "Graphics3d": "Graphics3D",
    }
    name = _runtime_type_name(value)
    return names[name] if name in names else name


def dimensions(value: Any) -> list[int]:
    if hasattr(value, "shape"):
        return [int(dimension) for dimension in value.shape]
    if not isinstance(value, (list, tuple)):
        return []
    result = [len(value)]
    if value:
        child = dimensions(value[0])
        if all(dimensions(item) == child for item in value):
            result.extend(child)
    return result


def length(value: Any) -> int:
    if hasattr(value, "shape"):
        shape = value.shape
        return int(shape[0]) if len(shape) else 0
    try:
        return len(value)
    except TypeError:
        return 0


def factor_integer(value: Any) -> list[list[Any]]:
    result = []
    for pair in sage.factor(value):
        result.append([pair[0], pair[1]])
    return result


def prime(index: int) -> int:
    if index < 1:
        raise ValueError("Prime index must be positive")
    found = 0
    candidate = 1
    while found < index:
        candidate += 1
        if sage.is_prime(candidate):
            found += 1
    return candidate


def wolfram_range(
    start: int,
    stop: int | None = None,
    step: int = 1,
) -> list[int]:
    if stop is None:
        stop = start
        start = 1
    if step == 0:
        raise ValueError("Range step must not be zero")
    boundary = stop + (1 if step > 0 else -1)
    return list(range(start, boundary, step))


def table(
    function: Callable[[Any], Any],
    start: int,
    stop: int,
    step: int = 1,
) -> list[Any]:
    return [function(value) for value in wolfram_range(start, stop, step)]


FactorInteger = factor_integer
Dimensions = dimensions
Head = head
Length = length
Prime = prime
Range = wolfram_range
Table = table
