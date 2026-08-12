"""Combinatorial invariants of exact matrices.

The algorithms in this module deliberately depend only on the public matrix
contract: dimensions, entry access, exact ring arithmetic, matrix selection,
and determinant. They are therefore correct dynamic fallbacks for every exact
matrix representation.

Both exported operations have exponential output or running time in the worst
case. Their `max_work` parameter makes that cost visible. The default protects
interactive sessions from accidental explosions; a caller that deliberately
wants an unbounded calculation can pass `max_work=None`.
"""

from __future__ import annotations

from typing import Any


# A work unit is one elementary position in the algorithm's combinatorial
# state space. This is intentionally a deterministic structural budget rather
# than a host-dependent wall-clock estimate.
DEFAULT_COMBINATORIAL_WORK_LIMIT = 1_000_000


def _index(value: Any) -> int:
    """Return an exact integer index without a standard-library dependency."""
    if isinstance(value, int):
        return int(value)
    try:
        method = value.__index__
    except AttributeError:
        raise TypeError(
            "'" + type(value).__name__ + "' object cannot be interpreted as an integer"
        )
    answer = method()
    if not isinstance(answer, int):
        raise TypeError("__index__ returned non-int")
    return int(answer)


def _index_combinations(length: int, size: int) -> Any:
    """Yield lexicographic index combinations without importing `itertools`."""
    if size < 0 or size > length:
        return
    indices = list(range(size))
    yield tuple(indices)
    while True:
        for offset in range(size - 1, -1, -1):
            if indices[offset] != offset + length - size:
                break
        else:
            return
        indices[offset] += 1
        for following in range(offset + 1, size):
            indices[following] = indices[following - 1] + 1
        yield tuple(indices)


def _binomial(n: int, k: int) -> int:
    """Return `n` choose `k` for nonnegative integers."""
    if k < 0 or k > n:
        return 0
    k = min(k, n - k)
    value = 1
    for step in range(1, k + 1):
        value = value * (n - k + step) // step
    return value


def _work_limit(value: int | None) -> int | None:
    """Validate and normalize a public combinatorial work limit."""
    if value is None:
        return None
    limit = _index(value)
    if limit < 0:
        raise ValueError("max_work must be nonnegative or None")
    return limit


def _require_work(operation: str, required: int, maximum: int | None) -> None:
    """Reject a calculation whose deterministic work estimate is too large."""
    limit = _work_limit(maximum)
    if limit is not None and required > limit:
        raise ValueError(
            operation
            + " requires "
            + str(required)
            + " combinatorial work units, exceeding max_work="
            + str(limit)
            + "; pass max_work=None to run without a limit"
        )


def minors_work(rows: int, columns: int, k: int) -> int:
    """Return the deterministic work estimate used by `matrix_minors`.

    The estimate counts each selected submatrix with the state-space cost of
    the division-free subset determinant used below. This stable upper-level
    policy exposes both the combinatorial output count and the exponential
    cost of larger determinants.
    """
    row_count = _index(rows)
    column_count = _index(columns)
    size = _index(k)
    if row_count < 0 or column_count < 0:
        raise ValueError("matrix dimensions must be nonnegative")
    if size < 0:
        raise ValueError("minor size must be nonnegative")
    if size == 0 or size > min(row_count, column_count):
        return 0
    determinant_weight = size * size * (1 << (size - 1))
    return (
        _binomial(row_count, size) * _binomial(column_count, size) * determinant_weight
    )


def _selected_determinant(
    entries: list[Any],
    source_columns: int,
    selected_rows: tuple[int, ...],
    selected_columns: tuple[int, ...],
    zero: Any,
    one: Any,
) -> Any:
    """Compute one determinant by a division-free subset recurrence."""
    size = len(selected_rows)
    full_mask = (1 << size) - 1
    states = [zero for _state in range(full_mask + 1)]
    states[0] = one

    # `cardinalities[mask]` selects exactly the states that have assigned the
    # preceding rows. Adding a column appends one value to the corresponding
    # permutation; the new inversions are the previously selected columns to
    # its right.
    cardinalities = [0 for _state in range(full_mask + 1)]
    for mask in range(1, full_mask + 1):
        cardinalities[mask] = cardinalities[mask >> 1] + (mask & 1)

    for row_offset in range(size):
        source_row = selected_rows[row_offset]
        for mask in range(full_mask + 1):
            if cardinalities[mask] != row_offset:
                continue
            value = states[mask]
            for column_offset in range(size):
                bit = 1 << column_offset
                if mask & bit != 0:
                    continue
                inversions = 0
                for later_column in range(column_offset + 1, size):
                    if mask & (1 << later_column) != 0:
                        inversions += 1
                term = (
                    value
                    * entries[
                        source_row * source_columns + selected_columns[column_offset]
                    ]
                )
                if inversions % 2:
                    term = -term
                destination = mask | bit
                states[destination] = states[destination] + term
    return states[full_mask]


def matrix_minors(
    source: Any,
    k: int,
    max_work: int | None = DEFAULT_COMBINATORIAL_WORK_LIMIT,
) -> list[Any]:
    """Return all `k` by `k` minors in lexicographic row-major order.

    The order and edge cases agree with Sage: the unique zero-dimensional
    minor is the base-ring one, and a size exceeding either dimension has no
    minors. Negative or non-indexable sizes are rejected.

    The matrix is bulk-read once through its public row-major `list()` view,
    then every determinant is evaluated by division-free exact ring
    arithmetic. The implementation never assumes packed, host, or
    foreign-library storage.
    """
    size = _index(k)
    if size < 0:
        raise ValueError("minor size must be nonnegative")
    rows = source.nrows()
    columns = source.ncols()
    if size == 0:
        return [source.base_ring()(1)]
    if size > min(rows, columns):
        return []
    _require_work("matrix minors", minors_work(rows, columns, size), max_work)

    entries = source.list()
    if size == 1:
        return entries

    answer = []
    base = source.base_ring()
    zero = base(0)
    one = base(1)
    for selected_rows in _index_combinations(rows, size):
        for selected_columns in _index_combinations(columns, size):
            answer.append(
                _selected_determinant(
                    entries,
                    columns,
                    selected_rows,
                    selected_columns,
                    zero,
                    one,
                )
            )
    return answer


def permanent_work(rows: int, columns: int) -> int:
    """Return the subset-DP work estimate used by `matrix_permanent`."""
    row_count = _index(rows)
    column_count = _index(columns)
    if row_count < 0 or column_count < 0:
        raise ValueError("matrix dimensions must be nonnegative")
    if row_count == 0 or row_count > column_count:
        return 0
    return column_count * row_count * (1 << (row_count - 1))


def matrix_permanent(
    source: Any,
    algorithm: str = "Ryser",
    max_work: int | None = DEFAULT_COMBINATORIAL_WORK_LIMIT,
) -> Any:
    """Return the permanent of an exact `m` by `n` matrix with `m <= n`.

    The implementation is a column-by-column subset dynamic program. Its
    `n * m * 2^(m-1)` work bound is especially useful for the wide rectangular
    matrices where enumerating all injections or all column subsets is much
    worse. Arithmetic stays in the matrix base ring throughout.

    `algorithm="Ryser"` is accepted for compatibility with Sage's public
    default even though this implementation uses the equivalent subset-DP
    recurrence. No sparse Butera-Pernici implementation is currently exposed.
    """
    if algorithm != "Ryser":
        raise ValueError('algorithm must be "Ryser"')
    rows = source.nrows()
    columns = source.ncols()
    if rows == 0:
        return source.base_ring()(1)
    if rows > columns:
        raise ValueError(
            "must have m <= n, but m (=" + str(rows) + ") and n (=" + str(columns) + ")"
        )
    _require_work("matrix permanent", permanent_work(rows, columns), max_work)

    base = source.base_ring()
    zero = base(0)
    entries = source.list()
    full_mask = (1 << rows) - 1
    states = [zero for _state in range(full_mask + 1)]
    states[0] = base(1)

    # Descending masks make this an in-place update: every destination is
    # numerically larger than its source and has already been visited for the
    # current column. Thus a column can be used at most once.
    for column in range(columns):
        for mask in range(full_mask - 1, -1, -1):
            value = states[mask]
            for row in range(rows):
                bit = 1 << row
                if mask & bit == 0:
                    destination = mask | bit
                    states[destination] = (
                        states[destination] + value * entries[row * columns + column]
                    )
    return states[full_mask]
