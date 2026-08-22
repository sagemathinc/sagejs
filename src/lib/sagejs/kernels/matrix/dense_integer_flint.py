"""Declared-FLINT algorithms for dense integer matrices.

The packed functions operate on explicit `IntegerBuffer` interchange storage.
The resource functions borrow an owned `FmpzMatrix` and lower entry access
directly into the isolated native core, so their loops never call the host.
"""

from __future__ import annotations

from typing import Tuple

from sagejs.ffi.flint import (
    FmpzMatrix,
    fmpz_mat_charpoly,
    fmpz_mat_det,
    fmpz_mat_hnf,
    fmpz_mat_hnf_modular_eldiv,
    fmpz_mat_hnf_transform,
    fmpz_mat_lll_transform,
    fmpz_mat_mul,
    fmpz_mat_rank,
    fmpz_mat_right_kernel,
    fmpz_mat_snf_transform,
    fmpz_matrix_entry,
    fmpz_matrix_ncols,
    fmpz_matrix_nrows,
    fmpz_matrix_set_entry,
)
from sagejs.native import IntegerBuffer, native, uint64


@native
def flint_dense_integer_matrix_mul(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
) -> bool:
    return fmpz_mat_mul(
        output,
        left,
        right,
        left_rows,
        inner,
        right_columns,
    )


@native
def flint_dense_integer_matrix_determinant(
    output: IntegerBuffer,
    source: IntegerBuffer,
    size: uint64,
    one: uint64,
) -> bool:
    return fmpz_mat_det(output, source, size, one)


@native
def flint_dense_integer_matrix_charpoly(
    output: IntegerBuffer,
    source: IntegerBuffer,
    output_length: uint64,
    size: uint64,
    one: uint64,
) -> bool:
    return fmpz_mat_charpoly(output, source, output_length, size, one)


@native
def flint_dense_integer_matrix_rank(
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> uint64:
    return fmpz_mat_rank(source, rows, columns)


@native
def flint_dense_integer_matrix_hnf(
    output: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    return fmpz_mat_hnf(output, source, rows, columns)


@native
def flint_dense_integer_matrix_hnf_modular_eldiv(
    output: IntegerBuffer,
    source: IntegerBuffer,
    elementary_divisor: IntegerBuffer,
    rows: uint64,
    columns: uint64,
    one: uint64,
) -> bool:
    """Use FLINT modular HNF with a proved elementary-divisor multiple."""
    return fmpz_mat_hnf_modular_eldiv(
        output,
        source,
        rows,
        columns,
        elementary_divisor,
        one,
    )


@native
def flint_dense_integer_matrix_hnf_transform(
    output: IntegerBuffer,
    transform: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    return fmpz_mat_hnf_transform(
        output,
        transform,
        source,
        rows,
        columns,
    )


@native
def flint_dense_integer_matrix_lll_transform(
    output: IntegerBuffer,
    transform: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    return fmpz_mat_lll_transform(
        output,
        transform,
        source,
        rows,
        columns,
    )


@native
def flint_dense_integer_matrix_snf_transform(
    output: IntegerBuffer,
    left_transform: IntegerBuffer,
    right_transform: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    return fmpz_mat_snf_transform(
        output,
        left_transform,
        right_transform,
        source,
        rows,
        columns,
    )


@native
def flint_dense_integer_matrix_right_kernel(
    output: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> uint64:
    return fmpz_mat_right_kernel(output, source, rows, columns)


@native
def flint_dense_integer_resource_import(
    target: FmpzMatrix,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    """Populate a borrowed resource from packed exact integer storage."""
    valid = fmpz_matrix_nrows(target) == rows
    if fmpz_matrix_ncols(target) != columns:
        valid = False
    if len(source) != rows * columns:
        valid = False
    if valid:
        for row in range(rows):
            for column in range(columns):
                updated = fmpz_matrix_set_entry(
                    target,
                    row,
                    column,
                    source[row * columns + column],
                )
                if not updated:
                    valid = False
    return valid


@native
def flint_dense_integer_resource_set_diagonal(
    target: FmpzMatrix,
    diagonal: IntegerBuffer,
    size: uint64,
) -> bool:
    """Set one square integer resource from a packed diagonal."""
    valid = fmpz_matrix_nrows(target) == size
    if fmpz_matrix_ncols(target) != size:
        valid = False
    if len(diagonal) != size:
        valid = False
    if valid:
        for index in range(size):
            if not fmpz_matrix_set_entry(target, index, index, diagonal[index]):
                return False
    return valid


@native
def flint_dense_integer_resource_random_fill(
    target: FmpzMatrix,
    lower: int,
    span: uint64,
    initial_state: uint64,
    word_base: uint64,
    multiplier: uint64,
    increment: uint64,
) -> Tuple[bool, uint64]:
    """Fill a borrowed resource from a finite range using rejection sampling.

    The result is `(valid, final_state)`. Invalid generator parameters leave
    `target` unchanged. A checked status is used because native kernels do not
    yet support raising `ValueError` directly.
    """
    if word_base == 0 or span == 0 or span > word_base:
        return False, initial_state
    if initial_state >= word_base:
        return False, initial_state

    rows: uint64 = fmpz_matrix_nrows(target)
    columns: uint64 = fmpz_matrix_ncols(target)
    limit: uint64 = word_base - word_base % span
    state: uint64 = initial_state
    for row in range(rows):
        for column in range(columns):
            while state >= limit:
                state = (multiplier * state + increment) % word_base
            updated = fmpz_matrix_set_entry(
                target,
                row,
                column,
                lower + state % span,
            )
            if not updated:
                return False, state
            if column + 1 < columns or row + 1 < rows:
                state = (multiplier * state + increment) % word_base
    return True, state


@native
def flint_dense_integer_resource_random_fill_default(
    target: FmpzMatrix,
    initial_state: uint64,
    word_base: uint64,
    zero_cutoff: uint64,
    sign_cutoff: uint64,
    multiplier: uint64,
    increment: uint64,
) -> Tuple[bool, uint64]:
    """Fill a borrowed resource with Sage.js's zero-heavy distribution."""
    if word_base == 0 or initial_state >= word_base:
        return False, initial_state
    if zero_cutoff > word_base or sign_cutoff > word_base:
        return False, initial_state

    rows: uint64 = fmpz_matrix_nrows(target)
    columns: uint64 = fmpz_matrix_ncols(target)
    state: uint64 = initial_state
    for row in range(rows):
        for column in range(columns):
            first: uint64 = state
            state = (multiplier * state + increment) % word_base
            if first < zero_cutoff:
                updated = fmpz_matrix_set_entry(target, row, column, 0)
            else:
                tail: uint64 = state
                state = (multiplier * state + increment) % word_base
                while tail == 0:
                    tail = state
                    state = (multiplier * state + increment) % word_base
                magnitude: uint64 = word_base // tail
                if state >= sign_cutoff:
                    updated = fmpz_matrix_set_entry(
                        target,
                        row,
                        column,
                        -magnitude,
                    )
                else:
                    updated = fmpz_matrix_set_entry(
                        target,
                        row,
                        column,
                        magnitude,
                    )
                state = (multiplier * state + increment) % word_base
            if not updated:
                return False, state
    return True, state


@native
def flint_dense_integer_matrix_space_random_fill(
    target: FmpzMatrix,
    lower: int,
    span: uint64,
    initial_state: uint64,
    word_base: uint64,
    multiplier: uint64,
    increment: uint64,
) -> Tuple[bool, uint64]:
    """Fill a resource with `MatrixSpace.random_element` semantics.

    `initial_state` is the random word already consumed by the first density
    test. Full density still consumes that test for every entry in the current
    public contract, so the kernel deliberately skips one LCG word before each
    sampled value and preserves the exact shared random stream.
    """
    if word_base == 0 or span == 0 or span > word_base:
        return False, initial_state
    if initial_state >= word_base:
        return False, initial_state

    rows: uint64 = fmpz_matrix_nrows(target)
    columns: uint64 = fmpz_matrix_ncols(target)
    limit: uint64 = word_base - word_base % span
    state: uint64 = initial_state
    for row in range(rows):
        for column in range(columns):
            state = (multiplier * state + increment) % word_base
            while state >= limit:
                state = (multiplier * state + increment) % word_base
            if not fmpz_matrix_set_entry(
                target,
                row,
                column,
                lower + state % span,
            ):
                return False, state
            if column + 1 < columns or row + 1 < rows:
                state = (multiplier * state + increment) % word_base
    return True, state


@native
def flint_dense_integer_resource_nonzero_count(source: FmpzMatrix) -> int:
    """Safely borrow and traverse every exact entry without host callbacks."""
    rows: uint64 = fmpz_matrix_nrows(source)
    columns: uint64 = fmpz_matrix_ncols(source)
    count = 0
    for row in range(rows):
        for column in range(columns):
            if fmpz_matrix_entry(source, row, column) != 0:
                count = count + 1
    return count


__all__ = [
    "flint_dense_integer_matrix_charpoly",
    "flint_dense_integer_matrix_determinant",
    "flint_dense_integer_matrix_hnf",
    "flint_dense_integer_matrix_hnf_transform",
    "flint_dense_integer_matrix_mul",
    "flint_dense_integer_matrix_rank",
    "flint_dense_integer_matrix_right_kernel",
    "flint_dense_integer_matrix_snf_transform",
    "flint_dense_integer_resource_import",
    "flint_dense_integer_resource_set_diagonal",
    "flint_dense_integer_resource_nonzero_count",
    "flint_dense_integer_matrix_space_random_fill",
    "flint_dense_integer_resource_random_fill",
    "flint_dense_integer_resource_random_fill_default",
]
