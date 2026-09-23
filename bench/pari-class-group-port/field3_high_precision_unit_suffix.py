"""First high-precision relation-log cut for the hard mixed quartic.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This deliberately narrow leaf authenticates the retained field-3 owner and
rebuilds its first relation logarithm at 153,088 bits.  The first principal
generator is the scalar 2, so its three weighted archimedean values need only
the already qualified packed `log(2)` primitive: log(2), log(2), and
2*log(2).  No resident 192-bit embedding or logarithm is an input.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .logarithm_constant import pari_log2_constant


@native
def pari_field3_high_precision_scalar_log(
    polynomial: IntegerBuffer,
    multiplication_basis: IntegerBuffer,
    principal_generators: IntegerBuffer,
    relation_metadata: IntegerBuffer,
    relation_records: IntegerBuffer,
    precision: int,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    scratch: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Regenerate the hard quartic's first packed relation-log column.

    The retained owner has 26 scalar-prefix generators and 301 columns.  This
    cut publishes only column one.  `state` records status, precision,
    published columns, authenticated scalar-prefix columns, total columns,
    and columns still requiring a rebuilt embedding/arbitrary logarithm path.
    Validation precedes all scratch and public-output writes.
    """
    if precision != 153088:
        raise ValueError("unsupported field-3 high-precision target")
    if (
        len(polynomial) < 5
        or len(multiplication_basis) < 64
        or len(principal_generators) < 1204
        or len(relation_metadata) < 903
        or len(relation_records) < 86688
        or len(log_cache) < 3
        or len(a) < 16385
        or len(b) < 16385
        or len(p) < 16385
        or len(q) < 16385
        or len(stack) < 105
        or len(scratch) < 21
        or len(output) < 21
        or len(state) < 6
    ):
        raise ValueError("short field-3 high-precision owner or workspace")
    if (
        polynomial[0] != -2000042
        or polynomial[1] != -2000022
        or polynomial[2] != 0
        or polynomial[3] != 0
        or polynomial[4] != 1
    ):
        raise ValueError("wrong field-3 polynomial owner")
    # The first multiplication packet is multiplication by one in the exact
    # four-element integral basis.  The checker authenticates the complete
    # 64-cell owner by SHA-256 before entering this arithmetic leaf.
    for row in range(4):
        for column in range(4):
            expected = 0
            if row == column:
                expected = 1
            if multiplication_basis[4 * column + row] != expected:
                raise ValueError("wrong field-3 integral-basis owner")
    # get_log_embed recorded the first 26 generators as scalar GENs.  Their
    # coordinate shape alone is insufficient provenance, hence the explicit
    # fixed prefix and metadata checks.
    for column in range(26):
        if (
            principal_generators[4 * column] <= 1
            or principal_generators[4 * column + 1] != 0
            or principal_generators[4 * column + 2] != 0
            or principal_generators[4 * column + 3] != 0
            or relation_metadata[3 * column] != column + 1
            or relation_metadata[3 * column + 1] != 0
            or relation_metadata[3 * column + 2] != 0
        ):
            raise ValueError("wrong field-3 scalar-prefix owner")
    if principal_generators[0] != 2 or relation_records[0] != 4:
        raise ValueError("wrong first field-3 relation owner")

    lm, lp, le = pari_log2_constant(precision, log_cache, a, b, p, q, stack)
    for place in range(3):
        offset = 7 * place
        scratch[offset] = 1
        scratch[offset + 1] = lm
        scratch[offset + 2] = lp
        scratch[offset + 3] = le
        if place == 2:
            scratch[offset + 3] = le + 1
        scratch[offset + 4] = 0
        scratch[offset + 5] = -1
        scratch[offset + 6] = 0
    for index in range(21):
        output[index] = scratch[index]
    state[0] = 0
    state[1] = precision
    state[2] = 1
    state[3] = 26
    state[4] = 301
    state[5] = 300
    return 0


__all__ = ["pari_field3_high_precision_scalar_log"]
