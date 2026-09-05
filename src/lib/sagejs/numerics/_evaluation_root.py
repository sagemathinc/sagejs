"""Private bounded bisection over a prepared expression program.

The root and evaluator share one compiled call graph. This core proposes a
candidate; a public caller must independently validate and classify it. It
requires exclusively owned, nonaliasing program/work/output buffers.
"""

from sagejs.native import Float64Buffer, UInt64Buffer, native, uint64
from sagejs.numerics._evaluation_core import evaluate_program


@native
def root_candidate(
    output: Float64Buffer,
    point: float,
    value: float,
    calls: uint64,
    lower: float,
    upper: float,
) -> float:
    """Publish only a complete candidate into previously checked storage."""
    output[0] = point
    output[1] = value
    output[2] = float(calls)
    output[3] = lower
    output[4] = upper
    return 0.0


@native
def bisect_program(
    opcodes: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    constants: Float64Buffer,
    inputs: Float64Buffer,
    scratch: Float64Buffer,
    value: Float64Buffer,
    output: Float64Buffer,
    count: uint64,
    lower: float,
    upper: float,
    xtol: float,
    ftol: float,
    iterations: uint64,
) -> float:
    """Return 0 candidate, 1 input, 4 bracket, 5 budget, 6 stagnation.

    Evaluator errors are 10 plus its status. On any failure the candidate
    output is unchanged, but input/work buffers may have changed. The two-slot
    value buffer retains the last value and attempted evaluation count. Work is
    bounded by one million instruction visits and at most 1024 iterations.
    Cancellation requires interruption outside this synchronous core.
    """
    if len(value) < 2:
        return 1.0
    value[1] = 0.0
    if len(output) < 5:
        return 1.0
    if len(inputs) < 1:
        return 1.0
    if count < 1:
        return 1.0
    if count > 1000000:
        return 1.0
    if iterations > 1024:
        return 1.0
    if float(count) * float(iterations + 2) > 1000000.0:
        return 1.0
    maximum = 1.7976931348623157e308
    if lower != lower:
        return 1.0
    if upper != upper:
        return 1.0
    if abs(lower) > maximum:
        return 1.0
    if abs(upper) > maximum:
        return 1.0
    if lower >= upper:
        return 1.0
    if xtol != xtol:
        return 1.0
    if ftol != ftol:
        return 1.0
    if xtol <= 0.0:
        return 1.0
    if ftol < 0.0:
        return 1.0
    if xtol > maximum:
        return 1.0
    if ftol > maximum:
        return 1.0
    inputs[0] = lower
    value[1] = 1.0
    status = evaluate_program(
        opcodes, left, right, constants, inputs, scratch, value, count
    )
    if status != 0.0:
        return status + 10.0
    low_value = value[0]
    if low_value == 0.0:
        return root_candidate(output, lower, low_value, 1, lower, lower)
    inputs[0] = upper
    value[1] = 2.0
    status = evaluate_program(
        opcodes, left, right, constants, inputs, scratch, value, count
    )
    if status != 0.0:
        return status + 10.0
    high_value = value[0]
    if high_value == 0.0:
        return root_candidate(output, upper, high_value, 2, upper, upper)
    if low_value > 0.0:
        if high_value > 0.0:
            return 4.0
    else:
        if high_value < 0.0:
            return 4.0
    for index in range(iterations):
        midpoint = lower * 0.5 + upper * 0.5
        if midpoint == lower:
            return 6.0
        if midpoint == upper:
            return 6.0
        inputs[0] = midpoint
        value[1] = float(index + 3)
        status = evaluate_program(
            opcodes, left, right, constants, inputs, scratch, value, count
        )
        if status != 0.0:
            return status + 10.0
        middle_value = value[0]
        if middle_value == 0.0:
            return root_candidate(
                output, midpoint, middle_value, index + 3, midpoint, midpoint
            )
        if abs(middle_value) <= ftol:
            if upper * 0.5 - lower * 0.5 <= xtol * 0.5:
                return root_candidate(
                    output, midpoint, middle_value, index + 3, lower, upper
                )
        if low_value > 0.0:
            if middle_value > 0.0:
                lower = midpoint
                low_value = middle_value
            else:
                upper = midpoint
        else:
            if middle_value < 0.0:
                lower = midpoint
                low_value = middle_value
            else:
                upper = midpoint
    return 5.0
