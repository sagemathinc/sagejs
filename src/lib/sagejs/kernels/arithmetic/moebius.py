"""Packed exact Möbius values for one bounded public range.

The ordinary Python body is both the correctness fallback and the source
lowered by `@native`.  A linear sieve computes every value in `[0, stop)` in
one isolated call.  The caller owns the signed output and unsigned workspace;
the kernel does not allocate host objects or cross the host boundary per
integer.
"""

from __future__ import annotations

from sagejs.native import Int64Buffer, UInt64Buffer, native, uint64


@native
def packed_moebius_range(
    output: Int64Buffer,
    workspace: UInt64Buffer,
    stop: uint64,
) -> bool:
    """Write `moebius(0), ..., moebius(stop - 1)` into `output`.

    `workspace` has exactly `2 * stop` entries.  Its first half stores least
    prime factors and its second half stores the discovered primes.  False
    reports malformed storage before either caller-owned buffer is changed.
    """
    if len(output) != stop or len(workspace) != 2 * stop:
        return False

    index = 0
    while index < stop:
        output[index] = 0
        workspace[index] = 0
        workspace[stop + index] = 0
        index += 1

    if stop == 0:
        return True
    output[0] = 0
    if stop == 1:
        return True
    output[1] = 1

    one: uint64 = 1
    prime_count: uint64 = 0
    value: uint64 = 2
    while value < stop:
        if workspace[value] == 0:
            workspace[value] = value
            workspace[stop + prime_count] = value
            prime_count = prime_count + one
            output[value] = -1

        prime_index: uint64 = 0
        while prime_index < prime_count:
            prime = workspace[stop + prime_index]
            if prime > (stop - 1) // value:
                prime_index = prime_count
            else:
                composite = value * prime
                workspace[composite] = prime
                if prime == workspace[value]:
                    output[composite] = 0
                    prime_index = prime_count
                else:
                    output[composite] = -output[value]
                    prime_index = prime_index + one
        value = value + one
    return True


__all__ = ["packed_moebius_range"]
