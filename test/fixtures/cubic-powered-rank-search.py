"""Frozen research rank-search helper, before admission/visit separation.

Extracted from composed source SHA-256
7774843b367034cf4a76764f140fcb5797136ec1c4ee6f68e038aaa0c44c495c.
Tests execute the actual helper with modeled exact owners and enumeration.
"""


def _cubic_resume_powered_rank_search(
    layout: CubicStorageLayout,
    search: CubicSearchWorkspace,
    modular_workspace: UInt64Buffer,
    embedding_source: FmpzMatrix,
    embedding_reduced: FmpzMatrix,
    embedding_transform: FmpzMatrix,
    factor_count: uint64,
    group_count: uint64,
    relation_count: uint64,
    relation_capacity: uint64,
    online_relation_count: uint64,
    online_relation_status: int,
    proposal_budget: uint64,
    basis_zero_zero: int,
    basis_zero_one: int,
    basis_zero_two: int,
    basis_one_one: int,
    basis_one_two: int,
    basis_two_two: int,
    real_root: int,
    complex_real_root: int,
    complex_imaginary_root: int,
    scale: int,
    quotient_mode: bool,
) -> tuple[uint64, uint64, int]:
    """Borrow resident state for missing-pivot powered discovery only.

    The caller first establishes exact rank insufficiency. Modular nonpivots
    choose target prime ideals; they do not certify missing rational rank.
    Use one bounded multiplier and the unchanged exact principal-ideal checker.
    Retain a global dependent-row allowance, candidate and work bounds.
    Exhaustion is inconclusive. Only the original proof may publish a result.
    """
    if (
        factor_count < 1
        or factor_count > layout.factors
        or online_relation_count != relation_count
        or online_relation_status < 0
        or modular_workspace[layout.modular_rank] > factor_count
        or (quotient_mode and modular_workspace[layout.modular_rank] != factor_count)
        or relation_count >= relation_capacity
    ):
        return relation_count, online_relation_count, -1
    phase: uint64 = checked_uint64(search.visits[0, 0])
    power_offset: uint64 = layout.compound
    product_offset: uint64 = power_offset + 9
    if phase == 0:
        multiplier: uint64 = factor_count
        minimum_norm = 0
        maximum_norm = 0
        i: uint64 = 0
        while i < factor_count:
            norm = _cubic_factor_norm(search.integers, i)
            if norm < 2:
                return relation_count, online_relation_count, -1
            if norm > maximum_norm:
                maximum_norm = norm
            if (
                search.integers[_FACTOR_OFFSET + _FACTOR_STRIDE * i + 8] == 0
                and i >= search.visits[0, 10]
            ):
                if multiplier == factor_count or norm < minimum_norm:
                    multiplier = i
                    minimum_norm = norm
            i += 1
        if multiplier == factor_count:
            search.visits[0, 0] = 3
            return relation_count, online_relation_count, online_relation_status
        target_norm = maximum_norm * maximum_norm
        exponent: uint64 = 1
        power_norm = minimum_norm
        while power_norm <= target_norm // minimum_norm and exponent < 24:
            power_norm *= minimum_norm
            exponent += 1
        if power_norm <= target_norm // minimum_norm:
            search.visits[0, 0] = 3
            return relation_count, online_relation_count, online_relation_status
        if not _cubic_prime_ideal_power_basis(
            layout,
            search.integers,
            multiplier,
            exponent,
            power_offset,
            search.hnf_source,
            search.hnf_result,
        ):
            return relation_count, online_relation_count, -1
        search.visits[0, 1] = multiplier
        search.visits[0, 2] = factor_count
        search.visits[0, 7] = proposal_budget
        phase = 1
        search.visits[0, 0] = phase
    if phase > 3:
        return relation_count, online_relation_count, -1
    while (
        phase != 3
        and search.visits[0, 7] > 0
        and (quotient_mode or modular_workspace[layout.modular_rank] < factor_count)
    ):
        if phase == 1:
            cursor: uint64 = checked_uint64(search.visits[0, 2])
            if cursor > factor_count:
                return relation_count, online_relation_count, -1
            target: uint64 = factor_count
            # Modular nonpivots select discovery directions, not proof claims.
            while cursor > 0:
                cursor -= 1
                eligible = modular_workspace[cursor * layout.factors + cursor] == 0
                if quotient_mode:
                    eligible = search.online_basis[cursor, cursor] > 1
                if eligible:
                    target = cursor
                    break
            search.visits[0, 2] = cursor
            if target == factor_count:
                phase = 3
                search.visits[0, 0] = phase
                break
            if not _cubic_compound_prime_ideal_basis(
                layout,
                search.integers,
                power_offset,
                target,
                product_offset,
                search.hnf_source,
                search.hnf_result,
            ):
                return relation_count, online_relation_count, -1
            if not _cubic_fill_ideal_t2_embedding(
                embedding_source,
                search.integers,
                product_offset,
                basis_zero_zero,
                basis_zero_one,
                basis_zero_two,
                basis_one_one,
                basis_one_two,
                basis_two_two,
                real_root,
                complex_real_root,
                complex_imaginary_root,
                scale,
            ) or not fmpz_matrix_lll_transform(
                embedding_reduced,
                embedding_transform,
                embedding_source,
            ):
                return relation_count, online_relation_count, -1
            row: uint64 = 0
            while row < 3:
                column: uint64 = 0
                while column < 3:
                    search.transforms[row, column] = embedding_transform[row, column]
                    column += 1
                row += 1
            search.visits[0, 8] = search.visits[0, 8] + 1
            if not _cubic_prepare_reduced_ideal_ellipsoid(
                search.integers,
                product_offset,
                embedding_reduced,
                search.transforms,
                0,
                search.parameters,
                0,
                True,
            ):
                if search.parameters[0, 10] == 2 and (
                    search.parameters[0, 7] > _CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE
                    or search.parameters[0, 8]
                    > _CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE
                    or search.parameters[0, 9]
                    > _CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE
                ):
                    continue
                return relation_count, online_relation_count, -1
            prepared = _cubic_initial_volume_parameters(
                search.parameters, 0, search.parameters
            )
            if prepared == 2:
                continue
            if prepared != 1:
                return relation_count, online_relation_count, -1
            search.visits[0, 3] = -search.parameters[0, 7]
            search.visits[0, 4] = -search.parameters[0, 8]
            search.visits[0, 5] = -search.parameters[0, 9]
            search.visits[0, 6] = 0
            phase = 2
            search.visits[0, 0] = phase
        x = search.visits[0, 3]
        y = search.visits[0, 4]
        z = search.visits[0, 5]
        count: uint64 = checked_uint64(search.visits[0, 6])
        old_count: uint64 = count
        old_rows: uint64 = relation_count
        l0 = search.parameters[0, 7]
        l1 = search.parameters[0, 8]
        l2 = search.parameters[0, 9]
        width0 = 2 * l0 + 1
        width1 = 2 * l1 + 1
        before = ((z + l2) * width1 + y + l1) * width0 + x + l0
        remaining: uint64 = checked_uint64(search.visits[0, 7])
        call_budget: uint64 = remaining
        # A batch ends at four admitted rows or the first exact support change.
        # Virtual slots include cheaply skipped empty ellipsoid regions: a tiny
        # slot cap need not give the original target any actual candidate.
        limit: uint64 = factor_count + 6
        if quotient_mode:
            limit = relation_count + 4
        if limit > relation_capacity:
            limit = relation_capacity
        (
            relation_count,
            count,
            online_relation_count,
            online_relation_status,
            x,
            y,
            z,
            used,
        ) = _cubic_append_initial_volume_ellipsoid(
            layout,
            search,
            modular_workspace,
            product_offset,
            0,
            search.parameters,
            0,
            relation_count,
            relation_capacity,
            factor_count,
            group_count,
            limit,
            True,
            True,
            online_relation_count,
            online_relation_status,
            x,
            y,
            z,
            count,
            call_budget,
            0,
            limit,
            True,
        )
        if (
            online_relation_status < 0
            or relation_count < old_rows
            or relation_count > relation_capacity
            or online_relation_count != relation_count
            or count < old_count
            or used < 0
            or used > call_budget
            or (used == 0 and online_relation_status != 2 and z <= l2)
        ):
            return relation_count, online_relation_count, -1
        search.visits[0, 3] = x
        search.visits[0, 4] = y
        search.visits[0, 5] = z
        search.visits[0, 6] = count
        search.visits[0, 7] = remaining - checked_uint64(used)
        search.visits[0, 9] = search.visits[0, 9] + count - old_count
        if z > l2 or count >= _CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES:
            phase = 1
            search.visits[0, 0] = phase
        if relation_count > old_rows or online_relation_status == 2:
            return relation_count, online_relation_count, online_relation_status
    return relation_count, online_relation_count, online_relation_status
