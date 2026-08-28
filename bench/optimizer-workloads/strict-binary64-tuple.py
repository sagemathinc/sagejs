"""Immutable strict-binary64 tuple optimizer calibration control."""

from sagejs.compiler import optimize


@optimize(
    require="math.strict-float-array-region.v1",
    target="v8",
    guard_failure="error",
)
def strict_binary64_tuple_control(
    values: tuple[float, ...],
    accumulator: float,
    multiplier: float,
) -> float:
    for value in values:
        accumulator = accumulator * multiplier + value
    return accumulator
