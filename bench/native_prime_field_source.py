"""Source-transparent dense prime-field compiler experiments.

The decorated bodies in this module are the algorithms compiled by the
Native Kernel.  There is no algorithm-name substitution: loops, branches,
buffer accesses, and modular operations all appear in the generated IR.
The same source remains an executable, deliberately slow Python fallback.
"""

from __future__ import annotations

from sagejs.native import (
    native,
    prime_add,
    prime_buffer,
    prime_columns,
    prime_inverse,
    prime_matrix,
    prime_modulus,
    prime_mul,
    prime_rows,
    prime_sub,
    prime_zeros,
)


@native
def source_prime_rank(source: PrimeFieldMatrix) -> uint64:
    """Compute rank by row-pivoted classical LU over a word-size prime."""
    rows = prime_rows(source)
    columns = prime_columns(source)
    modulus = prime_modulus(source)
    entries = prime_buffer(source)
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
                for swap_column in range(columns):
                    left_index = rank * columns + swap_column
                    right_index = pivot * columns + swap_column
                    temporary = entries[left_index]
                    entries[left_index] = entries[right_index]
                    entries[right_index] = temporary
            pivot_index = rank * columns + column
            pivot_inverse = prime_inverse(entries[pivot_index], modulus)
            for row in range(rank + 1, rows):
                target_index = row * columns + column
                factor = prime_mul(
                    entries[target_index], pivot_inverse, modulus)
                entries[target_index] = factor
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
def source_prime_matmul(
    left: PrimeFieldMatrix,
    right: PrimeFieldMatrix,
) -> PrimeFieldMatrix:
    """Multiply dense matrices using the ordinary cubic row-major loop."""
    rows = prime_rows(left)
    inner = prime_columns(left)
    columns = prime_columns(right)
    right_rows = prime_rows(right)
    modulus = prime_modulus(left)
    right_modulus = prime_modulus(right)
    if inner != right_rows:
        raise ValueError('matrix dimensions do not agree')
    if modulus != right_modulus:
        raise ValueError('matrix base rings differ')
    left_entries = prime_buffer(left)
    right_entries = prime_buffer(right)
    result = prime_zeros(rows * columns)
    for row in range(rows):
        for column in range(columns):
            accumulator = 0
            for index in range(inner):
                product = prime_mul(
                    left_entries[row * inner + index],
                    right_entries[index * columns + column],
                    modulus,
                )
                accumulator = prime_add(accumulator, product, modulus)
            result[row * columns + column] = accumulator
    return prime_matrix(left, rows, columns, result)
