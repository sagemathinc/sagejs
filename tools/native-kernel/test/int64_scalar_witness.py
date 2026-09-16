from sagejs.native import Int64Buffer, checked_int64, int64, native


@native
def int64_helper(left: int64, right: int64) -> int64:
    return left * right + 3


@native
def int64_binary(left: int64, right: int64) -> tuple[int64, int64, int64]:
    return left + right, left - right, left * right


@native
def int64_arithmetic(left: int64, right: int64) -> tuple[int64, int64, int64]:
    local: int64 = left + right
    return int64_helper(local, 2), left // right, left % right


@native
def int64_range_sum(start: int64, stop: int64, step: int64) -> int64:
    total: int64 = 0
    index: int64 = start
    for index in range(start, stop, step):
        total += index
    return total


@native
def exact_to_int64(value: int) -> int64:
    return checked_int64(value)


@native
def int64_to_exact(value: int64) -> int:
    return value


@native
def int64_unary(value: int64) -> tuple[int64, int64, bool]:
    return -value, abs(value), value != 0


@native
def int64_buffer_roundtrip(
    values: Int64Buffer, index: int64, replacement: int64
) -> int64:
    previous: int64 = values[index]
    values[index] = replacement
    values[index] += previous
    return values[index]


@native
def int64_buffer_exact(values: Int64Buffer, index: int64) -> int:
    return values[index] + (1 << 80)


@native
def checked_int64_literal() -> int64:
    return checked_int64(-1)


@native
def checked_int64_length(values: Int64Buffer) -> int64:
    return checked_int64(len(values))
