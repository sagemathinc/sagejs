"""Prepared ideal construction for PARI 2.17.4 random relations.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The authenticated scheduler builds the random ideal `R`.  This module closes
the next arithmetic edge of `rnd_rel`: construct `R * P[j]` and its norm from
the prepared prime descriptor.  The existing unreduced ideal collector then
uses `RND_REL_RELPID`, the subfactor IDs and random exponents; existing log and
`hnfadd` kernels retain the appended resident rows.
"""

from sagejs.native import IntegerBuffer, native

from .composite_ideal_hnf import pari_integral_ideal_mul_two
from .integral_power import pari_nonnegative_integer_power
from .prime_ideal_hnf import pari_basis_multiplication_table


@native
def pari_random_relation_preflight(
    n: int,
    rows: int,
    relation_state: IntegerBuffer,
    need: int,
    random_ideal: IntegerBuffer,
    search_ideal: IntegerBuffer,
    generators: IntegerBuffer,
    metadata: IntegerBuffer,
    logs: IntegerBuffer,
    log_rows: int,
) -> int:
    """Validate the resident corridor before scheduler or RNG mutation.

    Return the requested cache target. This intentionally checks public/live
    owners only; constituent collector and HNF kernels retain their own more
    detailed scratch checks. The caller performs this preflight before
    `pari_begin_random_relation_schedule`.
    """
    if n < 3 or n > 4 or rows < 1 or need < 1 or log_rows < 1:
        raise ValueError("invalid random-relation corridor dimensions")
    if len(relation_state) < 6 or relation_state[0] < 0:
        raise ValueError("invalid random-relation cache state")
    target = relation_state[0] + need
    if target > relation_state[1]:
        raise ValueError("random-relation cache capacity exhausted")
    if len(random_ideal) < n * n or len(search_ideal) < n * n:
        raise ValueError("short random-relation ideal owner")
    if len(generators) < target * n or len(metadata) < target * 3:
        raise ValueError("short random-relation provenance owner")
    if len(logs) < target * 7 * log_rows:
        raise ValueError("short random-relation log owner")
    return target


@native
def pari_construct_random_search_ideal(
    basis_table: IntegerBuffer,
    random_ideal: IntegerBuffer,
    random_norm: int,
    selected: int,
    n: int,
    primes: IntegerBuffer,
    residue_degree: IntegerBuffer,
    inert: IntegerBuffer,
    generators: IntegerBuffer,
    generator: IntegerBuffer,
    multiplication: IntegerBuffer,
    primitive: IntegerBuffer,
    product: IntegerBuffer,
    work: IntegerBuffer,
    triangular: IntegerBuffer,
    moduli: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Construct `idealHNF_mul(nf,R,P[j])`; return `N(R)*N(P[j])`.

    Factor-base identifiers are one-based. Descriptor arrays are indexed by
    ID minus one and generator rows contain `n` integral-basis coordinates.
    Inert ideals are `(p)` and take the scalar shortcut. All mutable buffers
    are disjoint; validation precedes output writes.
    """
    size = len(primes)
    square = n * n
    if n < 3 or n > 4 or selected < 1 or selected > size or random_norm < 1:
        raise ValueError("invalid random search ideal descriptor")
    if (
        len(residue_degree) != size
        or len(inert) != size
        or len(generators) < size * n
        or len(basis_table) < n * n * n
        or len(random_ideal) < square
        or len(generator) < n
        or len(multiplication) < square
        or len(primitive) < square
        or len(product) < 2 * square
        or len(work) < n * (3 * n + 1)
        or len(triangular) < n * (n + 1)
        or len(moduli) < n
        or len(output) < square
    ):
        raise ValueError("short random search ideal storage")
    descriptor = selected - 1
    prime = primes[descriptor]
    degree = residue_degree[descriptor]
    if (
        prime < 2
        or prime >= 18446744073709551616
        or degree < 1
        or degree > n
        or (inert[descriptor] != 0 and inert[descriptor] != 1)
    ):
        raise ValueError("unsupported random search prime descriptor")
    for i in range(n):
        generator[i] = generators[descriptor * n + i]
    if inert[descriptor] == 0:
        pari_basis_multiplication_table(basis_table, generator, n, multiplication)
    pari_integral_ideal_mul_two(
        random_ideal,
        multiplication,
        prime,
        n,
        inert[descriptor],
        prime,
        primitive,
        product,
        work,
        triangular,
        moduli,
        output,
    )
    return random_norm * pari_nonnegative_integer_power(prime, degree)
