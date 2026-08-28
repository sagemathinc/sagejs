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


def __profile_run__():
    polynomial_ring = PolynomialRing(GF(5), "x")
    x = polynomial_ring.gen()
    parent = GF(5**3, "a", modulus=x**3 + x + 1)
    value = parent(0)
    for _repeat in range(1_000):
        value = fixed_extension_control(1_000, parent, parent.gen())
    return tuple(int(entry) for entry in value._power_basis_coordinates())
