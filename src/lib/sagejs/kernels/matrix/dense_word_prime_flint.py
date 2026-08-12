"""Source-transparent traversal of generated FLINT word-prime matrices."""

from __future__ import annotations

from sagejs.ffi.flint import (
    NmodMatrix,
    nmod_matrix_entry,
    nmod_matrix_ncols,
    nmod_matrix_nrows,
)
from sagejs.native import Int64Buffer, native, uint64


@native
def flint_word_prime_matrix_pivots(
    output: Int64Buffer,
    matrix: NmodMatrix,
) -> int:
    """Write pivot columns while borrowing an echelon-form nmod matrix."""
    rows: uint64 = nmod_matrix_nrows(matrix)
    columns: uint64 = nmod_matrix_ncols(matrix)
    capacity = rows
    if columns < capacity:
        capacity = columns
    if len(output) < capacity:
        return -1
    pivot_count = 0
    search_start: uint64 = 0
    one: uint64 = 1
    for row in range(rows):
        pivot = columns
        for column in range(columns):
            if (
                column >= search_start
                and pivot == columns
                and nmod_matrix_entry(matrix, row, column) != 0
            ):
                pivot = column
        if pivot != columns:
            output[pivot_count] = pivot
            pivot_count += 1
            search_start = pivot + one
    return pivot_count


@native
def flint_word_prime_matrix_nonzero_count(matrix: NmodMatrix) -> int:
    """Safely borrow and traverse every residue without host callbacks."""
    rows: uint64 = nmod_matrix_nrows(matrix)
    columns: uint64 = nmod_matrix_ncols(matrix)
    count = 0
    for row in range(rows):
        for column in range(columns):
            if nmod_matrix_entry(matrix, row, column) != 0:
                count += 1
    return count


__all__ = [
    "flint_word_prime_matrix_nonzero_count",
    "flint_word_prime_matrix_pivots",
]
