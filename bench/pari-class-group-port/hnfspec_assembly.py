"""PARI 2.17.4 hnfspec_i: certified-rank permutation and exact assembly.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

Consume resident cleanup/rank owners, construct matbnew/dep/B literally, then
evaluate the independent ZM_hnflll dependency for full H/U. The intervening
C<-C*T, hnffinal's dependent-row/log transformations and deferred-column
hnfadd_i are NOT performed. This is not full source-order timing equivalence
or a completed class-group engine. No rank is invented at unresolved exits.

All owners must be disjoint except the intentionally updated input perm.
Exact elements use caller-provided limb capacity; arithmetic/allocation errors
can follow partial mutation. Added quadratic permutation/profile validation
is prototype boundary overhead, not upstream mathematical work. Scalar/index
arithmetic stays exact, not a claim of unboxed machine-word performance.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, checked_int64, int64, native

from .hnflll import pari_hnflll


@native
def pari_hnfspec_assemble_blocks(
    rows: int64,
    k0: int64,
    perm: Int64Buffer,
    sparse_state: Int64Buffer,
    cleanup_state: Int64Buffer,
    rank_state: IntegerBuffer,
    profile: IntegerBuffer,
    bottom: IntegerBuffer,
    updated_dense: IntegerBuffer,
    extra: IntegerBuffer,
    perm_work: Int64Buffer,
    matbnew: IntegerBuffer,
    dep: IntegerBuffer,
    b: IntegerBuffer,
    state: Int64Buffer,
) -> int64:
    """Return rank frontier -1/-2 unchanged, or 0 for this exact stage only.

    Negative frontiers leave ALL owners untouched, even output state. A
    successful result supplies column-major matbnew/dep/B only. No HNF runs;
    the connected source-order entry may now update C*T before hnffinal.

    State: matbnew rows, dep rows, live columns, B rows, B columns, HNF called.
    Empty-column matrices have absent row extent, reported as zero. Preserve
    source nr=lnz in rank_state on that branch. State[5] remains zero.
    Shape/capacity/profile errors reject before any owner mutation.
    """
    if len(rank_state) < 10:
        raise ValueError("short assembly rank state")
    status: int64 = checked_int64(rank_state[9])
    if status == -1 or status == -2:
        return status
    if status != 0:
        raise ValueError("invalid assembly rank status")
    if len(sparse_state) < 13 or len(cleanup_state) < 10 or len(state) < 6:
        raise ValueError("short assembly state")
    if rows < 0 or k0 < 0 or k0 > rows:
        raise ValueError("invalid assembly dimensions")
    retained: int64 = sparse_state[0] - 1
    lig: int64 = sparse_state[1]
    col: int64 = sparse_state[2]
    lk0: int64 = sparse_state[3]
    nlze: int64 = cleanup_state[1]
    lnz: int64 = cleanup_state[2]
    nr: int64 = checked_int64(rank_state[7])
    if retained < 0 or col < 0 or col > retained or lig < k0 or lig > rows:
        raise ValueError("invalid assembly live dimensions")
    if lk0 < k0 or lk0 > lig or nlze != lk0 - k0 or lnz != lig - nlze + 1:
        raise ValueError("inconsistent assembly row state")
    if (
        cleanup_state[0] != lig - k0
        or cleanup_state[3] != col
        or cleanup_state[4] != retained
        or cleanup_state[5] != sparse_state[4]
        or retained - col != rows - lig
    ):
        raise ValueError("inconsistent assembly cleanup state")
    live_rows: int64 = lnz - 1
    profile_count: int64 = live_rows
    genuine: int64 = live_rows - nr
    dependent: int64 = nlze + nr
    if col == 0:
        if nr != lnz:
            raise ValueError("invalid empty assembly rank state")
        profile_count = lnz
        genuine = 0
        dependent = 0
    elif nr < 0 or nr >= lnz or rank_state[2] != nr:
        raise ValueError("invalid assembly certified rank")
    if rank_state[8] != profile_count or len(profile) < profile_count:
        raise ValueError("short or inconsistent assembly rank profile")
    if len(perm) < rows or len(perm_work) < rows:
        raise ValueError("short assembly permutation workspace")
    stride: int64 = rows - k0
    if len(bottom) < stride * retained or len(updated_dense) < k0 * retained:
        raise ValueError("short assembly cleanup matrix")
    if len(extra) < (lnz - 1) * col:
        raise ValueError("short assembly extra matrix")
    if len(matbnew) < genuine * col or len(dep) < dependent * col:
        raise ValueError("short assembly block workspace")
    if len(b) < lig * (retained - col):
        raise ValueError("short assembly result workspace")
    i: int64 = 0
    j: int64 = 0
    k: int64 = 0
    profile_value: int64 = 0
    for i in range(rows):
        if perm[i] < 1 or perm[i] > rows:
            raise ValueError("invalid assembly row permutation")
        for j in range(i):
            if perm[i] == perm[j]:
                raise ValueError("invalid assembly row permutation")
    for i in range(profile_count):
        profile_value = checked_int64(profile[i])
        if profile_value < 1 or profile_value > profile_count:
            raise ValueError("invalid assembly rank permutation")
        if col == 0 and profile[i] != i + 1:
            raise ValueError("invalid empty assembly rank permutation")
        for j in range(i):
            if profile_value == checked_int64(profile[j]):
                raise ValueError("invalid assembly rank permutation")
    # hnfspec_i: move the nlze zero rows above the dense rows.
    if nlze != 0:
        for i in range(nlze):
            perm_work[i] = perm[i + k0]
        for i in range(nlze, lk0):
            perm_work[i] = perm[i - nlze]
        for i in range(lk0):
            perm[i] = perm_work[i]
    # Stable row selection according to actual certified permpro.
    for i in range(live_rows):
        perm_work[i] = perm[nlze + checked_int64(profile[i]) - 1]
    for i in range(live_rows):
        perm[nlze + i] = perm_work[i]
    for j in range(col):
        for i in range(nlze):
            dep[j * dependent + i] = 0
        for i in range(nr):
            dep[j * dependent + nlze + i] = extra[
                j * live_rows + checked_int64(profile[i]) - 1
            ]
        for i in range(nr, live_rows):
            matbnew[j * genuine + i - nr] = extra[
                j * live_rows + checked_int64(profile[i]) - 1
            ]
    for j in range(col, retained):
        for i in range(nlze):
            b[(j - col) * lig + i] = bottom[j * stride + i]
        for k in range(live_rows):
            i = checked_int64(profile[k])
            if i <= k0:
                b[(j - col) * lig + nlze + k] = updated_dense[j * k0 + i - 1]
            else:
                b[(j - col) * lig + nlze + k] = bottom[j * stride + i + nlze - k0 - 1]
    state[0] = genuine
    state[1] = dependent
    state[2] = col
    state[3] = 0
    if retained != col:
        state[3] = lig
    state[4] = retained - col
    state[5] = 0
    return 0


@native
def pari_hnfspec_assembly(
    rows: int64,
    k0: int64,
    perm: Int64Buffer,
    sparse_state: Int64Buffer,
    cleanup_state: Int64Buffer,
    rank_state: IntegerBuffer,
    profile: IntegerBuffer,
    bottom: IntegerBuffer,
    updated_dense: IntegerBuffer,
    extra: IntegerBuffer,
    perm_work: Int64Buffer,
    matbnew: IntegerBuffer,
    dep: IntegerBuffer,
    b: IntegerBuffer,
    h: IntegerBuffer,
    u: IntegerBuffer,
    lam: IntegerBuffer,
    d: IntegerBuffer,
    hnf_state: Int64Buffer,
    state: Int64Buffer,
) -> int64:
    """Diagnostic block assembly followed by independent HNFLLL H/U.

    Preserve the original diagnostic ABI and atomic malformed-workspace
    rejection. This entry omits C*T; use block-only assembly for source-order
    composition instead. H keeps initial zero columns (remove=0).
    """
    if len(rank_state) < 10:
        raise ValueError("short assembly rank state")
    if rank_state[9] == -1 or rank_state[9] == -2:
        return rank_state[9]
    if len(sparse_state) < 13 or len(cleanup_state) < 10:
        raise ValueError("short assembly state")
    col: int64 = sparse_state[2]
    genuine: int64 = cleanup_state[2] - 1 - checked_int64(rank_state[7])
    if col != 0 and (
        len(h) < genuine * col
        or len(u) < col * col
        or len(lam) < col * col
        or len(d) < col + 1
        or len(hnf_state) < 11
    ):
        raise ValueError("short assembly HNF workspace")
    status = pari_hnfspec_assemble_blocks(
        rows,
        k0,
        perm,
        sparse_state,
        cleanup_state,
        rank_state,
        profile,
        bottom,
        updated_dense,
        extra,
        perm_work,
        matbnew,
        dep,
        b,
        state,
    )
    if status != 0:
        return status
    if col != 0:
        pari_hnflll(matbnew, state[0], col, h, u, lam, d, hnf_state)
        state[5] = 1
    return 0
