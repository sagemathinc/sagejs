"""Bounded exact algorithms for finite hyperelliptic Jacobian groups.

The algorithms in this module use only the public additive-group operations.
They deliberately have explicit resource limits: exhaustive enumeration is a
useful correctness fallback for small finite fields, but it is not a disguised
large-scale discrete-log algorithm.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage


class JacobianResourceLimitError(RuntimeError):
    """A requested exact group computation exceeded its declared budget."""

    def __init__(
        self,
        message: str,
        *,
        known_structure: Any = None,
        partial_generators: Any = None,
    ) -> None:
        super().__init__(message)
        self.known_structure = known_structure
        self.partial_generators = partial_generators


def factor_integer_bounded(
    value: Any,
    max_trial_divisions: int = 1_000_000,
) -> list[tuple[Any, int]]:
    """Factor a positive integer by trial division within an explicit budget.

    This is intended for small fallback workloads. Production-sized orders
    should be factored by Sage.js's integer-factorization service and passed to
    the group algorithms explicitly.
    """
    if value <= 0:
        raise ValueError("the integer to factor must be positive")
    if max_trial_divisions < 0:
        raise ValueError("max_trial_divisions must be nonnegative")

    remaining = value
    divisor = 2
    trials = 0
    answer: list[tuple[Any, int]] = []
    while divisor * divisor <= remaining:
        if trials >= max_trial_divisions:
            raise JacobianResourceLimitError(
                "integer factorization exceeded max_trial_divisions="
                + str(max_trial_divisions)
            )
        trials += 1
        exponent = 0
        while remaining % divisor == 0:
            remaining //= divisor
            exponent += 1
        if exponent:
            answer.append((divisor, exponent))
        divisor = 3 if divisor == 2 else divisor + 2
    if remaining > 1:
        answer.append((remaining, 1))
    return answer


def validate_factorization(
    value: Any,
    factorization: list[tuple[Any, int]],
) -> list[tuple[Any, int]]:
    """Validate prime bases, exponents, ordering, and the exact product."""
    product = 1
    previous = 1
    normalized: list[tuple[Any, int]] = []
    for prime, exponent in factorization:
        if prime <= 1 or exponent <= 0:
            raise ValueError(
                "factorization entries must have prime > 1 and exponent > 0"
            )
        if not sage.is_prime(prime):
            raise ValueError("factorization bases must be prime")
        if prime <= previous:
            raise ValueError("factorization primes must be strictly increasing")
        power = 1
        for _index in range(exponent):
            power *= prime
        product *= power
        previous = prime
        normalized.append((prime, exponent))
    if product != value:
        raise ValueError("factorization does not multiply to the supplied integer")
    return normalized


def element_order_from_multiple(
    element: Any,
    multiple: Any,
    factorization: list[tuple[Any, int]] | None = None,
    max_trial_divisions: int = 1_000_000,
    scalar_algorithm: str = "auto",
) -> Any:
    """Return the exact order of `element`, given a known annihilating multiple."""
    if multiple <= 0:
        raise ValueError("the annihilating multiple must be positive")
    if not element.scalar_multiple(multiple, algorithm=scalar_algorithm).is_zero():
        raise ValueError("the supplied multiple does not annihilate the element")
    factors = (
        factor_integer_bounded(multiple, max_trial_divisions)
        if factorization is None
        else validate_factorization(multiple, factorization)
    )
    order = multiple
    for prime, exponent in factors:
        for _index in range(exponent):
            candidate = order // prime
            if not element.scalar_multiple(
                candidate, algorithm=scalar_algorithm
            ).is_zero():
                break
            order = candidate
    return order


def _p_adic_log_of_count(count: int, prime: Any, maximum: int) -> int:
    """Return `log_prime(count)` and reject a count that is not a prime power."""
    value = count
    exponent = 0
    while value > 1 and value % prime == 0:
        value //= prime
        exponent += 1
    if value != 1 or exponent > maximum:
        raise ArithmeticError(
            "enumerated torsion count is not the expected prime power"
        )
    return exponent


def invariant_factors_from_elements(
    elements: list[Any],
    order: Any,
    factorization: list[tuple[Any, int]] | None = None,
    max_trial_divisions: int = 1_000_000,
) -> tuple[Any, ...]:
    """Determine invariant factors from a complete enumeration of a group.

    For each prime `p`, the sizes of the kernels of multiplication by `p^k`
    determine the elementary divisors. The primary invariant lists are then
    right-aligned and multiplied to obtain `m_1 | ... | m_r`.
    """
    if len(elements) != order:
        raise ArithmeticError(
            "the enumerated group size does not equal its known order"
        )
    factors = (
        factor_integer_bounded(order, max_trial_divisions)
        if factorization is None
        else validate_factorization(order, factorization)
    )
    primary: list[list[Any]] = []
    for prime, exponent in factors:
        kernel_logs = [0]
        images = list(elements)
        for _level in range(1, exponent + 1):
            killed = 0
            next_images = []
            for image in images:
                image = prime * image
                next_images.append(image)
                if image.is_zero():
                    killed += 1
            images = next_images
            kernel_logs.append(
                _p_adic_log_of_count(killed, prime, exponent * len(elements))
            )

        ranks: list[int] = []
        for level in range(1, exponent + 1):
            ranks.append(kernel_logs[level] - kernel_logs[level - 1])
        ranks.append(0)

        powers: list[Any] = []
        for level in range(1, exponent + 1):
            multiplicity = ranks[level - 1] - ranks[level]
            prime_power = 1
            for _index in range(level):
                prime_power *= prime
            for _index in range(multiplicity):
                powers.append(prime_power)
        primary.append(powers)

    rank = 0
    for powers in primary:
        rank = max(rank, len(powers))
    invariants: list[Any] = [1 for _index in range(rank)]
    for powers in primary:
        offset = rank - len(powers)
        for index, power in enumerate(powers):
            invariants[offset + index] *= power

    product = 1
    previous = 1
    for invariant in invariants:
        if invariant % previous != 0:
            raise ArithmeticError(
                "computed group invariants do not form a divisibility chain"
            )
        product *= invariant
        previous = invariant
    if product != order:
        raise ArithmeticError(
            "computed group invariants do not multiply to the group order"
        )
    return tuple(invariants)
