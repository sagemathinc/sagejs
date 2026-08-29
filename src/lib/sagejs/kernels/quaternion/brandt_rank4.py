"""Exact rank-four lattice recurrences used by integral Brandt modules."""

from __future__ import annotations

from sagejs.native import (
    IntegerBuffer,
    NativeIntegerVector,
    UInt64Buffer,
    native,
    uint64,
)


@native
def brandt_rank4_theta_counts(
    counts: UInt64Buffer,
    gram: IntegerBuffer,
    bounds: UInt64Buffer,
    normalization_multiplier: int,
    normalization_denominator: int,
    precision: uint64,
    workspace_memory_limit: uint64,
) -> bool:
    """Count a bounded integral rank-four form by normalized exact norm."""

    zero: uint64 = 0
    one: uint64 = 1
    four: uint64 = 4
    sixteen: uint64 = 16
    if (
        len(counts) != precision
        or len(gram) != sixteen
        or len(bounds) != four
        or normalization_multiplier <= 0
        or normalization_denominator <= 0
    ):
        return False
    index: uint64 = zero
    while index < precision:
        counts[index] = zero
        index = index + one
    with NativeIntegerVector(5, workspace_memory_limit) as state:
        state[0] = -bounds[0]
        while state[0] <= bounds[0]:
            state[1] = -bounds[1]
            while state[1] <= bounds[1]:
                state[2] = -bounds[2]
                while state[2] <= bounds[2]:
                    state[3] = -bounds[3]
                    while state[3] <= bounds[3]:
                        state[4] = 0
                        row: uint64 = zero
                        while row < four:
                            column: uint64 = zero
                            while column < four:
                                state.addmul(
                                    4,
                                    gram[row * four + column],
                                    state[row] * state[column],
                                )
                                column = column + one
                            row = row + one
                        scaled_norm = state[4] * normalization_multiplier
                        norm_index: uint64 = zero
                        while norm_index < precision:
                            if scaled_norm == norm_index * normalization_denominator:
                                counts[norm_index] = counts[norm_index] + one
                                norm_index = precision
                            else:
                                norm_index = norm_index + one
                        state[3] = state[3] + 1
                    state[2] = state[2] + 1
                state[1] = state[1] + 1
            state[0] = state[0] + 1
    return True


@native
def brandt_rank4_vectors_of_norm(
    output: IntegerBuffer,
    metadata: UInt64Buffer,
    gram: IntegerBuffer,
    bounds: UInt64Buffer,
    target_multiplier: int,
    target_value: int,
    workspace_memory_limit: uint64,
) -> bool:
    """Publish every bounded rank-four vector of one exact integral norm."""

    zero: uint64 = 0
    one: uint64 = 1
    four: uint64 = 4
    sixteen: uint64 = 16
    if (
        len(metadata) != one
        or len(gram) != sixteen
        or len(bounds) != four
        or len(output) % four != zero
        or target_multiplier <= 0
        or target_value < 0
    ):
        return False
    capacity: uint64 = len(output) // four
    count: uint64 = zero
    metadata[0] = zero
    with NativeIntegerVector(5, workspace_memory_limit) as state:
        state[0] = -bounds[0]
        while state[0] <= bounds[0]:
            state[1] = -bounds[1]
            while state[1] <= bounds[1]:
                state[2] = -bounds[2]
                while state[2] <= bounds[2]:
                    state[3] = -bounds[3]
                    while state[3] <= bounds[3]:
                        state[4] = 0
                        row: uint64 = zero
                        while row < four:
                            column: uint64 = zero
                            while column < four:
                                state.addmul(
                                    4,
                                    gram[row * four + column],
                                    state[row] * state[column],
                                )
                                column = column + one
                            row = row + one
                        if state[4] * target_multiplier == target_value:
                            if count >= capacity:
                                return False
                            coordinate: uint64 = zero
                            while coordinate < four:
                                output[count * four + coordinate] = state[coordinate]
                                coordinate = coordinate + one
                            count = count + one
                        state[3] = state[3] + 1
                    state[2] = state[2] + 1
                state[1] = state[1] + 1
            state[0] = state[0] + 1
    metadata[0] = count
    return True


__all__ = ["brandt_rank4_theta_counts", "brandt_rank4_vectors_of_norm"]
