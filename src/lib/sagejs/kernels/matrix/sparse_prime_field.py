"""Packed sparse matrix actions over machine-word prime fields.

The ordinary Python bodies are the portable correctness fallbacks and the
sources lowered by `@native`.  Callers pack one immutable CSR operator per
prime and retain all vectors inside a single kernel call, avoiding a host
boundary for each Krylov step.
"""

from __future__ import annotations

from sagejs.native import (
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    prime_add,
    prime_mul,
    uint64,
)


@native
def word_prime_csr_projected_sequence(
    output: UInt64Buffer,
    row_offsets: UInt64Buffer,
    columns: UInt64Buffer,
    values: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    workspace: UInt64Buffer,
    dimension: uint64,
    length: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    r"""Write $u^T A^i v$ for $0\leq i<\text{length}$ from packed CSR."""
    if len(output) != length or len(row_offsets) != dimension + 1:
        return False
    if len(left) != dimension or len(right) != dimension:
        return False
    if len(workspace) != 2 * dimension or len(columns) != len(values):
        return False
    nonzeros: uint64 = len(columns)
    if row_offsets[0] != 0 or row_offsets[dimension] != nonzeros:
        return False
    for row in range(dimension):
        if row_offsets[row] > row_offsets[row + 1]:
            return False
    for position in range(nonzeros):
        if columns[position] >= dimension:
            return False

    for index in range(dimension):
        workspace[index] = right[index]
        workspace[dimension + index] = 0
    current: uint64 = 0
    following: uint64 = dimension
    for exponent in range(length):
        dot: uint64 = 0
        for index in range(dimension):
            dot = prime_add(
                dot,
                prime_mul(left[index], workspace[current + index], modulus),
                modulus,
            )
        output[exponent] = dot

        for row in range(dimension):
            total: uint64 = 0
            start = row_offsets[row]
            stop = row_offsets[row + 1]
            for position in range(start, stop):
                total = prime_add(
                    total,
                    prime_mul(
                        values[position],
                        workspace[current + columns[position]],
                        modulus,
                    ),
                    modulus,
                )
            workspace[following + row] = total
        swap = current
        current = following
        following = swap
    return True


@native
def word_prime_csr_polynomial_apply(
    output: UInt64Buffer,
    row_offsets: UInt64Buffer,
    columns: UInt64Buffer,
    values: UInt64Buffer,
    coefficients: UInt64Buffer,
    vector: UInt64Buffer,
    workspace: UInt64Buffer,
    dimension: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Write $f(A)v$ by packed CSR Horner evaluation."""
    if len(output) != dimension or len(row_offsets) != dimension + 1:
        return False
    if len(vector) != dimension or len(coefficients) == 0:
        return False
    if len(workspace) != 2 * dimension or len(columns) != len(values):
        return False
    nonzeros: uint64 = len(columns)
    if row_offsets[0] != 0 or row_offsets[dimension] != nonzeros:
        return False
    for row in range(dimension):
        if row_offsets[row] > row_offsets[row + 1]:
            return False
    for position in range(nonzeros):
        if columns[position] >= dimension:
            return False

    for index in range(2 * dimension):
        workspace[index] = 0
    current: uint64 = 0
    following: uint64 = dimension
    coefficient_index: uint64 = len(coefficients)
    while coefficient_index > 0:
        coefficient_index -= 1
        for row in range(dimension):
            total: uint64 = 0
            start = row_offsets[row]
            stop = row_offsets[row + 1]
            for position in range(start, stop):
                total = prime_add(
                    total,
                    prime_mul(
                        values[position],
                        workspace[current + columns[position]],
                        modulus,
                    ),
                    modulus,
                )
            workspace[following + row] = prime_add(
                total,
                prime_mul(coefficients[coefficient_index], vector[row], modulus),
                modulus,
            )
        swap = current
        current = following
        following = swap
    for index in range(dimension):
        output[index] = workspace[current + index]
    return True


@native
def word_prime_csr_power_traces(
    output: UInt64Buffer,
    row_offsets: UInt64Buffer,
    columns: UInt64Buffer,
    values: UInt64Buffer,
    workspace: UInt64Buffer,
    dimension: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    r"""Write $\operatorname{tr}(A^k)$ for $0\leq k\leq n$ from packed CSR."""
    if len(output) != dimension + 1 or len(row_offsets) != dimension + 1:
        return False
    if len(workspace) != 2 * dimension or len(columns) != len(values):
        return False
    nonzeros: uint64 = len(columns)
    if row_offsets[0] != 0 or row_offsets[dimension] != nonzeros:
        return False
    for row in range(dimension):
        if row_offsets[row] > row_offsets[row + 1]:
            return False
    for position in range(nonzeros):
        if columns[position] >= dimension:
            return False

    output[0] = dimension % modulus
    for power in range(1, dimension + 1):
        output[power] = 0
    for basis_index in range(dimension):
        for index in range(2 * dimension):
            workspace[index] = 0
        workspace[basis_index] = 1
        current: uint64 = 0
        following: uint64 = dimension
        for power in range(1, dimension + 1):
            for row in range(dimension):
                total: uint64 = 0
                start = row_offsets[row]
                stop = row_offsets[row + 1]
                for position in range(start, stop):
                    total = prime_add(
                        total,
                        prime_mul(
                            values[position],
                            workspace[current + columns[position]],
                            modulus,
                        ),
                        modulus,
                    )
                workspace[following + row] = total
            output[power] = prime_add(
                output[power], workspace[following + basis_index], modulus
            )
            swap = current
            current = following
            following = swap
    return True


__all__ = [
    "word_prime_csr_polynomial_apply",
    "word_prime_csr_power_traces",
    "word_prime_csr_projected_sequence",
]
