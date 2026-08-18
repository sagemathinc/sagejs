"""Packed exact-integer kernels for composite Buchmann--Lenstra steps.

The public wrappers in `buchmann_lenstra` retain their readable list-based
reference algorithms.  This module only moves measured dense integer loops
across the source-transparent native boundary.  CPython and a Sage.js runtime
without a matching artifact execute these same ordinary Python bodies.
"""

from __future__ import annotations

from sagejs.native import IntegerBuffer, native, uint64


@native
def packed_row_hnf_in_place(
    output: IntegerBuffer,
    source: IntegerBuffer,
    workspace: IntegerBuffer,
    row_count: uint64,
    column_count: uint64,
) -> bool:
    """Write the deterministic full-rank row HNF into `output`.

    `source` and `output` are row-major `row_count` by `column_count`
    matrices.  The first `column_count` output rows contain the answer.
    `workspace` contains two temporary rows.  A false result means that the
    source does not have full column rank; malformed packed shapes raise.
    """
    entry_count = row_count * column_count
    if len(source) != entry_count or len(output) != entry_count:
        return False
    if len(workspace) != 2 * column_count:
        return False
    if column_count == 0:
        return True
    if row_count < column_count:
        return False

    for index in range(entry_count):
        output[index] = source[index]

    pivot_row = 0
    for column in range(column_count):
        candidate = pivot_row
        while candidate < row_count and output[candidate * column_count + column] == 0:
            candidate += 1
        if candidate < row_count:
            if candidate != pivot_row:
                for index in range(column_count):
                    upper_index = pivot_row * column_count + index
                    lower_index = candidate * column_count + index
                    temporary = output[upper_index]
                    output[upper_index] = output[lower_index]
                    output[lower_index] = temporary

            for row in range(pivot_row + 1, row_count):
                lower_column = row * column_count + column
                if output[lower_column] != 0:
                    upper_column = pivot_row * column_count + column
                    old_remainder = output[upper_column]
                    remainder = output[lower_column]
                    old_left = 1
                    left = 0
                    old_right = 0
                    right = 1
                    while remainder != 0:
                        quotient = old_remainder // remainder
                        next_remainder = old_remainder - quotient * remainder
                        next_left = old_left - quotient * left
                        next_right = old_right - quotient * right
                        old_remainder = remainder
                        remainder = next_remainder
                        old_left = left
                        left = next_left
                        old_right = right
                        right = next_right
                    if old_remainder < 0:
                        common = -old_remainder
                        left_coefficient = -old_left
                        right_coefficient = -old_right
                    else:
                        common = old_remainder
                        left_coefficient = old_left
                        right_coefficient = old_right
                    if common == 0:
                        return False

                    upper_scale = output[upper_column] // common
                    lower_scale = output[lower_column] // common
                    for index in range(column_count):
                        workspace[index] = output[pivot_row * column_count + index]
                        workspace[column_count + index] = output[
                            row * column_count + index
                        ]
                    for index in range(column_count):
                        output[pivot_row * column_count + index] = (
                            left_coefficient * workspace[index]
                            + right_coefficient * workspace[column_count + index]
                        )
                        output[row * column_count + index] = (
                            -lower_scale * workspace[index]
                            + upper_scale * workspace[column_count + index]
                        )

            pivot_index = pivot_row * column_count + column
            if output[pivot_index] < 0:
                for index in range(column_count):
                    location = pivot_row * column_count + index
                    output[location] = -output[location]
            pivot = output[pivot_index]
            for row in range(pivot_row):
                row_column = row * column_count + column
                quotient = output[row_column] // pivot
                for index in range(column_count):
                    location = row * column_count + index
                    output[location] -= (
                        quotient * output[pivot_row * column_count + index]
                    )
            pivot_row += 1

    return pivot_row >= column_count


__all__ = ["packed_row_hnf_in_place"]
