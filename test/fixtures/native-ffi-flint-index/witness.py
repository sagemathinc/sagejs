"""Equivalent explicit-call and subscript witnesses for FLINT resources."""

from sagejs.ffi.flint import (
    FmpzMatrix,
    fmpz_matrix,
    fmpz_matrix_entry,
    fmpz_matrix_set_entry,
)
from sagejs.native import native


@native
def explicit_entry(value: Integer) -> Integer:
    matrix = fmpz_matrix(2, 2)
    fmpz_matrix_set_entry(matrix, 1, 0, value)
    return fmpz_matrix_entry(matrix, 1, 0)


@native
def indexed_entry(value: Integer) -> Integer:
    matrix = fmpz_matrix(2, 2)
    fmpz_matrix_set_entry(matrix, 1, 0, value)
    return matrix[1, 0]


@native
def explicit_assignment(value: Integer) -> Integer:
    matrix = fmpz_matrix(2, 2)
    fmpz_matrix_set_entry(matrix, 1, 0, value)
    return fmpz_matrix_entry(matrix, 1, 0)


@native
def indexed_assignment(value: Integer) -> Integer:
    matrix = fmpz_matrix(2, 2)
    matrix[1, 0] = value
    return fmpz_matrix_entry(matrix, 1, 0)


@native
def explicit_invalid_assignment(value: Integer) -> Integer:
    matrix = fmpz_matrix(1, 1)
    fmpz_matrix_set_entry(matrix, 1, 0, value)
    return 0


@native
def indexed_invalid_assignment(value: Integer) -> Integer:
    matrix = fmpz_matrix(1, 1)
    matrix[1, 0] = value
    return 0
