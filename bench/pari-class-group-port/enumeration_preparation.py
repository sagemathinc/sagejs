"""PARI 2.17.4 QR-to-Fincke--Pohst numerical preparation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Ideal construction and its LLL transform remain outside this boundary.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, native

from .float_conversion import pari_float_to_real, pari_real_to_float
from .householder import pari_prepared_householder, pari_qr_load, pari_qr_multiply
from .real_conversion import pari_integer_to_real
from .real_root import pari_real_root_abs


@native
def pari_store_double(m: int, p: int, e: int, output: Float64Buffer, index: int) -> int:
    """gisdouble including generic integer conversion and exponent rejection."""
    if p == -1:
        m, p, e = pari_integer_to_real(m, 64)
    if e >= 1023:
        return 0
    output[index] = pari_real_to_float(m, p, e)
    return 1


@native
def pari_fincke_pohst_bound(
    reduction: IntegerBuffer,
    n: int,
    scale: float,
    output: Float64Buffer,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> int:
    """Fincke_Pohst_bound; return the last root degree as a work counter.

    scale is upstream 4 * maxtry_FACT / ballvol. The first diagonal may be
    an exact integer; later comparison diagonals are real in this boundary.
    """
    if n < 2 or n > 10 or scale <= 0.0 or len(output) < 1:
        raise ValueError("unsupported enumeration bound input")
    tm, tp, te = pari_float_to_real(scale * scale)
    pm, pp, pe = pari_qr_load(reduction, 0)
    i = 1
    done = 0
    bm, bp, be = 1 << 63, 64, 0
    while i < n and done == 0:
        dm, dp, de = pari_qr_load(reduction, i * n + i)
        if dm <= 0 or dp < 0 or pm <= 0:
            raise ValueError("enumeration bound requires positive real diagonals")
        pm, pp, pe = pari_qr_multiply(pm, pp, pe, dm, dp, de)
        bm, bp, be = pari_qr_multiply(tm, tp, te, pm, pp, pe)
        bm, bp, be = pari_real_root_abs(bm, bp, be, i + 1, cache, a, b, p, q, stack)
        i += 1
        if i < n:
            dm, dp, de = pari_qr_load(reduction, i * n + i)
            if dm <= 0 or dp < 0:
                raise ValueError("enumeration bound requires positive real diagonals")
            if be < de:
                done = 1
            elif be == de and (bm << dp) < (dm << bp):
                done = 1
    output[0] = 0.0
    status = pari_store_double(bm, bp, be, output, 0)
    return i


@native
def pari_prepare_enumeration(
    matrix: IntegerBuffer,
    n: int,
    precision: int,
    scale: float,
    reduction: IntegerBuffer,
    vectors: IntegerBuffer,
    betas: IntegerBuffer,
    norms: IntegerBuffer,
    column: IntegerBuffer,
    float_q: Float64Buffer,
    float_v: Float64Buffer,
    bound: Float64Buffer,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> int:
    """Compute QR, converted coefficients and the final collector bound.

    Return -1 for QR precision failure, 0 for coefficient conversion rejection,
    otherwise the bound's last root degree. Float buffers use the existing
    cursor's one-based layout. All buffers are disjoint, caller-owned storage.
    """
    stride = n + 1
    if (
        n < 2
        or len(float_q) < stride * stride
        or len(float_v) < stride
        or len(bound) < 1
    ):
        raise ValueError("enumeration preparation storage too small")
    if (
        pari_prepared_householder(
            matrix, n, precision, reduction, vectors, betas, norms, column
        )
        == 0
    ):
        return -1
    for k in range(n):
        m, rp, e = pari_qr_load(reduction, k * n + k)
        if pari_store_double(m, rp, e, float_v, k + 1) == 0:
            return 0
        for j in range(k):
            m, rp, e = pari_qr_load(reduction, j * n + k)
            if pari_store_double(m, rp, e, float_q, (j + 1) * stride + k + 1) == 0:
                return 0
    last = pari_fincke_pohst_bound(reduction, n, scale, bound, cache, a, b, p, q, stack)
    b1 = float_v[1]
    q12 = float_q[stride + 2]
    b2 = float_v[2] + b1 * q12 * q12
    if 2.0 * b2 > bound[0]:
        bound[0] = 2.0 * b2
    return last
