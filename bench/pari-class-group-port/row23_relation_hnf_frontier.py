"""Row-23 factor-owner to the initial relation/HNF frontier.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The owner executes PARI 2.17.4's rational ``init_rel`` prefix from the live
row-23 factor ordering.  It deliberately does not manufacture small-norm
relations or import the frozen 40-column relation matrix.
"""

from sagejs.native import IntegerBuffer, native

from .relation_insertion import pari_initialize_owned_relations


@native
def pari_row23_initial_relation_frontier(
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
    frontier_state: IntegerBuffer,
) -> int:
    """Publish the authentic rational-relation prefix in live ideal order."""
    rows = 31
    groups = 20
    degree = 5
    additional = 9
    target = rows + additional
    capacity = 10 * target + 50
    if len(frontier_state) < 10 or frontier_state[0] != 0:
        raise ValueError("row23 relation frontier requires fresh publication state")
    frontier_state[0] = -1
    if (
        len(rational_primes) != groups
        or len(group_offsets) != groups
        or len(group_counts) != groups
        or len(group_complete) != groups
        or len(ramification) != rows
        or len(relation) != rows
        or len(relation_scratch) != rows
        or len(relation_basis) != rows * rows
        or len(relation_state) < 6
        or len(relation_records) != capacity * rows
        or len(relation_hashes) != capacity
        or len(relation_metadata) != capacity * 3
        or len(relation_generators) != capacity * degree
    ):
        raise ValueError("inconsistent row23 factor/relation dimensions")
    if rational_primes[0] != 7 or rational_primes[groups - 1] != 113:
        raise ValueError("row23 rational-prime frontier changed")
    count = pari_initialize_owned_relations(
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
        degree,
        relation_generators,
    )
    frontier_state[1] = count
    frontier_state[2] = target
    frontier_state[3] = target - count
    frontier_state[4] = 4
    frontier_state[5] = relation_state[2]
    frontier_state[6] = capacity
    frontier_state[7] = rows
    frontier_state[8] = groups
    frontier_state[9] = additional
    frontier_state[0] = 1
    return count


__all__ = ["pari_row23_initial_relation_frontier"]
