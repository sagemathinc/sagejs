"""Packed Krylov minimal polynomials over word-prime fields.

The kernel computes the monic polynomial of least degree annihilating the
first standard basis vector under a square row-major matrix.  For a regular
representation multiplication matrix this is the element's minimal
polynomial.  The ordinary Python body is both the dynamic fallback and the
source lowered by `@native`; callers own all packed storage.
"""

from __future__ import annotations

from sagejs.native import (
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    prime_add,
    prime_inverse,
    prime_mul,
    prime_sub,
    uint64,
)


def word_prime_krylov_workspace_length(dimension: int) -> int:
    """Return the exact scratch length for a square matrix of `dimension`."""
    if dimension < 0:
        raise ValueError("Krylov matrix dimension must be nonnegative")
    return 2 * dimension * dimension + 4 * dimension + 1


@native
def word_prime_krylov_minimal_polynomial(
    output: UInt64Buffer,
    matrix: UInt64Buffer,
    workspace: UInt64Buffer,
    dimension: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    """Write the ascending first-coordinate minimal polynomial.

    `matrix` is square and row-major. `output` has `dimension + 1` entries;
    only entries through the returned degree are significant. `workspace`
    has exactly `word_prime_krylov_workspace_length(dimension)` entries.
    A zero return reports an invalid zero-dimensional input; shape errors raise
    before output is changed.
    """
    if dimension > 4294967295:
        raise ValueError("Krylov matrix dimension is too large")
    matrix_count = dimension * dimension
    workspace_count = 2 * matrix_count + 4 * dimension + 1
    if len(matrix) != matrix_count:
        raise ValueError("Krylov matrix storage has the wrong shape")
    if len(output) != dimension + 1:
        raise ValueError("Krylov polynomial output has the wrong shape")
    if len(workspace) != workspace_count:
        raise ValueError("Krylov workspace has the wrong shape")
    if dimension == 0:
        return 0

    relation_width = dimension + 1
    basis_vectors_offset = 0
    basis_relations_offset = matrix_count
    vector_offset = basis_relations_offset + dimension * relation_width
    reduced_offset = vector_offset + dimension
    relation_offset = reduced_offset + dimension

    zero = modulus - modulus
    one = modulus // modulus

    for index in range(dimension + 1):
        output[index] = zero
    for index in range(dimension):
        workspace[vector_offset + index] = zero
    workspace[vector_offset] = one

    basis_count = 0
    for exponent in range(dimension + 1):
        for index in range(dimension):
            workspace[reduced_offset + index] = workspace[vector_offset + index]
        for index in range(dimension + 1):
            workspace[relation_offset + index] = zero
        workspace[relation_offset + exponent] = one

        for basis_index in range(basis_count):
            basis_vector = basis_vectors_offset + basis_index * dimension
            pivot = dimension
            for index in range(dimension):
                if pivot == dimension and workspace[basis_vector + index] != zero:
                    pivot = index
            multiplier = workspace[reduced_offset + pivot]
            if multiplier != zero:
                for index in range(pivot, dimension):
                    workspace[reduced_offset + index] = prime_sub(
                        workspace[reduced_offset + index],
                        prime_mul(
                            multiplier,
                            workspace[basis_vector + index],
                            modulus,
                        ),
                        modulus,
                    )
                basis_relation = basis_relations_offset + basis_index * relation_width
                for index in range(exponent + 1):
                    workspace[relation_offset + index] = prime_sub(
                        workspace[relation_offset + index],
                        prime_mul(
                            multiplier,
                            workspace[basis_relation + index],
                            modulus,
                        ),
                        modulus,
                    )

        pivot = dimension
        for index in range(dimension):
            if pivot == dimension and workspace[reduced_offset + index] != zero:
                pivot = index
        if pivot == dimension:
            for index in range(exponent + 1):
                output[index] = workspace[relation_offset + index]
            return exponent

        inverse = prime_inverse(workspace[reduced_offset + pivot], modulus)
        basis_vector = basis_vectors_offset + basis_count * dimension
        for index in range(dimension):
            workspace[basis_vector + index] = prime_mul(
                workspace[reduced_offset + index], inverse, modulus
            )
        basis_relation = basis_relations_offset + basis_count * relation_width
        for index in range(dimension + 1):
            workspace[basis_relation + index] = prime_mul(
                workspace[relation_offset + index], inverse, modulus
            )
        basis_count += 1

        for row in range(dimension):
            total = zero
            row_offset = row * dimension
            for column in range(dimension):
                product = prime_mul(
                    matrix[row_offset + column],
                    workspace[vector_offset + column],
                    modulus,
                )
                total = prime_add(total, product, modulus)
            workspace[reduced_offset + row] = total
        for index in range(dimension):
            workspace[vector_offset + index] = workspace[reduced_offset + index]

    raise ValueError("a square matrix has no Krylov relation")


__all__ = [
    "word_prime_krylov_minimal_polynomial",
    "word_prime_krylov_workspace_length",
]
