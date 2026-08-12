"""Storage-neutral plans for matrix selection and mutation.

This module fixes the public semantics before a matrix representation chooses
how to execute them.  Exact FLINT resources can consume the checked index
tuples with generated selectors or build a staged resource for `set_block`.
Packed prime matrices can lower the same plans to source-transparent kernels.
Neither path needs to materialize the source matrix as host scalar objects.

Selection plans preserve order and duplicates.  Negative indices are rejected,
matching Sage's row and column selection methods rather than scalar indexing.
Mutation plans own immutable snapshots of their inputs and coerce every value
before returning, so an integration layer can publish one transactional update
without aliasing its source or exposing a partially converted target.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, MutableSequence, Sequence
from typing import TypeAlias, TypeVar

_Value = TypeVar("_Value")
_Coerced = TypeVar("_Coerced")

SelectionPlan: TypeAlias = tuple[tuple[int, ...], tuple[int, ...]]
AffineUpdatePlan: TypeAlias = tuple[int, int, tuple[_Coerced, ...]]
BlockUpdatePlan: TypeAlias = tuple[int, int, int, int, tuple[_Coerced, ...]]
RowInsertionPlan: TypeAlias = tuple[int, tuple[_Coerced, ...]]
SwapPlan: TypeAlias = tuple[int, int, int, int, int]


def _checked_dimension(value: int, name: str) -> int:
    if value < 0:
        raise ValueError(f"{name} must be nonnegative")
    return value


def _checked_axis_index(index: int, size: int, axis: str) -> int:
    if index < 0 or index >= size:
        raise IndexError(f"{axis} index out of range")
    return index


def row_indices(rows: Iterable[int], row_count: int) -> tuple[int, ...]:
    """Return one checked, immutable row-index snapshot.

    Order and duplicates are significant.  As in Sage's
    `matrix_from_rows`, negative indices are invalid.
    """

    _checked_dimension(row_count, "row count")
    selected = tuple(rows)
    for row in selected:
        _checked_axis_index(row, row_count, "row")
    return selected


def column_indices(columns: Iterable[int], column_count: int) -> tuple[int, ...]:
    """Return one checked, immutable column-index snapshot."""

    _checked_dimension(column_count, "column count")
    selected = tuple(columns)
    for column in selected:
        _checked_axis_index(column, column_count, "column")
    return selected


def selection_plan(
    row_count: int,
    column_count: int,
    rows: Iterable[int],
    columns: Iterable[int],
) -> SelectionPlan:
    """Plan arbitrary row-and-column selection.

    Sage validates columns before rows for combined selection.  Retaining that
    order makes ambiguous invalid calls report the same exception.
    """

    _checked_dimension(row_count, "row count")
    _checked_dimension(column_count, "column count")
    selected_rows = tuple(rows)
    selected_columns = tuple(columns)
    checked_columns = column_indices(selected_columns, column_count)
    checked_rows = row_indices(selected_rows, row_count)
    return checked_rows, checked_columns


def submatrix_plan(
    row_count: int,
    column_count: int,
    row: int = 0,
    column: int = 0,
    selected_row_count: int | None = None,
    selected_column_count: int | None = None,
) -> SelectionPlan:
    """Plan Sage's half-open rectangular `submatrix` selection.

    An omitted count extends to the corresponding edge.  Explicit negative
    counts produce an empty range, as Sage's generic implementation does;
    negative starting indices are rejected if the resulting range is nonempty.
    """

    _checked_dimension(row_count, "row count")
    _checked_dimension(column_count, "column count")
    if selected_row_count is None:
        selected_row_count = row_count - row
    if selected_column_count is None:
        selected_column_count = column_count - column
    rows = range(row, row + selected_row_count)
    columns = range(column, column + selected_column_count)
    return selection_plan(row_count, column_count, rows, columns)


def retained_indices(
    size: int,
    deleted: Iterable[int],
    axis: str,
    check: bool = True,
) -> tuple[int, ...]:
    """Return indices retained after Sage-compatible row/column deletion.

    Deletion is set-like: order and duplicates in `deleted` do not matter.  If
    `check` is false, out-of-range indices are ignored.
    """

    _checked_dimension(size, f"{axis} count")
    deleted_set = set(deleted)
    if check:
        invalid = sorted(index for index in deleted_set if index < 0 or index >= size)
        if invalid:
            raise IndexError(f"{invalid} contains invalid indices")
    return tuple(index for index in range(size) if index not in deleted_set)


def select_row_major(
    values: Sequence[_Value],
    row_count: int,
    column_count: int,
    plan: SelectionPlan,
) -> list[_Value]:
    """Execute a selection plan on reference row-major storage.

    This is the ordinary Python oracle and portable fallback.  Production
    resource and packed implementations should consume `plan` directly.
    """

    _checked_dimension(row_count, "row count")
    _checked_dimension(column_count, "column count")
    if len(values) != row_count * column_count:
        raise ValueError("source length does not match the matrix shape")
    rows, columns = selection_plan(row_count, column_count, plan[0], plan[1])
    answer: list[_Value] = []
    for row in rows:
        offset = row * column_count
        for column in columns:
            answer.append(values[offset + column])
    return answer


def _coerced_snapshot(
    values: Iterable[_Value],
    expected_length: int,
    coerce: Callable[[_Value], _Coerced],
) -> tuple[_Coerced, ...]:
    source = tuple(values)
    if len(source) != expected_length:
        raise ValueError(
            "list of new entries must be of length "
            f"{expected_length} (not {len(source)})"
        )
    return tuple(coerce(value) for value in source)


def prepare_row_update(
    row_count: int,
    column_count: int,
    row: int,
    values: Iterable[_Value],
    coerce: Callable[[_Value], _Coerced],
) -> AffineUpdatePlan[_Coerced]:
    """Stage one complete row before any target write.

    Length is checked before the row number, matching Sage.  The returned plan
    is `(start, stride, values)` with `stride == 1`.
    """

    _checked_dimension(row_count, "row count")
    _checked_dimension(column_count, "column count")
    staged = _coerced_snapshot(values, column_count, coerce)
    if row < 0 or row >= row_count:
        raise ValueError(
            f"row number must be between 0 and {row_count - 1} (inclusive), not {row}"
        )
    return row * column_count, 1, staged


def prepare_column_update(
    row_count: int,
    column_count: int,
    column: int,
    values: Iterable[_Value],
    coerce: Callable[[_Value], _Coerced],
) -> AffineUpdatePlan[_Coerced]:
    """Stage one complete column before any target write."""

    _checked_dimension(row_count, "row count")
    _checked_dimension(column_count, "column count")
    staged = _coerced_snapshot(values, row_count, coerce)
    if column < 0 or column >= column_count:
        raise ValueError(
            "column number must be between 0 and "
            f"{column_count - 1} (inclusive), not {column}"
        )
    return column, column_count, staged


def prepare_block_update(
    target_row_count: int,
    target_column_count: int,
    target_row: int,
    target_column: int,
    source_row_count: int,
    source_column_count: int,
    values: Iterable[_Value],
    coerce: Callable[[_Value], _Coerced],
) -> BlockUpdatePlan[_Coerced]:
    """Stage a row-major rectangular update.

    Empty blocks may start on the corresponding trailing edge.  The complete
    source is snapped and coerced before bounds are published to an executor.
    """

    _checked_dimension(target_row_count, "target row count")
    _checked_dimension(target_column_count, "target column count")
    _checked_dimension(source_row_count, "source row count")
    _checked_dimension(source_column_count, "source column count")
    staged = _coerced_snapshot(
        values,
        source_row_count * source_column_count,
        coerce,
    )
    if (
        target_row < 0
        or target_column < 0
        or target_row + source_row_count > target_row_count
        or target_column + source_column_count > target_column_count
    ):
        raise ValueError("matrix block does not fit inside the target")
    return (
        target_row,
        target_column,
        source_row_count,
        source_column_count,
        staged,
    )


def prepare_row_insertion(
    row_count: int,
    column_count: int,
    index: int,
    values: Iterable[_Value],
    coerce: Callable[[_Value], _Coerced],
) -> RowInsertionPlan[_Coerced]:
    """Stage a row inserted before `index`, allowing append at `row_count`."""

    _checked_dimension(row_count, "row count")
    _checked_dimension(column_count, "column count")
    if index < 0:
        raise ValueError("index must be nonnegative")
    if index > row_count:
        raise ValueError("index must be less than number of rows")
    return index, _coerced_snapshot(values, column_count, coerce)


def apply_affine_update(
    target: MutableSequence[_Coerced],
    expected_length: int,
    plan: AffineUpdatePlan[_Coerced],
) -> None:
    """Apply a validated row or column plan to reference storage."""

    if len(target) != expected_length:
        raise ValueError("target length does not match the matrix shape")
    start, stride, values = plan
    if stride <= 0:
        raise ValueError("update stride must be positive")
    if values and (start < 0 or start + (len(values) - 1) * stride >= len(target)):
        raise ValueError("update plan is outside the target")
    for index, value in enumerate(values):
        target[start + index * stride] = value


def apply_block_update(
    target: MutableSequence[_Coerced],
    target_row_count: int,
    target_column_count: int,
    plan: BlockUpdatePlan[_Coerced],
) -> None:
    """Apply a validated block plan to reference row-major storage."""

    if len(target) != target_row_count * target_column_count:
        raise ValueError("target length does not match the matrix shape")
    target_row, target_column, source_rows, source_columns, values = plan
    if (
        target_row < 0
        or target_column < 0
        or target_row + source_rows > target_row_count
        or target_column + source_columns > target_column_count
        or len(values) != source_rows * source_columns
    ):
        raise ValueError("invalid block update plan")
    for row in range(source_rows):
        source_offset = row * source_columns
        target_offset = (target_row + row) * target_column_count + target_column
        for column in range(source_columns):
            target[target_offset + column] = values[source_offset + column]


def insert_row_major(
    source: Sequence[_Coerced],
    row_count: int,
    column_count: int,
    plan: RowInsertionPlan[_Coerced],
) -> list[_Coerced]:
    """Execute a staged row insertion on reference row-major storage."""

    _checked_dimension(row_count, "row count")
    _checked_dimension(column_count, "column count")
    if len(source) != row_count * column_count:
        raise ValueError("source length does not match the matrix shape")
    index, values = plan
    if index < 0 or index > row_count or len(values) != column_count:
        raise ValueError("invalid row insertion plan")
    offset = index * column_count
    return [*source[:offset], *values, *source[offset:]]


def prepare_row_swap(
    row_count: int,
    column_count: int,
    first: int,
    second: int,
) -> SwapPlan:
    """Return an affine plan for swapping two rows."""

    _checked_dimension(row_count, "row count")
    _checked_dimension(column_count, "column count")
    first = _checked_axis_index(first, row_count, "matrix row")
    second = _checked_axis_index(second, row_count, "matrix row")
    return (
        row_count * column_count,
        first * column_count,
        second * column_count,
        1,
        column_count,
    )


def prepare_column_swap(
    row_count: int,
    column_count: int,
    first: int,
    second: int,
) -> SwapPlan:
    """Return an affine plan for swapping two columns."""

    _checked_dimension(row_count, "row count")
    _checked_dimension(column_count, "column count")
    first = _checked_axis_index(first, column_count, "matrix column")
    second = _checked_axis_index(second, column_count, "matrix column")
    return row_count * column_count, first, second, column_count, row_count


def apply_swap(target: MutableSequence[_Value], plan: SwapPlan) -> None:
    """Apply a swap plan from snapshots, including when both axes coincide."""

    expected_length, first, second, stride, count = plan
    if len(target) != expected_length:
        raise ValueError("target length does not match the matrix shape")
    if stride <= 0:
        raise ValueError("swap stride must be positive")
    if count:
        final_first = first + (count - 1) * stride
        final_second = second + (count - 1) * stride
        if (
            first < 0
            or second < 0
            or final_first >= len(target)
            or final_second >= len(target)
        ):
            raise ValueError("swap plan is outside the target")
    left = tuple(target[first + index * stride] for index in range(count))
    right = tuple(target[second + index * stride] for index in range(count))
    for index in range(count):
        target[first + index * stride] = right[index]
        target[second + index * stride] = left[index]


__all__ = [
    "AffineUpdatePlan",
    "BlockUpdatePlan",
    "RowInsertionPlan",
    "SelectionPlan",
    "SwapPlan",
    "apply_affine_update",
    "apply_block_update",
    "apply_swap",
    "column_indices",
    "insert_row_major",
    "prepare_block_update",
    "prepare_column_swap",
    "prepare_column_update",
    "prepare_row_swap",
    "prepare_row_insertion",
    "prepare_row_update",
    "retained_indices",
    "row_indices",
    "select_row_major",
    "selection_plan",
    "submatrix_plan",
]
