"""Prepared exact rational Cantor arithmetic backed by FLINT scratch storage.

The generalized Cantor formulas in this module are ordinary typed Python.  The
`@native` compiler lowers those formulas and the declared FLINT workspace calls
into one isolated exact kernel.  FLINT supplies polynomial representation and
in-place primitives only; it does not hide a second implementation of the
Jacobian group law.

The prepared public boundary is deliberately narrow: odd-degree, one-point at
infinity genus-2 and genus-3 Jacobians over `QQ`.  Its workspace has a fixed
number of polynomial slots, so scalar loops do not allocate foreign resources.
Proof-producing callers can request a replay certificate, whose verifier
recomputes every operation through the ordinary reference Cantor path.
"""

from __future__ import annotations

import hashlib
import time
from typing import Any

import sagejs.runtime as runtime
from sagejs.ffi.flint import (
    FmpqMumfordResult,
    FmpqPolynomial,
    FmpqPolynomialPair,
    FmpqPolynomialWorkspace,
    fmpq_polynomial_workspace,
    fmpq_polynomial_workspace_add,
    fmpq_polynomial_workspace_allocated_bytes,
    fmpq_polynomial_workspace_coefficient_denominator,
    fmpq_polynomial_workspace_coefficient_numerator,
    fmpq_polynomial_workspace_copy,
    fmpq_polynomial_workspace_copy_pair_out,
    fmpq_polynomial_workspace_divexact,
    fmpq_polynomial_workspace_equal,
    fmpq_polynomial_workspace_is_one,
    fmpq_polynomial_workspace_is_zero,
    fmpq_polynomial_workspace_length,
    fmpq_polynomial_workspace_load,
    fmpq_polynomial_workspace_load_mumford_result,
    fmpq_polynomial_workspace_load_pair,
    fmpq_polynomial_workspace_monic,
    fmpq_polynomial_workspace_move_mumford_result_out,
    fmpq_polynomial_workspace_mul,
    fmpq_polynomial_workspace_neg,
    fmpq_polynomial_workspace_one,
    fmpq_polynomial_workspace_rem,
    fmpq_polynomial_workspace_sub,
    fmpq_polynomial_workspace_swap,
    fmpq_polynomial_workspace_xgcd,
    fmpq_polynomial_workspace_zero,
)
from sagejs.native import (
    IntegerBuffer,
    integer_buffer_values,
    is_compiled,
    kernel_integer_zeros,
    native,
    uint64,
)

PACKED_RATIONAL_MUMFORD_SCHEMA = "sagejs.hyperelliptic.rational-mumford.v1"
_OUTPUT_WORDS = 16
_WORKSPACE_SLOTS = 48


def _reduce_one(
    workspace: FmpqPolynomialWorkspace,
    u: uint64,
    v: uint64,
    f: uint64,
    h: uint64,
    genus: uint64,
) -> bool:
    square: uint64 = 30
    product: uint64 = 31
    numerator: uint64 = 32
    quotient: uint64 = 33
    monic: uint64 = 34
    temporary: uint64 = 35
    negative: uint64 = 36
    next_v: uint64 = 38
    steps = 0
    while fmpq_polynomial_workspace_length(workspace, u) > genus + 1:
        if not fmpq_polynomial_workspace_mul(workspace, square, v, v):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, product, h, v):
            return False
        if not fmpq_polynomial_workspace_add(workspace, numerator, square, product):
            return False
        if not fmpq_polynomial_workspace_sub(workspace, numerator, numerator, f):
            return False
        if not fmpq_polynomial_workspace_divexact(workspace, quotient, numerator, u):
            return False
        if not fmpq_polynomial_workspace_monic(workspace, monic, quotient):
            return False
        if not fmpq_polynomial_workspace_add(workspace, temporary, h, v):
            return False
        if not fmpq_polynomial_workspace_neg(workspace, negative, temporary):
            return False
        if not fmpq_polynomial_workspace_rem(workspace, next_v, negative, monic):
            return False
        if not fmpq_polynomial_workspace_swap(workspace, u, monic):
            return False
        if not fmpq_polynomial_workspace_swap(workspace, v, next_v):
            return False
        steps += 1
        if steps > 8:
            return False
    if not fmpq_polynomial_workspace_rem(workspace, next_v, v, u):
        return False
    return fmpq_polynomial_workspace_copy(workspace, v, next_v)


def _cantor_add_one(
    workspace: FmpqPolynomialWorkspace,
    f: uint64,
    h: uint64,
    u1: uint64,
    v1: uint64,
    u2: uint64,
    v2: uint64,
    output_u: uint64,
    output_v: uint64,
    genus: uint64,
) -> bool:
    if fmpq_polynomial_workspace_is_one(workspace, u1) == 1:
        if not fmpq_polynomial_workspace_copy(workspace, output_u, u2):
            return False
        return fmpq_polynomial_workspace_copy(workspace, output_v, v2)
    if fmpq_polynomial_workspace_is_one(workspace, u2) == 1:
        if not fmpq_polynomial_workspace_copy(workspace, output_u, u1):
            return False
        return fmpq_polynomial_workspace_copy(workspace, output_v, v1)

    if (
        fmpq_polynomial_workspace_equal(workspace, u1, u2) == 1
        and fmpq_polynomial_workspace_equal(workspace, v1, v2) == 1
    ):
        double_v: uint64 = 8
        tangent: uint64 = 9
        common: uint64 = 10
        ignored: uint64 = 11
        bezout: uint64 = 12
        quotient: uint64 = 13
        u3: uint64 = 14
        hv: uint64 = 15
        vv: uint64 = 16
        numerator: uint64 = 17
        correction: uint64 = 18
        product: uint64 = 19
        v3: uint64 = 20
        if not fmpq_polynomial_workspace_add(workspace, double_v, v1, v1):
            return False
        if not fmpq_polynomial_workspace_add(workspace, tangent, double_v, h):
            return False
        if not fmpq_polynomial_workspace_xgcd(
            workspace, common, ignored, bezout, u1, tangent
        ):
            return False
        if not fmpq_polynomial_workspace_divexact(workspace, quotient, u1, common):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, u3, quotient, quotient):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, hv, h, v1):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, vv, v1, v1):
            return False
        if not fmpq_polynomial_workspace_sub(workspace, numerator, f, hv):
            return False
        if not fmpq_polynomial_workspace_sub(workspace, numerator, numerator, vv):
            return False
        if not fmpq_polynomial_workspace_divexact(
            workspace, correction, numerator, common
        ):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, product, bezout, correction):
            return False
        if not fmpq_polynomial_workspace_add(workspace, v3, v1, product):
            return False
        if not fmpq_polynomial_workspace_rem(workspace, output_v, v3, u3):
            return False
        if not fmpq_polynomial_workspace_copy(workspace, output_u, u3):
            return False
        return _reduce_one(workspace, output_u, output_v, f, h, genus)

    common0: uint64 = 8
    ignored0: uint64 = 9
    right0: uint64 = 10
    difference: uint64 = 11
    if not fmpq_polynomial_workspace_xgcd(workspace, common0, ignored0, right0, u1, u2):
        return False
    if not fmpq_polynomial_workspace_sub(workspace, difference, v1, v2):
        return False
    if fmpq_polynomial_workspace_is_one(workspace, common0) == 1:
        product0: uint64 = 12
        product1: uint64 = 13
        v3: uint64 = 14
        if not fmpq_polynomial_workspace_mul(workspace, output_u, u1, u2):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, product0, right0, u2):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, product1, product0, difference):
            return False
        if not fmpq_polynomial_workspace_add(workspace, v3, v2, product1):
            return False
        if not fmpq_polynomial_workspace_rem(workspace, output_v, v3, output_u):
            return False
        return _reduce_one(workspace, output_u, output_v, f, h, genus)

    conjugate0: uint64 = 12
    conjugate: uint64 = 13
    if not fmpq_polynomial_workspace_add(workspace, conjugate0, v1, v2):
        return False
    if not fmpq_polynomial_workspace_add(workspace, conjugate, conjugate0, h):
        return False
    if fmpq_polynomial_workspace_is_zero(workspace, conjugate) == 1:
        product: uint64 = 14
        common_square: uint64 = 15
        quotient: uint64 = 16
        first: uint64 = 17
        second: uint64 = 18
        v3: uint64 = 19
        if not fmpq_polynomial_workspace_mul(workspace, product, u1, u2):
            return False
        if not fmpq_polynomial_workspace_mul(
            workspace, common_square, common0, common0
        ):
            return False
        if not fmpq_polynomial_workspace_divexact(
            workspace, output_u, product, common_square
        ):
            return False
        if not fmpq_polynomial_workspace_divexact(workspace, quotient, u2, common0):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, first, right0, difference):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, second, first, quotient):
            return False
        if not fmpq_polynomial_workspace_add(workspace, v3, v2, second):
            return False
        if not fmpq_polynomial_workspace_rem(workspace, output_v, v3, output_u):
            return False
        return _reduce_one(workspace, output_u, output_v, f, h, genus)

    common: uint64 = 14
    coefficient0: uint64 = 15
    coefficient1: uint64 = 16
    product: uint64 = 17
    common_square: uint64 = 18
    first0: uint64 = 19
    first1: uint64 = 20
    first: uint64 = 21
    hv: uint64 = 22
    vv: uint64 = 23
    bracket: uint64 = 24
    second: uint64 = 25
    numerator: uint64 = 26
    quotient: uint64 = 27
    v3: uint64 = 28
    if not fmpq_polynomial_workspace_xgcd(
        workspace, common, coefficient0, coefficient1, common0, conjugate
    ):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, product, u1, u2):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, common_square, common, common):
        return False
    if not fmpq_polynomial_workspace_divexact(
        workspace, output_u, product, common_square
    ):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, first0, coefficient0, right0):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, first1, first0, difference):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, first, first1, u2):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, hv, h, v2):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, vv, v2, v2):
        return False
    if not fmpq_polynomial_workspace_sub(workspace, bracket, f, hv):
        return False
    if not fmpq_polynomial_workspace_sub(workspace, bracket, bracket, vv):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, second, coefficient1, bracket):
        return False
    if not fmpq_polynomial_workspace_add(workspace, numerator, first, second):
        return False
    if not fmpq_polynomial_workspace_divexact(workspace, quotient, numerator, common):
        return False
    if not fmpq_polynomial_workspace_add(workspace, v3, v2, quotient):
        return False
    if not fmpq_polynomial_workspace_rem(workspace, output_v, v3, output_u):
        return False
    return _reduce_one(workspace, output_u, output_v, f, h, genus)


def _write_pair(
    output: IntegerBuffer,
    workspace: FmpqPolynomialWorkspace,
    u: uint64,
    v: uint64,
) -> bool:
    index: uint64 = 0
    while index < 16:
        output[index] = 0
        index += 1
    u_length = fmpq_polynomial_workspace_length(workspace, u)
    v_length = fmpq_polynomial_workspace_length(workspace, v)
    if u_length == 0 or u_length > 4 or v_length > 3:
        return False
    output[0] = u_length
    output[1] = v_length
    index = 0
    while index < u_length:
        output[2 + 2 * index] = fmpq_polynomial_workspace_coefficient_numerator(
            workspace, u, index
        )
        output[3 + 2 * index] = fmpq_polynomial_workspace_coefficient_denominator(
            workspace, u, index
        )
        index += 1
    index = 0
    while index < v_length:
        output[10 + 2 * index] = fmpq_polynomial_workspace_coefficient_numerator(
            workspace, v, index
        )
        output[11 + 2 * index] = fmpq_polynomial_workspace_coefficient_denominator(
            workspace, v, index
        )
        index += 1
    return True


@native
def rational_cantor_add(
    output: IntegerBuffer,
    workspace: FmpqPolynomialWorkspace,
    f: FmpqPolynomial,
    h: FmpqPolynomial,
    u1: FmpqPolynomial,
    v1: FmpqPolynomial,
    u2: FmpqPolynomial,
    v2: FmpqPolynomial,
    genus: uint64,
) -> bool:
    """Add one rational Mumford pair into a fixed exact output buffer."""
    if len(output) < 16 or genus < 2 or genus > 3:
        return False
    f_slot: uint64 = 0
    h_slot: uint64 = 1
    u1_slot: uint64 = 2
    v1_slot: uint64 = 3
    u2_slot: uint64 = 4
    v2_slot: uint64 = 5
    output_u: uint64 = 6
    output_v: uint64 = 7
    if not fmpq_polynomial_workspace_load(workspace, f_slot, f):
        return False
    if not fmpq_polynomial_workspace_load(workspace, h_slot, h):
        return False
    if not fmpq_polynomial_workspace_load(workspace, u1_slot, u1):
        return False
    if not fmpq_polynomial_workspace_load(workspace, v1_slot, v1):
        return False
    if not fmpq_polynomial_workspace_load(workspace, u2_slot, u2):
        return False
    if not fmpq_polynomial_workspace_load(workspace, v2_slot, v2):
        return False
    if not _cantor_add_one(
        workspace,
        f_slot,
        h_slot,
        u1_slot,
        v1_slot,
        u2_slot,
        v2_slot,
        output_u,
        output_v,
        genus,
    ):
        return False
    return _write_pair(output, workspace, output_u, output_v)


@native
def rational_cantor_add_pairs(
    output: IntegerBuffer,
    workspace: FmpqPolynomialWorkspace,
    f: FmpqPolynomial,
    h: FmpqPolynomial,
    left: FmpqPolynomialPair,
    right: FmpqPolynomialPair,
    genus: uint64,
) -> bool:
    """Add two retained rational Mumford pairs in exact FLINT storage."""
    if len(output) < 16 or genus < 2 or genus > 3:
        return False
    f_slot: uint64 = 0
    h_slot: uint64 = 1
    u1_slot: uint64 = 2
    v1_slot: uint64 = 3
    u2_slot: uint64 = 4
    v2_slot: uint64 = 5
    output_u: uint64 = 6
    output_v: uint64 = 7
    if not fmpq_polynomial_workspace_load(workspace, f_slot, f):
        return False
    if not fmpq_polynomial_workspace_load(workspace, h_slot, h):
        return False
    if not fmpq_polynomial_workspace_load_pair(workspace, u1_slot, v1_slot, left):
        return False
    if not fmpq_polynomial_workspace_load_pair(workspace, u2_slot, v2_slot, right):
        return False
    if not _cantor_add_one(
        workspace,
        f_slot,
        h_slot,
        u1_slot,
        v1_slot,
        u2_slot,
        v2_slot,
        output_u,
        output_v,
        genus,
    ):
        return False
    return _write_pair(output, workspace, output_u, output_v)


@native
def rational_cantor_add_pair_result(
    output: IntegerBuffer,
    workspace: FmpqPolynomialWorkspace,
    f: FmpqPolynomial,
    h: FmpqPolynomial,
    left: FmpqPolynomialPair,
    right: FmpqPolynomialPair,
    genus: uint64,
) -> FmpqPolynomialPair:
    """Add retained pairs and transfer the exact pair in the same boundary.

    `output` remains the authoritative primitive row.  The returned opaque
    pair is an acceleration snapshot of the same reduced workspace slots.
    Invalid internal arithmetic deliberately marks the row malformed so the
    closure-private publisher rejects it and closes the returned resource.
    """
    f_slot: uint64 = 0
    h_slot: uint64 = 1
    u1_slot: uint64 = 2
    v1_slot: uint64 = 3
    u2_slot: uint64 = 4
    v2_slot: uint64 = 5
    output_u: uint64 = 6
    output_v: uint64 = 7
    success = len(output) >= 16 and genus >= 2 and genus <= 3
    if success:
        success = fmpq_polynomial_workspace_load(workspace, f_slot, f)
    if success:
        success = fmpq_polynomial_workspace_load(workspace, h_slot, h)
    if success:
        success = fmpq_polynomial_workspace_load_pair(workspace, u1_slot, v1_slot, left)
    if success:
        success = fmpq_polynomial_workspace_load_pair(
            workspace, u2_slot, v2_slot, right
        )
    if success:
        success = _cantor_add_one(
            workspace,
            f_slot,
            h_slot,
            u1_slot,
            v1_slot,
            u2_slot,
            v2_slot,
            output_u,
            output_v,
            genus,
        )
    if success:
        success = _write_pair(output, workspace, output_u, output_v)
    if not success and len(output) >= 2:
        output[0] = 0
        output[1] = 0
    return fmpq_polynomial_workspace_copy_pair_out(workspace, output_u, output_v)


def _zero_pair(
    workspace: FmpqPolynomialWorkspace, u_slot: uint64, v_slot: uint64
) -> bool:
    """Leave two scratch slots in a valid, deliberately non-Mumford state."""
    if not fmpq_polynomial_workspace_zero(workspace, u_slot):
        return False
    return fmpq_polynomial_workspace_zero(workspace, v_slot)


@native
def rational_mumford_result_from_polynomials(
    workspace: FmpqPolynomialWorkspace,
    u: FmpqPolynomial,
    v: FmpqPolynomial,
    genus: uint64,
) -> FmpqMumfordResult:
    """Move one validated public Mumford pair into an opaque exact owner."""
    output_u: uint64 = 12
    output_v: uint64 = 13
    success = genus >= 2 and genus <= 3
    if success:
        success = fmpq_polynomial_workspace_load(workspace, output_u, u)
    if success:
        success = fmpq_polynomial_workspace_load(workspace, output_v, v)
    if not success:
        success = _zero_pair(workspace, output_u, output_v)
    return fmpq_polynomial_workspace_move_mumford_result_out(
        workspace, output_u, output_v, genus
    )


@native
def rational_cantor_add_mumford_results(
    workspace: FmpqPolynomialWorkspace,
    f: FmpqPolynomial,
    h: FmpqPolynomial,
    left: FmpqMumfordResult,
    right: FmpqMumfordResult,
    genus: uint64,
) -> FmpqMumfordResult:
    """Add two opaque exact results without eagerly publishing a host row."""
    f_slot: uint64 = 0
    h_slot: uint64 = 1
    u1_slot: uint64 = 2
    v1_slot: uint64 = 3
    u2_slot: uint64 = 4
    v2_slot: uint64 = 5
    output_u: uint64 = 6
    output_v: uint64 = 7
    success = genus >= 2 and genus <= 3
    if success:
        success = fmpq_polynomial_workspace_load(workspace, f_slot, f)
    if success:
        success = fmpq_polynomial_workspace_load(workspace, h_slot, h)
    if success:
        success = fmpq_polynomial_workspace_load_mumford_result(
            workspace, u1_slot, v1_slot, left, genus
        )
    if success:
        success = fmpq_polynomial_workspace_load_mumford_result(
            workspace, u2_slot, v2_slot, right, genus
        )
    if success:
        success = _cantor_add_one(
            workspace,
            f_slot,
            h_slot,
            u1_slot,
            v1_slot,
            u2_slot,
            v2_slot,
            output_u,
            output_v,
            genus,
        )
    if not success:
        success = _zero_pair(workspace, output_u, output_v)
    return fmpq_polynomial_workspace_move_mumford_result_out(
        workspace, output_u, output_v, genus
    )


@native
def rational_cantor_add_prepared_mumford_results(
    workspace: FmpqPolynomialWorkspace,
    left: FmpqMumfordResult,
    right: FmpqMumfordResult,
    genus: uint64,
) -> FmpqMumfordResult:
    """Add exact results with the prepared model retained in slots 0 and 1."""
    f_slot: uint64 = 0
    h_slot: uint64 = 1
    u1_slot: uint64 = 2
    v1_slot: uint64 = 3
    u2_slot: uint64 = 4
    v2_slot: uint64 = 5
    output_u: uint64 = 6
    output_v: uint64 = 7
    success = genus >= 2 and genus <= 3
    if success:
        success = fmpq_polynomial_workspace_load_mumford_result(
            workspace, u1_slot, v1_slot, left, genus
        )
    if success:
        success = fmpq_polynomial_workspace_load_mumford_result(
            workspace, u2_slot, v2_slot, right, genus
        )
    if success:
        success = _cantor_add_one(
            workspace,
            f_slot,
            h_slot,
            u1_slot,
            v1_slot,
            u2_slot,
            v2_slot,
            output_u,
            output_v,
            genus,
        )
    if not success:
        success = _zero_pair(workspace, output_u, output_v)
    return fmpq_polynomial_workspace_move_mumford_result_out(
        workspace, output_u, output_v, genus
    )


@native
def rational_mumford_result_write_row(
    output: IntegerBuffer,
    workspace: FmpqPolynomialWorkspace,
    result: FmpqMumfordResult,
    genus: uint64,
) -> bool:
    """Extract the canonical exact row at the first semantic observation."""
    output_u: uint64 = 6
    output_v: uint64 = 7
    if len(output) < 16 or genus < 2 or genus > 3:
        return False
    if not fmpq_polynomial_workspace_load_mumford_result(
        workspace, output_u, output_v, result, genus
    ):
        return False
    return _write_pair(output, workspace, output_u, output_v)


def _cantor_scalar_one(
    workspace: FmpqPolynomialWorkspace,
    f_slot: uint64,
    h_slot: uint64,
    accumulator_u: uint64,
    accumulator_v: uint64,
    addend_u: uint64,
    addend_v: uint64,
    output_u: uint64,
    output_v: uint64,
    temporary0: uint64,
    temporary1: uint64,
    temporary2: uint64,
    scalar: int,
    genus: uint64,
    max_group_operations: uint64,
) -> bool:
    """Apply the shared signed binary Cantor loop to loaded scratch slots."""
    if not fmpq_polynomial_workspace_one(workspace, accumulator_u):
        return False
    if not fmpq_polynomial_workspace_zero(workspace, accumulator_v):
        return False
    negative = scalar < 0
    if negative:
        scalar = -scalar
    operations = 0
    while scalar:
        if scalar % 2:
            operations += 1
            if operations > max_group_operations:
                return False
            if not _cantor_add_one(
                workspace,
                f_slot,
                h_slot,
                accumulator_u,
                accumulator_v,
                addend_u,
                addend_v,
                output_u,
                output_v,
                genus,
            ):
                return False
            if not fmpq_polynomial_workspace_swap(workspace, accumulator_u, output_u):
                return False
            if not fmpq_polynomial_workspace_swap(workspace, accumulator_v, output_v):
                return False
        scalar //= 2
        if scalar:
            operations += 1
            if operations > max_group_operations:
                return False
            if not _cantor_add_one(
                workspace,
                f_slot,
                h_slot,
                addend_u,
                addend_v,
                addend_u,
                addend_v,
                output_u,
                output_v,
                genus,
            ):
                return False
            if not fmpq_polynomial_workspace_swap(workspace, addend_u, output_u):
                return False
            if not fmpq_polynomial_workspace_swap(workspace, addend_v, output_v):
                return False
            # Once a doubled addend is the identity, all remaining binary
            # digits contribute zero.  This exact early exit is particularly
            # important for high-bit torsion witnesses and avoids hundreds of
            # redundant FLINT copies.
            if fmpq_polynomial_workspace_is_one(workspace, addend_u) == 1:
                scalar = 0
    if negative:
        if not fmpq_polynomial_workspace_add(
            workspace, temporary0, h_slot, accumulator_v
        ):
            return False
        if not fmpq_polynomial_workspace_neg(workspace, temporary1, temporary0):
            return False
        if not fmpq_polynomial_workspace_rem(
            workspace, temporary2, temporary1, accumulator_u
        ):
            return False
        if not fmpq_polynomial_workspace_swap(workspace, accumulator_v, temporary2):
            return False
    return True


@native
def rational_cantor_scalar(
    output: IntegerBuffer,
    workspace: FmpqPolynomialWorkspace,
    f: FmpqPolynomial,
    h: FmpqPolynomial,
    u: FmpqPolynomial,
    v: FmpqPolynomial,
    scalar: int,
    genus: uint64,
    max_group_operations: uint64,
) -> bool:
    """Multiply one rational Mumford pair with bounded exact scratch."""
    if len(output) < 16 or genus < 2 or genus > 3:
        return False
    f_slot: uint64 = 0
    h_slot: uint64 = 1
    accumulator_u: uint64 = 2
    accumulator_v: uint64 = 3
    addend_u: uint64 = 4
    addend_v: uint64 = 5
    output_u: uint64 = 6
    output_v: uint64 = 7
    temporary0: uint64 = 8
    temporary1: uint64 = 9
    temporary2: uint64 = 10
    if not fmpq_polynomial_workspace_load(workspace, f_slot, f):
        return False
    if not fmpq_polynomial_workspace_load(workspace, h_slot, h):
        return False
    if not fmpq_polynomial_workspace_load(workspace, addend_u, u):
        return False
    if not fmpq_polynomial_workspace_load(workspace, addend_v, v):
        return False
    if not _cantor_scalar_one(
        workspace,
        f_slot,
        h_slot,
        accumulator_u,
        accumulator_v,
        addend_u,
        addend_v,
        output_u,
        output_v,
        temporary0,
        temporary1,
        temporary2,
        scalar,
        genus,
        max_group_operations,
    ):
        return False
    return _write_pair(output, workspace, accumulator_u, accumulator_v)


@native
def rational_cantor_scalar_pair(
    output: IntegerBuffer,
    workspace: FmpqPolynomialWorkspace,
    f: FmpqPolynomial,
    h: FmpqPolynomial,
    divisor: FmpqPolynomialPair,
    scalar: int,
    genus: uint64,
    max_group_operations: uint64,
) -> bool:
    """Multiply one retained rational Mumford pair with bounded scratch."""
    if len(output) < 16 or genus < 2 or genus > 3:
        return False
    f_slot: uint64 = 0
    h_slot: uint64 = 1
    accumulator_u: uint64 = 2
    accumulator_v: uint64 = 3
    addend_u: uint64 = 4
    addend_v: uint64 = 5
    output_u: uint64 = 6
    output_v: uint64 = 7
    temporary0: uint64 = 8
    temporary1: uint64 = 9
    temporary2: uint64 = 10
    if not fmpq_polynomial_workspace_load(workspace, f_slot, f):
        return False
    if not fmpq_polynomial_workspace_load(workspace, h_slot, h):
        return False
    if not fmpq_polynomial_workspace_load_pair(workspace, addend_u, addend_v, divisor):
        return False
    if not _cantor_scalar_one(
        workspace,
        f_slot,
        h_slot,
        accumulator_u,
        accumulator_v,
        addend_u,
        addend_v,
        output_u,
        output_v,
        temporary0,
        temporary1,
        temporary2,
        scalar,
        genus,
        max_group_operations,
    ):
        return False
    return _write_pair(output, workspace, accumulator_u, accumulator_v)


@native
def rational_cantor_scalar_mumford_result(
    workspace: FmpqPolynomialWorkspace,
    f: FmpqPolynomial,
    h: FmpqPolynomial,
    divisor: FmpqMumfordResult,
    scalar: int,
    genus: uint64,
    max_group_operations: uint64,
) -> FmpqMumfordResult:
    """Multiply one opaque exact result and move out the reduced answer."""
    f_slot: uint64 = 0
    h_slot: uint64 = 1
    accumulator_u: uint64 = 2
    accumulator_v: uint64 = 3
    addend_u: uint64 = 4
    addend_v: uint64 = 5
    output_u: uint64 = 6
    output_v: uint64 = 7
    temporary0: uint64 = 8
    temporary1: uint64 = 9
    temporary2: uint64 = 10
    success = genus >= 2 and genus <= 3
    if success:
        success = fmpq_polynomial_workspace_load(workspace, f_slot, f)
    if success:
        success = fmpq_polynomial_workspace_load(workspace, h_slot, h)
    if success:
        success = fmpq_polynomial_workspace_load_mumford_result(
            workspace, addend_u, addend_v, divisor, genus
        )
    if success:
        success = _cantor_scalar_one(
            workspace,
            f_slot,
            h_slot,
            accumulator_u,
            accumulator_v,
            addend_u,
            addend_v,
            output_u,
            output_v,
            temporary0,
            temporary1,
            temporary2,
            scalar,
            genus,
            max_group_operations,
        )
    if not success:
        success = _zero_pair(workspace, accumulator_u, accumulator_v)
    return fmpq_polynomial_workspace_move_mumford_result_out(
        workspace, accumulator_u, accumulator_v, genus
    )


def _exact_integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    if value != answer:
        raise ValueError(name + " must be an exact integer")
    return answer


def _fraction(value: Any) -> tuple[int, int]:
    numerator = value.numerator() if hasattr(value, "numerator") else value
    denominator = value.denominator() if hasattr(value, "denominator") else 1
    return int(numerator), int(denominator)


def _polynomial_data(polynomial: Any) -> tuple[tuple[int, int], ...]:
    return tuple(_fraction(value) for value in polynomial.list())


def _resource(polynomial: Any) -> FmpqPolynomial:
    if not polynomial._has_fmpq_polynomial_resource():
        raise RuntimeError("FLINT rational polynomial storage is unavailable")
    return polynomial._exact_polynomial_resource()


class PreparedRationalJacobianCapability:
    """Immutable capability record for one prepared rational Jacobian."""

    def __init__(
        self,
        genus: int,
        fingerprint: str,
        compiled: bool,
        coefficient_word_capacity: int,
    ) -> None:
        self.available = True
        self.selected = "native" if compiled else "dynamic-fallback"
        self.genus = genus
        self.base_ring = "QQ"
        self.model_kind = "odd-degree-one-infinity"
        self.model_fingerprint = fingerprint
        self.schema = PACKED_RATIONAL_MUMFORD_SCHEMA
        self.workspace_slots = _WORKSPACE_SLOTS
        self.coefficient_word_capacity = coefficient_word_capacity

    def to_dict(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "selected": self.selected,
            "genus": self.genus,
            "base_ring": self.base_ring,
            "model_kind": self.model_kind,
            "model_fingerprint": self.model_fingerprint,
            "schema": self.schema,
            "workspace_slots": self.workspace_slots,
            "coefficient_word_capacity": self.coefficient_word_capacity,
        }


class PreparedRationalJacobianArithmetic:
    """Prepared exact Cantor arithmetic for a genus-2/3 Jacobian over `QQ`."""

    def __init__(
        self,
        jacobian: Any,
        *,
        algorithm: str = "auto",
        max_batch_items: int = 1_000_000,
        max_group_operations: int = 4096,
        coefficient_word_capacity: int = 256,
        max_memory_bytes: int | None = None,
        cancel: Any = None,
    ) -> None:
        if algorithm not in ("auto", "native", "reference"):
            raise ValueError("unknown rational Cantor algorithm " + repr(algorithm))
        genus = int(jacobian.genus())
        if genus not in (2, 3):
            raise NotImplementedError(
                "prepared rational Cantor arithmetic needs genus 2 or 3"
            )
        if str(jacobian.base_ring()) != "Rational Field":
            raise NotImplementedError("prepared rational Cantor arithmetic needs QQ")
        if max(jacobian.f().degree(), 2 * jacobian.h().degree()) != 2 * genus + 1:
            raise NotImplementedError("prepared arithmetic needs an odd-degree model")
        maximum = _exact_integer(max_batch_items, "max_batch_items")
        operation_maximum = _exact_integer(max_group_operations, "max_group_operations")
        word_capacity = _exact_integer(
            coefficient_word_capacity, "coefficient_word_capacity"
        )
        if maximum <= 0 or operation_maximum <= 0 or word_capacity <= 0:
            raise ValueError("prepared arithmetic bounds must be positive")
        if word_capacity > 1_000_000:
            raise ValueError("coefficient_word_capacity is too large")
        memory_maximum = None
        if max_memory_bytes is not None:
            memory_maximum = _exact_integer(max_memory_bytes, "max_memory_bytes")
            if memory_maximum <= 0:
                raise ValueError("max_memory_bytes must be positive")
            fixed_output_bytes = 2 * _OUTPUT_WORDS * word_capacity * 8
            if fixed_output_bytes > memory_maximum:
                raise RuntimeError(
                    "rational Cantor output buffers exceed max_memory_bytes"
                )
        if cancel is not None and not callable(cancel):
            raise TypeError("cancel must be callable")
        self._jacobian = jacobian
        self._genus = genus
        self._requested = algorithm
        self._max_batch_items = maximum
        self._max_group_operations = operation_maximum
        self._coefficient_word_capacity = word_capacity
        self._max_memory_bytes = memory_maximum
        self._cancel = cancel
        self._retained_pair_bound = 4096 + 16 * word_capacity * 8
        self._batch_retained_bytes = 0
        self._workspace = fmpq_polynomial_workspace(_WORKSPACE_SLOTS)
        self._closed = False
        self._busy = False
        # Polynomial resources are reconstructible cache entries.  Keep the
        # owning public polynomials, not raw FFI handles that can be closed by
        # the bounded polynomial-resource cache during a long batch.
        self._f_polynomial = jacobian.f()
        self._h_polynomial = jacobian.h()
        f_resource = _resource(self._f_polynomial)
        h_resource = _resource(self._h_polynomial)
        if not fmpq_polynomial_workspace_load(
            self._workspace, 0, f_resource
        ) or not fmpq_polynomial_workspace_load(self._workspace, 1, h_resource):
            self._workspace.close()
            raise ArithmeticError("failed to prepare the rational Jacobian model")
        self._add_output = kernel_integer_zeros(
            rational_cantor_add, _OUTPUT_WORDS, word_capacity
        )
        self._scalar_output = kernel_integer_zeros(
            rational_cantor_scalar, _OUTPUT_WORDS, word_capacity
        )
        model = (
            genus,
            _polynomial_data(self._f_polynomial),
            _polynomial_data(self._h_polynomial),
        )
        self.model_fingerprint = hashlib.sha256(repr(model).encode("ascii")).hexdigest()
        compiled = (
            is_compiled(rational_cantor_add)
            and is_compiled(rational_cantor_scalar)
            and is_compiled(rational_cantor_add_pairs)
            and is_compiled(rational_cantor_add_pair_result)
            and is_compiled(rational_mumford_result_from_polynomials)
            and is_compiled(rational_cantor_add_mumford_results)
            and is_compiled(rational_cantor_add_prepared_mumford_results)
            and is_compiled(rational_mumford_result_write_row)
            and is_compiled(rational_cantor_scalar_pair)
            and is_compiled(rational_cantor_scalar_mumford_result)
        )
        self._capability = PreparedRationalJacobianCapability(
            genus, self.model_fingerprint, compiled, word_capacity
        )
        if algorithm == "native" and not compiled:
            raise RuntimeError("the compiled rational Cantor kernels are unavailable")

    @property
    def native_available(self) -> bool:
        return self._capability.selected == "native"

    def capability(self) -> PreparedRationalJacobianCapability:
        """Return the immutable prepared-domain capability record."""
        return self._capability

    @property
    def closed(self) -> bool:
        return self._closed

    def close(self) -> None:
        """Release the prepared FLINT scratch workspace deterministically."""
        if not self._closed:
            self._workspace.close()
            self._closed = True

    def __enter__(self) -> PreparedRationalJacobianArithmetic:
        if self.closed:
            raise RuntimeError("prepared rational Cantor context is closed")
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False

    def _bounded_count(self, count: int) -> None:
        if count > self._max_batch_items:
            raise RuntimeError("rational Cantor batch exceeds max_batch_items")

    def _bounded_tuple(self, values: Any) -> tuple[Any, ...]:
        """Materialize at most the configured number of batch entries."""
        if isinstance(values, tuple):
            self._bounded_count(len(values))
            return values
        answer = []
        for value in values:
            if len(answer) >= self._max_batch_items:
                raise RuntimeError("rational Cantor batch exceeds max_batch_items")
            answer.append(value)
        return tuple(answer)

    def _enter(self) -> None:
        if self.closed:
            raise RuntimeError("prepared rational Cantor context is closed")
        if self._busy:
            raise RuntimeError("prepared rational Cantor context is already active")
        self._busy = True
        self._batch_retained_bytes = 0

    def _check_limits(self) -> None:
        if self._cancel is not None and self._cancel():
            raise RuntimeError("prepared rational Cantor operation cancelled")
        if self._max_memory_bytes is not None:
            allocated = int(fmpq_polynomial_workspace_allocated_bytes(self._workspace))
            if allocated > self._max_memory_bytes:
                raise RuntimeError("rational Cantor workspace exceeds max_memory_bytes")

    def _leave(self) -> None:
        self._batch_retained_bytes = 0
        self._busy = False

    def pack(self, divisor: Any) -> dict[str, Any]:
        if divisor.parent() is not self._jacobian:
            raise TypeError("divisor belongs to a different Jacobian")
        u, v = divisor.uv()
        return {
            "schema": PACKED_RATIONAL_MUMFORD_SCHEMA,
            "model_fingerprint": self.model_fingerprint,
            "u": _polynomial_data(u),
            "v": _polynomial_data(v),
        }

    def unpack(self, row: dict[str, Any]) -> Any:
        if row.get("schema") != PACKED_RATIONAL_MUMFORD_SCHEMA:
            raise ValueError("unknown packed rational Mumford schema")
        if row.get("model_fingerprint") != self.model_fingerprint:
            raise ValueError("packed rational Mumford model mismatch")
        ring = self._jacobian.polynomial_ring()
        field = self._jacobian.base_ring()
        u = ring(
            [field(numerator) / denominator for numerator, denominator in row["u"]]
        )
        v = ring(
            [field(numerator) / denominator for numerator, denominator in row["v"]]
        )
        answer = self._jacobian._element(u, v, False)
        self._jacobian._validate_reduced(u, v)
        return answer

    def fingerprint(self, divisor: Any) -> str:
        row = self.pack(divisor)
        payload = (row["schema"], row["model_fingerprint"], row["u"], row["v"])
        return hashlib.sha256(repr(payload).encode("ascii")).hexdigest()

    def _unpack_output(self, output: IntegerBuffer) -> Any:
        values = integer_buffer_values(output)
        u_length = int(values[0])
        v_length = int(values[1])
        if u_length < 1 or u_length > 4 or v_length < 0 or v_length > 3:
            raise ArithmeticError("native rational Cantor output is malformed")
        field = self._jacobian.base_ring()
        ring = self._jacobian.polynomial_ring()
        u_values = [
            field(values[2 + 2 * index]) / field(values[3 + 2 * index])
            for index in range(u_length)
        ]
        v_values = [
            field(values[10 + 2 * index]) / field(values[11 + 2 * index])
            for index in range(v_length)
        ]
        # The native kernel reaches this point only after exact FLINT division,
        # monic reduction, and the fixed reduced-degree checks in `_write_pair`.
        # Repeating the full polynomial divisibility test here costs more than
        # the group operation itself.  Untrusted external rows still go through
        # `unpack`, which performs `_validate_reduced`, while operation
        # certificates independently replay the reference group law.
        return self._jacobian._element(ring(u_values), ring(v_values), False)

    def _native_add(self, left: Any, right: Any) -> Any:
        u1, v1 = left[0], left[1]
        u2, v2 = right[0], right[1]
        if not rational_cantor_add(
            self._add_output,
            self._workspace,
            _resource(self._f_polynomial),
            _resource(self._h_polynomial),
            _resource(u1),
            _resource(v1),
            _resource(u2),
            _resource(v2),
            self._genus,
        ):
            raise ArithmeticError("native rational Cantor addition failed closed")
        return self._unpack_output(self._add_output)

    def _native_scalar(self, divisor: Any, scalar: int, maximum: int) -> Any:
        u, v = divisor[0], divisor[1]
        if not rational_cantor_scalar(
            self._scalar_output,
            self._workspace,
            _resource(self._f_polynomial),
            _resource(self._h_polynomial),
            _resource(u),
            _resource(v),
            scalar,
            self._genus,
            maximum,
        ):
            raise RuntimeError(
                "rational Cantor scalar operation bound exceeded or arithmetic failed"
            )
        return self._unpack_output(self._scalar_output)

    def _reference_add(self, left: Any, right: Any) -> Any:
        u, v = self._jacobian._compose(left[0], left[1], right[0], right[1])
        return self._jacobian._element(u, v, False)

    def _add_one(self, left: Any, right: Any) -> Any:
        """Run the checked singleton native path without batch publication."""
        if not self.native_available:
            raise RuntimeError("compiled rational Cantor addition is unavailable")
        if left.parent() is not self._jacobian or right.parent() is not self._jacobian:
            raise TypeError("divisor belongs to a different Jacobian")
        limits_active = self._cancel is not None or self._max_memory_bytes is not None
        self._enter()
        try:
            if limits_active:
                self._check_limits()
            answer = self._native_add(left, right)
            if limits_active:
                self._check_limits()
            return answer
        finally:
            self._leave()

    def add_batch(
        self,
        lefts: Any,
        rights: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
    ) -> Any:
        left_values = self._bounded_tuple(lefts)
        right_values = self._bounded_tuple(rights)
        if len(left_values) != len(right_values):
            raise ValueError("rational Cantor batch lengths differ")
        selected = self._requested if algorithm is None else algorithm
        if selected not in ("auto", "native", "reference"):
            raise ValueError("unknown rational Cantor algorithm " + repr(selected))
        use_native = selected != "reference" and self.native_available
        if selected == "native" and not use_native:
            raise RuntimeError("compiled rational Cantor addition is unavailable")
        limits_active = self._cancel is not None or self._max_memory_bytes is not None
        if len(left_values) == 1 and use_native and not diagnostics:
            return (self._add_one(left_values[0], right_values[0]),)
        started = time.perf_counter_ns() if diagnostics else 0
        answers = []
        self._enter()
        try:
            for left, right in zip(left_values, right_values, strict=True):
                if limits_active:
                    self._check_limits()
                if (
                    left.parent() is not self._jacobian
                    or right.parent() is not self._jacobian
                ):
                    raise TypeError("divisor belongs to a different Jacobian")
                answers.append(
                    self._native_add(left, right)
                    if use_native
                    else self._reference_add(left, right)
                )
                if limits_active:
                    self._check_limits()
        finally:
            self._leave()
        elapsed = time.perf_counter_ns() - started if diagnostics else 0
        result = tuple(answers)
        if diagnostics:
            return result, {
                "operation": "add_batch",
                "selected": "native" if use_native else "reference",
                "count": len(result),
                "elapsed_ns": elapsed,
                "workspace_slots": _WORKSPACE_SLOTS,
            }
        return result

    def double_batch(
        self,
        elements: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
    ) -> Any:
        values = self._bounded_tuple(elements)
        return self.add_batch(
            values, values, algorithm=algorithm, diagnostics=diagnostics
        )

    def negate_batch(
        self,
        elements: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
    ) -> Any:
        """Return canonical inverses through the bounded scalar boundary."""
        values = self._bounded_tuple(elements)
        result = self.scalar_batch(
            values,
            tuple(-1 for _value in values),
            algorithm=algorithm,
            diagnostics=diagnostics,
        )
        if diagnostics:
            answers, record = result
            record["operation"] = "negate_batch"
            return answers, record
        return result

    def scalar_batch(
        self,
        elements: Any,
        scalars: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
        max_group_operations: int | None = None,
    ) -> Any:
        values = self._bounded_tuple(elements)
        scalar_values = tuple(
            _exact_integer(value, "scalar") for value in self._bounded_tuple(scalars)
        )
        if len(values) != len(scalar_values):
            raise ValueError("rational Cantor scalar batch lengths differ")
        selected = self._requested if algorithm is None else algorithm
        if selected not in ("auto", "native", "reference"):
            raise ValueError("unknown rational Cantor algorithm " + repr(selected))
        use_native = selected != "reference" and self.native_available
        if selected == "native" and not use_native:
            raise RuntimeError("compiled rational Cantor scalar is unavailable")
        maximum = self._max_group_operations
        if max_group_operations is not None:
            maximum = _exact_integer(max_group_operations, "max_group_operations")
            if maximum <= 0:
                raise ValueError("max_group_operations must be positive")
        limits_active = self._cancel is not None or self._max_memory_bytes is not None
        if len(values) == 1 and use_native and not diagnostics:
            divisor, scalar = values[0], scalar_values[0]
            if divisor.parent() is not self._jacobian:
                raise TypeError("divisor belongs to a different Jacobian")
            self._enter()
            try:
                if limits_active:
                    self._check_limits()
                answer = self._native_scalar(divisor, scalar, maximum)
                if limits_active:
                    self._check_limits()
            finally:
                self._leave()
            return (answer,)
        started = time.perf_counter_ns() if diagnostics else 0
        answers = []
        self._enter()
        try:
            for divisor, scalar in zip(values, scalar_values, strict=True):
                if limits_active:
                    self._check_limits()
                if divisor.parent() is not self._jacobian:
                    raise TypeError("divisor belongs to a different Jacobian")
                if use_native:
                    answer = self._native_scalar(divisor, scalar, maximum)
                else:
                    bit_bound = 2 * abs(scalar).bit_length()
                    if bit_bound > maximum:
                        raise RuntimeError(
                            "rational Cantor scalar operation bound exceeded"
                        )
                    answer = divisor._scalar_multiple_reference(scalar)
                answers.append(answer)
                if limits_active:
                    self._check_limits()
        finally:
            self._leave()
        elapsed = time.perf_counter_ns() - started if diagnostics else 0
        result = tuple(answers)
        if diagnostics:
            return result, {
                "operation": "scalar_batch",
                "selected": "native" if use_native else "reference",
                "count": len(result),
                "elapsed_ns": elapsed,
                "workspace_slots": _WORKSPACE_SLOTS,
            }
        return result

    def sum(
        self,
        elements: Any,
        *,
        algorithm: str | None = None,
    ) -> Any:
        values = self._bounded_tuple(elements)
        answer = self._jacobian.zero()
        for divisor in values:
            answer = self.add_batch((answer,), (divisor,), algorithm=algorithm)[0]
        return answer

    def operation_certificate(
        self,
        operation: str,
        left: Any,
        right: Any,
    ) -> dict[str, Any]:
        if operation == "add":
            answer = self.add_batch((left,), (right,))[0]
            certificate = {
                "schema": "sagejs.hyperelliptic.rational-cantor-operation.v1",
                "operation": operation,
                "left": self.pack(left),
                "right": self.pack(right),
                "answer": self.pack(answer),
            }
        elif operation == "scalar":
            scalar = _exact_integer(right, "scalar")
            answer = self.scalar_batch((left,), (scalar,))[0]
            certificate = {
                "schema": "sagejs.hyperelliptic.rational-cantor-operation.v1",
                "operation": operation,
                "left": self.pack(left),
                "scalar": str(scalar),
                "answer": self.pack(answer),
            }
        else:
            raise ValueError("unknown rational Cantor certificate operation")
        self.verify_operation_certificate(certificate)
        return certificate

    def verify_operation_certificate(self, certificate: dict[str, Any]) -> bool:
        if (
            certificate.get("schema")
            != "sagejs.hyperelliptic.rational-cantor-operation.v1"
        ):
            raise ValueError("unknown rational Cantor certificate schema")
        left = self.unpack(certificate["left"])
        operation = certificate.get("operation")
        if operation == "add":
            right = self.unpack(certificate["right"])
            expected = self._reference_add(left, right)
        elif operation == "scalar":
            expected = left._scalar_multiple_reference(int(certificate["scalar"]))
        else:
            raise ValueError("unknown rational Cantor certificate operation")
        answer = self.unpack(certificate["answer"])
        if answer != expected:
            raise ArithmeticError("rational Cantor certificate failed reference replay")
        return True


def _install_retained_rational_mumford_state(context_type: Any) -> None:
    """Install closure-private retained QQ state on the public divisor type.

    A module-private name is not an authentication boundary: callers can
    rebind helpers and can inject arbitrary attributes even on nominally
    private slots.  The only map from a public divisor to its indivisible exact
    FLINT Mumford owner therefore lives in this lexical closure.  The owner is
    semantic authority until the first public observation extracts, validates,
    and freezes the canonical primitive tuple; no component resource escapes.
    """
    jacobian_module = __import__(
        "sagejs.hyperelliptic_curves.jacobian", fromlist=["MumfordDivisor"]
    )
    divisor_type = jacobian_module.MumfordDivisor
    weak_map = runtime.reflect.construct(
        runtime.reflect.get(runtime.global_object, "WeakMap"), []
    )
    binding_token = object()

    integer_values_function = integer_buffer_values
    result_from_polynomials_function = rational_mumford_result_from_polynomials
    add_results_function = rational_cantor_add_prepared_mumford_results
    result_write_row_function = rational_mumford_result_write_row
    scalar_result_function = rational_cantor_scalar_mumford_result
    result_type = FmpqMumfordResult
    result_close_function = FmpqMumfordResult.close
    polynomial_data_function = _polynomial_data
    polynomial_resource_function = _resource
    workspace_bytes_function = fmpq_polynomial_workspace_allocated_bytes
    validate_reduced_function = jacobian_module.HyperellipticJacobian._validate_reduced
    undefined_value = runtime.undefined
    schema = PACKED_RATIONAL_MUMFORD_SCHEMA
    original_materialize = divisor_type._materialize
    original_degree = divisor_type.degree
    original_is_zero = divisor_type.is_zero
    original_eq = divisor_type._eq_
    original_hash = divisor_type.__hash__
    original_add_method = divisor_type.add
    original_public_add = divisor_type.__add__
    original_pack = context_type.pack

    def lookup(divisor: Any, context: Any = None) -> Any:
        record = weak_map.get(divisor)
        if record is undefined_value:
            return None
        if (
            record[0] is not divisor
            or record[1] is not divisor._parent
            or record[6] is not binding_token
        ):
            raise ArithmeticError("retained rational Mumford binding is corrupted")
        if context is not None:
            if record[1] is not context._jacobian:
                raise TypeError("divisor belongs to a different Jacobian")
            if record[2] != context.model_fingerprint:
                raise ArithmeticError("retained rational Mumford model mismatch")
        return record

    def canonical_kernel_row(output: Any) -> tuple[int, ...]:
        row = tuple(integer_values_function(output))
        if len(row) != 16:
            raise ArithmeticError("native rational Cantor output has the wrong size")
        u_length = int(row[0])
        v_length = int(row[1])
        if (
            u_length < 1
            or u_length > 4
            or v_length < 0
            or v_length > 3
            or v_length >= u_length
        ):
            raise ArithmeticError("native rational Cantor output is malformed")
        if row[2 * u_length] != 1 or row[2 * u_length + 1] != 1:
            raise ArithmeticError("native rational Cantor output is not monic")
        index = 0
        while index < u_length:
            if row[3 + 2 * index] <= 0:
                raise ArithmeticError("native rational Cantor denominator is invalid")
            index += 1
        while index < 4:
            if row[2 + 2 * index] != 0 or row[3 + 2 * index] != 0:
                raise ArithmeticError("native rational Cantor u padding is nonzero")
            index += 1
        index = 0
        while index < v_length:
            if row[11 + 2 * index] <= 0:
                raise ArithmeticError("native rational Cantor denominator is invalid")
            index += 1
        while index < 3:
            if row[10 + 2 * index] != 0 or row[11 + 2 * index] != 0:
                raise ArithmeticError("native rational Cantor v padding is nonzero")
            index += 1
        return row

    def polynomial_row(divisor: Any) -> tuple[int, ...]:
        u_value, v_value = divisor.uv()
        u_data = polynomial_data_function(u_value)
        v_data = polynomial_data_function(v_value)
        if len(u_data) < 1 or len(u_data) > 4 or len(v_data) > 3:
            raise ArithmeticError(
                "rational Mumford divisor is outside the packed domain"
            )
        row = [len(u_data), len(v_data)] + [0] * 14
        for index, coefficient in enumerate(u_data):
            row[2 + 2 * index] = coefficient[0]
            row[3 + 2 * index] = coefficient[1]
        for index, coefficient in enumerate(v_data):
            row[10 + 2 * index] = coefficient[0]
            row[11 + 2 * index] = coefficient[1]
        return tuple(row)

    def external_row(row: tuple[int, ...], fingerprint: str) -> dict[str, Any]:
        return {
            "schema": schema,
            "model_fingerprint": fingerprint,
            "u": tuple(
                (row[2 + 2 * index], row[3 + 2 * index]) for index in range(int(row[0]))
            ),
            "v": tuple(
                (row[10 + 2 * index], row[11 + 2 * index])
                for index in range(int(row[1]))
            ),
        }

    def reserve_result(context: Any) -> None:
        maximum = context._max_memory_bytes
        if maximum is None:
            return
        next_bytes = context._batch_retained_bytes + context._retained_pair_bound
        workspace_bytes = int(workspace_bytes_function(context._workspace))
        if workspace_bytes + next_bytes > maximum:
            raise RuntimeError("retained rational results exceed max_memory_bytes")
        context._batch_retained_bytes = next_bytes

    def bind_new(divisor: Any, context: Any, row: Any, result: Any) -> Any:
        fast_context = context
        if (
            not context.native_available
            or context._cancel is not None
            or context._max_memory_bytes is not None
        ):
            fast_context = None
        record = (
            divisor,
            context._jacobian,
            context.model_fingerprint,
            row,
            result,
            None,
            binding_token,
            fast_context,
        )
        weak_map.set(divisor, record)
        return record

    def publish_result(context: Any, result: Any) -> Any:
        try:
            if context._max_memory_bytes is not None:
                reserve_result(context)
            divisor = object.__new__(divisor_type)
            divisor._parent = context._jacobian
            divisor._u = None
            divisor._v = None
            divisor._packed_hash = None
            object.__setattr__(
                divisor,
                "_MumfordDivisor__packed_row_binding",
                None,
            )
            bind_new(divisor, context, None, result)
            return divisor
        except Exception:
            if isinstance(result, result_type):
                result_close_function(result)
            raise

    def row_polynomials(parent: Any, row: tuple[int, ...]) -> tuple[Any, Any]:
        field = parent.base_ring()
        ring = parent.polynomial_ring()
        u_data = tuple(
            (row[2 + 2 * index], row[3 + 2 * index]) for index in range(int(row[0]))
        )
        v_data = tuple(
            (row[10 + 2 * index], row[11 + 2 * index]) for index in range(int(row[1]))
        )
        u_value = ring(
            [field(numerator) / field(denominator) for numerator, denominator in u_data]
        )
        v_value = ring(
            [field(numerator) / field(denominator) for numerator, denominator in v_data]
        )
        if (
            polynomial_data_function(u_value) != u_data
            or polynomial_data_function(v_value) != v_data
        ):
            raise ArithmeticError("native rational Mumford row is not canonical")
        validate_reduced_function(parent, u_value, v_value)
        return u_value, v_value

    def extract_row(divisor: Any, context: Any = None) -> tuple[int, ...]:
        record = lookup(divisor, context)
        if record is None:
            return polynomial_row(divisor)
        row = record[3]
        if row is not None:
            return row
        if context is None:
            context = record[1].prepared_arithmetic()
            lookup(divisor, context)
        if not result_write_row_function(
            context._add_output,
            context._workspace,
            record[4],
            context._genus,
        ):
            raise ArithmeticError("failed to extract retained rational Mumford row")
        row = canonical_kernel_row(context._add_output)
        row_polynomials(record[1], row)
        replacement = (
            record[0],
            record[1],
            record[2],
            row,
            record[4],
            record[5],
            binding_token,
            record[7],
        )
        weak_map.set(divisor, replacement)
        return row

    def ensure_result(context: Any, divisor: Any) -> Any:
        record = lookup(divisor, context)
        if record is not None:
            return record[4]
        u_value, v_value = divisor.uv()
        validate_reduced_function(context._jacobian, u_value, v_value)
        row = polynomial_row(divisor)
        reserve_result(context)
        try:
            result = result_from_polynomials_function(
                context._workspace,
                polynomial_resource_function(u_value),
                polynomial_resource_function(v_value),
                context._genus,
            )
        except ValueError as error:
            raise ArithmeticError("failed to retain rational Mumford result") from error
        try:
            return bind_new(divisor, context, row, result)[4]
        except Exception:
            result_close_function(result)
            raise

    def retained_materialize(divisor: Any) -> None:
        record = lookup(divisor)
        if record is None:
            original_materialize(divisor)
            return
        if divisor._u is not None:
            return
        row = extract_row(divisor)
        field = divisor._parent.base_ring()
        ring = divisor._parent.polynomial_ring()
        divisor._u = ring(
            [
                field(row[2 + 2 * index]) / field(row[3 + 2 * index])
                for index in range(int(row[0]))
            ]
        )
        divisor._v = ring(
            [
                field(row[10 + 2 * index]) / field(row[11 + 2 * index])
                for index in range(int(row[1]))
            ]
        )

    def retained_degree(divisor: Any) -> int:
        record = lookup(divisor)
        if record is None:
            return original_degree(divisor)
        return int(extract_row(divisor)[0]) - 1

    def retained_is_zero(divisor: Any) -> bool:
        record = lookup(divisor)
        if record is None:
            return original_is_zero(divisor)
        row = extract_row(divisor)
        return int(row[0]) == 1 and row[2] == 1 and row[3] == 1 and int(row[1]) == 0

    def retained_eq(divisor: Any, other: Any) -> bool:
        if (
            not isinstance(other, divisor_type)
            or divisor.parent() is not other.parent()
        ):
            return False
        left = lookup(divisor)
        right = lookup(other)
        if left is None and right is None:
            return original_eq(divisor, other)
        left_row = extract_row(divisor) if left is not None else polynomial_row(divisor)
        right_row = extract_row(other) if right is not None else polynomial_row(other)
        return left_row == right_row

    def retained_hash(divisor: Any) -> int:
        record = lookup(divisor)
        if record is not None:
            cached = record[5]
            if cached is None:
                row = extract_row(divisor)
                record = lookup(divisor)
                cached = hash((id(record[1]), schema, row))
                weak_map.set(
                    divisor,
                    (
                        record[0],
                        record[1],
                        record[2],
                        row,
                        record[4],
                        cached,
                        binding_token,
                        record[7],
                    ),
                )
            return int(cached)
        if record is None and str(divisor.parent().base_ring()) != "Rational Field":
            return original_hash(divisor)
        if divisor._packed_hash is None:
            row = polynomial_row(divisor)
            divisor._packed_hash = hash((id(divisor.parent()), schema, row))
        return divisor._packed_hash

    def retained_pack(context: Any, divisor: Any) -> dict[str, Any]:
        record = lookup(divisor, context)
        if record is None:
            return original_pack(context, divisor)
        return external_row(extract_row(divisor, context), record[2])

    def add_bound_results(context: Any, left_result: Any, right_result: Any) -> Any:
        try:
            result = add_results_function(
                context._workspace,
                left_result,
                right_result,
                context._genus,
            )
        except ValueError as error:
            raise ArithmeticError(
                "native rational Cantor addition failed closed"
            ) from error
        return publish_result(context, result)

    def retained_native_add(context: Any, left: Any, right: Any) -> Any:
        return add_bound_results(
            context, ensure_result(context, left), ensure_result(context, right)
        )

    def retained_add_method(
        divisor: Any,
        other: Any,
        *,
        algorithm: str = "auto",
        diagnostics: bool = False,
    ) -> Any:
        if (
            algorithm == "auto"
            and not diagnostics
            and isinstance(other, divisor_type)
            and other._parent is divisor._parent
        ):
            return retained_public_add(divisor, other)
        return original_add_method(
            divisor, other, algorithm=algorithm, diagnostics=diagnostics
        )

    def retained_public_add(divisor: Any, other: Any) -> Any:
        same_divisor = other is divisor
        if same_divisor or (
            isinstance(other, divisor_type) and other._parent is divisor._parent
        ):
            left_record = weak_map.get(divisor)
            right_record = left_record if same_divisor else weak_map.get(other)
            if (
                left_record is not undefined_value
                and right_record is not undefined_value
            ):
                if (
                    left_record[0] is not divisor
                    or left_record[1] is not divisor._parent
                    or left_record[6] is not binding_token
                    or (
                        not same_divisor
                        and (
                            right_record[0] is not other
                            or right_record[1] is not other._parent
                            or right_record[6] is not binding_token
                        )
                    )
                ):
                    raise ArithmeticError(
                        "retained rational Mumford binding is corrupted"
                    )
                context = left_record[7]
                if context is not None and context is right_record[7]:
                    try:
                        result = add_results_function(
                            context._workspace,
                            left_record[4],
                            right_record[4],
                            context._genus,
                        )
                    except ValueError as error:
                        if context._closed:
                            return original_add_method(divisor, other)
                        raise ArithmeticError(
                            "native rational Cantor addition failed closed"
                        ) from error
                    try:
                        answer = object.__new__(divisor_type)
                        answer._parent = context._jacobian
                        answer._u = None
                        answer._v = None
                        answer._packed_hash = None
                        object.__setattr__(
                            answer,
                            "_MumfordDivisor__packed_row_binding",
                            None,
                        )
                        weak_map.set(
                            answer,
                            (
                                answer,
                                context._jacobian,
                                context.model_fingerprint,
                                None,
                                result,
                                None,
                                binding_token,
                                context,
                            ),
                        )
                        return answer
                    except Exception:
                        result_close_function(result)
                        raise
            return original_add_method(divisor, other)
        return original_public_add(divisor, other)

    def retained_native_scalar(
        context: Any, divisor: Any, scalar: int, maximum: int
    ) -> Any:
        result = ensure_result(context, divisor)
        try:
            answer = scalar_result_function(
                context._workspace,
                polynomial_resource_function(context._f_polynomial),
                polynomial_resource_function(context._h_polynomial),
                result,
                scalar,
                context._genus,
                maximum,
            )
        except ValueError as error:
            raise RuntimeError(
                "rational Cantor scalar operation bound exceeded or arithmetic failed"
            ) from error
        return publish_result(context, answer)

    divisor_type._materialize = retained_materialize
    divisor_type.degree = retained_degree
    divisor_type.is_zero = retained_is_zero
    divisor_type._eq_ = retained_eq
    divisor_type.__hash__ = retained_hash
    divisor_type.add = retained_add_method
    divisor_type.__add__ = retained_public_add
    context_type.pack = retained_pack
    context_type._native_add = retained_native_add
    context_type._native_scalar = retained_native_scalar


_install_retained_rational_mumford_state(PreparedRationalJacobianArithmetic)
del _install_retained_rational_mumford_state


__all__ = [
    "PACKED_RATIONAL_MUMFORD_SCHEMA",
    "PreparedRationalJacobianArithmetic",
    "PreparedRationalJacobianCapability",
    "rational_cantor_add",
    "rational_cantor_scalar",
]
