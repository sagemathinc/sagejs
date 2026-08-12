"""Source-transparent dense linear algebra over small prime fields.

The public ABI is deliberately independent of Node and FLINT: a compiler-owned
matrix value containing caller-owned row-major `UInt64Buffer` storage,
explicit dimensions, and an explicit prime. Every public function validates
the complete storage shape before indexing it. The same ordinary Python bodies
are the dynamic fallback and the input to the host-isolated native compiler.
"""

from __future__ import annotations

from sagejs.native import (
    NativeRecord,
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    prime_inverse,
    prime_mul,
    prime_sub,
    uint64,
)


class DensePrimeMatrix(NativeRecord):
    """Borrowed packed storage and shape for a matrix over `GF(modulus)`."""

    entries: UInt64Buffer
    rows: uint64
    columns: uint64
    modulus: PrimeFieldModulus


@native
def dense_prime_field_matrix_add(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    count = len(output)
    valid = 1
    if len(left) != count:
        valid = 0
    if len(right) != count:
        valid = 0
    if valid != 0:
        for index in range(count):
            output[index] = (left[index] + right[index]) % modulus
    return valid != 0


@native
def dense_prime_field_matrix_subtract(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    count = len(output)
    valid = 1
    if len(left) != count:
        valid = 0
    if len(right) != count:
        valid = 0
    if valid != 0:
        for index in range(count):
            output[index] = prime_sub(left[index], right[index], modulus)
    return valid != 0


@native
def dense_prime_field_matrix_negate(
    output: UInt64Buffer,
    source: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    count = len(output)
    valid = 1
    if len(source) != count:
        valid = 0
    if valid != 0:
        for index in range(count):
            value = source[index]
            if value == 0:
                output[index] = 0
            else:
                output[index] = modulus - value
    return valid != 0


@native
def dense_prime_field_matrix_scalar_multiply(
    output: UInt64Buffer,
    source: UInt64Buffer,
    scalar: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    count = len(output)
    valid = 1
    if len(source) != count:
        valid = 0
    if valid != 0:
        for index in range(count):
            output[index] = prime_mul(source[index], scalar, modulus)
    return valid != 0


@native
def dense_prime_field_matrix_transpose(
    output: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    count = rows * columns
    valid = 1
    if len(output) != count:
        valid = 0
    if len(source) != count:
        valid = 0
    if valid != 0:
        for row in range(rows):
            for column in range(columns):
                output[column * rows + row] = source[row * columns + column]
    return valid != 0


@native
def dense_prime_field_matrix_equal(
    left: UInt64Buffer,
    right: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    count = len(left)
    equal = 1
    if len(right) != count:
        equal = 0
    if equal != 0:
        for index in range(count):
            if left[index] != right[index]:
                equal = 0
    return equal != 0


@native
def dense_prime_field_matrix_is_zero(
    source: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    zero = 1
    for index in range(len(source)):
        if source[index] != 0:
            zero = 0
    return zero != 0


@native
def dense_prime_field_matrix_is_one(
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    one = 1
    if rows != columns:
        one = 0
    if len(source) != rows * columns:
        one = 0
    if one != 0:
        for row in range(rows):
            for column in range(columns):
                expected = 0
                if row == column:
                    expected = 1
                if source[row * columns + column] != expected:
                    one = 0
    return one != 0


@native
def dense_prime_field_matrix_nonzero_count(
    source: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> uint64:
    count = 0
    for index in range(len(source)):
        if source[index] != 0:
            count += 1
    return count


@native
def dense_prime_field_matrix_trace(
    source: UInt64Buffer,
    size: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    value = 0
    if len(source) == size * size:
        for index in range(size):
            value = (value + source[index * size + index]) % modulus
    return value


@native
def dense_prime_field_matrix_stack(
    output: UInt64Buffer,
    top: UInt64Buffer,
    bottom: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    valid = 1
    if len(output) != len(top) + len(bottom):
        valid = 0
    if valid != 0:
        for index in range(len(top)):
            output[index] = top[index]
        offset = len(top)
        for index in range(len(bottom)):
            output[offset + index] = bottom[index]
    return valid != 0


@native
def dense_prime_field_matrix_augment(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    rows: uint64,
    left_columns: uint64,
    right_columns: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    valid = 1
    if len(left) != rows * left_columns:
        valid = 0
    if len(right) != rows * right_columns:
        valid = 0
    output_columns = left_columns + right_columns
    if len(output) != rows * output_columns:
        valid = 0
    if valid != 0:
        for row in range(rows):
            output_offset = row * output_columns
            for column in range(left_columns):
                output[output_offset + column] = left[row * left_columns + column]
            for column in range(right_columns):
                output[output_offset + left_columns + column] = right[
                    row * right_columns + column
                ]
    return valid != 0


@native
def dense_prime_field_matrix_select_rows(
    output: UInt64Buffer,
    source: UInt64Buffer,
    indices: UInt64Buffer,
    source_rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    valid = 1
    if len(source) != source_rows * columns:
        valid = 0
    if len(output) != len(indices) * columns:
        valid = 0
    if valid != 0:
        for target_row in range(len(indices)):
            source_row = indices[target_row]
            if source_row >= source_rows:
                valid = 0
            else:
                for column in range(columns):
                    output[target_row * columns + column] = source[
                        source_row * columns + column
                    ]
    return valid != 0


@native
def dense_prime_field_matrix_select_columns(
    output: UInt64Buffer,
    source: UInt64Buffer,
    indices: UInt64Buffer,
    rows: uint64,
    source_columns: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    valid = 1
    if len(source) != rows * source_columns:
        valid = 0
    if len(output) != rows * len(indices):
        valid = 0
    if valid != 0:
        for row in range(rows):
            for target_column in range(len(indices)):
                source_column = indices[target_column]
                if source_column >= source_columns:
                    valid = 0
                else:
                    output[row * len(indices) + target_column] = source[
                        row * source_columns + source_column
                    ]
    return valid != 0


@native
def dense_prime_field_matrix_random_fill(
    target: UInt64Buffer,
    modulus: PrimeFieldModulus,
    initial_state: uint64,
) -> uint64:
    """Fill `target` uniformly using Sage.js's deterministic 32-bit LCG.

    Rejection sampling partitions the accepted high-order interval into
    equal-sized buckets.  Selecting a bucket instead of taking the low bits
    modulo `modulus` matters: the low bits of a linear congruential generator
    have short periods (the lowest bit merely alternates), whereas each bucket
    is selected by the high-order part of the state.  The returned state lets
    the dynamic host preserve the one shared reproducible random stream
    without entering the host once per matrix entry.
    """
    word_base = 4294967296
    limit = word_base - word_base % modulus
    bucket = limit // modulus
    state = initial_state
    count = len(target)
    for index in range(count):
        while state >= limit:
            state = (1664525 * state + 1013904223) % word_base
        target[index] = state // bucket
        if index + 1 < count:
            state = (1664525 * state + 1013904223) % word_base
    return state


@native
def dense_prime_field_matrix_identity(
    target: UInt64Buffer,
    size: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Set the diagonal of a newly zeroed packed matrix to one."""
    if len(target) != size * size:
        return False
    for index in range(size):
        target[index * size + index] = 1 % modulus
    return True


@native
def dense_prime_field_matrix_set_diagonal(
    target: UInt64Buffer,
    diagonal: UInt64Buffer,
    size: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Set a newly zeroed packed matrix from its canonical diagonal."""
    if len(target) != size * size or len(diagonal) != size:
        return False
    for index in range(size):
        target[index * size + index] = diagonal[index] % modulus
    return True


@native
def dense_prime_field_matrix_space_random_fill(
    target: UInt64Buffer,
    modulus: PrimeFieldModulus,
    initial_state: uint64,
) -> uint64:
    """Fill packed storage with `MatrixSpace.random_element` semantics."""
    word_base = 4294967296
    limit = word_base - word_base % modulus
    bucket = limit // modulus
    state = initial_state
    count = len(target)
    for index in range(count):
        state = (1664525 * state + 1013904223) % word_base
        while state >= limit:
            state = (1664525 * state + 1013904223) % word_base
        target[index] = state // bucket
        if index + 1 < count:
            state = (1664525 * state + 1013904223) % word_base
    return state


@native
def _dense_prime_field_matrix_blocked_full_rank(
    matrix: DensePrimeMatrix,
) -> uint64:
    """Try a cache-aware row-pivoted panel LU factorization in place."""
    entries = matrix.entries
    size = matrix.rows
    modulus = matrix.modulus
    panel = 0
    success = 1
    while panel < size and success != 0:
        panel_end = panel + 20
        if size < panel_end:
            panel_end = size
        for pivot_row in range(panel, panel_end):
            selected = pivot_row
            found = 0
            while selected < size and found == 0:
                if entries[selected * size + pivot_row] != 0:
                    found = 1
                else:
                    selected += 1
            if found == 0:
                success = 0
            else:
                if selected != pivot_row:
                    for column in range(size):
                        left_index = selected * size + column
                        right_index = pivot_row * size + column
                        temporary = entries[left_index]
                        entries[left_index] = entries[right_index]
                        entries[right_index] = temporary
                inverse = prime_inverse(entries[pivot_row * size + pivot_row], modulus)
                for row in range(pivot_row + 1, size):
                    factor = prime_mul(
                        entries[row * size + pivot_row], inverse, modulus
                    )
                    entries[row * size + pivot_row] = factor
                    for column in range(pivot_row + 1, panel_end):
                        target_index = row * size + column
                        source_index = pivot_row * size + column
                        product = prime_mul(factor, entries[source_index], modulus)
                        entries[target_index] = prime_sub(
                            entries[target_index], product, modulus
                        )

        if success != 0:
            for row in range(panel + 1, panel_end):
                for column in range(panel_end, size):
                    target_index = row * size + column
                    value = entries[target_index]
                    for prior in range(panel, row):
                        product = prime_mul(
                            entries[row * size + prior],
                            entries[prior * size + column],
                            modulus,
                        )
                        value = prime_sub(value, product, modulus)
                    entries[target_index] = value

            for row in range(panel_end, size):
                for column in range(panel_end, size):
                    target_index = row * size + column
                    value = entries[target_index]
                    for prior in range(panel, panel_end):
                        product = prime_mul(
                            entries[row * size + prior],
                            entries[prior * size + column],
                            modulus,
                        )
                        value = prime_sub(value, product, modulus)
                    entries[target_index] = value
        panel = panel_end
    return success


@native
def _dense_prime_field_matrix_rank_inplace(
    matrix: DensePrimeMatrix,
) -> uint64:
    entries = matrix.entries
    rows = matrix.rows
    columns = matrix.columns
    modulus = matrix.modulus
    rank = 0
    for column in range(columns):
        pivot = rank
        found = 0
        while pivot < rows and found == 0:
            if entries[pivot * columns + column] != 0:
                found = 1
            else:
                pivot += 1
        if found != 0:
            if pivot != rank:
                for swap_column in range(column, columns):
                    left_index = rank * columns + swap_column
                    right_index = pivot * columns + swap_column
                    temporary = entries[left_index]
                    entries[left_index] = entries[right_index]
                    entries[right_index] = temporary
            pivot_inverse = prime_inverse(entries[rank * columns + column], modulus)
            for row in range(rank + 1, rows):
                factor = prime_mul(
                    entries[row * columns + column],
                    pivot_inverse,
                    modulus,
                )
                entries[row * columns + column] = 0
                for target_column in range(column + 1, columns):
                    target_index = row * columns + target_column
                    pivot_index = rank * columns + target_column
                    product = prime_mul(factor, entries[pivot_index], modulus)
                    entries[target_index] = prime_sub(
                        entries[target_index], product, modulus
                    )
            rank += 1
    return rank


@native
def _dense_prime_field_matrix_rref_inplace(
    matrix: DensePrimeMatrix,
) -> uint64:
    entries = matrix.entries
    rows = matrix.rows
    columns = matrix.columns
    modulus = matrix.modulus
    rank = 0
    for column in range(columns):
        pivot = rank
        found = 0
        while pivot < rows and found == 0:
            if entries[pivot * columns + column] != 0:
                found = 1
            else:
                pivot += 1
        if found != 0:
            if pivot != rank:
                for swap_column in range(column, columns):
                    left_index = rank * columns + swap_column
                    right_index = pivot * columns + swap_column
                    temporary = entries[left_index]
                    entries[left_index] = entries[right_index]
                    entries[right_index] = temporary
            pivot_inverse = prime_inverse(entries[rank * columns + column], modulus)
            for target_column in range(column, columns):
                pivot_index = rank * columns + target_column
                entries[pivot_index] = prime_mul(
                    entries[pivot_index], pivot_inverse, modulus
                )
            for row in range(rows):
                if row != rank:
                    factor = entries[row * columns + column]
                    if factor != 0:
                        entries[row * columns + column] = 0
                        for target_column in range(column + 1, columns):
                            target_index = row * columns + target_column
                            pivot_index = rank * columns + target_column
                            product = prime_mul(factor, entries[pivot_index], modulus)
                            entries[target_index] = prime_sub(
                                entries[target_index], product, modulus
                            )
            rank += 1
    return rank


@native
def dense_prime_field_matrix_rank(
    source: DensePrimeMatrix,
    workspace: UInt64Buffer,
) -> uint64:
    """Return rank without mutating `source`; `workspace` is scratch."""
    rows = source.rows
    columns = source.columns
    entries = source.entries
    modulus = source.modulus
    if rows > 4294967295 or columns > 4294967295:
        raise ValueError("dense prime matrix dimensions are too large")
    count = rows * columns
    if len(entries) != count or len(workspace) != count:
        raise ValueError("dense prime rank buffer shape mismatch")
    for index in range(count):
        workspace[index] = entries[index]
    working = DensePrimeMatrix(workspace, rows, columns, modulus)
    if rows == columns and rows >= 32:
        if _dense_prime_field_matrix_blocked_full_rank(working) != 0:
            return rows
        for index in range(count):
            workspace[index] = entries[index]
    return _dense_prime_field_matrix_rank_inplace(working)


@native
def dense_prime_field_matrix_rref(
    source: DensePrimeMatrix,
    output: UInt64Buffer,
) -> uint64:
    """Write canonical RREF to `output` and return its rank."""
    rows = source.rows
    columns = source.columns
    entries = source.entries
    modulus = source.modulus
    if rows > 4294967295 or columns > 4294967295:
        raise ValueError("dense prime matrix dimensions are too large")
    count = rows * columns
    if len(entries) != count or len(output) != count:
        raise ValueError("dense prime RREF buffer shape mismatch")
    for index in range(count):
        output[index] = entries[index]
    working = DensePrimeMatrix(output, rows, columns, modulus)
    if rows == columns and rows >= 32:
        if _dense_prime_field_matrix_blocked_full_rank(working) != 0:
            for index in range(count):
                output[index] = 0
            for index in range(rows):
                output[index * columns + index] = 1
            return rows
        for index in range(count):
            output[index] = entries[index]
    return _dense_prime_field_matrix_rref_inplace(working)


@native
def dense_prime_field_matrix_right_kernel(
    source: DensePrimeMatrix,
    workspace: UInt64Buffer,
    output: UInt64Buffer,
) -> uint64:
    """Write a canonical RREF row basis of the right kernel.

    `workspace` has `rows * columns` entries. `output` has
    `columns * columns` entries, of which the returned nullity times
    `columns` entries are significant.
    """
    rows = source.rows
    columns = source.columns
    entries = source.entries
    modulus = source.modulus
    if rows > 4294967295 or columns > 4294967295:
        raise ValueError("dense prime matrix dimensions are too large")
    source_count = rows * columns
    output_count = columns * columns
    if len(entries) != source_count or len(workspace) != source_count:
        raise ValueError("dense prime right-kernel input shape mismatch")
    if len(output) != output_count:
        raise ValueError("dense prime right-kernel output shape mismatch")
    rank = dense_prime_field_matrix_rref(source, workspace)
    nullity = columns - rank
    active = nullity * columns
    for index in range(active):
        output[index] = 0
    basis_row = 0
    for free_column in range(columns):
        is_pivot = 0
        for row in range(rank):
            pivot = 0
            while workspace[row * columns + pivot] == 0:
                pivot += 1
            if pivot == free_column:
                is_pivot = 1
        if is_pivot == 0:
            output[basis_row * columns + free_column] = 1
            for row in range(rank):
                pivot = 0
                while workspace[row * columns + pivot] == 0:
                    pivot += 1
                output[basis_row * columns + pivot] = prime_sub(
                    0,
                    workspace[row * columns + free_column],
                    modulus,
                )
            basis_row += 1
    basis = DensePrimeMatrix(output, nullity, columns, modulus)
    normalized_rank = _dense_prime_field_matrix_rref_inplace(basis)
    if normalized_rank != nullity:
        raise ValueError("internal right-kernel basis lost rank")
    return nullity


@native
def dense_prime_field_matrix_solve(
    left: DensePrimeMatrix,
    right: DensePrimeMatrix,
    workspace: UInt64Buffer,
    output: UInt64Buffer,
) -> uint64:
    """Solve `left * output == right`; return zero when singular."""
    size = left.rows
    right_columns = right.columns
    modulus = left.modulus
    left_entries = left.entries
    right_entries = right.entries
    if size > 4294967295 or right_columns > 4294967295:
        raise ValueError("dense prime solve dimensions are too large")
    if left.columns != size or right.rows != size:
        raise ValueError("dense prime solve matrix dimensions disagree")
    if right.modulus != modulus:
        raise ValueError("dense prime solve moduli disagree")
    left_count = size * size
    right_count = size * right_columns
    augmented_columns = size + right_columns
    workspace_count = size * augmented_columns
    if len(left_entries) != left_count or len(right_entries) != right_count:
        raise ValueError("dense prime solve input shape mismatch")
    if len(workspace) != workspace_count or len(output) != right_count:
        raise ValueError("dense prime solve output shape mismatch")
    for row in range(size):
        for column in range(size):
            workspace[row * augmented_columns + column] = left_entries[
                row * size + column
            ]
        for column in range(right_columns):
            workspace[row * augmented_columns + size + column] = right_entries[
                row * right_columns + column
            ]
    augmented = DensePrimeMatrix(workspace, size, augmented_columns, modulus)
    rank = _dense_prime_field_matrix_rref_inplace(augmented)
    if rank != size:
        return 0
    for row in range(size):
        for column in range(size):
            expected = 0
            if row == column:
                expected = 1
            if workspace[row * augmented_columns + column] != expected:
                return 0
    for row in range(size):
        for column in range(right_columns):
            output[row * right_columns + column] = workspace[
                row * augmented_columns + size + column
            ]
    return 1


__all__ = [
    "DensePrimeMatrix",
    "dense_prime_field_matrix_identity",
    "dense_prime_field_matrix_rank",
    "dense_prime_field_matrix_set_diagonal",
    "dense_prime_field_matrix_space_random_fill",
    "dense_prime_field_matrix_rref",
    "dense_prime_field_matrix_right_kernel",
    "dense_prime_field_matrix_solve",
]
