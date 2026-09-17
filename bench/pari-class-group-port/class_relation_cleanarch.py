"""PARI 2.17.4 class-relation `cleanarch` and retry boundary.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the totally-real cubic specialization reached by `buch2.c:4178-4190`.
Packed triples encode a PARI real as mantissa, bit precision, and exponent.
The caller supplies detached scratch storage: a successful cleanup publishes
all columns, while the retry decision only updates driver metadata and cannot
expose a partly normalized class-relation matrix.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .integer_real_product import pari_integer_real_product
from .log_matrix_transform import pari_validate_log_entries
from .pi_constant import pari_pi_constant
from .real_division import pari_real_division
from .short_product import (
    pari_real_integer_division,
    pari_short_product,
    pari_signed_real_sum,
)


@native
def pari_cleanarch_totally_real_cubic(
    source: IntegerBuffer,
    columns: int,
    precision: int,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    scratch: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Normalize real cubic class logarithms and publish transactionally.

    This is `cleanarch` with `N = R1 = RU = 3`, so each column receives
    `-sum(column)/3`. The imaginary-reduction branches are absent because all
    three embeddings are real. `state` is status, completed scratch columns,
    published columns, and source maximum exponent.
    """
    if columns < 0:
        raise ValueError("negative cleanarch column count")
    size = 21 * columns
    if (
        len(source) < size
        or len(scratch) < size
        or len(output) < size
        or len(state) < 4
    ):
        raise ValueError("short cleanarch storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = -(1 << 62)
    pari_validate_log_entries(source, 3 * columns)
    pm, pp, pe = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
    one = 1 << (pp - 1)
    im, ip, ie = pari_real_division(one, pp, 0, pm, pp, pe)
    # `setexpo(ipi, -3)` and `Pi2n(1, prec)` in cleanarch.
    ie = -3
    pi2m, pi2p, pi2e = pm, pp, pe + 1
    for column in range(columns):
        base = 21 * column
        sm = source[base + 1]
        sp = source[base + 2]
        se = source[base + 3]
        for row in range(3):
            at = base + 7 * row
            m = source[at + 1]
            rp = source[at + 2]
            e = source[at + 3]
            if rp < 0:
                raise ValueError("class logarithm real part must be packed")
            if m != 0:
                if rp < 64 or rp > 4352 or rp % 64 != 0:
                    raise ValueError("unsupported class-log precision")
                if abs(m).bit_length() != rp:
                    raise ValueError("unnormalized class logarithm")
                if e > state[3]:
                    state[3] = e
            if row != 0:
                sm, sp, se = pari_signed_real_sum(sm, sp, se, m, rp, e)
        sm, sp, se = pari_real_integer_division(-3, sm, sp, se)
        for row in range(3):
            at = base + 7 * row
            rm, rp, re = pari_signed_real_sum(
                source[at + 1], source[at + 2], source[at + 3], sm, sp, se
            )
            xm = source[at + 4]
            xp = source[at + 5]
            xe = source[at + 6]
            if xm != 0:
                qm, qp, qe = pari_short_product(xm, xp, xe, im, ip, ie)
                if qe >= 0 and ((qe + 64) // 64) * 64 > qp:
                    state[0] = 1
                    return 1
                shift = qp - qe - 1
                if shift >= 0:
                    quotient = qm // (1 << shift)
                else:
                    quotient = qm << -shift
                if quotient != 0:
                    tm, tp, te = pari_integer_real_product(quotient, pi2m, pi2p, pi2e)
                    xm, xp, xe = pari_signed_real_sum(xm, xp, xe, -tm, tp, te)
            scratch[at] = 2
            scratch[at + 1] = rm
            scratch[at + 2] = rp
            scratch[at + 3] = re
            scratch[at + 4] = xm
            scratch[at + 5] = xp
            scratch[at + 6] = xe
            if xm == 0:
                scratch[at] = 1
                scratch[at + 4] = 0
                scratch[at + 5] = -1
                scratch[at + 6] = 0
        state[1] = column + 1
    # PARI constructs a detached result first. Mirror that ownership boundary:
    # no caller-visible result changes until every column has normalized.
    for i in range(size):
        output[i] = scratch[i]
    state[2] = columns
    state[0] = 0
    return 0


@native
def pari_cleanarch_retry_action(
    source: IntegerBuffer,
    value_count: int,
    current_precision: int,
    state: Int64Buffer,
) -> int:
    """Apply exactly the `cleanarch == NULL` precision action.

    `state` receives status, old precision, new precision, added precision,
    `gexpo(C0)`, and `gprecision(C0)`. Precision values use PARI's current
    bit-precision ABI. This function is called only after the cleanup leaf has
    failed; it never mutates the candidate matrix.
    """
    if value_count < 1 or current_precision < 64:
        raise ValueError("invalid cleanarch retry input")
    if len(source) < 7 * value_count or len(state) < 6:
        raise ValueError("short cleanarch retry storage")
    maximum_exponent = -(1 << 62)
    minimum_precision = 1 << 62
    for i in range(value_count):
        at = 7 * i
        kind = source[at]
        for part in range(kind):
            m = source[at + 1 + 3 * part]
            packed_precision = source[at + 2 + 3 * part]
            e = source[at + 3 + 3 * part]
            if packed_precision >= 0 and m != 0:
                if e > maximum_exponent:
                    maximum_exponent = e
                if packed_precision < minimum_precision:
                    minimum_precision = packed_precision
    if maximum_exponent == -(1 << 62):
        maximum_exponent = 0
    if minimum_precision == 1 << 62:
        minimum_precision = current_precision
    bits = maximum_exponent + 64
    if bits <= 0:
        extra_precision = 0
    else:
        extra_precision = ((bits + 63) // 64) * 64
    add = extra_precision - minimum_precision
    if add < 1:
        add = 1
    state[0] = 1
    state[1] = current_precision
    state[2] = current_precision + add
    state[3] = add
    state[4] = maximum_exponent
    state[5] = minimum_precision
    return 1
