"""PARI 2.17.4 mixed-quartic fundamental-unit suffix glue.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This module supplies the source-faithful pieces which were missing between the
rank-two lattice and mixed-quartic `getfu` translations.  Seven-word complex
logarithms remain caller-owned throughout; publication is transactional.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .integer_real_product import pari_integer_real_product
from .log_matrix_transform import pari_log_matrix_transform, pari_validate_log_entries
from .pi_constant import pari_pi_constant
from .real_division import pari_real_division
from .regulator_approx_zero import pari_regulator_exponent
from .regulator_scalar import (
    pari_regulator_scalar_add,
    pari_regulator_scalar_multiply,
)
from .short_product import (
    pari_real_integer_division,
    pari_short_product,
    pari_signed_real_sum,
)


@native
def pari_cleanarchunit_mixed_quartic(
    source: IntegerBuffer,
    expected_regulator: IntegerBuffer,
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
    """Apply `cleanarchunit` for signature `(2, 1)` and test `R`.

    Return 1 for a failed log-norm/modulo reduction and 2 when the resulting
    regulator differs from the accepted regulator by exponent greater than
    `-1`.  These are Buchall precision-retry states, unlike `getfu`'s
    legitimate `not_given` result. `state` is status, completed columns,
    published columns, maximum log-norm exponent, regulator-difference
    exponent, and failing row.
    """
    if precision < 64 or precision > 153088 or precision % 64 != 0:
        raise ValueError("unsupported mixed cleanarchunit precision")
    if (
        len(source) < 42
        or len(expected_regulator) < 3
        or len(scratch) < 42
        or len(output) < 42
        or len(state) < 6
    ):
        raise ValueError("short mixed cleanarchunit storage")
    pari_validate_log_entries(source, 6)
    for i in range(6):
        state[i] = -1
    state[1] = 0
    state[2] = 0
    state[3] = -(1 << 61)
    state[4] = -(1 << 61)
    state[5] = -1
    pm, pp, pe = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
    one = 1 << (pp - 1)
    im, ip, ie = pari_real_division(one, pp, 0, pm, pp, pe)
    for column in range(2):
        base = 21 * column
        sm, sp, se = source[base + 1], source[base + 2], source[base + 3]
        for row in range(1, 3):
            at = base + 7 * row
            sm, sp, se = pari_signed_real_sum(
                sm, sp, se, source[at + 1], source[at + 2], source[at + 3]
            )
        norm_exponent = pari_regulator_exponent(sm, sp, se)
        if norm_exponent > state[3]:
            state[3] = norm_exponent
        if norm_exponent > -10:
            state[0] = 1
            return 1
        for row in range(3):
            at = base + 7 * row
            for t in range(7):
                scratch[at + t] = source[at + t]
            xm, xp, xe = source[at + 4], source[at + 5], source[at + 6]
            if xm != 0:
                # R1=2 uses 2*pi; the single complex place uses 4*pi.
                scale = -3
                period_exponent = pe + 1
                if row >= 2:
                    scale = -4
                    period_exponent = pe + 2
                qm, qp, qe = pari_short_product(xm, xp, xe, im, ip, scale)
                if qe >= 0 and ((qe + 64) // 64) * 64 > qp:
                    state[0] = 1
                    state[5] = row
                    return 1
                shift = qp - qe - 1
                if shift >= 0:
                    quotient = qm // (1 << shift)
                else:
                    quotient = qm << -shift
                if quotient != 0:
                    tm, tp, te = pari_integer_real_product(
                        quotient, pm, pp, period_exponent
                    )
                    xm, xp, xe = pari_signed_real_sum(xm, xp, xe, -tm, tp, te)
                scratch[at + 4] = xm
                scratch[at + 5] = xp
                scratch[at + 6] = xe
                if xm == 0:
                    scratch[at] = 1
                    scratch[at + 4] = 0
                    scratch[at + 5] = -1
                    scratch[at + 6] = 0
        state[1] = column + 1
    # get_regulator for rank two uses the first two rows.
    x0 = 1
    x1 = 22
    x2 = 8
    x3 = 29
    am, ap, ae = pari_regulator_scalar_multiply(
        scratch[x0],
        scratch[x0 + 1],
        scratch[x0 + 2],
        scratch[x3],
        scratch[x3 + 1],
        scratch[x3 + 2],
    )
    bm, bp, be = pari_regulator_scalar_multiply(
        scratch[x1],
        scratch[x1 + 1],
        scratch[x1 + 2],
        scratch[x2],
        scratch[x2 + 1],
        scratch[x2 + 2],
    )
    dm, dp, de = pari_regulator_scalar_add(am, ap, ae, -bm, bp, be)
    if dm < 0:
        dm = -dm
    dm, dp, de = pari_regulator_scalar_add(
        dm,
        dp,
        de,
        -expected_regulator[0],
        expected_regulator[1],
        expected_regulator[2],
    )
    state[4] = pari_regulator_exponent(dm, dp, de)
    if state[4] > -1:
        state[0] = 2
        return 2
    for i in range(42):
        output[i] = scratch[i]
    state[2] = 2
    state[0] = 0
    return 0


@native
def pari_field3_prepare_getfu(
    clean: IntegerBuffer,
    factor: IntegerBuffer,
    matep: IntegerBuffer,
    arch: IntegerBuffer,
    factored_clean: IntegerBuffer,
    arch_real: IntegerBuffer,
    arch_imag: IntegerBuffer,
    clean_real: IntegerBuffer,
    clean_imag: IntegerBuffer,
) -> int:
    """Build `fixarch(A)`, then apply the live rank-two getfu factor.

    The factor is intentionally an input from `pari_unit_real_lattice_rank_two`;
    this leaf never selects or accepts answer-derived coefficients.
    """
    if (
        len(clean) < 42
        or len(factor) < 4
        or len(matep) < 42
        or len(arch) < 42
        or len(factored_clean) < 42
        or len(arch_real) < 18
        or len(arch_imag) < 18
        or len(clean_real) < 18
        or len(clean_imag) < 18
    ):
        raise ValueError("short mixed getfu preparation storage")
    pari_validate_log_entries(clean, 6)
    determinant = factor[0] * factor[3] - factor[1] * factor[2]
    if determinant != 1 and determinant != -1:
        raise ValueError("getfu factor must be unimodular")
    for column in range(2):
        base = 21 * column
        sm, sp, se = clean[base + 1], clean[base + 2], clean[base + 3]
        for row in range(1, 3):
            at = base + 7 * row
            xm, xp, xe = clean[at + 1], clean[at + 2], clean[at + 3]
            sm, sp, se = pari_regulator_scalar_add(sm, sp, se, xm, xp, xe)
        sm, sp, se = pari_real_integer_division(-4, sm, sp, se)
        for row in range(3):
            at = base + 7 * row
            addm, addp, adde = sm, sp, se
            xm, xp, xe = clean[at + 1], clean[at + 2], clean[at + 3]
            im, ip, ie = clean[at + 4], clean[at + 5], clean[at + 6]
            if row == 2:
                # For a complex place fixarch stores `s + x/2`, including
                # halving the imaginary component.  The correction `s`
                # itself is not halved.
                xm, xp, xe = pari_real_integer_division(2, xm, xp, xe)
                im, ip, ie = pari_real_integer_division(2, im, ip, ie)
            rm, rp, re = pari_regulator_scalar_add(xm, xp, xe, addm, addp, adde)
            matep[at] = clean[at]
            matep[at + 1] = rm
            matep[at + 2] = rp
            matep[at + 3] = re
            matep[at + 4] = im
            matep[at + 5] = ip
            matep[at + 6] = ie
    pari_log_matrix_transform(matep, factor, 3, 2, 2, False, arch)
    pari_log_matrix_transform(clean, factor, 3, 2, 2, False, factored_clean)
    for i in range(6):
        packed = 7 * i
        triple = 3 * i
        arch_real[triple] = arch[packed + 1]
        arch_real[triple + 1] = arch[packed + 2]
        arch_real[triple + 2] = arch[packed + 3]
        arch_imag[triple] = arch[packed + 4]
        arch_imag[triple + 1] = arch[packed + 5]
        arch_imag[triple + 2] = arch[packed + 6]
        clean_real[triple] = factored_clean[packed + 1]
        clean_real[triple + 1] = factored_clean[packed + 2]
        clean_real[triple + 2] = factored_clean[packed + 3]
        clean_imag[triple] = factored_clean[packed + 4]
        clean_imag[triple + 1] = factored_clean[packed + 5]
        clean_imag[triple + 2] = factored_clean[packed + 6]
    return 0


@native
def pari_field3_unit_suffix_action(cleanarch_status: int, getfu_status: int) -> int:
    """Keep precision retries distinct from legitimate `not_given`.

    Results are 0 success, 1 cleanarch retry, 2 regulator retry, 3 legitimate
    LARGE not-given, and 4 legitimate PRECI not-given.
    """
    if cleanarch_status == 1:
        return 1
    if cleanarch_status == 2:
        return 2
    if cleanarch_status != 0:
        raise ValueError("invalid cleanarchunit status")
    if getfu_status == 0:
        return 0
    if getfu_status == 2:
        return 3
    if getfu_status == 3:
        return 4
    raise ValueError("invalid getfu status")
