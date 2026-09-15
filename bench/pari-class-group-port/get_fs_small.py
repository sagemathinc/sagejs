"""PARI 2.17.4 polynomial-to-prime-degree patterns, initial small domain.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This is an upstream-assumed experimental translation of `buch2.c:get_fs`,
not an independent class-group certificate or a general prime decomposition.
"""

from sagejs.native import IntegerBuffer, native

from .flx_small_factor import (
    pari_flx_small_degfact,
    pari_flx_small_factor_workspace_size,
)


@native
def pari_get_fs_small(
    coefficients: IntegerBuffer,
    degree: int,
    equation_index: int,
    prime: int,
    workspace: IntegerBuffer,
    factor_degrees: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    degrees: IntegerBuffer,
    counts: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Derive splitting-degree counts without supplied modular factors.

    Coefficients are low-to-high, monic, and exact. The caller supplies a
    rational prime; primality is not recomputed inside this source path.
    Every buffer owner is disjoint. State receives status, group count, and
    irreducible factor count. Success has status zero. Negative frontiers are
    characteristic two (-2), an index divisor (-3), degree outside 2--4 (-4),
    prime outside PARI's small-word corridor (-5), or short storage (-6).
    Frontier returns only change the three state entries, never the outputs.
    Invalid scalar inputs raise before mutation. Unexpected internal failure
    may mutate scratch and leaves status -1, not a published result.

    Counts ignore factorization exponents exactly as upstream `get_fs` does.
    Repeated factors must still be found by the squarefree factorization path.
    This routine alone cannot supply all primes needed by analytic preparation.
    """
    if len(state) < 3:
        raise ValueError("short get_fs state")
    if prime < 2 or equation_index < 1:
        raise ValueError("invalid get_fs scalar input")
    status = 0
    if prime == 2:
        status = -2
    elif equation_index % prime == 0:
        status = -3
    elif degree < 2 or degree > 4:
        status = -4
    elif prime > 3037000493:
        status = -5
    elif (
        len(coefficients) < degree + 1
        or len(workspace) < 9 + pari_flx_small_factor_workspace_size()
        or len(factor_degrees) < degree
        or len(factor_exponents) < degree
        or len(degrees) < degree
        or len(counts) < degree
    ):
        status = -6
    if status != 0:
        state[0] = status
        state[1] = 0
        state[2] = 0
        return status
    if coefficients[degree] != 1:
        raise ValueError("get_fs requires a monic defining polynomial")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    # ZX_to_Flx, with the monic normalization already an input invariant.
    for i in range(degree + 1):
        workspace[i] = coefficients[i] % prime
    number = pari_flx_small_degfact(
        workspace, 0, degree, prime, factor_degrees, factor_exponents, 9
    )
    # Literal grouping of the sorted degree vector, not exponent sums.
    f = factor_degrees[0]
    n = 1
    k = 0
    for j in range(1, number):
        if factor_degrees[j] == f:
            n += 1
        else:
            counts[k] = n
            degrees[k] = f
            k += 1
            f = factor_degrees[j]
            n = 1
    counts[k] = n
    degrees[k] = f
    k += 1
    state[0] = 0
    state[1] = k
    state[2] = number
    return 0
