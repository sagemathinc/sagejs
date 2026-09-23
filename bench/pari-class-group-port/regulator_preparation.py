"""PARI 2.17.4 regulator-column preparation and custom pivot selection.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate buch2.c clean_cols and compute_multiple_of_R_pivot. This is only
the input stage of compute_multiple_of_R, not a regulator or rank result.
Scalars are (mantissa, precision bits, exponent); precision -1 means integer.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native


@native
def pari_validate_regulator_scalars(values: IntegerBuffer, count: int) -> int:
    if count < 0 or len(values) < 3 * count:
        raise ValueError("short regulator scalar input")
    for i in range(count):
        m = values[3 * i]
        p = values[3 * i + 1]
        e = values[3 * i + 2]
        if p == -1:
            if e != 0:
                raise ValueError("invalid exact regulator scalar")
        elif m == 0:
            if p != 0:
                raise ValueError("invalid regulator zero")
        elif p < 64 or p > 154112 or p % 64 != 0 or abs(m).bit_length() != p:
            raise ValueError("invalid regulator real")
    # Native signatures currently reject `-> None`; this ignored status keeps
    # validation source-transparent without changing the mathematics.
    return 0


@native
def pari_regulator_column_preparation(
    values: IntegerBuffer,
    rows: int,
    columns: int,
    degree: int,
    output: IntegerBuffer,
    selected: Int64Buffer,
    state: Int64Buffer,
) -> int:
    """Prepend exact T to clean_cols; report columns, precision flag and R1.

    Values are the real part Ar of the logarithm matrix, column-major.
    Selected contains zero for T, then one-based original column numbers.
    The rank-zero RU==1 early return is outside this entry. Owners are
    disjoint. Validation rejects before mutation; unused capacity is intact.
    """
    if rows < 2 or columns < 0 or degree < rows or degree > 2 * rows:
        raise ValueError("invalid regulator preparation signature")
    if (
        len(output) < 3 * rows * (columns + 1)
        or len(selected) < columns + 1
        or len(state) < 3
    ):
        raise ValueError("short regulator preparation workspace")
    pari_validate_regulator_scalars(values, rows * columns)
    r1 = 2 * rows - degree
    for i in range(rows):
        value = 2
        if i < r1:
            value = 1
        # Fixed slices currently target NativeIntegerVector, not IntegerBuffer.
        output[3 * i] = value
        output[3 * i + 1] = -1
        output[3 * i + 2] = 0
    selected[0] = 0
    kept = 1
    precision_problem = 0
    for j in range(columns):
        nonzero = False
        for i in range(rows):
            base = 3 * (j * rows + i)
            m = values[base]
            p = values[base + 1]
            exponent = values[base + 2]
            if p == -1:
                exponent = -(1 << 61)
                if m != 0:
                    exponent = abs(m).bit_length() - 1
            if exponent >= -2:
                if m == 0:
                    precision_problem = 1
                else:
                    nonzero = True
        if nonzero:
            for i in range(3 * rows):
                output[3 * kept * rows + i] = values[3 * j * rows + i]
            selected[kept] = j + 1
            kept += 1
    state[0] = kept
    state[1] = precision_problem
    state[2] = r1
    return kept


@native
def pari_regulator_pivot(
    values: IntegerBuffer,
    rows: int,
    columns: int,
    column: int,
    occupied: Int64Buffer,
) -> int:
    """Return one-based maximal-exponent pivot, or rows+1 if none above -32.

    Equal exponents keep the first row. This is the source callback, not
    Gaussian elimination: it must be called on the current reduced column.
    """
    if rows < 0 or columns < 1 or column < 1 or column > columns:
        raise ValueError("invalid regulator pivot dimensions")
    if len(occupied) < rows:
        raise ValueError("short regulator pivot occupancy")
    pari_validate_regulator_scalars(values, rows * columns)
    return pari_regulator_pivot_unchecked(values, rows, column, occupied)


@native
def pari_regulator_pivot_unchecked(
    values: IntegerBuffer, rows: int, column: int, occupied: Int64Buffer
) -> int:
    """Source callback on an already validated resident matrix."""
    best = 0
    best_exponent = -(1 << 61)
    for i in range(rows):
        base = 3 * ((column - 1) * rows + i)
        m = values[base]
        if occupied[i] == 0 and m != 0:
            exponent = values[base + 2]
            if values[base + 1] == -1:
                exponent = abs(m).bit_length() - 1
            if exponent > best_exponent:
                best = i + 1
                best_exponent = exponent
    if best == 0 or best_exponent <= -32:
        return rows + 1
    return best
