"""PARI 2.17.4 trans1.c abpq_sum with an explicit resident traversal stack.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Split points, small cases and arithmetic association follow the upstream body.
"""

from math import log2

from sagejs.native import IntegerBuffer, checked_float64, native

from .real_conversion import pari_rational_to_real


@native
def pari_abpq_sum(
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    first: int,
    last: int,
    stack: IntegerBuffer,
) -> tuple[int, int, int, int]:
    """Return P,Q,B,T for the half-open upstream interval [first,last).

    Seven stack entries per frame hold bounds, traversal state and the left
    child's four results. The 4096-term boundary needs at most 13 frames.
    Input buffers and scratch must be distinct; no input is mutated.
    """
    if first < 0 or last <= first or last - first > 4096:
        raise ValueError("unsupported binary splitting interval")
    if last > len(a) or last > len(b) or last > len(p) or last > len(q):
        raise ValueError("binary splitting input exhausted")
    if len(stack) < 91:
        raise ValueError("binary splitting stack requires 91 entries")
    stack[0] = first
    stack[1] = last
    stack[2] = 0
    depth = 0
    rp = 0
    rq = 0
    rb = 0
    rt = 0
    while depth >= 0:
        base = depth * 7
        low = stack[base]
        high = stack[base + 1]
        state = stack[base + 2]
        count = high - low
        if state == 0:
            if count == 1:
                rp = p[low]
                rq = q[low]
                rb = b[low]
                rt = a[low] * p[low]
                depth -= 1
            elif count == 2:
                rp = p[low] * p[low + 1]
                rq = q[low] * q[low + 1]
                rb = b[low] * b[low + 1]
                left = (a[low] * b[low + 1]) * q[low + 1]
                right = (b[low] * a[low + 1]) * p[low + 1]
                rt = p[low] * (left + right)
                depth -= 1
            elif count == 3:
                tail_q = q[low + 1] * q[low + 2]
                tail_b = b[low + 1] * b[low + 2]
                rp = (p[low] * p[low + 1]) * p[low + 2]
                rq = q[low] * tail_q
                rb = b[low] * tail_b
                left = (tail_b * tail_q) * a[low]
                tail_left = (a[low + 1] * b[low + 2]) * q[low + 2]
                tail_right = (b[low + 1] * a[low + 2]) * p[low + 2]
                tail = p[low + 1] * (tail_left + tail_right)
                right = b[low] * tail
                rt = p[low] * (left + right)
                depth -= 1
            else:
                stack[base + 2] = 1
                depth += 1
                stack[base + 7] = low
                stack[base + 8] = (low + high) >> 1
                stack[base + 9] = 0
        elif state == 1:
            stack[base + 3] = rp
            stack[base + 4] = rq
            stack[base + 5] = rb
            stack[base + 6] = rt
            stack[base + 2] = 2
            depth += 1
            stack[base + 7] = (low + high) >> 1
            stack[base + 8] = high
            stack[base + 9] = 0
        else:
            left = (rb * rq) * stack[base + 6]
            right = (stack[base + 5] * stack[base + 3]) * rt
            rp = stack[base + 3] * rp
            rq = stack[base + 4] * rq
            rb = stack[base + 5] * rb
            rt = left + right
            depth -= 1
    return rp, rq, rb, rt


@native
def pari_atanhuu(
    u: int,
    v: int,
    precision: int,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """Follow trans2.c atanhuu term selection, splitting and real conversion.

    Inputs are restricted to exactly convertible positive binary64 integers.
    Caller-owned coefficient arrays and traversal scratch must be disjoint.
    Their entries must have enough integer capacity for intermediate products.
    """
    if u <= 0 or v <= u or v > 9007199254740992:
        raise ValueError("unsupported atanhuu rational argument")
    # A 2,368-bit log(2) request retains PARI's extra series guard word.
    if precision < 64 or precision > 2432 or precision % 64 != 0:
        raise ValueError("unsupported atanhuu precision")
    d = 2.0 * log2(checked_float64(v) / checked_float64(u))
    if d == 0.0:
        raise ValueError("atanhuu term selection overflow")
    target = checked_float64(precision) / d
    if target > 4096.0:
        raise ValueError("atanhuu term boundary exceeded")
    nmax = int(target)
    if checked_float64(nmax) < target:
        nmax += 1
    if len(a) <= nmax or len(b) <= nmax or len(p) <= nmax or len(q) <= nmax:
        raise ValueError("atanhuu coefficient storage exhausted")
    u2 = u * u
    v2 = v * v
    a[0] = 1
    b[0] = 1
    p[0] = u
    q[0] = v
    i = 1
    while i <= nmax:
        a[i] = 1
        b[i] = 2 * i + 1
        p[i] = u2
        q[i] = v2
        i += 1
    rp, rq, rb, rt = pari_abpq_sum(a, b, p, q, 0, nmax, stack)
    return pari_rational_to_real(rt, rb * rq, precision)
