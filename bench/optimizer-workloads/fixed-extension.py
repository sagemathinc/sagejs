"""Immutable fixed-extension optimizer calibration control."""

from sagejs.compiler import optimize


@optimize(
    require="math.fixed-extension-region.v1",
    target="auto",
    guard_failure="error",
)
def fixed_extension_control(count, parent, generator):
    generator_squared = generator * generator
    value = parent(1) + 2 * generator + 3 * generator_squared
    multiplier = parent(2) + generator + 4 * generator_squared
    increment = parent(3) + 4 * generator + generator_squared
    for _index in range(count):
        value = value * multiplier + increment
    return value
