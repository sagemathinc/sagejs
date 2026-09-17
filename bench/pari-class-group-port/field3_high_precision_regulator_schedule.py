"""Authenticated C4 regulator/L schedule for the hard mixed quartic.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The public coordinator consumes an eventual complete C3 packed logarithm
owner.  It never imports a resident regulator, relation lattice, unit, or
low-precision logarithm.  PARI's regulator-multiple schedule is reused, then
the exact-denominator-bound part of `compute_R` is replayed in source order.
The analytic `bad_check(z*R)` remains a separate dependency and is reported
explicitly rather than being replaced by an answer-derived value.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .regulator_approx_zero import pari_regulator_exponent
from .regulator_bestappr import (
    pari_regulator_bestappr_fraction,
    pari_regulator_bestappr_real,
)
from .regulator_hnf_wide import pari_regulator_hnf_wide
from .regulator_multiple import pari_regulator_multiple
from .regulator_reconstruction import (
    pari_regulator_denominator_lcm,
    pari_regulator_denominator_power,
)
from .regulator_scalar import (
    pari_regulator_qdiv,
    pari_regulator_scalar_add,
    pari_regulator_scalar_multiply,
)


@native
def pari_field3_regulator_owner_latches(
    packed_a: IntegerBuffer, logical_length: int
) -> tuple[int, int]:
    """Return two bounded integrity latches for an externally hashed owner."""
    if logical_length != 273 or len(packed_a) < logical_length:
        raise ValueError("wrong field-3 C3 owner length")
    modulus1 = 2305843009213693951
    modulus2 = 2305843009213693921
    first = logical_length
    second = 3 * logical_length
    for index in range(logical_length):
        value = packed_a[index]
        first = (first * 1000003 + value % modulus1 + index + 1) % modulus1
        second = (second * 1000033 + value % modulus2 + index + 1) % modulus2
    return first, second


@native
def pari_field3_reconstruct_with_bound(
    coordinates: IntegerBuffer,
    multiple: IntegerBuffer,
    denominator_bound: int,
    rational_work: IntegerBuffer,
    integer_work: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_column: IntegerBuffer,
    hnf_output: IntegerBuffer,
    hnf_state: Int64Buffer,
    candidate_regulator: IntegerBuffer,
    candidate_relations: IntegerBuffer,
    denominator: IntegerBuffer,
    state: Int64Buffer,
    hnf_row_pivots: Int64Buffer,
    hnf_heights: Int64Buffer,
) -> int:
    """Replay `compute_R` through candidate R/L, before analytic bad_check."""
    rows = 2
    columns = 13
    size = rows * columns
    if denominator_bound <= 0 or denominator_bound.bit_length() > 1856:
        raise ValueError("invalid exact regulator denominator bound")
    if (
        len(coordinates) < 3 * size
        or len(multiple) < 3
        or len(rational_work) < 3 * size
        or len(integer_work) < size
        or len(hnf_work) < size
        or len(hnf_column) < rows
        or len(hnf_output) < size
        or len(hnf_state) < 15
        or len(candidate_regulator) < 3
        or len(candidate_relations) < size
        or len(denominator) < 1
        or len(state) < 5
        or len(hnf_row_pivots) < rows
        or len(hnf_heights) < columns
    ):
        raise ValueError("short field-3 reconstruction workspace")
    if multiple[0] <= 0 or multiple[1] < 64:
        raise ValueError("field-3 regulator multiple must be positive")
    state[0] = 3
    state[1] = 1
    state[2] = 0
    state[3] = 0
    state[4] = denominator_bound
    for index in range(size):
        at = 3 * index
        m, p, e = coordinates[at], coordinates[at + 1], coordinates[at + 2]
        if p == -2:
            m, p, e = pari_regulator_bestappr_fraction(m, e, denominator_bound)
        elif p >= 0:
            status, m, p, e = pari_regulator_bestappr_real(m, p, e, denominator_bound)
            if status != 0:
                return 3
        rational_work[at] = m
        rational_work[at + 1] = p
        rational_work[at + 2] = e
    den = 1
    for column in range(columns):
        column_den = 1
        for row in range(rows):
            at = 3 * (column * rows + row)
            current = 1
            if rational_work[at + 1] == -2:
                current = rational_work[at + 2]
            if row == 0:
                column_den = current
            elif current != 1:
                column_den = pari_regulator_denominator_lcm(column_den, current)
        if column == 0:
            den = column_den
        elif column_den != 1:
            den = pari_regulator_denominator_lcm(den, column_den)
    denominator[0] = den
    state[1] = 2
    if den > denominator_bound:
        return 3
    error_exponent = -(1 << 61)
    for index in range(size):
        at = 3 * index
        m, p, e = pari_regulator_scalar_add(
            rational_work[at],
            rational_work[at + 1],
            rational_work[at + 2],
            -coordinates[at],
            coordinates[at + 1],
            coordinates[at + 2],
        )
        exponent = pari_regulator_exponent(m, p, e)
        if exponent > error_exponent:
            error_exponent = exponent
    bits = -error_exponent
    state[2] = bits
    lattice_exponent = -(1 << 61)
    for index in range(size):
        at = 3 * index
        factor = den
        if rational_work[at + 1] == -2:
            factor //= rational_work[at + 2]
        value = rational_work[at] * factor
        integer_work[index] = value
        if value != 0 and abs(value).bit_length() - 1 > lattice_exponent:
            lattice_exponent = abs(value).bit_length() - 1
    if lattice_exponent + den.bit_length() - 1 > bits - 32:
        return 3
    state[1] = 3
    status = pari_regulator_hnf_wide(
        integer_work,
        rows,
        columns,
        hnf_work,
        hnf_column,
        hnf_row_pivots,
        hnf_heights,
        hnf_output,
        hnf_state,
    )
    if status != 0:
        state[0] = -1
        return -1
    rank = hnf_state[1]
    state[3] = rank
    if rank != rows:
        return 3
    determinant = hnf_output[0] * hnf_output[rows + 1]
    power = pari_regulator_denominator_power(den, rank)
    fm, fp, fe = pari_regulator_qdiv(determinant, power)
    rm, rp, re = pari_regulator_scalar_multiply(
        multiple[0], multiple[1], multiple[2], fm, fp, fe
    )
    state[1] = 4
    if pari_regulator_exponent(rm, rp, re) < -3:
        return 3
    candidate_regulator[0] = rm
    candidate_regulator[1] = rp
    candidate_regulator[2] = re
    for index in range(size):
        candidate_relations[index] = integer_work[index]
    state[0] = 0
    state[1] = 5
    return 0


@native
def pari_field3_high_precision_regulator_schedule(
    packed_a: IntegerBuffer,
    polynomial: IntegerBuffer,
    signature: Int64Buffer,
    c3_state: Int64Buffer,
    retry_protocol: Int64Buffer,
    c3_hash: Int64Buffer,
    expected_hash: Int64Buffer,
    expected_latches: IntegerBuffer,
    denominator_bound: int,
    prepared: IntegerBuffer,
    selected: Int64Buffer,
    prep_state: Int64Buffer,
    rank_work: IntegerBuffer,
    rank_occupied: Int64Buffer,
    rank_pivots: Int64Buffer,
    rank_state: Int64Buffer,
    integer_input: IntegerBuffer,
    integer_rank_work: IntegerBuffer,
    integer_occupied: IntegerBuffer,
    integer_pivots: IntegerBuffer,
    integer_best: IntegerBuffer,
    integer_state: IntegerBuffer,
    basis: IntegerBuffer,
    minor: IntegerBuffer,
    det_work: IntegerBuffer,
    det_result: IntegerBuffer,
    det_pivots: Int64Buffer,
    det_state: Int64Buffer,
    inverse_work: IntegerBuffer,
    inverse_rhs: IntegerBuffer,
    inverse: IntegerBuffer,
    inverse_pivots: Int64Buffer,
    inverse_state: Int64Buffer,
    product: IntegerBuffer,
    inverse_slice: IntegerBuffer,
    multiple: IntegerBuffer,
    coordinates: IntegerBuffer,
    multiple_state: Int64Buffer,
    rational_work: IntegerBuffer,
    lattice: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_column: IntegerBuffer,
    hnf_output: IntegerBuffer,
    hnf_state: Int64Buffer,
    candidate_regulator: IntegerBuffer,
    candidate_relations: IntegerBuffer,
    denominator: IntegerBuffer,
    reconstruction_state: Int64Buffer,
    hnf_row_pivots: Int64Buffer,
    hnf_heights: Int64Buffer,
    real_logs: IntegerBuffer,
    published_hash: Int64Buffer,
    published_latches: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Derive candidate R/L only from a complete authenticated C3 A owner.

    State is status, precision, C3 generation, multiple status,
    reconstruction status, candidate-published flag, and analytic-acceptance
    pending flag. Status 7 means the real complete C3 dependency is absent.
    """
    if (
        len(state) < 7
        or len(signature) < 8
        or len(c3_state) < 8
        or len(retry_protocol) < 4
        or len(c3_hash) < 4
        or len(expected_hash) < 4
        or len(published_hash) < 4
    ):
        raise ValueError("short field-3 C4 protocol state")
    if (
        len(polynomial) < 5
        or polynomial[0] != -2000042
        or polynomial[1] != -2000022
        or polynomial[2] != 0
        or polynomial[3] != 0
        or polynomial[4] != 1
    ):
        raise ValueError("wrong field-3 C4 polynomial owner")
    if (
        signature[0] != 4
        or signature[1] != 2
        or signature[2] != 1
        or signature[3] != 3
        or signature[4] != 13
        or signature[5] != 273
        or signature[6] != 1
        or signature[7] != 2
    ):
        raise ValueError("wrong field-3 C4 signature protocol")
    precision = c3_state[4]
    if precision != 192 and precision != 153088 and precision != 153152:
        raise ValueError("unsupported field-3 C4 precision")
    if precision == 192:
        if (
            retry_protocol[0] != 0
            or retry_protocol[1] != 1
            or retry_protocol[2] != 0
            or retry_protocol[3] != 0
        ):
            raise ValueError("wrong low-precision C4 retry protocol")
    elif precision == 153088:
        if (
            retry_protocol[0] != 0
            or retry_protocol[1] != 2
            or retry_protocol[2] != 0
            or retry_protocol[3] != 153152
        ):
            raise ValueError("wrong initial field-3 C4 retry protocol")
    elif (
        retry_protocol[0] != 1
        or retry_protocol[1] != 2
        or retry_protocol[2] != 153088
        or retry_protocol[3] != 0
    ):
        raise ValueError("wrong escalated field-3 C4 retry protocol")
    if (
        c3_state[0] != 0
        or c3_state[1] != 1
        or c3_state[2] != 3
        or c3_state[3] != 13
        or c3_state[5] <= 0
        or c3_state[6] != 273
        or c3_state[7] != 1
    ):
        return 7
    if len(expected_latches) < 2 or len(published_latches) < 2:
        raise ValueError("short field-3 C4 owner latches")
    for index in range(4):
        if c3_hash[index] != expected_hash[index]:
            raise ValueError("field-3 C3 owner hash mismatch")
    first, second = pari_field3_regulator_owner_latches(packed_a, 273)
    if expected_latches[0] != first or expected_latches[1] != second:
        raise ValueError("field-3 C3 owner latch mismatch")
    if len(real_logs) < 117:
        raise ValueError("short field-3 C4 real-log staging")
    # Validate kinds, ordering, normalization, and target precision before
    # changing any scratch owner.
    for index in range(39):
        base = 7 * index
        kind = packed_a[base]
        if kind != 1 and kind != 2:
            raise ValueError("invalid field-3 C3 log kind")
        m, p, e = packed_a[base + 1], packed_a[base + 2], packed_a[base + 3]
        if m == 0:
            if p != 0 and p != -1:
                raise ValueError("invalid field-3 C3 real zero")
        elif p != precision or abs(m).bit_length() != p:
            raise ValueError("field-3 C3 precision/order mismatch")
        if kind == 1 and (
            packed_a[base + 4] != 0
            or packed_a[base + 5] != -1
            or packed_a[base + 6] != 0
        ):
            raise ValueError("invalid field-3 C3 real log encoding")
    for index in range(39):
        source = 7 * index + 1
        target = 3 * index
        real_logs[target] = packed_a[source]
        real_logs[target + 1] = packed_a[source + 1]
        real_logs[target + 2] = packed_a[source + 2]
    status = pari_regulator_multiple(
        real_logs,
        3,
        13,
        4,
        prepared,
        selected,
        prep_state,
        rank_work,
        rank_occupied,
        rank_pivots,
        rank_state,
        integer_input,
        integer_rank_work,
        integer_occupied,
        integer_pivots,
        integer_best,
        integer_state,
        basis,
        minor,
        det_work,
        det_result,
        det_pivots,
        det_state,
        inverse_work,
        inverse_rhs,
        inverse,
        inverse_pivots,
        inverse_state,
        product,
        inverse_slice,
        multiple,
        coordinates,
        multiple_state,
    )
    state[0] = status
    state[1] = precision
    state[2] = c3_state[5]
    state[3] = status
    state[4] = -1
    state[5] = 0
    state[6] = 1
    if status != 0:
        return status
    status = pari_field3_reconstruct_with_bound(
        coordinates,
        multiple,
        denominator_bound,
        rational_work,
        lattice,
        hnf_work,
        hnf_column,
        hnf_output,
        hnf_state,
        candidate_regulator,
        candidate_relations,
        denominator,
        reconstruction_state,
        hnf_row_pivots,
        hnf_heights,
    )
    state[0] = status
    state[4] = status
    if status != 0:
        return status
    published_latches[0] = first
    published_latches[1] = second
    for index in range(4):
        published_hash[index] = c3_hash[index]
    state[5] = 1
    return 0


__all__ = [
    "pari_field3_high_precision_regulator_schedule",
    "pari_field3_reconstruct_with_bound",
    "pari_field3_regulator_owner_latches",
]
