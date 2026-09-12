"""Finite ambient point-count preflight, before allocating field elements."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime
from sagejs.polynomial_algorithms.exact_field import ExactField


def point_count(field: Any, dimension: int, projective: bool, limit: Any) -> int:
    """Bound `q^n` or `1 + q + ... + q^n` without huge intermediate powers."""
    if isinstance(limit, bool) or not runtime.is_exact_integer(limit):
        raise TypeError("point enumeration limit must be a positive integer")
    bound = int(limit)
    if bound < 1:
        raise ValueError("point enumeration limit must be a positive integer")
    order = ExactField(field).cardinality
    if order is None:
        raise NotImplementedError("ambient point enumeration requires a finite field")
    count = 1
    increment = 1 if projective else 0
    for _index in range(dimension):
        if count > (bound - increment) // order:
            raise OverflowError(
                "point enumeration exceeds the " + str(bound) + "-point limit"
            )
        count = count * order + increment
    return count
