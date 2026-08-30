"""Bench-only lawful FLINT block route for dense prime-field integrals.

This module is discovery evidence, not a production dispatcher. It uses the
already declared `flint_prime_polynomial_integral` primitive on coefficient
blocks whose local denominators are invertible. Characteristic holes are
checked before allocation or foreign calls, so a nonzero singular coefficient
uses the untouched public route and preserves its exact exception.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime
from sagejs.polynomial_algorithms import public_structural


def _buffer_view(source: Any, start: int, stop: int) -> Any:
    subarray = runtime.reflect.get(source, "subarray")
    return runtime.reflect.apply(subarray, source, [start, stop])


def _buffer_set(destination: Any, source: Any, start: int) -> None:
    setter = runtime.reflect.get(destination, "set")
    runtime.reflect.apply(setter, destination, [source, start])


def lawful_flint_block_integral(source: Any, prime: int) -> Any:
    """Return the candidate integral, or enter the untouched public fallback."""
    source_length = source._coefficient_length()
    storage = source._storage

    # Finish semantic preflight before allocating or publishing candidate
    # state. The fallback repeats the same source operation and therefore owns
    # the exact public exception and proof behavior.
    for singular in range(prime - 1, source_length, prime):
        if storage[singular] != 0:
            return source.integral()

    kernel = public_structural._polynomial_structural_flint_module()
    output = runtime.uint64_buffer(source_length + 1)
    for start in range(0, source_length, prime):
        available = min(prime - 1, source_length - start)
        if available == 0:
            continue
        block_source = _buffer_view(storage, start, start + available)
        block_output = runtime.uint64_buffer(available + 1)
        valid = kernel.flint_prime_polynomial_integral(
            block_output,
            block_source,
            available + 1,
            available,
            prime,
        )
        if not valid:
            raise RuntimeError("packed prime-field polynomial block integral failed")
        _buffer_set(output, block_output, start)
    return source._new(public_structural._trim_uint64_buffer(output))


def candidate_accounting(source_length: int, prime: int) -> dict[str, int]:
    """Return deterministic boundary counts for inclusive measurement."""
    calls = (source_length + prime - 1) // prime
    holes = source_length // prime
    return {
        "foreign_calls": calls,
        "input_views": calls,
        "characteristic_holes": holes,
        "output_entries": source_length + 1,
        "result_constructions": 1,
    }


def exact_discovery_witness() -> tuple[Any, ...]:
    """Exercise multiple holes, derivative replay, and the public failure path."""
    prime = 257
    source_length = 10_000
    finite_fields = __import__("sagejs._baselib.finite_fields", fromlist=["GF"])
    polynomial = __import__("sagejs._baselib.polynomial", fromlist=["PolynomialRing"])
    field = finite_fields.GF(prime)
    ring = polynomial.PolynomialRing(field, "x")
    coefficients = [
        (index * index + 3 * index - 7) % prime for index in range(source_length)
    ]
    for singular in range(prime - 1, source_length, prime):
        coefficients[singular] = 0
    polynomial = ring(coefficients)
    baseline = polynomial.integral()
    candidate = lawful_flint_block_integral(polynomial, prime)
    assert candidate == baseline
    assert candidate.derivative() == polynomial
    indices = (0, 1, 2, 256, 257, 258, 10_000)
    projection = tuple(int(candidate[index].lift()) for index in indices)
    assert projection == (0, 250, 127, 9, 0, 250, 146)

    coefficients[513] = 1
    singular_polynomial = ring(coefficients)
    baseline_error = None
    candidate_error = None
    try:
        singular_polynomial.integral()
    except Exception as error:
        baseline_error = (type(error).__name__, str(error))
    try:
        lawful_flint_block_integral(singular_polynomial, prime)
    except Exception as error:
        candidate_error = (type(error).__name__, str(error))
    assert baseline_error is not None
    assert candidate_error == baseline_error
    return (projection, candidate_accounting(source_length, prime), candidate_error)


__all__ = [
    "candidate_accounting",
    "exact_discovery_witness",
    "lawful_flint_block_integral",
]


if __name__ == "__main__":
    print(exact_discovery_witness())
