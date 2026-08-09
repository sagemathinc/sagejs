"""Focused signed-buffer and record kernels for Native Kernel validation."""

from __future__ import annotations

from sagejs.native import Int64Buffer, int64_record, native, uint64


@native
def fill_signed_records(output: Int64Buffer, count: uint64) -> int:
    """Fill packed four-entry records and return the final signed entry."""
    for index in range(count):
        record = int64_record(output, index * 4, 4)
        record[0] = index
        record[1] = -index
        record[2] = index * index
        record[3] = -record[2]
        record[-1] += 1
    return output[-1]


@native
def sum_signed_records(source: Int64Buffer, count: uint64) -> int:
    """Read packed records through bounded views without mutating them."""
    answer = 0
    for index in range(count):
        record = int64_record(source, index * 4, 4)
        answer += record[0] + record[1] + record[2] + record[3]
    return answer


@native
def write_then_overflow(output: Int64Buffer, value: int) -> int:
    """Expose writes preceding a later signed-range error to the caller."""
    output[0] = 7
    output[-1] = value
    return output[0]
