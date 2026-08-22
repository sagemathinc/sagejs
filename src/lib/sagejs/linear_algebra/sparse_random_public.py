"""Source-transparent bulk executors for sparse random dense matrices.

The target-filling executors receive the first already-consumed word from
Sage.js's shared 32-bit stream. The resource-constructing rational executor
instead receives the preceding LCG state so allocation can fail without
consuming that first word. Each executor consumes later words inside one
isolated native call and writes the final state to a one-entry `IntegerBuffer`.
Policy lives in `sagejs.linear_algebra.sparse_random`; this module realizes
that policy in canonical FLINT, M4RI, or packed storage.
"""

from __future__ import annotations

from typing import Tuple

from sagejs.ffi.flint import (
    FmpqMatrix,
    FmpzMatrix,
    fmpq_matrix,
    fmpq_matrix_set_entry,
    fmpz_matrix_entry,
    fmpz_matrix_ncols,
    fmpz_matrix_nrows,
    fmpz_matrix_set_entry,
)
from sagejs.ffi.m4ri import M4riMatrix
from sagejs.ffi.m4ri import available as m4ri_available
from sagejs.native import (
    IntegerBuffer,
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    uint64,
)


@native
def _sparse_random_bounded_exact(
    bound: int,
    state: uint64,
    consumed: int,
    word_base: uint64,
    multiplier: uint64,
    increment: uint64,
) -> Tuple[int, uint64, int]:
    """Draw uniformly from `range(bound)` using whole 32-bit words.

    `state` is the most recently consumed word.  A false `consumed` flag
    makes that word the first digit of this draw; every later digit advances
    the shared LCG.  This is the isolated equivalent of `matrix._random_int`
    and deliberately consumes no word when `bound == 1`.
    """
    span = 1
    words = 0
    while span < bound:
        span *= word_base
        words += 1

    while True:
        value = 0
        for _word in range(words):
            if consumed != 0:
                state = (multiplier * state + increment) % word_base
            value = value * word_base + state
            consumed = 1
        limit = span - span % bound
        if value < limit:
            return value % bound, state, consumed


@native
def sparse_random_fmpz(
    target: FmpzMatrix,
    draws_per_row: uint64,
    full_nonzero: uint64,
    value_mode: uint64,
    lower: int,
    width: uint64,
    initial_state: uint64,
    final_state: IntegerBuffer,
    word_base: uint64,
    multiplier: uint64,
    increment: uint64,
    zero_cutoff: uint64,
    sign_cutoff: uint64,
) -> bool:
    """Fill sparse `ZZ` storage with Sage's keep-first collision rule."""
    rows: uint64 = fmpz_matrix_nrows(target)
    columns: uint64 = fmpz_matrix_ncols(target)
    if len(final_state) != 1 or word_base == 0 or initial_state >= word_base:
        return False
    if value_mode < 2 and width == 0:
        return False

    state: uint64 = initial_state
    consumed = 0
    for row in range(rows):
        if full_nonzero == 0:
            for _draw in range(draws_per_row):
                if consumed != 0:
                    state = (multiplier * state + increment) % word_base
                limit: uint64 = word_base - word_base % columns
                while state >= limit:
                    state = (multiplier * state + increment) % word_base
                column: uint64 = state % columns
                consumed = 1
                # Integer matrices keep the first value at collisions and do
                # not consume a replacement value.
                if fmpz_matrix_entry(target, row, column) == 0:
                    state = (multiplier * state + increment) % word_base
                    if value_mode < 2:
                        value = 0
                        limit = word_base - word_base % width
                        while value == 0:
                            while state >= limit:
                                state = (multiplier * state + increment) % word_base
                            value = lower + state % width
                            if value == 0:
                                state = (multiplier * state + increment) % word_base
                        if not fmpz_matrix_set_entry(target, row, column, value):
                            return False
                    else:
                        while state < zero_cutoff:
                            state = (multiplier * state + increment) % word_base
                        state = (multiplier * state + increment) % word_base
                        tail: uint64 = state
                        while tail == 0:
                            state = (multiplier * state + increment) % word_base
                            tail = state
                        magnitude: uint64 = word_base // tail
                        state = (multiplier * state + increment) % word_base
                        if state < sign_cutoff:
                            if not fmpz_matrix_set_entry(
                                target, row, column, magnitude
                            ):
                                return False
                        else:
                            if not fmpz_matrix_set_entry(
                                target, row, column, -magnitude
                            ):
                                return False
        else:
            for column in range(draws_per_row):
                if consumed != 0:
                    state = (multiplier * state + increment) % word_base
                if value_mode < 2:
                    value = 0
                    limit = word_base - word_base % width
                    while value == 0:
                        while state >= limit:
                            state = (multiplier * state + increment) % word_base
                        value = lower + state % width
                        if value == 0:
                            state = (multiplier * state + increment) % word_base
                    if not fmpz_matrix_set_entry(target, row, column, value):
                        return False
                else:
                    while state < zero_cutoff:
                        state = (multiplier * state + increment) % word_base
                    state = (multiplier * state + increment) % word_base
                    tail = state
                    while tail == 0:
                        state = (multiplier * state + increment) % word_base
                        tail = state
                    magnitude = word_base // tail
                    state = (multiplier * state + increment) % word_base
                    if state < sign_cutoff:
                        if not fmpz_matrix_set_entry(target, row, column, magnitude):
                            return False
                    else:
                        if not fmpz_matrix_set_entry(target, row, column, -magnitude):
                            return False
                consumed = 1
    final_state[0] = state
    return True


@native
def sparse_random_fmpq(
    rows: uint64,
    columns: uint64,
    draws_per_row: uint64,
    full_nonzero: uint64,
    require_nonzero: uint64,
    value_mode: uint64,
    numerator_bound: int,
    denominator_bound: int,
    initial_state: uint64,
    final_state: IntegerBuffer,
    word_base: uint64,
    multiplier: uint64,
    increment: uint64,
) -> FmpqMatrix:
    """Construct private `QQ` storage with bounded or reciprocal-uniform entries.

    `initial_state` is the shared LCG state immediately before the first word,
    rather than an already-consumed word. Resource allocation and parameter
    validation therefore finish before this kernel advances the stream. The
    host publishes `final_state` only after it has copied this private result
    into the allocator domain used by public mutable matrices.
    """
    target = fmpq_matrix(rows, columns)
    if len(final_state) != 1 or word_base == 0 or initial_state >= word_base:
        return target
    if value_mode > 1:
        return target
    if value_mode == 0 and (numerator_bound <= 0 or denominator_bound <= 0):
        return target

    numerator_words = 0
    numerator_limit = 1
    denominator_words = 0
    denominator_limit = 1
    if value_mode == 0:
        numerator_span = 1
        while numerator_span < numerator_bound:
            numerator_span *= word_base
            numerator_words += 1
        numerator_limit = numerator_span - numerator_span % numerator_bound
        denominator_span = 1
        while denominator_span < denominator_bound:
            denominator_span *= word_base
            denominator_words += 1
        denominator_limit = denominator_span - denominator_span % denominator_bound

    state: uint64 = (multiplier * initial_state + increment) % word_base
    consumed = 0
    for row in range(rows):
        for draw in range(draws_per_row):
            column: uint64 = draw
            if full_nonzero == 0:
                if consumed != 0:
                    state = (multiplier * state + increment) % word_base
                limit: uint64 = word_base - word_base % columns
                while state >= limit:
                    state = (multiplier * state + increment) % word_base
                column = state % columns
                consumed = 1
            numerator = 0
            denominator = 1
            retry = 1
            while retry != 0:
                if value_mode == 0:
                    accepted = 0
                    while accepted == 0:
                        numerator = 0
                        for _word in range(numerator_words):
                            if consumed != 0:
                                state = (multiplier * state + increment) % word_base
                            numerator *= word_base
                            numerator += state
                            consumed = 1
                        if numerator < numerator_limit:
                            accepted = 1
                            numerator %= numerator_bound
                    accepted = 0
                    while accepted == 0:
                        denominator = 0
                        for _word in range(denominator_words):
                            if consumed != 0:
                                state = (multiplier * state + increment) % word_base
                            denominator *= word_base
                            denominator += state
                            consumed = 1
                        if denominator < denominator_limit:
                            accepted = 1
                            denominator %= denominator_bound
                    if denominator == 0:
                        denominator = 1
                    if consumed != 0:
                        state = (multiplier * state + increment) % word_base
                    sign_modulus: uint64 = 2
                    sign_limit: uint64 = word_base - word_base % sign_modulus
                    while state >= sign_limit:
                        state = (multiplier * state + increment) % word_base
                    if state % sign_modulus != 0:
                        numerator = -numerator
                else:
                    centered_word, state, consumed = _sparse_random_bounded_exact(
                        2147483648,
                        state,
                        consumed,
                        word_base,
                        multiplier,
                        increment,
                    )
                    centered = centered_word - 1073741823
                    if centered == 0:
                        centered = 1
                    magnitude = 858993458 // abs(centered)
                    if centered > 0:
                        numerator = magnitude
                    else:
                        numerator = -magnitude
                    denominator_word, state, consumed = _sparse_random_bounded_exact(
                        2147483648,
                        state,
                        consumed,
                        word_base,
                        multiplier,
                        increment,
                    )
                    if denominator_word == 0:
                        denominator_word = 1
                    denominator = 2147483647 // denominator_word
                retry = 0
                if require_nonzero != 0 and numerator == 0:
                    retry = 1
            _updated = fmpq_matrix_set_entry(
                target,
                row,
                column,
                numerator,
                denominator,
            )
    final_state[0] = state
    return target


@native
def sparse_random_binary(
    target: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
    threshold: uint64,
    initial_state: uint64,
    final_state: UInt64Buffer,
    word_base: uint64,
    multiplier: uint64,
    increment: uint64,
) -> bool:
    """Fill portable packed `GF(2)` storage by inclusive Bernoulli trials."""
    if len(target) != rows * columns or len(final_state) != 1:
        return False
    if word_base == 0 or initial_state >= word_base:
        return False
    state = initial_state
    consumed = 0
    for index in range(len(target)):
        if consumed != 0:
            state = (multiplier * state + increment) % word_base
        consumed = 1
        if state <= threshold:
            target[index] = 1 % modulus
    final_state[0] = state
    return True


@native
def sparse_random_prime(
    target: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
    nonzero_count: uint64,
    draws_per_row: uint64,
    full_nonzero: uint64,
    initial_state: uint64,
    final_state: UInt64Buffer,
    word_base: uint64,
    multiplier: uint64,
    increment: uint64,
) -> bool:
    """Fill packed word-prime storage with replacement collisions."""
    if len(target) != rows * columns:
        return False
    if len(final_state) != 1 or word_base == 0 or initial_state >= word_base:
        return False

    state = initial_state
    consumed = 0
    for row in range(rows):
        if full_nonzero == 0:
            for _draw in range(draws_per_row):
                if consumed != 0:
                    state = (multiplier * state + increment) % word_base
                limit = word_base - word_base % columns
                while state >= limit:
                    state = (multiplier * state + increment) % word_base
                column = state % columns
                consumed = 1
                state = (multiplier * state + increment) % word_base
                limit = word_base - word_base % nonzero_count
                while state >= limit:
                    state = (multiplier * state + increment) % word_base
                target[row * columns + column] = state % nonzero_count + 1
        else:
            for column in range(draws_per_row):
                if consumed != 0:
                    state = (multiplier * state + increment) % word_base
                limit = word_base - word_base % nonzero_count
                while state >= limit:
                    state = (multiplier * state + increment) % word_base
                target[row * columns + column] = state % nonzero_count + 1
                consumed = 1
    final_state[0] = state
    return True


def sparse_random_m4ri(
    target: M4riMatrix,
    threshold: uint64,
    initial_state: uint64,
    final_state: IntegerBuffer,
    word_base: uint64,
    multiplier: uint64,
    increment: uint64,
) -> bool:
    """Lazily enter the optional M4RI-native bulk implementation."""
    from sagejs.linear_algebra.sparse_random_m4ri import (
        sparse_random_m4ri_native,
    )

    return sparse_random_m4ri_native(
        target,
        threshold,
        initial_state,
        final_state,
        word_base,
        multiplier,
        increment,
    )


try:
    from sagejs.linear_algebra.sparse_random_m4ri import (
        sparse_random_m4ri_native as _sparse_random_m4ri_native,
    )

    _sparse_random_m4ri_available = bool(m4ri_available()) and bool(
        getattr(_sparse_random_m4ri_native, "nativeAvailable", False)
    )
except Exception:
    _sparse_random_m4ri_available = False
sparse_random_m4ri.nativeAvailable = _sparse_random_m4ri_available  # type: ignore[attr-defined]


__all__ = [
    "sparse_random_binary",
    "sparse_random_fmpq",
    "sparse_random_fmpz",
    "sparse_random_m4ri",
    "sparse_random_prime",
]
