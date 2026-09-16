from sagejs.native import (
    NativeIntegerVector,
    UInt64Buffer,
    int64,
    native,
    uint64,
    uint64_buffer_view,
)


@native
def fixed_span_sum(owner: UInt64Buffer, start: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, 9)
    index: int64 = 0
    total: uint64 = 0
    for index in range(9):
        total += view[index]
    return total


@native
def fixed_span_update(owner: UInt64Buffer, start: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, 9)
    index: int64 = 0
    for index in range(9):
        view[index] = view[index] + 1
    return view[8]


@native
def too_wide(owner: UInt64Buffer, start: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, 9)
    index: int64 = 0
    total: uint64 = 0
    for index in range(10):
        total += view[index]
    return total


@native
def dynamic_stop(owner: UInt64Buffer, start: int64, stop: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, 9)
    index: int64 = 0
    total: uint64 = 0
    for index in range(stop):
        total += view[index]
    return total


@native
def dynamic_span(owner: UInt64Buffer, start: int64, length: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, length)
    index: int64 = 0
    total: uint64 = 0
    for index in range(9):
        total += view[index]
    return total


@native
def dynamic_exact_span(owner: UInt64Buffer, start: int64, length: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, length)
    index: int64 = 0
    total: uint64 = 0
    for index in range(length):
        total += view[index]
    return total


@native
def dynamic_computed_span(owner: UInt64Buffer, start: int64, stop: int64) -> uint64:
    length: int64 = stop - start
    view: UInt64Buffer = uint64_buffer_view(owner, start, length)
    index: int64 = 0
    total: uint64 = 0
    for index in range(length):
        total += view[index]
    return total


@native
def dynamic_exact_span_update(
    owner: UInt64Buffer, start: int64, length: int64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, length)
    index: int64 = 0
    result: uint64 = 0
    for index in range(length):
        view[index] = view[index] + 1
    return result


@native
def dynamic_mismatched_stop(
    owner: UInt64Buffer, start: int64, length: int64, stop: int64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, length)
    index: int64 = 0
    total: uint64 = 0
    for index in range(stop):
        total += view[index]
    return total


@native
def dynamic_overshoot(owner: UInt64Buffer, start: int64, length: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, length)
    stop: int64 = length + 1
    index: int64 = 0
    total: uint64 = 0
    for index in range(stop):
        total += view[index]
    return total


@native
def dynamic_nonzero_start(owner: UInt64Buffer, start: int64, length: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, length)
    index: int64 = 0
    total: uint64 = 0
    for index in range(1, length):
        total += view[index]
    return total


@native
def dynamic_nonunit_step(owner: UInt64Buffer, start: int64, length: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, length)
    index: int64 = 0
    total: uint64 = 0
    for index in range(0, length, 2):
        total += view[index]
    return total


@native
def dynamic_rebound_length(
    owner: UInt64Buffer, start: int64, length: int64, stop: int64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, length)
    length = stop
    index: int64 = 0
    total: uint64 = 0
    for index in range(length):
        total += view[index]
    return total


@native
def negative_range(owner: UInt64Buffer, start: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, 9)
    index: int64 = 0
    total: uint64 = 0
    for index in range(-1, 8):
        total += view[index]
    return total


@native
def affine_index(owner: UInt64Buffer, start: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, 9)
    index: int64 = 0
    total: uint64 = 0
    for index in range(8):
        total += view[index + 1]
    return total


@native
def rebound_view(owner: UInt64Buffer, other: UInt64Buffer, start: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, 9)
    index: int64 = 0
    total: uint64 = 0
    for index in range(9):
        total += view[index]
        view = other
    return total


@native
def rebound_index(owner: UInt64Buffer, start: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, 9)
    index: int64 = 0
    total: uint64 = 0
    for index in range(9):
        index = 20
        total += view[index]
    return total


@native
def loop_carried_view(owner: UInt64Buffer, other: UInt64Buffer, start: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, 9)
    iteration: int64 = 0
    for iteration in range(1):
        view = other
    index: int64 = 0
    total: uint64 = 0
    for index in range(9):
        total += view[index]
    return total


@native
def nested_index_write(owner: UInt64Buffer, start: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, 9)
    index: int64 = 0
    total: uint64 = 0
    for index in range(9):
        for index in range(20, 21):
            total += 0
        total += view[index]
    return total


@native
def scoped_view_write(owner: UInt64Buffer, other: UInt64Buffer, start: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, 9)
    with NativeIntegerVector(1, 4096) as scratch:
        view = other
    index: int64 = 0
    total: uint64 = 0
    for index in range(9):
        total += view[index]
    return total
