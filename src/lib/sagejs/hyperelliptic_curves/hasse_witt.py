"""Exact Hasse--Witt matrices for hyperelliptic curves over prime fields.

The input polynomial is represented by an ascending list of integer
coefficients.  For the odd-characteristic model

`y^2 = f(x)`

of genus `g`, this module uses the Harvey--Sutherland convention

`W[i,j] = coefficient(f^((p-1)/2), p*(i+1)-(j+1)) mod p`.

Consequently `det(I - T*W)` is the reduction modulo `p` of the first half of
the local L-polynomial.  This direct implementation deliberately computes the
power of `f` in ordinary Python.  It is the readable correctness fallback and
oracle for a batched remainder-forest implementation, not the intended large
prime accelerator.
"""

from __future__ import annotations

from typing import Iterable

_DEFAULT_MAX_WORK = 25_000_000


class HasseWittResourceError(RuntimeError):
    """The direct polynomial-power fallback exceeds its explicit work cap."""

    def __init__(self, estimated_work: int, max_work: int) -> None:
        super().__init__(
            "direct Hasse--Witt polynomial expansion requires an estimated "
            + str(estimated_work)
            + " coefficient products, exceeding max_work="
            + str(max_work)
            + "; use a batched remainder-forest backend or explicitly raise "
            + "max_work"
        )
        self.estimated_work = estimated_work
        self.max_work = max_work


def _is_prime(value: int) -> bool:
    """Return whether `value` is prime, deterministically for 64-bit inputs."""
    if value < 2:
        return False
    small_primes = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)
    for prime in small_primes:
        if value == prime:
            return True
        if value % prime == 0:
            return False

    odd_part = value - 1
    power_of_two = 0
    while odd_part % 2 == 0:
        odd_part //= 2
        power_of_two += 1

    # Deterministic for n < 2^64 (Jim Sinclair's seven-base refinement).
    bases = (2, 325, 9375, 28178, 450775, 9780504, 1795265022)
    for base in bases:
        base %= value
        if base == 0:
            continue
        witness = pow(base, odd_part, value)
        if witness == 1 or witness == value - 1:
            continue
        for _index in range(power_of_two - 1):
            witness = witness * witness % value
            if witness == value - 1:
                break
        else:
            return False
    return True


def _trim(coefficients: list[int]) -> list[int]:
    while len(coefficients) > 1 and coefficients[-1] == 0:
        coefficients.pop()
    return coefficients


def _polynomial_remainder(
    dividend: list[int], divisor: list[int], prime: int
) -> list[int]:
    result = _trim([coefficient % prime for coefficient in dividend])
    divisor = _trim([coefficient % prime for coefficient in divisor])
    if divisor == [0]:
        raise ZeroDivisionError("polynomial division by zero")
    inverse_leading = pow(divisor[-1], prime - 2, prime)
    while result != [0] and len(result) >= len(divisor):
        shift = len(result) - len(divisor)
        scale = result[-1] * inverse_leading % prime
        for index, coefficient in enumerate(divisor):
            result[index + shift] = (
                result[index + shift] - scale * coefficient
            ) % prime
        _trim(result)
    return result


def _is_squarefree(coefficients: list[int], prime: int) -> bool:
    derivative = [
        index * coefficients[index] % prime for index in range(1, len(coefficients))
    ]
    derivative = _trim(derivative or [0])
    left = coefficients
    right = derivative
    while right != [0]:
        left, right = right, _polynomial_remainder(left, right, prime)
    return len(left) == 1


def _multiply_polynomials(left: list[int], right: list[int], prime: int) -> list[int]:
    product = [0] * (len(left) + len(right) - 1)
    for left_index, left_coefficient in enumerate(left):
        if left_coefficient == 0:
            continue
        for right_index, right_coefficient in enumerate(right):
            product[left_index + right_index] = (
                product[left_index + right_index] + left_coefficient * right_coefficient
            ) % prime
    return _trim(product)


def _power_polynomial(coefficients: list[int], exponent: int, prime: int) -> list[int]:
    result = [1]
    factor = coefficients
    while exponent:
        if exponent & 1:
            result = _multiply_polynomials(result, factor, prime)
        exponent //= 2
        if exponent:
            factor = _multiply_polynomials(factor, factor, prime)
    return result


def _checked_model(
    coefficients: Iterable[int], prime: int, genus: int | None
) -> tuple[list[int], int]:
    if not isinstance(prime, int) or isinstance(prime, bool):
        raise TypeError("the characteristic must be an integer prime")
    if prime == 2:
        raise NotImplementedError(
            "Hasse--Witt matrices here require odd characteristic"
        )
    if prime > 2**64 - 1 or not _is_prime(prime):
        raise ValueError("the characteristic must be an odd prime below 2^64")

    normalized = [int(coefficient) % prime for coefficient in coefficients]
    if not normalized:
        raise ValueError("f must have at least one coefficient")
    _trim(normalized)
    degree = len(normalized) - 1
    inferred_genus = (degree - 1) // 2
    if genus is None:
        genus = inferred_genus
    if not isinstance(genus, int) or isinstance(genus, bool) or genus < 1:
        raise ValueError("genus must be a positive integer")
    if degree not in (2 * genus + 1, 2 * genus + 2):
        raise ValueError("the reduced degree of f must be 2*genus+1 or 2*genus+2")
    if not _is_squarefree(normalized, prime):
        raise ValueError("y^2=f(x) is singular in this characteristic")
    return normalized, genus


def hasse_witt_matrix(
    coefficients: Iterable[int],
    prime: int,
    genus: int | None = None,
    *,
    max_work: int = _DEFAULT_MAX_WORK,
) -> tuple[tuple[int, ...], ...]:
    """Return the Hasse--Witt matrix of `y^2=f(x)` over `GF(prime)`.

    `coefficients[k]` is the coefficient of `x^k`.  Both odd- and even-degree
    smooth hyperelliptic models are accepted.  This function rejects degree
    loss and singular reduction instead of returning data for a different
    genus.  The direct polynomial expansion is guarded by `max_work`; large
    primes belong to the remainder-forest accelerator rather than this
    correctness implementation.
    """
    normalized, genus = _checked_model(coefficients, prime, genus)
    if not isinstance(max_work, int) or isinstance(max_work, bool) or max_work < 1:
        raise ValueError("max_work must be a positive integer")
    exponent = (prime - 1) // 2
    final_degree = (len(normalized) - 1) * exponent
    # Binary powering performs geometrically growing convolutions.  Three
    # times the square of the final dense length is a conservative scalar
    # product estimate and, more importantly, is known before any allocation.
    estimated_work = 3 * (final_degree + 1) * (final_degree + 1)
    if estimated_work > max_work:
        raise HasseWittResourceError(estimated_work, max_work)
    power = _power_polynomial(normalized, exponent, prime)
    rows: list[tuple[int, ...]] = []
    for row in range(1, genus + 1):
        entries = []
        for column in range(1, genus + 1):
            index = prime * row - column
            entries.append(power[index] if index < len(power) else 0)
        rows.append(tuple(entries))
    return tuple(rows)


def _determinant(matrix: tuple[tuple[int, ...], ...], prime: int) -> int:
    size = len(matrix)
    if size == 0:
        return 1
    if size == 1:
        return matrix[0][0] % prime
    answer = 0
    for column in range(size):
        minor = tuple(
            tuple(row[index] for index in range(size) if index != column)
            for row in matrix[1:]
        )
        term = matrix[0][column] * _determinant(minor, prime)
        answer += term if column % 2 == 0 else -term
    return answer % prime


def hasse_witt_lpolynomial_residues(
    coefficients: Iterable[int],
    prime: int,
    genus: int | None = None,
    *,
    max_work: int = _DEFAULT_MAX_WORK,
) -> tuple[int, ...]:
    """Return `(c_1,...,c_g)` in `det(I-T*W)` modulo `prime`.

    For a good reduction this equals the independent half of the local
    L-polynomial modulo `prime`.  The result is modular data; it is not an
    integral local L-polynomial.
    """
    matrix = hasse_witt_matrix(coefficients, prime, genus, max_work=max_work)
    size = len(matrix)
    residues: list[int] = []
    # The coefficient of T^k is (-1)^k times the sum of the k-by-k principal
    # minors.  The dimensions of interest are tiny, so exhaustive subsets are
    # clearer than a second characteristic-polynomial implementation.
    for subset_size in range(1, size + 1):
        subsets: list[tuple[int, ...]] = [()]
        for index in range(size):
            subsets += [
                subset + (index,) for subset in subsets if len(subset) < subset_size
            ]
        total = 0
        for subset in subsets:
            if len(subset) != subset_size:
                continue
            minor = tuple(
                tuple(matrix[row][column] for column in subset) for row in subset
            )
            total += _determinant(minor, prime)
        if subset_size % 2:
            total = -total
        residues.append(total % prime)
    return tuple(residues)


__all__ = [
    "HasseWittResourceError",
    "hasse_witt_lpolynomial_residues",
    "hasse_witt_matrix",
]
