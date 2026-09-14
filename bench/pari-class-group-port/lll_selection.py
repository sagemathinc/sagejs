"""PARI 2.17.4 `ZM_lll_norms` FLATTER selection for full-rank degrees 3/4.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Rank is supplied at this explicit boundary; computing it is not omitted from
the eventual driver. Row-major storage matches the existing QR/FLATTER port.
"""

from sagejs.native import IntegerBuffer, native

from .householder import pari_prepared_qr, pari_qr_store
from .lll_preparation import pari_lll_exponent
from .real_conversion import pari_integer_to_real


@native
def pari_lll_select_full_rank(
    basis: IntegerBuffer,
    n: int,
    rank: int,
    keep_first: bool,
    matrix: IntegerBuffer,
    reduction: IntegerBuffer,
    vectors: IntegerBuffer,
    betas: IntegerBuffer,
    norms: IntegerBuffer,
    column: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> tuple[int, int, int]:
    """Return (useflatter, is_upper, is_lower), or useflatter=-1 if unported.

    This is the LLL_IM basis path, without NOFLATTER/UPPER overrides. Supplied
    rank differing from n leaves the augmented-rank selector explicitly open.
    All buffers are independent; QR storage follows `pari_prepared_qr`.
    Diagnostic slots: QR status (-1 if not called), threshold branch taken,
    size, threshold, spread. Size/threshold/spread are undefined unless taken.
    """
    if (n != 3 and n != 4) or len(basis) != n * n or len(diagnostic) < 5:
        raise ValueError("unsupported LLL selector boundary")
    upper = 1
    for i in range(n):
        for j in range(i):
            if basis[i * n + j] != 0:
                upper = 0
    lower = 0
    if upper == 0 and not keep_first:
        lower = 1
        for i in range(n):
            for j in range(i):
                if basis[j * n + i] != 0:
                    lower = 0
    diagnostic[0] = -1
    diagnostic[1] = 0
    if rank != n:
        return -1, upper, lower
    knapsack = 0
    if upper != 0 or lower != 0:
        knapsack = 1
        for i in range(n):
            for j in range(n):
                value = basis[i * n + j]
                if lower != 0:
                    value = basis[(n - 1 - i) * n + n - 1 - j]
                pari_qr_store(reduction, i * n + j, value, -1, 0)
                if i > 0 and i != j and value != 0:
                    knapsack = 0
    else:
        # get_gramschmidt starts at ceil((3*n+30)/64)*64 bits, NOT the
        # adaptive FLATTER Gram-Schmidt precision used after this selector.
        precision = ((3 * n + 30 + 63) // 64) * 64
        for i in range(n * n):
            m, p, e = pari_integer_to_real(basis[i], precision)
            pari_qr_store(matrix, i, m, p, e)
        status = pari_prepared_qr(
            matrix, n, precision, reduction, vectors, betas, norms, column
        )
        diagnostic[0] = status
        if status == 0:
            return 1, upper, lower
        for i in range(n):
            if reduction[3 * (i * n + i)] == 0:
                return 1, upper, lower
    low = pari_lll_exponent(reduction, 0)
    high = low
    for i in range(1, n):
        exponent = pari_lll_exponent(reduction, i * n + i)
        if exponent < low:
            low = exponent
        if exponent > high:
            high = exponent
    size = pari_lll_exponent(reduction, 0)
    for i in range(1, n * n):
        exponent = pari_lll_exponent(reduction, i)
        if exponent > size:
            size = exponent
    threshold = 31783
    if n == 4:
        threshold = 34393
    if knapsack != 0:
        threshold = 23280
        if n == 4:
            threshold = 30486
    diagnostic[1] = 1
    diagnostic[2] = size
    diagnostic[3] = threshold
    diagnostic[4] = high - low
    if size >= threshold:
        return 1, upper, lower
    return 0, upper, lower
