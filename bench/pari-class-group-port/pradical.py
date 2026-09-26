"""PARI 2.17.4 small-degree maximal-order p-radical preparation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Source `base2.c:pradical`, with a prepared integral multiplication table.
This produces a radical and x^p-x map, not prime-ideal descriptors. Dense
column-major owners replace GEN matrices and packed characteristic-two
columns; this representation difference is not a performance equivalence.
"""

from sagejs.native import IntegerBuffer, native

from .f2x_small import _f2x_xor
from .integral_frobenius import pari_integral_basis_frobenius
from .small_prime_matrix_kernel import pari_small_prime_matrix_kernel


@native
def pari_small_fp_matrix_product(
    workspace: IntegerBuffer, left: int, right: int, output: int, n: int, prime: int
) -> int:
    """Square entry sharing the literal rectangular classical multiply."""
    return pari_small_fp_rectangular_product(
        workspace, left, right, output, n, n, n, prime
    )


@native
def pari_small_fp_rectangular_product(
    workspace: IntegerBuffer,
    left: int,
    right: int,
    output: int,
    rows: int,
    inner: int,
    columns: int,
    prime: int,
) -> int:
    """FpM_mul small rectangular dispatch; all three spans are disjoint.

    Inputs are canonical residues. For odd primes, follow the classical
    SMALL_ULONG dot-product order, including HIGHBIT-triggered reductions.
    For p=2 retain selected-column copy/XOR order, using dense coefficients.
    """
    if (
        rows < 1
        or rows > 5
        or inner < 1
        or inner > 5
        or columns < 1
        or columns > 5
        or prime < 2
        or prime > 3037000493
    ):
        raise ValueError("small matrix product domain")
    if left < 0 or right < 0 or output < 0:
        raise ValueError("negative small matrix offset")
    if (
        left + rows * inner > len(workspace)
        or right + inner * columns > len(workspace)
        or output + rows * columns > len(workspace)
    ):
        raise ValueError("short small matrix product storage")
    for j in range(columns):
        if prime == 2:
            initialized = False
            for k in range(inner):
                if workspace[right + j * inner + k] == 0:
                    continue
                for i in range(rows):
                    value = workspace[left + k * rows + i]
                    if initialized:
                        value = _f2x_xor(workspace[output + j * rows + i], value)
                    workspace[output + j * rows + i] = value
                initialized = True
            if not initialized:
                for i in range(rows):
                    workspace[output + j * rows + i] = 0
        else:
            for i in range(rows):
                total = workspace[left + i] * workspace[right + j * inner]
                for k in range(1, inner):
                    total += (
                        workspace[left + k * rows + i]
                        * workspace[right + j * inner + k]
                    )
                    if total >= 9223372036854775808:
                        total %= prime
                workspace[output + j * rows + i] = total % prime
    return 0


@native
def pari_small_pradical(
    table: IntegerBuffer,
    n: int,
    prime: int,
    workspace: IntegerBuffer,
    temporary: IntegerBuffer,
    column: IntegerBuffer,
    power_diagnostic: IntegerBuffer,
    phi: IntegerBuffer,
    radical: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    """Return radical dimension and publish exact phi and active basis columns.

    All owners are disjoint. Matrix outputs are column-major. The prepared
    integral basis starts with 1; prime is a caller-verified rational prime.
    Workspace has 5*n*n+2*n slots. Diagnostics count plain square callbacks,
    square/multiply callbacks, matrix products, and final Frobenius exponent q.
    Invalid dimensions/storage fail before mutation; this internal dependency
    does not promise transactional scratch on arithmetic failure.
    """
    if n < 3 or n > 5 or prime < 2 or prime > 3037000493:
        raise ValueError("small pradical domain")
    size = n * n
    if (
        len(table) < n * size
        or len(workspace) < 5 * size + 2 * n
        or len(temporary) < n
        or len(column) < n
        or len(power_diagnostic) < 3
        or len(phi) < size
        or len(radical) < size
        or len(diagnostic) < 4
    ):
        raise ValueError("short pradical storage")
    diagnostic[0] = 0
    diagnostic[1] = 0
    diagnostic[2] = 0
    for j in range(n):
        pari_integral_basis_frobenius(
            table, n, j + 1, prime, temporary, column, power_diagnostic
        )
        diagnostic[0] += power_diagnostic[0]
        diagnostic[1] += power_diagnostic[1]
        for i in range(n):
            workspace[j * n + i] = column[i]
            workspace[size + j * n + i] = column[i]
    q = prime
    while q < n:
        q *= prime
        pari_small_fp_matrix_product(workspace, size, 0, 2 * size, n, prime)
        diagnostic[2] += 1
        for i in range(size):
            workspace[size + i] = workspace[2 * size + i]
    count = pari_small_prime_matrix_kernel(
        workspace, size, n, n, prime, 3 * size, 4 * size
    )
    for j in range(n):
        for i in range(n):
            value = workspace[j * n + i]
            if i == j:
                value -= 1
            phi[j * n + i] = value
    for i in range(n * count):
        radical[i] = workspace[3 * size + i]
    diagnostic[3] = q
    return count
