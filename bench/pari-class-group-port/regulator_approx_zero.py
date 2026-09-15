"""PARI 2.17.4 real-domain cx_approx0 and gauss_get_pivot_max.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Reference coordinates belong to the ORIGINAL matrix, even after work rows
are exchanged. Zero reals participate in exponent maximization; a rejected
maximum is not replaced by a second candidate. No regulator is certified.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .regulator_scalar import pari_validate_regulator_values


@native
def pari_regulator_exponent(m: int, p: int, e: int) -> int:
    """gexpo on an already validated scalar, not log2 of its exact value."""
    if p == -1:
        if m == 0:
            return -(1 << 61)
        return abs(m).bit_length() - 1
    if p == -2:
        # gexpo_safe(t_FRAC) uses expi(numerator)-expi(denominator).
        return abs(m).bit_length() - e.bit_length()
    return e


@native
def pari_regulator_approx_zero(m: int, p: int, e: int, reference_exponent: int) -> bool:
    """Real-domain cx_approx0 on validated scalars, with gexpo(reference)."""
    if m == 0:
        return True
    if p < 0:
        return False
    return reference_exponent - e > p


@native
def pari_regulator_pivot_max_unchecked(
    work: IntegerBuffer,
    reference: IntegerBuffer,
    rows: int,
    column: int,
    occupied: Int64Buffer,
    use_occupied: bool,
) -> int:
    """Literal callback on validated resident owners; column is one-based."""
    best = 0
    best_exponent = -(1 << 61)
    start = column - 1
    if use_occupied:
        start = 0
    for i in range(start, rows):
        if use_occupied and occupied[i] != 0:
            continue
        at = ((column - 1) * rows + i) * 3
        exponent = pari_regulator_exponent(work[at], work[at + 1], work[at + 2])
        if exponent > best_exponent:
            best = i + 1
            best_exponent = exponent
    if best == 0:
        return rows + 1
    at = ((column - 1) * rows + best - 1) * 3
    reference_exponent = pari_regulator_exponent(
        reference[at], reference[at + 1], reference[at + 2]
    )
    if reference[at] == 0 and reference[at + 1] < 0:
        # isrationalzero(r): use the ENTIRE original reference column.
        reference_exponent = -(1 << 61)
        for i in range(rows):
            pos = ((column - 1) * rows + i) * 3
            exponent = pari_regulator_exponent(
                reference[pos], reference[pos + 1], reference[pos + 2]
            )
            if exponent > reference_exponent:
                reference_exponent = exponent
    if pari_regulator_approx_zero(
        work[at], work[at + 1], work[at + 2], reference_exponent
    ):
        return rows + 1
    return best


@native
def pari_regulator_pivot_max(
    work: IntegerBuffer,
    reference: IntegerBuffer,
    rows: int,
    columns: int,
    column: int,
    occupied: Int64Buffer,
    use_occupied: bool,
) -> int:
    """Return one-based pivot or rows+1, without mutating any owner.

    False selects determinant's NULL-occupancy scan starting at column.
    True examines all unoccupied rows, for later inverse/Gaussian callers.
    Original reference and current work must have the same packed shape.
    """
    if rows < 0 or columns < 1 or column < 1 or column > columns:
        raise ValueError("invalid maximal-pivot dimensions")
    if use_occupied and len(occupied) < rows:
        raise ValueError("short maximal-pivot occupancy")
    pari_validate_regulator_values(work, rows * columns)
    pari_validate_regulator_values(reference, rows * columns)
    return pari_regulator_pivot_max_unchecked(
        work, reference, rows, column, occupied, use_occupied
    )
