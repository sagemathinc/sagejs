"""Immutable bounded-integer optimizer calibration control."""

from sagejs.compiler import optimize


@optimize(
    require="math.bounded-integer-region.v1",
    target="v8",
    guard_failure="error",
)
def bounded_integer_control(
    count: int,
    value: int,
    multiplier: int,
    increment: int,
) -> int:
    for _index in range(count):
        value = value * multiplier + increment
    return value
