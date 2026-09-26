"""Exact rectangular Smith proof for the live row-23 relation matrix.

This is a transformation-tracking integer Smith reduction.  Its only
mathematical input is the caller-owned 40-by-31 relation matrix; in
particular, it does not consume the terminal class number, invariant factors,
or a frozen PARI answer.  Matrices and the operation transcript are row-major.

The implementation is deliberately ordinary CPython-parseable Python.  This
boundary runs once after relation collection, rather than in a hot loop.
"""

from __future__ import annotations

import hashlib
from typing import Any


SCHEMA = "sagejs.pari-class-group/row23-raw-smith-presentation-v1"
ROWS = 40
COLUMNS = 31


class Row23RawSmithFailure(ValueError):
    """The raw row-23 Smith reduction or its input validation failed."""


def _extended_gcd(left: int, right: int) -> tuple[int, int, int]:
    old_r, current_r = abs(left), abs(right)
    old_s, current_s = 1, 0
    old_t, current_t = 0, 1
    while current_r:
        quotient = old_r // current_r
        old_r, current_r = current_r, old_r - quotient * current_r
        old_s, current_s = current_s, old_s - quotient * current_s
        old_t, current_t = current_t, old_t - quotient * current_t
    s = old_s if left >= 0 else -old_s
    t = old_t if right >= 0 else -old_t
    if old_r <= 0 or s * left + t * right != old_r:
        raise Row23RawSmithFailure("invalid extended-gcd state")
    return old_r, s, t


def _integers(value: Any) -> list[int]:
    if not isinstance(value, list) or len(value) != ROWS * COLUMNS:
        raise Row23RawSmithFailure("relation matrix has the wrong shape")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row23RawSmithFailure("relation matrix is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row23RawSmithFailure("relation matrix is not canonical")
        result.append(integer)
    return result


def _flatten(matrix: list[list[int]]) -> list[str]:
    return [str(value) for row in matrix for value in row]


def _digest(values: list[int]) -> str:
    return hashlib.sha256("\n".join(map(str, values)).encode()).hexdigest()


def build_row23_raw_smith_presentation(relations: Any) -> dict[str, Any]:
    """Return `U,W,V,D` and primitive operations with `U*W*V == D`.

    Every recorded primitive has determinant plus or minus one.  A separate
    verifier can therefore establish unimodularity without trusting a large
    determinant computation or this routine's internal matrix identities.
    """
    flat = _integers(relations)
    original = [flat[row * COLUMNS : (row + 1) * COLUMNS] for row in range(ROWS)]
    matrix = [row[:] for row in original]
    left = [[int(row == column) for column in range(ROWS)] for row in range(ROWS)]
    right = [
        [int(row == column) for column in range(COLUMNS)] for row in range(COLUMNS)
    ]
    operations: list[list[str | int]] = []

    def swap_rows(first: int, second: int) -> None:
        operations.append(["row_swap", first, second])
        matrix[first], matrix[second] = matrix[second], matrix[first]
        left[first], left[second] = left[second], left[first]

    def swap_columns(first: int, second: int) -> None:
        operations.append(["column_swap", first, second])
        for owner in (matrix, right):
            for row in owner:
                row[first], row[second] = row[second], row[first]

    def combine_rows(pivot: int, other: int) -> None:
        a, b = matrix[pivot][pivot], matrix[other][pivot]
        divisor, s, t = _extended_gcd(a, b)
        a_over = a // divisor
        b_over = b // divisor
        operations.append(
            ["row_pair", pivot, other, str(s), str(t), str(b_over), str(a_over)]
        )
        pivot_matrix, other_matrix = matrix[pivot][:], matrix[other][:]
        pivot_left, other_left = left[pivot][:], left[other][:]
        matrix[pivot] = [
            s * first + t * second
            for first, second in zip(pivot_matrix, other_matrix, strict=True)
        ]
        matrix[other] = [
            -b_over * first + a_over * second
            for first, second in zip(pivot_matrix, other_matrix, strict=True)
        ]
        left[pivot] = [
            s * first + t * second
            for first, second in zip(pivot_left, other_left, strict=True)
        ]
        left[other] = [
            -b_over * first + a_over * second
            for first, second in zip(pivot_left, other_left, strict=True)
        ]

    def combine_columns(pivot: int, other: int) -> None:
        a, b = matrix[pivot][pivot], matrix[pivot][other]
        divisor, s, t = _extended_gcd(a, b)
        a_over = a // divisor
        b_over = b // divisor
        operations.append(
            [
                "column_pair",
                pivot,
                other,
                str(s),
                str(t),
                str(b_over),
                str(a_over),
            ]
        )
        pivot_matrix = [row[pivot] for row in matrix]
        other_matrix = [row[other] for row in matrix]
        pivot_right = [row[pivot] for row in right]
        other_right = [row[other] for row in right]
        for row in range(ROWS):
            matrix[row][pivot] = s * pivot_matrix[row] + t * other_matrix[row]
            matrix[row][other] = (
                -b_over * pivot_matrix[row] + a_over * other_matrix[row]
            )
        for row in range(COLUMNS):
            right[row][pivot] = s * pivot_right[row] + t * other_right[row]
            right[row][other] = -b_over * pivot_right[row] + a_over * other_right[row]

    for pivot in range(COLUMNS):
        position = next(
            (
                (row, column)
                for row in range(pivot, ROWS)
                for column in range(pivot, COLUMNS)
                if matrix[row][column]
            ),
            None,
        )
        if position is None:
            break
        swap_rows(pivot, position[0])
        swap_columns(pivot, position[1])
        while True:
            for row in range(pivot + 1, ROWS):
                if matrix[row][pivot]:
                    combine_rows(pivot, row)
            for column in range(pivot + 1, COLUMNS):
                if matrix[pivot][column]:
                    combine_columns(pivot, column)
            if any(matrix[row][pivot] for row in range(pivot + 1, ROWS)) or any(
                matrix[pivot][column] for column in range(pivot + 1, COLUMNS)
            ):
                continue
            diagonal = matrix[pivot][pivot]
            offending = next(
                (
                    (row, column)
                    for row in range(pivot + 1, ROWS)
                    for column in range(pivot + 1, COLUMNS)
                    if matrix[row][column] % diagonal
                ),
                None,
            )
            if offending is None:
                break
            row, _ = offending
            operations.append(["row_add", pivot, row])
            matrix[pivot] = [
                first + second
                for first, second in zip(matrix[pivot], matrix[row], strict=True)
            ]
            left[pivot] = [
                first + second
                for first, second in zip(left[pivot], left[row], strict=True)
            ]
        if matrix[pivot][pivot] < 0:
            operations.append(["row_negate", pivot])
            matrix[pivot] = [-value for value in matrix[pivot]]
            left[pivot] = [-value for value in left[pivot]]

    diagonal = [matrix[index][index] for index in range(COLUMNS)]
    if any(value <= 0 for value in diagonal) or any(
        diagonal[index + 1] % diagonal[index] for index in range(COLUMNS - 1)
    ):
        raise Row23RawSmithFailure("Smith diagonal is not normalized")
    if any(
        matrix[row][column] != (diagonal[row] if row == column else 0)
        for row in range(ROWS)
        for column in range(COLUMNS)
    ):
        raise Row23RawSmithFailure("Smith reduction did not diagonalize")

    return {
        "schema": SCHEMA,
        "dimensions": {"rows": str(ROWS), "columns": str(COLUMNS)},
        "inputSha256": _digest(flat),
        "U": _flatten(left),
        "W": list(map(str, flat)),
        "V": _flatten(right),
        "D": _flatten(matrix),
        "diagonal": list(map(str, diagonal)),
        "operations": operations,
        "provenance": {
            "answerInputs": False,
            "algorithm": "transformation-tracking-rectangular-smith",
            "input": "same-run-retained-hnf-original-owner",
            "layout": "row-major",
        },
    }
