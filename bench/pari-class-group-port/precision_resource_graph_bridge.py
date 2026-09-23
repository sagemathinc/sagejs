"""Minimal exact-owner to precision-resource graph bridge.

The caller owns all FLINT matrices.  `scratch` is precision-dependent and may
be overwritten by each attempt.  `published` changes only after the selected
attempt succeeds and the exact owner is revalidated, making a failed retry
non-publishing without introducing a new compiler ownership construct.
"""

from __future__ import annotations

from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix
from sagejs.native import checked_uint64, native, uint64

from .precision_resource_graph_leaf import (
    pari_exact_owner_checksum,
    pari_refresh_positive_log_balls,
)


@native
def pari_precision_matrix_create(rows: uint64, columns: uint64) -> FmpzMatrix:
    """Construct a test owner through the same declared resource boundary."""
    return fmpz_matrix(rows, columns)


@native
def pari_precision_matrix_set(
    owner: FmpzMatrix,
    row: uint64,
    column: uint64,
    value: int,
) -> bool:
    """Set one exact entry through a public resource borrow."""
    owner[row, column] = value
    return True


@native
def pari_precision_matrix_entry(
    owner: FmpzMatrix,
    row: uint64,
    column: uint64,
) -> int:
    """Read one exact entry through a public resource borrow."""
    return owner[row, column]


@native
def pari_precision_resource_retry_bridge(
    exact_owner: FmpzMatrix,
    exact_rows: uint64,
    exact_columns: uint64,
    numerators: FmpzMatrix,
    denominators: FmpzMatrix,
    scratch: FmpzMatrix,
    published: FmpzMatrix,
    diagnostics: FmpzMatrix,
    count: uint64,
    initial_precision: uint64,
    retry_precision: uint64,
    force_retry: bool,
) -> bool:
    """Refresh precision state while retaining authenticated exact state."""
    before = pari_exact_owner_checksum(exact_owner, exact_rows, exact_columns)
    if not pari_refresh_positive_log_balls(
        scratch,
        numerators,
        denominators,
        count,
        initial_precision,
    ):
        return False
    attempts: uint64 = 1
    selected_precision = initial_precision
    if force_retry:
        if retry_precision <= initial_precision:
            return False
        if not pari_refresh_positive_log_balls(
            scratch,
            numerators,
            denominators,
            count,
            retry_precision,
        ):
            return False
        attempts = 2
        selected_precision = retry_precision

    after = pari_exact_owner_checksum(exact_owner, exact_rows, exact_columns)
    if before != after:
        return False

    active_rows: uint64 = checked_uint64(2 * count)
    row: uint64 = 0
    while row < active_rows:
        published[row, 0] = scratch[row, 0]
        row += 1
    diagnostics[0, 0] = before
    diagnostics[1, 0] = after
    diagnostics[2, 0] = selected_precision
    diagnostics[3, 0] = attempts
    return True
