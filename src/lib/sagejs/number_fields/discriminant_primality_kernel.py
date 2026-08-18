"""Witness-only strong-probable-prime screening for large components.

The source-transparent kernel batches modular exponentiation across a bounded
base vector.  Its survivor result is deliberately only a no-hint outcome.  A
reported witness becomes usable only after the ordinary host predicate replays
that exact base once.
"""

from __future__ import annotations

from typing import Any, Callable

from sagejs.native import (
    UInt64Buffer,
    integer_buffer_values,
    is_compiled,
    kernel_uint64_buffer,
    kernel_uint64_zeros,
    native,
    uint64,
)

PRIMALITY_SCREEN_INVALID = 0
PRIMALITY_SCREEN_SURVIVOR = 1
PRIMALITY_SCREEN_WITNESS = 2


def _packed_modular_power(base: int, exponent: int, modulus: int) -> int:
    answer = 1
    current = base % modulus
    power = exponent
    while power > 0:
        if power % 2 == 1:
            answer = answer * current % modulus
        power //= 2
        if power > 0:
            current = current * current % modulus
    return answer


def _packed_miller_rabin_witness(number: int, base: int) -> bool:
    residue = base % number
    if residue == 0:
        return False
    odd = number - 1
    shifts = 0
    while odd % 2 == 0:
        odd //= 2
        shifts += 1
    value = _packed_modular_power(residue, odd, number)
    if value == 1 or value == number - 1:
        return False
    step = 1
    while step < shifts:
        value = value * value % number
        if value == number - 1:
            return False
        step += 1
    return True


@native
def packed_strong_probable_prime_screen_in_place(
    control: UInt64Buffer,
    bases: UInt64Buffer,
    number: int,
    base_count: uint64,
) -> bool:
    """Publish the first strong witness index or a survivor no-hint status.

    The domain is odd integers at least `2^64`, with one to 64 unsigned bases.
    `control` has exactly two words: status and witness index.  False denotes
    malformed storage or domain and leaves the status invalid.
    """
    if len(control) > 0:
        control[0] = 0  # PRIMALITY_SCREEN_INVALID
    if len(control) > 1:
        control[1] = 0
    valid = (
        len(control) == 2
        and base_count > 0
        and base_count <= 64
        and len(bases) == base_count
        and number >= 18446744073709551616
        and number % 2 == 1
    )
    if not valid:
        return False
    index: uint64 = 0
    one: uint64 = 1
    while index < base_count:
        if bases[index] < 2:
            return False
        if _packed_miller_rabin_witness(number, bases[index]):
            control[0] = 2  # PRIMALITY_SCREEN_WITNESS
            control[1] = index
            return True
        index = index + one
    control[0] = 1  # PRIMALITY_SCREEN_SURVIVOR
    return True


WitnessReplay = Callable[[int, int], bool]


def validated_strong_probable_prime_screen(
    number: int,
    bases: list[int] | tuple[int, ...],
    replay_witness: WitnessReplay,
    *,
    kernel: Any = packed_strong_probable_prime_screen_in_place,
) -> dict[str, int | str] | None:
    """Validate one packed outcome, replaying a reported witness exactly once.

    `None` requests the caller's complete readable fallback.  A survivor is a
    no-hint result, never a primality proof.
    """
    value = int(number)
    try:
        exact_bases = [int(base) for base in bases]
        control = kernel_uint64_zeros(kernel, 2)
        packed_bases = kernel_uint64_buffer(kernel, exact_bases)
        valid = kernel(control, packed_bases, value, len(exact_bases))
    except (ArithmeticError, OverflowError, TypeError, ValueError):
        return None
    if not valid:
        return None
    output = integer_buffer_values(control)
    status = int(output[0])
    witness_index = int(output[1])
    if status == PRIMALITY_SCREEN_SURVIVOR and witness_index == 0:
        return {"status": "survivor"}
    if status != PRIMALITY_SCREEN_WITNESS:
        return None
    if witness_index < 0 or witness_index >= len(exact_bases):
        return None
    base = exact_bases[witness_index]
    try:
        witnessed = bool(replay_witness(value, base))
    except (ArithmeticError, OverflowError, TypeError, ValueError):
        return None
    if not witnessed:
        return None
    return {"status": "witness", "index": witness_index, "base": base}


def compiled_strong_probable_prime_screen(
    number: int,
    bases: list[int] | tuple[int, ...],
    replay_witness: WitnessReplay,
) -> dict[str, int | str] | None:
    """Use the packed boundary when compiled, else request readable fallback."""
    if not is_compiled(packed_strong_probable_prime_screen_in_place):
        return None
    return validated_strong_probable_prime_screen(
        number,
        bases,
        replay_witness,
    )


__all__ = [
    "PRIMALITY_SCREEN_INVALID",
    "PRIMALITY_SCREEN_SURVIVOR",
    "PRIMALITY_SCREEN_WITNESS",
    "compiled_strong_probable_prime_screen",
    "packed_strong_probable_prime_screen_in_place",
    "validated_strong_probable_prime_screen",
]
