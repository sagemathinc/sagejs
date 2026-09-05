"""Same-source witnesses for isolated binary64 helper calls."""

from sagejs.native import Float64Buffer, UInt64Buffer, native, uint64


@native
def update(values: Float64Buffer, index: uint64) -> float:
    values[index] = values[index] + 1.0
    return values[index]


@native
def control(words: UInt64Buffer, index: uint64) -> float:
    return float(words[index])


@native
def combined(words: UInt64Buffer, values: Float64Buffer, index: uint64) -> float:
    alias = values
    updated = update(alias, index)
    return updated + control(words, 0)


@native
def condition(values: Float64Buffer) -> float:
    if update(values, 0) > 0.0:
        return 1.0
    return 0.0


@native
def failing(values: Float64Buffer, divisor: float) -> float:
    values[0] = 11.0
    return 1.0 / divisor


@native
def failure_caller(values: Float64Buffer, divisor: float) -> float:
    return failing(values, divisor)
