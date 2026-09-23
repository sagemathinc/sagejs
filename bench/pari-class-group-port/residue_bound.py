"""PARI 2.17.4 buch2.c residue-bound selection, including upstream casts.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The surprising tailresback argument order is deliberately preserved.
"""

from math import log, sqrt

from sagejs.native import Float64Buffer, checked_float64, native


@native
def pari_residue_sqrt(x: float) -> float:
    return sqrt(x)


@native
def pari_tailresback(
    r1: float,
    r2: float,
    rk: float,
    c: float,
    c2: float,
    c3: float,
    r1k: float,
    r2k: float,
    lc: float,
    lc2: float,
    lc3: float,
) -> float:
    """Arithmetic body; caller has already applied upstream integer casts."""
    return abs(
        (r1 + r2 - 1.0) * (12.0 * lc3 + 4.0 * lc2 - 9.0 * lc - 6.0) / (2.0 * c * lc3)
        + (rk - 1.83787706641) * (6.0 * lc2 + 5.0 * lc + 2.0) / (c * lc3)
        - r2 * (6.0 * lc2 + 11.0 * lc + 6.0) / (c2 * lc2)
        - 2.0 * (r1k - 1.98505372441) * (3.0 * lc2 + 4.0 * lc + 2.0) / (c2 * lc3)
        + (r1 + r2 - 1.0)
        * (12.0 * lc3 + 40.0 * lc2 + 45.0 * lc + 18.0)
        / (6.0 * c3 * lc3)
        + (r2k - 1.07991541347) * (2.0 * lc2 + 3.0 * lc + 2.0) / (c3 * lc3)
    )


@native
def pari_tailres_check(
    r1: int,
    r2: int,
    bound: int,
    index: int,
    coefficients: Float64Buffer,
    table: Float64Buffer,
    output: Float64Buffer,
) -> int:
    if bound < 3 or index < 0:
        raise ValueError("invalid prepared residue tail arguments")
    c = checked_float64(bound)
    lc = log(c)
    lc2 = lc * lc
    lc3 = lc * lc2
    c2 = c * c
    c3 = c * c2
    e1 = 0.0
    if index <= 30:
        e1 = table[index]
    # C's first two tailresback parameters are long, despite these actuals
    # being rKm/r1KM and rKM/r1Km. Do not reorder or drop truncation.
    first = pari_tailresback(
        checked_float64(int(coefficients[1])),
        checked_float64(int(coefficients[4])),
        coefficients[5],
        c,
        c2,
        c3,
        checked_float64(r1),
        checked_float64(r2),
        lc,
        lc2,
        lc3,
    )
    second = pari_tailresback(
        checked_float64(int(coefficients[2])),
        checked_float64(int(coefficients[3])),
        coefficients[6],
        c,
        c2,
        c3,
        checked_float64(r1),
        checked_float64(r2),
        lc,
        lc2,
        lc3,
    )
    if second > first:
        first = second
    value = (
        coefficients[0]
        * (
            (33.0 * lc2 + 22.0 * lc + 8.0) / (8.0 * lc3 * pari_residue_sqrt(c))
            + 15.0 * e1 / 16.0
        )
        + first / 2.0
        + (checked_float64((r1 + r2 - 1) * 4) * c + checked_float64(r2))
        * (c2 + 6.0 * lc)
        / (4.0 * c2 * c2 * lc2)
    )
    output[0] = value
    if value > 0.25:
        return 1
    return 0


@native
def pari_prepared_primeneeded(
    degree: int,
    r1: int,
    r2: int,
    log_discriminant: Float64Buffer,
    coefficients: Float64Buffer,
    table: Float64Buffer,
    output: Float64Buffer,
) -> int:
    """Replay primeneeded; coefficients/table/output are writable scratch."""
    n = checked_float64(degree)
    ld = log_discriminant[0]
    coefficients[0] = 0.3526 * ld - 0.8212 * n + 4.5007
    coefficients[1] = -1.0155 * ld + 2.1042 * n - 8.3419
    coefficients[2] = -0.5 * ld + 1.2076 * n + 1.0
    coefficients[3] = -ld + 1.4150 * n
    coefficients[4] = -ld + 1.9851 * n
    coefficients[5] = -ld + 0.9151 * n
    coefficients[6] = -ld + 1.0800 * n
    pari_residue_tail_table(table)
    low = 3
    high = 3
    index = 0
    while pari_tailres_check(r1, r2, high, index, coefficients, table, output) != 0:
        low = high
        high *= 2
        index += 1
    index -= 1
    while high - low > 1:
        test = (low + high) // 2
        if pari_tailres_check(r1, r2, test, index, coefficients, table, output) != 0:
            low = test
        else:
            high = test
    return high


@native
def pari_residue_tail_table(table: Float64Buffer) -> int:
    """Load the pinned upstream 31-entry table once per bound search."""
    table[0] = 0.50409264803
    table[1] = 0.26205336997
    table[2] = 0.14815491171
    table[3] = 0.08770540561
    table[4] = 0.05347651832
    table[5] = 0.03328934284
    table[6] = 0.02104510690
    table[7] = 0.01346475900
    table[8] = 0.00869778586
    table[9] = 0.00566279855
    table[10] = 0.00371111950
    table[11] = 0.00244567837
    table[12] = 0.00161948049
    table[13] = 0.00107686891
    table[14] = 0.00071868750
    table[15] = 0.00048119961
    table[16] = 0.00032312188
    table[17] = 0.00021753772
    table[18] = 0.00014679818
    table[19] = 9.9272855581e-5
    table[20] = 6.7263969995e-5
    table[21] = 4.5656812967e-5
    table[22] = 3.1041124593e-5
    table[23] = 2.1136011590e-5
    table[24] = 1.4411645381e-5
    table[25] = 9.8393304088e-6
    table[26] = 6.7257395409e-6
    table[27] = 4.6025878272e-6
    table[28] = 3.1529719271e-6
    table[29] = 2.1620490021e-6
    table[30] = 1.4839266071e-6
    return 31
