"""Exact incremental row-HNF research kernel; not production dispatch.

See docs/cubic-analytic-schedule.md for its invariant, differential tests,
resource scope and costlier cubic-field measurements.
"""

from sagejs.native import uint64
from sagejs.ffi.flint import FmpzMatrix


def _cubic_insert_row_hnf(
    reduced: FmpzMatrix,
    source: FmpzMatrix,
    dimension: uint64,
) -> bool:
    """Insert the last row into a padded canonical row HNF.

    The first dimension rows of source are an upper row HNF, with zero rows
    last. Source and reduced are distinct (dimension+1)-by-dimension matrices.
    Every change below is a unimodular row operation. The extra row carries
    the residual while the pivot cursor advances, including skipped pivots.
    Euclidean reduction above each positive pivot gives the unique row HNF.
    No full-rank hypothesis, machine-integer arithmetic, or rank guess is used.
    """
    row: uint64 = 0
    while row <= dimension:
        column: uint64 = 0
        while column < dimension:
            reduced[row, column] = source[row, column]
            column += 1
        row += 1
    pivot_row: uint64 = 0
    column = 0
    while column < dimension:
        a = reduced[pivot_row, column]
        b = reduced[dimension, column]
        if a != 0 or b != 0:
            if a == 0:
                # A new earlier pivot displaces the old row into the residual.
                j: uint64 = column
                while j < dimension:
                    old = reduced[pivot_row, j]
                    reduced[pivot_row, j] = reduced[dimension, j]
                    reduced[dimension, j] = old
                    j += 1
            elif b != 0:
                if b % a == 0:
                    quotient = b // a
                    j: uint64 = column
                    while j < dimension:
                        reduced[dimension, j] = (
                            reduced[dimension, j] - quotient * reduced[pivot_row, j]
                        )
                        j += 1
                else:
                    # Bezout pair: determinant of [[s,t],[-b/g,a/g]] is one.
                    old_r = a
                    r = b
                    old_s = 1
                    s = 0
                    old_t = 0
                    t = 1
                    while r != 0:
                        quotient = old_r // r
                        next_r = old_r - quotient * r
                        old_r = r
                        r = next_r
                        next_s = old_s - quotient * s
                        old_s = s
                        s = next_s
                        next_t = old_t - quotient * t
                        old_t = t
                        t = next_t
                    if old_r < 0:
                        old_r = -old_r
                        old_s = -old_s
                        old_t = -old_t
                    left = -(b // old_r)
                    right = a // old_r
                    j: uint64 = column
                    while j < dimension:
                        old = reduced[pivot_row, j]
                        extra = reduced[dimension, j]
                        reduced[pivot_row, j] = old_s * old + old_t * extra
                        reduced[dimension, j] = left * old + right * extra
                        j += 1
            pivot = reduced[pivot_row, column]
            if pivot < 0:
                j: uint64 = column
                while j < dimension:
                    reduced[pivot_row, j] = -reduced[pivot_row, j]
                    j += 1
                pivot = -pivot
            if pivot == 0:
                return False
            row = 0
            while row < pivot_row:
                quotient = reduced[row, column] // pivot
                if quotient != 0:
                    j: uint64 = column
                    while j < dimension:
                        reduced[row, j] = (
                            reduced[row, j] - quotient * reduced[pivot_row, j]
                        )
                        j += 1
                row += 1
            pivot_row += 1
        column += 1
    return True


def _cubic_insert_row_hnf_inplace(
    basis: FmpzMatrix,
    residual: FmpzMatrix,
    dimension: uint64,
) -> bool:
    """Insert one residual row into the canonical padded row HNF in place.

    Basis is dimension-by-dimension; residual is a distinct one-row owner.
    This is the same unimodular pivot sequence as the copying helper. The
    caller provides the incoming row in residual. No snapshots or full-matrix
    comparisons are needed: exact nonmembership already proves a change.
    Failure leaves private state unusable; no caller may publish it.
    """
    row: uint64 = 0
    column: uint64 = 0
    pivot_row: uint64 = 0
    column = 0
    while column < dimension:
        a = basis[pivot_row, column]
        b = residual[0, column]
        if a != 0 or b != 0:
            if a == 0:
                # A new earlier pivot displaces the old row into the residual.
                j: uint64 = column
                while j < dimension:
                    old = basis[pivot_row, j]
                    basis[pivot_row, j] = residual[0, j]
                    residual[0, j] = old
                    j += 1
            elif b != 0:
                if b % a == 0:
                    quotient = b // a
                    j: uint64 = column
                    while j < dimension:
                        residual[0, j] = residual[0, j] - quotient * basis[pivot_row, j]
                        j += 1
                else:
                    # Bezout pair: determinant of [[s,t],[-b/g,a/g]] is one.
                    old_r = a
                    r = b
                    old_s = 1
                    s = 0
                    old_t = 0
                    t = 1
                    while r != 0:
                        quotient = old_r // r
                        next_r = old_r - quotient * r
                        old_r = r
                        r = next_r
                        next_s = old_s - quotient * s
                        old_s = s
                        s = next_s
                        next_t = old_t - quotient * t
                        old_t = t
                        t = next_t
                    if old_r < 0:
                        old_r = -old_r
                        old_s = -old_s
                        old_t = -old_t
                    left = -(b // old_r)
                    right = a // old_r
                    j: uint64 = column
                    while j < dimension:
                        old = basis[pivot_row, j]
                        extra = residual[0, j]
                        basis[pivot_row, j] = old_s * old + old_t * extra
                        residual[0, j] = left * old + right * extra
                        j += 1
            pivot = basis[pivot_row, column]
            if pivot < 0:
                j: uint64 = column
                while j < dimension:
                    basis[pivot_row, j] = -basis[pivot_row, j]
                    j += 1
                pivot = -pivot
            if pivot == 0:
                return False
            row = 0
            while row < pivot_row:
                quotient = basis[row, column] // pivot
                if quotient != 0:
                    j: uint64 = column
                    while j < dimension:
                        basis[row, j] = basis[row, j] - quotient * basis[pivot_row, j]
                        j += 1
                row += 1
            pivot_row += 1
        column += 1
    return True
