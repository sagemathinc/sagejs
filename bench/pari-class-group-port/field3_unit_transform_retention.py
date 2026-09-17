"""Retain the exact field-3 raw-to-accepted relation ancestry.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

PARI's `hnfspec_i` and three subsequent `hnfadd_i` calls transform packed
logarithm columns without retaining a global square transformation.  This
leaf replays those same local column operations backwards from the thirteen
accepted terminal columns.  Its published owner is therefore only the
column-major `301 x 13` transform actually needed by unit reconstruction;
it never constructs a `301 x 301` matrix.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .log_matrix_transform import (
    pari_log_entry_product,
    pari_log_entry_sum,
    pari_log_matrix_transform,
    pari_validate_log_entries,
)


RAW_COLUMNS = 301
ACCEPTED_COLUMNS = 13
RELATION_ROWS = 288


@native
def pari_field3_validate_unit_relation_kernel(
    relation_records: Int64Buffer,
    transform: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Validate `relation_records * transform == 0` transactionally."""
    if (
        len(relation_records) < RELATION_ROWS * RAW_COLUMNS
        or len(transform) < RAW_COLUMNS * ACCEPTED_COLUMNS
        or len(state) < 5
    ):
        raise ValueError("short field3 unit-kernel owner")
    for column in range(ACCEPTED_COLUMNS):
        for row in range(RELATION_ROWS):
            value = 0
            for relation in range(RAW_COLUMNS):
                value += (
                    relation_records[relation * RELATION_ROWS + row]
                    * transform[column * RAW_COLUMNS + relation]
                )
            if value != 0:
                return 1
    state[0] = 0
    state[1] = RELATION_ROWS
    state[2] = RAW_COLUMNS
    state[3] = ACCEPTED_COLUMNS
    state[4] = RELATION_ROWS * ACCEPTED_COLUMNS
    return 0


@native
def _pari_reverse_hnffinal_selection(
    selected: IntegerBuffer,
    total_columns: int,
    targets: int,
    rows: int,
    dep_rows: int,
    width: int,
    tail: int,
    transform: IntegerBuffer,
    transform_offset: int,
    full_h: IntegerBuffer,
    full_h_offset: int,
    full_dep: IntegerBuffer,
    full_dep_offset: int,
    trailing: IntegerBuffer,
    trailing_offset: int,
    diagonal: Int64Buffer,
    diagonal_offset: int,
    work: IntegerBuffer,
    bwork: IntegerBuffer,
) -> int:
    """Pull target coefficients through one source `hnffinal` call."""
    if (
        targets < 1
        or rows < 0
        or dep_rows < 0
        or width < rows
        or tail < 0
        or total_columns != width + tail
    ):
        raise ValueError("invalid reverse hnffinal dimensions")
    lig = rows + dep_rows
    if (
        len(selected) < total_columns * targets
        or len(transform) < transform_offset + width * width
        or len(full_h) < full_h_offset + rows * width
        or len(full_dep) < full_dep_offset + dep_rows * width
        or len(trailing) < trailing_offset + lig * tail
        or len(diagonal) < diagonal_offset + rows
        or len(work) < total_columns * targets
        or len(bwork) < lig * tail
    ):
        raise ValueError("short reverse hnffinal owner")
    removed = 0
    for i in range(rows):
        value = diagonal[diagonal_offset + i]
        if value != 0 and value != 1:
            raise ValueError("invalid reverse hnffinal diagonal marker")
        removed += value
    zc = width - rows
    new_columns = width - removed
    for target in range(targets):
        base = target * total_columns
        for column in range(total_columns):
            work[base + column] = 0
        for column in range(zc):
            work[base + column] = selected[base + column]
        unit = 0
        nonunit = 0
        for row in range(rows):
            source = zc + row
            if diagonal[diagonal_offset + row] != 0:
                destination = new_columns + unit
                unit += 1
            else:
                destination = zc + nonunit
                nonunit += 1
            work[base + source] = selected[base + destination]
        for column in range(tail):
            work[base + width + column] = selected[base + width + column]

        # Recompute exactly the source quotient schedule for B reduction.  In
        # reverse mode each tail coefficient contributes -q to the pivot log.
        for i in range(lig * tail):
            bwork[i] = trailing[trailing_offset + i]
        for row in range(rows - 1, -1, -1):
            h = full_h[full_h_offset + (zc + row) * rows + row]
            if h == 0:
                raise ValueError("zero reverse hnffinal pivot")
            for column in range(tail):
                quotient = bwork[column * lig + dep_rows + row]
                if diagonal[diagonal_offset + row] == 0:
                    quotient //= h
                if quotient == 0:
                    continue
                work[base + zc + row] -= quotient * work[base + width + column]
                for i in range(dep_rows):
                    bwork[column * lig + i] -= (
                        quotient * full_dep[full_dep_offset + (zc + row) * dep_rows + i]
                    )
                for i in range(rows):
                    bwork[column * lig + dep_rows + i] -= (
                        quotient * full_h[full_h_offset + (zc + row) * rows + i]
                    )

        # `work` currently addresses C*U and the unchanged tail.  Pull C*U
        # through U without ever materializing a square global transform.
        for source in range(width):
            value = 0
            for column in range(width):
                value += (
                    transform[transform_offset + column * width + source]
                    * work[base + column]
                )
            selected[base + source] = value
        for column in range(tail):
            selected[base + width + column] = work[base + width + column]
    return 0


@native
def _pari_forward_hnffinal_logs(
    logs: IntegerBuffer,
    log_rows: int,
    rows: int,
    dep_rows: int,
    width: int,
    tail: int,
    transform: IntegerBuffer,
    transform_offset: int,
    full_h: IntegerBuffer,
    full_h_offset: int,
    full_dep: IntegerBuffer,
    full_dep_offset: int,
    trailing: IntegerBuffer,
    trailing_offset: int,
    diagonal: Int64Buffer,
    diagonal_offset: int,
    transformed: IntegerBuffer,
    bwork: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Replay exactly the packed-log portion of source `hnffinal`."""
    total = width + tail
    lig = rows + dep_rows
    if (
        log_rows < 1
        or rows < 0
        or width < rows
        or len(logs) < 7 * log_rows * total
        or len(transformed) < 7 * log_rows * total
        or len(output) < 7 * log_rows * total
        or len(bwork) < lig * tail
    ):
        raise ValueError("short forward hnffinal packed owner")
    # This is the source `gmul(C,U)` accumulation with an explicit offset into
    # the compact concatenation of per-append U owners.  Calling the public
    # matrix helper here would silently address U at offset zero after stage 0.
    for column in range(width):
        for place in range(log_rows):
            source = place * 7
            coefficient = transform[transform_offset + column * width]
            k, rm, rp, re, im, ip, ie = pari_log_entry_product(
                coefficient,
                logs[source],
                logs[source + 1],
                logs[source + 2],
                logs[source + 3],
                logs[source + 4],
                logs[source + 5],
                logs[source + 6],
            )
            for inner in range(1, width):
                source = (inner * log_rows + place) * 7
                if (
                    logs[source] == 1
                    and logs[source + 1] == 0
                    and logs[source + 2] == -1
                ):
                    continue
                coefficient = transform[transform_offset + column * width + inner]
                bk, br, brp, bre, bi, bip, bie = pari_log_entry_product(
                    coefficient,
                    logs[source],
                    logs[source + 1],
                    logs[source + 2],
                    logs[source + 3],
                    logs[source + 4],
                    logs[source + 5],
                    logs[source + 6],
                )
                k, rm, rp, re, im, ip, ie = pari_log_entry_sum(
                    k,
                    rm,
                    rp,
                    re,
                    im,
                    ip,
                    ie,
                    bk,
                    br,
                    brp,
                    bre,
                    bi,
                    bip,
                    bie,
                )
            destination = (column * log_rows + place) * 7
            transformed[destination] = k
            transformed[destination + 1] = rm
            transformed[destination + 2] = rp
            transformed[destination + 3] = re
            transformed[destination + 4] = im
            transformed[destination + 5] = ip
            transformed[destination + 6] = ie
    for i in range(7 * log_rows * width, 7 * log_rows * total):
        transformed[i] = logs[i]
    for i in range(lig * tail):
        bwork[i] = trailing[trailing_offset + i]
    zc = width - rows
    removed = 0
    for row in range(rows - 1, -1, -1):
        marker = diagonal[diagonal_offset + row]
        if marker != 0 and marker != 1:
            raise ValueError("invalid forward hnffinal diagonal marker")
        removed += marker
        h = full_h[full_h_offset + (zc + row) * rows + row]
        for column in range(tail):
            quotient = bwork[column * lig + dep_rows + row]
            if marker == 0:
                quotient //= h
            if quotient == 0:
                continue
            for i in range(dep_rows):
                bwork[column * lig + i] -= (
                    quotient * full_dep[full_dep_offset + (zc + row) * dep_rows + i]
                )
            for i in range(rows):
                bwork[column * lig + dep_rows + i] -= (
                    quotient * full_h[full_h_offset + (zc + row) * rows + i]
                )
            for place in range(log_rows):
                src = ((zc + row) * log_rows + place) * 7
                dst = ((width + column) * log_rows + place) * 7
                bk, br, brp, bre, bi, bip, bie = pari_log_entry_product(
                    -quotient,
                    transformed[src],
                    transformed[src + 1],
                    transformed[src + 2],
                    transformed[src + 3],
                    transformed[src + 4],
                    transformed[src + 5],
                    transformed[src + 6],
                )
                ak, ar, arp, are, ai, aip, aie = pari_log_entry_sum(
                    transformed[dst],
                    transformed[dst + 1],
                    transformed[dst + 2],
                    transformed[dst + 3],
                    transformed[dst + 4],
                    transformed[dst + 5],
                    transformed[dst + 6],
                    bk,
                    br,
                    brp,
                    bre,
                    bi,
                    bip,
                    bie,
                )
                output[dst] = ak
                output[dst + 1] = ar
                output[dst + 2] = arp
                output[dst + 3] = are
                output[dst + 4] = ai
                output[dst + 5] = aip
                output[dst + 6] = aie
                for k in range(7):
                    transformed[dst + k] = output[dst + k]
    for i in range(7 * log_rows * total):
        output[i] = transformed[i]
    new_columns = width - removed
    unit = 0
    nonunit = 0
    for row in range(rows):
        if diagonal[diagonal_offset + row] != 0:
            destination = new_columns + unit
            unit += 1
        else:
            destination = zc + nonunit
            nonunit += 1
        source = zc + row
        for i in range(7 * log_rows):
            output[destination * 7 * log_rows + i] = transformed[
                source * 7 * log_rows + i
            ]
    return 0


@native
def _pari_reverse_hnfadd_selection(
    selected: IntegerBuffer,
    targets: int,
    old_columns: int,
    new_columns: int,
    old_h: int,
    old_b: int,
    rows: int,
    dep_rows: int,
    transform: IntegerBuffer,
    transform_offset: int,
    full_h: IntegerBuffer,
    full_h_offset: int,
    full_dep: IntegerBuffer,
    full_dep_offset: int,
    trailing: IntegerBuffer,
    trailing_offset: int,
    diagonal: Int64Buffer,
    diagonal_offset: int,
    permutation: Int64Buffer,
    permutation_offset: int,
    relation_rows: int,
    new_relations: Int64Buffer,
    relation_offset: int,
    previous: IntegerBuffer,
    work: IntegerBuffer,
    bwork: IntegerBuffer,
    raw_output: IntegerBuffer,
) -> int:
    """Reverse one `hnfadd_i`, publishing only its newly raw columns."""
    if (
        old_columns < old_h + old_b
        or new_columns < 1
        or relation_rows != rows + dep_rows + old_b
    ):
        raise ValueError("invalid reverse hnfadd dimensions")
    zero_prefix = old_columns - old_h - old_b
    width = new_columns + old_h
    subcolumns = width + old_b
    total = old_columns + new_columns
    if (
        len(selected) < total * targets
        or len(previous) < old_columns * targets
        or len(work) < subcolumns * targets
        or len(permutation) < permutation_offset + relation_rows
        or len(new_relations) < relation_offset + relation_rows * new_columns
        or len(raw_output) < RAW_COLUMNS * targets
    ):
        raise ValueError("short reverse hnfadd selection")
    for i in range(relation_rows):
        p = permutation[permutation_offset + i]
        if p < 1 or p > relation_rows:
            raise ValueError("invalid reverse hnfadd permutation")
        for j in range(i):
            if p == permutation[permutation_offset + j]:
                raise ValueError("duplicate reverse hnfadd permutation")
    for target in range(targets):
        selected_base = target * total
        previous_base = target * old_columns
        work_base = target * subcolumns
        for column in range(zero_prefix):
            previous[previous_base + column] = selected[selected_base + column]
        for column in range(subcolumns):
            work[work_base + column] = selected[selected_base + zero_prefix + column]
    _pari_reverse_hnffinal_selection(
        work,
        subcolumns,
        targets,
        rows,
        dep_rows,
        width,
        old_b,
        transform,
        transform_offset,
        full_h,
        full_h_offset,
        full_dep,
        full_dep_offset,
        trailing,
        trailing_offset,
        diagonal,
        diagonal_offset,
        selected,
        bwork,
    )
    for target in range(targets):
        previous_base = target * old_columns
        work_base = target * subcolumns
        for column in range(old_h):
            previous[previous_base + zero_prefix + column] = work[
                work_base + new_columns + column
            ]
        for column in range(old_b):
            previous[previous_base + zero_prefix + old_h + column] = work[
                work_base + new_columns + old_h + column
            ]
        for column in range(new_columns):
            coefficient = work[work_base + column]
            raw_output[target * RAW_COLUMNS + old_columns + column] = coefficient
            if coefficient == 0:
                continue
            for tail_column in range(old_b):
                row = (
                    permutation[permutation_offset + rows + dep_rows + tail_column] - 1
                )
                relation_coefficient = new_relations[
                    relation_offset + column * relation_rows + row
                ]
                if relation_coefficient != 0:
                    previous[previous_base + zero_prefix + old_h + tail_column] -= (
                        relation_coefficient * coefficient
                    )
    return 0


@native
def pari_field3_retain_unit_relation_transform(
    initial_cleanup_transform: IntegerBuffer,
    initial_transform: IntegerBuffer,
    initial_full_h: IntegerBuffer,
    initial_full_dep: IntegerBuffer,
    initial_trailing: IntegerBuffer,
    initial_diagonal: Int64Buffer,
    append_metadata: Int64Buffer,
    append_transform: IntegerBuffer,
    append_full_h: IntegerBuffer,
    append_full_dep: IntegerBuffer,
    append_trailing: IntegerBuffer,
    append_diagonal: Int64Buffer,
    append_permutations: Int64Buffer,
    append_relations: Int64Buffer,
    selected: IntegerBuffer,
    previous: IntegerBuffer,
    work: IntegerBuffer,
    bwork: IntegerBuffer,
    candidate: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Publish the same-run column-major `301 x 13` ancestry atomically.

    `append_metadata` contains three 16-word records:
    old/new/H/B/rows/dep plus offsets for each concatenated stage owner.
    The initial source shapes are fixed by the authenticated field-3 run:
    293 raw columns, 41 active columns, 32 genuine and 2 dependent rows,
    and 252 trailing columns.
    """
    targets = ACCEPTED_COLUMNS
    if (
        len(initial_cleanup_transform) < 293 * 293
        or len(initial_transform) < 41 * 41
        or len(initial_full_h) < 34 * 41
        or len(initial_full_dep) < 2 * 41
        or len(initial_trailing) < 36 * 252
        or len(initial_diagonal) < 34
        or len(append_metadata) < 3 * 16
        or len(selected) < RAW_COLUMNS * targets
        or len(previous) < RAW_COLUMNS * targets
        or len(work) < RAW_COLUMNS * targets
        or len(bwork) < 36 * 252
        or len(candidate) < RAW_COLUMNS * targets
        or len(output) < RAW_COLUMNS * targets
        or len(state) < 8
    ):
        raise ValueError("short field3 unit-transform owner")
    expected_old = 293
    for stage in range(3):
        at = stage * 16
        if append_metadata[at] != expected_old:
            raise ValueError("disconnected field3 append ancestry")
        expected_old += append_metadata[at + 1]
    if expected_old != RAW_COLUMNS:
        raise ValueError("incomplete field3 append ancestry")
    for i in range(RAW_COLUMNS * targets):
        candidate[i] = 0
        selected[i] = 0
        previous[i] = 0
        work[i] = 0
    for target in range(targets):
        selected[target * RAW_COLUMNS + target] = 1

    current = RAW_COLUMNS
    for stage in range(2, -1, -1):
        at = stage * 16
        old_columns = append_metadata[at]
        new_columns = append_metadata[at + 1]
        if current != old_columns + new_columns:
            raise ValueError("invalid field3 reverse stage order")
        _pari_reverse_hnfadd_selection(
            selected,
            targets,
            old_columns,
            new_columns,
            append_metadata[at + 2],
            append_metadata[at + 3],
            append_metadata[at + 4],
            append_metadata[at + 5],
            append_transform,
            append_metadata[at + 6],
            append_full_h,
            append_metadata[at + 7],
            append_full_dep,
            append_metadata[at + 8],
            append_trailing,
            append_metadata[at + 9],
            append_diagonal,
            append_metadata[at + 10],
            append_permutations,
            append_metadata[at + 11],
            append_metadata[at + 12],
            append_relations,
            append_metadata[at + 13],
            previous,
            work,
            bwork,
            candidate,
        )
        for target in range(targets):
            for column in range(old_columns):
                selected[target * old_columns + column] = previous[
                    target * old_columns + column
                ]
        current = old_columns

    # Reverse the initial hnffinal and then C <- C*T from sparse cleanup.
    _pari_reverse_hnffinal_selection(
        selected,
        293,
        targets,
        34,
        2,
        41,
        252,
        initial_transform,
        0,
        initial_full_h,
        0,
        initial_full_dep,
        0,
        initial_trailing,
        0,
        initial_diagonal,
        0,
        work,
        bwork,
    )
    for target in range(targets):
        for raw in range(293):
            value = 0
            for cleaned in range(293):
                value += (
                    initial_cleanup_transform[cleaned * 293 + raw]
                    * selected[target * 293 + cleaned]
                )
            candidate[target * RAW_COLUMNS + raw] = value

    for i in range(RAW_COLUMNS * targets):
        output[i] = candidate[i]
    state[0] = 0
    state[1] = RAW_COLUMNS
    state[2] = targets
    state[3] = 293
    state[4] = 3
    state[5] = RAW_COLUMNS * targets
    state[6] = 0
    state[7] = 0
    return 0


@native
def pari_field3_replay_packed_unit_logs(
    raw_logs: IntegerBuffer,
    raw_relations: Int64Buffer,
    initial_cleanup_transform: IntegerBuffer,
    initial_transform: IntegerBuffer,
    initial_full_h: IntegerBuffer,
    initial_full_dep: IntegerBuffer,
    initial_trailing: IntegerBuffer,
    initial_diagonal: Int64Buffer,
    append_metadata: Int64Buffer,
    append_transform: IntegerBuffer,
    append_full_h: IntegerBuffer,
    append_full_dep: IntegerBuffer,
    append_trailing: IntegerBuffer,
    append_diagonal: Int64Buffer,
    append_permutations: Int64Buffer,
    append_relations: Int64Buffer,
    accepted_checkpoints: IntegerBuffer,
    terminal_accepted: IntegerBuffer,
    current: IntegerBuffer,
    joined: IntegerBuffer,
    transformed: IntegerBuffer,
    next_logs: IntegerBuffer,
    bwork: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Replay the exact staged packed-log schedule and bind terminal `A`.

    This deliberately does not flatten the computation to one `raw_logs*T`
    sum: packed PARI reals round after each local operation, so reassociation
    is not bit-identical.  The same local transforms that produce the retained
    integer ancestry are replayed in original source order.
    """
    log_rows = 3
    log_stride = 7 * log_rows
    capacity = RAW_COLUMNS * log_stride
    if (
        len(raw_logs) < capacity
        or len(raw_relations) < RELATION_ROWS * RAW_COLUMNS
        or len(terminal_accepted) < ACCEPTED_COLUMNS * log_stride
        or len(accepted_checkpoints)
        < (293 + 295 + 296 + 301 + 2 * (288 + 289 + 293)) * log_stride
        or len(current) < capacity
        or len(joined) < capacity
        or len(transformed) < capacity
        or len(next_logs) < capacity
        or len(bwork) < 36 * 252
        or len(output) < ACCEPTED_COLUMNS * log_stride
        or len(state) < 8
    ):
        raise ValueError("short field3 packed replay owner")
    pari_validate_log_entries(raw_logs, log_rows * RAW_COLUMNS)
    pari_log_matrix_transform(
        raw_logs,
        initial_cleanup_transform,
        log_rows,
        293,
        293,
        False,
        current,
    )
    _pari_forward_hnffinal_logs(
        current,
        log_rows,
        34,
        2,
        41,
        252,
        initial_transform,
        0,
        initial_full_h,
        0,
        initial_full_dep,
        0,
        initial_trailing,
        0,
        initial_diagonal,
        0,
        transformed,
        bwork,
        next_logs,
    )
    for i in range(293 * log_stride):
        current[i] = next_logs[i]
    checkpoint_offset = 0
    for i in range(293 * log_stride):
        if current[i] != accepted_checkpoints[checkpoint_offset + i]:
            return 1000 + i + 2
    checkpoint_offset += 293 * log_stride
    joined_checkpoint_offset = (293 + 295 + 296 + 301) * log_stride
    work_checkpoint_offset = joined_checkpoint_offset + (288 + 289 + 293) * log_stride
    current_columns = 293
    for stage in range(3):
        at = stage * 16
        old_columns = append_metadata[at]
        new_columns = append_metadata[at + 1]
        old_h = append_metadata[at + 2]
        old_b = append_metadata[at + 3]
        rows = append_metadata[at + 4]
        dep_rows = append_metadata[at + 5]
        if current_columns != old_columns or old_columns < old_h + old_b:
            raise ValueError("disconnected field3 packed replay")
        zero_prefix = old_columns - old_h - old_b
        width = new_columns + old_h
        subcolumns = width + old_b
        permutation_offset = append_metadata[at + 11]
        relation_offset = append_metadata[at + 13]
        for column in range(new_columns):
            for place in range(log_rows):
                present = 0
                ak, ar, arp, are, ai, aip, aie = 1, 0, -1, 0, 0, -1, 0
                for k in range(old_b):
                    row = (
                        append_permutations[permutation_offset + rows + dep_rows + k]
                        - 1
                    )
                    coefficient = append_relations[
                        relation_offset + column * RELATION_ROWS + row
                    ]
                    if coefficient == 0:
                        continue
                    source = ((zero_prefix + old_h + k) * log_rows + place) * 7
                    if present == 0 or (coefficient != 1 and coefficient != -1):
                        bk, br, brp, bre, bi, bip, bie = pari_log_entry_product(
                            coefficient,
                            current[source],
                            current[source + 1],
                            current[source + 2],
                            current[source + 3],
                            current[source + 4],
                            current[source + 5],
                            current[source + 6],
                        )
                    else:
                        bk, br, brp, bre = (
                            current[source],
                            current[source + 1],
                            current[source + 2],
                            current[source + 3],
                        )
                        bi, bip, bie = (
                            current[source + 4],
                            current[source + 5],
                            current[source + 6],
                        )
                        if coefficient == -1:
                            br = -br
                            bi = -bi
                    if present == 0:
                        ak, ar, arp, are, ai, aip, aie = (
                            bk,
                            br,
                            brp,
                            bre,
                            bi,
                            bip,
                            bie,
                        )
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
                raw = ((old_columns + column) * log_rows + place) * 7
                k, rm, rp, re, im, ip, ie = pari_log_entry_sum(
                    raw_logs[raw],
                    raw_logs[raw + 1],
                    raw_logs[raw + 2],
                    raw_logs[raw + 3],
                    raw_logs[raw + 4],
                    raw_logs[raw + 5],
                    raw_logs[raw + 6],
                    ak,
                    -ar,
                    arp,
                    are,
                    -ai,
                    aip,
                    aie,
                )
                destination = (column * log_rows + place) * 7
                joined[destination] = k
                joined[destination + 1] = rm
                joined[destination + 2] = rp
                joined[destination + 3] = re
                joined[destination + 4] = im
                joined[destination + 5] = ip
                joined[destination + 6] = ie
        for column in range(old_h + old_b):
            for i in range(log_stride):
                joined[(new_columns + column) * log_stride + i] = current[
                    (zero_prefix + column) * log_stride + i
                ]
        for i in range(subcolumns * log_stride):
            if joined[i] != accepted_checkpoints[joined_checkpoint_offset + i]:
                return (stage + 6) * 1000 + i + 2
        joined_checkpoint_offset += subcolumns * log_stride
        _pari_forward_hnffinal_logs(
            joined,
            log_rows,
            rows,
            dep_rows,
            width,
            old_b,
            append_transform,
            append_metadata[at + 6],
            append_full_h,
            append_metadata[at + 7],
            append_full_dep,
            append_metadata[at + 8],
            append_trailing,
            append_metadata[at + 9],
            append_diagonal,
            append_metadata[at + 10],
            transformed,
            bwork,
            next_logs,
        )
        for i in range(subcolumns * log_stride):
            if transformed[i] != accepted_checkpoints[work_checkpoint_offset + i]:
                return (stage + 10) * 1000 + i + 2
        work_checkpoint_offset += subcolumns * log_stride
        for i in range(zero_prefix * log_stride):
            transformed[i] = current[i]
        for i in range(subcolumns * log_stride):
            transformed[zero_prefix * log_stride + i] = next_logs[i]
        current_columns = old_columns + new_columns
        for i in range(current_columns * log_stride):
            current[i] = transformed[i]
        for i in range(current_columns * log_stride):
            if current[i] != accepted_checkpoints[checkpoint_offset + i]:
                return (stage + 2) * 1000 + i + 2
        checkpoint_offset += current_columns * log_stride
    if current_columns != RAW_COLUMNS:
        raise ValueError("incomplete field3 packed replay")
    for i in range(ACCEPTED_COLUMNS * log_stride):
        if current[i] != terminal_accepted[i]:
            return 5000 + i + 2
    for i in range(ACCEPTED_COLUMNS * log_stride):
        output[i] = current[i]
    state[0] = 0
    state[1] = RAW_COLUMNS
    state[2] = ACCEPTED_COLUMNS
    state[3] = ACCEPTED_COLUMNS * log_stride
    state[4] = 4
    state[5] = 0
    state[6] = 0
    state[7] = 0
    return 0


__all__ = [
    "pari_field3_retain_unit_relation_transform",
    "pari_field3_validate_unit_relation_kernel",
    "pari_field3_replay_packed_unit_logs",
]
