"""PARI 2.17.4 buch2.c extract_full_lattice, literal dichotomy schedule.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Repeated HNF uses the source-matched small/wide HNF dispatches. Their
documented Bezout arithmetic adapter and packed-copy representations remain
in force. This selects columns, not fundamental units or a class group.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native
from .regulator_hnf import pari_regulator_hnf
from .regulator_hnf_wide import pari_regulator_hnf_wide


@native
def pari_unit_selection_hnf(
    matrix: IntegerBuffer,
    rows: int,
    columns: int,
    work: IntegerBuffer,
    column: IntegerBuffer,
    output: IntegerBuffer,
    row_pivots: Int64Buffer,
    heights: Int64Buffer,
    hnf_state: Int64Buffer,
) -> int:
    if columns <= 7:
        return pari_regulator_hnf(
            matrix, rows, columns, work, column, output, hnf_state
        )
    return pari_regulator_hnf_wide(
        matrix, rows, columns, work, column, row_pivots, heights, output, hnf_state
    )


@native
def pari_unit_lattice_selection(
    original: IntegerBuffer,
    rows: int,
    columns: int,
    selected: Int64Buffer,
    state: Int64Buffer,
    gathered: IntegerBuffer,
    work: IntegerBuffer,
    column: IntegerBuffer,
    target: IntegerBuffer,
    previous: IntegerBuffer,
    trial: IntegerBuffer,
    row_pivots: Int64Buffer,
    heights: Int64Buffer,
    hnf_state: Int64Buffer,
) -> int:
    """0=upstream NULL shortcut, 1=selector; negative means HNF frontier.

    Positive row count, column-major integer matrices; all owners disjoint.
    Selector entries are PARI's one-based column indices. Only state[1]
    entries are live; tentative discarded entries outside that prefix may
    remain. State: status, live selector length, HNF calls, discarded batches,
    halved batches, kept single columns, equality-to-target early exits.
    Invalid shapes/capacities reject before writes. Arithmetic failures can
    leave partial scratch. NULL does not mean an empty selected lattice.
    """
    if rows < 1 or columns < 0:
        raise ValueError("invalid unit lattice shape")
    size = rows * columns
    if (
        len(original) < size
        or len(selected) < columns
        or len(state) < 7
        or len(gathered) < size
        or len(work) < size
        or len(column) < rows
        or len(target) < size
        or len(previous) < size
        or len(trial) < size
        or len(row_pivots) < rows
        or len(heights) < columns
        or len(hnf_state) < 15
    ):
        raise ValueError("short unit lattice workspace")
    for i in range(7):
        state[i] = 0
    if columns < 199:
        return 0
    state[0] = -1
    status = pari_unit_selection_hnf(
        original, rows, columns, work, column, target, row_pivots, heights, hnf_state
    )
    if status != 0:
        return -1
    state[2] = 1
    target_columns = hnf_state[1]
    previous_columns = 0
    live = 0
    step = 1
    j = 1
    while j <= columns:
        saved_live = live
        for k in range(step):
            selected[live + k] = j + k
        live += step
        for k in range(live):
            source_column = selected[k] - 1
            for i in range(rows):
                gathered[k * rows + i] = original[source_column * rows + i]
        status = pari_unit_selection_hnf(
            gathered, rows, live, work, column, trial, row_pivots, heights, hnf_state
        )
        if status != 0:
            return -1
        state[2] += 1
        trial_columns = hnf_state[1]
        equal = trial_columns == previous_columns
        if equal:
            for i in range(rows * trial_columns):
                if previous[i] != trial[i]:
                    equal = False
                    break
        if equal:
            state[3] += 1
            live = saved_live
            j += step
            if j > columns:
                break
            step <<= 1
            if j + step >= columns + 1:
                step = (columns + 1 - j) >> 1
                if step == 0:
                    step = 1
        elif step > 1:
            state[4] += 1
            live = saved_live
            step >>= 1
        else:
            state[5] += 1
            equal = trial_columns == target_columns
            if equal:
                for i in range(rows * trial_columns):
                    if trial[i] != target[i]:
                        equal = False
                        break
            if equal:
                state[6] += 1
                break
            previous_columns = trial_columns
            for i in range(rows * trial_columns):
                previous[i] = trial[i]
            j += 1
    state[0] = 1
    state[1] = live
    return 1
