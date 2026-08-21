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

from sagejs.native import (
    integer_buffer_values,
    is_compiled,
    kernel_integer_buffer,
    kernel_integer_zeros,
    kernel_uint64_zeros,
)

# A work unit is one elementary position in the algorithm's combinatorial
# state space. This is intentionally a deterministic structural budget rather
# than a host-dependent wall-clock estimate.
DEFAULT_COMBINATORIAL_WORK_LIMIT = 1_000_000

# Packing wins well below the representative permanent/minor workloads while
# keeping tiny interactive matrices on the allocation-free readable path.
_PACKED_COMBINATORIAL_MIN_WORK = 256
_NO_ACCELERATION = object()


def _kernel_module() -> Any:
    """Load the production kernels only after a heavy operation is selected."""
    return __import__(
        "sagejs.kernels.matrix.combinatorial",
        fromlist=["combinatorial"],
    )


def _has_storage(source: Any, predicate: str) -> bool:
    method = getattr(source, predicate, None)
    return bool(method()) if callable(method) else False


def _kernel_route(kernel: Any) -> tuple[str, str, int]:
    if getattr(kernel, "executionTarget", None) == "wasm":
        return "wasm-compiled-source", "normal-heavy-case", 1
    if is_compiled(kernel) and bool(getattr(kernel, "nativeAvailable", False)):
        return "native-compiled-source", "normal-heavy-case", 1
    return "portable-computation", "compiled-source-unavailable", 0


def _record_acceleration(
    source: Any,
    operation: str,
    kernel: Any | None,
    reason: str,
    copied_values: int,
) -> None:
    if kernel is None:
        route, crossings = "portable-computation", 0
    else:
        route, selected_reason, crossings = _kernel_route(kernel)
        if reason == "normal-heavy-case":
            reason = selected_reason
    source._last_combinatorial_acceleration = {
        "operation": operation,
        "route": route,
        "reason": reason,
        "boundaryCrossings": crossings,
        "copiedValues": copied_values,
        "rows": source.nrows(),
        "columns": source.ncols(),
    }


def _word_capacity(values: Any, factor: int) -> int:
    maximum = 1
    for value in values:
        words = max(1, (abs(int(value)).bit_length() + 63) // 64)
        maximum = max(maximum, words)
    return max(8, maximum * max(1, factor) + 4)


def _capacity_error(error: Exception) -> bool:
    return "IntegerBuffer word capacity exceeded" in str(error)


def _retry_integer_output(
    kernel: Any,
    length: int,
    initial_capacity: int,
    invoke: Any,
) -> Any:
    capacity = initial_capacity
    while capacity <= 4096:
        output = kernel_integer_zeros(kernel, length, capacity)
        try:
            if not invoke(output, capacity):
                raise ValueError("packed combinatorial kernel rejected its storage")
            return output
        except Exception as error:
            if not _capacity_error(error):
                raise
        capacity *= 2
    raise OverflowError("packed combinatorial result requires excessive limb capacity")


def _retry_rational_output(
    kernel: Any,
    length: int,
    initial_capacity: int,
    invoke: Any,
) -> tuple[Any, Any]:
    capacity = initial_capacity
    while capacity <= 4096:
        output_numerators = kernel_integer_zeros(kernel, length, capacity)
        output_denominators = kernel_integer_zeros(kernel, length, capacity)
        try:
            if not invoke(output_numerators, output_denominators, capacity):
                raise ValueError("packed combinatorial kernel rejected its storage")
            return output_numerators, output_denominators
        except Exception as error:
            if not _capacity_error(error):
                raise
        capacity *= 2
    raise OverflowError("packed rational combinatorial result requires excessive limbs")


def _index(value: Any) -> int:
    """Return an exact integer index without a standard-library dependency."""
    if isinstance(value, int):
        return int(value)
    try:
        method = value.__index__
    except AttributeError:
        raise TypeError(
            "'" + type(value).__name__ + "' object cannot be interpreted as an integer"
        ) from None
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


def _accelerated_minors(source: Any, size: int, required_work: int) -> Any:
    """Execute a supported packed heavy minor batch, or return the sentinel."""
    if required_work < _PACKED_COMBINATORIAL_MIN_WORK:
        _record_acceleration(source, "minors", None, "below-packed-threshold", 0)
        return _NO_ACCELERATION
    if size > 20:
        _record_acceleration(source, "minors", None, "packed-shape-limit", 0)
        return _NO_ACCELERATION

    kernels = _kernel_module()
    rows = source.nrows()
    columns = source.ncols()
    result_count = _binomial(rows, size) * _binomial(columns, size)
    state_count = 1 << size
    base = source.base_ring()

    try:
        if _has_storage(source, "_has_integer_storage"):
            kernel = kernels.packed_integer_matrix_minors
            values = [int(value) for value in source.list()]
            entries = kernel_integer_buffer(kernel, values)
            initial_capacity = _word_capacity(values, size)

            def invoke(output: Any, capacity: int) -> bool:
                states = kernel_integer_zeros(kernel, state_count, capacity)
                indices = kernel_uint64_zeros(kernel, 2 * size)
                return bool(
                    kernel(
                        output,
                        entries,
                        states,
                        indices,
                        rows,
                        columns,
                        size,
                    )
                )

            output = _retry_integer_output(
                kernel,
                result_count,
                initial_capacity,
                invoke,
            )
            _record_acceleration(
                source,
                "minors",
                kernel,
                "normal-heavy-case",
                len(values) + result_count + state_count + 2 * size,
            )
            return [base(value) for value in integer_buffer_values(output)]

        if _has_storage(source, "_has_packed_rational_storage"):
            kernel = kernels.packed_rational_matrix_minors
            values = source.list()
            numerators = [int(value.numerator()) for value in values]
            denominators = [int(value.denominator()) for value in values]
            packed_numerators = kernel_integer_buffer(kernel, numerators)
            packed_denominators = kernel_integer_buffer(kernel, denominators)
            initial_capacity = max(
                _word_capacity(numerators, size),
                _word_capacity(denominators, size),
            )

            def invoke_rational(
                output_numerators: Any,
                output_denominators: Any,
                capacity: int,
            ) -> bool:
                state_numerators = kernel_integer_zeros(kernel, state_count, capacity)
                state_denominators = kernel_integer_zeros(kernel, state_count, capacity)
                indices = kernel_uint64_zeros(kernel, 2 * size)
                return bool(
                    kernel(
                        output_numerators,
                        output_denominators,
                        packed_numerators,
                        packed_denominators,
                        state_numerators,
                        state_denominators,
                        indices,
                        rows,
                        columns,
                        size,
                    )
                )

            output_numerators, output_denominators = _retry_rational_output(
                kernel,
                result_count,
                initial_capacity,
                invoke_rational,
            )
            numerator_values = integer_buffer_values(output_numerators)
            denominator_values = integer_buffer_values(output_denominators)
            _record_acceleration(
                source,
                "minors",
                kernel,
                "normal-heavy-case",
                2 * len(values) + 2 * result_count + 2 * state_count + 2 * size,
            )
            return [
                base(numerator_values[index]) / base(denominator_values[index])
                for index in range(result_count)
            ]

        if _has_storage(source, "_has_packed_prime_storage") or _has_storage(
            source, "_has_nmod_matrix_resource"
        ):
            kernel = kernels.packed_prime_matrix_minors
            entries = source._prime_kernel_buffer(kernel)
            output = kernel_uint64_zeros(kernel, result_count)
            states = kernel_uint64_zeros(kernel, state_count)
            indices = kernel_uint64_zeros(kernel, 2 * size)
            modulus = int(base.characteristic())
            if not kernel(
                output,
                entries,
                states,
                indices,
                rows,
                columns,
                size,
                modulus,
            ):
                raise ValueError("packed prime minor kernel rejected its storage")
            _record_acceleration(
                source,
                "minors",
                kernel,
                "normal-heavy-case",
                rows * columns + result_count + state_count + 2 * size,
            )
            return [base(int(output[index])) for index in range(result_count)]
    except Exception as error:
        if not _capacity_error(error) and "excessive limb" not in str(error):
            raise
        _record_acceleration(source, "minors", None, "limb-capacity-fallback", 0)
        return _NO_ACCELERATION

    _record_acceleration(source, "minors", None, "unsupported-exact-domain", 0)
    return _NO_ACCELERATION


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
    limit = _work_limit(max_work)
    size = _index(k)
    if size < 0:
        raise ValueError("minor size must be nonnegative")
    rows = source.nrows()
    columns = source.ncols()
    if size == 0:
        return [source.base_ring()(1)]
    if size > min(rows, columns):
        return []
    required_work = minors_work(rows, columns, size)
    _require_work("matrix minors", required_work, limit)

    accelerated = _accelerated_minors(source, size, required_work)
    if accelerated is not _NO_ACCELERATION:
        return accelerated

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


def _accelerated_permanent(source: Any, required_work: int) -> Any:
    """Execute a supported packed heavy permanent, or return the sentinel."""
    if required_work < _PACKED_COMBINATORIAL_MIN_WORK:
        _record_acceleration(source, "permanent", None, "below-packed-threshold", 0)
        return _NO_ACCELERATION
    rows = source.nrows()
    columns = source.ncols()
    if rows > 20:
        _record_acceleration(source, "permanent", None, "packed-shape-limit", 0)
        return _NO_ACCELERATION

    kernels = _kernel_module()
    state_count = 1 << rows
    base = source.base_ring()
    try:
        if _has_storage(source, "_has_integer_storage"):
            kernel = kernels.packed_integer_matrix_permanent
            values = [int(value) for value in source.list()]
            entries = kernel_integer_buffer(kernel, values)
            initial_capacity = _word_capacity(values, rows)

            def invoke(output: Any, capacity: int) -> bool:
                states = kernel_integer_zeros(kernel, state_count, capacity)
                return bool(kernel(output, entries, states, rows, columns))

            output = _retry_integer_output(kernel, 1, initial_capacity, invoke)
            _record_acceleration(
                source,
                "permanent",
                kernel,
                "normal-heavy-case",
                len(values) + state_count + 1,
            )
            return base(integer_buffer_values(output)[0])

        if _has_storage(source, "_has_packed_rational_storage"):
            kernel = kernels.packed_rational_matrix_permanent
            values = source.list()
            numerators = [int(value.numerator()) for value in values]
            denominators = [int(value.denominator()) for value in values]
            packed_numerators = kernel_integer_buffer(kernel, numerators)
            packed_denominators = kernel_integer_buffer(kernel, denominators)
            initial_capacity = max(
                _word_capacity(numerators, rows),
                _word_capacity(denominators, rows),
            )

            def invoke_rational(
                output_numerators: Any,
                output_denominators: Any,
                capacity: int,
            ) -> bool:
                state_numerators = kernel_integer_zeros(kernel, state_count, capacity)
                state_denominators = kernel_integer_zeros(kernel, state_count, capacity)
                return bool(
                    kernel(
                        output_numerators,
                        output_denominators,
                        packed_numerators,
                        packed_denominators,
                        state_numerators,
                        state_denominators,
                        rows,
                        columns,
                    )
                )

            output_numerators, output_denominators = _retry_rational_output(
                kernel,
                1,
                initial_capacity,
                invoke_rational,
            )
            numerator = integer_buffer_values(output_numerators)[0]
            denominator = integer_buffer_values(output_denominators)[0]
            _record_acceleration(
                source,
                "permanent",
                kernel,
                "normal-heavy-case",
                2 * len(values) + 2 * state_count + 2,
            )
            return base(numerator) / base(denominator)

        if _has_storage(source, "_has_packed_prime_storage") or _has_storage(
            source, "_has_nmod_matrix_resource"
        ):
            kernel = kernels.packed_prime_matrix_permanent
            entries = source._prime_kernel_buffer(kernel)
            output = kernel_uint64_zeros(kernel, 1)
            states = kernel_uint64_zeros(kernel, state_count)
            modulus = int(base.characteristic())
            if not kernel(output, entries, states, rows, columns, modulus):
                raise ValueError("packed prime permanent kernel rejected its storage")
            _record_acceleration(
                source,
                "permanent",
                kernel,
                "normal-heavy-case",
                rows * columns + state_count + 1,
            )
            return base(int(output[0]))
    except Exception as error:
        if not _capacity_error(error) and "excessive limb" not in str(error):
            raise
        _record_acceleration(source, "permanent", None, "limb-capacity-fallback", 0)
        return _NO_ACCELERATION

    _record_acceleration(source, "permanent", None, "unsupported-exact-domain", 0)
    return _NO_ACCELERATION


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
    limit = _work_limit(max_work)
    rows = source.nrows()
    columns = source.ncols()
    if rows == 0:
        return source.base_ring()(1)
    if algorithm != "Ryser":
        raise ValueError('algorithm must be "Ryser"')
    if rows > columns:
        raise ValueError(
            "must have m <= n, but m (=" + str(rows) + ") and n (=" + str(columns) + ")"
        )
    required_work = permanent_work(rows, columns)
    _require_work("matrix permanent", required_work, limit)

    accelerated = _accelerated_permanent(source, required_work)
    if accelerated is not _NO_ACCELERATION:
        return accelerated

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
