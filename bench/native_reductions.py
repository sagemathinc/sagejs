"""Natural exact reductions for Sage.js Compiled Python v20."""

from __future__ import annotations

from sagejs.native import native


@native
def reduction_gcd(a: Integer, b: Integer) -> Integer:
    while b:
        a, b = b, a % b
    return abs(a)


@native
def sum_gcd_reduction(n: Integer) -> Integer:
    return sum(reduction_gcd(i, i + 2) for i in range(n))


@native
def sum_gcd_loop(n: Integer) -> Integer:
    total = 0
    for i in range(n):
        total += reduction_gcd(i, i + 2)
    return total


@native
def filtered_square_sum(n: Integer, start: Integer = 7) -> Integer:
    index = 100
    return index + sum(
        (index * index for index in range(1, n) if index % 2),
        start=start,
    )


@native
def eager_square_sum(n: Integer) -> Integer:
    return sum([index * index for index in range(n)], 3)
