"""Independent binary64 comparison and conditional compiler witness."""

from __future__ import annotations

from sagejs.native import Float64Buffer, native, uint64


@native
def choose_sqrt_sign(state: Float64Buffer, count: uint64) -> float:
    """Continue square-root signs by choosing the nearest adjacent value."""
    previous_real = state[0]
    previous_imag = state[1]
    for index in range(1, count):
        real = state[2 * index]
        imag = state[2 * index + 1]
        same = (real - previous_real) * (real - previous_real) + (
            (imag - previous_imag) * (imag - previous_imag)
        )
        opposite = (-real - previous_real) * (-real - previous_real) + (
            (-imag - previous_imag) * (-imag - previous_imag)
        )
        if opposite < same:
            real = -real
            imag = -imag
        state[2 * index] = real
        state[2 * index + 1] = imag
        previous_real = real
        previous_imag = imag
    return previous_real


@native
def comparison_score(left: float, right: float) -> float:
    """Exercise all binary64 comparisons, nested branches, and branch merge."""
    if left < right:
        result = -1.0
    else:
        result = 1.0
    if left == right:
        result = 0.0
    if left != right:
        if left <= right:
            result = result - 0.25
        if left >= right:
            result = result + 0.25
    if left > right:
        result = result + 1.0
    return result


@native
def uint64_branch(count: uint64) -> float:
    """Exercise a contextually typed unsigned comparison in a float kernel."""
    if count > 0:
        result = 1.0
    else:
        result = 0.0
    return result
