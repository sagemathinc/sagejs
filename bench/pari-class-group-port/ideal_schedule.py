"""Prepared scheduling boundary from PARI 2.17.4 `buch2.c:small_norm`.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Ideal construction, multiplication and LLL remain external dependencies.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native


@native
def pari_next_small_norm_ideal(
    ideals: IntegerBuffer,
    ramification: IntegerBuffer,
    residue_degrees: IntegerBuffer,
    degree: int,
    distinguished: int,
    power: int,
    schedule: Int64Buffer,
    cursor: Int64Buffer,
    counters: Int64Buffer,
    progress: Int64Buffer,
) -> int:
    """Select the next ideal ID, or zero when this schedule has stopped.

    `schedule` is [remaining, started, stopped, terminal_status], initially
    zero. Consume L_jid backwards, retaining PARI's distinguished-ideal skip.
    Invoke only before the first collector or after a terminal collector.
    Status -3 denotes the collector's ordinary factor-attempt exhaustion;
    unresolved factorization and numerical failures stop without being hidden.

    Reset only per-ideal control state. Keep the factor-list length, aggregate
    Nsmall/Nfact counters and all relation/generator storage across ideals.
    Returning an ID does not prepare that ideal or execute its collection.
    """
    if (
        degree < 1
        or distinguished < 0
        or power < 0
        or len(schedule) < 4
        or len(cursor) < 5
        or len(counters) < 4
        or len(progress) < 4
        or len(ramification) != len(residue_degrees)
    ):
        raise ValueError("invalid prepared small-norm schedule")
    if schedule[2] != 0:
        return 0
    if schedule[1] == 0:
        schedule[0] = len(ideals)
        schedule[1] = 1
        counters[1] = 0
        progress[1] = 0
    else:
        if progress[2] == 0:
            raise ValueError("current ideal collector is not terminal")
        status = progress[3]
        if status != 0 and status != -3:
            schedule[2] = 1
            schedule[3] = status
            return 0
    while schedule[0] > 0:
        schedule[0] -= 1
        ideal = ideals[schedule[0]]
        if ideal < 1 or ideal > len(ramification):
            raise ValueError("invalid scheduled ideal ID")
        if distinguished != 0 and ideal == distinguished:
            e = ramification[ideal - 1]
            if e < 1:
                raise ValueError("invalid scheduled ramification")
            if (power + 1) % e == 0 and e * residue_degrees[ideal - 1] == degree:
                continue
        for i in range(5):
            cursor[i] = 0
        counters[0] = 0
        counters[3] = 0
        progress[0] = 0
        progress[2] = 0
        progress[3] = 0
        return ideal
    schedule[2] = 1
    schedule[3] = 0
    return 0
