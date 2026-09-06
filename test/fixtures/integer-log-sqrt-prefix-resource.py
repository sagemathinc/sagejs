"""Same-source borrowed and root-owned logical-prefix Arb witnesses."""

from __future__ import annotations

from sagejs.ffi.flint import (
    FmpzMatrix,
    fmpz_matrix,
    integer_log_sqrt_balls_prefix_resource,
)
from sagejs.native import NativeExactArena, native, uint64


@native
def integer_log_sqrt_prefix(
    output: FmpzMatrix,
    source: FmpzMatrix,
    count: uint64,
    precision: uint64,
) -> bool:
    """Evaluate exactly the active prefix; retain the caller's matrix roots."""
    return integer_log_sqrt_balls_prefix_resource(output, source, count, precision)


def _repeated_prefix(
    output: FmpzMatrix,
    source: FmpzMatrix,
    count: uint64,
) -> bool:
    return integer_log_sqrt_balls_prefix_resource(output, source, count, 64)


@native
def integer_log_sqrt_resident(temporary_limit: uint64, fail_active: bool) -> int:
    """Borrow one fixed pair through growing and shrinking exact prefixes."""
    with NativeExactArena(1048576, temporary_limit) as arena:
        retained = arena.integer_vector(1, 0)
        dyadic_one: int = 18446744073709551616
        retained[0] = 10 * dyadic_one - 991
        source = arena.foreign_resource(fmpz_matrix, 6, 1)
        endpoints = arena.foreign_resource(fmpz_matrix, 24, 1)
        source[0, 0] = 1
        source[1, 0] = 4
        source[2, 0] = 9
        source[3, 0] = 16
        source[4, 0] = 0
        source[5, 0] = -7
        row: uint64 = 0
        while row < 24:
            endpoints[row, 0] = -991
            row += 1
        if not _repeated_prefix(endpoints, source, 2):
            return -1
        if not _repeated_prefix(endpoints, source, 4):
            return -1
        if fail_active and not _repeated_prefix(endpoints, source, 5):
            return -1
        if not _repeated_prefix(endpoints, source, 1):
            return -1
        row = 16
        while row < 24:
            if endpoints[row, 0] != -991:
                return -1
            row += 1
        total = (
            endpoints[2, 0]
            + endpoints[6, 0]
            + endpoints[10, 0]
            + endpoints[14, 0]
            + endpoints[20, 0]
        )
        if total != retained[0]:
            return -1
        return retained[0]
