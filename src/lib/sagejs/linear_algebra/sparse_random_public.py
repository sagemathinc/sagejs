"""Source-transparent bulk executors for sparse random dense matrices.

Each executor receives the first already-consumed word from Sage.js's shared
32-bit stream, consumes every later word inside one isolated native call, and
writes the last consumed word to a one-entry `IntegerBuffer`. Policy lives in
`sagejs.linear_algebra.sparse_random`; this module realizes that policy in
canonical FLINT, M4RI, or packed storage.
"""

from __future__ import annotations

from sagejs.ffi.flint import (
    FmpqMatrix,
    FmpzMatrix,
    fmpq_matrix_ncols,
    fmpq_matrix_nrows,
    fmpq_matrix_set_entry,
    fmpz_matrix_entry,
    fmpz_matrix_ncols,
    fmpz_matrix_nrows,
    fmpz_matrix_set_entry,
)
from sagejs.ffi.m4ri import (
    M4riMatrix,
    matrix_ncols,
    matrix_nrows,
    matrix_set_entry,
)
from sagejs.native import (
    IntegerBuffer,
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    uint64,
)


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
    target: FmpqMatrix,
    draws_per_row: uint64,
    full_nonzero: uint64,
    require_nonzero: uint64,
    numerator_bound: uint64,
    denominator_bound: uint64,
    initial_state: uint64,
    final_state: IntegerBuffer,
    word_base: uint64,
    multiplier: uint64,
    increment: uint64,
) -> bool:
    """Fill `QQ` storage with bounded canonical rational entries."""
    rows: uint64 = fmpq_matrix_nrows(target)
    columns: uint64 = fmpq_matrix_ncols(target)
    if len(final_state) != 1 or word_base == 0 or initial_state >= word_base:
        return False
    if numerator_bound == 0 or denominator_bound == 0:
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
                unsigned_numerator: uint64 = 0
                denominator: uint64 = word_base // word_base
                while unsigned_numerator == 0:
                    state = (multiplier * state + increment) % word_base
                    limit = word_base - word_base % numerator_bound
                    while state >= limit:
                        state = (multiplier * state + increment) % word_base
                    unsigned_numerator = state % numerator_bound
                    state = (multiplier * state + increment) % word_base
                    limit = word_base - word_base % denominator_bound
                    while state >= limit:
                        state = (multiplier * state + increment) % word_base
                    denominator = state % denominator_bound
                    if denominator == 0:
                        denominator = word_base // word_base
                    state = (multiplier * state + increment) % word_base
                if state % 2 == 0:
                    if not fmpq_matrix_set_entry(
                        target,
                        row,
                        column,
                        unsigned_numerator,
                        denominator,
                    ):
                        return False
                else:
                    if not fmpq_matrix_set_entry(
                        target,
                        row,
                        column,
                        -unsigned_numerator,
                        denominator,
                    ):
                        return False
        else:
            for column in range(draws_per_row):
                unsigned_numerator = word_base - word_base
                denominator = word_base // word_base
                retry = 1
                while retry != 0:
                    if consumed != 0:
                        state = (multiplier * state + increment) % word_base
                    limit = word_base - word_base % numerator_bound
                    while state >= limit:
                        state = (multiplier * state + increment) % word_base
                    unsigned_numerator = state % numerator_bound
                    consumed = 1
                    state = (multiplier * state + increment) % word_base
                    limit = word_base - word_base % denominator_bound
                    while state >= limit:
                        state = (multiplier * state + increment) % word_base
                    denominator = state % denominator_bound
                    if denominator == 0:
                        denominator = word_base // word_base
                    state = (multiplier * state + increment) % word_base
                    retry = 0
                    if require_nonzero != 0 and unsigned_numerator == 0:
                        retry = 1
                if state % 2 == 0:
                    if not fmpq_matrix_set_entry(
                        target,
                        row,
                        column,
                        unsigned_numerator,
                        denominator,
                    ):
                        return False
                else:
                    if not fmpq_matrix_set_entry(
                        target,
                        row,
                        column,
                        -unsigned_numerator,
                        denominator,
                    ):
                        return False
    final_state[0] = state
    return True


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


@native
def sparse_random_m4ri(
    target: M4riMatrix,
    threshold: uint64,
    initial_state: uint64,
    final_state: IntegerBuffer,
    word_base: uint64,
    multiplier: uint64,
    increment: uint64,
) -> bool:
    """Fill `GF(2)` storage by Sage's inclusive per-entry Bernoulli rule."""
    rows: uint64 = matrix_nrows(target)
    columns: uint64 = matrix_ncols(target)
    if len(final_state) != 1 or word_base == 0 or initial_state >= word_base:
        return False

    state: uint64 = initial_state
    consumed = 0
    one: uint64 = word_base // word_base
    for row in range(rows):
        for column in range(columns):
            if consumed != 0:
                state = (multiplier * state + increment) % word_base
            consumed = 1
            if state <= threshold:
                if not matrix_set_entry(target, row, column, one):
                    return False
    final_state[0] = state
    return True


__all__ = [
    "sparse_random_binary",
    "sparse_random_fmpq",
    "sparse_random_fmpz",
    "sparse_random_m4ri",
    "sparse_random_prime",
]
