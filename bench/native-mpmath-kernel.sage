from __future__ import annotations

from sagejs.native import native


@native
def harmonic_cubic_loop(
    field: RealField, terms: uint64
) -> RealNumber:
    total = field(0)
    for denominator in range(1, terms + 1):
        total += field(1) / field(denominator) ** 3
    return total
