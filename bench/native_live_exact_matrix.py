"""Neutral live exact-matrix witnesses for Native Kernel v28."""

from sagejs.native import NativeIntegerMatrix, NativeIntegerVector, native, uint64


@native
def live_matrix_addmul(
    rows: uint64,
    columns: uint64,
    memory_limit: uint64,
    row: uint64,
    column: uint64,
    seed: int,
    left: int,
    right: int,
    repetitions: uint64,
) -> int:
    """Accumulate one shaped exact entry without flattening in source."""
    with NativeIntegerMatrix(rows, columns, memory_limit) as values:
        values[row, column] = seed
        for _iteration in range(repetitions):
            values.addmul(row, column, left, right)
        return values[row, column]


@native
def live_matrix_operations(
    memory_limit: uint64,
    left: int,
    right: int,
) -> tuple[int, int, uint64]:
    """Exercise exact set/get, submul, row swap, and row-count operations."""
    with NativeIntegerMatrix(2, 3, memory_limit) as values:
        values[0, 0] = left
        values[1, 2] = right
        values.submul(0, 0, right, left)
        values.swap_rows(0, 1)
        return values[0, 2], values[1, 0], len(values)


@native
def live_matrix_index(memory_limit: uint64, row: int, column: int) -> int:
    """Expose shared checked rectangular indexing for differential tests."""
    with NativeIntegerMatrix(2, 3, memory_limit) as values:
        return values[row, column]


@native
def live_matrix_and_vector(
    matrix_memory_limit: uint64,
    vector_memory_limit: uint64,
    left: int,
    right: int,
) -> tuple[int, int]:
    """Keep two independently bounded exact owners live in one region."""
    with NativeIntegerMatrix(2, 2, matrix_memory_limit) as matrix:
        matrix[1, 0] = left
        with NativeIntegerVector(2, vector_memory_limit) as vector:
            vector[1] = right
            matrix.addmul(1, 0, vector[1], right)
            vector.addmul(1, matrix[1, 0], left)
            return matrix[1, 0], vector[1]
