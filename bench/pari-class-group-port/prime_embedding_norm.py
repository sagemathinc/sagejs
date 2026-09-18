"""PARI 2.17.4 embedding branch of `base2.c:get_norm`.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared nf_M entries use exact real triples or precision -1 for integers.
All embedding rows are evaluated before `embed_norm` inspects its first
entry. The scalar-integer shortcut is retained without real coercion.
This does not select init_norm's precision branch or implement its resultant
fallback. Caller must supply an nf embedding matrix in that branch.
"""

from sagejs.native import IntegerBuffer, native
from .short_product import (
    pari_prepared_embedding_row,
    pari_prepared_real_norm,
    pari_prepared_mixed_norm,
    pari_round_real,
)


@native
def pari_prepared_prime_embedding_norm(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    coefficients: IntegerBuffer,
    values_m: IntegerBuffer,
    values_p: IntegerBuffer,
    values_e: IntegerBuffer,
    degree: int,
    real_count: int,
) -> tuple[int, int]:
    """Return get_norm integer and grndtoi error; raise at source e > -5.

    All owners disjoint, flattened component rows as in prepared matrix norm.
    Exact scalar output uses integer power as an arithmetic primitive; native
    and PARI bigint backend instruction counts are not asserted equivalent.
    Unsupported mixed exact/real norm components remain explicit exceptions.
    """
    if degree < 3 or degree > 5 or real_count < 1 or real_count > degree:
        raise ValueError("prime embedding norm signature frontier")
    if (degree - real_count) % 2 != 0:
        raise ValueError("invalid prime embedding norm signature")
    if (
        len(matrix_m) < degree * degree
        or len(matrix_p) < degree * degree
        or len(matrix_e) < degree * degree
        or len(coefficients) < degree
        or len(values_m) < degree
        or len(values_p) < degree
        or len(values_e) < degree
    ):
        raise ValueError("short prime embedding norm storage")
    for i in range(degree):
        m, p, e = pari_prepared_embedding_row(
            matrix_m, matrix_p, matrix_e, coefficients, i * degree, degree
        )
        values_m[i] = m
        values_p[i] = p
        values_e[i] = e
    if values_p[0] == -1:
        # Native exact powers currently require a literal exponent. Every
        # admitted degree retains the same arithmetic primitive.
        if degree == 3:
            return values_m[0] ** 3, -(1 << 61)
        if degree == 4:
            return values_m[0] ** 4, -(1 << 61)
        return values_m[0] ** 5, -(1 << 61)
    for i in range(degree):
        if values_p[i] == -1:
            raise ValueError("mixed exact prime norm component frontier")
    if real_count == degree:
        m, p, e = pari_prepared_real_norm(values_m, values_p, values_e, degree)
    else:
        m, p, e = pari_prepared_mixed_norm(
            values_m, values_p, values_e, real_count, (degree - real_count) // 2
        )
    norm, error = pari_round_real(m, p - e - 1, e)
    if error > -5:
        raise ValueError("get_norm precision")
    return norm, error
