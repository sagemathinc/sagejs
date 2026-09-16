"""PARI 2.17.4 quotient multiplication-table minimal polynomial.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate `base2.c:get_powers/pol_min` and `FpV.c:FpM_FpC_mul_i`.
The multiplication matrix is expressed in a quotient basis beginning with 1.
This is not a characteristic-polynomial substitution or full-kernel shortcut.
"""

from sagejs.native import IntegerBuffer, native
from .small_prime_matrix_kernel import pari_small_prime_matrix_dependence


@native
def pari_small_quotient_minpoly(
    matrix: IntegerBuffer,
    dimension: int,
    prime: int,
    workspace: IntegerBuffer,
    coefficients: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    """Return degree, publishing only the active low-to-high coefficients.

    Matrix is column-major with canonical residues; all owners are disjoint.
    Source get_powers constructs dimension+2 columns before first-dependence
    elimination. Workspace needs 2*dimension*(dimension+2)+4*dimension+4
    entries: powers, one temporary column, dependence vector, kernel scratch.
    Diagnostics hold matrix-vector call count and first dependent column
    (one-based). Bounds fail before writes; arithmetic failures may alter
    scratch without publishing a polynomial.
    """
    n = dimension
    if n < 1 or n > 4 or prime < 2 or prime > 3037000493:
        raise ValueError("small quotient minimal polynomial domain")
    columns = n + 2
    size = n * columns
    if (
        len(matrix) < n * n
        or len(workspace) < 2 * size + 4 * n + 4
        or len(coefficients) < columns
        or len(diagnostic) < 2
    ):
        raise ValueError("short quotient minimal polynomial storage")
    temporary = size
    relation = temporary + n
    scratch = relation + columns
    diagnostic[0] = 0
    diagnostic[1] = 0
    for i in range(n):
        workspace[i] = 0
        workspace[n + i] = matrix[i]
    workspace[0] = 1
    for exponent in range(1, n + 1):
        # FpM_FpC_mul: integer dot product, then one reduction per row.
        # In particular this does not dispatch through Flm matrix multiply.
        for i in range(n):
            total = matrix[i] * workspace[exponent * n]
            for k in range(1, n):
                term = matrix[k * n + i] * workspace[exponent * n + k]
                if term != 0:
                    total += term
            workspace[temporary + i] = total % prime
        for i in range(n):
            workspace[(exponent + 1) * n + i] = workspace[temporary + i]
        diagnostic[0] += 1
    first = pari_small_prime_matrix_dependence(
        workspace, 0, n, columns, prime, relation, scratch
    )
    if first == 0:
        raise ValueError("quotient powers unexpectedly independent")
    # RgV_to_RgX removes trailing zeros from the full dependence vector.
    last = columns
    while last > 0 and workspace[relation + last - 1] == 0:
        last -= 1
    if last == 0:
        raise ValueError("zero quotient power dependence")
    for i in range(last):
        coefficients[i] = workspace[relation + i]
    diagnostic[1] = first
    return last - 1
