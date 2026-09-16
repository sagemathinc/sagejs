"""PARI 2.17.4 hnffinal for a nonempty matrix and logarithmic C.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Keep exact HNF, dependent rows, trailing columns and logarithms synchronized.
This is a diagnostic resident stage, not a completed class/unit certificate.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .hnflll import pari_hnflll
from .integer_matrix_product import pari_integer_matrix_product
from .log_matrix_transform import (
    pari_log_matrix_transform,
    pari_log_entry_product,
    pari_log_entry_sum,
    pari_validate_log_entries,
)


@native
def pari_hnffinal_nonempty(
    matgen: IntegerBuffer,
    rows: int,
    columns: int,
    perm: Int64Buffer,
    dep: IntegerBuffer,
    dep_rows: int,
    trailing: IntegerBuffer,
    total_columns: int,
    logs: IntegerBuffer,
    log_rows: int,
    full_h: IntegerBuffer,
    transform: IntegerBuffer,
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
    lig = rows + dep_rows
    tail = total_columns - columns
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
    pari_validate_log_entries(logs, log_rows * total_columns)
    for i in range(7):
        state[i] = -1
    pari_hnflll(matgen, rows, columns, full_h, transform, lam, d, hnf_state)
    zc = columns - rows
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
    pari_log_matrix_transform(logs, transform, log_rows, columns, columns, True, work_c)
    for i in range(7 * log_rows * columns, 7 * log_rows * total_columns):
        work_c[i] = logs[i]
    for i in range(lig * tail):
        work_b[i] = trailing[i]
    removed = 0
    for i in range(rows - 1, -1, -1):
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
            for k in range(dep_rows):
                work_b[j * lig + k] -= quotient * full_dep[(zc + i) * dep_rows + k]
            for k in range(rows):
                work_b[j * lig + dep_rows + k] -= quotient * full_h[(zc + i) * rows + k]
            for k in range(log_rows):
                src = ((zc + i) * log_rows + k) * 7
                dst = ((columns + j) * log_rows + k) * 7
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
    new_rows = rows - removed
    new_columns = columns - removed
    new_lig = dep_rows + new_rows
    for i in range(lig):
        work_perm[i] = perm[i]
    first = 0
    second = new_rows
    for i in range(rows):
        if diagonal[i] != 0:
            perm[dep_rows + second] = work_perm[dep_rows + i]
            second += 1
        else:
            perm[dep_rows + first] = work_perm[dep_rows + i]
            first += 1
    for i in range(7 * log_rows * total_columns):
        result_c[i] = work_c[i]
    unit = 0
    nonunit = 0
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
        for i in range(log_rows * 7):
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
    state[0] = new_rows
    state[1] = new_columns
    state[2] = tail + removed
    state[3] = dep_rows
    state[4] = zc
    state[5] = removed
    state[6] = 0
    return 0
