"""Exercise bundle/slice aliases and failures in a standalone generated core."""

from sagejs.native import (
    NativeExactArena,
    NativeIntegerVector,
    NativeWorkspace,
    native,
    uint64,
)


class Scratch(NativeWorkspace):
    vector: NativeIntegerVector


def rotate(scratch: Scratch, value: int, stop: uint64) -> int:
    scratch.vector[0:3] = (value, 2, 3)
    scratch.vector[0:stop] = (scratch.vector[2], scratch.vector[0], scratch.vector[1])
    return scratch.vector[1]


@native
def checked(value: int, limit: uint64, stop: uint64) -> int:
    with NativeExactArena(limit, 1048576) as arena:
        vector = arena.integer_vector(3, 0)
        scratch = Scratch(vector)
        return rotate(scratch, value, stop)
