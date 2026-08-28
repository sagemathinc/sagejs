from sagejs.compiler import optimize


@optimize(
    require="math.strict-float-region.v1",
    coverage="all-loops",
    target="v8",
    guard_failure="fallback",
)
def float_recurrence(count: int, value: float, multiplier: float) -> float:
    for step in range(count):
        value = value * multiplier
    return value


@optimize(
    require="math.strict-float-region.v1",
    coverage="all-loops",
    target="v8",
    guard_failure="error",
)
def float_recurrence_error(count: int, value: float, multiplier: float) -> float:
    for step in range(count):
        value = value * multiplier
    return value
