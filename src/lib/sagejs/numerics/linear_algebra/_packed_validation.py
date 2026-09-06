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


@native
def lu_residual_norms(
    source: Float64Buffer,
    factors: Float64Buffer,
    permutation: Float64Buffer,
    products: Float64Buffer,
    differences: Float64Buffer,
    magnitudes: Float64Buffer,
    partials: Float64Buffer,
    sum_output: Float64Buffer,
    output: Float64Buffer,
    size: uint64,
) -> float:
    """Independently compute `||A-PLU||_inf` and `||A||_inf` for square LU.

    The actual permutation must be bijective on `0..size-1`. Packed factors
    encode unit-lower and upper entries, not a trusted reconstruction result.
    Dots and row norms use separately rounded products and accurate sums in
    original index order. Size is bounded by 128; the caller owns disjoint
    buffers and enforces budgets outside this callback-free region.

    Status 1 rejects storage/shape/permutation; 2 rejects nonfinite arithmetic.
    Only success publishes two norms in `output`; scratch may change on failure.
    This private kernel does not change public cancellation or select a backend.
    """
    if size < 1:
        return 1.0
    if size > 128:
        return 1.0
    count = size * size
    if len(source) < count:
        return 1.0
    if len(factors) < count:
        return 1.0
    if len(permutation) < size:
        return 1.0
    if len(products) < size:
        return 1.0
    if len(differences) < size:
        return 1.0
    if len(magnitudes) < size:
        return 1.0
    if len(partials) < size:
        return 1.0
    if len(sum_output) < 1:
        return 1.0
    if len(output) < 2:
        return 1.0
    error_norm = 0.0
    source_norm = 0.0
    for row in range(size):
        working_row: uint64 = 0
        matches: uint64 = 0
        for index in range(size):
            if permutation[index] == float(row):
                working_row = index
                matches = matches + 1
        if matches != 1:
            return 1.0
        for column in range(size):
            for index in range(size):
                left = 0.0
                if index == working_row:
                    left = 1.0
                if index < working_row:
                    left = factors[working_row * size + index]
                right = 0.0
                if index <= column:
                    right = factors[index * size + column]
                products[index] = left * right
            status = finite_sum(products, partials, sum_output, size)
            if status != 0.0:
                return 2.0
            value = source[row * size + column]
            differences[column] = abs(value - sum_output[0])
            magnitudes[column] = abs(value)
        status = finite_sum(differences, partials, sum_output, size)
        if status != 0.0:
            return 2.0
        if sum_output[0] > error_norm:
            error_norm = sum_output[0]
        status = finite_sum(magnitudes, partials, sum_output, size)
        if status != 0.0:
            return 2.0
        if sum_output[0] > source_norm:
            source_norm = sum_output[0]
    output[0] = error_norm
    output[1] = source_norm
    return 0.0
