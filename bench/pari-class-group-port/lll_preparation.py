"""PARI 2.17.4 lll.c adaptive Gram-Schmidt preparation for FLATTER.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The integer basis is square and nonsingular. Precision above the existing
512-bit QR capability returns an explicit unresolved status, not a new bound.
"""

from sagejs.native import IntegerBuffer, native
from .householder import pari_prepared_qr, pari_qr_load, pari_qr_store
from .real_conversion import pari_integer_to_real


@native
def pari_lll_exponent(matrix: IntegerBuffer, slot: int) -> int:
    m, p, e = pari_qr_load(matrix, slot)
    if p == -1:
        if m == 0:
            return -(1 << 61)  # Pinned 64-bit PARI -HIGHEXPOBIT.
        return abs(m).bit_length() - 1
    return e


@native
def pari_lll_extra_precision(matrix: IntegerBuffer, n: int, y: IntegerBuffer) -> int:
    """GS_extraprec on an upper triangle (the stored transpose of QR's L)."""
    low = pari_lll_exponent(matrix, 0)
    high = low
    maximum = low
    for i in range(n * n):
        e = pari_lll_exponent(matrix, i)
        if e > maximum:
            maximum = e
    for i in range(n):
        if matrix[3 * (i * n + i)] == 0:
            raise ValueError("singular Gram-Schmidt diagonal")
        e = pari_lll_exponent(matrix, i * n + i)
        if e < low:
            low = e
        if e > high:
            high = e
    y[n - 1] = -pari_lll_exponent(matrix, n * n - 1)
    bound = y[n - 1]
    i = n - 2
    while i >= 0:
        s = 0
        for j in range(i + 1, n):
            e = pari_lll_exponent(matrix, i * n + j) + y[j]
            if e > s:
                s = e
        y[i] = s - pari_lll_exponent(matrix, i * n + i)
        if y[i] > bound:
            bound = y[i]
        i -= 1
    spread = high - low
    condition = maximum + bound
    first = 2 * spread + 2 * n
    second = condition - spread - 2 * n
    if second > first:
        return second
    return first


@native
def pari_lll_gramschmidt(
    basis: IntegerBuffer,
    n: int,
    matrix: IntegerBuffer,
    result: IntegerBuffer,
    vectors: IntegerBuffer,
    betas: IntegerBuffer,
    norms: IntegerBuffer,
    column: IntegerBuffer,
    y: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    """gramschmidt_dynprec; return 1 on success, 2 for unported precision.

    Diagnostic slots are attempt count, requested bits before word rounding,
    and actual bits. Inputs and scratch buffers must not alias.
    """
    if n < 1 or n > 10 or len(basis) != n * n:
        raise ValueError("unsupported LLL preparation shape")
    if len(matrix) < 3 * n * n or len(result) < 3 * n * n:
        raise ValueError("LLL preparation matrix storage too small")
    if len(y) < n or len(diagnostic) < 3:
        raise ValueError("LLL preparation diagnostic storage too small")
    upper = 1
    for i in range(n):
        for j in range(i):
            if basis[i * n + j] != 0:
                upper = 0
    minimum = n + 31
    requested = minimum
    diagnostic[0] = 0
    if upper:
        for i in range(n * n):
            pari_qr_store(matrix, i, basis[i], -1, 0)
        requested += pari_lll_extra_precision(matrix, n, y)
    while True:
        precision = ((requested + 63) // 64) * 64
        diagnostic[1] = requested
        diagnostic[2] = precision
        if precision > 512:
            return 2
        diagnostic[0] += 1
        for i in range(n * n):
            m, p, e = pari_integer_to_real(basis[i], precision)
            pari_qr_store(matrix, i, m, p, e)
        if upper:
            for i in range(3 * n * n):
                result[i] = matrix[i]
            return 1
        success = pari_prepared_qr(
            matrix, n, precision, result, vectors, betas, norms, column
        )
        for i in range(n):
            if result[3 * (i * n + i)] == 0:
                success = 0
        if not success:
            requested *= 2
        else:
            needed = minimum + pari_lll_extra_precision(result, n, y)
            if requested >= needed:
                return 1
            requested = (4 * requested) // 3
            if needed > requested:
                requested = needed
