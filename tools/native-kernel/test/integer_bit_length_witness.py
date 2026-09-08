from sagejs.native import IntegerBuffer, NativeExactArena, native, uint64


@native
def scalar_bits(value: int) -> int:
    return value.bit_length()


@native
def unsigned_bits(value: uint64) -> int:
    return value.bit_length()


@native
def resident_bits(value: int) -> int:
    with NativeExactArena(1_048_576, 3_145_728) as arena:
        workspace = arena.integer_vector(2, 0)
        workspace[0] = value
        workspace[1] = workspace[0].bit_length()
        return workspace[1]


def counted_value(counter: IntegerBuffer, value: int) -> int:
    counter[0] += 1
    return value


@native
def expression_bits(counter: IntegerBuffer, value: int) -> int:
    return (counted_value(counter, value) + 0).bit_length()


@native
def aliased_bits(value: int) -> int:
    value = value.bit_length()
    value = value.bit_length()
    return value
