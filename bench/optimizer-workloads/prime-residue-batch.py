"""Immutable small-prime residue-batch optimizer calibration control."""

from sagejs.compiler import optimize


@optimize(
    require="math.modular-batch-region.v1",
    coverage="at-least-one",
    target="v8",
    guard_failure="error",
)
def prime_residue_batch_control(count, values):
    output = [None for _slot in range(count)]
    for index in range(count):
        output[index] = values[index] * 37 + 19
    return output
