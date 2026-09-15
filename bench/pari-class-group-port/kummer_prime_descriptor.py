"""PARI 2.17.4 `base2.c:idealprimedec_kummer`, prepared nf boundary.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Factorization is not performed here. The input is an actual monic factor and
its multiplicity at a prime not dividing the equation index. Prepared integral
basis matrices are exact. Rational polynomial coefficients use separate
numerator/denominator slots instead of generic PARI objects; content is taken
in the source's descending coefficient order. This representation mapping is
not a claim of identical generic-arithmetic instruction counts.
"""

from math import gcd
from sagejs.native import IntegerBuffer, native
from .flx_small import pari_flx_div
from .integral_frobenius import pari_integral_basis_multiply
from .kummer_resultant import pari_kummer_resultant_valuation


@native
def _kummer_center(x: int, p: int) -> int:
    r = abs(x) % p
    if x < 0:
        r = -r
    if r > p // 2:
        r -= p
    elif r < -(p // 2):
        r += p
    return r


@native
def _kummer_poltobasis(
    invzk: IntegerBuffer,
    polynomial: IntegerBuffer,
    offset: int,
    degree: int,
    n: int,
    p: int,
    out: IntegerBuffer,
) -> int:
    """Integer polynomial ZM_ZX_mul followed by signed centermod."""
    for i in range(n):
        out[i] = invzk[i] * polynomial[offset]
    for j in range(1, degree + 1):
        c = polynomial[offset + j]
        if c != 0:
            for i in range(n):
                out[i] += invzk[j * n + i] * c
    for i in range(n):
        out[i] = _kummer_center(out[i], p)
    return 0


@native
def pari_prepared_kummer_prime_descriptor(
    polynomial: IntegerBuffer,
    invzk: IntegerBuffer,
    zk: IntegerBuffer,
    zk_degrees: IntegerBuffer,
    table: IntegerBuffer,
    factor: IntegerBuffer,
    n: int,
    degree: int,
    e: int,
    p: int,
    zkden: int,
    polywork: IntegerBuffer,
    u: IntegerBuffer,
    t: IntegerBuffer,
    rational: IntegerBuffer,
    primitive: IntegerBuffer,
    column: IntegerBuffer,
    resultant_work: IntegerBuffer,
    resultant_trace: IntegerBuffer,
    u_output: IntegerBuffer,
    tau_output: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Publish descriptor u/tau and twelve state entries on success.

    State: status,p,e,f,inert,corrected,cwPresent,cwNumerator,cwDenominator,
    primitiveDegree,v,resultantValuation. Inert tau is scalar one, represented
    by inert=1 and tau_output[0]=1 (remaining tau slots untouched). Unexecuted
    correction diagnostics are zero except primitiveDegree=-1. Primitive is
    diagnostic scratch, not an input. All owners are disjoint; output owners
    stay unchanged on mathematical failure; state/scratch may be partial after
    preflight. Publication is not transactional against resource exhaustion.

    invzk and zk are column-major n-square matrices. Column j of zk stores
    ascending coefficients of zkprimpart[j], whose degree is zk_degrees[j].
    polywork requires36, rational2*n, resultant_work n*n+n, trace25 entries.
    """
    if n < 3 or n > 4 or degree < 1 or degree > n or e < 1:
        raise ValueError("Kummer descriptor degree frontier")
    if p < 2 or p > 3037000493 or zkden <= 0:
        raise ValueError("Kummer descriptor prime/denominator frontier")
    if (
        len(polynomial) < n + 1
        or len(invzk) < n * n
        or len(zk) < n * n
        or len(zk_degrees) < n
        or len(table) < n * n * n
        or len(factor) < degree + 1
        or len(polywork) < 36
        or len(u) < n
        or len(t) < n
        or len(rational) < 2 * n
        or len(primitive) < n
        or len(column) < n
        or len(resultant_work) < n * n + n
        or len(resultant_trace) < 25
        or len(u_output) < n
        or len(tau_output) < n * n
        or len(state) < 12
    ):
        raise ValueError("short Kummer descriptor storage")
    if polynomial[n] != 1 or factor[degree] != 1:
        raise ValueError("nonmonic Kummer descriptor polynomial")
    for i in range(degree + 1):
        if factor[i] < 0 or factor[i] >= p:
            raise ValueError("noncanonical Kummer factor")
    for i in range(n):
        if zk_degrees[i] < 0 or zk_degrees[i] >= n:
            raise ValueError("invalid Kummer basis degree")
    state[0] = -1
    for i in range(1, 12):
        state[i] = 0
    state[9] = -1
    if degree == n:
        for i in range(n):
            u_output[i] = 0
        u_output[0] = p
        tau_output[0] = 1
        state[1] = p
        state[2] = e
        state[3] = degree
        state[4] = 1
        state[0] = 0
        return 0
    # FpX_divrem_basecase maps word p (including 2) to Flx_divrem.
    for i in range(9):
        polywork[i] = 0
        polywork[9 + i] = 0
    for i in range(n + 1):
        polywork[i] = polynomial[i] % p
    for i in range(degree + 1):
        polywork[9 + i] = factor[i]
    quotient_degree = pari_flx_div(polywork, 0, n, 9, degree, p, 18, 27)
    _kummer_poltobasis(invzk, polywork, 18, quotient_degree, n, p, t)
    _kummer_poltobasis(invzk, factor, 0, degree, n, p, u)
    if e == 1:
        scalar = 1
        for i in range(1, n):
            if u[i] != 0:
                scalar = 0
        if scalar != 0:
            rational[0] = u[0]
            rational[n] = 1
            dw = 0
        else:
            # RgV_RgC_mul preserves ascending basis-column order; fixed
            # polynomial slots replace generic polynomial multiplication/add.
            for i in range(n):
                rational[i] = 0
            for j in range(n):
                if u[j] != 0:
                    for i in range(zk_degrees[j] + 1):
                        rational[i] += zk[j * n + i] * u[j]
            dw = n - 1
            while dw >= 0 and rational[dw] == 0:
                dw -= 1
            for i in range(dw + 1):
                rational[n + i] = 1
                if zkden != 1:
                    g = gcd(abs(rational[i]), zkden)
                    rational[i] //= g
                    rational[n + i] = zkden // g
        if dw < 0 or (dw == 0 and rational[0] == 0):
            raise ValueError("zero Kummer correction polynomial")
        # Q_content_v starts with the leading coefficient and descends.
        cn = abs(rational[dw])
        cd = rational[n + dw]
        for i in range(dw - 1, -1, -1):
            a = abs(rational[i])
            b = rational[n + i]
            if cd == 1:
                if b == 1:
                    cn = gcd(cn, a)
                elif cn == 0:
                    cn = a
                    cd = b
                else:
                    cn = gcd(cn, a)
                    cd = b
            elif b == 1:
                if a != 0:
                    cn = gcd(cn, a)
            else:
                cn = gcd(cn, a)
                cd = (cd // gcd(cd, b)) * b
        present = 1
        if cn == 1 and cd == 1:
            present = 0
        for i in range(dw + 1):
            if present == 0:
                primitive[i] = rational[i]
            elif cd == 1:
                primitive[i] = rational[i] // cn
            elif cn == 1:
                if rational[n + i] == 1:
                    primitive[i] = rational[i] * cd
                else:
                    primitive[i] = rational[i] * (cd // rational[n + i])
            else:
                if rational[n + i] == 1:
                    primitive[i] = (rational[i] // cn) * cd
                else:
                    primitive[i] = (rational[i] // cn) * (cd // rational[n + i])
        state[6] = present
        state[7] = cn
        state[8] = cd
        state[9] = dw
        v = degree
        if present != 0:
            a = cn
            b = cd
            valuation = 0
            while a % p == 0:
                a //= p
                valuation += 1
            while b % p == 0:
                b //= p
                valuation -= 1
            v -= valuation * n
        state[10] = v
        rv = pari_kummer_resultant_valuation(
            polynomial, primitive, n, dw, p, v + 1, resultant_work, resultant_trace
        )
        state[11] = rv
        if rv > v:
            if u[0] > 0:
                u[0] -= p
            else:
                u[0] += p
            state[5] = 1
    # zk_multable first column aliases t upstream; publish a detached copy.
    for i in range(n):
        tau_output[i] = t[i]
    for j in range(1, n):
        pari_integral_basis_multiply(table, t, n, j + 1, column)
        for i in range(n):
            tau_output[j * n + i] = column[i]
    for i in range(n):
        u_output[i] = u[i]
    state[1] = p
    state[2] = e
    state[3] = degree
    state[0] = 0
    return 0
