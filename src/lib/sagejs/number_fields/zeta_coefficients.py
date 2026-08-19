"""Exact local factors and coefficients of Dedekind zeta functions.

This module deliberately knows nothing about the representation of prime
ideals.  It consumes a compact, certified splitting stream.  A provider is a
callable `provider(start, stop)` which returns one record for every rational
prime in the half-open interval `[start, stop)`, in increasing order.  The
canonical record is

```python
{"version": 1, "prime": p, "factors": [(e1, f1), ..., (eg, fg)]}
```

where `p*O_K = product(P_i^e_i)` and `f_i` is the residue degree.  The
coefficient algorithm uses only the residue degrees, but authenticates the
complete identity `sum(e_i*f_i) == [K:QQ]` before using a record.  Requiring
complete prime coverage prevents a truncated or interrupted splitting stream
from silently producing plausible-looking coefficients.

The public coefficient convention agrees with Sage: `zeta_coefficients(B)`
is `[a_1, ..., a_B]` rather than a list with a dummy coefficient at index
zero.
"""

from __future__ import annotations

from typing import Any, Callable, Iterable, Iterator, Sequence, cast

__all__ = [
    "CoefficientBlock",
    "CompactSplittingRecord",
    "SplittingProvider",
    "SplittingStreamError",
    "ZetaCoefficientLimits",
    "ZetaCoefficientResourceError",
    "coefficient_blocks",
    "compact_splitting_records",
    "local_zeta_coefficients",
    "local_zeta_denominator",
    "local_zeta_factor_data",
    "local_zeta_factors",
    "zeta_coefficients",
    "zeta_coefficient_blocks",
]


SplittingProvider = Callable[[int, int], Iterable[Any]]


class SplittingStreamError(ValueError):
    """A compact splitting stream is incomplete, malformed, or inconsistent."""


class ZetaCoefficientResourceError(RuntimeError):
    """An exact coefficient request exceeds an explicit resource limit."""


class ZetaCoefficientLimits:
    """Deterministic limits checked before prime or coefficient enumeration."""

    def __init__(
        self,
        *,
        maximum_bound: int = 5_000_000,
        maximum_degree: int = 64,
        maximum_prime_interval: int = 10_000_000,
        maximum_block_size: int = 1_000_000,
        maximum_estimated_bytes: int = 512 * 1024 * 1024,
    ) -> None:
        self.maximum_bound = _positive_integer(maximum_bound, "maximum_bound")
        self.maximum_degree = _positive_integer(maximum_degree, "maximum_degree")
        self.maximum_prime_interval = _positive_integer(
            maximum_prime_interval, "maximum_prime_interval"
        )
        self.maximum_block_size = _positive_integer(
            maximum_block_size, "maximum_block_size"
        )
        self.maximum_estimated_bytes = _positive_integer(
            maximum_estimated_bytes, "maximum_estimated_bytes"
        )


class CompactSplittingRecord:
    """Versioned compact decomposition of one rational prime.

    `factors` stores `(ramification_index, residue_degree)` pairs.  Exact
    prime-ideal lattices intentionally do not belong in this coefficient-path
    record.
    """

    def __init__(
        self,
        prime: int,
        factors: tuple[tuple[int, int], ...],
        version: int = 1,
    ) -> None:
        self.prime = prime
        self.factors = factors
        self.version = version

    def as_dict(self) -> dict[str, Any]:
        """Return a stable JSON-compatible representation."""
        return {
            "version": self.version,
            "prime": self.prime,
            "factors": [list(pair) for pair in self.factors],
        }


class CoefficientBlock:
    """One resumable block of exact coefficients with one-based indexing."""

    def __init__(
        self,
        start: int,
        coefficients: tuple[int, ...],
        version: int = 1,
    ) -> None:
        self.start = start
        self.coefficients = coefficients
        self.version = version

    def as_dict(self) -> dict[str, Any]:
        """Return a stable JSON-compatible representation."""
        return {
            "version": self.version,
            "start": self.start,
            "coefficients": list(self.coefficients),
        }


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        result = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    if result != value:
        raise TypeError(name + " must be an integer")
    return result


def _positive_integer(value: Any, name: str) -> int:
    result = _integer(value, name)
    if result <= 0:
        raise ValueError(name + " must be positive")
    return result


def _nonnegative_integer(value: Any, name: str) -> int:
    result = _integer(value, name)
    if result < 0:
        raise ValueError(name + " must be nonnegative")
    return result


def _primes_below(stop: int) -> list[int]:
    """Return all primes below `stop` by an ordinary exact sieve."""
    if stop <= 2:
        return []
    value = stop - 1
    square_root = 1 << ((value.bit_length() + 1) // 2)
    while True:
        improved = (square_root + value // square_root) // 2
        if improved >= square_root:
            break
        square_root = improved
    sieve = bytearray(b"\x01") * stop
    sieve[0:2] = b"\x00\x00"
    for prime in range(2, square_root + 1):
        if sieve[prime]:
            begin = prime * prime
            count = ((stop - 1 - begin) // prime) + 1
            sieve[begin:stop:prime] = b"\x00" * count
    return [index for index in range(2, stop) if sieve[index]]


def _factor_pair(value: Any) -> tuple[int, int]:
    if isinstance(value, dict):
        e_value = value.get("e", value.get("ramification_index"))
        f_value = value.get("f", value.get("residue_degree"))
    elif hasattr(value, "ramification_index") and hasattr(value, "residue_degree"):
        e_value = value.ramification_index
        f_value = value.residue_degree
        if callable(e_value):
            e_value = e_value()
        if callable(f_value):
            f_value = f_value()
    else:
        try:
            e_value, f_value = value
        except (TypeError, ValueError) as error:
            raise SplittingStreamError(
                "each splitting factor must be an (e, f) pair"
            ) from error
    e = _positive_integer(e_value, "ramification index")
    f = _positive_integer(f_value, "residue degree")
    return e, f


def _record_parts(value: Any) -> tuple[Any, Any, Any]:
    if isinstance(value, CompactSplittingRecord):
        return value.version, value.prime, value.factors
    if isinstance(value, dict):
        version = value.get("version", 1)
        prime = value.get("prime", value.get("p"))
        factors = value.get("factors", value.get("decomposition"))
        return version, prime, factors
    if hasattr(value, "prime") or hasattr(value, "p"):
        version = getattr(value, "version", 1)
        prime = getattr(value, "prime", getattr(value, "p", None))
        factors = getattr(value, "factors", getattr(value, "decomposition", None))
        if callable(prime):
            prime = prime()
        if callable(factors):
            factors = factors()
        return version, prime, factors
    try:
        prime, factors = value
    except (TypeError, ValueError) as error:
        raise SplittingStreamError(
            "a splitting record must contain a prime and (e, f) factors"
        ) from error
    return 1, prime, factors


def _compact_record(value: Any, degree: int) -> CompactSplittingRecord:
    version_value, prime_value, factors_value = _record_parts(value)
    version = _positive_integer(version_value, "splitting record version")
    if version != 1:
        raise SplittingStreamError(
            "unsupported compact splitting record version " + str(version)
        )
    prime = _positive_integer(prime_value, "rational prime")
    if factors_value is None:
        raise SplittingStreamError("a splitting record has no factors")
    try:
        factors = tuple(_factor_pair(factor) for factor in factors_value)
    except TypeError as error:
        raise SplittingStreamError("splitting factors must be iterable") from error
    if not factors:
        raise SplittingStreamError("a splitting record must have at least one factor")
    local_degree = sum(pair[0] * pair[1] for pair in factors)
    if local_degree != degree:
        raise SplittingStreamError(
            "splitting record at p="
            + str(prime)
            + " has sum(e*f)="
            + str(local_degree)
            + ", expected degree "
            + str(degree)
        )
    return CompactSplittingRecord(prime=prime, factors=factors)


def _provider_records(provider: Any, start: int, stop: int) -> Iterable[Any]:
    if callable(provider):
        return cast(Iterable[Any], provider(start, stop))
    method = getattr(provider, "splitting_records", None)
    if callable(method):
        return cast(Iterable[Any], method(start, stop))
    raise TypeError(
        "splitting_provider must be callable or define splitting_records(start, stop)"
    )


def compact_splitting_records(
    splitting_provider: SplittingProvider | Any,
    start: int,
    stop: int,
    *,
    degree: int,
    limits: ZetaCoefficientLimits | None = None,
) -> Iterator[CompactSplittingRecord]:
    """Validate and yield a complete compact splitting stream.

    The range is half-open.  Missing, duplicate, composite, out-of-order, or
    extra records are errors, as is an invalid local degree identity.
    """
    start_value = _nonnegative_integer(start, "start")
    stop_value = _nonnegative_integer(stop, "stop")
    if stop_value < start_value:
        raise ValueError("stop must be at least start")
    degree_value = _positive_integer(degree, "degree")
    resource_limits = limits if limits is not None else ZetaCoefficientLimits()
    if degree_value > resource_limits.maximum_degree:
        raise ZetaCoefficientResourceError(
            "number-field degree exceeds the zeta coefficient resource limit"
        )
    if stop_value - start_value > resource_limits.maximum_prime_interval:
        raise ZetaCoefficientResourceError(
            "prime interval exceeds the splitting-stream resource limit"
        )

    expected_primes = [p for p in _primes_below(stop_value) if p >= start_value]
    raw_iterator = iter(_provider_records(splitting_provider, start_value, stop_value))
    for expected in expected_primes:
        try:
            raw_record = next(raw_iterator)
        except StopIteration as error:
            raise SplittingStreamError(
                "splitting stream ended before rational prime " + str(expected)
            ) from error
        record = _compact_record(raw_record, degree_value)
        if record.prime != expected:
            raise SplittingStreamError(
                "splitting stream returned p="
                + str(record.prime)
                + ", expected p="
                + str(expected)
            )
        yield record
    try:
        extra = next(raw_iterator)
    except StopIteration:
        return
    extra_record = _compact_record(extra, degree_value)
    raise SplittingStreamError(
        "splitting stream returned unexpected extra prime " + str(extra_record.prime)
    )


def local_zeta_coefficients(
    residue_degrees: Iterable[int], max_exponent: int
) -> list[int]:
    """Expand `product_f (1-T^f)^(-1)` through `T^max_exponent`.

    The returned list includes the constant coefficient.  Repeated residue
    degrees represent distinct prime ideals and are intentionally retained.
    """
    exponent = _nonnegative_integer(max_exponent, "max_exponent")
    degrees = tuple(
        _positive_integer(value, "residue degree") for value in residue_degrees
    )
    if not degrees:
        raise ValueError("residue_degrees must be nonempty")
    coefficients = [0] * (exponent + 1)
    coefficients[0] = 1
    for residue_degree in degrees:
        for index in range(residue_degree, exponent + 1):
            coefficients[index] += coefficients[index - residue_degree]
    return coefficients


def local_zeta_denominator(residue_degrees: Iterable[int]) -> list[int]:
    """Return ascending coefficients of `product_f (1-T^f)`."""
    degrees = tuple(
        _positive_integer(value, "residue degree") for value in residue_degrees
    )
    if not degrees:
        raise ValueError("residue_degrees must be nonempty")
    denominator = [1]
    for residue_degree in degrees:
        enlarged = denominator + [0] * residue_degree
        for index, coefficient in enumerate(denominator):
            enlarged[index + residue_degree] -= coefficient
        denominator = enlarged
    return denominator


def local_zeta_factor_data(record: Any, *, degree: int) -> dict[str, Any]:
    """Return a versioned exact rational local-factor description."""
    compact = _compact_record(record, _positive_integer(degree, "degree"))
    residue_degrees = tuple(pair[1] for pair in compact.factors)
    return {
        "version": 1,
        "prime": compact.prime,
        "factors": [list(pair) for pair in compact.factors],
        "residue_degrees": list(residue_degrees),
        "numerator": [1],
        "denominator": local_zeta_denominator(residue_degrees),
        "variable": "T",
        "normalization": "T=p^(-s)",
        "proof_status": "exact-from-certified-splitting-record",
    }


def local_zeta_factors(
    splitting_provider: SplittingProvider | Any,
    start: int,
    stop: int,
    *,
    degree: int,
    limits: ZetaCoefficientLimits | None = None,
) -> Iterator[dict[str, Any]]:
    """Yield exact local-factor data for every prime in a half-open range."""
    for record in compact_splitting_records(
        splitting_provider, start, stop, degree=degree, limits=limits
    ):
        yield local_zeta_factor_data(record, degree=degree)


def _maximum_prime_exponent(prime: int, bound: int) -> int:
    exponent = 0
    power = 1
    while power <= bound // prime:
        power *= prime
        exponent += 1
    return exponent


def zeta_coefficients(
    bound: int,
    *,
    degree: int,
    splitting_provider: SplittingProvider | Any,
    limits: ZetaCoefficientLimits | None = None,
) -> list[int]:
    """Return exact `[a_1, ..., a_bound]` by a multiplicative sieve."""
    bound_value = _nonnegative_integer(bound, "bound")
    degree_value = _positive_integer(degree, "degree")
    resource_limits = limits if limits is not None else ZetaCoefficientLimits()
    if bound_value > resource_limits.maximum_bound:
        raise ZetaCoefficientResourceError(
            "zeta coefficient bound exceeds the resource limit"
        )
    if degree_value > resource_limits.maximum_degree:
        raise ZetaCoefficientResourceError(
            "number-field degree exceeds the zeta coefficient resource limit"
        )
    if bound_value == 0:
        return []
    # The local coefficient at p^k is at most the corresponding coefficient
    # of (1-T)^(-degree), hence globally a_n <= d_degree(n) <= n^(degree-1).
    # This is a deliberately conservative allocation estimate, checked before
    # the O(bound) coefficient array is created.
    maximum_coefficient_bits = max(1, (degree_value - 1) * bound_value.bit_length() + 1)
    estimated_bytes_per_coefficient = 40 + (maximum_coefficient_bits + 7) // 8
    estimated_bytes = (bound_value + 1) * estimated_bytes_per_coefficient
    if estimated_bytes > resource_limits.maximum_estimated_bytes:
        raise ZetaCoefficientResourceError(
            "estimated zeta coefficient storage exceeds the resource limit"
        )

    # Internally retain the natural coefficient index.  The dummy zero entry
    # is removed at the public boundary below.
    coefficients = [0] * (bound_value + 1)
    coefficients[1] = 1
    records = compact_splitting_records(
        splitting_provider,
        2,
        bound_value + 1,
        degree=degree_value,
        limits=resource_limits,
    )
    for record in records:
        prime = record.prime
        max_exponent = _maximum_prime_exponent(prime, bound_value)
        residue_degrees = [pair[1] for pair in record.factors]
        local = local_zeta_coefficients(residue_degrees, max_exponent)
        prime_power = prime
        for exponent in range(1, max_exponent + 1):
            local_coefficient = local[exponent]
            if local_coefficient:
                largest_base = bound_value // prime_power
                for base in range(1, largest_base + 1):
                    # Before p is processed, every nonzero base is coprime to
                    # p.  Keep the check explicit: it is cheap and protects
                    # this invariant if the loop organization changes later.
                    if base % prime != 0 and coefficients[base]:
                        coefficients[base * prime_power] = (
                            coefficients[base] * local_coefficient
                        )
            prime_power *= prime
    return coefficients[1:]


def coefficient_blocks(
    coefficients: Sequence[int],
    *,
    block_size: int = 65_536,
    start: int = 1,
    limits: ZetaCoefficientLimits | None = None,
) -> Iterator[CoefficientBlock]:
    """Yield versioned bounded blocks from an exact coefficient prefix."""
    start_value = _positive_integer(start, "start")
    size = _positive_integer(block_size, "block_size")
    resource_limits = limits if limits is not None else ZetaCoefficientLimits()
    if size > resource_limits.maximum_block_size:
        raise ZetaCoefficientResourceError(
            "coefficient block size exceeds the resource limit"
        )
    offset = 0
    while offset < len(coefficients):
        block_values = tuple(
            _nonnegative_integer(value, "zeta coefficient")
            for value in coefficients[offset : offset + size]
        )
        yield CoefficientBlock(
            start=start_value + offset,
            coefficients=block_values,
        )
        offset += len(block_values)


def zeta_coefficient_blocks(
    bound: int,
    *,
    degree: int,
    splitting_provider: SplittingProvider | Any,
    block_size: int = 65_536,
    limits: ZetaCoefficientLimits | None = None,
) -> Iterator[CoefficientBlock]:
    """Compute an exact prefix and expose it as bounded resumable blocks.

    The multiplicative sieve itself uses `O(bound)` storage and is protected
    by `ZetaCoefficientLimits`; iteration avoids a second monolithic transport
    allocation.  A block's `start` is the one-based coefficient index from
    which a consumer can resume serialization.
    """
    resource_limits = limits if limits is not None else ZetaCoefficientLimits()
    coefficients = zeta_coefficients(
        bound,
        degree=degree,
        splitting_provider=splitting_provider,
        limits=resource_limits,
    )
    yield from coefficient_blocks(
        coefficients, block_size=block_size, limits=resource_limits
    )
