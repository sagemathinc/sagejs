from sagejs.native import (
    UInt64Buffer,
    int64,
    native,
    uint64,
    uint64_buffer_view,
)


def checked_region_helper(
    storage: UInt64Buffer, index: int64, value: uint64
) -> int64:
    storage[index] = value
    saved: uint64 = storage[index]
    shifted: int64 = index + 1
    doubled: int64 = shifted * 2
    result: int64 = doubled - 1
    return result


@native
def checked_region_entry(
    storage: UInt64Buffer, index: int64, value: uint64
) -> int64:
    return checked_region_helper(storage, index, value)


@native
def checked_region_ambiguous_entry(
    storage: UInt64Buffer,
    index: int64,
    other_index: int64,
    value: uint64,
) -> int64:
    first: int64 = checked_region_helper(storage, index, value)
    return first + checked_region_helper(storage, other_index, value)


@native
def checked_region_loop_entry(
    storage: UInt64Buffer, count: int64, value: uint64
) -> int64:
    index: int64 = 0
    shifted: int64 = 0
    for index in range(count):
        storage[index] = value
        shifted = index + 1
    return shifted


@native
def checked_region_carried_entry(
    storage: UInt64Buffer, count: int64, value: uint64
) -> int64:
    index: int64 = 0
    cursor: int64 = 0
    for index in range(count):
        storage[cursor] = value
        cursor += 1
    return cursor


@native
def checked_region_mutated_bound_entry(
    storage: UInt64Buffer, count: int64, value: uint64
) -> int64:
    index: int64 = 0
    for index in range(count):
        storage[index] = value
        count -= 1
    return count


@native
def checked_region_unknown_step_entry(
    storage: UInt64Buffer, count: int64, step: int64, value: uint64
) -> int64:
    index: int64 = 0
    for index in range(0, count, step):
        storage[index] = value
    return index


@native
def checked_region_unsupported_entry(
    storage: UInt64Buffer, count: int64, value: uint64
) -> int64:
    result: int64 = checked_region_helper(storage, count, value)
    while count > 0:
        result = checked_region_helper(storage, count, value)
        count -= 1
    return result


@native
def checked_region_branch_entry(
    storage: UInt64Buffer, index: int64, choose: bool, value: uint64
) -> int64:
    offset: int64 = 0
    if choose:
        offset = index + 1
    else:
        offset = index + 2
    storage[offset] = value
    return offset


@native
def checked_region_span_entry(
    storage: UInt64Buffer, start: int64, length: int64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(storage, start, length)
    index: int64 = 0
    total: uint64 = 0
    for index in range(length):
        total += view[index]
    return total


@native
def checked_region_relational_scalar_entry(
    storage: UInt64Buffer, count: int64, value: uint64
) -> int64:
    index: int64 = 0
    for index in range(count):
        storage[index] = value
    return index


@native
def checked_region_relational_affine_entry(
    storage: UInt64Buffer, degree: int64, value: uint64
) -> int64:
    stop: int64 = degree + 1
    index: int64 = 0
    for index in range(stop):
        storage[index] = value
    return index


@native
def checked_region_relational_product_entry(
    storage: UInt64Buffer, count: int64, degree: int64, value: uint64
) -> int64:
    capacity: int64 = count * degree
    index: int64 = 0
    for index in range(capacity):
        storage[index] = value
    return index


@native
def checked_region_relational_mismatch_entry(
    storage: UInt64Buffer, count: int64, other: int64, value: uint64
) -> int64:
    index: int64 = 0
    for index in range(other):
        storage[index] = value
    return index


@native
def checked_region_relational_short_entry(
    storage: UInt64Buffer, count: int64, choose: bool, value: uint64
) -> int64:
    stop: int64 = count
    selected: bool = choose and count > 0
    index: int64 = 0
    for index in range(stop):
        if selected:
            storage[index] = value
    return index
