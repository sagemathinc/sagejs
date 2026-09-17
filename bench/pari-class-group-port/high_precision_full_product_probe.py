"""Transactional batch boundary for high-precision packed-real products.

The source remains ordinary CPython-parseable Python.  Public validation is
performed for the complete batch before any caller-owned output is changed;
the private arithmetic call then selects the small convolution or full backend
integer product in `pari_short_product`.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .short_product import pari_short_product


@native
def pari_high_precision_full_product_batch(
    operands: IntegerBuffer,
    count: int,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Multiply `count` packed-real pairs and publish the batch atomically.

    Each input row is `(mx, px, ex, my, py, ey)` and each output row is
    `(mantissa, precision, exponent)`.  At most sixteen rows are admitted so
    validation and output storage remain explicitly bounded.
    """
    if count < 1 or count > 16:
        raise ValueError("full-product batch count out of range")
    if len(operands) < 6 * count:
        raise ValueError("full-product operand storage exhausted")
    if len(output) < 3 * count or len(state) < 3:
        raise ValueError("full-product output storage exhausted")
    for i in range(count):
        offset = 6 * i
        mx = operands[offset]
        px = operands[offset + 1]
        my = operands[offset + 3]
        py = operands[offset + 4]
        if mx == 0 or my == 0:
            continue
        if px < 64 or py < 64 or px > 154112 or py > 154112:
            raise ValueError("full-product precision out of range")
        if px % 64 != 0 or py % 64 != 0:
            raise ValueError("full-product precision requires 64-bit words")
        if abs(mx).bit_length() != px or abs(my).bit_length() != py:
            raise ValueError("full-product operand is not normalized")
    for i in range(count):
        source = 6 * i
        target = 3 * i
        m, p, e = pari_short_product(
            operands[source],
            operands[source + 1],
            operands[source + 2],
            operands[source + 3],
            operands[source + 4],
            operands[source + 5],
        )
        output[target] = m
        output[target + 1] = p
        output[target + 2] = e
    state[0] = 1
    state[1] = count
    state[2] = 3520
    return 0
