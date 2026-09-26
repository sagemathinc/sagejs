"""Prepared row-6 initial rational relations.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This narrow experimental continuation consumes the authenticated prepared
field projection and the immutable row-6 factor-base owner.  It translates
PARI 2.17.4's `init_rel` step, but deliberately stops before random relation
collection or HNF.
"""

from sagejs.native import IntegerBuffer, native

from .relation_insertion import pari_initialize_owned_relations


@native
def pari_row6_prepared_initial_relations(
    polynomial: IntegerBuffer,
    discriminant: int,
    real_places: int,
    complex_pairs: int,
    precision: int,
    equation_index: int,
    factor_state: IntegerBuffer,
    random_state: IntegerBuffer,
    rational_primes: IntegerBuffer,
    group_offsets: IntegerBuffer,
    group_counts: IntegerBuffer,
    group_complete: IntegerBuffer,
    ramification: IntegerBuffer,
    relation_state: IntegerBuffer,
    relation_basis: IntegerBuffer,
    relation_records: IntegerBuffer,
    relation_hashes: IntegerBuffer,
    relation_metadata: IntegerBuffer,
    relation: IntegerBuffer,
    relation_scratch: IntegerBuffer,
    relation_generators: IntegerBuffer,
    root_state: IntegerBuffer,
) -> int:
    """Publish PARI's initial rational-relation cache for frozen row 6.

    The factor-base dimensions are obtained from `factor_state`; storage is
    sized from those live dimensions by the host after authenticating the
    immutable frontier owner.  On success `root_state` is

    `[1, initial_count, target, need, Nrelid, missing, capacity, KC, KCZ,
    additional, search_count, automorphism_count]`.

    `random_state` is an authenticated borrowed owner.  Initial rational
    relations consume no randomness, so it must remain byte-for-byte stable.
    """
    if len(root_state) < 12 or root_state[0] != 0:
        raise ValueError("row6 initial relations require a fresh publication owner")
    root_state[0] = -1
    if (
        len(polynomial) != 4
        or polynomial[0] != 2000000000018
        or polynomial[1] != -2000000000010
        or polynomial[2] != 0
        or polynomial[3] != 1
        or discriminant != 3555555555596888888888939555555555028
        or real_places != 3
        or complex_pairs != 0
        or precision != 192
        or equation_index != 3
        or len(factor_state) < 14
        or factor_state[0] != 1
        or len(random_state) != 66
    ):
        raise ValueError("unsupported row6 prepared initial-relation corridor")

    kc = factor_state[3]
    kcz = factor_state[4]
    if (
        kc < 1
        or kcz < 1
        or factor_state[2] != factor_state[1]
        or factor_state[5] != kcz
        or factor_state[6] != kc
        or len(rational_primes) != kcz
        or len(group_offsets) != kcz
        or len(group_counts) != kcz
        or len(group_complete) != kcz
        or len(ramification) != kc
        or len(relation) != kc
        or len(relation_scratch) != kc
        or len(relation_basis) != kc * kc
    ):
        raise ValueError("inconsistent row6 factor/relation dimensions")

    unit_rank = real_places + complex_pairs - 1
    additional = 5 + unit_rank
    target = kc + additional
    capacity = 10 * target + 50
    if (
        len(relation_state) < 6
        or len(relation_records) != capacity * kc
        or len(relation_hashes) != capacity
        or len(relation_metadata) != capacity * 3
        or len(relation_generators) != capacity * 3
    ):
        raise ValueError("invalid row6 relation-cache allocation")

    root_state[0] = -2
    initial_count = pari_initialize_owned_relations(
        additional,
        rational_primes,
        group_offsets,
        group_counts,
        group_complete,
        ramification,
        relation_state,
        relation_basis,
        relation_records,
        relation_hashes,
        relation_metadata,
        relation,
        relation_scratch,
        3,
        relation_generators,
    )
    need = target - initial_count
    nrelid = 4
    missing = relation_state[2]

    root_state[1] = initial_count
    root_state[2] = target
    root_state[3] = need
    root_state[4] = nrelid
    root_state[5] = missing
    root_state[6] = capacity
    root_state[7] = kc
    root_state[8] = kcz
    root_state[9] = additional
    root_state[10] = kc
    root_state[11] = 0
    root_state[0] = 1
    return initial_count
