"""Equivalent explicit and bundled resident helper calls for qualification."""

from sagejs.native import (
    NativeExactArena,
    NativeIntegerVector,
    NativeWorkspace,
    native,
    uint64,
)


class Scratch(NativeWorkspace):
    left: NativeIntegerVector
    right: NativeIntegerVector


def bundled_step(scratch: Scratch, value: int) -> int:
    scratch.left[0] = value
    scratch.right[1] = scratch.left[0] + 1
    return scratch.right[1]


def explicit_step(
    left: NativeIntegerVector, right: NativeIntegerVector, value: int
) -> int:
    left[0] = value
    right[1] = left[0] + 1
    return right[1]


@native
def bundled(value: int, iterations: uint64) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(2, 0)
        scratch = Scratch(vector, vector)
        index: uint64 = 0
        while index < iterations:
            value = bundled_step(scratch, value)
            index += 1
        return value


@native
def explicit(value: int, iterations: uint64) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(2, 0)
        index: uint64 = 0
        while index < iterations:
            value = explicit_step(vector, vector, value)
            index += 1
        return value
