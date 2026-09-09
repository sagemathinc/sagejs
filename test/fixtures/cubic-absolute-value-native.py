from sagejs.native import native, NativeExactArena


@native
def conditional_magnitude(value: int) -> int:
    with NativeExactArena(65536, 1048576) as arena:
        values = arena.integer_vector(2, 0)
        values[0] = value
        magnitude = values[0]
        if magnitude < 0:
            magnitude = -magnitude
        values[1] = magnitude
        return values[1]


@native
def builtin_magnitude(value: int) -> int:
    with NativeExactArena(65536, 1048576) as arena:
        values = arena.integer_vector(2, 0)
        values[0] = value
        magnitude = abs(values[0])
        values[1] = magnitude
        return values[1]
