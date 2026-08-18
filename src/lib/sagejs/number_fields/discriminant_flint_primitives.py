"""Validated policy boundary for mature FLINT integer primitives.

The generated FFI deliberately exposes only two narrow operations: an owned
two-entry integer vector containing perfect-power data, and a probable-prime
screen.  Neither foreign result is a Sage.js certificate by itself.  This
ordinary-Python layer checks the exact perfect-power witness and preserves the
readable primality evidence boundary.

The module has no eager dependency on the generated FLINT surface.  Platforms
without that optional capability, including a native Windows build where the
adapter is unavailable, return `None` and retain the caller's readable path.
"""

from __future__ import annotations

from typing import Any, Callable

COMPOSITE = "composite"
PROBABLE_PRIME = "probable-prime-awaiting-proof"


def _flint_module() -> Any:
    return __import__("sagejs.ffi.flint", fromlist=["flint"])


def _generated_perfect_power_candidate(
    number: int, module: Any = None
) -> tuple[int, int] | None:
    """Copy and close one generated two-entry perfect-power resource."""
    resource = None
    try:
        flint = _flint_module() if module is None else module
        create = flint.fmpz_perfect_power_data
        length = flint.fmpz_vector_length
        entry = flint.fmpz_vector_entry
        resource = create(number)
        if int(length(resource)) != 2:
            return None
        return int(entry(resource, 0)), int(entry(resource, 1))
    except (
        ArithmeticError,
        AttributeError,
        ImportError,
        IndexError,
        OSError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
    ):
        return None
    finally:
        if resource is not None:
            try:
                resource.close()
            except (AttributeError, RuntimeError):
                pass


def _generated_probable_prime_screen(number: int, module: Any = None) -> bool | None:
    """Return the generated FLINT screen result, or `None` if unavailable."""
    try:
        flint = _flint_module() if module is None else module
        result = flint.fmpz_is_probabprime(number)
    except (
        ArithmeticError,
        AttributeError,
        ImportError,
        OSError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
    ):
        return None
    if not isinstance(result, bool):
        return None
    return result


def iterated_perfect_power_oracle(
    value: int,
    step: Callable[[int], tuple[int, int] | None],
) -> tuple[int, int] | None:
    """Specify the generated adapter's repeated-FLINT-call contract.

    FLINT does not promise that one `fmpz_is_perfect_power` call returns a
    smallest root or maximal exponent.  The adapter must therefore apply the
    primitive repeatedly to its returned root and multiply the exponents.
    This readable oracle rejects a malformed step instead of guessing.
    """
    number = int(value)
    if number in (-1, 0, 1):
        return number, 1
    current = number
    total_exponent = 1
    while True:
        try:
            result = step(current)
        except (ArithmeticError, OverflowError, RuntimeError, TypeError, ValueError):
            return None
        if result is None:
            break
        try:
            root = int(result[0])
            exponent = int(result[1])
        except (IndexError, OverflowError, TypeError, ValueError):
            return None
        # A raw exponent zero is FLINT's non-power result.  Accepting `None`
        # as the host-neutral spelling keeps the oracle convenient in tests.
        if exponent == 0:
            break
        if (
            exponent < 2
            or exponent > abs(current).bit_length()
            or abs(root) >= abs(current)
        ):
            return None
        if root**exponent != current:
            return None
        # For |current| > 1 every genuine extraction strictly reduces the
        # magnitude.  The pre-power progress check also bounds corruption.
        current = root
        total_exponent *= exponent
    if number > 0:
        current = abs(current)
    if number < 0 and (current >= 0 or total_exponent % 2 == 0):
        return None
    return current, total_exponent


def perfect_power_hint(
    value: int,
    readable: Callable[[int], tuple[int, int]],
    candidate: Callable[[int], tuple[int, int] | None] | None = None,
) -> tuple[int, int] | None:
    """Return authenticated maximal perfect-power data, or no FLINT hint.

    `base**exponent == value` authenticates the supplied decomposition.  If
    `base` is not itself a perfect power, the exponent is maximal: any further
    enlargement of the exponent would make `base` a power.  The independent
    readable call on the (usually much smaller) base checks that final premise.
    """
    number = int(value)
    if number in (-1, 0, 1):
        return number, 1
    provider = _generated_perfect_power_candidate if candidate is None else candidate
    try:
        result = provider(number)
        if result is None:
            return None
        base = int(result[0])
        exponent = int(result[1])
    except (
        ArithmeticError,
        ImportError,
        IndexError,
        OSError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
    ):
        return None
    if (
        exponent < 1
        or exponent > abs(number).bit_length()
        or abs(base) > abs(number)
        or base**exponent != number
    ):
        return None
    if number > 0 and base <= 0:
        return None
    if number < 0 and (base >= 0 or exponent % 2 == 0):
        return None
    if exponent == 1:
        return (base, exponent) if base == number else None
    try:
        primitive_base, primitive_exponent = readable(base)
    except (
        ArithmeticError,
        ImportError,
        OSError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
    ):
        return None
    if int(primitive_base) != base or int(primitive_exponent) != 1:
        return None
    return base, exponent


def large_primality_hint(
    value: int,
    witness: Callable[[int, int], bool],
    bases: list[int] | tuple[int, ...],
    screen: Callable[[int], bool | None] | None = None,
) -> tuple[str, dict[str, Any]] | None:
    """Return a fail-closed scheduling classification above `2^64`.

    A FLINT survivor is only probable.  A FLINT rejection has no replayable
    witness, so the host runs its readable Miller--Rabin bases exactly once and
    emits `COMPOSITE` only when one of those bases supplies explicit evidence.
    If every base survives, the classification remains probable despite the
    foreign scheduling hint.  Values below `2^64` are left to the existing
    deterministic theorem.
    """
    number = int(value)
    if number < 1 << 64:
        return None
    operation = _generated_probable_prime_screen if screen is None else screen
    try:
        probable = operation(number)
    except (
        ArithmeticError,
        ImportError,
        OSError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
    ):
        return None
    if not isinstance(probable, bool):
        return None
    if probable:
        return PROBABLE_PRIME, {
            "kind": "flint-probable-prime-screen",
            "value": number,
            "algorithm": "fmpz_is_probabprime",
        }
    checked_bases = []
    try:
        for raw_base in bases:
            base = int(raw_base)
            checked_bases.append(base)
            if witness(number, base):
                return COMPOSITE, {
                    "kind": "miller-rabin-witness",
                    "base": base,
                    "scheduler": "fmpz_is_probabprime",
                }
    except (ArithmeticError, OverflowError, RuntimeError, TypeError, ValueError):
        return None
    return PROBABLE_PRIME, {
        "kind": "strong-probable-prime",
        "value": number,
        "bases": checked_bases,
        "scheduler": "flint-composite-without-replayable-evidence",
    }


__all__ = [
    "iterated_perfect_power_oracle",
    "large_primality_hint",
    "perfect_power_hint",
]
