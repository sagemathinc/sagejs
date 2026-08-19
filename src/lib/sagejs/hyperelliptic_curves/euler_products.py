"""Explicitly partial good-prime Euler products and coefficient streams."""

from __future__ import annotations

import cmath
import json
import math
from typing import Any, Iterator

import sagejs as sage
import sagejs.runtime as runtime


def _positive_integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    if value != answer:
        raise ValueError(name + " must be an exact integer")
    if answer < 1:
        raise ValueError(name + " must be positive")
    return answer


def reciprocal_local_coefficients(
    coefficients: Any, maximum_exponent: Any
) -> tuple[Any, ...]:
    """Return coefficients of `1/L(T)` through `T^maximum_exponent`."""
    values = tuple(sage.ZZ(value) for value in coefficients)
    if len(values) < 2 or values[0] != 1:
        raise ValueError("a local Euler numerator must have constant term one")
    maximum = _positive_integer(maximum_exponent, "maximum_exponent")
    answer = [sage.ZZ(1)]
    for exponent in range(1, maximum + 1):
        value = sage.ZZ(0)
        for index in range(1, min(exponent, len(values) - 1) + 1):
            value += values[index] * answer[exponent - index]
        answer.append(-value)
    return tuple(answer)


class GoodPrimeCoefficientStream:
    """Multiplicative coefficients of a certified partial Euler product.

    Primes with unavailable local factors are deliberately omitted from the
    product. Consequently every coefficient whose index is divisible by such
    a prime is zero in this partial-product sequence.
    """

    def __init__(
        self,
        curve: Any,
        bound: Any,
        *,
        algorithm: str = "auto",
        chunk_size: Any = 100_000,
    ) -> None:
        self.curve = curve
        self.bound = _positive_integer(bound, "bound")
        self.algorithm = str(algorithm)
        self.chunk_size = _positive_integer(chunk_size, "chunk_size")
        self.local_coefficients: dict[int, tuple[Any, ...]] = {}
        self.omitted_primes: dict[int, str | None] = {}
        self.backend_counts: dict[str, int] = {}
        self._smallest_prime = self._smallest_prime_table(self.bound)
        for record in curve.local_data(
            2,
            self.bound,
            algorithm=self.algorithm,
            chunk_size=self.chunk_size,
        ):
            prime = int(record.prime)
            self.backend_counts[record.backend] = (
                self.backend_counts.get(record.backend, 0) + 1
            )
            if not record.available or record.coefficients is None:
                self.omitted_primes[prime] = record.reason
                continue
            exponent = 0
            power = prime
            while power <= self.bound:
                exponent += 1
                if power > self.bound // prime:
                    break
                power *= prime
            self.local_coefficients[prime] = reciprocal_local_coefficients(
                record.coefficients, exponent
            )

    @staticmethod
    def _smallest_prime_table(bound: int) -> list[int]:
        table = [0 for _index in range(bound + 1)]
        for prime in range(2, bound + 1):
            if table[prime] != 0:
                continue
            table[prime] = prime
            if prime <= bound // prime:
                for multiple in range(prime * prime, bound + 1, prime):
                    if table[multiple] == 0:
                        table[multiple] = prime
        return table

    def coefficient(self, index: Any) -> Any:
        """Return one exact coefficient of the partial Euler product."""
        value = _positive_integer(index, "index")
        if value > self.bound:
            raise ValueError("the coefficient index exceeds the stream bound")
        answer = sage.ZZ(1)
        remaining = value
        while remaining > 1:
            prime = self._smallest_prime[remaining]
            exponent = 0
            while remaining % prime == 0:
                remaining //= prime
                exponent += 1
            local = self.local_coefficients.get(prime)
            if local is None:
                return sage.ZZ(0)
            answer *= local[exponent]
        return answer

    def __iter__(self) -> Iterator[tuple[int, Any]]:
        for index in range(1, self.bound + 1):
            yield index, self.coefficient(index)

    def coefficients(self) -> list[Any]:
        """Materialize `[a_0,...,a_bound]` with Sage-compatible `a_0=0`."""
        return [sage.ZZ(0)] + [
            self.coefficient(index) for index in range(1, self.bound + 1)
        ]

    def provenance(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic-good-prime-coefficients/v1",
            "normalization": "product over available primes of 1/L_p(p^-s)",
            "bound": self.bound,
            "algorithm": self.algorithm,
            "included_primes": tuple(sorted(self.local_coefficients)),
            "omitted_primes": {
                str(prime): reason
                for prime, reason in sorted(self.omitted_primes.items())
            },
            "backend_counts": dict(self.backend_counts),
        }

    def export_jsonl(self, path: Any) -> dict[str, Any]:
        """Write an exact decimal-string coefficient stream."""
        with open(path, "w", encoding="utf-8", newline="\n") as output:
            output.write(
                json.dumps(
                    {"type": "header", **self.provenance()},
                    sort_keys=True,
                    separators=(",", ":"),
                )
                + "\n"
            )
            for index, coefficient in self:
                output.write(
                    json.dumps(
                        {
                            "type": "coefficient",
                            "index": str(index),
                            "value": str(coefficient),
                        },
                        sort_keys=True,
                        separators=(",", ":"),
                    )
                    + "\n"
                )
        return {"path": str(path), "coefficients": self.bound}


def good_prime_euler_factors(
    curve: Any,
    start: Any,
    stop: Any,
    *,
    algorithm: str = "auto",
    chunk_size: Any = 100_000,
) -> Iterator[Any]:
    """Yield available certified local-data rows in a closed interval."""
    for record in curve.local_data(
        start, stop, algorithm=algorithm, chunk_size=chunk_size
    ):
        if record.available:
            yield record


def truncated_good_prime_euler_product(
    curve: Any,
    s: Any,
    prime_bound: Any,
    *,
    algorithm: str = "auto",
    chunk_size: Any = 100_000,
    field: Any = None,
) -> dict[str, Any]:
    """Evaluate the explicitly partial product over available good primes."""
    bound = _positive_integer(prime_bound, "prime_bound")
    complex_field = (
        runtime.reflect.get(runtime.global_object, "CDF") if field is None else field
    )
    argument = complex_field(s)
    product = complex_field(1)
    included: list[int] = []
    omitted: dict[int, str | None] = {}
    for record in curve.local_data(
        2, bound, algorithm=algorithm, chunk_size=chunk_size
    ):
        prime = int(record.prime)
        if not record.available or record.coefficients is None:
            omitted[prime] = record.reason
            continue
        if runtime.is_exact_integer(s):
            local_parameter = complex_field(prime) ** (-int(s))
        else:
            try:
                numerical_argument = complex(s)
            except TypeError:
                numerical_argument = complex(
                    float(argument.real()), float(argument.imag())
                )
            local_parameter = complex_field(
                cmath.exp(-numerical_argument * math.log(prime))
            )
        local_value = complex_field(0)
        power = complex_field(1)
        for coefficient in record.coefficients:
            local_value += complex_field(coefficient) * power
            power *= local_parameter
        product /= local_value
        included.append(prime)
    return {
        "value": product,
        "prime_bound": bound,
        "included_primes": tuple(included),
        "omitted_primes": omitted,
        "normalization": "product over available primes of 1/L_p(p^-s)",
        "is_global_lfunction": False,
    }
