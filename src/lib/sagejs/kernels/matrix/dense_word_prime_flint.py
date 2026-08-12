"""Source-transparent traversal of generated FLINT word-prime matrices."""

from __future__ import annotations

from sagejs.ffi.flint import (
    NmodMatrix,
    nmod_matrix_entry,
    nmod_matrix_ncols,
    nmod_matrix_nrows,
)
from sagejs.native import native, uint64


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


__all__ = ["flint_word_prime_matrix_nonzero_count"]
