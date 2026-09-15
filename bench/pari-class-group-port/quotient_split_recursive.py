"""PARI 2.17.4 `base2.c:primedec_aux` etale quotient worklist.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Starting ideal H is the radical or already Kummer-removed ideal image. This
does not implement Kummer selection or `primedec_end` descriptors. Preserve
the source LIFO worklist and reverse publication when a step separates all
components. Fixed-capacity copied packed matrices replace source shallow GEN
references; no extra quotient projection is performed on completed children.
"""

from sagejs.native import IntegerBuffer, native

from .quotient_split import pari_small_quotient_split_step
from .small_prime_polynomial_roots import (
    pari_small_prime_polynomial_roots_workspace_size,
)


@native
def pari_small_quotient_split_recursive(
    table: IntegerBuffer,
    ideal: IntegerBuffer,
    phi: IntegerBuffer,
    n: int,
    rank: int,
    prime: int,
    projection: IntegerBuffer,
    workspace: IntegerBuffer,
    element: IntegerBuffer,
    column: IntegerBuffer,
    matrix: IntegerBuffer,
    polynomial_workspace: IntegerBuffer,
    coefficients: IntegerBuffer,
    polynomial_diagnostic: IntegerBuffer,
    roots: IntegerBuffer,
    root_workspace: IntegerBuffer,
    children: IntegerBuffer,
    child_ranks: IntegerBuffer,
    step_state: IntegerBuffer,
    current_ideal: IntegerBuffer,
    pending: IntegerBuffer,
    pending_ranks: IntegerBuffer,
    final_ideals: IntegerBuffer,
    final_ranks: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Return final image count, preserving source publication order.

    All owners are disjoint. Each pending/final ideal has n² capacity with
    active column-major length n*rank; inactive capacity and owner tails are
    untouched. H is independent, excludes one and is phi-invariant, exactly
    as required by the step helper. Caller supplies a prime and valid table.

    State is [status, visit count, published output count]. It is -1 during
    execution and on exceptions; already published final images then form
    an explicit partial prefix, not a completed decomposition. Input-shape
    errors leave all owners unchanged. This call may be restarted from its
    original immutable inputs, but is not a resumable continuation protocol.
    """
    if n < 3 or n > 4 or rank < 0 or rank >= n or prime < 2 or prime > 3037000493:
        raise ValueError("small recursive quotient split domain")
    size = n * n
    if (
        len(table) < n * size
        or len(ideal) < n * rank
        or len(phi) < size
        or len(projection) < 11 * size + 2 * n
        or len(workspace) < 10 * size + 3 * n
        or len(element) < n
        or len(column) < n
        or len(matrix) < size
        or len(polynomial_workspace) < 2 * n * (n + 2) + 4 * n + 4
        or len(coefficients) < n + 2
        or len(polynomial_diagnostic) < 2
        or len(roots) < 4
        or len(root_workspace) < pari_small_prime_polynomial_roots_workspace_size()
        or len(children) < n * size
        or len(child_ranks) < n
        or len(step_state) < 6
        or len(current_ideal) < size
        or len(pending) < n * size
        or len(pending_ranks) < n
        or len(final_ideals) < n * size
        or len(final_ranks) < n
        or len(state) < 3
    ):
        raise ValueError("short recursive quotient split storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    for i in range(n * rank):
        pending[i] = ideal[i]
    pending_ranks[0] = rank
    count = 1
    while count != 0:
        count -= 1
        current_rank = pending_ranks[count]
        for i in range(n * current_rank):
            current_ideal[i] = pending[count * size + i]
        state[1] += 1
        number = pari_small_quotient_split_step(
            table,
            current_ideal,
            phi,
            n,
            current_rank,
            prime,
            projection,
            workspace,
            element,
            column,
            matrix,
            polynomial_workspace,
            coefficients,
            polynomial_diagnostic,
            roots,
            root_workspace,
            children,
            child_ranks,
            step_state,
        )
        if step_state[0] != 0 or number < 1 or number > n:
            raise ValueError("incomplete recursive quotient split step")
        for j in range(number):
            if child_ranks[j] < 0 or child_ranks[j] >= n:
                raise ValueError("invalid recursive quotient split child rank")
        if step_state[2] == 1:
            if number != 1 or state[2] >= n:
                raise ValueError("recursive quotient split output capacity")
            output = state[2]
            for i in range(n * current_rank):
                final_ideals[output * size + i] = current_ideal[i]
            final_ranks[output] = current_rank
            state[2] += 1
        else:
            # Source nontrivial split has at least two roots/components.
            if number < 2 or count + number > n:
                raise ValueError("recursive quotient split pending capacity")
            for j in range(number):
                for i in range(n * child_ranks[j]):
                    pending[count * size + i] = children[j * size + i]
                pending_ranks[count] = child_ranks[j]
                count += 1
            if step_state[5] != 0:
                if state[2] + number > n:
                    raise ValueError("recursive quotient split output capacity")
                for j in range(number):
                    count -= 1
                    output = state[2]
                    for i in range(n * pending_ranks[count]):
                        final_ideals[output * size + i] = pending[count * size + i]
                    final_ranks[output] = pending_ranks[count]
                    state[2] += 1
    state[0] = 0
    return state[2]
