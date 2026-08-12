"""Source-transparent predicates and support scans for exact dense matrices.

The three families below deliberately expose identical semantics over the
canonical Sage.js representations: generated FLINT resources for `ZZ` and
`QQ`, and row-major `UInt64Buffer` storage for small `GF(p)`. Variable-length
answers are written to caller-owned index buffers whose maximum capacities are
known from the matrix shape, so no host callback or guessed exact-number
capacity is involved.
"""

from __future__ import annotations

from sagejs.ffi.flint import (
    FmpqMatrix,
    FmpzMatrix,
    fmpq_matrix_charpoly,
    fmpq_matrix_entry_denominator,
    fmpq_matrix_entry_is_zero,
    fmpq_matrix_entry_numerator,
    fmpq_matrix_ncols,
    fmpq_matrix_nrows,
    fmpq_polynomial_coefficient_numerator,
    fmpz_matrix_charpoly,
    fmpz_matrix_entry,
    fmpz_matrix_ncols,
    fmpz_matrix_nrows,
    fmpz_polynomial_coefficient,
)
from sagejs.native import Int64Buffer, PrimeFieldModulus, UInt64Buffer, native, uint64


# Dense integer matrix resources


@native
def dense_integer_matrix_is_diagonal(source: FmpzMatrix) -> bool:
    rows = fmpz_matrix_nrows(source)
    columns = fmpz_matrix_ncols(source)
    if rows != columns:
        return False
    for row in range(rows):
        for column in range(columns):
            if row != column and fmpz_matrix_entry(source, row, column) != 0:
                return False
    return True


@native
def dense_integer_matrix_is_symmetric(source: FmpzMatrix) -> bool:
    rows = fmpz_matrix_nrows(source)
    if rows != fmpz_matrix_ncols(source):
        return False
    for row in range(rows):
        for column in range(row):
            if fmpz_matrix_entry(source, row, column) != fmpz_matrix_entry(
                source, column, row
            ):
                return False
    return True


@native
def dense_integer_matrix_is_triangular(
    source: FmpzMatrix,
    upper: bool,
) -> bool:
    rows = fmpz_matrix_nrows(source)
    columns = fmpz_matrix_ncols(source)
    if rows != columns:
        return False
    if upper:
        for row in range(rows):
            for column in range(columns):
                if column < row and fmpz_matrix_entry(source, row, column) != 0:
                    return False
    else:
        for row in range(rows):
            for column in range(columns):
                if column > row and fmpz_matrix_entry(source, row, column) != 0:
                    return False
    return True


@native
def dense_integer_matrix_is_scalar(
    source: FmpzMatrix,
    scalar: int,
    infer_scalar: bool,
) -> bool:
    rows = fmpz_matrix_nrows(source)
    columns = fmpz_matrix_ncols(source)
    if rows != columns:
        return False
    expected = scalar
    if infer_scalar and rows != 0:
        for index in range(rows):
            if index == 0:
                expected = fmpz_matrix_entry(source, index, index)
    for row in range(rows):
        for column in range(columns):
            value = fmpz_matrix_entry(source, row, column)
            if row == column:
                if value != expected:
                    return False
            elif value != 0:
                return False
    return True


@native
def dense_integer_matrix_nonzero_positions(
    output_rows: Int64Buffer,
    output_columns: Int64Buffer,
    source: FmpzMatrix,
    column_order: bool,
) -> int:
    """Write nonzero `(row, column)` positions and return their count."""
    rows = fmpz_matrix_nrows(source)
    columns = fmpz_matrix_ncols(source)
    capacity = rows * columns
    if len(output_rows) < capacity or len(output_columns) < capacity:
        return capacity + 1
    count = 0
    if column_order:
        for column in range(columns):
            for row in range(rows):
                if fmpz_matrix_entry(source, row, column) != 0:
                    output_rows[count] = row
                    output_columns[count] = column
                    count += 1
    else:
        for row in range(rows):
            for column in range(columns):
                if fmpz_matrix_entry(source, row, column) != 0:
                    output_rows[count] = row
                    output_columns[count] = column
                    count += 1
    return count


@native
def dense_integer_echelon_nonpivots(
    output: Int64Buffer,
    source: FmpzMatrix,
) -> int:
    """Write the complement of pivot columns for an echelon matrix."""
    rows = fmpz_matrix_nrows(source)
    columns = fmpz_matrix_ncols(source)
    if len(output) < columns:
        return columns + 1
    count = 0
    for column in range(columns):
        output[column] = column
    for row in range(rows):
        pivot = columns
        for column in range(columns):
            if pivot == columns and fmpz_matrix_entry(source, row, column) != 0:
                pivot = column
        if pivot != columns:
            output[pivot] = -1
    for column in range(columns):
        if output[column] >= 0:
            output[count] = output[column]
            count += 1
    return count


@native
def dense_integer_matrix_is_nilpotent(source: FmpzMatrix) -> bool:
    rows = fmpz_matrix_nrows(source)
    if rows != fmpz_matrix_ncols(source):
        return False
    polynomial = fmpz_matrix_charpoly(source)
    for index in range(rows):
        if fmpz_polynomial_coefficient(polynomial, index) != 0:
            return False
    return True


# Dense rational matrix resources


@native
def dense_rational_matrix_is_diagonal(source: FmpqMatrix) -> bool:
    rows = fmpq_matrix_nrows(source)
    columns = fmpq_matrix_ncols(source)
    if rows != columns:
        return False
    for row in range(rows):
        for column in range(columns):
            if row != column and not fmpq_matrix_entry_is_zero(source, row, column):
                return False
    return True


@native
def dense_rational_matrix_is_symmetric(source: FmpqMatrix) -> bool:
    rows = fmpq_matrix_nrows(source)
    if rows != fmpq_matrix_ncols(source):
        return False
    for row in range(rows):
        for column in range(row):
            if fmpq_matrix_entry_numerator(
                source, row, column
            ) != fmpq_matrix_entry_numerator(source, column, row):
                return False
            if fmpq_matrix_entry_denominator(
                source, row, column
            ) != fmpq_matrix_entry_denominator(source, column, row):
                return False
    return True


@native
def dense_rational_matrix_is_triangular(
    source: FmpqMatrix,
    upper: bool,
) -> bool:
    rows = fmpq_matrix_nrows(source)
    columns = fmpq_matrix_ncols(source)
    if rows != columns:
        return False
    if upper:
        for row in range(rows):
            for column in range(columns):
                if column < row and not fmpq_matrix_entry_is_zero(source, row, column):
                    return False
    else:
        for row in range(rows):
            for column in range(columns):
                if column > row and not fmpq_matrix_entry_is_zero(source, row, column):
                    return False
    return True


@native
def dense_rational_matrix_is_scalar(
    source: FmpqMatrix,
    scalar_numerator: int,
    scalar_denominator: int,
    infer_scalar: bool,
) -> bool:
    rows = fmpq_matrix_nrows(source)
    columns = fmpq_matrix_ncols(source)
    if rows != columns:
        return False
    expected_numerator = scalar_numerator
    expected_denominator = scalar_denominator
    if infer_scalar and rows != 0:
        for index in range(rows):
            if index == 0:
                expected_numerator = fmpq_matrix_entry_numerator(source, index, index)
                expected_denominator = fmpq_matrix_entry_denominator(
                    source, index, index
                )
    for row in range(rows):
        for column in range(columns):
            if row == column:
                if (
                    fmpq_matrix_entry_numerator(source, row, column)
                    != expected_numerator
                ):
                    return False
                if (
                    fmpq_matrix_entry_denominator(source, row, column)
                    != expected_denominator
                ):
                    return False
            elif not fmpq_matrix_entry_is_zero(source, row, column):
                return False
    return True


@native
def dense_rational_matrix_nonzero_positions(
    output_rows: Int64Buffer,
    output_columns: Int64Buffer,
    source: FmpqMatrix,
    column_order: bool,
) -> int:
    """Write nonzero `(row, column)` positions and return their count."""
    rows = fmpq_matrix_nrows(source)
    columns = fmpq_matrix_ncols(source)
    capacity = rows * columns
    if len(output_rows) < capacity or len(output_columns) < capacity:
        return capacity + 1
    count = 0
    if column_order:
        for column in range(columns):
            for row in range(rows):
                if not fmpq_matrix_entry_is_zero(source, row, column):
                    output_rows[count] = row
                    output_columns[count] = column
                    count += 1
    else:
        for row in range(rows):
            for column in range(columns):
                if not fmpq_matrix_entry_is_zero(source, row, column):
                    output_rows[count] = row
                    output_columns[count] = column
                    count += 1
    return count


@native
def dense_rational_echelon_nonpivots(
    output: Int64Buffer,
    source: FmpqMatrix,
) -> int:
    """Write the complement of pivot columns for an echelon matrix."""
    rows = fmpq_matrix_nrows(source)
    columns = fmpq_matrix_ncols(source)
    if len(output) < columns:
        return columns + 1
    count = 0
    for column in range(columns):
        output[column] = column
    for row in range(rows):
        pivot = columns
        for column in range(columns):
            if pivot == columns and not fmpq_matrix_entry_is_zero(source, row, column):
                pivot = column
        if pivot != columns:
            output[pivot] = -1
    for column in range(columns):
        if output[column] >= 0:
            output[count] = output[column]
            count += 1
    return count


@native
def dense_rational_matrix_is_nilpotent(source: FmpqMatrix) -> bool:
    rows = fmpq_matrix_nrows(source)
    if rows != fmpq_matrix_ncols(source):
        return False
    polynomial = fmpq_matrix_charpoly(source)
    for index in range(rows):
        if fmpq_polynomial_coefficient_numerator(polynomial, index) != 0:
            return False
    return True


# Packed dense matrices over small prime fields


@native
def dense_prime_field_matrix_is_diagonal(
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    if rows != columns or len(source) != rows * columns:
        return False
    for row in range(rows):
        for column in range(columns):
            if row != column and source[row * columns + column] != 0:
                return False
    return True


@native
def dense_prime_field_matrix_is_symmetric(
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    if rows != columns or len(source) != rows * columns:
        return False
    for row in range(rows):
        for column in range(row):
            if source[row * columns + column] != source[column * columns + row]:
                return False
    return True


@native
def dense_prime_field_matrix_is_upper_triangular(
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    if rows != columns or len(source) != rows * columns:
        return False
    for row in range(1, rows):
        for column in range(row):
            if source[row * columns + column] != 0:
                return False
    return True


@native
def dense_prime_field_matrix_is_lower_triangular(
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    if rows != columns or len(source) != rows * columns:
        return False
    for row in range(rows):
        for column in range(row + 1, columns):
            if source[row * columns + column] != 0:
                return False
    return True


@native
def dense_prime_field_matrix_is_scalar(
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
    scalar: uint64,
) -> bool:
    if rows != columns or len(source) != rows * columns:
        return False
    expected = scalar
    for row in range(rows):
        for column in range(columns):
            value = source[row * columns + column]
            if row == column:
                if value != expected:
                    return False
            elif value != 0:
                return False
    return True


@native
def dense_prime_field_matrix_is_scalar_inferred(
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    if rows != columns or len(source) != rows * columns:
        return False
    expected = 0
    if rows != 0:
        expected = source[0]
    for row in range(rows):
        for column in range(columns):
            value = source[row * columns + column]
            if row == column:
                if value != expected:
                    return False
            elif value != 0:
                return False
    return True


@native
def dense_prime_field_matrix_nonzero_positions_row_order(
    output_rows: UInt64Buffer,
    output_columns: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    """Write nonzero `(row, column)` positions and return their count."""
    capacity = rows * columns
    if len(source) != capacity:
        raise ValueError("dense prime matrix shape mismatch")
    if len(output_rows) < capacity or len(output_columns) < capacity:
        raise ValueError("nonzero-position output is too small")
    count = 0
    for row in range(rows):
        for column in range(columns):
            if source[row * columns + column] != 0:
                output_rows[count] = row
                output_columns[count] = column
                count += 1
    return count


@native
def dense_prime_field_matrix_nonzero_positions_column_order(
    output_rows: UInt64Buffer,
    output_columns: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    """Write column-major nonzero positions and return their count."""
    capacity = rows * columns
    if len(source) != capacity:
        raise ValueError("dense prime matrix shape mismatch")
    if len(output_rows) < capacity or len(output_columns) < capacity:
        raise ValueError("nonzero-position output is too small")
    count = 0
    for column in range(columns):
        for row in range(rows):
            if source[row * columns + column] != 0:
                output_rows[count] = row
                output_columns[count] = column
                count += 1
    return count


@native
def dense_prime_field_echelon_nonpivots(
    output: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    """Write the complement of pivot columns for an echelon matrix."""
    if len(source) != rows * columns:
        raise ValueError("dense prime matrix shape mismatch")
    if len(output) < columns:
        raise ValueError("nonpivot output is too small")
    count = 0
    search_start = 0
    for row in range(rows):
        pivot = columns
        for column in range(search_start, columns):
            if pivot == columns and source[row * columns + column] != 0:
                pivot = column
        if pivot != columns:
            for column in range(search_start, pivot):
                output[count] = column
                count += 1
            search_start = pivot + 1
    for column in range(search_start, columns):
        output[count] = column
        count += 1
    return count


@native
def dense_prime_field_characteristic_is_nilpotent(
    coefficients: UInt64Buffer,
    size: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Return whether monic characteristic coefficients equal `x^size`.

    Prime-field characteristic-polynomial construction already has a mature
    declared FLINT kernel. Keeping that allocation boundary separate lets this
    scan remain source-transparent in the prime-field backend.
    """
    if len(coefficients) != size + 1:
        raise ValueError("characteristic-polynomial output has the wrong length")
    for index in range(size):
        if coefficients[index] != 0:
            return False
    return coefficients[size] == 1


__all__ = [
    "dense_integer_echelon_nonpivots",
    "dense_integer_matrix_is_diagonal",
    "dense_integer_matrix_is_nilpotent",
    "dense_integer_matrix_is_scalar",
    "dense_integer_matrix_is_symmetric",
    "dense_integer_matrix_is_triangular",
    "dense_integer_matrix_nonzero_positions",
    "dense_prime_field_echelon_nonpivots",
    "dense_prime_field_matrix_is_diagonal",
    "dense_prime_field_characteristic_is_nilpotent",
    "dense_prime_field_matrix_is_lower_triangular",
    "dense_prime_field_matrix_is_scalar",
    "dense_prime_field_matrix_is_scalar_inferred",
    "dense_prime_field_matrix_is_symmetric",
    "dense_prime_field_matrix_is_upper_triangular",
    "dense_prime_field_matrix_nonzero_positions_column_order",
    "dense_prime_field_matrix_nonzero_positions_row_order",
    "dense_rational_echelon_nonpivots",
    "dense_rational_matrix_is_diagonal",
    "dense_rational_matrix_is_nilpotent",
    "dense_rational_matrix_is_scalar",
    "dense_rational_matrix_is_symmetric",
    "dense_rational_matrix_is_triangular",
    "dense_rational_matrix_nonzero_positions",
]
