"""Storage-neutral contracts for dense vector operations.

The public `Vector` class owns parent coercion, result construction, and
mutability.  These helpers own only deterministic entry traversal.  Keeping
that boundary explicit lets dynamic Python, future packed kernels, and more
than one public vector representation share exactly the same semantics.

Norms deliberately receive their ring-sensitive operations as callbacks.
For example, exact `ZZ` and `QQ` vectors can use ordinary absolute value and
an exact/symbolic root operation, while `GF(p)` vectors reject absolute value
just as Sage does.  The helpers never coerce exact entries through `float`.
"""

from __future__ import annotations

from typing import Any, Callable, Sequence


UnaryOperation = Callable[[Any], Any]
BinaryOperation = Callable[[Any, Any], Any]
PowerRoot = Callable[[Any, Any], Any]


def vector_is_zero(entries: Sequence[Any]) -> bool:
    """Return whether every entry is zero."""
    for value in entries:
        if value != 0:
            return False
    return True


def vector_nonzero_positions(entries: Sequence[Any]) -> list[int]:
    """Return the increasing positions of the nonzero entries."""
    positions: list[int] = []
    for index in range(len(entries)):
        if entries[index] != 0:
            positions.append(index)
    return positions


def vector_support(entries: Sequence[Any]) -> list[int]:
    """Return the support, equivalently the nonzero positions."""
    return vector_nonzero_positions(entries)


def vector_pairwise_product(
    left: Sequence[Any],
    right: Sequence[Any],
) -> list[Any]:
    """Return corresponding entry products in vector order.

    Public integration must first apply Sage's canonical parent coercion.  A
    length mismatch here is therefore an integration error rather than a
    request to truncate as Python's `zip` would.
    """
    if len(left) != len(right):
        raise ValueError("pairwise products require vectors of equal length")
    output: list[Any] = []
    for index in range(len(left)):
        output.append(left[index] * right[index])
    return output


def vector_outer_product_entries(
    left: Sequence[Any],
    right: Sequence[Any],
) -> list[Any]:
    """Return the outer product as dense row-major entries.

    The result has `len(left)` rows and `len(right)` columns.  Unequal and
    empty dimensions are valid; public integration constructs the matrix over
    the canonical product parent after validating that both inputs are
    vectors.
    """
    output: list[Any] = []
    for left_value in left:
        for right_value in right:
            output.append(left_value * right_value)
    return output


def vector_norm(
    entries: Sequence[Any],
    p: Any,
    infinity: Any,
    absolute_value: UnaryOperation,
    power_root: PowerRoot,
) -> Any:
    """Return the Sage-compatible `p`-norm of `entries`.

    `power_root(total, p)` computes `total ** (1/p)` in the appropriate exact
    or symbolic parent.  In particular it must not use Python floating-point
    division merely because `p` is a Python integer.
    """
    absolute_entries: list[Any] = []
    for value in entries:
        absolute_entries.append(absolute_value(value))

    if p == infinity:
        if len(absolute_entries) == 0:
            raise ValueError("max() iterable argument is empty")
        answer = absolute_entries[0]
        for value in absolute_entries[1:]:
            if value > answer:
                answer = value
        return answer

    if p < 1:
        raise ValueError(str(p) + " is not greater than or equal to 1")

    total: Any = 0
    for value in absolute_entries:
        total += value**p
    return power_root(total, p)


def vector_normalized_entries(
    entries: Sequence[Any],
    p: Any,
    infinity: Any,
    absolute_value: UnaryOperation,
    power_root: PowerRoot,
    divide: BinaryOperation,
) -> list[Any]:
    """Return entries divided by their `p`-norm without mutating the input.

    The caller constructs a new vector over the canonical parent of these
    quotients.  An explicit division callback makes parent widening visible:
    normalizing an integer vector commonly produces a rational or symbolic
    vector, while normalization never changes the source vector's mutability
    or entries.
    """
    length = vector_norm(entries, p, infinity, absolute_value, power_root)
    if length == 0:
        raise ZeroDivisionError("rational division by zero")
    output: list[Any] = []
    for value in entries:
        output.append(divide(value, length))
    return output
