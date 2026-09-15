"""PARI 2.17.4 hnfadd_i for prepared t_MAT logarithms and word relations.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Retain literal RgM_zm_mul/ZM_zm_mul accumulation and hnfadd column ordering.
Reuse certified initial rank and hnffinal; rational verification, CUP and
unported exact multiplication dispatch remain frontiers, not rank answers.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .hnfspec_rank_prefix import pari_rectangular_initial_pivots
from .hnffinal import pari_hnffinal_nonempty
from .log_matrix_transform import (
    pari_validate_log_entries,
    pari_log_entry_product,
    pari_log_entry_sum,
)


@native
def pari_hnfadd(
    h: IntegerBuffer,
    h_rows: int,
    dep: IntegerBuffer,
    b: IntegerBuffer,
    b_columns: int,
    logs: IntegerBuffer,
    total_columns: int,
    log_rows: int,
    perm: Int64Buffer,
    rows: int,
    new_relations: Int64Buffer,
    new_columns: int,
    new_logs: IntegerBuffer,
    top: IntegerBuffer,
    exact_product: IntegerBuffer,
    log_product: IntegerBuffer,
    adjusted_logs: IntegerBuffer,
    joined: IntegerBuffer,
    joined_logs: IntegerBuffer,
    rank_matrix: IntegerBuffer,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
    best: IntegerBuffer,
    profile: IntegerBuffer,
    rank_state: IntegerBuffer,
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
    """Return 0 complete, 1 empty-batch no-op, -1/-2 explicit frontiers.

    Empty batch leaves ALL owners untouched, including state; caller retains
    the original H/dep/B/C owners. For nonempty batches state[0:7] follows
    hnffinal, with relation-column and zero-unit counts including the saved
    old zero prefix. State[7] is total C columns; state[8] is 0 complete,
    1 rank frontier, 2 exact-multiplication frontier. Negative statuses leave
    dimensions -1; never interpret scratch or prior dimensions as a result.

    Input H is square h_rows, dep has (rows-b_columns-h_rows) rows and h_rows
    columns; B has rows-b_columns rows. Existing matrices must be genuine
    source hnfspec/hnfadd outputs and perm a permutation of all physical rows.
    All matrices are column-major, logs have seven fields per entry, and
    all owners are disjoint. Fixed capacities and additional quadratic
    permutation checks are prototype overhead, not source timing work.
    Arithmetic/allocation exceptions may follow partial mutation.
    """
    if new_columns == 0:
        return 1
    if (
        rows < 0
        or h_rows < 0
        or b_columns < 0
        or b_columns > rows
        or total_columns < b_columns + h_rows
        or log_rows < 1
        or new_columns < 0
    ):
        raise ValueError("invalid hnfadd dimensions")
    lig = rows - b_columns
    dep_rows = lig - h_rows
    col = total_columns - b_columns
    zero_prefix = col - h_rows
    width = new_columns + h_rows
    c_width = width + b_columns
    if dep_rows < 0:
        raise ValueError("invalid hnfadd dependent rows")
    if (
        len(h) < h_rows * h_rows
        or len(dep) < dep_rows * h_rows
        or len(b) < lig * b_columns
        or len(perm) < rows
        or len(new_relations) < rows * new_columns
    ):
        raise ValueError("short hnfadd input")
    pari_validate_log_entries(logs, log_rows * total_columns)
    pari_validate_log_entries(new_logs, log_rows * new_columns)
    if (
        len(top) < lig * new_columns
        or len(exact_product) < lig * new_columns
        or len(log_product) < 7 * log_rows * new_columns
        or len(adjusted_logs) < 7 * log_rows * new_columns
        or len(joined) < lig * width
        or len(joined_logs) < 7 * log_rows * c_width
        or len(rank_matrix) < lig * width
        or len(occupied) < width
        or len(pivots) < lig
        or len(best) < lig
        or len(profile) < lig
        or len(rank_state) < 10
        or len(perm_work) < rows
        or len(matb) < lig * width
        or len(new_dep) < lig * width
        or len(permuted_b) < lig * b_columns
    ):
        raise ValueError("short hnfadd assembly workspace")
    if (
        len(full_h) < lig * width
        or len(transform) < width * width
        or len(lam) < width * width
        or len(d) < width + 1
        or len(hnf_state) < 11
        or len(full_dep) < lig * width
        or len(work_b) < lig * b_columns
        or len(work_c) < 7 * log_rows * c_width
        or len(diagonal) < lig
        or len(final_c) < 7 * log_rows * c_width
        or len(result_h) < lig * lig
        or len(result_dep) < lig * lig
        or len(result_b) < lig * (b_columns + lig)
        or len(result_c) < 7 * log_rows * (total_columns + new_columns)
        or len(final_state) < 7
        or len(state) < 9
    ):
        raise ValueError("short hnfadd final workspace")
    for i in range(rows):
        if perm[i] < 1 or perm[i] > rows:
            raise ValueError("invalid hnfadd permutation")
        for j in range(i):
            if perm[i] == perm[j]:
                raise ValueError("invalid hnfadd permutation")
    for i in range(9):
        state[i] = -1
    state[7] = total_columns + new_columns
    # zm_to_ZM(rowslicepermute(extramat,perm,1,lig)).
    for j in range(new_columns):
        for i in range(lig):
            top[j * lig + i] = new_relations[j * rows + perm[i] - 1]
    if b_columns != 0:
        # RgMrow_zc_mul_i: first NONZERO coefficient initializes s; only later
        # +/-1 terms use direct gadd/gsub, without multiplying by +/-1.
        for j in range(new_columns):
            for i in range(log_rows):
                present = 0
                ak, ar, arp, are, ai, aip, aie = 1, 0, -1, 0, 0, -1, 0
                for k in range(b_columns):
                    coefficient = new_relations[j * rows + perm[lig + k] - 1]
                    if coefficient == 0:
                        continue
                    at = ((col + k) * log_rows + i) * 7
                    if present == 0 or (coefficient != 1 and coefficient != -1):
                        bk, br, brp, bre, bi, bip, bie = pari_log_entry_product(
                            coefficient,
                            logs[at],
                            logs[at + 1],
                            logs[at + 2],
                            logs[at + 3],
                            logs[at + 4],
                            logs[at + 5],
                            logs[at + 6],
                        )
                    else:
                        bk, br, brp, bre = (
                            logs[at],
                            logs[at + 1],
                            logs[at + 2],
                            logs[at + 3],
                        )
                        bi, bip, bie = logs[at + 4], logs[at + 5], logs[at + 6]
                        if coefficient == -1:
                            br = -br
                            bi = -bi
                    if present == 0:
                        ak, ar, arp, are, ai, aip, aie = bk, br, brp, bre, bi, bip, bie
                        present = 1
                    else:
                        ak, ar, arp, are, ai, aip, aie = pari_log_entry_sum(
                            ak,
                            ar,
                            arp,
                            are,
                            ai,
                            aip,
                            aie,
                            bk,
                            br,
                            brp,
                            bre,
                            bi,
                            bip,
                            bie,
                        )
                at = (j * log_rows + i) * 7
                log_product[at] = ak
                log_product[at + 1] = ar
                log_product[at + 2] = arp
                log_product[at + 3] = are
                log_product[at + 4] = ai
                log_product[at + 5] = aip
                log_product[at + 6] = aie
        for i in range(new_columns * log_rows):
            at = i * 7
            ak, ar, arp, are, ai, aip, aie = pari_log_entry_sum(
                new_logs[at],
                new_logs[at + 1],
                new_logs[at + 2],
                new_logs[at + 3],
                new_logs[at + 4],
                new_logs[at + 5],
                new_logs[at + 6],
                log_product[at],
                -log_product[at + 1],
                log_product[at + 2],
                log_product[at + 3],
                -log_product[at + 4],
                log_product[at + 5],
                log_product[at + 6],
            )
            adjusted_logs[at] = ak
            adjusted_logs[at + 1] = ar
            adjusted_logs[at + 2] = arp
            adjusted_logs[at + 3] = are
            adjusted_logs[at + 4] = ai
            adjusted_logs[at + 5] = aip
            adjusted_logs[at + 6] = aie
        # ZM_zc_mul_i instead initializes with coefficient 1 EVEN IF ZERO.
        for j in range(new_columns):
            for i in range(lig):
                value = b[i] * new_relations[j * rows + perm[lig] - 1]
                for k in range(1, b_columns):
                    coefficient = new_relations[j * rows + perm[lig + k] - 1]
                    if coefficient != 0:
                        value += b[k * lig + i] * coefficient
                exact_product[j * lig + i] = value
        for i in range(lig * new_columns):
            top[i] -= exact_product[i]
    else:
        for i in range(7 * log_rows * new_columns):
            adjusted_logs[i] = new_logs[i]
    # New relations precede old nonzero H columns; old zero-unit columns do
    # not enter rank or HNF, and are prepended to C only at final publication.
    for i in range(lig * new_columns):
        joined[i] = top[i]
    for j in range(h_rows):
        for i in range(dep_rows):
            joined[(new_columns + j) * lig + i] = dep[j * dep_rows + i]
        for i in range(h_rows):
            joined[(new_columns + j) * lig + dep_rows + i] = h[j * h_rows + i]
    for i in range(7 * log_rows * new_columns):
        joined_logs[i] = adjusted_logs[i]
    for i in range(7 * log_rows * (h_rows + b_columns)):
        joined_logs[7 * log_rows * new_columns + i] = logs[
            7 * log_rows * zero_prefix + i
        ]
    status = pari_rectangular_initial_pivots(
        joined, width, lig, rank_matrix, occupied, pivots, best, rank_state
    )
    if status != 0:
        rank_state[7] = -1
        rank_state[8] = -1
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
