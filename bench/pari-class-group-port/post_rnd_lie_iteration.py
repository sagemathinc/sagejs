"""Prepare PARI's genuine LIE iteration after the post-random HNF append.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the narrow resident boundary after the single post-`rnd_rel` row has
been published through HNF and acceptance.  It validates that the source's
absolute `done_small` counter, class/unit state, and cache scalars still imply
the large-ideal-elimination branch, then delegates capacity preparation to the
existing same-source next-pass kernel.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .collector_next_pass import pari_prepare_next_small_norm_pass


@native
def pari_prepare_post_random_lie(
    kc: int,
    columns: int,
    requested_need: int,
    automorphism_count: int,
    outer_state: Int64Buffer,
    relation_state: IntegerBuffer,
    schedule: Int64Buffer,
    log_completed: IntegerBuffer,
) -> int:
    """Return 1 prepared, or -1 for transactional cache-capacity retry.

    This boundary accepts only a completed post-random pass with a resident
    `A`, nonempty `R/W`, an odd absolute `done_small`, and fully published
    relation/log owners.  FACT and the relation basis are intentionally not
    arguments: PARI retains both owners in place across this transition.
    """
    if (
        kc < 1
        or columns < 1
        or requested_need < 1
        or automorphism_count < 0
        or len(outer_state) < 19
        or len(relation_state) < 6
        or len(schedule) < 4
        or len(log_completed) < 1
    ):
        raise ValueError("invalid post-random LIE boundary")
    if (
        relation_state[0] != columns
        or relation_state[4] != columns
        or relation_state[5] != columns
        or relation_state[2] != 0
        or log_completed[0] != columns
        or outer_state[0] != 0
        or outer_state[2] <= kc + 1
        or outer_state[2] % 2 == 0
        or outer_state[9] != 0
        or outer_state[14] == 0
        or outer_state[15] == 0
        or outer_state[16] <= 0
        or outer_state[16] > kc
        or outer_state[17] != 1
        or outer_state[18] != 0
    ):
        raise ValueError("inconsistent post-random LIE state")
    status = pari_prepare_next_small_norm_pass(
        requested_need,
        1,
        1,
        outer_state[16],
        automorphism_count,
        outer_state,
        relation_state,
        schedule,
        log_completed,
    )
    if status == -1:
        return -1
    return 1


__all__ = ["pari_prepare_post_random_lie"]
