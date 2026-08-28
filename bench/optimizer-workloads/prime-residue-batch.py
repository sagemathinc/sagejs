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


def __profile_run__():
    parent = Zmod(1009)
    values = tuple(
        parent((index * index + 3 * index - 7) % 1009) for index in range(10_000)
    )
    output = ()
    for _repeat in range(50):
        output = prime_residue_batch_control(len(values), values)
    return int(sum(output)), int(output[0]), int(output[-1])
