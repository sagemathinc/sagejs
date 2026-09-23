"""PARI 2.17.4 `base2.c:get_LV` for matrix-form prime images.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Keep the prefix/suffix intersection schedule and NULL-as-whole-ring identity.
Kummer descriptor conversion through Fp_basis/pr_hnf remains external.
Packed copies replace shallow aliases but preserve original entries on those
identity branches; genuine intersections use the upstream word-prime path.
"""

from sagejs.native import IntegerBuffer, native
from .small_prime_matrix_intersection import (
    pari_small_prime_matrix_intersection,
    pari_small_prime_matrix_intersection_scratch_size,
)


@native
def _prime_complement_product(
    w: IntegerBuffer,
    x: int,
    nx: int,
    y: int,
    ny: int,
    n: int,
    prime: int,
    out: int,
    scratch: int,
) -> int:
    if nx == -1:
        for i in range(n * ny):
            w[out + i] = w[y + i]
        return ny
    if ny == -1:
        for i in range(n * nx):
            w[out + i] = w[x + i]
        return nx
    return pari_small_prime_matrix_intersection(w, x, nx, y, ny, n, prime, out, scratch)


@native
def pari_small_prime_complements(
    ideals: IntegerBuffer,
    ranks: IntegerBuffer,
    count: int,
    n: int,
    prime: int,
    workspace: IntegerBuffer,
    work_ranks: IntegerBuffer,
    complements: IntegerBuffer,
    complement_ranks: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Return count; publish source LV in corresponding ideal order.

    Caller supplies independent prime-ideal image bases, n=3 or4, prime p.
    Every owner is disjoint. Each ideal/complement occupies n² slots; only
    its rank*n entries are active. Workspace has L, A, B banks of n³ slots,
    one n² result slot, then intersection scratch. work_ranks has 2*n slots
    for A and B, where -1 represents source NULL. State is status (-1 during
    work), actual intersection calls, completed complement count. Shape errors
    precede writes; other exceptions leave explicit partial output and scratch.
    """
    if n < 3 or n > 5 or count < 1 or count > n or prime < 2 or prime > 3037000493:
        raise ValueError("small prime complements domain")
    size = n * n
    bank = n * size
    result = 3 * bank
    scratch = result + size
    if (
        len(ideals) < count * size
        or len(ranks) < count
        or len(workspace)
        < scratch + pari_small_prime_matrix_intersection_scratch_size(n)
        or len(work_ranks) < 2 * n
        or len(complements) < count * size
        or len(complement_ranks) < count
        or len(state) < 3
    ):
        raise ValueError("short prime complements storage")
    for i in range(count):
        if ranks[i] < 0 or ranks[i] >= n:
            raise ValueError("invalid prime image rank")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    if count == 1:
        for j in range(n):
            for i in range(n):
                value = 0
                if i == j:
                    value = 1
                complements[j * n + i] = value
        complement_ranks[0] = n
        state[2] = 1
        state[0] = 0
        return 1
    for j in range(count):
        for i in range(n * ranks[j]):
            workspace[j * size + i] = ideals[j * size + i]
    work_ranks[0] = -1
    for i in range(count - 1):
        if work_ranks[i] != -1:
            state[1] += 1
        work_ranks[i + 1] = _prime_complement_product(
            workspace,
            bank + i * size,
            work_ranks[i],
            i * size,
            ranks[i],
            n,
            prime,
            bank + (i + 1) * size,
            scratch,
        )
    work_ranks[n + count - 1] = -1
    for i in range(count - 1, 0, -1):
        if work_ranks[n + i] != -1:
            state[1] += 1
        work_ranks[n + i - 1] = _prime_complement_product(
            workspace,
            2 * bank + i * size,
            work_ranks[n + i],
            i * size,
            ranks[i],
            n,
            prime,
            2 * bank + (i - 1) * size,
            scratch,
        )
    for i in range(count):
        if work_ranks[i] != -1 and work_ranks[n + i] != -1:
            state[1] += 1
        rank = _prime_complement_product(
            workspace,
            bank + i * size,
            work_ranks[i],
            2 * bank + i * size,
            work_ranks[n + i],
            n,
            prime,
            result,
            scratch,
        )
        for j in range(n * rank):
            complements[i * size + j] = workspace[result + j]
        complement_ranks[i] = rank
        state[2] += 1
    state[0] = 0
    return count
