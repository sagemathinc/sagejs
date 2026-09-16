from sagejs.native import (
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
def dynamic_span(
    owner: UInt64Buffer, start: int64, length: int64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(owner, start, length)
    index: int64 = 0
    total: uint64 = 0
    for index in range(9):
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
def rebound_view(
    owner: UInt64Buffer, other: UInt64Buffer, start: int64
) -> uint64:
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
