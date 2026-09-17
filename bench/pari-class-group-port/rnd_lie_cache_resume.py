"""Resume PARI's small-norm loop after a resident random-relation pass.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

PARI's `rnd_rel` mutates the existing relation cache in place and returns to
`Buchall_param` without changing `done_small`.  The latter is an *absolute*
counter: reducing it modulo `KC + 1` preserves the selected ideal but loses
the parity used by the following large-ideal-elimination (`LIE`) branch.  This
small boundary publishes the authenticated absolute counter and cache scalar
mirrors while deliberately taking no FACT or basis owner: those resident
owners must survive unchanged.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native


@native
def pari_resume_after_random_relations(
    kc: int,
    done_small: int,
    relation_state: IntegerBuffer,
    outer_state: Int64Buffer,
) -> int:
    """Publish the absolute `done_small` counter after `rnd_rel`.

    `relation_state` is `(last, capacity, missing, relsup, published, end)`.
    The random corridor must have published every accepted row and left no
    unprocessed cache suffix.  `done_small` must select the same next ideal as
    the resident counter modulo `KC + 1`; only the information lost by that
    reduction (notably parity) may be restored.  All validation precedes the
    four scalar writes, so malformed/capacity states are transactional.

    Return 1 when the following source iteration enters LIE, otherwise 0.
    FACT, relation rows, generators, logarithms, and the `KC` by `KC` cache
    basis are intentionally outside this API and therefore cannot be reset.
    """
    if kc < 1 or done_small < 0 or len(relation_state) < 6 or len(outer_state) < 19:
        raise ValueError("invalid post-random cache boundary")
    last = relation_state[0]
    capacity = relation_state[1]
    missing = relation_state[2]
    relsup = relation_state[3]
    published = relation_state[4]
    end = relation_state[5]
    if (
        last < 0
        or capacity < last
        or missing < 0
        or relsup < 0
        or published != last
        or end != last
        or outer_state[2] < 0
        or done_small < outer_state[2]
        or done_small % (kc + 1) != outer_state[2] % (kc + 1)
    ):
        raise ValueError("inconsistent post-random cache state")
    # This is a resume edge, never an active small_norm frame.
    if outer_state[9] != 0 or outer_state[18] != 0:
        raise ValueError("small-norm frame is still active")
    outer_state[2] = done_small
    outer_state[5] = last
    outer_state[6] = end
    outer_state[7] = missing
    if outer_state[15] != 0 and outer_state[16] > 0 and done_small % 2 != 0:
        return 1
    return 0


__all__ = ["pari_resume_after_random_relations"]
