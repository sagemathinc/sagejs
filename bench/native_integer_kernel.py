from __future__ import annotations

from sagejs.native import native


@native
def integer_quadratic_sum(n: uint64) -> Integer:
    total = 0
    for index in range(n):
        total += 1 - index * index
    return total


@native
def integer_round_trip(value: Integer) -> Integer:
    """Exercise an exact scalar across the host-independent kernel ABI."""
    return value
