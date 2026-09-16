"""Outer `small_norm` scheduling from PARI 2.17.4 `buch2.c`.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

These are scheduling boundaries, not a class-group engine. The caller supplies
factor-base/minidx/permutation construction, `need` adjustment, pre-allocation,
linear algebra (`A`, `R`, `W`), and the actual `small_norm` call. The existing
`ideal_schedule.py` consumes the selected list backwards inside that call.
No ideal construction, relation discovery or linear algebra is done here.

Packed lists contain one-based ideal IDs without PARI's header. `basis` is the
whole column-major KC by KC resident cache basis (only its diagonal is
touched). IntegerBuffer storage matches the existing factor-base, relation
cache and inner ideal scheduler. Buffers must not alias. The list has KC
capacity and an explicit live length.

State slots are: need, Nrelid, done_small, small_fail, fail_limit, cache.last
(offset from base), cache.end (offset), cache.missing, F.sfb_chg, active, LIE,
saved last, selected j, live list length, bool(A), bool(R), lg(W)-1.
The last three entries describe supplied linear-algebra state, not computed
rank. Slots 9:13 are private suspension state, initially zero.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native


@native
def pari_trim_small_norm_list(
    ideals: IntegerBuffer,
    count: int,
    minidx: IntegerBuffer,
    kc: int,
    present: IntegerBuffer,
    out: IntegerBuffer,
) -> int:
    """Translate `trim_list`: first orbit representative in the first KC IDs.

    Return the live output length; trailing capacity is unchanged. Crucially,
    truncation happens before deduplication, not after it. `minidx` is supplied
    automorphism-orbit indexing, not inferred by sorting ideal identifiers.
    """
    if kc < 0 or count < 0 or count > len(ideals):
        raise ValueError("invalid trim list length")
    if len(minidx) < kc or len(present) < kc or len(out) < kc:
        raise ValueError("short trim list workspace")
    imax = count
    if imax > kc:
        imax = kc
    for i in range(imax):
        ideal = ideals[i]
        if ideal < 1 or ideal > kc:
            raise ValueError("invalid trim ideal ID")
        if minidx[ideal - 1] < 1 or minidx[ideal - 1] > kc:
            raise ValueError("invalid trim orbit ID")
    for i in range(kc):
        present[i] = 0
    j = 0
    for i in range(imax):
        k = minidx[ideals[i] - 1] - 1
        if present[k] == 0:
            out[j] = ideals[i]
            j += 1
            present[k] = 1
    return j


@native
def pari_begin_small_norm_outer(
    kc: int,
    ru: int,
    state: Int64Buffer,
    ideals: IntegerBuffer,
    perm: IntegerBuffer,
    multiplier: IntegerBuffer,
    basis: IntegerBuffer,
) -> int:
    """Enter the source if-block, returning 0 gated, 1 call, or 2 empty.

    Entry is after `need` adjustment, pre-allocation and `trim_list`. On 1,
    call `small_norm` with selected j and the live list. On 2, skip that call.
    Both 1 and 2 require `pari_finish_small_norm_outer`; status 0 does not.
    While suspended the collector may mutate cache last/end/missing and basis;
    the caller must preserve the other state, permutation and list storage.
    """
    if kc < 0 or ru < 0 or len(state) < 17:
        raise ValueError("invalid outer schedule dimensions")
    if len(ideals) < kc or len(perm) < kc or len(multiplier) < kc:
        raise ValueError("short outer schedule list")
    if len(basis) < kc * kc or state[13] < 0 or state[13] > kc:
        raise ValueError("invalid outer schedule storage")
    if state[9] != 0:
        raise ValueError("outer schedule already active")
    if state[2] < 0 or state[16] < 0 or state[16] > kc:
        raise ValueError("invalid outer schedule counters")
    for i in range(kc):
        if perm[i] < 1 or perm[i] > kc:
            raise ValueError("invalid outer permutation ID")
    for i in range(state[13]):
        if ideals[i] < 1 or ideals[i] > kc:
            raise ValueError("invalid outer ideal ID")
    if (
        state[0] <= 0
        or state[1] <= 0
        or (state[2] > kc + 1 and state[14] == 0)
        or state[3] > state[4]
        or state[5] >= 2 * kc + 2 * ru + 5
    ):
        return 0
    state[9] = 1
    state[10] = 0
    if state[15] != 0 and state[16] > 0 and state[2] % 2 != 0:
        state[10] = 1
    state[11] = state[5]
    if state[10] != 0:
        n = state[16]
        state[13] = n
        for i in range(n):
            ideals[i] = perm[i]
        state[6] = state[5] + n
        state[7] = n
        while n > 0:
            n -= 1
            p = perm[n] - 1
            basis[p * kc + p] = 0
    j = state[2] % (kc + 1)
    state[12] = j
    if j != 0 and state[14] == 0:
        mj = multiplier[j - 1]
        k = 0
        for i in range(state[13]):
            if ideals[i] > mj:
                multiplier[ideals[i] - 1] = j
                ideals[k] = ideals[i]
                k += 1
        state[13] = k
    if state[13] > 0:
        return 1
    return 2


@native
def pari_finish_small_norm_outer(
    kc: int,
    state: Int64Buffer,
    ideals: IntegerBuffer,
    perm: IntegerBuffer,
    basis: IntegerBuffer,
) -> int:
    """Resume immediately after `small_norm`, or after its empty-list skip.

    Restore the full permutation, not the trimmed list; reset selected pivots
    to ONE, not a snapshot. This follows the source's full-rank LIE premise.
    The cache end becomes its NEW last, even when no relation was collected.
    Supply ordinary successful collector completion only; unresolved collector
    exits must remain unresolved rather than being presented as success here.
    """
    if kc < 0 or len(state) < 17 or len(basis) < kc * kc:
        raise ValueError("invalid outer finish dimensions")
    if len(ideals) < kc or len(perm) < kc or state[9] != 1:
        raise ValueError("outer schedule is not active")
    if state[16] < 0 or state[16] > kc:
        raise ValueError("invalid outer finish rank")
    for i in range(kc):
        if perm[i] < 1 or perm[i] > kc:
            raise ValueError("invalid outer permutation ID")
    for i in range(kc):
        ideals[i] = perm[i]
    state[13] = kc
    if state[14] == 0 and state[5] != state[11]:
        state[3] = 0
    else:
        state[3] += 1
    if state[10] != 0:
        n = state[16]
        while n > 0:
            n -= 1
            p = perm[n] - 1
            basis[p * kc + p] = 1
        state[7] = 0
    state[6] = state[5]
    state[2] += 1
    state[0] = 0
    state[8] = 0
    state[9] = 0
    return 0
