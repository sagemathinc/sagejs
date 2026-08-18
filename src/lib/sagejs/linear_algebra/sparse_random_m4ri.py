"""Optional M4RI bulk executor for sparse random binary matrices."""

from __future__ import annotations

from sagejs.ffi.m4ri import (
    M4riMatrix,
    matrix_ncols,
    matrix_nrows,
    matrix_set_entry,
)
from sagejs.native import IntegerBuffer, native, uint64


@native
def sparse_random_m4ri_native(
    target: M4riMatrix,
    threshold: uint64,
    initial_state: uint64,
    final_state: IntegerBuffer,
    word_base: uint64,
    multiplier: uint64,
    increment: uint64,
) -> bool:
    """Fill `GF(2)` storage by Sage's inclusive per-entry Bernoulli rule."""
    rows: uint64 = matrix_nrows(target)
    columns: uint64 = matrix_ncols(target)
    if len(final_state) != 1 or word_base == 0 or initial_state >= word_base:
        return False

    state: uint64 = initial_state
    consumed = 0
    one: uint64 = word_base // word_base
    for row in range(rows):
        for column in range(columns):
            if consumed != 0:
                state = (multiplier * state + increment) % word_base
            consumed = 1
            if state <= threshold:
                if not matrix_set_entry(target, row, column, one):
                    return False
    final_state[0] = state
    return True


__all__ = ["sparse_random_m4ri_native"]
