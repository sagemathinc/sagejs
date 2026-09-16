"""Checked borrowed unsigned-word view witness."""

from sagejs.native import (
    UInt64Buffer,
    checked_int64,
    int64,
    native,
    uint64,
    uint64_buffer_view,
)


@native
def update_view(
    owner: UInt64Buffer,
    start: int,
    length: int,
) -> uint64:
    """Add the last view entry into the first and return the new value."""
    view: UInt64Buffer = uint64_buffer_view(owner, start, length)
    view[0] += view[-1]
    return view[0]


@native
def empty_view(owner: UInt64Buffer, start: int64) -> int64:
    """Return the length of a checked empty view."""
    view: UInt64Buffer = uint64_buffer_view(owner, start, 0)
    return checked_int64(len(view))
