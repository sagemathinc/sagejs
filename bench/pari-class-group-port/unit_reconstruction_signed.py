"""PARI 2.17.4 signed totally-real cubic `getfu` reconstruction.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

At a totally real place, `cleanarchunit` leaves an imaginary component of
either zero or pi.  This connected cut stores that component as one parity
bit, transforms the bits modulo two with the rank-two lattice transform, then
executes the real exponential with the corresponding exact sign.  It starts
at the clean logarithm/factored-transform boundary: relation-lattice and real
LLL selection remain the preceding stage.

The mixed-signature path is intentionally excluded.  Its nontrivial complex
arguments require PARI's multiprecision sine/cosine graph; replacing that graph
with binary64 trigonometry would not preserve source precision semantics.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .exponential_entry import pari_prepared_exp
from .regulator_approx_zero import pari_regulator_exponent
from .regulator_scalar import (
    pari_regulator_scalar_add,
    pari_regulator_scalar_divide,
    pari_regulator_scalar_multiply,
    pari_validate_regulator_values,
)
from .short_product import pari_round_real
from .unit_reconstruction_cubic import (
    pari_getfu_cubic_real_solve,
    pari_getfu_cubic_unit_inverse,
)


@native
def pari_getfu_cubic_transform_logs(
    source: IntegerBuffer,
    transform: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Compute a packed-real 3x2 by 2x2 product, column-major."""
    if len(source) < 18 or len(transform) < 4 or len(output) < 18:
        raise ValueError("short cubic log-transform storage")
    pari_validate_regulator_values(source, 6)
    for j in range(2):
        for i in range(3):
            left = 3 * i
            mm, mp, me = pari_regulator_scalar_multiply(
                source[left],
                source[left + 1],
                source[left + 2],
                transform[2 * j],
                -1,
                0,
            )
            left += 9
            tm, tp, te = pari_regulator_scalar_multiply(
                source[left],
                source[left + 1],
                source[left + 2],
                transform[2 * j + 1],
                -1,
                0,
            )
            mm, mp, me = pari_regulator_scalar_add(mm, mp, me, tm, tp, te)
            at = 9 * j + 3 * i
            output[at] = mm
            output[at + 1] = mp
            output[at + 2] = me
    return 0


@native
def pari_getfu_cubic_transform_phases(
    phases: Int64Buffer,
    transform: IntegerBuffer,
    output: Int64Buffer,
) -> int:
    """Transform six clean 0/pi phase bits modulo two.

    Inputs and output are column-major 3x2 matrices.  `transform` is the
    column-major 2x2 factor returned by PARI's real LLL.  Negative exponents
    have their ordinary parity, so this is exactly the imaginary component of
    `RgM_ZM_mul` modulo `2*pi`.
    """
    if len(phases) < 6 or len(transform) < 4 or len(output) < 6:
        raise ValueError("short cubic phase-transform storage")
    for i in range(6):
        if phases[i] != 0 and phases[i] != 1:
            raise ValueError("cubic phases must encode zero or pi")
    for j in range(2):
        for i in range(3):
            value = phases[i] * transform[2 * j] + phases[3 + i] * transform[2 * j + 1]
            output[3 * j + i] = value % 2
    return 0


@native
def pari_getfu_signed_real_cubic(
    clean_logs: IntegerBuffer,
    clean_phases: Int64Buffer,
    factor_transform: IntegerBuffer,
    embedding_matrix: IntegerBuffer,
    multiplication_basis: IntegerBuffer,
    precision: int,
    phase_precision: int,
    matep: IntegerBuffer,
    transformed_arch: IntegerBuffer,
    transformed_clean: IntegerBuffer,
    transformed_phases: Int64Buffer,
    exponential_values: IntegerBuffer,
    solve_work: IntegerBuffer,
    solve_rhs: IntegerBuffer,
    solved: IntegerBuffer,
    rounded: IntegerBuffer,
    multiplication: IntegerBuffer,
    inverse: IntegerBuffer,
    candidate_units: IntegerBuffer,
    normalized_factor: IntegerBuffer,
    output_units: IntegerBuffer,
    output_logs: IntegerBuffer,
    output_phases: Int64Buffer,
    output_factor: IntegerBuffer,
    state: Int64Buffer,
    pivots: Int64Buffer,
    exp_cache: IntegerBuffer,
    exp_a: IntegerBuffer,
    exp_b: IntegerBuffer,
    exp_p: IntegerBuffer,
    exp_q: IntegerBuffer,
    exp_stack: IntegerBuffer,
) -> int:
    """Reconstruct signed cubic units from clean logs and a factored LLL map.

    Return zero on success, two for `fupb_LARGE` and three for
    `fupb_PRECI`.  State is `(status, max real exponent, phase accuracy,
    solve status, rounding error, inverse mask, exact checks, factor det)`.
    Public units, logs, phases, and normalized factor are published together
    only after both exact unit checks succeed.  The input factor is never
    mutated; inversion negates the corresponding output factor column exactly
    as PARI mutates `*ptU`.
    """
    if precision < 64 or precision > 4096 or precision % 64 != 0:
        raise ValueError("unsupported signed cubic getfu precision")
    if phase_precision < 64 or phase_precision > 4096 or phase_precision % 64 != 0:
        raise ValueError("unsupported signed cubic phase precision")
    if (
        len(clean_logs) < 18
        or len(clean_phases) < 6
        or len(factor_transform) < 4
        or len(embedding_matrix) < 27
        or len(multiplication_basis) < 27
        or len(matep) < 18
        or len(transformed_arch) < 18
        or len(transformed_clean) < 18
        or len(transformed_phases) < 6
        or len(exponential_values) < 18
        or len(solve_work) < 27
        or len(solve_rhs) < 18
        or len(solved) < 18
        or len(rounded) < 6
        or len(multiplication) < 9
        or len(inverse) < 3
        or len(candidate_units) < 6
        or len(normalized_factor) < 4
        or len(output_units) < 6
        or len(output_logs) < 18
        or len(output_phases) < 6
        or len(output_factor) < 4
        or len(state) < 8
        or len(pivots) < 3
    ):
        raise ValueError("short signed cubic getfu workspace")
    pari_validate_regulator_values(clean_logs, 6)
    pari_validate_regulator_values(embedding_matrix, 9)
    for i in range(6):
        if clean_phases[i] != 0 and clean_phases[i] != 1:
            raise ValueError("cubic phases must encode zero or pi")
    factor_det = (
        factor_transform[0] * factor_transform[3]
        - factor_transform[1] * factor_transform[2]
    )
    if factor_det != 1 and factor_det != -1:
        raise ValueError("cubic unit factor must be unimodular")
    for i in range(8):
        state[i] = 0
    state[0] = -9
    state[7] = factor_det

    # fixarch: all three places are real, so the norm correction is real and
    # leaves the 0/pi phase bits unchanged.
    for j in range(2):
        base = 9 * j
        sm, sp, se = clean_logs[base], clean_logs[base + 1], clean_logs[base + 2]
        for i in range(1, 3):
            at = base + 3 * i
            sm, sp, se = pari_regulator_scalar_add(
                sm,
                sp,
                se,
                clean_logs[at],
                clean_logs[at + 1],
                clean_logs[at + 2],
            )
        sm, sp, se = pari_regulator_scalar_divide(-sm, sp, se, 3, -1, 0)
        for i in range(3):
            at = base + 3 * i
            mm, mp, me = pari_regulator_scalar_add(
                clean_logs[at],
                clean_logs[at + 1],
                clean_logs[at + 2],
                sm,
                sp,
                se,
            )
            matep[at] = mm
            matep[at + 1] = mp
            matep[at + 2] = me

    pari_getfu_cubic_transform_logs(matep, factor_transform, transformed_arch)
    pari_getfu_cubic_transform_logs(clean_logs, factor_transform, transformed_clean)
    pari_getfu_cubic_transform_phases(
        clean_phases, factor_transform, transformed_phases
    )

    maximum_exponent = -(1 << 61)
    for i in range(6):
        at = 3 * i
        exponent = pari_regulator_exponent(
            transformed_arch[at],
            transformed_arch[at + 1],
            transformed_arch[at + 2],
        )
        if exponent > maximum_exponent:
            maximum_exponent = exponent
        if exponent > 20:
            state[0] = 2
            state[1] = maximum_exponent
            return 2
    state[1] = maximum_exponent
    # expbitprec's imaginary branch for pi: expo(pi)+5-bit_prec(pi).
    phase_accuracy = -(1 << 61)
    for i in range(6):
        if transformed_phases[i] != 0:
            phase_accuracy = 6 - phase_precision
    state[2] = phase_accuracy
    if phase_accuracy >= 0:
        state[0] = 3
        return 3

    for i in range(6):
        at = 3 * i
        mm, mp, me = pari_prepared_exp(
            transformed_arch[at],
            transformed_arch[at + 1],
            transformed_arch[at + 2],
            exp_cache,
            exp_a,
            exp_b,
            exp_p,
            exp_q,
            exp_stack,
        )
        if transformed_phases[i] != 0:
            mm = -mm
        exponential_values[at] = mm
        exponential_values[at + 1] = mp
        exponential_values[at + 2] = me

    solve_status = pari_getfu_cubic_real_solve(
        embedding_matrix,
        exponential_values,
        solve_work,
        solve_rhs,
        solved,
        pivots,
    )
    state[3] = solve_status
    if solve_status != 0:
        state[0] = 3
        return 3
    worst_error = -(1 << 61)
    for i in range(6):
        at = 3 * i
        if solved[at + 1] < 0:
            rounded[i] = solved[at]
            error = -(1 << 61)
        else:
            rounded_value, error = pari_round_real(
                solved[at], solved[at + 1] - 1 - solved[at + 2], solved[at + 2]
            )
            rounded[i] = rounded_value
        if error > worst_error:
            worst_error = error
    state[4] = worst_error
    if worst_error >= 0:
        state[0] = 3
        return 3

    for i in range(6):
        candidate_units[i] = rounded[i]
    for i in range(4):
        normalized_factor[i] = factor_transform[i]
    inverse_mask = 0
    for j in range(2):
        check = pari_getfu_cubic_unit_inverse(
            candidate_units, 3 * j, multiplication_basis, multiplication, inverse
        )
        if check != 1:
            state[0] = 3
            return 3
        direct_norm = 0
        inverse_norm = 0
        for i in range(3):
            direct_norm += candidate_units[3 * j + i] * candidate_units[3 * j + i]
            inverse_norm += inverse[i] * inverse[i]
        if inverse_norm < direct_norm:
            inverse_mask += 1 << j
            for i in range(3):
                candidate_units[3 * j + i] = inverse[i]
                transformed_clean[9 * j + 3 * i] = -transformed_clean[9 * j + 3 * i]
            normalized_factor[2 * j] = -normalized_factor[2 * j]
            normalized_factor[2 * j + 1] = -normalized_factor[2 * j + 1]
        state[6] = j + 1

    for i in range(6):
        output_units[i] = candidate_units[i]
        output_phases[i] = transformed_phases[i]
    for i in range(18):
        output_logs[i] = transformed_clean[i]
    for i in range(4):
        output_factor[i] = normalized_factor[i]
    state[5] = inverse_mask
    state[0] = 0
    return 0
