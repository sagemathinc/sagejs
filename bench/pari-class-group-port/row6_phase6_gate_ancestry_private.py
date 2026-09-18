"""Private reverse ancestry for the genuine resident row-6 HNF schedule."""

from sagejs.native import Int64Buffer, IntegerBuffer, integer_buffer_view, native


@native
def _row6_reverse_hnffinal(
    output: IntegerBuffer,
    rows: int,
    dependent_rows: int,
    columns: int,
    tail: int,
    full_h: IntegerBuffer,
    full_dep: IntegerBuffer,
    trailing: IntegerBuffer,
    transform: IntegerBuffer,
    diagonal: Int64Buffer,
    work: IntegerBuffer,
    result: IntegerBuffer,
    trailing_work: IntegerBuffer,
) -> int:
    """Reverse one literal `hnffinal` stage for one selected column."""
    lig = rows + dependent_rows
    zero_columns = columns - rows
    for i in range(columns):
        work[i] = 0
    for i in range(columns + tail):
        result[i] = 0
    for i in range(lig * tail):
        trailing_work[i] = trailing[i]
    for column in range(zero_columns):
        work[column] = output[column]
    removed = 0
    for row in range(rows):
        if diagonal[row] != 0:
            removed += 1
    new_columns = columns - removed
    unit = 0
    nonunit = 0
    for row in range(rows):
        if diagonal[row] != 0:
            destination = new_columns + unit
            unit += 1
        else:
            destination = zero_columns + nonunit
            nonunit += 1
        work[zero_columns + row] = work[zero_columns + row] + output[destination]
    for row_offset in range(rows):
        row = rows - 1 - row_offset
        h = full_h[(zero_columns + row) * rows + row]
        for column in range(tail):
            at = column * lig + dependent_rows + row
            quotient = trailing_work[at]
            if diagonal[row] == 0:
                quotient = quotient // h
            if quotient != 0:
                for k in range(dependent_rows):
                    trailing_work[column * lig + k] = (
                        trailing_work[column * lig + k]
                        - quotient * full_dep[(zero_columns + row) * dependent_rows + k]
                    )
                for k in range(rows):
                    trailing_work[column * lig + dependent_rows + k] = (
                        trailing_work[column * lig + dependent_rows + k]
                        - quotient * full_h[(zero_columns + row) * rows + k]
                    )
                work[zero_columns + row] = (
                    work[zero_columns + row] - quotient * output[columns + column]
                )
    for column in range(columns):
        coefficient = work[column]
        if coefficient != 0:
            for source in range(columns):
                value = transform[column * columns + source]
                if value != 0:
                    result[source] = result[source] + value * coefficient
    for column in range(tail):
        result[columns + column] = output[columns + column]
    return 0


@native
def pari_row6_phase6_gate_ancestry_private(
    relations: IntegerBuffer,
    raw_logs: IntegerBuffer,
    initial_assembly: Int64Buffer,
    initial_cleanup_transform: IntegerBuffer,
    initial_trailing: IntegerBuffer,
    initial_transform: IntegerBuffer,
    initial_full_h: IntegerBuffer,
    initial_full_dep: IntegerBuffer,
    initial_diagonal: Int64Buffer,
    append1_rank_state: IntegerBuffer,
    append1_trailing: IntegerBuffer,
    append1_transform: IntegerBuffer,
    append1_full_h: IntegerBuffer,
    append1_full_dep: IntegerBuffer,
    append1_diagonal: Int64Buffer,
    append1_perm: Int64Buffer,
    append2_rank_state: IntegerBuffer,
    append2_trailing: IntegerBuffer,
    append2_transform: IntegerBuffer,
    append2_full_h: IntegerBuffer,
    append2_full_dep: IntegerBuffer,
    append2_diagonal: Int64Buffer,
    append2_perm: Int64Buffer,
    terminal_c: IntegerBuffer,
    terminal_perm: Int64Buffer,
    current: IntegerBuffer,
    old: IntegerBuffer,
    joined: IntegerBuffer,
    work: IntegerBuffer,
    trailing_work: IntegerBuffer,
    raw_to_all: IntegerBuffer,
    accepted_arch: IntegerBuffer,
    accepted_signs: Int64Buffer,
    phase_pi: IntegerBuffer,
    active_rows: Int64Buffer,
    state: Int64Buffer,
) -> int:
    """Reverse the retained initial and two append HNFs without replay."""
    if len(raw_to_all) < 9 * 1137:
        raise ValueError("short row-6 ancestry output")
    for selected in range(9):
        for i in range(1137):
            current[i] = 0
            old[i] = 0
        current[selected] = 1
        output_offset = selected * 1137
        for i in range(1137):
            raw_to_all[output_offset + i] = 0

        # Reverse the 1,136 -> 1,137 append.
        redundant = int(append2_rank_state[7])
        local_rows = 3
        _row6_reverse_hnffinal(
            integer_buffer_view(current, 7, 1130),
            local_rows - redundant,
            redundant,
            3,
            1127,
            append2_full_h,
            append2_full_dep,
            append2_trailing,
            append2_transform,
            append2_diagonal,
            work,
            joined,
            trailing_work,
        )
        for column in range(7):
            old[column] = current[column]
        coefficient = joined[0]
        raw_to_all[output_offset + 1136] = (
            raw_to_all[output_offset + 1136] + coefficient
        )
        for k in range(1127):
            old[9 + k] = (
                old[9 + k]
                - coefficient * relations[1136 * 1130 + int(append2_perm[3 + k]) - 1]
            )
        for column in range(1129):
            old[7 + column] = old[7 + column] + joined[1 + column]
        for i in range(1136):
            current[i] = old[i]
            old[i] = 0

        # Reverse the 1,133 -> 1,136 append.
        redundant = int(append1_rank_state[7])
        local_rows = 6
        _row6_reverse_hnffinal(
            integer_buffer_view(current, 7, 1129),
            local_rows - redundant,
            redundant,
            5,
            1124,
            append1_full_h,
            append1_full_dep,
            append1_trailing,
            append1_transform,
            append1_diagonal,
            work,
            joined,
            trailing_work,
        )
        for column in range(7):
            old[column] = current[column]
        for column in range(3):
            coefficient = joined[column]
            raw_to_all[output_offset + 1133 + column] = (
                raw_to_all[output_offset + 1133 + column] + coefficient
            )
            for k in range(1124):
                old[9 + k] = (
                    old[9 + k]
                    - coefficient
                    * relations[(1133 + column) * 1130 + int(append1_perm[6 + k]) - 1]
                )
        for column in range(1126):
            old[7 + column] = old[7 + column] + joined[3 + column]
        for i in range(1133):
            current[i] = old[i]

        # Reverse the initial cleanup and hnffinal transformations.
        genuine = int(initial_assembly[0])
        dependent = int(initial_assembly[1])
        width = int(initial_assembly[2])
        tail = int(initial_assembly[4])
        _row6_reverse_hnffinal(
            integer_buffer_view(current, 0, 1133),
            genuine,
            dependent,
            width,
            tail,
            initial_full_h,
            initial_full_dep,
            initial_trailing,
            initial_transform,
            initial_diagonal,
            work,
            joined,
            trailing_work,
        )
        for column in range(1133):
            coefficient = joined[column]
            if coefficient != 0:
                for source in range(1133):
                    value = initial_cleanup_transform[column * 1133 + source]
                    if value != 0:
                        raw_to_all[output_offset + source] = (
                            raw_to_all[output_offset + source] + value * coefficient
                        )

    for i in range(147):
        accepted_arch[i] = terminal_c[i]
    phase_at = -1
    for column in range(1137):
        for place in range(3):
            if raw_logs[(column * 3 + place) * 7] == 2 and phase_at < 0:
                phase_at = (column * 3 + place) * 7
    if phase_at < 0:
        return 1
    phase_pi[0] = raw_logs[phase_at + 4]
    phase_pi[1] = raw_logs[phase_at + 5]
    phase_pi[2] = raw_logs[phase_at + 6]
    for kernel in range(7):
        for place in range(3):
            parity = 0
            for column in range(1137):
                if raw_logs[(column * 3 + place) * 7] == 2:
                    if raw_to_all[kernel * 1137 + column] % 2 != 0:
                        if parity == 0:
                            parity = 1
                        else:
                            parity = 0
            accepted_signs[kernel * 3 + place] = parity
            at = (kernel * 3 + place) * 7
            if parity != 0:
                accepted_arch[at] = 2
                accepted_arch[at + 4] = phase_pi[0]
                accepted_arch[at + 5] = phase_pi[1]
                accepted_arch[at + 6] = phase_pi[2]
            else:
                accepted_arch[at] = 1
                accepted_arch[at + 4] = 0
                accepted_arch[at + 5] = -1
                accepted_arch[at + 6] = 0
    active_rows[0] = terminal_perm[0] - 1
    active_rows[1] = terminal_perm[1] - 1
    state[0] = 9
    state[1] = 7
    state[2] = 2
    return 0


__all__ = ["pari_row6_phase6_gate_ancestry_private"]
