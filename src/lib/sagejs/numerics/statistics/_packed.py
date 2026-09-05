"""Private source-transparent binary64 reduction candidates.

These kernels are not selected automatically by the public statistics API.
The experimental prepared-data AOT opt-in may select source-verified artifacts;
public portability, packaging and end-to-end promotion remain unqualified.
Buffers must be caller-owned and pairwise non-aliasing; public dispatch owns
that validation. Status 0 means success, 1 means nonfinite/intermediate
overflow, and 2 means insufficient storage. Failure leaves `output` unchanged.

The finite summation algorithm adapts CPython's partials summation and final
half-even correction; see `licenses/CPYTHON-NUMERICAL-NOTICE.md`. No reassociation,
fast-math or extended-precision intermediates are allowed.
"""

from __future__ import annotations

from sagejs.native import Float64Buffer, native, uint64


@native
def finite_sum(
    values: Float64Buffer,
    partials: Float64Buffer,
    output: Float64Buffer,
    count: uint64,
) -> float:
    """Sum finite binary64 values using an exact nonoverlapping expansion.

    `partials` has room for `count` values and `output` for one. A separate work
    budget limits `count` before dispatch. Input is read once in source order;
    the kernel has no callbacks and allocates no memory. Both scratch contents
    and their capacity remain private; only output[0] is a mathematical result.
    """
    if count < 0:
        return 2.0
    if count > len(values):
        return 2.0
    if count > len(partials):
        return 2.0
    if len(output) < 1:
        return 2.0

    used: uint64 = 0
    maximum = 1.7976931348623157e308
    for index in range(count):
        x = values[index]
        if x != x:
            return 1.0
        if abs(x) > maximum:
            return 1.0
        retained: uint64 = 0
        for previous in range(used):
            y = partials[previous]
            if abs(x) < abs(y):
                temporary = x
                x = y
                y = temporary
            high = x + y
            if abs(high) > maximum:
                return 1.0
            rounded_y = high - x
            low = y - rounded_y
            if low != 0.0:
                partials[retained] = low
                retained = retained + 1
            x = high
        used = retained
        if x != 0.0:
            partials[used] = x
            used = used + 1

    high = 0.0
    low = 0.0
    remaining: uint64 = 0
    if used > 0:
        remaining = used - 1
        high = partials[remaining]
        # The current float64 compiler admits bounded for-loops, not while
        # with break. The flag preserves the exact first-inexact-sum stop.
        active: uint64 = 1
        for _unused in range(remaining):
            if active > 0:
                remaining = remaining - 1
                x = high
                y = partials[remaining]
                high = x + y
                rounded_y = high - x
                low = y - rounded_y
                if low != 0.0:
                    active = 0
        # A lower partial of the same sign disambiguates an exact half-ulp
        # tie. This is essential for inputs such as [1e-16, 1, 1e16].
        same_sign: uint64 = 0
        if remaining > 0:
            last = partials[remaining - 1]
            if low < 0.0:
                if last < 0.0:
                    same_sign = 1
            if low > 0.0:
                if last > 0.0:
                    same_sign = 1
        if same_sign > 0:
            doubled = low * 2.0
            corrected = high + doubled
            rounded = corrected - high
            if doubled == rounded:
                high = corrected
    output[0] = high
    return 0.0
