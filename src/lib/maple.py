"""Compatibility helpers for the experimental Maple frontend."""

from typing import Any, Callable

import sagejs as sage

infinity = 1e309
CATALAN = 0.915965594177219


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
