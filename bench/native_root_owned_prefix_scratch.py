"""Repeated exact closure attempts borrow fixed root-owned scratch matrices."""

from sagejs.ffi.flint import (
    FmpzMatrix,
    fmpz_matrix,
    fmpz_matrix_hnf_prefix_into,
    fmpz_matrix_hnf_transform_prefix,
    fmpz_matrix_lll_transform_prefix,
    fmpz_matrix_snf_prefix_into,
)
from sagejs.native import NativeExactArena, native, uint64


def _root_scratch_closure(
    source: FmpzMatrix,
    hermite: FmpzMatrix,
    smith: FmpzMatrix,
    transform: FmpzMatrix,
    dependencies: FmpzMatrix,
    reduced: FmpzMatrix,
    lll_transform: FmpzMatrix,
    rows: uint64,
) -> int:
    """Return rank insufficiency or an exactly checked finite lattice index.

    All owned matrices remain in the caller. Only their logical prefixes
    participate in reductions; stored rows outside the prefix are not input.
    This is a generic integer-lattice witness, not a class-group algorithm.
    """
    if rows == 1:
        raise ZeroDivisionError
    if not fmpz_matrix_hnf_prefix_into(hermite, source, rows, 3):
        return -1
    rank: uint64 = 0
    row: uint64 = 0
    while row < rows:
        if hermite[row, 0] != 0 or hermite[row, 1] != 0 or hermite[row, 2] != 0:
            rank += 1
        row += 1
    if rank < 3:
        return 0
    if not fmpz_matrix_snf_prefix_into(smith, source, rows, 3):
        return -2
    if not fmpz_matrix_hnf_transform_prefix(hermite, transform, source, rows, 3):
        return -3
    row = 0
    while row < rows:
        column: uint64 = 0
        while column < 3:
            value = 0
            inner: uint64 = 0
            while inner < rows:
                value += transform[row, inner] * source[inner, column]
                inner += 1
            if value != hermite[row, column]:
                return -4
            column += 1
        row += 1
    dependency_count: uint64 = rows - rank
    if dependency_count > 0:
        row = 0
        while row < dependency_count:
            column = 0
            while column < rows:
                dependencies[row, column] = transform[rank + row, column]
                column += 1
            row += 1
        if not fmpz_matrix_lll_transform_prefix(
            reduced, lll_transform, dependencies, dependency_count, rows
        ):
            return -5
        row = 0
        while row < dependency_count:
            column = 0
            while column < rows:
                value = 0
                inner = 0
                while inner < dependency_count:
                    value += lll_transform[row, inner] * dependencies[inner, column]
                    inner += 1
                if value != reduced[row, column]:
                    return -6
                column += 1
            column = 0
            while column < 3:
                value = 0
                inner = 0
                while inner < rows:
                    value += reduced[row, inner] * source[inner, column]
                    inner += 1
                if value != 0:
                    return -7
                column += 1
            row += 1
    if hermite[7, 4] != -733 or smith[7, 4] != -733:
        return -8
    if transform[7, 7] != -733 or reduced[7, 7] != -733:
        return -9
    return smith[0, 0] * smith[1, 1] * smith[2, 2]


@native
def root_owned_prefix_scratch(
    value: int,
    memory_limit: uint64,
    temporary_limit: uint64,
    repeats: uint64,
    fail_after_first: bool,
) -> int:
    """Retain one arena across insufficient, growing and shrinking prefixes."""
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        retained = arena.integer_vector(1, 0)
        source = arena.foreign_resource(fmpz_matrix, 8, 5)
        hermite = arena.foreign_resource(fmpz_matrix, 8, 5)
        smith = arena.foreign_resource(fmpz_matrix, 8, 5)
        transform = arena.foreign_resource(fmpz_matrix, 8, 8)
        dependencies = arena.foreign_resource(fmpz_matrix, 8, 8)
        reduced = arena.foreign_resource(fmpz_matrix, 8, 8)
        lll_transform = arena.foreign_resource(fmpz_matrix, 8, 8)
        retained[0] = value * value + 17
        source[0, 0] = 2
        source[0, 1] = 2 * value
        source[1, 1] = 3
        source[1, 2] = 3 * value
        source[2, 2] = 5
        row: uint64 = 3
        while row < 8:
            source[row, 0] = 2 * row
            source[row, 1] = 3 * row + 2 * row * value
            source[row, 2] = 5 * row + 3 * row * value
            row += 1
        hermite[7, 4] = -733
        smith[7, 4] = -733
        transform[7, 7] = -733
        reduced[7, 7] = -733
        repeat: uint64 = 0
        total = 0
        while repeat < repeats:
            if (
                _root_scratch_closure(
                    source,
                    hermite,
                    smith,
                    transform,
                    dependencies,
                    reduced,
                    lll_transform,
                    2,
                )
                != 0
            ):
                return -11
            if fail_after_first:
                return _root_scratch_closure(
                    source,
                    hermite,
                    smith,
                    transform,
                    dependencies,
                    reduced,
                    lll_transform,
                    1,
                )
            stage: uint64 = 0
            while stage < 3:
                rows: uint64 = 6
                if stage == 1:
                    rows = 4
                index = _root_scratch_closure(
                    source,
                    hermite,
                    smith,
                    transform,
                    dependencies,
                    reduced,
                    lll_transform,
                    rows,
                )
                # Every later row is an integer combination of the first
                # three; their determinant and row-lattice index are 30.
                if index != 30:
                    return -12
                if retained[0] != value * value + 17:
                    return -13
                if source[0, 1] != 2 * value:
                    return -14
                total += index
                stage += 1
            repeat += 1
        return retained[0] + total
