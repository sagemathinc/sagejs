"""Machine-domain fixtures for authenticated terminal-route evidence."""

from sagejs.compiler import optimize


@optimize(
    require="math.bounded-integer-region.v1",
    target="v8",
    guard_failure="fallback",
)
def bounded_fallback(count: int, value: int, multiplier: int, increment: int):
    for _index in range(count):
        value = value * multiplier + increment
    return value


@optimize(
    require="math.bounded-integer-region.v1",
    target="v8",
    guard_failure="error",
)
def bounded_error(count: int, value: int, multiplier: int, increment: int):
    for _index in range(count):
        value = value * multiplier + increment
    return value


@optimize(
    require="math.strict-float-array-region.v1",
    target="v8",
    guard_failure="fallback",
)
def float_array_fallback(
    values: tuple[float, ...], accumulator: float, multiplier: float
):
    for value in values:
        accumulator = accumulator * multiplier + value
    return accumulator


@optimize(
    require="math.strict-float-array-region.v1",
    target="v8",
    guard_failure="error",
)
def float_array_error(values: tuple[float, ...], accumulator: float, multiplier: float):
    for value in values:
        accumulator = accumulator * multiplier + value
    return accumulator


@optimize(
    require="math.modular-batch-region.v1",
    coverage="at-least-one",
    target="v8",
    guard_failure="fallback",
)
def modular_batch_fallback(count, values):
    output = [None for _slot in range(count)]
    for index in range(count):
        output[index] = values[index] * 37 + 19
    return output


@optimize(
    require="math.modular-batch-region.v1",
    coverage="at-least-one",
    target="v8",
    guard_failure="error",
)
def modular_batch_error(count, values):
    output = [None for _slot in range(count)]
    for index in range(count):
        output[index] = values[index] * 37 + 19
    return output


@optimize(
    require="math.fixed-extension-region.v1",
    target="auto",
    guard_failure="fallback",
)
def fixed_extension_fallback(count, parent, generator):
    generator_squared = generator * generator
    value = parent(1) + 2 * generator + 3 * generator_squared
    multiplier = parent(2) + generator + 4 * generator_squared
    increment = parent(3) + 4 * generator + generator_squared
    for _index in range(count):
        value = value * multiplier + increment
    return value


@optimize(
    require="math.fixed-extension-region.v1",
    target="auto",
    guard_failure="error",
)
def fixed_extension_error(count, parent, generator):
    generator_squared = generator * generator
    value = parent(1) + 2 * generator + 3 * generator_squared
    multiplier = parent(2) + generator + 4 * generator_squared
    increment = parent(3) + 4 * generator + generator_squared
    for _index in range(count):
        value = value * multiplier + increment
    return value
