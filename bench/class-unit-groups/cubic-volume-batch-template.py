"""Experimental recovery scheduler; not a production certificate policy.

Each prepared ideal retains its own exact region and cursor. Four newly
admitted rows end a visit, not the ideal's search. Certification checkpoints
can interrupt a visit without resetting its quota or geometric position.
"""


def _cubic_collect_expanded_shell_prefix(
    search: CubicSearchWorkspace,
    modular: UInt64Buffer,
    expanded: FmpzMatrix,
    factor_count: uint64,
    group_count: uint64,
    use_permutation: bool,
    relation_count: uint64,
    online_count: uint64,
    online_status: int,
    relation_capacity: uint64,
    target: uint64,
    state: FmpzMatrix,
    proposal_budget: uint64,
) -> tuple[uint64, uint64, int]:
    """Resume round-robin volume shells after full relation rank is known.

    Header [0,0] is the ordered ideal cursor. Row i+1 contains visit row count,
    phase (0 unprepared, 1 active, 2 exhausted), x/y/z, and candidate count.
    Only targets and budgets may change while these borrowed owners are live.
    """
    if online_status < 0 or online_status == 2 or proposal_budget == 0:
        return relation_count, online_count, online_status
    if factor_count == 0 or modular[_CUBIC_MODULAR_RANK_OFFSET] != factor_count:
        return relation_count, online_count, -1
    cursor: uint64 = checked_uint64(state[0, 0])
    skipped: uint64 = 0
    while proposal_budget > 0 and relation_count < target and online_status != 2:
        if cursor >= factor_count:
            return relation_count, online_count, -1
        index: uint64 = cursor
        if use_permutation:
            index = checked_uint64(search.order[factor_count - cursor - 1, 0] - 1)
        if index >= factor_count:
            return relation_count, online_count, -1
        row: uint64 = index + 1
        active: uint64 = checked_uint64(state[row, 1])
        if active > 2:
            return relation_count, online_count, -1
        if active == 0:
            ready = _cubic_expansion_parameters(search.parameters, index, expanded)
            if ready < 0:
                return relation_count, online_count, -1
            if ready == 0:
                active = 2
            else:
                active = 1
                state[row, 2] = -expanded[index, 7]
                state[row, 3] = -expanded[index, 8]
                state[row, 4] = -expanded[index, 9]
            state[row, 1] = active
        if active == 2:
            skipped += 1
            cursor = (cursor + 1) % factor_count
            state[0, 0] = cursor
            if skipped == factor_count:
                break
            continue
        skipped = 0
        visit_rows: uint64 = checked_uint64(state[row, 0])
        if visit_rows >= 4:
            return relation_count, online_count, -1
        visit_target: uint64 = relation_count + 4 - visit_rows
        if visit_target > target:
            visit_target = target
        x = state[row, 2]
        y = state[row, 3]
        z = state[row, 4]
        count: uint64 = checked_uint64(state[row, 5])
        l0 = expanded[index, 7]
        l1 = expanded[index, 8]
        l2 = expanded[index, 9]
        width0 = 2 * l0 + 1
        width1 = 2 * l1 + 1
        before = ((z + l2) * width1 + y + l1) * width0 + x + l0
        old_rows: uint64 = relation_count
        relation_count, count, online_count, online_status, x, y, z = (
            _cubic_append_volume_ideal_ellipsoid(
                search,
                modular,
                _POWER_OFFSET + index * _CUBIC_MAX_POWERS * 9,
                3 * index,
                expanded,
                index,
                relation_count,
                relation_capacity,
                factor_count,
                group_count,
                visit_target,
                True,
                True,
                online_count,
                online_status,
                x,
                y,
                z,
                count,
                proposal_budget,
                search.parameters[index, 6],
            )
        )
        if online_status < 0 or relation_count > relation_capacity:
            return relation_count, online_count, -1
        after = ((z + l2) * width1 + y + l1) * width0 + x + l0
        used = after - before
        if used < 0 or used > proposal_budget or relation_count < old_rows:
            return relation_count, online_count, -1
        if used == 0 and online_status != 2 and z <= l2:
            return relation_count, online_count, -1
        proposal_budget -= checked_uint64(used)
        visit_rows += relation_count - old_rows
        if visit_rows > 4:
            return relation_count, online_count, -1
        state[row, 2] = x
        state[row, 3] = y
        state[row, 4] = z
        state[row, 5] = count
        if z > l2 or visit_rows == 4:
            if z > l2:
                state[row, 1] = 2
            visit_rows = 0
            cursor = (cursor + 1) % factor_count
        state[row, 0] = visit_rows
        state[0, 0] = cursor
    return relation_count, online_count, online_status
