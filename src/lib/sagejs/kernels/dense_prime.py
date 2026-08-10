"""Source-transparent dense linear algebra over small prime fields.

The public ABI is deliberately independent of Node and FLINT: a compiler-owned
matrix value containing caller-owned row-major ``UInt64Buffer`` storage,
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
    """Borrowed packed storage and shape for a matrix over ``GF(modulus)``."""

    entries: UInt64Buffer
    rows: uint64
    columns: uint64
    modulus: PrimeFieldModulus


@native
def _dense_prime_blocked_full_rank(
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
                inverse = prime_inverse(
                    entries[pivot_row * size + pivot_row], modulus)
                for row in range(pivot_row + 1, size):
                    factor = prime_mul(
                        entries[row * size + pivot_row], inverse, modulus)
                    entries[row * size + pivot_row] = factor
                    for column in range(pivot_row + 1, panel_end):
                        target_index = row * size + column
                        source_index = pivot_row * size + column
                        product = prime_mul(
                            factor, entries[source_index], modulus)
                        entries[target_index] = prime_sub(
                            entries[target_index], product, modulus)

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
def _dense_prime_rank_inplace(
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
            pivot_inverse = prime_inverse(
                entries[rank * columns + column], modulus)
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
                    product = prime_mul(
                        factor, entries[pivot_index], modulus)
                    entries[target_index] = prime_sub(
                        entries[target_index], product, modulus)
            rank += 1
    return rank


@native
def _dense_prime_rref_inplace(
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
            pivot_inverse = prime_inverse(
                entries[rank * columns + column], modulus)
            for target_column in range(column, columns):
                pivot_index = rank * columns + target_column
                entries[pivot_index] = prime_mul(
                    entries[pivot_index], pivot_inverse, modulus)
            for row in range(rows):
                if row != rank:
                    factor = entries[row * columns + column]
                    if factor != 0:
                        entries[row * columns + column] = 0
                        for target_column in range(column + 1, columns):
                            target_index = row * columns + target_column
                            pivot_index = rank * columns + target_column
                            product = prime_mul(
                                factor, entries[pivot_index], modulus)
                            entries[target_index] = prime_sub(
                                entries[target_index], product, modulus)
            rank += 1
    return rank


@native
def dense_prime_rank(
    source: DensePrimeMatrix,
    workspace: UInt64Buffer,
) -> uint64:
    """Return rank without mutating ``source``; ``workspace`` is scratch."""
    rows = source.rows
    columns = source.columns
    entries = source.entries
    modulus = source.modulus
    if rows > 4294967295 or columns > 4294967295:
        raise ValueError('dense prime matrix dimensions are too large')
    count = rows * columns
    if len(entries) != count or len(workspace) != count:
        raise ValueError('dense prime rank buffer shape mismatch')
    for index in range(count):
        workspace[index] = entries[index]
    working = DensePrimeMatrix(workspace, rows, columns, modulus)
    if rows == columns and rows >= 32:
        if _dense_prime_blocked_full_rank(working) != 0:
            return rows
        for index in range(count):
            workspace[index] = entries[index]
    return _dense_prime_rank_inplace(working)


@native
def dense_prime_rref(
    source: DensePrimeMatrix,
    output: UInt64Buffer,
) -> uint64:
    """Write canonical RREF to ``output`` and return its rank."""
    rows = source.rows
    columns = source.columns
    entries = source.entries
    modulus = source.modulus
    if rows > 4294967295 or columns > 4294967295:
        raise ValueError('dense prime matrix dimensions are too large')
    count = rows * columns
    if len(entries) != count or len(output) != count:
        raise ValueError('dense prime RREF buffer shape mismatch')
    for index in range(count):
        output[index] = entries[index]
    working = DensePrimeMatrix(output, rows, columns, modulus)
    if rows == columns and rows >= 32:
        if _dense_prime_blocked_full_rank(working) != 0:
            for index in range(count):
                output[index] = 0
            for index in range(rows):
                output[index * columns + index] = 1
            return rows
        for index in range(count):
            output[index] = entries[index]
    return _dense_prime_rref_inplace(working)


@native
def dense_prime_right_kernel(
    source: DensePrimeMatrix,
    workspace: UInt64Buffer,
    output: UInt64Buffer,
) -> uint64:
    """Write a canonical RREF row basis of the right kernel.

    ``workspace`` has ``rows * columns`` entries. ``output`` has
    ``columns * columns`` entries, of which the returned nullity times
    ``columns`` entries are significant.
    """
    rows = source.rows
    columns = source.columns
    entries = source.entries
    modulus = source.modulus
    if rows > 4294967295 or columns > 4294967295:
        raise ValueError('dense prime matrix dimensions are too large')
    source_count = rows * columns
    output_count = columns * columns
    if len(entries) != source_count or len(workspace) != source_count:
        raise ValueError('dense prime right-kernel input shape mismatch')
    if len(output) != output_count:
        raise ValueError('dense prime right-kernel output shape mismatch')
    rank = dense_prime_rref(source, workspace)
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
    normalized_rank = _dense_prime_rref_inplace(basis)
    if normalized_rank != nullity:
        raise ValueError('internal right-kernel basis lost rank')
    return nullity


@native
def dense_prime_solve(
    left: DensePrimeMatrix,
    right: DensePrimeMatrix,
    workspace: UInt64Buffer,
    output: UInt64Buffer,
) -> uint64:
    """Solve ``left * output == right``; return zero when singular."""
    size = left.rows
    right_columns = right.columns
    modulus = left.modulus
    left_entries = left.entries
    right_entries = right.entries
    if size > 4294967295 or right_columns > 4294967295:
        raise ValueError('dense prime solve dimensions are too large')
    if left.columns != size or right.rows != size:
        raise ValueError('dense prime solve matrix dimensions disagree')
    if right.modulus != modulus:
        raise ValueError('dense prime solve moduli disagree')
    left_count = size * size
    right_count = size * right_columns
    augmented_columns = size + right_columns
    workspace_count = size * augmented_columns
    if len(left_entries) != left_count or len(right_entries) != right_count:
        raise ValueError('dense prime solve input shape mismatch')
    if len(workspace) != workspace_count or len(output) != right_count:
        raise ValueError('dense prime solve output shape mismatch')
    for row in range(size):
        for column in range(size):
            workspace[row * augmented_columns + column] = (
                left_entries[row * size + column])
        for column in range(right_columns):
            workspace[row * augmented_columns + size + column] = (
                right_entries[row * right_columns + column])
    augmented = DensePrimeMatrix(
        workspace, size, augmented_columns, modulus)
    rank = _dense_prime_rref_inplace(augmented)
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
                row * augmented_columns + size + column]
    return 1


__all__ = [
    'DensePrimeMatrix',
    'dense_prime_rank',
    'dense_prime_rref',
    'dense_prime_right_kernel',
    'dense_prime_solve',
]
