"""PARI 2.17.4 `get_clg2` archimedean matrix assembly.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the floating leaf of `buch2.c:get_clg2`:

```
GD = act_arch(M1, C) - diag(cyc) Ga
ga = act_arch(M2, C) - act_arch(Ur, Ga)
```

Logarithm matrices use the seven-word column-major representation from
`log_matrix_transform`. Integer matrices are column-major. The three work
owners hold `C*M1`, `C*M2`, and `Ga*Ur`; they are completed before either
result is published. Thus a result owner may alias an input log owner, while
the two results and all three work owners must remain mutually disjoint.
"""

from sagejs.native import IntegerBuffer, native

from .log_matrix_transform import (
    pari_log_entry_product,
    pari_log_entry_sum,
    pari_log_matrix_transform,
    pari_validate_log_entries,
)


@native
def pari_log_matrix_subtract_scaled(
    left: IntegerBuffer,
    right: IntegerBuffer,
    scales: IntegerBuffer,
    rows: int,
    columns: int,
    output: IntegerBuffer,
) -> int:
    """Compute `left - right*diag(scales)` in packed logarithm storage."""
    if rows < 0 or columns < 0:
        raise ValueError("negative packed subtraction dimension")
    cells = rows * columns
    words = cells * 7
    if len(left) < words or len(right) < words or len(scales) < columns:
        raise ValueError("short packed scaled-subtraction input")
    if len(output) < words:
        raise ValueError("short packed scaled-subtraction output")
    pari_validate_log_entries(left, cells)
    pari_validate_log_entries(right, cells)
    for column in range(columns):
        scale = -scales[column]
        for row in range(rows):
            base = (column * rows + row) * 7
            bk, br, brp, bre, bi, bip, bie = pari_log_entry_product(
                scale,
                right[base],
                right[base + 1],
                right[base + 2],
                right[base + 3],
                right[base + 4],
                right[base + 5],
                right[base + 6],
            )
            k, rm, rp, re, im, ip, ie = pari_log_entry_sum(
                left[base],
                left[base + 1],
                left[base + 2],
                left[base + 3],
                left[base + 4],
                left[base + 5],
                left[base + 6],
                bk,
                br,
                brp,
                bre,
                bi,
                bip,
                bie,
            )
            output[base] = k
            output[base + 1] = rm
            output[base + 2] = rp
            output[base + 3] = re
            output[base + 4] = im
            output[base + 5] = ip
            output[base + 6] = ie
    return 0


@native
def pari_log_matrix_subtract(
    left: IntegerBuffer,
    right: IntegerBuffer,
    rows: int,
    columns: int,
    output: IntegerBuffer,
) -> int:
    """Compute packed `left-right`, preserving PARI's `gsub` entry order."""
    if rows < 0 or columns < 0:
        raise ValueError("negative packed subtraction dimension")
    cells = rows * columns
    words = cells * 7
    if len(left) < words or len(right) < words or len(output) < words:
        raise ValueError("short packed subtraction owner")
    pari_validate_log_entries(left, cells)
    pari_validate_log_entries(right, cells)
    for cell in range(cells):
        base = cell * 7
        bk, br, brp, bre, bi, bip, bie = pari_log_entry_product(
            -1,
            right[base],
            right[base + 1],
            right[base + 2],
            right[base + 3],
            right[base + 4],
            right[base + 5],
            right[base + 6],
        )
        k, rm, rp, re, im, ip, ie = pari_log_entry_sum(
            left[base],
            left[base + 1],
            left[base + 2],
            left[base + 3],
            left[base + 4],
            left[base + 5],
            left[base + 6],
            bk,
            br,
            brp,
            bre,
            bi,
            bip,
            bie,
        )
        output[base] = k
        output[base + 1] = rm
        output[base + 2] = rp
        output[base + 3] = re
        output[base + 4] = im
        output[base + 5] = ip
        output[base + 6] = ie
    return 0


@native
def pari_get_clg2_arch(
    c_entries: IntegerBuffer,
    m1: IntegerBuffer,
    cyc: IntegerBuffer,
    generator_logs: IntegerBuffer,
    m2: IntegerBuffer,
    ur: IntegerBuffer,
    rows: int,
    inner: int,
    active: int,
    gd_output: IntegerBuffer,
    ga_output: IntegerBuffer,
    gd_work: IntegerBuffer,
    cm2_work: IntegerBuffer,
    urga_work: IntegerBuffer,
) -> int:
    """Assemble packed `GD` and `ga` for a prepared `get_clg2` state.

    `C` and `generator_logs` have shapes `rows*inner`; `M1` is
    `inner*active`; `M2` and `Ur` are `inner*inner`. The authentic accepted
    cubic corridor has `active == inner`; the general `active <= inner` shape
    remains supported because `Ga` retains all `inner` source columns here.
    """
    if rows < 0 or inner < 1 or active < 0 or active > inner:
        raise ValueError("unsupported get_clg2 archimedean dimensions")
    gd_words = rows * active * 7
    square_words = rows * inner * 7
    if (
        len(c_entries) < square_words
        or len(generator_logs) < square_words
        or len(m1) < inner * active
        or len(cyc) < active
        or len(m2) < inner * inner
        or len(ur) < inner * inner
    ):
        raise ValueError("short get_clg2 archimedean input")
    if len(gd_output) < gd_words or len(ga_output) < square_words:
        raise ValueError("short get_clg2 archimedean output")
    if (
        len(gd_work) < gd_words
        or len(cm2_work) < square_words
        or len(urga_work) < square_words
    ):
        raise ValueError("short get_clg2 archimedean workspace")

    # These calls preserve the distinct RgM_ZM_mul zero-coefficient skip rule.
    pari_log_matrix_transform(c_entries, m1, rows, inner, active, False, gd_work)
    pari_log_matrix_transform(c_entries, m2, rows, inner, inner, False, cm2_work)
    pari_log_matrix_transform(generator_logs, ur, rows, inner, inner, False, urga_work)

    # Public owners are untouched until every transform and validation succeeds.
    pari_log_matrix_subtract_scaled(
        gd_work, generator_logs, cyc, rows, active, gd_output
    )
    pari_log_matrix_subtract(cm2_work, urga_work, rows, inner, ga_output)
    return 0
