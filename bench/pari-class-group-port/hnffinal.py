"""PARI 2.17.4 hnffinal for a nonempty matrix and logarithmic C.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Keep exact HNF, dependent rows, trailing columns and logarithms synchronized.
This is a diagnostic resident stage, not a completed class/unit certificate.
"""

from sagejs.native import (
    Int64Buffer,
    IntegerBuffer,
    checked_int64,
    diagnostic_stage_switch,
    int64,
    integer_buffer_addmul_range_from,
    native,
)

from .hnflll import pari_hnflll
from .integer_matrix_product import pari_integer_matrix_product
from .log_matrix_transform import (
    _pari_log_entry_add_scaled_bounded_zero_exact,
    _pari_log_matrix_transform_bounded_word_zero_exact,
    _pari_log_matrix_transform_int64,
    _pari_pack_log_metadata_zero_exact,
    pari_log_entry_product,
    pari_log_entry_sum,
    pari_validate_log_entries,
)


@native
def pari_hnffinal_nonempty(
    matgen: IntegerBuffer,
    rows: int64,
    columns: int64,
    perm: Int64Buffer,
    dep: IntegerBuffer,
    dep_rows: int64,
    trailing: IntegerBuffer,
    total_columns: int64,
    logs: IntegerBuffer,
    log_rows: int64,
    full_h: IntegerBuffer,
    transform: IntegerBuffer,
    word_transform: Int64Buffer,
    lam: IntegerBuffer,
    d: IntegerBuffer,
    hnf_state: Int64Buffer,
    full_dep: IntegerBuffer,
    work_b: IntegerBuffer,
    work_c: IntegerBuffer,
    diagonal: Int64Buffer,
    work_perm: Int64Buffer,
    result_h: IntegerBuffer,
    result_dep: IntegerBuffer,
    result_b: IntegerBuffer,
    result_c: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Translate hnffinal after its empty-column early return.

    C is a t_MAT, never the alternative upstream t_VEC path. Full row rank
    of matgen and genuine dependence of dep are source preconditions; check
    the resulting HNF and zero dependency columns before propagation.
    A valid prepared permutation is required. All buffers must be disjoint. A failed
    dependency can leave scratch modified, never valid published dimensions.
    -1/-2 propagate unported exact-matrix dispatch. Exceptions likewise mean
    incomplete work. State on success: H rows, retained relation columns,
    B columns, dependent rows, initial zero columns, removed unit diagonals,0.
    """
    if (
        rows < 0
        or columns < 1
        or columns < rows
        or dep_rows < 0
        or log_rows < 1
        or total_columns < columns
    ):
        raise ValueError("invalid nonempty hnffinal dimensions")
    lig: int64 = rows + dep_rows
    tail: int64 = total_columns - columns
    if (
        len(matgen) < rows * columns
        or len(perm) < lig
        or len(dep) < dep_rows * columns
        or len(trailing) < lig * tail
    ):
        raise ValueError("short hnffinal exact input")
    if len(logs) < 7 * log_rows * total_columns or len(state) < 7:
        raise ValueError("short hnffinal log input or state")
    if (
        len(full_h) < rows * columns
        or len(transform) < columns * columns
        or len(lam) < columns * columns
        or len(d) < columns + 1
        or len(hnf_state) < 11
    ):
        raise ValueError("short hnffinal HNF workspace")
    if (
        len(full_dep) < dep_rows * columns
        or len(work_b) < lig * tail
        or len(work_c) < 7 * log_rows * total_columns
        or len(diagonal) < rows
        or len(work_perm) < lig
    ):
        raise ValueError("short hnffinal propagation workspace")
    if (
        len(result_h) < rows * rows
        or len(result_dep) < dep_rows * rows
        or len(result_b) < lig * (tail + rows)
        or len(result_c) < 7 * log_rows * total_columns
    ):
        raise ValueError("short hnffinal result workspace")
    diagnostic_stage_switch(1)
    pari_validate_log_entries(logs, log_rows * total_columns)
    diagnostic_stage_switch(2)
    i: int64 = 0
    j: int64 = 0
    k: int64 = 0
    range_start: int64 = 0
    range_stop: int64 = 7
    range_step: int64 = -1
    for i in range(range_stop):
        state[i] = -1
    pari_hnflll(matgen, rows, columns, full_h, transform, lam, d, hnf_state)
    diagnostic_stage_switch(5)
    zc: int64 = columns - rows
    for j in range(zc):
        for i in range(rows):
            if full_h[j * rows + i] != 0:
                raise ValueError("hnffinal matgen lacks source full-row-rank shape")
    for i in range(rows):
        if full_h[(zc + i) * rows + i] <= 0:
            raise ValueError("hnffinal matgen lacks positive HNF diagonal")
    if dep_rows != 0:
        status = pari_integer_matrix_product(
            dep, transform, dep_rows, columns, columns, full_dep
        )
        if status != 0:
            state[6] = status
            return status
        for j in range(zc):
            for i in range(dep_rows):
                if full_dep[j * dep_rows + i] != 0:
                    raise ValueError(
                        "hnffinal dependent rows violate source precondition"
                    )
    diagnostic_stage_switch(6)
    metadata_offset: int64 = columns * columns
    bounded_logs: bool = len(word_transform) >= (
        metadata_offset + 5 * log_rows * columns
    )
    if bounded_logs:
        bounded_logs = _pari_pack_log_metadata_zero_exact(
            logs, log_rows * columns, word_transform, metadata_offset
        )
    if bounded_logs:
        range_stop = columns * columns
        for i in range(range_stop):
            coefficient = transform[i]
            if coefficient < -9223372036854775808 or coefficient > 9223372036854775807:
                bounded_logs = False
                break
    if bounded_logs:
        range_stop = columns * columns
        for i in range(range_stop):
            word_transform[i] = checked_int64(transform[i])
        _pari_log_matrix_transform_bounded_word_zero_exact(
            logs,
            word_transform,
            log_rows,
            columns,
            columns,
            True,
            metadata_offset,
            work_c,
        )
    else:
        _pari_log_matrix_transform_int64(
            logs, transform, log_rows, columns, columns, True, work_c
        )
    range_start = 7 * log_rows * columns
    range_stop = 7 * log_rows * total_columns
    for i in range(range_start, range_stop):
        work_c[i] = logs[i]
    range_stop = lig * tail
    for i in range(range_stop):
        work_b[i] = trailing[i]
    diagnostic_stage_switch(7)
    removed: int64 = 0
    range_start = rows - 1
    range_stop = -1
    for i in range(range_start, range_stop, range_step):
        h = full_h[(zc + i) * rows + i]
        diagonal[i] = 0
        if h == 1 or h == -1:
            diagonal[i] = 1
            removed += 1
        for j in range(tail):
            quotient = work_b[j * lig + i + dep_rows]
            if diagonal[i] == 0:
                quotient //= h
            if quotient == 0:
                continue
            destination_start: int64 = checked_int64(j * lig)
            source_start: int64 = checked_int64((zc + i) * dep_rows)
            integer_buffer_addmul_range_from(
                work_b,
                destination_start,
                full_dep,
                source_start,
                dep_rows,
                -quotient,
            )
            destination_start = checked_int64(j * lig + dep_rows)
            source_start = checked_int64((zc + i) * rows)
            integer_buffer_addmul_range_from(
                work_b,
                destination_start,
                full_h,
                source_start,
                rows,
                -quotient,
            )
            for k in range(log_rows):
                src: int64 = ((zc + i) * log_rows + k) * 7
                dst: int64 = ((columns + j) * log_rows + k) * 7
                bounded_quotient: bool = (
                    bounded_logs
                    and quotient >= -9223372036854775807
                    and quotient <= 9223372036854775807
                )
                if bounded_quotient:
                    quotient64: int64 = checked_int64(-quotient)
                    _pari_log_entry_add_scaled_bounded_zero_exact(
                        work_c, src, dst, quotient64
                    )
                else:
                    bk, br, brp, bre, bi, bip, bie = pari_log_entry_product(
                        -quotient,
                        work_c[src],
                        work_c[src + 1],
                        work_c[src + 2],
                        work_c[src + 3],
                        work_c[src + 4],
                        work_c[src + 5],
                        work_c[src + 6],
                    )
                    ak, ar, arp, are, ai, aip, aie = pari_log_entry_sum(
                        work_c[dst],
                        work_c[dst + 1],
                        work_c[dst + 2],
                        work_c[dst + 3],
                        work_c[dst + 4],
                        work_c[dst + 5],
                        work_c[dst + 6],
                        bk,
                        br,
                        brp,
                        bre,
                        bi,
                        bip,
                        bie,
                    )
                    work_c[dst] = ak
                    work_c[dst + 1] = ar
                    work_c[dst + 2] = arp
                    work_c[dst + 3] = are
                    work_c[dst + 4] = ai
                    work_c[dst + 5] = aip
                    work_c[dst + 6] = aie
    diagnostic_stage_switch(8)
    new_rows: int64 = rows - removed
    new_columns: int64 = columns - removed
    new_lig: int64 = dep_rows + new_rows
    for i in range(lig):
        work_perm[i] = perm[i]
    first: int64 = 0
    second: int64 = new_rows
    for i in range(rows):
        if diagonal[i] != 0:
            perm[dep_rows + second] = work_perm[dep_rows + i]
            second += 1
        else:
            perm[dep_rows + first] = work_perm[dep_rows + i]
            first += 1
    range_stop = 7 * log_rows * total_columns
    for i in range(range_stop):
        result_c[i] = work_c[i]
    unit: int64 = 0
    nonunit: int64 = 0
    destination: int64 = 0
    for j in range(rows):
        destination = 0
        if diagonal[j] != 0:
            destination = new_columns + unit
            for i in range(dep_rows):
                result_b[unit * new_lig + i] = full_dep[(zc + j) * dep_rows + i]
            k = 0
            for i in range(rows):
                if diagonal[i] == 0:
                    result_b[unit * new_lig + dep_rows + k] = full_h[
                        (zc + j) * rows + i
                    ]
                    k += 1
            unit += 1
        else:
            destination = zc + nonunit
            for i in range(dep_rows):
                result_dep[nonunit * dep_rows + i] = full_dep[(zc + j) * dep_rows + i]
            k = 0
            for i in range(rows):
                if diagonal[i] == 0:
                    result_h[nonunit * new_rows + k] = full_h[(zc + j) * rows + i]
                    k += 1
            nonunit += 1
        range_stop = log_rows * 7
        for i in range(range_stop):
            result_c[destination * log_rows * 7 + i] = work_c[
                (zc + j) * log_rows * 7 + i
            ]
    for j in range(tail):
        for i in range(dep_rows):
            result_b[(removed + j) * new_lig + i] = work_b[j * lig + i]
        k = 0
        for i in range(rows):
            if diagonal[i] == 0:
                result_b[(removed + j) * new_lig + dep_rows + k] = work_b[
                    j * lig + dep_rows + i
                ]
                k += 1
    diagnostic_stage_switch(9)
    state[0] = new_rows
    state[1] = new_columns
    state[2] = tail + removed
    state[3] = dep_rows
    state[4] = zc
    state[5] = removed
    state[6] = 0
    return 0
