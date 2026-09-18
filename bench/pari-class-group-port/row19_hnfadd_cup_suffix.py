"""Resume row-19 `hnfadd` at its explicit rectangular-CUP frontier."""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .hnffinal import pari_hnffinal_nonempty
from .hnfspec_cup_rank import pari_rectangular_cup_initial_pivots


@native
def pari_row19_hnfadd_cup_suffix(
    joined: IntegerBuffer,
    width: int,
    lig: int,
    joined_logs: IntegerBuffer,
    logs: IntegerBuffer,
    log_rows: int,
    b: IntegerBuffer,
    b_columns: int,
    perm: Int64Buffer,
    total_columns: int,
    new_columns: int,
    rank_matrix: IntegerBuffer,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
    best: IntegerBuffer,
    profile: IntegerBuffer,
    rank_state: IntegerBuffer,
    cup_arena: IntegerBuffer,
    cup_frames: IntegerBuffer,
    cup_solve_state: Int64Buffer,
    cup_state: Int64Buffer,
    perm_work: Int64Buffer,
    matb: IntegerBuffer,
    new_dep: IntegerBuffer,
    permuted_b: IntegerBuffer,
    full_h: IntegerBuffer,
    transform: IntegerBuffer,
    lam: IntegerBuffer,
    d: IntegerBuffer,
    hnf_state: Int64Buffer,
    full_dep: IntegerBuffer,
    work_b: IntegerBuffer,
    work_c: IntegerBuffer,
    diagonal: Int64Buffer,
    final_c: IntegerBuffer,
    result_h: IntegerBuffer,
    result_dep: IntegerBuffer,
    result_b: IntegerBuffer,
    result_c: IntegerBuffer,
    final_state: Int64Buffer,
    state: Int64Buffer,
) -> int:
    """Complete the append after legacy `hnfadd` publishes joined owners."""
    if width < 1 or lig < 1 or b_columns < 0 or len(state) < 9:
        raise ValueError("invalid row19 CUP append shape")
    zero_prefix = total_columns - b_columns - (width - new_columns)
    c_width = width + b_columns
    if zero_prefix < 0 or len(joined) < lig * width:
        raise ValueError("invalid row19 CUP append prefix")
    status = pari_rectangular_cup_initial_pivots(
        joined,
        width,
        lig,
        rank_matrix,
        occupied,
        pivots,
        best,
        rank_state,
        cup_arena,
        cup_frames,
        cup_solve_state,
        cup_state,
    )
    if status != 0:
        state[6] = status
        state[8] = 1
        return status
    redundant = rank_state[2]
    first = 0
    second = redundant
    for i in range(lig):
        if pivots[i] != 0:
            profile[second] = i + 1
            second += 1
        else:
            profile[first] = i + 1
            first += 1
    rank_state[7] = redundant
    rank_state[8] = lig
    genuine = lig - redundant
    for i in range(lig):
        perm_work[i] = perm[profile[i] - 1]
    for i in range(lig):
        perm[i] = perm_work[i]
    for j in range(width):
        for i in range(redundant):
            new_dep[j * redundant + i] = joined[j * lig + profile[i] - 1]
        for i in range(genuine):
            matb[j * genuine + i] = joined[j * lig + profile[redundant + i] - 1]
    for j in range(b_columns):
        for i in range(lig):
            permuted_b[j * lig + i] = b[j * lig + profile[i] - 1]
    status = pari_hnffinal_nonempty(
        matb,
        genuine,
        width,
        perm,
        new_dep,
        redundant,
        permuted_b,
        c_width,
        joined_logs,
        log_rows,
        full_h,
        transform,
        lam,
        d,
        hnf_state,
        full_dep,
        work_b,
        work_c,
        diagonal,
        perm_work,
        result_h,
        result_dep,
        result_b,
        final_c,
        final_state,
    )
    if status != 0:
        state[6] = status
        state[8] = 2
        return status
    for i in range(7 * log_rows * zero_prefix):
        result_c[i] = logs[i]
    for i in range(7 * log_rows * c_width):
        result_c[7 * log_rows * zero_prefix + i] = final_c[i]
    for i in range(7):
        state[i] = final_state[i]
    state[1] += zero_prefix
    state[4] += zero_prefix
    state[7] = total_columns + new_columns
    state[8] = 0
    return 0


__all__ = ["pari_row19_hnfadd_cup_suffix"]
