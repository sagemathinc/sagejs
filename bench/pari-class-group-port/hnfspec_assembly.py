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

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .hnflll import pari_hnflll


@native
def pari_hnfspec_assembly(
    rows: int,
    k0: int,
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
) -> int:
    """Return rank frontier -1/-2 unchanged, or 0 for this exact stage only.

    Negative frontiers leave ALL owners untouched, even output state. A
    successful result supplies column-major matbnew/dep/B/H/U. H keeps initial
    zero columns, as ZM_hnflll(remove=0), BEFORE hnffinal's H column slicing.

    State: matbnew rows, dep rows, live columns, B rows, B columns, HNF called.
    Empty-column matrices have absent row extent, reported as zero. Preserve
    source nr=lnz in rank_state on that branch. It skips HNF and leaves U,
    lambda, D and hnf_state untouched, as hnffinal's col==0 return does.
    Shape/capacity/profile errors reject before any owner mutation.
    """
    if len(rank_state) < 10:
        raise ValueError("short assembly rank state")
    status = rank_state[9]
    if status == -1 or status == -2:
        return status
    if status != 0:
        raise ValueError("invalid assembly rank status")
    if len(sparse_state) < 13 or len(cleanup_state) < 10 or len(state) < 6:
        raise ValueError("short assembly state")
    if rows < 0 or k0 < 0 or k0 > rows:
        raise ValueError("invalid assembly dimensions")
    retained = sparse_state[0] - 1
    lig = sparse_state[1]
    col = sparse_state[2]
    lk0 = sparse_state[3]
    nlze = cleanup_state[1]
    lnz = cleanup_state[2]
    nr = rank_state[7]
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
    profile_count = lnz - 1
    genuine = lnz - 1 - nr
    dependent = nlze + nr
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
    stride = rows - k0
    if len(bottom) < stride * retained or len(updated_dense) < k0 * retained:
        raise ValueError("short assembly cleanup matrix")
    if len(extra) < (lnz - 1) * col:
        raise ValueError("short assembly extra matrix")
    if len(matbnew) < genuine * col or len(dep) < dependent * col:
        raise ValueError("short assembly block workspace")
    if len(b) < lig * (retained - col) or len(h) < genuine * col:
        raise ValueError("short assembly result workspace")
    if col != 0 and (
        len(u) < col * col
        or len(lam) < col * col
        or len(d) < col + 1
        or len(hnf_state) < 11
    ):
        raise ValueError("short assembly HNF workspace")
    for i in range(rows):
        if perm[i] < 1 or perm[i] > rows:
            raise ValueError("invalid assembly row permutation")
        for j in range(i):
            if perm[i] == perm[j]:
                raise ValueError("invalid assembly row permutation")
    for i in range(profile_count):
        if profile[i] < 1 or profile[i] > profile_count:
            raise ValueError("invalid assembly rank permutation")
        if col == 0 and profile[i] != i + 1:
            raise ValueError("invalid empty assembly rank permutation")
        for j in range(i):
            if profile[i] == profile[j]:
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
    for i in range(lnz - 1):
        perm_work[i] = perm[nlze + profile[i] - 1]
    for i in range(lnz - 1):
        perm[nlze + i] = perm_work[i]
    for j in range(col):
        for i in range(nlze):
            dep[j * dependent + i] = 0
        for i in range(nr):
            dep[j * dependent + nlze + i] = extra[j * (lnz - 1) + profile[i] - 1]
        for i in range(nr, lnz - 1):
            matbnew[j * genuine + i - nr] = extra[j * (lnz - 1) + profile[i] - 1]
    for j in range(col, retained):
        for i in range(nlze):
            b[(j - col) * lig + i] = bottom[j * stride + i]
        for k in range(lnz - 1):
            i = profile[k]
            if i <= k0:
                b[(j - col) * lig + nlze + k] = updated_dense[j * k0 + i - 1]
            else:
                b[(j - col) * lig + nlze + k] = bottom[j * stride + i + nlze - k0 - 1]
    called = 0
    if col != 0:
        pari_hnflll(matbnew, genuine, col, h, u, lam, d, hnf_state)
        called = 1
    state[0] = genuine
    state[1] = dependent
    state[2] = col
    state[3] = 0
    if retained != col:
        state[3] = lig
    state[4] = retained - col
    state[5] = called
    return 0
