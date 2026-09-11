"""Owned matrix helper lifetime witness for the closed exact backend."""

from sagejs.ffi.flint import (
    FmpzMatrix,
    fmpz_gcd,
    fmpz_matrix,
    fmpz_matrix_ncols,
    fmpz_matrix_nrows,
    fmpz_matrix_right_kernel,
)
from sagejs.native import IntegerBuffer, NativeExactArena, native, uint64


def squared_kernel_length(matrix: FmpzMatrix) -> int:
    """Read a borrowed helper-owned matrix without transferring ownership."""
    if fmpz_matrix_nrows(matrix) != 1 or fmpz_matrix_ncols(matrix) != 3:
        return -100
    return matrix[0, 0] * matrix[0, 0] + matrix[0, 1] * matrix[0, 1]


def matrix_helper(value: int, mode: uint64, rows: uint64) -> int:
    """Return a scalar only; all owned matrices must die at this return."""
    source = fmpz_matrix(rows, 3)
    alias = source
    if mode == 1:
        return 17
    alias[0, 0] = 6 * value
    alias[0, 1] = 10 * value
    alias[1, 2] = fmpz_gcd(6 * value, 10 * value)
    kernel = fmpz_matrix_right_kernel(source)
    if mode == 2:
        return kernel[100, 0]
    if mode == 3:
        raise ZeroDivisionError
    if value == 0:
        return -7
    length = squared_kernel_length(kernel)
    return length + fmpz_gcd(6 * value, 10 * value)


@native
def owned_helper_witness(
    output: IntegerBuffer,
    value: int,
    mode: uint64,
    rows: uint64,
    repeats: uint64,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        retained = arena.integer_vector(1, 0)
        retained[0] = value
        total = 0
        index: uint64 = 0
        while index < repeats:
            total += matrix_helper(value, mode, rows)
            index += 1
        if retained[0] != value:
            raise ZeroDivisionError
        output[0] = total
        return total
