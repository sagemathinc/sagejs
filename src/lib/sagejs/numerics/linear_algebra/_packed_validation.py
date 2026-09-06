"""Private binary64 reconstruction products, independent of factorization.

This is not public backend selection. The caller owns separate input, output
and scratch buffers, enforces cancellation between bounded regions, and
discards output after failure. Products are rounded separately before the
accurately rounded partials sum, matching the dynamic validator's `math.fsum`
of ordinary binary64 products, not a fused or BLAS reduction.
"""

from sagejs.native import Float64Buffer, native, uint64
from sagejs.numerics._packed_sum import finite_sum


@native
def reconstruction_row(
    left: Float64Buffer,
    right: Float64Buffer,
    products: Float64Buffer,
    partials: Float64Buffer,
    sum_output: Float64Buffer,
    output: Float64Buffer,
    row: uint64,
    rows: uint64,
    inner: uint64,
    columns: uint64,
) -> float:
    """Compute one row with at most 128 dots of at most 128 terms.

    Status 1 rejects shape/storage; status 2 rejects nonfinite arithmetic.
    Success is 0. Input is immutable. Partial row output on failure is private
    and must be discarded. Zero inner dimension produces positive zeros.
    Public callback/check ordering is deliberately not changed by this kernel.
    """
    if rows < 1:
        return 1.0
    if rows > 128:
        return 1.0
    if row >= rows:
        return 1.0
    if row < 0:
        return 1.0
    if inner < 0:
        return 1.0
    if inner > 128:
        return 1.0
    if columns > 128:
        return 1.0
    if columns < 0:
        return 1.0
    if len(left) < rows * inner:
        return 1.0
    if len(right) < inner * columns:
        return 1.0
    if len(products) < inner:
        return 1.0
    if len(partials) < inner:
        return 1.0
    if len(sum_output) < 1:
        return 1.0
    if len(output) < columns:
        return 1.0
    for column in range(columns):
        for index in range(inner):
            products[index] = (
                left[row * inner + index] * right[index * columns + column]
            )
        status = finite_sum(products, partials, sum_output, inner)
        if status != 0.0:
            return 2.0
        output[column] = sum_output[0]
    return 0.0
