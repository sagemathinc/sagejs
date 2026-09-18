"""Prepared maximal-order descriptors for primes dividing the equation index.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the degree-3--5 composition of PARI 2.17.4's `pradical`,
`primedec_aux`, `get_LV`, and `get_pr` path.  Unlike the defining-polynomial
Kummer shortcut, it starts from the prepared maximal-order multiplication
table and therefore remains valid when `p` divides the equation-order index.
"""

from sagejs.native import IntegerBuffer, integer_buffer_view, native

from .pradical import pari_small_pradical
from .prime_complements import pari_small_prime_complements
from .prime_descriptor import pari_prepared_prime_descriptor
from .prime_descriptor_sort import pari_prime_descriptor_sort
from .quotient_split_recursive import pari_small_quotient_split_recursive


# Deliberately simple fixed layout for n <= 5.  It is reused sequentially for
# each index prime and is small compared with the factor-base owners.
INDEX_PRIME_WORKSPACE = 12000


@native
def pari_prepared_index_prime_descriptors(
    table: IntegerBuffer,
    n: int,
    prime: int,
    real_places: int,
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    workspace: IntegerBuffer,
    descriptors: IntegerBuffer,
    ranks: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Publish packed descriptors and return their count.

    Each descriptor occupies `3+n+n*n` entries: `p,e,f,u,tau`.  State is
    `[status, radical_rank, count, descriptor_stride]`.  All arithmetic
    choices are made from the prepared maximal order; no decomposition data is
    supplied by the caller.
    """
    if n < 3 or n > 5 or prime < 2 or real_places < 1 or real_places > n:
        raise ValueError("prepared index-prime domain")
    stride = 3 + n + n * n
    if (
        len(table) < n * n * n
        or len(matrix_m) < n * n
        or len(matrix_p) < n * n
        or len(matrix_e) < n * n
        or len(workspace) < INDEX_PRIME_WORKSPACE
        or len(descriptors) < n * stride
        or len(ranks) < n
        or len(state) < 4
    ):
        raise ValueError("short prepared index-prime storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = stride

    # Stable, disjoint 256-entry banks make ownership and reuse inspectable.
    radical_workspace = integer_buffer_view(workspace, 0, 256)
    temporary = integer_buffer_view(workspace, 256, 8)
    column = integer_buffer_view(workspace, 264, 8)
    power_diagnostic = integer_buffer_view(workspace, 272, 8)
    phi = integer_buffer_view(workspace, 280, 32)
    radical = integer_buffer_view(workspace, 312, 32)
    radical_diagnostic = integer_buffer_view(workspace, 344, 8)
    radical_rank = pari_small_pradical(
        table,
        n,
        prime,
        radical_workspace,
        temporary,
        column,
        power_diagnostic,
        phi,
        radical,
        radical_diagnostic,
    )
    state[1] = radical_rank

    projection = integer_buffer_view(workspace, 512, 512)
    split_workspace = integer_buffer_view(workspace, 1024, 512)
    element = integer_buffer_view(workspace, 1536, 8)
    split_column = integer_buffer_view(workspace, 1544, 8)
    matrix = integer_buffer_view(workspace, 1552, 32)
    polynomial_workspace = integer_buffer_view(workspace, 1584, 128)
    coefficients = integer_buffer_view(workspace, 1712, 8)
    polynomial_diagnostic = integer_buffer_view(workspace, 1720, 8)
    roots = integer_buffer_view(workspace, 1728, 8)
    root_workspace = integer_buffer_view(workspace, 1736, 256)
    children = integer_buffer_view(workspace, 1992, 128)
    child_ranks = integer_buffer_view(workspace, 2120, 8)
    step_state = integer_buffer_view(workspace, 2128, 8)
    current = integer_buffer_view(workspace, 2136, 32)
    pending = integer_buffer_view(workspace, 2168, 128)
    pending_ranks = integer_buffer_view(workspace, 2296, 8)
    final_ideals = integer_buffer_view(workspace, 2304, 128)
    final_ranks = integer_buffer_view(workspace, 2432, 8)
    split_state = integer_buffer_view(workspace, 2440, 8)
    count = pari_small_quotient_split_recursive(
        table,
        radical,
        phi,
        n,
        radical_rank,
        prime,
        projection,
        split_workspace,
        element,
        split_column,
        matrix,
        polynomial_workspace,
        coefficients,
        polynomial_diagnostic,
        roots,
        root_workspace,
        children,
        child_ranks,
        step_state,
        current,
        pending,
        pending_ranks,
        final_ideals,
        final_ranks,
        split_state,
    )

    complement_workspace = integer_buffer_view(workspace, 2560, 1024)
    complement_work_ranks = integer_buffer_view(workspace, 3584, 16)
    complements = integer_buffer_view(workspace, 3600, 128)
    complement_ranks = integer_buffer_view(workspace, 3728, 8)
    complement_state = integer_buffer_view(workspace, 3736, 8)
    pari_small_prime_complements(
        final_ideals,
        final_ranks,
        count,
        n,
        prime,
        complement_workspace,
        complement_work_ranks,
        complements,
        complement_ranks,
        complement_state,
    )

    descriptor_workspace = integer_buffer_view(workspace, 4096, 1024)
    u = integer_buffer_view(workspace, 5120, 8)
    candidate = integer_buffer_view(workspace, 5128, 8)
    descriptor_column = integer_buffer_view(workspace, 5136, 8)
    values_m = integer_buffer_view(workspace, 5144, 8)
    values_p = integer_buffer_view(workspace, 5152, 8)
    values_e = integer_buffer_view(workspace, 5160, 8)
    selected = integer_buffer_view(workspace, 5168, 8)
    trace = integer_buffer_view(workspace, 5176, 128)
    norm_state = integer_buffer_view(workspace, 5304, 8)
    tau_work = integer_buffer_view(workspace, 5312, 32)
    stack = integer_buffer_view(workspace, 5344, 8)
    anti = integer_buffer_view(workspace, 5352, 8)
    tau = integer_buffer_view(workspace, 5360, 32)
    descriptor_state = integer_buffer_view(workspace, 5392, 8)
    packed = integer_buffer_view(workspace, 5400, 40)
    degrees = integer_buffer_view(workspace, 5500, 8)
    generators = integer_buffer_view(workspace, 5508, 40)
    order = integer_buffer_view(workspace, 5548, 8)
    sort_diagnostic = integer_buffer_view(workspace, 5556, 8)
    unsorted = integer_buffer_view(workspace, 5564, 200)
    for j in range(count):
        pari_prepared_prime_descriptor(
            table,
            integer_buffer_view(final_ideals, j * n * n, n * n),
            integer_buffer_view(complements, j * n * n, n * n),
            n,
            final_ranks[j],
            complement_ranks[j],
            prime,
            1,
            real_places,
            matrix_m,
            matrix_p,
            matrix_e,
            descriptor_workspace,
            u,
            candidate,
            descriptor_column,
            values_m,
            values_p,
            values_e,
            selected,
            trace,
            norm_state,
            tau_work,
            stack,
            anti,
            tau,
            packed,
            descriptor_state,
        )
        ranks[j] = final_ranks[j]
        degrees[j] = packed[2]
        for i in range(stride):
            unsorted[j * stride + i] = packed[i]
        for i in range(n):
            generators[j * n + i] = packed[3 + i]
    pari_prime_descriptor_sort(degrees, generators, n, count, order, sort_diagnostic)
    for j in range(count):
        source = order[j]
        ranks[j] = final_ranks[source]
        for i in range(stride):
            descriptors[j * stride + i] = unsorted[source * stride + i]
    state[2] = count
    state[0] = 0
    return count
