"""Append-only compact sparse exact rows for Native Kernel v32."""

from sagejs.native import NativeExactArena, native, uint64


@native
def sparse_relation_summary(memory_limit: uint64, temporary_limit: uint64) -> int:
    """Append and retrieve an exact row-major relation fragment."""
    with NativeExactArena(memory_limit, temporary_limit) as workspace:
        rows = workspace.sparse_integer_rows(3, 5, 3, 64)
        rows.append(0, 1, 12)
        rows.append(0, 4, -7)
        rows.append(2, 0, 9)
        return (
            rows.get(0, 1, 5)
            + rows.get(0, 4, 5)
            + rows.get(1, 3, 5)
            + rows.row_length(0)
            + rows.row_length(1)
            + len(rows)
        )


@native
def sparse_relation_full(memory_limit: uint64, temporary_limit: uint64) -> int:
    """Reject a fourth entry instead of resizing the sparse owner."""
    with NativeExactArena(memory_limit, temporary_limit) as workspace:
        rows = workspace.sparse_integer_rows(3, 5, 3, 64)
        rows.append(0, 1, 12)
        rows.append(0, 4, -7)
        rows.append(2, 0, 9)
        rows.append(2, 3, 11)
        return len(rows)


@native
def sparse_relation_order(memory_limit: uint64, temporary_limit: uint64) -> int:
    """Reject duplicate or decreasing coordinates before mutation."""
    with NativeExactArena(memory_limit, temporary_limit) as workspace:
        rows = workspace.sparse_integer_rows(3, 5, 3, 64)
        rows.append(1, 2, 12)
        rows.append(1, 2, 13)
        return len(rows)


@native
def sparse_relation_index(
    memory_limit: uint64, temporary_limit: uint64, row: uint64
) -> int:
    """Exercise checked shaped row lookup."""
    with NativeExactArena(memory_limit, temporary_limit) as workspace:
        rows = workspace.sparse_integer_rows(3, 5, 3, 64)
        return rows.get(row, 0, 17)
