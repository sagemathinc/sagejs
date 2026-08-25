"""Independent source-identifier hygiene compiler witness."""

from __future__ import annotations

from typing import Tuple

from sagejs.native import PrimeFieldModulus, UInt64Buffer, native, uint64


def record_status(
    statuses: UInt64Buffer,
    status: uint64,
    result: uint64,
) -> bool:
    """Use names that overlap the native wrapper's historical temporaries."""
    statuses[0] = status
    statuses[1] = result
    return True


@native
def tuple_identifier_witness(
    status: uint64,
    item: uint64,
    result_0: uint64,
) -> Tuple[bool, Integer]:
    """Overlap status, tuple-item, and tuple-result wrapper temporaries."""
    total = status + item + result_0
    exact_total = total + 0
    return True, exact_total


@native
def integer_identifier_witness(
    value: Integer,
    value_initialized: Integer,
    result: Integer,
) -> Integer:
    """Overlap exact-result and exact-initialization flag names."""
    return value + value_initialized + result


@native
def float_identifier_witness(
    status: float,
    float64_result: float,
) -> float:
    """Overlap the binary64 adapter's status and result temporaries."""
    return status + float64_result


@native
def identifier_hygiene_witness(
    statuses: UInt64Buffer,
    status: uint64,
    result: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Reach the colliding helper from a prime-field public kernel."""
    accepted = record_status(statuses, status, result)
    return accepted
