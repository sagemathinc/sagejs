"""Small executable examples for Compiled Python v20 documentation."""

from __future__ import annotations

from sagejs.native import (
    Float64Buffer,
    float64_record,
    native,
    uint64,
)


@native
def quadratic_sum(n: uint64) -> Integer:
    total = 0
    for k in range(n):
        total += k * k
    return total


@native
def quadratic_sum_declared(n: uint64) -> Integer:
    total: Integer = 0
    for k in range(n):
        total += k * k
    return total


@native
def float64_record_at(
    state: Float64Buffer,
    start: uint64,
    length: uint64,
    index: uint64,
) -> float:
    record = float64_record(state, start, length)
    return record[index]
