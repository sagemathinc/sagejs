"""PARI 2.17.4 `Sunits_archclean` retry-log rebuild for a real cubic.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This source cut starts with a refreshed prepared embedding and the retained
exact `SUnits = [X, U, G]` state.  It reevaluates the atomic generators in
`X`, applies `U` in source order, and runs `cleanarch`.  No high-precision
unit logarithm is an input.
"""

from sagejs.native import (
    IntegerBuffer,
    Int64Buffer,
    checked_float64,
    checked_uint64,
    native,
)

from .class_relation_cleanarch import pari_cleanarch_totally_real_cubic
from .exponential import (
    pari_exp_schedule_sqrt,
    pari_leading_word_log2,
    pari_real_resize,
    pari_real_truncate,
)
from .log_matrix_transform import pari_log_matrix_transform
from .logarithm_constant import pari_log2_constant
from .pi_constant import pari_pi_constant
from .real_conversion import pari_integer_to_real
from .real_division import pari_real_division
from .real_square_root import pari_sqrtrem_integer
from .short_product import (
    pari_real_word_division,
    pari_round_real,
    pari_short_product,
    pari_short_square,
    pari_signed_real_sum,
    pari_word_integer_real_product,
    pari_word_integer_real_sum,
)


@native
def pari_cubic_atomic_embedding(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    coordinates: IntegerBuffer,
    coordinate_offset: int,
    row_offset: int,
) -> tuple[int, int, int]:
    """Evaluate one small exact S-unit atom in `make_M` source order."""
    if matrix_p[row_offset] == -1:
        value = matrix_m[row_offset] * coordinates[coordinate_offset]
        precision = -1
        exponent = 0
    else:
        value, precision, exponent = pari_word_integer_real_product(
            coordinates[coordinate_offset],
            matrix_m[row_offset],
            matrix_p[row_offset],
            matrix_e[row_offset],
        )
    for j in range(1, 3):
        k = row_offset + j
        if matrix_p[k] != -1 or matrix_m[k] != 0:
            if matrix_p[k] == -1:
                term = matrix_m[k] * coordinates[coordinate_offset + j]
                term_precision = -1
                term_exponent = 0
            else:
                term, term_precision, term_exponent = pari_word_integer_real_product(
                    coordinates[coordinate_offset + j],
                    matrix_m[k],
                    matrix_p[k],
                    matrix_e[k],
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
def pari_logarithm_series_wide(m: int, p: int, e: int) -> tuple[int, int, int]:
    """`logr_aux` on the coordinated 2,304-bit retry corridor."""
    if m == 0:
        raise ValueError("wide logarithm series requires nonzero input")
    leading = checked_uint64(abs(m) >> (p - 64))
    d = -2.0 * (pari_leading_word_log2(leading) + checked_float64(e - 63))
    if d <= 0.0:
        raise ValueError("wide logarithm series outside contraction range")
    k = int(2.0 * (checked_float64(p) / d))
    if k % 2 == 0:
        k += 1
    if k >= 3:
        ym, yp, ye = pari_short_square(m, p, e)
        accumulated = 0
        increment = int(d)
        length = ((increment + 63) // 64) * 64
        if length > p:
            raise ValueError("wide logarithm series exceeds allocation")
        sm, sp, se = pari_real_word_division(k, 1 << (length - 1), length, 0)
        sm, sp, se = pari_real_resize(sm, sp, se, length)
        k -= 2
        while k >= 1:
            tm, tp, te = pari_real_truncate(ym, yp, ye, length)
            tm, tp, te = pari_short_product(sm, sp, se, tm, tp, te)
            if k == 1:
                tm, tp, te = pari_word_integer_real_sum(1, tm, tp, te)
                return pari_short_product(m, p, e, tm, tp, te)
            accumulated += increment
            length += (accumulated // 64) * 64
            accumulated %= 64
            if length > p:
                length = p
            sm, sp, se = pari_real_word_division(k, 1 << (length - 1), length, 0)
            sm, sp, se = pari_signed_real_sum(sm, sp, se, tm, tp, te)
            sm, sp, se = pari_real_resize(sm, sp, se, length)
            k -= 2
    return m, p, e


@native
def pari_real_square_root_wide(
    mantissa: int, precision: int, exponent: int
) -> tuple[int, int, int]:
    """`sqrtr_abs` for the retained wide-logarithm working precision."""
    if precision < 64 or precision > 4352 or precision % 64 != 0:
        raise ValueError("unsupported wide square-root precision")
    magnitude = abs(mantissa)
    if magnitude.bit_length() != precision:
        raise ValueError("wide square root requires a full mantissa")
    if exponent % 2 != 0:
        root, remainder = pari_sqrtrem_integer(magnitude << precision)
        if remainder > root:
            root += 1
    else:
        root, remainder = pari_sqrtrem_integer(magnitude << (precision + 127))
        guard = root % (1 << 64)
        root >>= 64
        if guard >= 1 << 63 or (guard == (1 << 63) - 1 and remainder > root):
            root += 1
    return root, precision, exponent // 2


@native
def pari_real_logarithm_wide(
    mantissa: int,
    precision: int,
    exponent: int,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """`logr_abs` through the reviewed p4,096 embedding corridor."""
    if precision < 64 or precision > 4352 or precision % 64 != 0:
        raise ValueError("unsupported wide logarithm precision")
    magnitude = abs(mantissa)
    if magnitude.bit_length() != precision:
        raise ValueError("wide logarithm requires a full mantissa")
    if exponent < -10000 or exponent > 10000:
        raise ValueError("unsupported wide logarithm exponent")
    ex = exponent
    leading = magnitude >> (precision - 64)
    if leading > (((1 << 64) - 1) // 3) * 2:
        ex += 1
        tail = ((1 << precision) - 1) - magnitude
    else:
        tail = magnitude - (1 << (precision - 1))
    if tail == 0:
        if ex == 0:
            return 0, 0, -precision
        lm, lp, le = pari_log2_constant(precision, cache, a, b, p, q, stack)
        return pari_word_integer_real_product(ex, lm, lp, le)
    accuracy = precision - tail.bit_length()
    skipped = (accuracy // 64) * 64
    working = precision + 64
    bits = working - skipped
    target = precision
    if ex == 0:
        target -= skipped
    d = -checked_float64(accuracy) / 2.0
    roots = int(d + pari_exp_schedule_sqrt(d * d + checked_float64(bits // 6)))
    if roots > bits - accuracy:
        roots = bits - accuracy
    if checked_float64(roots) < 0.2 * checked_float64(accuracy):
        roots = 0
    else:
        working += ((roots + 63) // 64) * 64
    if working > 4352:
        raise ValueError("wide logarithm working precision exceeds corridor")
    xm, xp, xe = pari_real_resize(magnitude, precision, exponent, working)
    xe -= ex
    for unused in range(roots):
        xm, xp, xe = pari_real_square_root_wide(xm, xp, xe)
    nm, np, ne = pari_word_integer_real_sum(-1, xm, xp, xe)
    dm, dp, de = pari_word_integer_real_sum(1, xm, xp, xe)
    ym, yp, ye = pari_real_division(nm, np, ne, dm, dp, de)
    ym, yp, ye = pari_logarithm_series_wide(ym, yp, ye)
    ye += roots + 1
    if ex != 0:
        lm, lp, le = pari_log2_constant(precision + 64, cache, a, b, p, q, stack)
        lm, lp, le = pari_word_integer_real_product(ex, lm, lp, le)
        ym, yp, ye = pari_signed_real_sum(ym, yp, ye, lm, lp, le)
    return pari_real_resize(ym, yp, ye, target)


@native
def pari_cubic_sunit_precision_rebuild(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    generators: IntegerBuffer,
    transform: IntegerBuffer,
    generator_count: int,
    precision: int,
    atom_logs: IntegerBuffer,
    transformed: IntegerBuffer,
    clean_scratch: IntegerBuffer,
    clean_result: IntegerBuffer,
    output: IntegerBuffer,
    phase_scratch: IntegerBuffer,
    phases: IntegerBuffer,
    log_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    clean_state: Int64Buffer,
    state: Int64Buffer,
) -> int:
    """Rebuild rank-two `logfu` through p4,096 from exact `X` and `U`.

    `generators` contains three integral-basis coordinates for every retained
    atomic S-unit. `transform` is PARI's column-major `generator_count x 2`
    matrix. Public `output` changes only after every logarithm, transform, and
    cleanup succeeds.
    """
    if generator_count < 1 or precision < 64 or precision > 4096:
        raise ValueError("unsupported cubic S-unit precision rebuild")
    if precision % 64 != 0:
        raise ValueError("cubic S-unit precision must use whole words")
    if (
        len(matrix_m) < 9
        or len(matrix_p) < 9
        or len(matrix_e) < 9
        or len(generators) < 3 * generator_count
        or len(transform) < 2 * generator_count
        or len(atom_logs) < 21 * generator_count
        or len(transformed) < 42
        or len(clean_scratch) < 42
        or len(clean_result) < 42
        or len(output) < 42
        or len(phase_scratch) < 6
        or len(phases) < 6
        or len(clean_state) < 4
        or len(state) < 5
    ):
        raise ValueError("short cubic S-unit precision storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = 0
    state[4] = 0
    for generator in range(generator_count):
        source = 3 * generator
        target = 21 * generator
        if generators[source + 1] == 0 and generators[source + 2] == 0:
            if generators[source] == 0:
                raise ValueError("zero retained S-unit atom")
            for place in range(3):
                at = target + 7 * place
                atom_logs[at + 1] = 0
                atom_logs[at + 2] = -1
                atom_logs[at + 3] = 0
                if generators[source] > 0:
                    atom_logs[at] = 1
                    atom_logs[at + 4] = 0
                    atom_logs[at + 5] = -1
                    atom_logs[at + 6] = 0
                else:
                    pm, pp, pe = pari_pi_constant(
                        precision, pi_cache, a, b, p, q, stack
                    )
                    atom_logs[at] = 2
                    atom_logs[at + 4] = pm
                    atom_logs[at + 5] = pp
                    atom_logs[at + 6] = pe
            state[1] = generator + 1
            continue
        for place in range(3):
            m, rp, e = pari_cubic_atomic_embedding(
                matrix_m,
                matrix_p,
                matrix_e,
                generators,
                source,
                3 * place,
            )
            if rp == -1:
                # Only scalar atoms can remain exact because the first basis
                # column is one. Convert exactly at the requested precision.
                m, rp, e = pari_integer_to_real(m, precision)
            if m == 0:
                raise ValueError("zero retained S-unit embedding")
            lm, lp, le = pari_real_logarithm_wide(
                m, rp, e, log_cache, a, b, p, q, stack
            )
            at = target + 7 * place
            if m > 0:
                atom_logs[at] = 1
                atom_logs[at + 4] = 0
                atom_logs[at + 5] = -1
                atom_logs[at + 6] = 0
            else:
                pm, pp, pe = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
                atom_logs[at] = 2
                atom_logs[at + 4] = pm
                atom_logs[at + 5] = pp
                atom_logs[at + 6] = pe
            atom_logs[at + 1] = lm
            atom_logs[at + 2] = lp
            atom_logs[at + 3] = le
        state[1] = generator + 1
    pari_log_matrix_transform(
        atom_logs, transform, 3, generator_count, 2, False, transformed
    )
    state[2] = 2
    status = pari_cleanarch_totally_real_cubic(
        transformed,
        2,
        precision,
        pi_cache,
        a,
        b,
        p,
        q,
        stack,
        clean_scratch,
        clean_result,
        clean_state,
    )
    if status != 0:
        state[0] = status
        return status
    pm, pp, pe = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
    for i in range(6):
        at = 7 * i
        im = clean_result[at + 4]
        ip = clean_result[at + 5]
        ie = clean_result[at + 6]
        if clean_result[at] == 1 or im == 0:
            phase_scratch[i] = 0
        else:
            qm, qp, qe = pari_real_division(im, ip, ie, pm, pp, pe)
            quotient, error = pari_round_real(qm, qp - qe - 1, qe)
            if error > -32:
                raise ValueError("ambiguous rebuilt S-unit phase")
            phase_scratch[i] = quotient % 2
    for i in range(42):
        output[i] = clean_result[i]
    for i in range(6):
        phases[i] = phase_scratch[i]
    state[0] = 0
    state[3] = 2
    state[4] = precision
    return 0
