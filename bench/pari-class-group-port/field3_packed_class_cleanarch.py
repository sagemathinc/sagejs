"""Exact packed PARI `cleanarch` for the live field3 `(2, 1)` owner.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the degree-four signature-(2,1) specialization of PARI 2.17.4
`buch2.c:899-932`. Seven-word entries are kind followed by packed real and
imaginary triples. The source owner is column-major, with three archimedean
entries per class-log column.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .integer_real_product import pari_integer_real_product
from .log_matrix_transform import pari_validate_log_entries
from .pi_constant import pari_pi_constant, pari_pi_workspace_capacity
from .real_division import pari_real_division
from .short_product import (
    pari_real_integer_division,
    pari_short_product,
    pari_signed_real_sum,
)


@native
def pari_field3_packed_class_cleanarch(
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
    """Clean the live field3 class-log owner and publish transactionally.

    The first two places use `2*pi`; the complex place uses `4*pi`. `state`
    is status, completed scratch columns, published columns, source maximum
    exponent, real-place reductions, complex-place reductions, and failed
    zero-based column. Return one on PARI's argument-reduction accuracy gate.
    `precision` is the whole-word bit target from which PARI's `PRECI` is
    constructed and admits the authentic 153088-bit owner. A cold pi cache
    requires exactly the capacity reported by `pari_pi_workspace_capacity`;
    capacity failure occurs before any state or output mutation.
    """

    places = 3
    width = 7
    if columns < 0:
        raise ValueError("negative field3 cleanarch column count")
    size = places * columns * width
    if (
        len(source) < size
        or len(scratch) < size
        or len(output) < size
        or len(state) < 7
    ):
        raise ValueError("short field3 cleanarch storage")
    if precision < 64 or precision > 153088 or precision % 64 != 0:
        raise ValueError("unsupported field3 cleanarch PRECI")
    coefficient_cells, stack_cells = pari_pi_workspace_capacity(precision)
    if len(pi_cache) < 3:
        raise ValueError("short field3 cleanarch pi cache")
    if pi_cache[1] < precision and (
        len(a) < coefficient_cells
        or len(b) < coefficient_cells
        or len(p) < coefficient_cells
        or len(q) < coefficient_cells
        or len(stack) < stack_cells
    ):
        raise ValueError("field3 cleanarch pi workspace exhausted")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = -(1 << 62)
    state[4] = 0
    state[5] = 0
    state[6] = -1
    pari_validate_log_entries(source, places * columns)
    pm, pp, pe = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
    one = 1 << (pp - 1)
    im, ip, ie = pari_real_division(one, pp, 0, pm, pp, pe)
    for column in range(columns):
        base = places * width * column
        sm = source[base + 1]
        sp = source[base + 2]
        se = source[base + 3]
        for row in range(places):
            at = base + width * row
            rm = source[at + 1]
            rp = source[at + 2]
            re = source[at + 3]
            if rp < 0:
                raise ValueError("field3 logarithm real part must be packed")
            if rm != 0:
                if rp < 64 or rp > 153088 or rp % 64 != 0:
                    raise ValueError("unsupported field3 class-log precision")
                if abs(rm).bit_length() != rp:
                    raise ValueError("unnormalized field3 class logarithm")
                if re > state[3]:
                    state[3] = re
            if row != 0:
                sm, sp, se = pari_signed_real_sum(sm, sp, se, rm, rp, re)
        sm, sp, se = pari_real_integer_division(-4, sm, sp, se)
        for row in range(places):
            at = base + width * row
            shift_exponent = se
            inverse_exponent = -3
            period_exponent = pe + 1
            if row == 2:
                shift_exponent += 1
                inverse_exponent = -4
                period_exponent = pe + 2
            rm, rp, re = pari_signed_real_sum(
                source[at + 1],
                source[at + 2],
                source[at + 3],
                sm,
                sp,
                shift_exponent,
            )
            xm = source[at + 4]
            xp = source[at + 5]
            xe = source[at + 6]
            if xm != 0:
                qm, qp, qe = pari_short_product(xm, xp, xe, im, ip, inverse_exponent)
                if qe >= 0 and ((qe + 64) // 64) * 64 > qp:
                    state[0] = 1
                    state[6] = column
                    return 1
                quotient_shift = qp - qe - 1
                if quotient_shift >= 0:
                    quotient = qm // (1 << quotient_shift)
                else:
                    quotient = qm << -quotient_shift
                if quotient != 0:
                    tm, tp, te = pari_integer_real_product(
                        quotient, pm, pp, period_exponent
                    )
                    xm, xp, xe = pari_signed_real_sum(xm, xp, xe, -tm, tp, te)
                    if row == 2:
                        state[5] += 1
                    else:
                        state[4] += 1
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
    for i in range(size):
        output[i] = scratch[i]
    state[0] = 0
    state[2] = columns
    return 0


@native
def pari_field3_cleanarch_retry_status(
    source: IntegerBuffer,
    value_count: int,
    current_precision: int,
    state: Int64Buffer,
) -> int:
    """Reproduce the `cleanarch == NULL` precision-retry status exactly."""

    if value_count < 1 or current_precision < 64:
        raise ValueError("invalid field3 cleanarch retry input")
    if len(source) < 7 * value_count or len(state) < 6:
        raise ValueError("short field3 cleanarch retry storage")
    maximum_exponent = -(1 << 62)
    minimum_precision = 1 << 62
    for i in range(value_count):
        at = 7 * i
        kind = source[at]
        for part in range(kind):
            mantissa = source[at + 1 + 3 * part]
            packed_precision = source[at + 2 + 3 * part]
            exponent = source[at + 3 + 3 * part]
            if packed_precision >= 0 and mantissa != 0:
                if exponent > maximum_exponent:
                    maximum_exponent = exponent
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
    added = extra_precision - minimum_precision
    if added < 1:
        added = 1
    state[0] = 1
    state[1] = current_precision
    state[2] = current_precision + added
    state[3] = added
    state[4] = maximum_exponent
    state[5] = minimum_precision
    return 1
