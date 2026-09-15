"""PARI 2.17.4 primedec_aux quotient-basis and Frobenius projection.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate the block from FpM_suppl(H|1) through FpM_ker(phi2). H is an
independent ideal basis modulo p, not a computed prime descriptor. The source
quotient splitter and descriptor construction remain separate dependencies.
"""

from sagejs.native import IntegerBuffer, native
from .pradical import pari_small_fp_rectangular_product, pari_small_pradical
from .small_prime_matrix_basis import pari_small_prime_matrix_supplement
from .small_prime_matrix_inverse import pari_small_prime_matrix_inverse
from .small_prime_matrix_kernel import pari_small_prime_matrix_kernel


@native
def pari_small_radical_quotient(
    table: IntegerBuffer,
    n: int,
    prime: int,
    radical_workspace: IntegerBuffer,
    temporary: IntegerBuffer,
    column: IntegerBuffer,
    power_diagnostic: IntegerBuffer,
    phi: IntegerBuffer,
    radical: IntegerBuffer,
    radical_diagnostic: IntegerBuffer,
    projection_workspace: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Integral table through radical and its etale quotient in one native call.

    This is the full-radical quotient, not the Kummer-removed branch. No
    supplied radical, Frobenius map, completion or inverse is consumed.
    All owners are disjoint. State -1 denotes an unpublished partial attempt.
    """
    if n < 3 or n > 4 or prime < 2 or prime > 3037000493:
        raise ValueError("small radical quotient domain")
    if len(projection_workspace) < 11 * n * n + 2 * n or len(state) < 3:
        raise ValueError("short radical quotient projection storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    rank = pari_small_pradical(
        table,
        n,
        prime,
        radical_workspace,
        temporary,
        column,
        power_diagnostic,
        phi,
        radical,
        radical_diagnostic,
    )
    return pari_small_quotient_projection(
        radical, phi, n, rank, prime, projection_workspace, state
    )


@native
def pari_small_quotient_projection(
    ideal: IntegerBuffer,
    phi: IntegerBuffer,
    n: int,
    rank: int,
    prime: int,
    workspace: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Prepare source M, inverse M, quotient phi and its kernel.

    Owners are disjoint and matrices column-major. H has independent columns,
    does not contain 1, and is phi-invariant, as required by primedec_aux.
    Phi may have its source negative diagonal entries. Workspace spans of
    n*n hold H|1, M, inverse M, M2, Mi2, reduced phi, intermediate product,
    phi2, kernel, then 2*n*n+2*n scratch. Rectangular objects use their actual
    row strides, not padded n-strides. State is status, quotient dimension,
    kernel dimension. Scratch is not transactional after state becomes -1.
    """
    if n < 3 or n > 4 or rank < 0 or rank >= n or prime < 2 or prime > 3037000493:
        raise ValueError("small quotient projection domain")
    size = n * n
    if (
        len(ideal) < n * rank
        or len(phi) < size
        or len(workspace) < 11 * size + 2 * n
        or len(state) < 3
    ):
        raise ValueError("short quotient projection storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    for i in range(n * rank):
        workspace[i] = ideal[i] % prime
    for i in range(n):
        workspace[n * rank + i] = 0
    workspace[n * rank] = 1
    pari_small_prime_matrix_supplement(workspace, 0, n, rank + 1, prime, size, 9 * size)
    status = pari_small_prime_matrix_inverse(
        workspace, size, n, prime, 2 * size, 9 * size
    )
    if status != 0:
        raise ValueError("singular quotient completion")
    dimension = n - rank
    for j in range(dimension):
        for i in range(n):
            workspace[3 * size + j * n + i] = workspace[size + (rank + j) * n + i]
    for j in range(n):
        for i in range(dimension):
            workspace[4 * size + j * dimension + i] = workspace[
                2 * size + j * n + rank + i
            ]
    for i in range(size):
        workspace[5 * size + i] = phi[i] % prime
    pari_small_fp_rectangular_product(
        workspace, 5 * size, 3 * size, 6 * size, n, n, dimension, prime
    )
    pari_small_fp_rectangular_product(
        workspace, 4 * size, 6 * size, 7 * size, dimension, n, dimension, prime
    )
    count = pari_small_prime_matrix_kernel(
        workspace, 7 * size, dimension, dimension, prime, 8 * size, 9 * size
    )
    state[0] = 0
    state[1] = dimension
    state[2] = count
    return count
