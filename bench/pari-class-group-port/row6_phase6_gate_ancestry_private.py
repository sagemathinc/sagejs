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
    factor_count: int,
    initial_columns: int,
    checkpoint_count: int,
    places: int,
    initial_state: Int64Buffer,
    initial_assembly: Int64Buffer,
    initial_cleanup_transform: IntegerBuffer,
    initial_trailing: IntegerBuffer,
    initial_transform: IntegerBuffer,
    initial_full_h: IntegerBuffer,
    initial_full_dep: IntegerBuffer,
    initial_diagonal: Int64Buffer,
    append1_rank_state: IntegerBuffer,
    append1_state: Int64Buffer,
    append1_trailing: IntegerBuffer,
    append1_transform: IntegerBuffer,
    append1_full_h: IntegerBuffer,
    append1_full_dep: IntegerBuffer,
    append1_diagonal: Int64Buffer,
    append1_perm: Int64Buffer,
    append2_rank_state: IntegerBuffer,
    append2_state: Int64Buffer,
    append2_trailing: IntegerBuffer,
    append2_transform: IntegerBuffer,
    append2_full_h: IntegerBuffer,
    append2_full_dep: IntegerBuffer,
    append2_diagonal: Int64Buffer,
    append2_perm: Int64Buffer,
    initial_c: IntegerBuffer,
    append1_c: IntegerBuffer,
    append2_c: IntegerBuffer,
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
    """Reverse the live retained HNF checkpoints without replay."""
    if checkpoint_count < 0 or checkpoint_count > 2 or factor_count < 1 or places < 1:
        raise ValueError("invalid row-6 ancestry dimensions")
    final_h_rows = int(initial_state[0])
    final_kernel_rows = int(initial_state[4])
    final_columns = initial_columns
    if checkpoint_count >= 1:
        final_h_rows = int(append1_state[0])
        final_kernel_rows = int(append1_state[4])
        final_columns = int(append1_state[7])
    if checkpoint_count >= 2:
        final_h_rows = int(append2_state[0])
        final_kernel_rows = int(append2_state[4])
        final_columns = int(append2_state[7])
    terminal_c = initial_c
    if checkpoint_count >= 1:
        terminal_c = append1_c
    if checkpoint_count >= 2:
        terminal_c = append2_c
    selected_rows = final_h_rows + final_kernel_rows
    if selected_rows < 1 or len(raw_to_all) < selected_rows * final_columns:
        raise ValueError("short row-6 ancestry output")
    for selected in range(selected_rows):
        current_columns = final_columns
        for i in range(final_columns):
            current[i] = 0
            old[i] = 0
        current[selected] = 1
        output_offset = selected * final_columns
        for i in range(final_columns):
            raw_to_all[output_offset + i] = 0

        # Reverse each retained append.  The state owners describe the exact
        # live shapes; backing-buffer capacity is not mathematical authority.
        for reverse_index in range(checkpoint_count):
            if reverse_index == 0 and checkpoint_count == 2:
                old_total = int(append1_state[7])
                old_h_rows = int(append1_state[0])
                old_b_columns = int(append1_state[2])
                rank_state = append2_rank_state
                full_h = append2_full_h
                full_dep = append2_full_dep
                trailing = append2_trailing
                transform = append2_transform
                diagonal = append2_diagonal
                permutation = append2_perm
            else:
                old_total = initial_columns
                old_h_rows = int(initial_state[0])
                old_b_columns = int(initial_state[2])
                rank_state = append1_rank_state
                full_h = append1_full_h
                full_dep = append1_full_dep
                trailing = append1_trailing
                transform = append1_transform
                diagonal = append1_diagonal
                permutation = append1_perm
            new_columns = current_columns - old_total
            zero_prefix = old_total - old_b_columns - old_h_rows
            lig = factor_count - old_b_columns
            width = new_columns + old_h_rows
            redundant = int(rank_state[7])
            _row6_reverse_hnffinal(
                integer_buffer_view(current, zero_prefix, width + old_b_columns),
                lig - redundant,
                redundant,
                width,
                old_b_columns,
                full_h,
                full_dep,
                trailing,
                transform,
                diagonal,
                work,
                joined,
                trailing_work,
            )
            for column in range(zero_prefix):
                old[column] = current[column]
            for column in range(new_columns):
                coefficient = joined[column]
                raw_to_all[output_offset + old_total + column] += coefficient
                for k in range(old_b_columns):
                    old[zero_prefix + old_h_rows + k] -= (
                        coefficient
                        * relations[
                            (old_total + column) * factor_count
                            + int(permutation[lig + k])
                            - 1
                        ]
                    )
            for column in range(old_h_rows + old_b_columns):
                old[zero_prefix + column] += joined[new_columns + column]
            current_columns = old_total
            for i in range(current_columns):
                current[i] = old[i]
                old[i] = 0

        # Reverse the initial cleanup and hnffinal transformations.
        genuine = int(initial_assembly[0])
        dependent = int(initial_assembly[1])
        width = int(initial_assembly[2])
        tail = int(initial_assembly[4])
        _row6_reverse_hnffinal(
            integer_buffer_view(current, 0, initial_columns),
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
        for column in range(initial_columns):
            coefficient = joined[column]
            if coefficient != 0:
                for source in range(initial_columns):
                    value = initial_cleanup_transform[column * initial_columns + source]
                    if value != 0:
                        raw_to_all[output_offset + source] = (
                            raw_to_all[output_offset + source] + value * coefficient
                        )

    final_columns = initial_columns
    if checkpoint_count >= 1:
        final_columns = int(append1_state[7])
    if checkpoint_count >= 2:
        final_columns = int(append2_state[7])
    for i in range(7 * places * final_kernel_rows):
        accepted_arch[i] = terminal_c[i]
    phase_at = -1
    for column in range(final_columns):
        for place in range(places):
            if raw_logs[(column * places + place) * 7] == 2 and phase_at < 0:
                phase_at = (column * places + place) * 7
    if phase_at < 0:
        return 1
    phase_pi[0] = raw_logs[phase_at + 4]
    phase_pi[1] = raw_logs[phase_at + 5]
    phase_pi[2] = raw_logs[phase_at + 6]
    for kernel in range(final_kernel_rows):
        for place in range(places):
            parity = 0
            for column in range(final_columns):
                if raw_logs[(column * places + place) * 7] == 2:
                    if raw_to_all[kernel * final_columns + column] % 2 != 0:
                        if parity == 0:
                            parity = 1
                        else:
                            parity = 0
            accepted_signs[kernel * places + place] = parity
            at = (kernel * places + place) * 7
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
    for i in range(final_h_rows):
        active_rows[i] = terminal_perm[i] - 1
    state[0] = selected_rows
    state[1] = final_kernel_rows
    state[2] = final_h_rows
    return 0


__all__ = ["pari_row6_phase6_gate_ancestry_private"]
