"""PARI buchall post-HNF rank test and regulator input extraction.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This bridge does not implement collection scheduling, cache rank repair,
precision restart or certification. It only publishes regulator inputs when
the source dimension test permits attempting unit rank computation.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native
from .log_matrix_transform import pari_validate_log_entries
from .regulator_scalar import pari_validate_regulator_values
from .integer_real_product import pari_integer_real_product


@native
def pari_row23_post_hnf_regulator_inputs(
    factor_count: int,
    h_rows: int,
    b_columns: int,
    c_columns: int,
    places: int,
    h: IntegerBuffer,
    c: IntegerBuffer,
    inverse_hr: IntegerBuffer,
    real_logs: IntegerBuffer,
    class_number: IntegerBuffer,
    zeta_factor: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Return source dimension need; state=[need,zero columns,ready].

    H is square column-major, C has seven-field scalar entries. Input H/C
    are actual reduced outputs, not a supplied class-number answer. The
    determinant is a tentative index until the outer completeness checks.
    This bridge eagerly prepares h*invhr; buchall itself computes it only
    after the regulator-multiple and unchanged-cache gates. Consequently
    this entry is diagnostic integration, not an equal-work timing boundary.
    Disjoint output owners publish only when need is zero.
    """
    if (
        factor_count < 0
        or h_rows < 0
        or b_columns < 0
        or h_rows + b_columns > factor_count
        or c_columns < h_rows + b_columns
        or places < 2
        or places > 5
    ):
        raise ValueError("invalid post-HNF dimensions")
    zero_columns = c_columns - b_columns - h_rows
    if (
        len(h) < h_rows * h_rows
        or len(real_logs) < 3 * places * zero_columns
        or len(class_number) < 1
        or len(zeta_factor) < 3
        or len(state) < 3
    ):
        raise ValueError("short post-HNF workspace")
    pari_validate_log_entries(c, places * c_columns)
    pari_validate_regulator_values(inverse_hr, 1)
    if inverse_hr[0] <= 0 or inverse_hr[1] < 64:
        raise ValueError("inverse hR must be positive real")
    need = factor_count - h_rows - b_columns
    if places - 1 - zero_columns > 0:
        need += places - 1 - zero_columns
        if need > factor_count:
            need = factor_count
    state[0] = need
    state[1] = zero_columns
    state[2] = 0
    if need != 0:
        return need
    pari_row23_post_hnf_class_factor(h_rows, h, inverse_hr, class_number, zeta_factor)
    for i in range(places * zero_columns):
        real_logs[3 * i] = c[7 * i + 1]
        real_logs[3 * i + 1] = c[7 * i + 2]
        real_logs[3 * i + 2] = c[7 * i + 3]
    state[2] = 1
    return 0


@native
def pari_row23_post_hnf_log_inputs(
    factor_count: int,
    h_rows: int,
    b_columns: int,
    c_columns: int,
    places: int,
    c: IntegerBuffer,
    real_logs: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Publish real unit columns only after the source dimension gate.

    state=[need,zero_columns,logs_ready]. No determinant or inverse-hR
    validation/evaluation occurs; those belong after the multiple/cache gates.
    On dimension need, logs are untouched. Invalid shapes reject before state.
    """
    if (
        factor_count < 0
        or h_rows < 0
        or b_columns < 0
        or h_rows + b_columns > factor_count
        or c_columns < h_rows + b_columns
        or places < 2
        or places > 5
    ):
        raise ValueError("invalid post-HNF dimensions")
    zero_columns = c_columns - b_columns - h_rows
    if len(real_logs) < 3 * places * zero_columns or len(state) < 3:
        raise ValueError("short post-HNF log workspace")
    pari_validate_log_entries(c, places * c_columns)
    need = factor_count - h_rows - b_columns
    if places - 1 - zero_columns > 0:
        need += places - 1 - zero_columns
        if need > factor_count:
            need = factor_count
    state[0] = need
    state[1] = zero_columns
    state[2] = 0
    if need != 0:
        return need
    for i in range(places * zero_columns):
        real_logs[3 * i] = c[7 * i + 1]
        real_logs[3 * i + 1] = c[7 * i + 2]
        real_logs[3 * i + 2] = c[7 * i + 3]
    state[2] = 1
    return 0


@native
def pari_row23_post_hnf_class_factor(
    h_rows: int,
    h: IntegerBuffer,
    inverse_hr: IntegerBuffer,
    class_number: IntegerBuffer,
    zeta_factor: IntegerBuffer,
) -> int:
    """Compute tentative det(H), then h*invhr after source acceptance gates.

    Output owners publish after scalar arithmetic succeeds. They are not
    certified class-group outputs. No cache mutation is owned by this helper.
    """
    if (
        h_rows < 0
        or len(h) < h_rows * h_rows
        or len(class_number) < 1
        or len(zeta_factor) < 3
    ):
        raise ValueError("short post-HNF class-factor workspace")
    pari_validate_regulator_values(inverse_hr, 1)
    if inverse_hr[0] <= 0 or inverse_hr[1] < 64:
        raise ValueError("inverse hR must be positive real")
    # ZM_det_triangular copies the first diagonal, not 1 times that entry.
    determinant = 1
    if h_rows > 0:
        determinant = h[0]
        for i in range(1, h_rows):
            determinant *= h[i * h_rows + i]
    if determinant <= 0:
        raise ValueError("post-HNF diagonal must give positive index")
    m, p, e = pari_integer_real_product(
        determinant, inverse_hr[0], inverse_hr[1], inverse_hr[2]
    )
    class_number[0] = determinant
    zeta_factor[0] = m
    zeta_factor[1] = p
    zeta_factor[2] = e
    return 0
