from sagejs.native import UInt64Buffer, int64, native, uint64


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
