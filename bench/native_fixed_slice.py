"""Compare fixed slice stores with equivalent explicit scalar snapshots."""

from sagejs.native import NativeExactArena, native, uint64


@native
def slice_stores(value: int, iterations: uint64) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(10, 0)
        index: uint64 = 0
        while index < iterations:
            vector[0:10] = (value, 1, 2, 0, 0, 0, 0, 3, 1, 0)
            value = vector[0] + vector[1]
            index += 1
        return value


@native
def explicit_stores(value: int, iterations: uint64) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(10, 0)
        index: uint64 = 0
        while index < iterations:
            vector[0] = value
            vector[1] = 1
            vector[2] = 2
            vector[3] = 0
            vector[4] = 0
            vector[5] = 0
            vector[6] = 0
            vector[7] = 3
            vector[8] = 1
            vector[9] = 0
            value = vector[0] + vector[1]
            index += 1
        return value
