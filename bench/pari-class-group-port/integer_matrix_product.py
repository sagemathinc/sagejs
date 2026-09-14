"""PARI 2.17.4 ZM_mul classical and ZM2_mul dispatch for HNF propagation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Return explicit frontiers before unported general Strassen or CRT; do not
silently replace them with classical multiplication. Owners are disjoint.
"""

from sagejs.native import IntegerBuffer, native


@native
def pari_integer_matrix_product(
    a: IntegerBuffer,
    b: IntegerBuffer,
    rows: int,
    inner: int,
    columns: int,
    output: IntegerBuffer,
) -> int:
    """Return 0 complete, -1 before general Strassen, -2 before modular CRT.

    Matrices are column-major. The 64-bit GMP ZM2_MUL_LIMIT is pinned to14.
    Empty-inner output follows upstream's zero-row matrix representation;
    its absent row dimension is not fabricated from the supplied rows.
    All incomplete dispatches leave output unchanged.
    """
    if rows < 0 or inner < 0 or columns < 0:
        raise ValueError("invalid exact matrix product dimensions")
    if len(a) < rows * inner or len(b) < inner * columns:
        raise ValueError("short exact matrix product input")
    if inner == 0 or columns == 0 or rows == 0:
        return 0
    if len(output) < rows * columns:
        raise ValueError("short exact matrix product output")
    if rows == 1 and inner == 1 and columns == 1:
        output[0] = a[0] * b[0]
        return 0
    if rows == 2 and inner == 2 and columns == 2:
        large = True
        for i in range(4):
            if (abs(a[i]).bit_length() + 63) // 64 < 14 or (
                abs(b[i]).bit_length() + 63
            ) // 64 < 14:
                large = False
        if large:
            m1 = (a[0] + a[3]) * (b[0] + b[3])
            m2 = (a[1] + a[3]) * b[0]
            m3 = a[0] * (b[2] - b[3])
            m4 = a[3] * (b[1] - b[0])
            m5 = (a[0] + a[2]) * b[3]
            m6 = (a[1] - a[0]) * (b[0] + b[2])
            m7 = (a[2] - a[3]) * (b[1] + b[3])
            t1 = m1 + m4
            t2 = m7 - m5
            t3 = m1 - m2
            t4 = m3 + m6
            output[0] = t1 + t2
            output[1] = m2 + m4
            output[2] = m3 + m5
            output[3] = t3 + t4
        else:
            v1 = a[0] * b[0]
            v2 = a[2] * b[1]
            v3 = a[0] * b[2]
            v4 = a[2] * b[3]
            v5 = a[1] * b[0]
            v6 = a[3] * b[1]
            v7 = a[1] * b[2]
            v8 = a[3] * b[3]
            output[0] = v1 + v2
            output[1] = v5 + v6
            output[2] = v3 + v4
            output[3] = v7 + v8
        return 0
    sx = 2
    sy = 2
    for i in range(rows * inner):
        size = 2 + (abs(a[i]).bit_length() + 63) // 64
        if size > sx:
            sx = size
    for i in range(inner * columns):
        size = 2 + (abs(b[i]).bit_length() + 63) // 64
        if size > sy:
            sy = size
    if (
        rows + 1 > 70
        and inner + 1 > 70
        and columns + 1 > 70
        and sx <= 10 * sy
        and sy <= 10 * sx
    ):
        # The first ZM_mul_fast leaf precedes prime selection and CRT.
        # Keep it inside this dispatch: other zero products may select SW.
        if sx == 2 or sy == 2:
            for i in range(rows * columns):
                output[i] = 0
            return 0
        return -2
    size = sx
    if sy < size:
        size = sy
    bound = 32
    if size > 60:
        bound = 2
    elif size > 25:
        bound = 4
    elif size > 15:
        bound = 8
    elif size > 8:
        bound = 16
    if rows + 1 > bound and inner + 1 > bound and columns + 1 > bound:
        return -1
    for j in range(columns):
        for i in range(rows):
            value = a[i] * b[j * inner]
            for k in range(1, inner):
                term = a[k * rows + i] * b[j * inner + k]
                if term != 0:
                    value += term
            output[j * rows + i] = value
    return 0
