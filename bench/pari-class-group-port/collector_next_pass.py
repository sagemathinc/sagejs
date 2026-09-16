"""Resume an existing PARI-style small-norm collector without clearing owners.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The `buch2.c:Buchall_param` need/preallocation boundary is translated here;
fresh frame markers replace the lifetime of C's per-call small_norm locals.
The caller supplies the preceding HNF/regulator decisions and updated search
list/permutation. This does not select those decisions or implement retries.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native


@native
def pari_prepare_next_small_norm_pass(
    requested_need: int,
    has_a: int,
    has_r: int,
    w_columns: int,
    automorphism_count: int,
    outer: Int64Buffer,
    cache: IntegerBuffer,
    schedule: Int64Buffer,
    log_completed: IntegerBuffer,
) -> int:
    """Return 0 prepared, -1 requiring source cache reallocation.

    Accept only a completed successful outer pass (collected or empty), with
    all existing generator logs complete. Preserve every relation, generator,
    log, basis, multiplier, done_small and small_fail entry. Those owners are
    intentionally absent from this API. Their allocated capacities must still
    agree with `cache[1]`; this function never grows or clears them.

    `automorphism_count` is `lg(auts)-1`, not a guessed group order. HNF-derived
    A/R/W and need remain explicit inputs. Source reallocation is requested
    when `last+need+automorphism_count+(R?w_columns:0) >= capacity`.
    Validation and the reallocation frontier leave all inputs unchanged.
    Next call the existing collector with outer_mode=1: it computes j, e0,
    ideal powers/products and the exact source list filtering itself.
    """
    if (
        requested_need <= 0
        or (has_a != 0 and has_a != 1)
        or (has_r != 0 and has_r != 1)
        or w_columns < 0
        or automorphism_count < 0
        or len(outer) < 19
        or len(cache) < 6
        or len(schedule) < 4
        or len(log_completed) < 1
    ):
        raise ValueError("invalid next-pass boundary")
    if (
        (outer[17] != 1 and outer[17] != 2)
        or outer[18] != 0
        or outer[9] != 0
        or outer[0] != 0
        or outer[2] < 1
        or cache[0] < 0
        or cache[5] < cache[0]
        or cache[5] > cache[1]
        or log_completed[0] != cache[0]
    ):
        raise ValueError("previous outer pass or logs are not complete")
    if outer[17] == 1 and (schedule[2] != 1 or (schedule[3] != 0 and schedule[3] != 1)):
        raise ValueError("previous inner schedule did not finish normally")
    need = requested_need
    outstanding = cache[5] - cache[0]
    if need < outstanding:
        need = outstanding
    required = cache[0] + need + automorphism_count
    if has_r != 0:
        required += w_columns
    if required >= cache[1]:
        return -1
    cache[5] = cache[0] + need
    outer[0] = need
    outer[14] = has_a
    outer[15] = has_r
    outer[16] = w_columns
    outer[17] = 0
    outer[18] = 0
    for i in range(4):
        schedule[i] = 0
    return 0
