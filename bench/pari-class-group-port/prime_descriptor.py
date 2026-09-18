"""PARI 2.17.4 `base2.c:get_pr`, noninert post-uniformizer suffix.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared integral multiplication table and selected uniformizer are inputs.
Keep first-dependence selection and the provisional e=0 valuation used by
PARI to discover ramification. This is not a complete prime decomposition.
"""

from sagejs.native import IntegerBuffer, native
from .integral_frobenius import pari_integral_basis_multiply
from .small_prime_matrix_kernel import pari_small_prime_matrix_dependence
from .valuation import pari_prepared_ideal_valuation
from .prime_uniformizer import pari_prepared_prime_uniformizer


@native
def pari_prepared_prime_descriptor_suffix(
    table: IntegerBuffer,
    u: IntegerBuffer,
    n: int,
    prime: int,
    ramified: int,
    workspace: IntegerBuffer,
    t: IntegerBuffer,
    column: IntegerBuffer,
    tau_work: IntegerBuffer,
    x: IntegerBuffer,
    y: IntegerBuffer,
    spare: IntegerBuffer,
    stack: IntegerBuffer,
    anti_output: IntegerBuffer,
    tau_output: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Publish antiuniformizer, column-major tau and [status, pivot, e].

    Disjoint owners, n=3/4, valid noninert source uniformizer and prime.
    Workspace holds canonical multiplication matrix, dependence column and
    Gaussian scratch, requiring 2*n*n+3*n entries. Tau scratch is row-major
    for the existing ZC_nfval port; detached tau output is column-major.
    Output owners are unchanged on failure. No valuation is run if unramified.
    """
    if n < 3 or n > 5 or prime < 2 or prime > 3037000493:
        raise ValueError("prime descriptor dimension/prime frontier")
    if ramified != 0 and ramified != 1:
        raise ValueError("prime descriptor ramification flag")
    size = n * n
    if (
        len(table) < n * size
        or len(u) < n
        or len(workspace) < 2 * size + 3 * n
        or len(t) < n
        or len(column) < n
        or len(tau_work) < size
        or len(x) < n
        or len(y) < n
        or len(spare) < n
        or len(stack) < 1
        or len(anti_output) < n
        or len(tau_output) < size
        or len(state) < 3
    ):
        raise ValueError("short prime descriptor storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    # zk_multable copies the first column. Reduction belongs to FpM_deplin.
    for i in range(n):
        workspace[i] = u[i]
    for j in range(1, n):
        pari_integral_basis_multiply(table, u, n, j + 1, column)
        for i in range(n):
            workspace[j * n + i] = column[i]
    for i in range(size):
        workspace[i] %= prime
    pivot = pari_small_prime_matrix_dependence(
        workspace, 0, n, n, prime, size, size + n
    )
    if pivot == 0:
        raise ValueError("prime uniformizer multiplication has no dependence")
    state[1] = pivot
    for i in range(n):
        t[i] = workspace[size + i]
        tau_work[i * n] = t[i]
    for j in range(1, n):
        pari_integral_basis_multiply(table, t, n, j + 1, column)
        for i in range(n):
            tau_work[i * n + j] = column[i]
    e = 1
    if ramified != 0:
        e += pari_prepared_ideal_valuation(
            t, tau_work, x, y, spare, stack, n, prime, 0, 0
        )
    for i in range(n):
        anti_output[i] = t[i]
    for j in range(n):
        for i in range(n):
            tau_output[j * n + i] = tau_work[i * n + j]
    state[2] = e
    state[0] = 0
    return 0


@native
def pari_prepared_prime_descriptor(
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
    selected: IntegerBuffer,
    trace: IntegerBuffer,
    norm_state: IntegerBuffer,
    tau_work: IntegerBuffer,
    stack: IntegerBuffer,
    anti_output: IntegerBuffer,
    tau_output: IntegerBuffer,
    output: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Noninert get_pr from P/V to packed [p,e,f,u...,tau...].

    One isolated call retains uniformizer and descriptor state. All owners
    are disjoint. Scratch is reused after its final read: u becomes the
    antiuniformizer; the three embedding-value buffers become valuation
    scratch. Selected, anti_output and tau_output are diagnostic stage outputs,
    not a successful descriptor until state[0] is zero. Final output is not
    written until both stages succeed (ordinary scalar publication semantics).
    Prepared embedding selection, P/V, primehood and integral table validity
    remain caller preconditions. Inert/Kummer/filter branches are not included.
    """
    if n < 3 or n > 5:
        raise ValueError("prime descriptor dimension/prime frontier")
    if (
        len(tau_work) < n * n
        or len(stack) < 1
        or len(anti_output) < n
        or len(tau_output) < n * n
        or len(output) < 3 + n + n * n
        or len(state) < 3
    ):
        raise ValueError("short connected prime descriptor storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    pari_prepared_prime_uniformizer(
        table,
        ideal,
        complement,
        n,
        rank,
        complement_rank,
        prime,
        ramified,
        r1,
        matrix_m,
        matrix_p,
        matrix_e,
        workspace,
        u,
        candidate,
        column,
        values_m,
        values_p,
        values_e,
        selected,
        trace,
        norm_state,
    )
    pari_prepared_prime_descriptor_suffix(
        table,
        selected,
        n,
        prime,
        ramified,
        workspace,
        u,
        column,
        tau_work,
        values_m,
        values_p,
        values_e,
        stack,
        anti_output,
        tau_output,
        state,
    )
    # Keep status failed until the final descriptor is published.
    state[0] = -1
    output[0] = prime
    output[1] = state[2]
    output[2] = n - rank
    for i in range(n):
        output[3 + i] = selected[i]
    for i in range(n * n):
        output[3 + n + i] = tau_output[i]
    state[0] = 0
    return 0
