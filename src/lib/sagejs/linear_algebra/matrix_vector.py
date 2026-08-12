"""Storage-neutral contracts for dense matrix-vector products.

The public `Matrix` and `Vector` classes own parent coercion, physical storage,
and result construction.  This module fixes the small semantic core between
those responsibilities.  In particular, a public implementation follows four
phases:

1. find Sage's common base ring and coerce both operands;
2. prepare one complete matrix storage value and one complete vector storage
   value for that ring;
3. invoke one bulk backend operation; and
4. construct a fresh mutable vector of `plan.result_length` over the common
   base ring.

The bulk operation receives explicit dimensions and returns complete vector
storage.  It must not expose a matrix entry through a host callback, construct
a one-row or one-column public matrix merely to use matrix multiplication, or
cross the host boundary once per scalar.  The storage values may be packed
buffers, generated FLINT/M4RI resources, portable host arrays, or future
representations; this module neither inspects nor owns them.

`matrix_times_vector_entries` and `vector_times_matrix_entries` are ordinary
Python fallbacks over already materialized scalar sequences.  They are the
differential oracle for storage backends, not a claim that host scalar
arithmetic is the production implementation for a large dense matrix.
"""

from __future__ import annotations

import typing as _typing
from collections.abc import Callable, Sequence
from typing import Any, Literal

if _typing.TYPE_CHECKING:
    ProductSide = Literal["right", "left"]
    BulkProduct = Callable[[Any, Any, int, int], Any]
else:
    # Static aliases need no runtime subscription in the standalone baselib.
    ProductSide = str
    BulkProduct = object


class MatrixVectorProductPlan:
    """Validated dimensions for one oriented matrix-vector product.

    `right` represents `matrix * vector` and requires a vector of length
    `columns`.  `left` represents `vector * matrix` and requires a vector of
    length `rows`.  Explicit dimensions preserve the distinct empty shapes
    `0 x n` and `m x 0`.
    """

    def __init__(
        self,
        rows: int,
        columns: int,
        vector_length: int,
        side: ProductSide,
    ) -> None:
        if rows < 0 or columns < 0:
            raise ValueError("matrix dimensions must be nonnegative")
        if vector_length < 0:
            raise ValueError("vector dimension must be nonnegative")
        if side not in ("right", "left"):
            raise ValueError("matrix-vector side must be 'right' or 'left'")

        expected = columns if side == "right" else rows
        if vector_length != expected:
            raise TypeError("matrix and vector dimensions are incompatible")

        self.rows = rows
        self.columns = columns
        self.vector_length = vector_length
        self.side = side
        self.result_length = rows if side == "right" else columns


def prepare_matrix_vector_product(
    rows: int,
    columns: int,
    vector_length: int,
    side: ProductSide,
) -> MatrixVectorProductPlan:
    """Return a validated product plan before any storage boundary is crossed."""
    return MatrixVectorProductPlan(rows, columns, vector_length, side)


def execute_bulk_matrix_vector_product(
    plan: MatrixVectorProductPlan,
    matrix_storage: Any,
    vector_storage: Any,
    operation: BulkProduct,
) -> Any:
    """Invoke exactly one complete storage backend operation.

    The operation receives `(matrix_storage, vector_storage, rows, columns)`
    and returns complete result-vector storage.  Ownership, transactional
    failure, and target capabilities belong to the declared storage adapter.
    Public integration constructs a fresh mutable vector only after this call
    succeeds.
    """
    return operation(
        matrix_storage,
        vector_storage,
        plan.rows,
        plan.columns,
    )


def _validate_entry_storage(
    matrix_entries: Sequence[Any],
    plan: MatrixVectorProductPlan,
) -> None:
    if len(matrix_entries) != plan.rows * plan.columns:
        raise ValueError("matrix entry count does not match its dimensions")


def matrix_times_vector_entries(
    matrix_entries: Sequence[Any],
    rows: int,
    columns: int,
    vector_entries: Sequence[Any],
    zero: Any,
) -> list[Any]:
    """Return row-major `matrix * vector` entries.

    Both sequences must already contain elements of the common result parent.
    The inputs are never mutated and the output is always a new list.
    """
    plan = prepare_matrix_vector_product(
        rows,
        columns,
        len(vector_entries),
        "right",
    )
    _validate_entry_storage(matrix_entries, plan)

    output: list[Any] = []
    for row in range(rows):
        total = zero
        offset = row * columns
        for column in range(columns):
            total = total + matrix_entries[offset + column] * vector_entries[column]
        output.append(total)
    return output


def vector_times_matrix_entries(
    vector_entries: Sequence[Any],
    matrix_entries: Sequence[Any],
    rows: int,
    columns: int,
    zero: Any,
) -> list[Any]:
    """Return row-major `vector * matrix` entries.

    Traversal follows the matrix's row-major order, accumulating all output
    columns without first transposing the matrix.
    """
    plan = prepare_matrix_vector_product(
        rows,
        columns,
        len(vector_entries),
        "left",
    )
    _validate_entry_storage(matrix_entries, plan)

    output = [zero for _ in range(columns)]
    for row in range(rows):
        factor = vector_entries[row]
        offset = row * columns
        for column in range(columns):
            output[column] = output[column] + factor * matrix_entries[offset + column]
    return output
