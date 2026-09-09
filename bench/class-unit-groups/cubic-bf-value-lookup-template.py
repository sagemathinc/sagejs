"""Exact lookup in the BF plan's five-entry header and sorted unique tail."""


def _cubic_bf_value_index(
    workspace: NativeIntegerVector, value_count: uint64, norm: uint64
) -> uint64:
    """Return the first matching index, or value_count when absent.

    The caller initializes five unsorted special values. Later values are
    appended in increasing norm order, omitting duplicates of the header.
    Header collisions must retain their original first-match indices.
    """
    index: uint64 = 0
    while index < 5 and index < value_count:
        if workspace[_CUBIC_ANALYTIC_VALUE_OFFSET + index] == norm:
            return index
        index += 1
    low: uint64 = index
    high: uint64 = value_count
    while low < high:
        middle: uint64 = low + (high - low) // 2
        if workspace[_CUBIC_ANALYTIC_VALUE_OFFSET + middle] < norm:
            low = middle + 1
        else:
            high = middle
    if low < value_count and workspace[_CUBIC_ANALYTIC_VALUE_OFFSET + low] == norm:
        return low
    return value_count
