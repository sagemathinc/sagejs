"""PARI 2.17.4 one etale quotient splitting step.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Source `base2.c:primedec_aux`, from quotient projection through the image
loop. This emits children in ascending-root insertion order, not the reverse
order in which the outer source loop publishes completed maximal ideals.
Kummer selection, recursive worklist management and descriptors are external.
"""

from sagejs.native import IntegerBuffer, native
from .quotient_projection import pari_small_quotient_projection
from .integral_frobenius import pari_integral_basis_multiply
from .pradical import pari_small_fp_rectangular_product
from .quotient_minpoly import pari_small_quotient_minpoly
from .small_prime_polynomial_roots import (
    pari_small_prime_polynomial_roots,
    pari_small_prime_polynomial_roots_workspace_size,
)
from .small_prime_matrix_basis import pari_small_prime_matrix_image


@native
def pari_small_quotient_split_step(
    table: IntegerBuffer,
    ideal: IntegerBuffer,
    phi: IntegerBuffer,
    n: int,
    rank: int,
    prime: int,
    projection: IntegerBuffer,
    workspace: IntegerBuffer,
    element: IntegerBuffer,
    column: IntegerBuffer,
    matrix: IntegerBuffer,
    polynomial_workspace: IntegerBuffer,
    coefficients: IntegerBuffer,
    polynomial_diagnostic: IntegerBuffer,
    roots: IntegerBuffer,
    root_workspace: IntegerBuffer,
    children: IntegerBuffer,
    child_ranks: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Return child count; retain exact source intermediate states.

    All owners are disjoint. H is independent, excludes 1 and is phi-invariant.
    Matrices use column-major storage; each child has an n²-capacity span.
    State is status, quotient dimension, field-component count, root count,
    polynomial degree, complete-split flag. Status -1 means partial scratch.
    Complete means the quotient is already a field or the source root count
    equals component count, not that
    class-group or prime-descriptor computation is complete.
    """
    if n < 3 or n > 4 or rank < 0 or rank >= n or prime < 2 or prime > 3037000493:
        raise ValueError("small quotient split domain")
    size = n * n
    if (
        len(table) < n * size
        or len(ideal) < n * rank
        or len(phi) < size
        or len(projection) < 11 * size + 2 * n
        or len(workspace) < 10 * size + 3 * n
        or len(element) < n
        or len(column) < n
        or len(matrix) < size
        or len(polynomial_workspace) < 2 * n * (n + 2) + 4 * n + 4
        or len(coefficients) < n + 2
        or len(polynomial_diagnostic) < 2
        or len(roots) < 4
        or len(root_workspace) < pari_small_prime_polynomial_roots_workspace_size()
        or len(children) < n * size
        or len(child_ranks) < n
        or len(state) < 6
    ):
        raise ValueError("short quotient split storage")
    state[0] = -1
    state[3] = 0
    state[4] = -1
    state[5] = 0
    components = pari_small_quotient_projection(
        ideal, phi, n, rank, prime, projection, state
    )
    dimension = state[1]
    state[0] = -1
    if components == 1:
        for i in range(n * rank):
            children[i] = ideal[i]
        child_ranks[0] = rank
        state[5] = 1
        state[0] = 0
        return 1
    # Lift the exact second kernel column via integer dot products, then mod.
    for i in range(n):
        total = projection[3 * size + i] * projection[8 * size + dimension]
        for k in range(1, dimension):
            term = (
                projection[3 * size + k * n + i] * projection[8 * size + dimension + k]
            )
            if term != 0:
                total += term
        element[i] = total % prime
    # zk_multable: first column aliases a, then source zk_ei_mul columns.
    for i in range(n):
        workspace[2 * size + i] = element[i]
    for j in range(1, n):
        pari_integral_basis_multiply(table, element, n, j + 1, column)
        for i in range(n):
            workspace[2 * size + j * n + i] = column[i]
    for i in range(size):
        workspace[2 * size + i] %= prime
    for i in range(n * dimension):
        workspace[i] = projection[3 * size + i]
        workspace[size + i] = projection[4 * size + i]
    pari_small_fp_rectangular_product(
        workspace, 2 * size, 0, 3 * size, n, n, dimension, prime
    )
    pari_small_fp_rectangular_product(
        workspace, size, 3 * size, 4 * size, dimension, n, dimension, prime
    )
    for i in range(dimension * dimension):
        matrix[i] = workspace[4 * size + i]
    degree = pari_small_quotient_minpoly(
        matrix,
        dimension,
        prime,
        polynomial_workspace,
        coefficients,
        polynomial_diagnostic,
    )
    count = pari_small_prime_polynomial_roots(
        coefficients, degree, prime, roots, root_workspace
    )
    for at in range(count):
        for i in range(n * rank):
            workspace[5 * size + i] = ideal[i]
        for j in range(n):
            for i in range(n):
                value = workspace[2 * size + j * n + i]
                if i == j:
                    value -= roots[at]
                # FpM_image keeps these signed original columns.
                workspace[5 * size + n * rank + j * n + i] = value
        child_rank = pari_small_prime_matrix_image(
            workspace, 5 * size, n, rank + n, prime, 7 * size, 8 * size
        )
        for i in range(n * child_rank):
            children[at * size + i] = workspace[7 * size + i]
        child_ranks[at] = child_rank
    state[3] = count
    state[4] = degree
    if count == components:
        state[5] = 1
    state[0] = 0
    return count
