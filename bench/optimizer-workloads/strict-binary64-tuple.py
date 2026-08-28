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


def __profile_run__():
    values = tuple(float((index % 17) - 8) / 16 for index in range(50_000))
    accumulator = 0.0
    for _repeat in range(200):
        accumulator = strict_binary64_tuple_control(
            values,
            0.125,
            0.9999999403953552,
        )
    return accumulator
