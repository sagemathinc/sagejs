"""Resident declared-resource witness for the exact native arena."""

from typing import Tuple

from sagejs.ffi.flint import (
    fmpz_matrix,
    fmpz_matrix_det,
    fmpz_matrix_entry,
    fmpz_matrix_hnf,
    fmpz_matrix_set_entry,
)
from sagejs.native import NativeExactArena, native


@native
def resident_flint_hnf(
    memory_limit: uint64,
    temporary_limit: uint64,
) -> Tuple[int, int, int, int, int]:
    """Construct and reduce one matrix without crossing a packed boundary."""
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        source = arena.foreign_resource(fmpz_matrix, 2, 2)
        first = fmpz_matrix_set_entry(source, 0, 0, 2)
        second = fmpz_matrix_set_entry(source, 0, 1, 4)
        third = fmpz_matrix_set_entry(source, 1, 0, 6)
        fourth = fmpz_matrix_set_entry(source, 1, 1, 8)
        hermite = arena.foreign_resource(fmpz_matrix_hnf, source)
        determinant = fmpz_matrix_det(hermite)
        return (
            fmpz_matrix_entry(hermite, 0, 0),
            fmpz_matrix_entry(hermite, 0, 1),
            fmpz_matrix_entry(hermite, 1, 0),
            fmpz_matrix_entry(hermite, 1, 1),
            determinant,
        )
