"""Source-transparent traversal of a borrowed generated M4RI resource."""

from __future__ import annotations

from sagejs.ffi.m4ri import (
    M4riMatrix,
    matrix_entry_code,
    matrix_ncols,
    matrix_nrows,
)
from sagejs.native import native


@native
def m4ri_matrix_nonzero_count(source: M4riMatrix) -> int:
    """Count nonzero entries without crossing the host inside the loop."""
    count = 0
    rows = matrix_nrows(source)
    columns = matrix_ncols(source)
    for row in range(rows):
        for column in range(columns):
            if matrix_entry_code(source, row, column) != 0:
                count += 1
    return count
