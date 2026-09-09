"""Native witness; the diagnostic predicate is prepended by the test."""

from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix
from sagejs.native import IntegerBuffer, NativeExactArena, native, uint64


@native
def torsion_prefix_witness(
    data: IntegerBuffer,
    output: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    if rows > 16 or columns > 16:
        return False
    with NativeExactArena(131072, 524288) as arena:
        # Match the unbounded vector arena used by the production call graph.
        scale_storage = arena.integer_vector(1, 0)
        scale_storage[0] = data[rows * columns + 2 * columns]
        dependencies = arena.foreign_resource(fmpz_matrix, rows + 1, columns + 1)
        logs = arena.foreign_resource(fmpz_matrix, columns + 1, 3)
        row: uint64 = 0
        while row < rows + 1:
            column: uint64 = 0
            while column < columns + 1:
                dependencies[row, column] = 991
                column += 1
            row += 1
        column = 0
        while column < columns + 1:
            logs[column, 0] = 991
            logs[column, 1] = -991
            logs[column, 2] = 991
            column += 1
        row = 0
        while row < rows:
            column = 0
            while column < columns:
                dependencies[row, column] = data[row * columns + column]
                column += 1
            row += 1
        column = 0
        while column < columns:
            logs[column, 0] = data[rows * columns + 2 * column]
            logs[column, 1] = data[rows * columns + 2 * column + 1]
            column += 1
        certified = _cubic_dependency_logs_certify_torsion(
            dependencies,
            logs,
            rows,
            columns,
            scale_storage[0],
        )
        output[0] = 0
        if certified:
            output[0] = 1
        return True
