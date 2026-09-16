"""Resident cache boundary connecting PARI's outer and inner small-norm loops.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

Factor-base construction, minidx/permutation, A/R/W, adjusted need and cache
preallocation remain prepared inputs. This is one outer iteration, not the
class-group driver. The mathematical collector runs in the caller's native
closure; these helpers neither call an interpreter nor supply its results.

The first 17 outer-state slots have `small_norm_outer_schedule.py`'s layout.
Slot 17 records 0=fresh/in progress, 1=collected, 2=empty, 3=gated, 4=unresolved;
slot 18 is the sticky collector status (zero for ordinary outcomes). The caller
must explicitly reset this state for another outer iteration. Numerical or
dependency failures retain the active LIE state and do not execute finish.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native
from .small_norm_outer_schedule import (
    pari_trim_small_norm_list,
    pari_begin_small_norm_outer,
    pari_finish_small_norm_outer,
)


@native
def pari_connected_outer_cache_to_state(
    outer: Int64Buffer, cache: IntegerBuffer
) -> int:
    """Copy only the scalar boundary; the cache basis is never copied."""
    outer[5] = cache[0]
    outer[6] = cache[5]
    outer[7] = cache[2]
    return 0


@native
def pari_connected_outer_state_to_cache(
    outer: Int64Buffer, cache: IntegerBuffer
) -> int:
    cache[0] = outer[5]
    cache[5] = outer[6]
    cache[2] = outer[7]
    return 0


@native
def pari_start_connected_outer(
    kc: int,
    ru: int,
    outer: Int64Buffer,
    raw: IntegerBuffer,
    count: int,
    minidx: IntegerBuffer,
    present: IntegerBuffer,
    live: IntegerBuffer,
    perm: IntegerBuffer,
    multiplier: IntegerBuffer,
    cache: IntegerBuffer,
    basis: IntegerBuffer,
) -> int:
    """Return 1 only when the real collector must run, otherwise return 0.

    `need` adjustment and preallocation have already occurred; cache slot 5
    supplies the corresponding end offset. `live` must not alias `raw`.
    """
    if kc < 1 or len(outer) < 19 or len(cache) < 6:
        raise ValueError("invalid connected outer state")
    if count < 0 or count > len(raw):
        raise ValueError("invalid live ideal search length")
    if outer[17] != 0 or outer[9] != 0:
        raise ValueError("connected outer iteration is not fresh")
    if cache[0] < 0 or cache[5] < cache[0] or cache[5] > cache[1]:
        raise ValueError("invalid prepared relation cache target")
    if len(basis) < kc * kc or len(live) < kc:
        raise ValueError("short connected outer workspace")
    # Check the prospective LIE target before trim/begin can mutate state or
    # pivots. Preallocation is supplied; it cannot grow through this boundary.
    if (
        outer[0] > 0
        and outer[1] > 0
        and (outer[2] <= kc + 1 or outer[14] != 0)
        and outer[3] <= outer[4]
        and cache[0] < 2 * kc + 2 * ru + 5
        and outer[15] != 0
        and outer[16] > 0
        and outer[2] % 2 != 0
        and cache[0] + outer[16] > cache[1]
    ):
        raise ValueError("insufficient prepared LIE cache capacity")
    pari_connected_outer_cache_to_state(outer, cache)
    if outer[0] <= 0:
        outer[17] = 3
        outer[18] = 0
        return 0
    outer[13] = pari_trim_small_norm_list(raw, count, minidx, kc, present, live)
    outcome = pari_begin_small_norm_outer(kc, ru, outer, live, perm, multiplier, basis)
    if outcome == 0:
        outer[17] = 3
        outer[18] = 0
        return 0
    pari_connected_outer_state_to_cache(outer, cache)
    if outcome == 2:
        pari_finish_small_norm_outer(kc, outer, live, perm, basis)
        pari_connected_outer_state_to_cache(outer, cache)
        outer[17] = 2
        outer[18] = 0
        return 0
    return 1


@native
def pari_end_connected_outer(
    status: int,
    kc: int,
    outer: Int64Buffer,
    live: IntegerBuffer,
    perm: IntegerBuffer,
    cache: IntegerBuffer,
    basis: IntegerBuffer,
) -> int:
    """Finish ordinary exhaustion (0) or the cache-target break (1).

    Upstream `small_norm` absorbs the Fincke-Pohst return 1 and returns void;
    the connected entry therefore normalizes that success to zero. Its gate
    requires positive Nrelid, excluding the separate first-smooth-probe mode.
    """
    pari_connected_outer_cache_to_state(outer, cache)
    outer[18] = status
    if status != 0 and status != 1:
        outer[17] = 4
        return status
    pari_finish_small_norm_outer(kc, outer, live, perm, basis)
    pari_connected_outer_state_to_cache(outer, cache)
    outer[17] = 1
    outer[18] = 0
    return 0
