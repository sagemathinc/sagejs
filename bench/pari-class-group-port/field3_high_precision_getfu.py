"""Authenticated C6 `getfu` publication for the hard mixed quartic.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This source-transparent root joins the accepted C5 unit-lattice owner to the
rebuilt number-field embeddings and exact multiplication tensor.  It follows
PARI 2.17.4 `buch2.c:getfu`: rebuild `fixarch`, apply the retained internal LLL
factor, exponentiate and solve, authenticate the two exact units, choose an
inverse only when its coefficient norm is smaller, and apply the same signs to
the retained raw unit transform.  All public arrays are written only after a
successful attempt.  `LARGE` and `PRECI` are faithful terminal flag-zero
outcomes, not Buchall retries.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .field3_mixed_unit_suffix import pari_field3_prepare_getfu
from .getfu_mixed_quartic import pari_getfu_mixed_quartic


@native
def pari_field3_high_precision_getfu(
    clean_packed: IntegerBuffer,
    getfu_factor: IntegerBuffer,
    prepared_arch_real: IntegerBuffer,
    prepared_arch_imag: IntegerBuffer,
    prepared_clean_real: IntegerBuffer,
    prepared_clean_imag: IntegerBuffer,
    raw_unit_transform: IntegerBuffer,
    embedding_real: IntegerBuffer,
    embedding_imag: IntegerBuffer,
    multiplication_basis: IntegerBuffer,
    precision: int,
    generation: int,
    matep: IntegerBuffer,
    arch: IntegerBuffer,
    factored_clean: IntegerBuffer,
    arch_real: IntegerBuffer,
    arch_imag: IntegerBuffer,
    clean_real: IntegerBuffer,
    clean_imag: IntegerBuffer,
    exponential_real: IntegerBuffer,
    exponential_imag: IntegerBuffer,
    split_matrix: IntegerBuffer,
    split_rhs: IntegerBuffer,
    solve_work: IntegerBuffer,
    solve_rhs: IntegerBuffer,
    solved: IntegerBuffer,
    rounded: IntegerBuffer,
    multiplication: IntegerBuffer,
    inverse: IntegerBuffer,
    candidate_units: IntegerBuffer,
    normalized_factor: IntegerBuffer,
    candidate_logs_real: IntegerBuffer,
    candidate_logs_imag: IntegerBuffer,
    getfu_state: Int64Buffer,
    pivots: Int64Buffer,
    exp_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    adjusted_wraw: IntegerBuffer,
    output_units: IntegerBuffer,
    output_logs_real: IntegerBuffer,
    output_logs_imag: IntegerBuffer,
    output_factor: IntegerBuffer,
    output_wraw: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Run one authenticated C6 attempt and publish atomically.

    `raw_unit_transform` is the source-order 301-by-2 exact transform after
    C5's retained getfu factor.  Successful inverse choices negate the same
    complete columns.  Status 2 and 3 publish only terminal metadata; every
    mathematical output remains unchanged.
    """
    if precision < 64 or precision > 153088 or precision % 64 != 0:
        raise ValueError("unsupported field-3 C6 precision")
    if generation <= 0:
        raise ValueError("invalid field-3 C5 generation")
    required_coefficients = 512
    required_stack = 91
    if precision > 768:
        required_coefficients = 16385
        required_stack = 105
    if (
        len(clean_packed) < 42
        or len(getfu_factor) < 4
        or len(prepared_arch_real) < 18
        or len(prepared_arch_imag) < 18
        or len(prepared_clean_real) < 18
        or len(prepared_clean_imag) < 18
        or len(raw_unit_transform) < 602
        or len(embedding_real) < 36
        or len(embedding_imag) < 36
        or len(multiplication_basis) < 64
        or len(matep) < 42
        or len(arch) < 42
        or len(factored_clean) < 42
        or len(arch_real) < 18
        or len(arch_imag) < 18
        or len(clean_real) < 18
        or len(clean_imag) < 18
        or len(exponential_real) < 18
        or len(exponential_imag) < 18
        or len(split_matrix) < 48
        or len(split_rhs) < 24
        or len(solve_work) < 48
        or len(solve_rhs) < 24
        or len(solved) < 24
        or len(rounded) < 8
        or len(multiplication) < 16
        or len(inverse) < 4
        or len(candidate_units) < 8
        or len(normalized_factor) < 4
        or len(candidate_logs_real) < 18
        or len(candidate_logs_imag) < 18
        or len(getfu_state) < 8
        or len(pivots) < 4
        or len(exp_cache) < 3
        or len(pi_cache) < 3
        or len(a) < required_coefficients
        or len(b) < required_coefficients
        or len(p) < required_coefficients
        or len(q) < required_coefficients
        or len(stack) < required_stack
        or len(adjusted_wraw) < 602
        or len(output_units) < 8
        or len(output_logs_real) < 18
        or len(output_logs_imag) < 18
        or len(output_factor) < 4
        or len(output_wraw) < 602
        or len(state) < 12
    ):
        raise ValueError("short field-3 C6 owner or workspace")

    determinant = getfu_factor[0] * getfu_factor[3]
    determinant -= getfu_factor[1] * getfu_factor[2]
    if determinant != 1 and determinant != -1:
        raise ValueError("field-3 C5 getfu factor is not unimodular")
    # Multiplication by basis element one must be the identity.  The complete
    # 64-cell tensor is separately bound by the immutable embedding owner.
    for row in range(4):
        for column in range(4):
            expected = 0
            if row == column:
                expected = 1
            if multiplication_basis[4 * column + row] != expected:
                raise ValueError("wrong field-3 multiplication owner")

    # Do not trust redundant prepared arrays from C5: derive them again from
    # the pre-getfu clean matrix and exact factor before entering getfu.
    pari_field3_prepare_getfu(
        clean_packed,
        getfu_factor,
        matep,
        arch,
        factored_clean,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )
    for index in range(18):
        if (
            arch_real[index] != prepared_arch_real[index]
            or arch_imag[index] != prepared_arch_imag[index]
            or clean_real[index] != prepared_clean_real[index]
            or clean_imag[index] != prepared_clean_imag[index]
        ):
            raise ValueError("field-3 C5 prepared getfu arrays changed")

    status = pari_getfu_mixed_quartic(
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
        getfu_factor,
        embedding_real,
        embedding_imag,
        multiplication_basis,
        precision,
        exponential_real,
        exponential_imag,
        split_matrix,
        split_rhs,
        solve_work,
        solve_rhs,
        solved,
        rounded,
        multiplication,
        inverse,
        candidate_units,
        normalized_factor,
        candidate_units,
        candidate_logs_real,
        candidate_logs_imag,
        normalized_factor,
        getfu_state,
        pivots,
        exp_cache,
        pi_cache,
        a,
        b,
        p,
        q,
        stack,
    )
    if status != 0 and status != 2 and status != 3:
        raise ValueError("invalid field-3 getfu terminal status")

    # Terminal flag-zero not_given is a committed status, but never exposes
    # partial exact units, logs, factors, or Wraw.
    if status != 0:
        state[0] = status
        state[1] = precision
        state[2] = generation
        state[3] = 0
        state[4] = 0
        state[5] = determinant
        state[6] = required_coefficients
        state[7] = 301
        state[8] = getfu_state[3]
        state[9] = getfu_state[4]
        state[10] = 0
        state[11] = 0
        return status

    inverse_mask = getfu_state[5]
    if inverse_mask < 0 or inverse_mask > 3 or getfu_state[6] != 2:
        raise ValueError("invalid field-3 getfu success state")
    for column in range(2):
        sign = 1
        if inverse_mask & (1 << column):
            sign = -1
        for row in range(301):
            at = 301 * column + row
            adjusted_wraw[at] = sign * raw_unit_transform[at]

    for index in range(8):
        output_units[index] = candidate_units[index]
    for index in range(18):
        output_logs_real[index] = candidate_logs_real[index]
        output_logs_imag[index] = candidate_logs_imag[index]
    for index in range(4):
        output_factor[index] = normalized_factor[index]
    for index in range(602):
        output_wraw[index] = adjusted_wraw[index]
    state[0] = 0
    state[1] = precision
    state[2] = generation
    state[3] = 2
    state[4] = inverse_mask
    state[5] = determinant
    state[6] = required_coefficients
    state[7] = 301
    state[8] = getfu_state[3]
    state[9] = getfu_state[4]
    state[10] = 1
    state[11] = 602
    return 0


__all__ = ["pari_field3_high_precision_getfu"]
