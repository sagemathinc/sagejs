"""Authentic complex-place logarithm columns for the field-3 quartic.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is a narrow translation of the complex-place part of PARI 2.17.4's
`get_log_embed`: multiply the prepared embedding row by one retained
principal generator in source order, apply `glog`, and double the complex
place.  The ordinary Python source preserves PARI's scalar/axis dispatch;
only genuinely non-axis values enter the complex AGM kernel.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .exponential import pari_real_resize
from .field3_high_precision_embeddings import pari_field3_pack_rational
from .high_precision_agm_log import pari_real_logarithm_high_precision_abs
from .high_precision_complex_agm_log import (
    pari_agm1_complex,
    pari_complex_scalar_division,
)
from .logarithm_constant import pari_log2_constant
from .pi_constant import pari_pi_constant
from .short_product import (
    pari_signed_real_sum,
    pari_word_integer_real_product,
    pari_word_integer_real_sum,
)


FIELD3_COLUMNS = 301
FIELD3_DEGREE = 4
FIELD3_ROWS = 288
FIELD3_TARGET = 153088
FIELD3_COMPLEX_GUARD = 153152


@native
def _pari_field3_complex_logarithm_guarded(
    rm: int,
    rp: int,
    re: int,
    im: int,
    ip: int,
    ie: int,
    target: int,
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int, int, int, int]:
    """`logagmcx` at the prepared M row's retained guard precision.

    The standalone qualified AGM leaf intentionally rounds to the public
    153,088-bit request. `glog(t_COMPLEX)`, however, promotes that request to
    `precision(z)` after `RgM_RgC_mul`; for this owner that is 153,152 bits.
    Keep that caller-specific distinction explicit.
    """
    if target != FIELD3_COMPLEX_GUARD or rm == 0 or im == 0:
        raise ValueError("unsupported guarded field-3 complex logarithm input")
    if abs(rm).bit_length() != rp or abs(im).bit_length() != ip:
        raise ValueError("unnormalized guarded field-3 complex logarithm input")
    working = target + 64
    negative = rm < 0
    if negative:
        rm, im = -rm, -im
    rm, rp, re = pari_real_resize(rm, rp, re, working)
    im, ip, ie = pari_real_resize(im, ip, ie, working)
    half = working >> 1
    largest_exponent = ie
    if re >= ie:
        largest_exponent = re
    scale = half - largest_exponent
    re += scale
    ie += scale
    four = 1 << (working - 1)
    qrm, qrp, qre, qim, qip, qie = pari_complex_scalar_division(
        four, working, 2, rm, rp, re, im, ip, ie
    )
    arm, arp, are, aim, aip, aie = pari_agm1_complex(
        qrm, qrp, qre, qim, qip, qie, working
    )
    pim, pip, pie = pari_pi_constant(working, pi_cache, a, b, p, q, stack)
    pie -= 1
    yrm, yrp, yre, yim, yip, yie = pari_complex_scalar_division(
        pim, pip, pie, arm, arp, are, aim, aip, aie
    )
    lm, lp, le = pari_log2_constant(working, log_cache, a, b, p, q, stack)
    lm, lp, le = pari_word_integer_real_product(-scale, lm, lp, le)
    yrm, yrp, yre = pari_signed_real_sum(yrm, yrp, yre, lm, lp, le)
    if negative:
        pm, pp, pe = pari_pi_constant(working, pi_cache, a, b, p, q, stack)
        if yim <= 0:
            yim, yip, yie = pari_signed_real_sum(yim, yip, yie, pm, pp, pe)
        else:
            yim, yip, yie = pari_signed_real_sum(yim, yip, yie, -pm, pp, pe)
    if yrp > target:
        yrm, yrp, yre = pari_real_resize(yrm, yrp, yre, target)
    if yip > target:
        yim, yip, yie = pari_real_resize(yim, yip, yie, target)
    return yrm, yrp, yre, yim, yip, yie


@native
def _pari_field3_embedding_component(
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    principal_generators: IntegerBuffer,
    embedding_offset: int,
    coefficient_offset: int,
) -> tuple[int, int, int]:
    """One `RgMrow_RgC_mul_i` component with explicit owner offsets."""
    value = embedding_m[embedding_offset] * principal_generators[coefficient_offset]
    precision = -1
    exponent = 0
    for index in range(1, FIELD3_DEGREE):
        matrix_index = embedding_offset + index
        coefficient = principal_generators[coefficient_offset + index]
        if embedding_p[matrix_index] != -1 or embedding_m[matrix_index] != 0:
            if embedding_p[matrix_index] == -1:
                term = embedding_m[matrix_index] * coefficient
                term_precision = -1
                term_exponent = 0
            else:
                term, term_precision, term_exponent = pari_word_integer_real_product(
                    coefficient,
                    embedding_m[matrix_index],
                    embedding_p[matrix_index],
                    embedding_e[matrix_index],
                )
            if precision == -1:
                if term_precision == -1:
                    value += term
                else:
                    value, precision, exponent = pari_word_integer_real_sum(
                        value, term, term_precision, term_exponent
                    )
            elif term_precision == -1:
                value, precision, exponent = pari_word_integer_real_sum(
                    term, value, precision, exponent
                )
            else:
                value, precision, exponent = pari_signed_real_sum(
                    value,
                    precision,
                    exponent,
                    term,
                    term_precision,
                    term_exponent,
                )
    return value, precision, exponent


@native
def _pari_field3_log_real_axis(
    mantissa: int,
    precision: int,
    exponent: int,
    target: int,
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int, int, int, int, int]:
    """Log one reviewed real-axis value, retaining principal argument."""
    rm = 0
    rp = -1
    re = 0
    negative = False
    if precision == -1:
        if mantissa == 0:
            raise ValueError("zero field-3 principal generator embedding")
        negative = mantissa < 0
        rm, rp, re = pari_field3_pack_rational(abs(mantissa), 1, target)
    else:
        # In this frozen owner every axis value is an exact rational scalar.
        # Fail closed rather than silently changing the precision association
        # of a future non-scalar real-axis value.
        raise ValueError("unsupported non-scalar field-3 real-axis value")
    lm, lp, le = pari_real_logarithm_high_precision_abs(
        rm, rp, re, pi_cache, log_cache, a, b, p, q, stack
    )
    if negative:
        am, ap, ae = pari_pi_constant(target, pi_cache, a, b, p, q, stack)
        return 2, lm, lp, le, am, ap, ae
    return 1, lm, lp, le, 0, -1, 0


@native
def _pari_field3_complex_log_one(
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    principal_generators: IntegerBuffer,
    column: int,
    target: int,
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int, int, int, int, int]:
    """Translate one complex-place `RgM_RgC_mul` followed by `glog`."""
    coefficient_offset = FIELD3_DEGREE * column
    scalar = True
    for index in range(1, FIELD3_DEGREE):
        if principal_generators[coefficient_offset + index] != 0:
            scalar = False
    if scalar:
        return _pari_field3_log_real_axis(
            principal_generators[coefficient_offset],
            -1,
            0,
            target,
            pi_cache,
            log_cache,
            a,
            b,
            p,
            q,
            stack,
        )

    rm, rp, re = _pari_field3_embedding_component(
        embedding_m,
        embedding_p,
        embedding_e,
        principal_generators,
        8,
        coefficient_offset,
    )
    im, ip, ie = _pari_field3_embedding_component(
        embedding_m,
        embedding_p,
        embedding_e,
        principal_generators,
        12,
        coefficient_offset,
    )
    if im == 0:
        return _pari_field3_log_real_axis(
            rm,
            rp,
            re,
            target,
            pi_cache,
            log_cache,
            a,
            b,
            p,
            q,
            stack,
        )
    if rm == 0:
        lm, lp, le = pari_real_logarithm_high_precision_abs(
            abs(im), ip, ie, pi_cache, log_cache, a, b, p, q, stack
        )
        am, ap, ae = pari_pi_constant(target, pi_cache, a, b, p, q, stack)
        ae -= 1
        if im < 0:
            am = -am
        return 2, lm, lp, le, am, ap, ae
    lm, lp, le, am, ap, ae = _pari_field3_complex_logarithm_guarded(
        rm,
        rp,
        re,
        im,
        ip,
        ie,
        FIELD3_COMPLEX_GUARD,
        pi_cache,
        log_cache,
        a,
        b,
        p,
        q,
        stack,
    )
    return 2, lm, lp, le, am, ap, ae


@native
def pari_field3_complex_log_columns(
    polynomial: IntegerBuffer,
    basis: IntegerBuffer,
    basis_denominator: int,
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    embedding_state: Int64Buffer,
    principal_generators: IntegerBuffer,
    relation_metadata: IntegerBuffer,
    relation_records: IntegerBuffer,
    start: int,
    count: int,
    target: int,
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    scratch: IntegerBuffer,
    principal_output: IntegerBuffer,
    raw_output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Publish a bounded source-order batch transactionally.

    `principal_output` contains `(log(abs(z)), arg(z))`, six integers per
    column. `raw_output` contains PARI's packed-log entry
    `(kind, 2*log(abs(z)), 2*arg(z))`, seven integers per column.  Exact zero
    components retain the `(0, -1, 0)` sentinel.  The deterministic complete
    schedule is `start = 0, 4, ..., 300` with `count = min(4, 301-start)`.
    """
    if target != FIELD3_TARGET:
        raise ValueError("unsupported field-3 complex-log target")
    if start < 0 or count < 1 or count > 4 or start + count > FIELD3_COLUMNS:
        raise ValueError("invalid field-3 complex-log batch")
    if (
        len(polynomial) < 5
        or len(basis) < 16
        or len(embedding_m) < 16
        or len(embedding_p) < 16
        or len(embedding_e) < 16
        or len(embedding_state) < 6
        or len(principal_generators) < FIELD3_DEGREE * FIELD3_COLUMNS
        or len(relation_metadata) < 3 * FIELD3_COLUMNS
        or len(relation_records) < FIELD3_ROWS * FIELD3_COLUMNS
        or len(pi_cache) < 3
        or len(log_cache) < 3
        or len(a) < 16385
        or len(b) < 16385
        or len(p) < 16385
        or len(q) < 16385
        or len(stack) < 105
        or len(scratch) < 13 * count
        or len(principal_output) < 6 * count
        or len(raw_output) < 7 * count
        or len(state) < 9
    ):
        raise ValueError("short field-3 complex-log owner or workspace")
    if (
        polynomial[0] != -2000042
        or polynomial[1] != -2000022
        or polynomial[2] != 0
        or polynomial[3] != 0
        or polynomial[4] != 1
        or basis_denominator != 37
        or embedding_state[0] != 0
        or embedding_state[1] != FIELD3_TARGET
        or embedding_state[2] != FIELD3_TARGET + 64
        or embedding_state[4] != 2
        or embedding_state[5] != 1
    ):
        raise ValueError("wrong field-3 prepared embedding owner")
    if (
        basis[0] != 37
        or basis[1] != 0
        or basis[2] != 0
        or basis[3] != 0
        or basis[4] != 0
        or basis[5] != 37
        or basis[6] != 0
        or basis[7] != 0
        or basis[8] != 0
        or basis[9] != -37
        or basis[10] != 37
        or basis[11] != 0
        or basis[12] != -1499998
        or basis[13] != -63
        or basis[14] != 14
        or basis[15] != 1
    ):
        raise ValueError("wrong field-3 prepared integral basis")
    if (
        embedding_m[8] != 1
        or embedding_p[8] != -1
        or embedding_e[8] != 0
        or embedding_m[12] != 0
        or embedding_p[12] != -1
        or embedding_e[12] != 0
    ):
        raise ValueError("wrong field-3 complex embedding identity column")

    # Validate the complete source-order relation descriptors before any
    # cache, scratch, or output mutation.  The independent caller checks the
    # stronger exact norm consequence for all 301 columns.
    for column in range(FIELD3_COLUMNS):
        if (
            relation_metadata[3 * column] != column + 1
            or relation_metadata[3 * column + 1] != 0
            or relation_metadata[3 * column + 2] != 0
        ):
            raise ValueError("wrong field-3 relation source order")
        nonzero = False
        for row in range(FIELD3_ROWS):
            entry = relation_records[column * FIELD3_ROWS + row]
            if entry < 0:
                raise ValueError("negative field-3 relation exponent")
            if entry != 0:
                nonzero = True
        if not nonzero:
            raise ValueError("empty field-3 principal relation")
        for coordinate in range(FIELD3_DEGREE):
            value = principal_generators[FIELD3_DEGREE * column + coordinate]
            if abs(value).bit_length() > 63:
                raise ValueError("field-3 principal coordinate exceeds one word")

    scalar_count = 0
    axis_count = 0
    complex_count = 0
    for local in range(count):
        column = start + local
        kind, lm, lp, le, am, ap, ae = _pari_field3_complex_log_one(
            embedding_m,
            embedding_p,
            embedding_e,
            principal_generators,
            column,
            target,
            pi_cache,
            log_cache,
            a,
            b,
            p,
            q,
            stack,
        )
        scalar = True
        for coordinate in range(1, FIELD3_DEGREE):
            if principal_generators[FIELD3_DEGREE * column + coordinate] != 0:
                scalar = False
        if scalar:
            scalar_count += 1
        elif kind == 1:
            axis_count += 1
        else:
            complex_count += 1
        offset = 13 * local
        scratch[offset] = lm
        scratch[offset + 1] = lp
        scratch[offset + 2] = le
        scratch[offset + 3] = am
        scratch[offset + 4] = ap
        scratch[offset + 5] = ae
        scratch[offset + 6] = kind
        scratch[offset + 7] = lm
        scratch[offset + 8] = lp
        scratch[offset + 9] = le + 1
        scratch[offset + 10] = am
        scratch[offset + 11] = ap
        scratch[offset + 12] = ae
        if am != 0:
            scratch[offset + 12] = ae + 1

    for local in range(count):
        scratch_offset = 13 * local
        principal_offset = 6 * local
        raw_offset = 7 * local
        for index in range(6):
            principal_output[principal_offset + index] = scratch[scratch_offset + index]
        for index in range(7):
            raw_output[raw_offset + index] = scratch[scratch_offset + 6 + index]
    state[0] = 0
    state[1] = target
    state[2] = start
    state[3] = count
    state[4] = scalar_count
    state[5] = axis_count
    state[6] = complex_count
    state[7] = start + count
    state[8] = FIELD3_COLUMNS - start - count
    return 0


__all__ = ["pari_field3_complex_log_columns"]
