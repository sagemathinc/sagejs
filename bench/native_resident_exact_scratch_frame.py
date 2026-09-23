"""A real exact call graph for resident scratch-lifetime measurements."""

from sagejs.native import native, uint64


@native
def resident_exact_scratch_recursive(value: int, depth: uint64) -> int:
    """Keep the established per-call fallback for a recursive exact graph."""
    if depth == 0:
        return value
    return resident_exact_scratch_recursive(value * value + 1, depth - 1)


@native
def resident_exact_scratch_leaf(value: int, rounds: uint64, fail: bool) -> int:
    """Grow several exact temporaries and optionally fail after doing work."""
    current = value
    checksum = 0
    step: uint64 = 0
    while step < rounds:
        square = current * current
        shifted = square + 17 * current - 29
        checksum += shifted % 65537
        current = shifted + checksum
        step += 1
    if fail:
        raise ValueError("resident scratch forced failure")
    return current + checksum


def _resident_exact_scratch_middle(value: int, rounds: uint64, fail: bool) -> int:
    """Private middle frame used to prove transitive scratch propagation."""
    first = resident_exact_scratch_leaf(value + 3, rounds, False)
    second = resident_exact_scratch_leaf(value - 5, rounds, fail)
    return first - second


@native
def resident_exact_scratch_root(
    value: int, calls: uint64, rounds: uint64, fail_at: int
) -> int:
    """Reuse one bounded exact frame over many private helper calls."""
    total = 0
    call: uint64 = 0
    while call < calls:
        total += _resident_exact_scratch_middle(
            value + call, rounds, fail_at >= 0 and call == fail_at
        )
        call += 1
    return total
