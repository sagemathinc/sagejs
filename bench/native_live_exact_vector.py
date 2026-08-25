"""Neutral live exact-vector witnesses for Native Kernel C1--C3."""

from sagejs.native import NativeIntegerVector, native, uint64


@native
def live_addmul(
    capacity: uint64,
    memory_limit: uint64,
    seed: int,
    left: int,
    right: int,
    repetitions: uint64,
) -> int:
    """Accumulate without packing an exact entry inside the hot loop."""
    with NativeIntegerVector(capacity, memory_limit) as values:
        values[0] = seed
        for _iteration in range(repetitions):
            values.addmul(0, left, right)
        return values[0]


@native
def live_vector_operations(
    memory_limit: uint64,
    left: int,
    right: int,
) -> tuple[int, int]:
    """Exercise exact set/get, submul, swap, and length operations."""
    with NativeIntegerVector(2, memory_limit) as values:
        values[0] = left
        values[1] = right
        values.submul(0, right, left)
        values.swap(0, 1)
        return values[0], values[len(values) - 1]


@native
def live_vector_index(memory_limit: uint64, index: int) -> int:
    """Expose the shared checked-index behavior for differential tests."""
    with NativeIntegerVector(1, memory_limit) as values:
        return values[index]
