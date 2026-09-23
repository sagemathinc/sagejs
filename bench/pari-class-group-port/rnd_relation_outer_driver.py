"""Resident publication/control after a PARI random-relation HNF append.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the narrow continuation edge missing from the prepared outer driver:
publish an authenticated `rnd_rel` append without refactoring or relogging the
accepted prefix, then derive the next source search/need state. Collection,
HNF arithmetic, and regulator acceptance remain their existing same-source
kernels.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .prepared_class_group_resumable import (
    _pari_prepare_relation_search,
    _pari_publish_appended_hnf,
)


@native
def pari_publish_random_outer_append(
    rows: int,
    places: int,
    degree: int,
    columns: int,
    action: int,
    append_attempt_state: Int64Buffer,
    append_state: Int64Buffer,
    append_h: IntegerBuffer,
    append_dep: IntegerBuffer,
    append_b: IntegerBuffer,
    append_c: IntegerBuffer,
    resident_state: Int64Buffer,
    resident_h: IntegerBuffer,
    resident_dep: IntegerBuffer,
    resident_b: IntegerBuffer,
    resident_c: IntegerBuffer,
    relation_state: IntegerBuffer,
    permutation: Int64Buffer,
    search_ideals: IntegerBuffer,
    outer_permutation: IntegerBuffer,
    outer_state: Int64Buffer,
    accept_multiple_state: Int64Buffer,
    accept_acceptance_state: Int64Buffer,
    driver_state: Int64Buffer,
    driver_trace: Int64Buffer,
    control_state: Int64Buffer,
) -> int:
    """Publish one completed append and retain the exact outer retry state.

    `control_state` is `(need, search_count, squash_index, H rows, B columns,
    total columns)`. The caller retains it across later small-norm appends.
    Action is the actual connected HNF/acceptance result: `-100` dimension
    deficiency, `3/4/5` retry, or `0` terminal candidate. Capacity and shape
    checks precede resident publication.
    """
    if (
        rows < 1
        or places < 1
        or degree < 1
        or columns < 1
        or len(append_attempt_state) < 4
        or len(append_state) < 9
        or len(resident_state) < 9
        or len(relation_state) < 6
        or len(outer_state) < 19
        or len(accept_multiple_state) < 4
        or len(accept_acceptance_state) < 2
        or len(driver_state) < 8
        or len(control_state) < 6
    ):
        raise ValueError("invalid random outer append state")
    if append_attempt_state[0] < 2 or append_attempt_state[3] != columns:
        raise ValueError("random HNF append is not publishable")
    if action != -100 and action != 0 and action != 3 and action != 4 and action != 5:
        raise ValueError("unsupported random outer action")
    current_h = int(append_state[0])
    current_b = int(append_state[2])
    current_columns = int(append_state[7])
    if current_columns != columns:
        raise ValueError("random append column mismatch")
    # Validate search owners before publishing mathematical state.
    if (
        len(permutation) < rows
        or len(search_ideals) < rows
        or len(outer_permutation) < rows
        or len(driver_trace) < 5 * (driver_state[2] + 1)
    ):
        raise ValueError("short random outer continuation owner")
    copied = _pari_publish_appended_hnf(
        rows,
        places,
        append_state,
        append_h,
        append_dep,
        append_b,
        append_c,
        resident_state,
        resident_h,
        resident_dep,
        resident_b,
        resident_c,
    )
    relation_state[4] = columns
    driver_state[6] += copied
    driver_state[7] = columns
    driver_state[2] += 1
    if append_attempt_state[0] == 3 and accept_acceptance_state[0] == 2:
        driver_state[3] = columns
    need = rows - current_h - current_b
    unit_defect = places - 1 - (current_columns - current_h - current_b)
    if unit_defect > 0:
        need += unit_defect
        if need > rows:
            need = rows
    # `Buchall_param`: the first dimension-ready transition resets the failed
    # small-norm counter and replaces the permissive initial limit before A/R
    # extraction.  This must happen after publishing the random append, since
    # that append is what first closes the missing row for this field.
    if need == 0 and outer_state[14] == 0:
        outer_state[3] = 0
        outer_state[4] = rows // 32
        if outer_state[4] < 10:
            outer_state[4] = 10
        outer_state[14] = 1
    squash_index = int(control_state[2])
    search_count, squash_index = _pari_prepare_relation_search(
        permutation,
        rows,
        current_h,
        need,
        squash_index,
        search_ideals,
        outer_permutation,
    )
    if append_attempt_state[0] == 2:
        action = 3
    else:
        outer_state[14] = 1
        if action == 4 or action == 5:
            outer_state[15] = 1
            need = int(accept_multiple_state[1])
        else:
            outer_state[15] = 0
            if action == 3:
                need = int(accept_multiple_state[1])
    control_state[0] = need
    control_state[1] = search_count
    control_state[2] = squash_index
    control_state[3] = current_h
    control_state[4] = current_b
    control_state[5] = current_columns
    trace_offset = 5 * (driver_state[2] - 1)
    driver_trace[trace_offset] = columns
    driver_trace[trace_offset + 1] = action
    driver_trace[trace_offset + 2] = outer_state[12]
    driver_trace[trace_offset + 3] = outer_state[3]
    driver_trace[trace_offset + 4] = outer_state[4]
    return action


__all__ = ["pari_publish_random_outer_append"]
