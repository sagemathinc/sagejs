"""PARI 2.17.4 hnfadd_i for prepared t_MAT logarithms and word relations.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Retain literal RgM_zm_mul/ZM_zm_mul accumulation and hnfadd column ordering.
Reuse certified initial rank and hnffinal; rational verification, CUP and
unported exact multiplication dispatch remain frontiers, not rank answers.
"""

from sagejs.native import (
    Int64Buffer,
    IntegerBuffer,
    checked_int64,
    diagnostic_stage_switch,
    int64,
    native,
)

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
    diagnostic_stage_switch(1)
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
    rows64: int64 = checked_int64(rows)
    h_rows64: int64 = checked_int64(h_rows)
    b_columns64: int64 = checked_int64(b_columns)
    total_columns64: int64 = checked_int64(total_columns)
    log_rows64: int64 = checked_int64(log_rows)
    new_columns64: int64 = checked_int64(new_columns)
    lig: int64 = rows64 - b_columns64
    dep_rows: int64 = lig - h_rows64
    col: int64 = total_columns64 - b_columns64
    zero_prefix: int64 = col - h_rows64
    width: int64 = new_columns64 + h_rows64
    c_width: int64 = width + b_columns64
    if dep_rows < 0:
        raise ValueError("invalid hnfadd dependent rows")
    if (
        len(h) < h_rows64 * h_rows64
        or len(dep) < dep_rows * h_rows64
        or len(b) < lig * b_columns64
        or len(perm) < rows64
        or len(new_relations) < rows64 * new_columns64
    ):
        raise ValueError("short hnfadd input")
    pari_validate_log_entries(logs, log_rows64 * total_columns64)
    pari_validate_log_entries(new_logs, log_rows64 * new_columns64)
    if (
        len(top) < lig * new_columns64
        or len(exact_product) < lig * new_columns64
        or len(log_product) < 7 * log_rows64 * new_columns64
        or len(adjusted_logs) < 7 * log_rows64 * new_columns64
        or len(joined) < lig * width
        or len(joined_logs) < 7 * log_rows * c_width
        or len(rank_matrix) < lig * width
        or len(occupied) < width
        or len(pivots) < lig
        or len(best) < lig
        or len(profile) < lig
        or len(rank_state) < 10
        or len(perm_work) < rows64
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
        or len(work_c) < 7 * log_rows64 * c_width
        or len(diagonal) < lig
        or len(final_c) < 7 * log_rows64 * c_width
        or len(result_h) < lig * lig
        or len(result_dep) < lig * lig
        or len(result_b) < lig * (b_columns + lig)
        or len(result_c) < 7 * log_rows64 * (total_columns64 + new_columns64)
        or len(final_state) < 7
        or len(state) < 9
    ):
        raise ValueError("short hnfadd final workspace")
    i: int64 = 0
    j: int64 = 0
    k: int64 = 0
    at: int64 = 0
    range_stop: int64 = 0
    for i in range(rows64):
        if perm[i] < 1 or perm[i] > rows:
            raise ValueError("invalid hnfadd permutation")
        for j in range(i):
            if perm[i] == perm[j]:
                raise ValueError("invalid hnfadd permutation")
    range_stop = 9
    for i in range(range_stop):
        state[i] = -1
    state[7] = total_columns64 + new_columns64
    diagnostic_stage_switch(2)
    # zm_to_ZM(rowslicepermute(extramat,perm,1,lig)).
    for j in range(new_columns64):
        for i in range(lig):
            top[j * lig + i] = new_relations[j * rows64 + perm[i] - 1]
    if b_columns64 != 0:
        # RgMrow_zc_mul_i: first NONZERO coefficient initializes s; only later
        # +/-1 terms use direct gadd/gsub, without multiplying by +/-1.
        for j in range(new_columns64):
            for i in range(log_rows64):
                present = 0
                ak, ar, arp, are, ai, aip, aie = 1, 0, -1, 0, 0, -1, 0
                for k in range(b_columns64):
                    coefficient = new_relations[j * rows64 + perm[lig + k] - 1]
                    if coefficient == 0:
                        continue
                    at = ((col + k) * log_rows64 + i) * 7
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
                at = (j * log_rows64 + i) * 7
                log_product[at] = ak
                log_product[at + 1] = ar
                log_product[at + 2] = arp
                log_product[at + 3] = are
                log_product[at + 4] = ai
                log_product[at + 5] = aip
                log_product[at + 6] = aie
        range_stop = new_columns64 * log_rows64
        for i in range(range_stop):
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
        for j in range(new_columns64):
            for i in range(lig):
                value = b[i] * new_relations[j * rows64 + perm[lig] - 1]
                for k in range(1, b_columns64):
                    coefficient = new_relations[j * rows64 + perm[lig + k] - 1]
                    if coefficient != 0:
                        value += b[k * lig + i] * coefficient
                exact_product[j * lig + i] = value
        range_stop = lig * new_columns64
        for i in range(range_stop):
            top[i] -= exact_product[i]
    else:
        range_stop = 7 * log_rows64 * new_columns64
        for i in range(range_stop):
            adjusted_logs[i] = new_logs[i]
    # New relations precede old nonzero H columns; old zero-unit columns do
    # not enter rank or HNF, and are prepended to C only at final publication.
    range_stop = lig * new_columns64
    for i in range(range_stop):
        joined[i] = top[i]
    for j in range(h_rows64):
        for i in range(dep_rows):
            joined[(new_columns64 + j) * lig + i] = dep[j * dep_rows + i]
        for i in range(h_rows64):
            joined[(new_columns64 + j) * lig + dep_rows + i] = h[j * h_rows64 + i]
    range_stop = 7 * log_rows64 * new_columns64
    for i in range(range_stop):
        joined_logs[i] = adjusted_logs[i]
    range_stop = 7 * log_rows64 * (h_rows64 + b_columns64)
    for i in range(range_stop):
        joined_logs[7 * log_rows64 * new_columns64 + i] = logs[
            7 * log_rows64 * zero_prefix + i
        ]
    diagnostic_stage_switch(3)
    status = pari_rectangular_initial_pivots(
        joined, width, lig, rank_matrix, occupied, pivots, best, rank_state
    )
    if status != 0:
        rank_state[7] = -1
        rank_state[8] = -1
        state[6] = status
        state[8] = 1
        return status
    redundant: int64 = checked_int64(rank_state[2])
    first: int64 = 0
    second: int64 = redundant
    for i in range(lig):
        if pivots[i] != 0:
            profile[second] = i + 1
            second += 1
        else:
            profile[first] = i + 1
            first += 1
    rank_state[7] = redundant
    rank_state[8] = lig
    genuine: int64 = lig - redundant
    for i in range(lig):
        perm_work[i] = perm[checked_int64(profile[i]) - 1]
    for i in range(lig):
        perm[i] = perm_work[i]
    for j in range(width):
        for i in range(redundant):
            new_dep[j * redundant + i] = joined[j * lig + checked_int64(profile[i]) - 1]
        for i in range(genuine):
            matb[j * genuine + i] = joined[
                j * lig + checked_int64(profile[redundant + i]) - 1
            ]
    for j in range(b_columns64):
        for i in range(lig):
            permuted_b[j * lig + i] = b[j * lig + checked_int64(profile[i]) - 1]
    diagnostic_stage_switch(4)
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
        log_rows64,
        full_h,
        transform,
        perm_work,
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
    diagnostic_stage_switch(5)
    range_stop = 7 * log_rows64 * zero_prefix
    for i in range(range_stop):
        result_c[i] = logs[i]
    range_stop = 7 * log_rows64 * c_width
    for i in range(range_stop):
        result_c[7 * log_rows64 * zero_prefix + i] = final_c[i]
    range_stop = 7
    for i in range(range_stop):
        state[i] = final_state[i]
    state[1] += zero_prefix
    state[4] += zero_prefix
    state[7] = total_columns64 + new_columns64
    state[8] = 0
    return 0
