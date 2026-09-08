"""Private source-copy experiment; these helpers are not a production module.

The builder injects this ordinary Python into the existing closed native program.
Search bounds are scheduling only; accepted results still require exact closure.
"""


def _cubic_expansion_parameters(
    parameters: FmpzMatrix, row: uint64, expanded: FmpzMatrix
) -> int:
    """Prepare a new outer shell without mutating the original plan.

    Return 0 for an unprepared or already-large plan, 1 for a prepared shell,
    and -1 for a malformed positive plan or an exceeded coordinate bound.
    """
    old_bound = parameters[row, 6]
    if old_bound <= 0:
        return 0
    g00 = parameters[row, 0]
    g01 = parameters[row, 1]
    g02 = parameters[row, 2]
    g11 = parameters[row, 3]
    g12 = parameters[row, 4]
    g22 = parameters[row, 5]
    bound = 8 * g00
    if 2 * g11 > bound:
        bound = 2 * g11
    if bound <= old_bound:
        return 0
    c0 = g11 * g22 - g12 * g12
    c1 = g00 * g22 - g02 * g02
    c2 = g00 * g11 - g01 * g01
    determinant = (
        g00 * c0 - g01 * (g01 * g22 - g12 * g02) + g02 * (g01 * g12 - g11 * g02)
    )
    if determinant <= 0 or c0 <= 0 or c1 <= 0 or c2 <= 0:
        return -1
    l0 = _cubic_ceil_sqrt(_cubic_dyadic_ceiling_quotient(bound * c0, determinant))
    l1 = _cubic_ceil_sqrt(_cubic_dyadic_ceiling_quotient(bound * c1, determinant))
    l2 = _cubic_ceil_sqrt(_cubic_dyadic_ceiling_quotient(bound * c2, determinant))
    if (
        l0 > _CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE
        or l1 > _CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE
        or l2 > _CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE
    ):
        return -1
    column: uint64 = 0
    while column < 6:
        expanded[0, column] = parameters[row, column]
        column += 1
    expanded[0, 6] = bound
    expanded[0, 7] = l0
    expanded[0, 8] = l1
    expanded[0, 9] = l2
    expanded[0, 10] = 0
    return 1


def _cubic_collect_expanded_shell(
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
) -> tuple[uint64, uint64, int]:
    """Search only the new shell of already-prepared ideals in resident state.

    The old traversal cursor and all its plans remain unchanged. This is a
    distinct one-shot search phase, not resumption under changed parameters.
    It does not claim to finish the unexamined part of the old inner region.
    Candidate and coordinate guards apply separately to each new ellipsoid.
    """
    cursor: uint64 = 0
    while cursor < factor_count and relation_count < target and online_status != 2:
        index: uint64 = cursor
        if use_permutation:
            index = checked_uint64(order[factor_count - cursor - 1, 0] - 1)
        cursor += 1
        if index >= factor_count:
            return relation_count, online_count, -1
        ready = _cubic_expansion_parameters(parameters, index, expanded)
        if ready < 0:
            return relation_count, online_count, -1
        if ready == 0:
            continue
        old_bound = parameters[index, 6]
        l0 = expanded[0, 7]
        l1 = expanded[0, 8]
        l2 = expanded[0, 9]
        count: uint64 = 0
        z = -l2
        while z <= l2 and relation_count < target and online_status != 2:
            y = -l1
            while y <= l1 and relation_count < target and online_status != 2:
                x = -l0
                while x <= l0 and relation_count < target and online_status != 2:
                    length = (
                        expanded[0, 0] * x * x
                        + 2 * expanded[0, 1] * x * y
                        + 2 * expanded[0, 2] * x * z
                        + expanded[0, 3] * y * y
                        + 2 * expanded[0, 4] * y * z
                        + expanded[0, 5] * z * z
                    )
                    status = 0
                    a = 0
                    b = 0
                    c = 0
                    if length > old_bound:
                        status, a, b, c = _cubic_reduced_ellipsoid_candidate(
                            workspace,
                            _POWER_OFFSET + index * _CUBIC_MAX_POWERS * 9,
                            transforms,
                            3 * index,
                            expanded,
                            0,
                            x,
                            y,
                            z,
                        )
                    x += 1
                    if status != 1:
                        continue
                    count += 1
                    if count > _CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES:
                        return relation_count, online_count, -1
                    relation_count = _cubic_append_smooth_principal_relation(
                        workspace,
                        modular,
                        candidates,
                        elements,
                        relation_count,
                        relation_capacity,
                        factor_count,
                        group_count,
                        a,
                        b,
                        c,
                        source,
                        result,
                        True,
                        target,
                    )
                    if relation_count > relation_capacity:
                        return relation_count, online_count, -1
                    while online_count < relation_count and online_status != 2:
                        online_status = _cubic_online_relation_lattice_update(
                            online_basis,
                            online_source,
                            online_hnf,
                            support,
                            membership,
                            candidates,
                            online_count,
                            factor_count,
                        )
                        if online_status < 0:
                            return relation_count, online_count, -1
                        online_count += 1
                y += 1
            z += 1
    return relation_count, online_count, online_status
