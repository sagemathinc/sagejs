"""Experimental first-pass volume search with retained per-ideal visits."""


def _cubic_collect_initial_volume_prefix(
    search: CubicSearchWorkspace,
    modular_workspace: UInt64Buffer,
    adjacent_embedding_source: FmpzMatrix,
    adjacent_embedding_reduced: FmpzMatrix,
    adjacent_embedding_transform: FmpzMatrix,
    output: IntegerBuffer,
    basis_zero_zero: int,
    basis_zero_one: int,
    basis_zero_two: int,
    basis_one_one: int,
    basis_one_two: int,
    basis_two_two: int,
    adjacent_real_root: int,
    adjacent_complex_real_root: int,
    adjacent_complex_imaginary_root: int,
    analytic_scale: int,
    factor_count: uint64,
    group_count: uint64,
    relation_effort: uint64,
    bounded_relation_collection: bool,
    use_pari_permutation: bool,
    streaming_relation_collection: bool,
    online_relation_quotient_enabled: bool,
    relation_collection_target: uint64,
    relation_capacity: uint64,
    relation_count: uint64,
    online_relation_count: uint64,
    online_relation_status: int,
    adjacent_planned_count: uint64,
    adjacent_enumerated_count: uint64,
    adjacent_factor_cursor: uint64,
    adjacent_phase: uint64,
    adjacent_direction: uint64,
    ellipsoid_zero: int,
    ellipsoid_one: int,
    ellipsoid_two: int,
    ellipsoid_count: uint64,
    proposal_budget: uint64,
) -> tuple[
    uint64, uint64, int, uint64, uint64, uint64, uint64, uint64, int, int, int, uint64
]:
    """Visit retained full volume regions, including before modular full rank.

    State header holds the ordered cursor. Each ideal row holds visit rows,
    phase (unprepared/active/exhausted), next x/y/z, and cumulative candidates.
    Local four-row quotas never replace the global full-rank checkpoint.
    """
    if (
        proposal_budget == 0
        or online_relation_status < 0
        or online_relation_status == 2
    ):
        return (
            relation_count,
            online_relation_count,
            online_relation_status,
            adjacent_planned_count,
            adjacent_enumerated_count,
            adjacent_factor_cursor,
            adjacent_phase,
            adjacent_direction,
            ellipsoid_zero,
            ellipsoid_one,
            ellipsoid_two,
            ellipsoid_count,
        )
    cursor: uint64 = checked_uint64(search.visits[0, 0])
    skipped: uint64 = 0
    while (
        proposal_budget > 0
        and online_relation_status >= 0
        and online_relation_status != 2
        and not _cubic_modular_relation_collection_complete(
            modular_workspace,
            relation_count,
            relation_collection_target,
            factor_count,
        )
    ):
        if factor_count == 0 or cursor >= factor_count:
            online_relation_status = -1
            break
        ordered = search.order[factor_count - cursor - 1, 0]
        if ordered < 1 or ordered > factor_count:
            online_relation_status = -1
            break
        index: uint64 = checked_uint64(ordered - 1)
        row: uint64 = index + 1
        phase: uint64 = checked_uint64(search.visits[row, 1])
        if phase > 2:
            online_relation_status = -1
            break
        if phase == 0:
            factor_base: uint64 = _FACTOR_OFFSET + _FACTOR_STRIDE * index
            if search.integers[factor_base + 9] <= 0:
                phase = 2
            else:
                adjacent_planned_count += 1
                output[62] = index
                output[63] = 34
                plan = _cubic_plan_adjacent_ideal(
                    search.integers,
                    adjacent_embedding_source,
                    adjacent_embedding_reduced,
                    adjacent_embedding_transform,
                    search.transforms,
                    search.parameters,
                    index,
                    basis_zero_zero,
                    basis_zero_one,
                    basis_zero_two,
                    basis_one_one,
                    basis_one_two,
                    basis_two_two,
                    adjacent_real_root,
                    adjacent_complex_real_root,
                    adjacent_complex_imaginary_root,
                    analytic_scale,
                    group_count,
                    relation_effort,
                    bounded_relation_collection,
                )
                if (
                    plan < 1
                    or _cubic_initial_volume_parameters(
                        search.parameters, index, search.parameters
                    )
                    != 1
                ):
                    online_relation_status = -1
                    break
                search.integers[factor_base + 9] = plan
                search.visits[row, 2] = -search.parameters[index, 7]
                search.visits[row, 3] = -search.parameters[index, 8]
                search.visits[row, 4] = -search.parameters[index, 9]
                phase = 1
            search.visits[row, 1] = phase
        if phase == 2:
            skipped += 1
            cursor = (cursor + 1) % factor_count
            search.visits[0, 0] = cursor
            if skipped == factor_count:
                break
            continue
        skipped = 0
        visit_rows: uint64 = checked_uint64(search.visits[row, 0])
        if visit_rows >= 4:
            online_relation_status = -1
            break
        visit_limit: uint64 = relation_count + 4 - visit_rows
        x = search.visits[row, 2]
        y = search.visits[row, 3]
        z = search.visits[row, 4]
        count: uint64 = checked_uint64(search.visits[row, 5])
        l0 = search.parameters[index, 7]
        l1 = search.parameters[index, 8]
        l2 = search.parameters[index, 9]
        width0 = 2 * l0 + 1
        width1 = 2 * l1 + 1
        before = ((z + l2) * width1 + y + l1) * width0 + x + l0
        old_rows: uint64 = relation_count
        old_count: uint64 = count
        (
            relation_count,
            count,
            online_relation_count,
            online_relation_status,
            x,
            y,
            z,
        ) = _cubic_append_initial_volume_ellipsoid(
            search,
            modular_workspace,
            _POWER_OFFSET + index * _CUBIC_MAX_POWERS * 9,
            3 * index,
            search.parameters,
            index,
            relation_count,
            relation_capacity,
            factor_count,
            group_count,
            relation_collection_target,
            streaming_relation_collection,
            online_relation_quotient_enabled,
            online_relation_count,
            online_relation_status,
            x,
            y,
            z,
            count,
            proposal_budget,
            0,
            visit_limit,
        )
        if (
            online_relation_status < 0
            or relation_count > relation_capacity
            or relation_count < old_rows
            or count < old_count
        ):
            online_relation_status = -1
            break
        after = ((z + l2) * width1 + y + l1) * width0 + x + l0
        used = after - before
        if used < 0 or used > proposal_budget:
            online_relation_status = -1
            break
        if used == 0 and online_relation_status != 2 and z <= l2:
            online_relation_status = -1
            break
        proposal_budget -= checked_uint64(used)
        adjacent_enumerated_count += count - old_count
        visit_rows += relation_count - old_rows
        if visit_rows > 4:
            online_relation_status = -1
            break
        search.visits[row, 2] = x
        search.visits[row, 3] = y
        search.visits[row, 4] = z
        search.visits[row, 5] = count
        if z > l2 or visit_rows == 4:
            if z > l2:
                search.visits[row, 1] = 2
            visit_rows = 0
            cursor = (cursor + 1) % factor_count
            search.visits[0, 0] = cursor
        search.visits[row, 0] = visit_rows
        ellipsoid_zero = x
        ellipsoid_one = y
        ellipsoid_two = z
        ellipsoid_count = count
    adjacent_phase = 1
    adjacent_direction = 0
    return (
        relation_count,
        online_relation_count,
        online_relation_status,
        adjacent_planned_count,
        adjacent_enumerated_count,
        cursor,
        adjacent_phase,
        adjacent_direction,
        ellipsoid_zero,
        ellipsoid_one,
        ellipsoid_two,
        ellipsoid_count,
    )
