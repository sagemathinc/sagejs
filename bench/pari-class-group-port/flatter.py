"""PARI 2.17.4 lll.c:flat/ZM_flatter for cubic/quartic basis preparation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The selected dimensions split into the already translated 1D/2D LLL leaves.
This is FLATTER preparation, not the subsequent verified LLL dispatcher.
"""

from sagejs.native import IntegerBuffer, native
from .householder import pari_qr_load, pari_qr_store
from .lll_preparation import pari_lll_gramschmidt, pari_lll_exponent
from .lll_rescale import pari_lll_binary_block
from .lll_sizered import pari_lll_sizered


@native
def pari_flatter_store4(a: IntegerBuffer, w: int, x: int, y: int, z: int) -> int:
    a[0] = w
    a[1] = x
    a[2] = y
    a[3] = z
    return 0


@native
def pari_flatter_product(
    left: IntegerBuffer, right: IntegerBuffer, n: int, out: IntegerBuffer
) -> int:
    for i in range(n):
        for j in range(n):
            value = 0
            for k in range(n):
                value += left[i * n + k] * right[k * n + j]
            out[i * n + j] = value
    return 0


@native
def pari_flatter(
    basis: IntegerBuffer,
    n: int,
    current: IntegerBuffer,
    transform: IntegerBuffer,
    total_work: IntegerBuffer,
    step_t: IntegerBuffer,
    step_s: IntegerBuffer,
    product: IntegerBuffer,
    next_basis: IntegerBuffer,
    qr_input: IntegerBuffer,
    qr: IntegerBuffer,
    vectors: IntegerBuffer,
    betas: IntegerBuffer,
    norms: IntegerBuffer,
    column: IntegerBuffer,
    y: IntegerBuffer,
    diagnostic: IntegerBuffer,
    r1: IntegerBuffer,
    r2: IntegerBuffer,
    r3: IntegerBuffer,
    t1: IntegerBuffer,
    t2: IntegerBuffer,
    t3: IntegerBuffer,
    integers: IntegerBuffer,
    inverse: IntegerBuffer,
    first: IntegerBuffer,
    second: IntegerBuffer,
    final: IntegerBuffer,
    rounded: IntegerBuffer,
) -> int:
    """ZM_flatter with LLL_IM, no keep-first; 1 success, 2 unresolved QR.

    All buffers are independent. Square buffers have exactly n*n entries;
    real blocks have 12, integer blocks 4. Diagnostic slots after the QR's
    three slots hold attempted steps, accepted steps, last drop, stop reason.
    """
    if n != 3 and n != 4:
        raise ValueError("FLATTER experiment supports degree three or four")
    if len(basis) != n * n or len(current) != n * n or len(product) != n * n:
        raise ValueError("FLATTER basis shape mismatch")
    if len(diagnostic) < 7 or len(r1) != 12 or len(r2) != 12 or len(r3) != 12:
        raise ValueError("FLATTER block or diagnostic shape mismatch")
    for i in range(3, 7):
        diagnostic[i] = 0
    for i in range(n * n):
        current[i] = basis[i]
        transform[i] = 0
    for i in range(n):
        transform[i * n + i] = 1
    previous_drop = -1
    previous_potential = 0
    left = n // 2
    right = n - left
    middle = left // 2
    while True:
        diagnostic[3] += 1
        status = pari_lll_gramschmidt(
            current, n, qr_input, qr, vectors, betas, norms, column, y, diagnostic
        )
        if status != 1:
            diagnostic[6] = 4
            return 2
        for i in range(left):
            for j in range(left):
                m, p, e = pari_qr_load(qr, i * n + j)
                pari_qr_store(r1, i * left + j, m, p, e)
            for j in range(right):
                m, p, e = pari_qr_load(qr, i * n + left + j)
                pari_qr_store(r2, i * right + j, m, p, e)
        for i in range(right):
            for j in range(right):
                m, p, e = pari_qr_load(qr, (left + i) * n + left + j)
                pari_qr_store(r3, i * right + j, m, p, e)
        if left == 1:
            t1[0] = 1
        else:
            a, b, c, d = pari_lll_binary_block(r1, integers)
            pari_flatter_store4(t1, a, b, c, d)
        a, b, c, d = pari_lll_binary_block(r3, integers)
        pari_flatter_store4(t3, a, b, c, d)
        pari_lll_sizered(
            t1, t3, r1, r2, left, right, inverse, first, second, final, rounded, t2
        )
        for i in range(n * n):
            step_t[i] = 0
            step_s[i] = 0
        for i in range(n):
            step_s[i * n + i] = 1
        for i in range(left):
            for j in range(left):
                step_t[i * n + j] = t1[i * left + j]
            for j in range(right):
                step_t[i * n + left + j] = t2[i * right + j]
        for i in range(right):
            for j in range(right):
                step_t[(left + i) * n + left + j] = t3[i * right + j]
        pari_flatter_product(current, step_t, n, product)
        status = pari_lll_gramschmidt(
            product, n, qr_input, qr, vectors, betas, norms, column, y, diagnostic
        )
        if status != 1:
            diagnostic[6] = 4
            return 2
        for i in range(right):
            for j in range(right):
                m, p, e = pari_qr_load(qr, (middle + i) * n + middle + j)
                pari_qr_store(r3, i * right + j, m, p, e)
        a, b, c, d = pari_lll_binary_block(r3, integers)
        pari_flatter_store4(t3, a, b, c, d)
        for i in range(right):
            for j in range(right):
                step_s[(middle + i) * n + middle + j] = t3[i * right + j]
        pari_flatter_product(product, step_s, n, next_basis)
        pari_flatter_product(step_t, step_s, n, total_work)
        # drop/potential use R computed before applying the middle transform.
        drop = 0
        maximum = pari_lll_exponent(qr, 0)
        potential = 0
        for i in range(n):
            exponent = pari_lll_exponent(qr, i * n + i)
            potential += (n - 1 - 2 * i) * exponent
            if i > 0:
                m, p, e = pari_qr_load(qr, i * n + i)
                v, q, f = pari_qr_load(qr, (i - 1) * n + i - 1)
                if e > f or (e == f and (abs(m) << q) >= (abs(v) << p)):
                    drop += maximum - f
                    maximum = e
        drop += maximum - pari_lll_exponent(qr, n * n - 1)
        diagnostic[5] = drop
        if drop == 0:
            diagnostic[6] = 1
            return 1
        if previous_drop >= 0:
            if previous_drop == drop and previous_potential >= potential:
                diagnostic[6] = 2
                return 1
            if previous_drop < drop and diagnostic[3] > 20:
                diagnostic[6] = 3
                return 1
        previous_drop = drop
        previous_potential = potential
        for i in range(n * n):
            current[i] = next_basis[i]
            step_t[i] = total_work[i]
        pari_flatter_product(transform, step_t, n, total_work)
        for i in range(n * n):
            transform[i] = total_work[i]
        diagnostic[4] += 1
