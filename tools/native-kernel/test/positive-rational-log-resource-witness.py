"""Source-transparent witness for resident positive-rational logarithms."""

from __future__ import annotations

from sagejs.ffi.flint import FmpzMatrix, positive_rational_log_balls_resource
from sagejs.native import native, uint64


@native
def positive_rational_log_batch(
    output: FmpzMatrix,
    numerators: FmpzMatrix,
    denominators: FmpzMatrix,
    count: uint64,
    precision: uint64,
) -> bool:
    """Export outward dyadic logarithm endpoints into `output`."""
    return positive_rational_log_balls_resource(
        output,
        numerators,
        denominators,
        count,
        precision,
    )
