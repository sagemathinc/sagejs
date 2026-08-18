"""Packed Krylov minimal polynomials over word-prime fields.

The kernel computes the monic polynomial of least degree annihilating the
first standard basis vector under a square row-major matrix.  For a regular
representation multiplication matrix this is the element's minimal
polynomial.  The ordinary Python body is both the dynamic fallback and the
source lowered by `@native`; callers own all packed storage.
"""

from __future__ import annotations

from sagejs.native import (
    IntegerBuffer,
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


def word_prime_krylov_batch_workspace_length(dimension: int) -> int:
    """Return scratch length for a varying-prime integer-matrix batch."""
    if dimension < 0:
        raise ValueError("Krylov matrix dimension must be nonnegative")
    return dimension * dimension + word_prime_krylov_workspace_length(dimension)


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


@native
def integer_matrix_word_prime_minimal_polynomial_batch(
    degrees: UInt64Buffer,
    coefficients: UInt64Buffer,
    crt_degree: UInt64Buffer,
    crt_state: IntegerBuffer,
    batch_state: IntegerBuffer,
    matrix: IntegerBuffer,
    primes: UInt64Buffer,
    workspace: UInt64Buffer,
    dimension: uint64,
    prime_count: uint64,
) -> uint64:
    """Compute first-coordinate minimal polynomials for a prime batch.

    `matrix` is one row-major exact integer matrix.  For prime number `j`,
    the ascending polynomial occupies row `j` of the row-major `coefficients`
    buffer, whose width is `dimension + 1`; `degrees[j]` records its degree.
    The caller supplies one reusable modular matrix and Krylov workspace.
    Across calls, `crt_degree[0]` and `crt_state` retain the largest modular
    degree, modulus, and residues (`crt_state[0]` is the modulus and the
    following entries are ascending coefficients).  `batch_state` is reusable
    exact scratch.  The kernel first reconstructs the batch from its small
    word primes, then merges that result into the growing global CRT exactly
    once.  A larger modular degree resets either state; an equal degree extends
    it by exact CRT.

    Every accepted modulus is at most `2^30 - 1`.  Consequently each modular
    product is below `2^60`, so the explicit `uint64` arithmetic cannot wrap.
    Prime certification remains the caller's responsibility.  A zero return
    reports a malformed shape, dimension, modulus range, or missing relation;
    no such result is accepted by the caller.
    """
    zero = dimension - dimension
    if dimension > 4294967295:
        return zero
    if dimension == zero:
        return zero
    one = dimension // dimension
    matrix_count = dimension * dimension
    relation_width = dimension + one
    if len(matrix) != matrix_count:
        return zero
    if len(primes) != prime_count or len(degrees) != prime_count:
        return zero
    if len(coefficients) != prime_count * relation_width:
        return zero
    if len(crt_degree) != one or len(crt_state) != dimension + 2 * one:
        return zero
    if len(batch_state) != dimension + 2 * one:
        return zero
    if len(workspace) != 3 * matrix_count + 4 * dimension + one:
        return zero
    modular_matrix_offset = 0
    krylov_offset = matrix_count
    basis_vectors_offset = krylov_offset
    basis_relations_offset = basis_vectors_offset + matrix_count
    vector_offset = basis_relations_offset + dimension * relation_width
    reduced_offset = vector_offset + dimension
    relation_offset = reduced_offset + dimension
    batch_degree = zero
    for prime_index in range(prime_count):
        modulus = primes[prime_index]
        if modulus < 2 or modulus > 1073741823:
            return zero
        for index in range(matrix_count):
            workspace[modular_matrix_offset + index] = matrix[index] % modulus

        output_offset = prime_index * relation_width
        for index in range(relation_width):
            coefficients[output_offset + index] = zero
        for index in range(dimension):
            workspace[vector_offset + index] = zero
        workspace[vector_offset] = one

        basis_count = zero
        found_relation = zero
        for exponent in range(dimension + one):
            if found_relation == zero:
                for index in range(dimension):
                    workspace[reduced_offset + index] = workspace[vector_offset + index]
                for index in range(relation_width):
                    workspace[relation_offset + index] = zero
                workspace[relation_offset + exponent] = one

                for basis_index in range(basis_count):
                    basis_vector = basis_vectors_offset + basis_index * dimension
                    pivot = dimension
                    for index in range(dimension):
                        if (
                            pivot == dimension
                            and workspace[basis_vector + index] != zero
                        ):
                            pivot = index
                    multiplier = workspace[reduced_offset + pivot]
                    if multiplier != zero:
                        for index in range(dimension):
                            if index >= pivot:
                                product = (
                                    multiplier * workspace[basis_vector + index]
                                ) % modulus
                                workspace[reduced_offset + index] = (
                                    workspace[reduced_offset + index]
                                    + modulus
                                    - product
                                ) % modulus
                        basis_relation = (
                            basis_relations_offset + basis_index * relation_width
                        )
                        for relation_index in range(exponent + one):
                            product = (
                                multiplier * workspace[basis_relation + relation_index]
                            ) % modulus
                            workspace[relation_offset + relation_index] = (
                                workspace[relation_offset + relation_index]
                                + modulus
                                - product
                            ) % modulus

                pivot = dimension
                for index in range(dimension):
                    if pivot == dimension and workspace[reduced_offset + index] != zero:
                        pivot = index
                if pivot == dimension:
                    for relation_index in range(exponent + one):
                        coefficients[output_offset + relation_index] = workspace[
                            relation_offset + relation_index
                        ]
                    degrees[prime_index] = basis_count
                    found_relation = one
                else:
                    old_remainder = modulus
                    remainder = workspace[reduced_offset + pivot]
                    old_coefficient = modulus - modulus
                    coefficient = modulus // modulus
                    while remainder:
                        quotient = old_remainder // remainder
                        next_remainder = old_remainder % remainder
                        product = ((quotient % modulus) * coefficient) % modulus
                        next_coefficient = (
                            old_coefficient + modulus - product
                        ) % modulus
                        old_remainder = remainder
                        remainder = next_remainder
                        old_coefficient = coefficient
                        coefficient = next_coefficient
                    inverse = old_coefficient
                    basis_vector = basis_vectors_offset + basis_count * dimension
                    for index in range(dimension):
                        workspace[basis_vector + index] = (
                            workspace[reduced_offset + index] * inverse
                        ) % modulus
                    basis_relation = (
                        basis_relations_offset + basis_count * relation_width
                    )
                    for index in range(relation_width):
                        workspace[basis_relation + index] = (
                            workspace[relation_offset + index] * inverse
                        ) % modulus
                    basis_count = basis_count + one

                    for row in range(dimension):
                        total = modulus - modulus
                        row_offset = modular_matrix_offset + row * dimension
                        for column in range(dimension):
                            product = (
                                workspace[row_offset + column]
                                * workspace[vector_offset + column]
                            ) % modulus
                            total = (total + product) % modulus
                        workspace[reduced_offset + row] = total
                    for index in range(dimension):
                        workspace[vector_offset + index] = workspace[
                            reduced_offset + index
                        ]
        if found_relation == zero:
            return zero
        modular_degree = degrees[prime_index]
        if modular_degree > batch_degree:
            batch_degree = modular_degree
            batch_state[zero] = modulus
            for crt_index in range(modular_degree + one):
                batch_state[one + crt_index] = coefficients[output_offset + crt_index]
        elif modular_degree == batch_degree:
            current_modulus = batch_state[zero]
            modulus_residue = current_modulus % modulus
            old_remainder = modulus
            remainder = modulus_residue
            old_coefficient = modulus - modulus
            coefficient = modulus // modulus
            while remainder:
                quotient = old_remainder // remainder
                next_remainder = old_remainder % remainder
                product = ((quotient % modulus) * coefficient) % modulus
                next_coefficient = (old_coefficient + modulus - product) % modulus
                old_remainder = remainder
                remainder = next_remainder
                old_coefficient = coefficient
                coefficient = next_coefficient
            inverse = old_coefficient
            for crt_index in range(modular_degree + one):
                residue_mod_prime = batch_state[one + crt_index] % modulus
                target = coefficients[output_offset + crt_index]
                correction = (
                    (target + modulus - residue_mod_prime) * inverse
                ) % modulus
                batch_state[one + crt_index] = (
                    batch_state[one + crt_index] + current_modulus * correction
                )
            batch_state[zero] = current_modulus * modulus
    current_degree = crt_degree[zero]
    if batch_degree > current_degree:
        crt_degree[zero] = batch_degree
        for crt_index in range(batch_degree + 2 * one):
            crt_state[crt_index] = batch_state[crt_index]
    elif batch_degree == current_degree:
        global_modulus = crt_state[zero]
        batch_modulus = batch_state[zero]
        global_modulus_residue = global_modulus % batch_modulus
        global_old_remainder = batch_modulus
        global_remainder = global_modulus_residue
        global_old_coefficient = batch_modulus - batch_modulus
        global_coefficient = batch_modulus // batch_modulus
        while global_remainder:
            global_quotient = global_old_remainder // global_remainder
            global_next_remainder = global_old_remainder % global_remainder
            global_product = (
                (global_quotient % batch_modulus) * global_coefficient
            ) % batch_modulus
            global_next_coefficient = (
                global_old_coefficient + batch_modulus - global_product
            ) % batch_modulus
            global_old_remainder = global_remainder
            global_remainder = global_next_remainder
            global_old_coefficient = global_coefficient
            global_coefficient = global_next_coefficient
        global_inverse = global_old_coefficient
        for crt_index in range(batch_degree + one):
            residue_mod_batch = crt_state[one + crt_index] % batch_modulus
            batch_target = batch_state[one + crt_index]
            global_correction = (
                (batch_target + batch_modulus - residue_mod_batch) * global_inverse
            ) % batch_modulus
            crt_state[one + crt_index] = (
                crt_state[one + crt_index] + global_modulus * global_correction
            )
        crt_state[zero] = global_modulus * batch_modulus
    return prime_count


__all__ = [
    "integer_matrix_word_prime_minimal_polynomial_batch",
    "word_prime_krylov_batch_workspace_length",
    "word_prime_krylov_minimal_polynomial",
    "word_prime_krylov_workspace_length",
]
