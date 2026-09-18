"""Reverse retained row-19 HNF owners to the saturated raw relation kernel.

PARI 2.17.4 algorithm, copyright (C) The PARI group; GPL-2.0-or-later.
"""

from typing import TypedDict

from sagejs.native import (
    Int64Buffer,
    IntegerBuffer,
    int64_workspace,
    integer_buffer_view,
    native,
    uint64,
)

from .field3_unit_transform_retention import _pari_reverse_hnffinal_selection
from .row19_production_contracts import pari_row19_dense_reverse_selection


class Row19KernelManifest(TypedDict):
    factor_count: uint64
    first_columns: uint64
    relation_count: uint64
    kernel_rank: uint64


@native
def pari_row19_phase6_resident_kernel_private(
    manifest: Row19KernelManifest,
    relation_records: IntegerBuffer,
    first_cleanup_transform: IntegerBuffer,
    first_transform: IntegerBuffer,
    first_full_h: IntegerBuffer,
    first_full_dep: IntegerBuffer,
    first_trailing: IntegerBuffer,
    first_diagonal: Int64Buffer,
    terminal_transform: IntegerBuffer,
    terminal_full_h: IntegerBuffer,
    terminal_full_dep: IntegerBuffer,
    terminal_trailing: IntegerBuffer,
    terminal_diagonal: Int64Buffer,
    terminal_permutation: Int64Buffer,
    terminal_result_h: IntegerBuffer,
    workspace: IntegerBuffer,
    kernel_output: IntegerBuffer,
    presentation_output: IntegerBuffer,
    state_output: Int64Buffer,
) -> int:
    """Reverse the same-run first and append transforms without recomputation."""
    rows = 424
    first_columns = 423
    columns = 430
    kernel_targets = 6
    presentation_targets = 9
    targets = 15
    if (
        manifest["factor_count"] != rows
        or manifest["first_columns"] != first_columns
        or manifest["relation_count"] != columns
        or manifest["kernel_rank"] != kernel_targets
        or len(relation_records) < rows * columns
        or len(first_cleanup_transform) < first_columns * first_columns
        or len(first_transform) < 84 * 84
        or len(first_full_h) < 78 * 84
        or len(first_full_dep) < 7 * 84
        or len(first_trailing) < 85 * 339
        or len(first_diagonal) < 78
        or len(terminal_transform) < 16 * 16
        or len(terminal_full_h) < 16 * 16
        or len(terminal_full_dep) < 0
        or len(terminal_trailing) < 16 * 408
        or len(terminal_diagonal) < 16
        or len(terminal_permutation) < rows
        or len(terminal_result_h) < 81
        or len(workspace) < 89475
        or len(kernel_output) < columns * kernel_targets
        or len(presentation_output) < columns * presentation_targets
        or len(state_output) < 12
    ):
        raise ValueError("unsupported row-19 resident kernel boundary")

    selected: IntegerBuffer = integer_buffer_view(workspace, 0, 6450)
    previous: IntegerBuffer = integer_buffer_view(workspace, 6450, 6345)
    work: IntegerBuffer = integer_buffer_view(workspace, 12795, 6360)
    bwork: IntegerBuffer = integer_buffer_view(workspace, 19155, 28815)
    cleaned: IntegerBuffer = integer_buffer_view(workspace, 47970, 6345)
    initial_work: IntegerBuffer = integer_buffer_view(workspace, 54315, 6345)
    initial_bwork: IntegerBuffer = integer_buffer_view(workspace, 60660, 28815)
    reverse_state: Int64Buffer = int64_workspace(12)
    for i in range(columns * targets):
        selected[i] = 0
    for i in range(columns * kernel_targets):
        kernel_output[i] = 0
    for i in range(columns * presentation_targets):
        presentation_output[i] = 0
    for target in range(targets):
        # The six carried zero columns are the terminal kernel coordinates.
        selected[target * columns + target] = 1

    # Reverse the terminal append.  Its input consists of the seven new raw
    # columns, the old 9-column H block, and the old 408-column B tail.
    for target in range(targets):
        selected_base = target * columns
        previous_base = target * first_columns
        work_base = target * 424
        for column in range(6):
            previous[previous_base + column] = selected[selected_base + column]
        for column in range(424):
            work[work_base + column] = selected[selected_base + 6 + column]
    status = _pari_reverse_hnffinal_selection(
        work,
        424,
        targets,
        16,
        0,
        16,
        408,
        terminal_transform,
        0,
        terminal_full_h,
        0,
        terminal_full_dep,
        0,
        terminal_trailing,
        0,
        terminal_diagonal,
        0,
        selected,
        bwork,
    )
    if status != 0:
        return status
    for target in range(targets):
        previous_base = target * first_columns
        work_base = target * 424
        for column in range(9):
            previous[previous_base + 6 + column] = work[work_base + 7 + column]
        for column in range(408):
            previous[previous_base + 15 + column] = work[work_base + 16 + column]
        for appended in range(7):
            coefficient = work[work_base + appended]
            if target < kernel_targets:
                kernel_output[target * columns + first_columns + appended] = coefficient
            else:
                presentation_output[
                    (target - kernel_targets) * columns + first_columns + appended
                ] = coefficient
            if coefficient == 0:
                continue
            for tail in range(408):
                physical = terminal_permutation[16 + tail] - 1
                previous[previous_base + 15 + tail] -= (
                    relation_records[(first_columns + appended) * rows + physical]
                    * coefficient
                )

    # Reverse the authentic first hnffinal: 78 genuine rows, seven dependent
    # rows, 84 active columns and 339 trailing columns.
    status = _pari_reverse_hnffinal_selection(
        previous,
        first_columns,
        targets,
        78,
        7,
        84,
        339,
        first_transform,
        0,
        first_full_h,
        0,
        first_full_dep,
        0,
        first_trailing,
        0,
        first_diagonal,
        0,
        initial_work,
        initial_bwork,
    )
    if status != 0:
        return status
    status = pari_row19_dense_reverse_selection(
        first_cleanup_transform,
        previous,
        first_columns,
        targets,
        cleaned,
    )
    if status != 0:
        return status
    for target in range(targets):
        for source in range(first_columns):
            value = cleaned[target * first_columns + source]
            if target < kernel_targets:
                kernel_output[target * columns + source] = value
            else:
                presentation_output[(target - kernel_targets) * columns + source] = (
                    value
                )

    # This replay is the publication boundary: no transform is accepted merely
    # because its shape agrees with the retained HNF schedule.
    nonzero = 0
    maximum_bits = 0
    for target in range(targets):
        for row in range(rows):
            physical = row
            if target >= kernel_targets:
                physical = terminal_permutation[row] - 1
                if physical < 0 or physical >= rows:
                    raise ValueError("invalid terminal permutation")
            value = 0
            for source in range(columns):
                coefficient = 0
                if target < kernel_targets:
                    coefficient = kernel_output[target * columns + source]
                else:
                    coefficient = presentation_output[
                        (target - kernel_targets) * columns + source
                    ]
                value += relation_records[source * rows + physical] * coefficient
            if target < kernel_targets:
                if value != 0:
                    state_output[0] = 1
                    state_output[1] = target
                    state_output[2] = row
                    return 1
            else:
                presentation_column = target - kernel_targets
                expected = 0
                if row < 9:
                    expected = terminal_result_h[presentation_column * 9 + row]
                if value != expected:
                    state_output[0] = 2
                    state_output[1] = presentation_column
                    state_output[2] = row
                    return 2
        if target < kernel_targets:
            for source in range(columns):
                value = kernel_output[target * columns + source]
                if value != 0:
                    nonzero += 1
                    absolute = value
                    if absolute < 0:
                        absolute = -absolute
                    bits = 0
                    while absolute != 0:
                        absolute //= 2
                        bits += 1
                    if bits > maximum_bits:
                        maximum_bits = bits
    for i in range(12):
        reverse_state[i] = 0
        state_output[i] = 0
    state_output[0] = 0
    state_output[1] = rows
    state_output[2] = columns
    state_output[3] = kernel_targets
    state_output[4] = nonzero
    state_output[5] = maximum_bits
    state_output[6] = 78
    state_output[7] = 7
    state_output[8] = 84
    state_output[9] = 339
    state_output[10] = 16
    state_output[11] = 408
    return 0


__all__ = ["pari_row19_phase6_resident_kernel_private"]
