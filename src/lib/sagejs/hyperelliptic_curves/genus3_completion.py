"""Certified integral completion of genus-3 Hasse--Witt residues.

For a genus-3 local L-polynomial write

`L(T) = 1 + c1*T + c2*T^2 + c3*T^3 + p*c2*T^4
        + p^2*c1*T^5 + p^3*T^6`.

Hasse--Witt computation gives `(c1,c2,c3)` only modulo `p`.  The routines in
this module enumerate every integral lift satisfying the exact Weil
constraints and optionally filter it using certified group information.  They
never select a nearest numerical lift: ambiguity and resource exhaustion are
explicit results.
"""

from __future__ import annotations

from math import gcd, isqrt
from typing import Any, Callable, Iterable

from sagejs.hyperelliptic_curves.hasse_witt import _is_prime


Rational = tuple[int, int]
Candidate = tuple[int, int, int]


def _rational(numerator: int, denominator: int = 1) -> Rational:
    if denominator == 0:
        raise ZeroDivisionError("rational denominator is zero")
    if denominator < 0:
        numerator = -numerator
        denominator = -denominator
    divisor = gcd(abs(numerator), denominator)
    return numerator // divisor, denominator // divisor


def _rational_subtract(left: Rational, right: Rational) -> Rational:
    return _rational(left[0] * right[1] - right[0] * left[1], left[1] * right[1])


def _rational_multiply(left: Rational, right: Rational) -> Rational:
    return _rational(left[0] * right[0], left[1] * right[1])


def _rational_divide(left: Rational, right: Rational) -> Rational:
    return _rational(left[0] * right[1], left[1] * right[0])


def _trim_rational_polynomial(polynomial: list[Rational]) -> list[Rational]:
    while len(polynomial) > 1 and polynomial[-1][0] == 0:
        polynomial.pop()
    return polynomial


def _rational_remainder(
    dividend: list[Rational], divisor: list[Rational]
) -> list[Rational]:
    remainder = dividend[:]
    while len(remainder) >= len(divisor) and not (
        len(remainder) == 1 and remainder[0][0] == 0
    ):
        shift = len(remainder) - len(divisor)
        scale = _rational_divide(remainder[-1], divisor[-1])
        for index, coefficient in enumerate(divisor):
            position = index + shift
            remainder[position] = _rational_subtract(
                remainder[position], _rational_multiply(scale, coefficient)
            )
        _trim_rational_polynomial(remainder)
    return remainder


def _sturm_sequence(integer_polynomial: list[int]) -> list[list[Rational]]:
    polynomial = [_rational(coefficient) for coefficient in integer_polynomial]
    _trim_rational_polynomial(polynomial)
    derivative = [
        _rational_multiply(polynomial[index], _rational(index))
        for index in range(1, len(polynomial))
    ]
    sequence = [polynomial, derivative]
    while not (len(sequence[-1]) == 1 and sequence[-1][0][0] == 0):
        remainder = _rational_remainder(sequence[-2], sequence[-1])
        remainder = [(-coefficient[0], coefficient[1]) for coefficient in remainder]
        sequence.append(remainder)
        if len(remainder) == 1:
            break
    if len(sequence[-1]) == 1 and sequence[-1][0][0] == 0:
        sequence.pop()
    return sequence


def _sign_at_integer(polynomial: list[Rational], value: int) -> int:
    result = _rational(0)
    for coefficient in reversed(polynomial):
        result = _rational_subtract(
            _rational_multiply(result, _rational(value)),
            (-coefficient[0], coefficient[1]),
        )
    if result[0] < 0:
        return -1
    return 1 if result[0] > 0 else 0


def _variations(signs: Iterable[int]) -> int:
    previous = 0
    count = 0
    for sign in signs:
        if sign == 0:
            continue
        if previous and sign != previous:
            count += 1
        previous = sign
    return count


def _roots_strictly_above(integer_polynomial: list[int], lower: int) -> int:
    sequence = _sturm_sequence(integer_polynomial)
    at_lower = _variations(
        _sign_at_integer(polynomial, lower) for polynomial in sequence
    )
    at_infinity = _variations(
        (-1 if polynomial[-1][0] < 0 else 1) for polynomial in sequence
    )
    return at_lower - at_infinity


def _is_genus3_weil_candidate(
    prime: int, coefficient1: int, coefficient2: int, coefficient3: int
) -> bool:
    """Test the genus-3 Weil condition using exact integer arithmetic.

    Factorization into reciprocal pairs has the form

    `L(T) = product_i (1 - x_i*T + p*T^2)`.

    The associated real Weil polynomial is

    `Q(X) = X^3 + c1*X^2 + (c2-3p)*X + (c3-2p*c1)`.

    Thus `L` is a p-Weil polynomial exactly when all roots of `Q` are real and
    lie in `[-2*sqrt(p), 2*sqrt(p)]`.  A nonnegative cubic discriminant proves
    real-rootedness.  Given real roots `x_i`, the polynomial with roots
    `x_i^2` has integer coefficients; Sturm's theorem exactly certifies that
    none of these squares exceeds `4p`.  No floating-point root test occurs.
    """
    a_value = coefficient1
    b_value = coefficient2 - 3 * prime
    c_value = coefficient3 - 2 * prime * coefficient1
    discriminant = (
        a_value * a_value * b_value * b_value
        - 4 * b_value * b_value * b_value
        - 4 * a_value * a_value * a_value * c_value
        - 27 * c_value * c_value
        + 18 * a_value * b_value * c_value
    )
    if discriminant < 0:
        return False

    # S(Y) = product_i (Y-x_i^2), in ascending coefficient order.
    squared_root_polynomial = [
        -(c_value * c_value),
        b_value * b_value - 2 * a_value * c_value,
        -(a_value * a_value - 2 * b_value),
        1,
    ]
    return _roots_strictly_above(squared_root_polynomial, 4 * prime) == 0


def _ceil_div(numerator: int, denominator: int) -> int:
    return -((-numerator) // denominator)


def _congruent_values(residue: int, lower: int, upper: int, modulus: int) -> range:
    first = lower + (residue - lower) % modulus
    if first > upper:
        return range(0)
    return range(first, upper + 1, modulus)


def _checked_inputs(
    prime: int, residues: Iterable[int], max_candidates: int, max_combinations: int
) -> tuple[tuple[int, int, int], int, int]:
    if (
        not isinstance(prime, int)
        or isinstance(prime, bool)
        or prime <= 2
        or prime > 2**64 - 1
        or not _is_prime(prime)
    ):
        raise ValueError("prime must be an odd prime below 2^64")
    normalized = tuple(int(value) % prime for value in residues)
    if len(normalized) != 3:
        raise ValueError("genus-3 completion requires exactly three residues")
    if max_candidates < 1:
        raise ValueError("max_candidates must be positive")
    if max_combinations < 1:
        raise ValueError("max_combinations must be positive")
    return normalized, int(max_candidates), int(max_combinations)


def _candidate_iterator(
    prime: int, residues: tuple[int, int, int]
) -> Iterable[Candidate]:
    coefficient1_bound = isqrt(36 * prime)
    coefficient3_bound = isqrt(400 * prime * prime * prime)
    for coefficient1 in _congruent_values(
        residues[0], -coefficient1_bound, coefficient1_bound, prime
    ):
        # If x_1,x_2,x_3 are in [-2sqrt(p),2sqrt(p)], fixed-sum bounds on
        # their second elementary symmetric function give exactly
        # c1^2/2-3p <= c2 <= c1^2/3+3p.
        coefficient2_lower = _ceil_div(coefficient1 * coefficient1 - 6 * prime, 2)
        coefficient2_upper = (coefficient1 * coefficient1 + 9 * prime) // 3
        for coefficient2 in _congruent_values(
            residues[1], coefficient2_lower, coefficient2_upper, prime
        ):
            for coefficient3 in _congruent_values(
                residues[2], -coefficient3_bound, coefficient3_bound, prime
            ):
                yield coefficient1, coefficient2, coefficient3


def _scan_candidate_lifts(
    prime: int,
    residues: tuple[int, int, int],
    accept: Callable[[Candidate], bool],
    max_candidates: int,
    max_combinations: int,
) -> dict[str, Any]:
    """Scan exact Weil lifts once, retaining only accepted candidates."""
    candidates: list[Candidate] = []
    initial_candidate_count = 0
    remaining_candidate_count = 0
    combinations_examined = 0
    for candidate in _candidate_iterator(prime, residues):
        combinations_examined += 1
        if combinations_examined > max_combinations:
            return {
                "status": "resource_limit",
                "initial_candidate_count": initial_candidate_count,
                "remaining_candidate_count": None,
                "candidates": (),
                "diagnostics": {
                    "reason": "max_combinations exceeded",
                    "combinations_examined": combinations_examined - 1,
                    "max_combinations": max_combinations,
                    "max_candidates": max_candidates,
                },
            }
        if not _is_genus3_weil_candidate(prime, *candidate):
            continue
        initial_candidate_count += 1
        if not accept(candidate):
            continue
        remaining_candidate_count += 1
        if len(candidates) < max_candidates:
            candidates.append(candidate)

    if remaining_candidate_count > max_candidates:
        return {
            "status": "resource_limit",
            "initial_candidate_count": initial_candidate_count,
            "remaining_candidate_count": remaining_candidate_count,
            "candidates": (),
            "diagnostics": {
                "reason": "max_candidates exceeded",
                "combinations_examined": combinations_examined,
                "max_combinations": max_combinations,
                "max_candidates": max_candidates,
            },
        }
    return {
        "status": "ok",
        "initial_candidate_count": initial_candidate_count,
        "remaining_candidate_count": remaining_candidate_count,
        "candidates": tuple(candidates),
        "diagnostics": {
            "combinations_examined": combinations_examined,
            "max_combinations": max_combinations,
            "max_candidates": max_candidates,
        },
    }


def _lpolynomial(candidate: Candidate, prime: int) -> tuple[int, ...]:
    coefficient1, coefficient2, coefficient3 = candidate
    return (
        1,
        coefficient1,
        coefficient2,
        coefficient3,
        prime * coefficient2,
        prime * prime * coefficient1,
        prime * prime * prime,
    )


def jacobian_order_from_coefficients(candidate: Candidate, prime: int) -> int:
    """Return `L(1)`, the Jacobian order attached to `candidate`."""
    coefficient1, coefficient2, coefficient3 = candidate
    return (
        prime**3
        + 1
        + (prime * prime + 1) * coefficient1
        + (prime + 1) * coefficient2
        + coefficient3
    )


def twist_order_from_coefficients(candidate: Candidate, prime: int) -> int:
    """Return `L(-1)`, the quadratic-twist Jacobian order.

    A quadratic twist replaces `L(T)` by `L(-T)`, hence the signs of `c1` and
    `c3` change while the sign of `c2` does not.
    """
    coefficient1, coefficient2, coefficient3 = candidate
    return (
        prime**3
        + 1
        - (prime * prime + 1) * coefficient1
        + (prime + 1) * coefficient2
        - coefficient3
    )


def enumerate_genus3_weil_candidates(
    prime: int,
    residues: Iterable[int],
    *,
    max_candidates: int = 100_000,
    max_combinations: int = 2_000_000,
) -> dict[str, Any]:
    """Enumerate every genus-3 p-Weil lift of three Hasse--Witt residues.

    If either resource limit is reached, `status` is `"resource_limit"`,
    `truncated` is true, and `candidates` is empty so a partial list cannot be
    mistaken for the complete answer.
    """
    normalized, max_candidates, max_combinations = _checked_inputs(
        prime, residues, max_candidates, max_combinations
    )
    scan = _scan_candidate_lifts(
        prime,
        normalized,
        lambda _candidate: True,
        max_candidates,
        max_combinations,
    )
    if scan["status"] == "resource_limit":
        return {
            "status": "resource_limit",
            "prime": prime,
            "residues": normalized,
            "candidate_count": scan["initial_candidate_count"],
            "candidates": (),
            "truncated": True,
            "diagnostics": scan["diagnostics"],
        }
    return {
        "status": "ok",
        "prime": prime,
        "residues": normalized,
        "candidate_count": scan["initial_candidate_count"],
        "candidates": scan["candidates"],
        "truncated": False,
        "diagnostics": scan["diagnostics"],
    }


def _checked_positive_optional(value: int | None, name: str) -> int | None:
    if value is None:
        return None
    value = int(value)
    if value <= 0:
        raise ValueError(name + " must be positive")
    return value


def _checked_witnesses(values: Iterable[int], name: str) -> tuple[int, ...]:
    witnesses = tuple(int(value) for value in values)
    if any(value <= 0 for value in witnesses):
        raise ValueError(name + " must contain only positive integers")
    return witnesses


def _checked_annihilation_tests(
    values: Iterable[Callable[[int], bool]], name: str
) -> tuple[Callable[[int], bool], ...]:
    tests = tuple(values)
    if any(not callable(test) for test in tests):
        raise TypeError(name + " must contain only callables")
    return tests


def complete_genus3_lpolynomial(
    prime: int,
    residues: Iterable[int],
    *,
    jacobian_order: int | None = None,
    twist_order: int | None = None,
    jacobian_exponent_witnesses: Iterable[int] = (),
    twist_exponent_witnesses: Iterable[int] = (),
    jacobian_annihilation_tests: Iterable[Callable[[int], bool]] = (),
    twist_annihilation_tests: Iterable[Callable[[int], bool]] = (),
    max_candidates: int = 100_000,
    max_combinations: int = 2_000_000,
) -> dict[str, Any]:
    """Complete Hasse--Witt residues using exact group/order evidence.

    A value in `jacobian_exponent_witnesses` (or its twist counterpart) is a
    certified order of a group element, equivalently a certified divisor of
    the group exponent.  The actual Jacobian order is in the Weil candidate
    set and is divisible by every such witness.  Therefore, if divisibility
    leaves one candidate, the lift is exact (the randomized search producing
    a witness may be Las Vegas, but this filter has no probabilistic step).

    Each function in `jacobian_annihilation_tests` receives a candidate
    `L(1)` and must compute whether that integer annihilates a particular,
    already constructed Jacobian element.  The twist callbacks analogously
    receive `L(-1)`.  A false answer certifiably excludes the candidate.  The
    callback must return an actual boolean; exceptions propagate unchanged.

    Exact `jacobian_order` and `twist_order` values filter by `L(1)` and
    `L(-1)`, respectively.  The result always reports unique, indeterminate,
    inconsistent, or resource_limit; it never returns a preferred ambiguous
    lift.
    """
    jacobian_order = _checked_positive_optional(jacobian_order, "jacobian_order")
    twist_order = _checked_positive_optional(twist_order, "twist_order")
    jacobian_witnesses = _checked_witnesses(
        jacobian_exponent_witnesses, "jacobian_exponent_witnesses"
    )
    twist_witnesses = _checked_witnesses(
        twist_exponent_witnesses, "twist_exponent_witnesses"
    )
    jacobian_tests = _checked_annihilation_tests(
        jacobian_annihilation_tests, "jacobian_annihilation_tests"
    )
    twist_tests = _checked_annihilation_tests(
        twist_annihilation_tests, "twist_annihilation_tests"
    )
    normalized, max_candidates, max_combinations = _checked_inputs(
        prime, residues, max_candidates, max_combinations
    )
    filters: list[dict[str, Any]] = []
    if jacobian_order is not None:
        filters.append({"kind": "jacobian_order", "value": jacobian_order})
    if twist_order is not None:
        filters.append({"kind": "twist_order", "value": twist_order})
    for witness in jacobian_witnesses:
        filters.append({"kind": "jacobian_exponent_witness", "value": witness})
    for witness in twist_witnesses:
        filters.append({"kind": "twist_exponent_witness", "value": witness})
    for index in range(len(jacobian_tests)):
        filters.append({"kind": "jacobian_annihilation_test", "index": index})
    for index in range(len(twist_tests)):
        filters.append({"kind": "twist_annihilation_test", "index": index})

    annihilation_calls = {"jacobian": 0, "twist": 0}

    def passes_test(test: Callable[[int], bool], order: int, kind: str) -> bool:
        annihilation_calls[kind] += 1
        result = test(order)
        if not isinstance(result, bool):
            raise TypeError(kind + " annihilation test must return bool")
        return result

    def accept(candidate: Candidate) -> bool:
        order = jacobian_order_from_coefficients(candidate, prime)
        candidate_twist_order = twist_order_from_coefficients(candidate, prime)
        if jacobian_order is not None and order != jacobian_order:
            return False
        if twist_order is not None and candidate_twist_order != twist_order:
            return False
        if any(order % witness for witness in jacobian_witnesses):
            return False
        if any(candidate_twist_order % witness for witness in twist_witnesses):
            return False
        if any(not passes_test(test, order, "jacobian") for test in jacobian_tests):
            return False
        if any(
            not passes_test(test, candidate_twist_order, "twist")
            for test in twist_tests
        ):
            return False
        return True

    scan = _scan_candidate_lifts(
        prime,
        normalized,
        accept,
        max_candidates,
        max_combinations,
    )
    scan["diagnostics"]["annihilation_test_calls"] = dict(annihilation_calls)
    if scan["status"] == "resource_limit":
        return {
            "status": "resource_limit",
            "coefficients": None,
            "lpolynomial": None,
            "initial_candidate_count": scan["initial_candidate_count"],
            "remaining_candidate_count": scan["remaining_candidate_count"],
            "candidates": (),
            "filters": tuple(filters),
            "diagnostics": scan["diagnostics"],
        }

    remaining = scan["candidates"]

    if len(remaining) == 1:
        status = "unique"
        coefficients: Candidate | None = remaining[0]
        lpolynomial: tuple[int, ...] | None = _lpolynomial(remaining[0], prime)
    elif remaining:
        status = "indeterminate"
        coefficients = None
        lpolynomial = None
    else:
        status = "inconsistent"
        coefficients = None
        lpolynomial = None
    return {
        "status": status,
        "coefficients": coefficients,
        "lpolynomial": lpolynomial,
        "initial_candidate_count": scan["initial_candidate_count"],
        "remaining_candidate_count": len(remaining),
        "candidates": tuple(remaining),
        "filters": tuple(filters),
        "diagnostics": scan["diagnostics"],
    }


__all__ = [
    "complete_genus3_lpolynomial",
    "enumerate_genus3_weil_candidates",
    "jacobian_order_from_coefficients",
    "twist_order_from_coefficients",
]
