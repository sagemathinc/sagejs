"""Private callback-free preparation of stable centered reductions.

The actual typed Python body is shared by dynamic, native and Wasm execution.
These transformations do not reduce a vector: accurately rounded summation is
performed separately, followed by the existing corrected two-pass formulas and
independent result checks. No automatic public selection is enabled here.

All buffers must be caller-owned and pairwise non-aliasing. Status 0 is success,
1 rejects nonfinite input/centering overflow, and 2 rejects inadequate capacity.
Failure leaves the small `output` record unchanged; workspace may have changed
and must be discarded. Public dispatch must enforce resource limits beforehand.
"""

from __future__ import annotations

from sagejs.native import Float64Buffer, native, uint64


@native
def prepare_centered(
    values: Float64Buffer,
    deviations: Float64Buffer,
    normalized: Float64Buffer,
    squares: Float64Buffer,
    output: Float64Buffer,
    center: float,
    count: uint64,
) -> float:
    """Prepare deviations and normalized squares, publishing their scale.

    The subtraction, normalization and square each round to binary64 in the
    same order as `centered_sum_squares`. For an all-zero deviation vector,
    normalization is defined as zero and no division by zero takes place.
    """
    if count < 0:
        return 2.0
    if count > len(values):
        return 2.0
    if count > len(deviations):
        return 2.0
    if count > len(normalized):
        return 2.0
    if count > len(squares):
        return 2.0
    if len(output) < 1:
        return 2.0
    maximum = 1.7976931348623157e308
    if center != center:
        return 1.0
    if abs(center) > maximum:
        return 1.0
    scale = 0.0
    for index in range(count):
        value = values[index]
        if value != value:
            return 1.0
        if abs(value) > maximum:
            return 1.0
        deviation = value - center
        magnitude = abs(deviation)
        if magnitude > maximum:
            return 1.0
        deviations[index] = deviation
        if magnitude > scale:
            scale = magnitude
    for index in range(count):
        ratio = 0.0
        if scale > 0.0:
            ratio = deviations[index] / scale
        normalized[index] = ratio
        squares[index] = ratio * ratio
    output[0] = scale
    return 0.0


@native
def prepare_products(
    left: Float64Buffer,
    right: Float64Buffer,
    products: Float64Buffer,
    output: Float64Buffer,
    count: uint64,
) -> float:
    """Multiply normalized centered pairs without scalar host crossings.

    Require both vectors to be finite and in [-1, 1], as produced by the
    preparation above. Products retain ordinary binary64 multiplication,
    including subnormal underflow. `output[0]` publishes the completed count;
    this is not a mathematical accuracy certificate or a sum of products.
    The count must be exactly representable in the published binary64 slot.
    """
    if count < 0:
        return 2.0
    if count > 9007199254740991:
        return 2.0
    if count > len(left):
        return 2.0
    if count > len(right):
        return 2.0
    if count > len(products):
        return 2.0
    if len(output) < 1:
        return 2.0
    for index in range(count):
        x = left[index]
        y = right[index]
        if x != x:
            return 1.0
        if y != y:
            return 1.0
        if abs(x) > 1.0:
            return 1.0
        if abs(y) > 1.0:
            return 1.0
        products[index] = x * y
    output[0] = float(count)
    return 0.0


@native
def prepare_summary_checks(
    values: Float64Buffer,
    absolute_deviations: Float64Buffer,
    residuals: Float64Buffer,
    median: float,
    mean: float,
    count: uint64,
) -> float:
    """Re-read original observations for MAD and the independent center check.

    Neither calculation consumes the centered kernel's normalized workspace.
    These two separate outputs may be overwritten on failure, but input is
    never modified. The caller must discard both outputs after any rejection.
    """
    if count < 0:
        return 2.0
    if count > len(values):
        return 2.0
    if count > len(absolute_deviations):
        return 2.0
    if count > len(residuals):
        return 2.0
    maximum = 1.7976931348623157e308
    if median != median:
        return 1.0
    if mean != mean:
        return 1.0
    if abs(median) > maximum:
        return 1.0
    if abs(mean) > maximum:
        return 1.0
    for index in range(count):
        value = values[index]
        if value != value:
            return 1.0
        if abs(value) > maximum:
            return 1.0
        deviation = abs(value - median)
        residual = value - mean
        if deviation > maximum:
            return 1.0
        if abs(residual) > maximum:
            return 1.0
        absolute_deviations[index] = deviation
        residuals[index] = residual
    return 0.0
