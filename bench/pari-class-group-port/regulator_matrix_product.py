"""PARI 2.17.4 real-domain RgM_mul generic scalar schedule.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Mixed matrices use RgMrow_RgC_mul_i: first product is unconditional and
later terms skip ONLY exact integer zeros in the left matrix. Exact-only
matrices stop before ZM_mul/QM_mul rather than changing their algorithm.
"""

from sagejs.native import IntegerBuffer, native
from .regulator_scalar import (
    pari_validate_regulator_values,
    pari_regulator_scalar_add,
    pari_regulator_scalar_multiply,
)


@native
def pari_regulator_matrix_product(
    left: IntegerBuffer,
    right: IntegerBuffer,
    rows: int,
    inner: int,
    columns: int,
    output: IntegerBuffer,
) -> int:
    """0=generic product, -1=exact-only dispatch; disjoint packed owners.

    Matrices use column-major triples. Zero-column inputs are admitted;
    zero inner dimension with nonzero row count is not a PARI matrix shape.
    Invalid inputs reject before writes. Arithmetic failure can leave an
    output prefix, so callers must check successful return before use.
    """
    if rows < 0 or inner < 0 or columns < 0 or (inner == 0 and rows != 0):
        raise ValueError("invalid generic product dimensions")
    if len(output) < 3 * rows * columns:
        raise ValueError("short generic product output")
    pari_validate_regulator_values(left, rows * inner)
    pari_validate_regulator_values(right, inner * columns)
    if columns == 0 or inner == 0:
        return 0
    inexact = False
    for i in range(rows * inner):
        if left[3 * i + 1] >= 0:
            inexact = True
    for i in range(inner * columns):
        if right[3 * i + 1] >= 0:
            inexact = True
    if not inexact:
        return -1
    for j in range(columns):
        for i in range(rows):
            a = 3 * i
            b = 3 * j * inner
            m, p, e = pari_regulator_scalar_multiply(
                left[a], left[a + 1], left[a + 2], right[b], right[b + 1], right[b + 2]
            )
            for k in range(1, inner):
                a = 3 * (k * rows + i)
                if left[a] == 0 and left[a + 1] == -1:
                    continue
                b = 3 * (j * inner + k)
                tm, tp, te = pari_regulator_scalar_multiply(
                    left[a],
                    left[a + 1],
                    left[a + 2],
                    right[b],
                    right[b + 1],
                    right[b + 2],
                )
                m, p, e = pari_regulator_scalar_add(m, p, e, tm, tp, te)
            at = 3 * (j * rows + i)
            output[at] = m
            output[at + 1] = p
            output[at + 2] = e
    return 0
