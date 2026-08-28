from sagejs.compiler import optimize

R = Zmod(1009)


@optimize(
    require="math.closed-ring-region.v1",
    coverage="all-loops",
    target="adaptive",
    guard_failure="fallback",
)
def modular_recurrence(count, value, multiplier, increment):
    for step in range(count):
        value = value * multiplier + increment
    return value


@optimize(
    require="math.closed-ring-region.v1",
    coverage="all-loops",
    target="adaptive",
    guard_failure="error",
)
def modular_recurrence_error(count, value, multiplier, increment):
    for step in range(count):
        value = value * multiplier + increment
    return value


@optimize(
    require="math.closed-ring-region.v1",
    coverage="all-loops",
    target="v8",
    guard_failure="fallback",
)
def modular_horner(values, value, multiplier):
    for coefficient in values:
        value = value * multiplier + coefficient
    return value


@optimize(
    require="math.closed-ring-region.v1",
    coverage="all-loops",
    target="v8",
    guard_failure="fallback",
)
def modular_strict_zip(left, right):
    value = R(0)
    for first, second in zip(left, right, strict=True):
        value = value + first * second
    return value
