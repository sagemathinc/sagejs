"""Resumable diagnostic shell traversal using the existing admission loop."""


def _cubic_collect_expanded_shell_prefix(
    workspace: NativeIntegerVector,
    modular: UInt64Buffer,
    order: FmpzMatrix,
    transforms: FmpzMatrix,
    parameters: FmpzMatrix,
    expanded: FmpzMatrix,
    candidates: FmpzMatrix,
    elements: FmpzMatrix,
    source: FmpzMatrix,
    result: FmpzMatrix,
    online_basis: FmpzMatrix,
    online_source: FmpzMatrix,
    online_hnf: FmpzMatrix,
    support: FmpzMatrix,
    membership: FmpzMatrix,
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
    """Resume a separate shell; only its target and proposal budget may change.

    State columns are factor cursor, active flag, next x/y/z, and cumulative
    candidate count. Plans, permutation, and all discovery owners remain fixed.
    Zero budget is a no-op. Negative status is fatal and cannot be resumed.
    """
    if online_status < 0 or proposal_budget == 0:
        return relation_count, online_count, online_status
    cursor: uint64 = checked_uint64(state[0, 0])
    active: uint64 = checked_uint64(state[0, 1])
    x = state[0, 2]
    y = state[0, 3]
    z = state[0, 4]
    count: uint64 = checked_uint64(state[0, 5])
    while (
        cursor < factor_count
        and proposal_budget > 0
        and relation_count < target
        and online_status != 2
    ):
        index: uint64 = cursor
        if use_permutation:
            index = checked_uint64(order[factor_count - cursor - 1, 0] - 1)
        if index >= factor_count or active > 1:
            return relation_count, online_count, -1
        if active == 0:
            ready = _cubic_expansion_parameters(parameters, index, expanded)
            if ready < 0:
                return relation_count, online_count, -1
            if ready == 0:
                cursor += 1
                continue
            x = -expanded[0, 7]
            y = -expanded[0, 8]
            z = -expanded[0, 9]
            count = 0
            active = 1
        l0 = expanded[0, 7]
        l1 = expanded[0, 8]
        l2 = expanded[0, 9]
        width0 = 2 * l0 + 1
        width1 = 2 * l1 + 1
        before = ((z + l2) * width1 + y + l1) * width0 + x + l0
        relation_count, count, online_count, online_status, x, y, z = (
            _cubic_append_reduced_ideal_ellipsoid(
                workspace,
                modular,
                _POWER_OFFSET + index * _CUBIC_MAX_POWERS * 9,
                transforms,
                3 * index,
                expanded,
                0,
                candidates,
                elements,
                relation_count,
                relation_capacity,
                factor_count,
                group_count,
                target,
                source,
                result,
                True,
                True,
                online_basis,
                online_source,
                online_hnf,
                support,
                membership,
                online_count,
                online_status,
                x,
                y,
                z,
                count,
                proposal_budget,
                parameters[index, 6],
            )
        )
        if online_status < 0 or relation_count > relation_capacity:
            return relation_count, online_count, -1
        after = ((z + l2) * width1 + y + l1) * width0 + x + l0
        used = after - before
        if used < 0 or used > proposal_budget:
            return relation_count, online_count, -1
        proposal_budget -= checked_uint64(used)
        if z > l2:
            cursor += 1
            active = 0
    state[0, 0] = cursor
    state[0, 1] = active
    state[0, 2] = x
    state[0, 3] = y
    state[0, 4] = z
    state[0, 5] = count
    return relation_count, online_count, online_status
