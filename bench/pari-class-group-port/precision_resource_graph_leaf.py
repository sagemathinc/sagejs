"""Declared Arb precision leaf over caller-owned exact FLINT resources.

This probe deliberately keeps the precision-dependent operation in a separate
module.  The native compiler must therefore preserve resource identity and the
declared FFI call while cloning the imported call graph.
"""

from __future__ import annotations

from sagejs.ffi.flint import FmpzMatrix, positive_rational_log_balls_resource
from sagejs.native import native, uint64


@native
def pari_refresh_positive_log_balls(
    scratch: FmpzMatrix,
    numerators: FmpzMatrix,
    denominators: FmpzMatrix,
    count: uint64,
    precision: uint64,
) -> bool:
    """Rebuild the active dyadic log-ball prefix at `precision`."""
    return positive_rational_log_balls_resource(
        scratch,
        numerators,
        denominators,
        count,
        precision,
    )


@native
def pari_exact_owner_checksum(
    owner: FmpzMatrix,
    rows: uint64,
    columns: uint64,
) -> int:
    """Read an exact resident owner before or after a precision rebuild."""
    total = 0
    row: uint64 = 0
    while row < rows:
        column: uint64 = 0
        while column < columns:
            total += owner[row, column]
            column += 1
        row += 1
    return total
