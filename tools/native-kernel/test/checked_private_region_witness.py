from sagejs.native import UInt64Buffer, int64, native, uint64


def checked_region_helper(
    storage: UInt64Buffer, index: int64, value: uint64
) -> uint64:
    storage[index] = value
    return storage[index]


@native
def checked_region_entry(
    storage: UInt64Buffer, index: int64, value: uint64
) -> uint64:
    return checked_region_helper(storage, index, value)
