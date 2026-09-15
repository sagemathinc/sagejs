"""PARI 2.17.4 `base2.c:uniformizer`, prepared embedding-norm branch.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Preserve inverse-image selection, centered products, scalar adjustment,
ramification short circuit and ordered fallback columns. Norm preparation
and prime descriptors remain outside this entry. Packed owners replace GEN
allocation; diagnostic traces record only candidates actually norm-tested.
"""

from sagejs.native import IntegerBuffer, native
from .small_prime_matrix_invimage import (
    pari_small_prime_matrix_invimage,
    pari_small_prime_matrix_invimage_workspace_size,
)
from .prime_embedding_norm import pari_prepared_prime_embedding_norm
from .integral_frobenius import pari_integral_basis_multiply


@native
def _prime_center(value: int, prime: int) -> int:
    # Source remii truncates, retaining a negative half-modulus tie.
    residue = abs(value) % prime
    if value < 0:
        residue = -residue
    half = prime // 2
    if residue > half:
        residue -= prime
    elif residue < -half:
        residue += prime
    return residue


@native
def _uniformizer_test(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    candidate: IntegerBuffer,
    values_m: IntegerBuffer,
    values_p: IntegerBuffer,
    values_e: IntegerBuffer,
    n: int,
    r1: int,
    q: int,
    trace: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    at = state[1] * (n + 3)
    for i in range(n):
        trace[at + i] = candidate[i]
    norm, error = pari_prepared_prime_embedding_norm(
        matrix_m, matrix_p, matrix_e, candidate, values_m, values_p, values_e, n, r1
    )
    accepted = 0
    if norm % q != 0:
        accepted = 1
    trace[at + n] = norm
    trace[at + n + 1] = error
    trace[at + n + 2] = accepted
    state[1] += 1
    return accepted


@native
def pari_prepared_prime_uniformizer(
    table: IntegerBuffer,
    ideal: IntegerBuffer,
    complement: IntegerBuffer,
    n: int,
    rank: int,
    complement_rank: int,
    prime: int,
    ramified: int,
    r1: int,
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    workspace: IntegerBuffer,
    u: IntegerBuffer,
    candidate: IntegerBuffer,
    column: IntegerBuffer,
    values_m: IntegerBuffer,
    values_p: IntegerBuffer,
    values_e: IntegerBuffer,
    output: IntegerBuffer,
    trace: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Publish uniformizer; return0, or raise with status-1 partial scratch.

    Disjoint owners. P/V are independent valid prime/complement image bases;
    n=3/4, noninert P, and caller-selected init_norm embedding branch. State
    [status, norm tests, branch] uses branch1 initial,2 scalar-shift,3 column.
    Output is untouched on error. Trace capacity (rank+2)*(n+3) records all
    norm-tested candidates, including exact norm/error and divisibility result.
    Work owns concat(2*n²), rhs(n), inverse coefficients(2*n), multiplication
    matrix(n²), then inverse-image scratch. All storage guards precede writes.
    """
    if (
        n < 3
        or n > 4
        or rank < 1
        or rank >= n
        or complement_rank < 0
        or complement_rank > n
    ):
        raise ValueError("prime uniformizer dimension frontier")
    if prime < 2 or prime > 3037000493 or (ramified != 0 and ramified != 1):
        raise ValueError("prime uniformizer prime/ramification frontier")
    if r1 < 1 or r1 > n or (n - r1) % 2 != 0:
        raise ValueError("prime uniformizer signature frontier")
    size = n * n
    columns = rank + complement_rank
    rhs = 2 * size
    solution = rhs + n
    multiplication = solution + 2 * n
    scratch = multiplication + size
    required = pari_small_prime_matrix_invimage_workspace_size(n, columns)
    if (
        len(table) < n * size
        or len(ideal) < n * rank
        or len(complement) < n * complement_rank
        or len(matrix_m) < size
        or len(matrix_p) < size
        or len(matrix_e) < size
        or len(workspace) < scratch + required
        or len(u) < n
        or len(candidate) < n
        or len(column) < n
        or len(values_m) < n
        or len(values_p) < n
        or len(values_e) < n
        or len(output) < n
        or len(trace) < (rank + 2) * (n + 3)
        or len(state) < 3
    ):
        raise ValueError("short prime uniformizer storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    f = n - rank
    # Literal exponents map source powiu to the supported bigint primitive;
    # backend instruction-count parity is not asserted.
    if f == 1:
        q = prime**2
    elif f == 2:
        q = prime**3
    else:
        q = prime**4
    for i in range(n * rank):
        workspace[i] = ideal[i]
    for i in range(n * complement_rank):
        workspace[n * rank + i] = complement[i]
    for i in range(n):
        workspace[rhs + i] = 0
    workspace[rhs] = 1
    if (
        pari_small_prime_matrix_invimage(
            workspace, 0, n, columns, prime, rhs, solution, scratch
        )
        != 0
    ):
        raise ValueError("prime uniformizer inverse image missing")
    for i in range(n):
        total = ideal[i] * workspace[solution]
        for j in range(1, rank):
            term = ideal[j * n + i] * workspace[solution + j]
            if term != 0:
                total += term
        u[i] = _prime_center(total, prime)
    accepted = _uniformizer_test(
        matrix_m,
        matrix_p,
        matrix_e,
        u,
        values_m,
        values_p,
        values_e,
        n,
        r1,
        q,
        trace,
        state,
    )
    if accepted:
        state[2] = 1
    else:
        if u[0] <= 0:
            u[0] += prime
        else:
            u[0] -= prime
        if ramified == 0:
            accepted = 1
        else:
            accepted = _uniformizer_test(
                matrix_m,
                matrix_p,
                matrix_e,
                u,
                values_m,
                values_p,
                values_e,
                n,
                r1,
                q,
                trace,
                state,
            )
        if accepted:
            state[2] = 2
    if accepted:
        for i in range(n):
            output[i] = u[i]
        state[0] = 0
        return 0
    for i in range(n):
        candidate[i] = -u[i]
    candidate[0] += 1
    for i in range(n):
        workspace[multiplication + i] = candidate[i]
    for j in range(1, n):
        pari_integral_basis_multiply(table, candidate, n, j + 1, column)
        for i in range(n):
            workspace[multiplication + j * n + i] = column[i]
    for j in range(rank):
        for i in range(n):
            total = workspace[multiplication + i] * ideal[j * n]
            for k in range(1, n):
                term = workspace[multiplication + k * n + i] * ideal[j * n + k]
                if term != 0:
                    total += term
            candidate[i] = _prime_center(u[i] + total, prime)
        if _uniformizer_test(
            matrix_m,
            matrix_p,
            matrix_e,
            candidate,
            values_m,
            values_p,
            values_e,
            n,
            r1,
            q,
            trace,
            state,
        ):
            for i in range(n):
                output[i] = candidate[i]
            state[2] = 3
            state[0] = 0
            return 0
    raise ValueError("idealprimedec prime error")
