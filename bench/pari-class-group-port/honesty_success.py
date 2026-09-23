"""Successful scheduler for one authenticated PARI honesty path.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The frozen correctness-only path is the unequal-bound check for
`36 + 930*x - 305*x^2 - 90*x^3 + x^5`, with `C1=5`, `C2=31`, and
`setrand(1)`. Every Fincke--Pohst probe succeeds immediately, so this cut
exercises PARI's temporary `KCZ` increments and final restoration without
drawing RNG words or entering retry arithmetic.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native


# State layout:
# 0 transient KCZ, 1 original KCZ, 2 KCZ2, 3 current probe index,
# 4 probes published, 5 probes consumed, 6 KCZ increments,
# 7 skipped rational primes, 8 terminal, 9 restoration count,
# 10 RNG draws, 11 Q_primpart calls, 12 idealred calls,
# 13 automorphism-orbit entries, 14 current iz, 15 current p, 16 current j,
# 17 probe pending, 18 publication serial, 19 current norm,
# 20 maximum transient KCZ.
STATE_LENGTH = 21


@native
def pari_honesty_success_begin(
    n: int,
    kcz: int,
    kcz2: int,
    nonidentity_automorphisms: int,
    outer_schedule: Int64Buffer,
    probe_schedule: Int64Buffer,
    probe_norms: IntegerBuffer,
    probe_ideals: IntegerBuffer,
    state: Int64Buffer,
    output_ideal: IntegerBuffer,
) -> int:
    """Publish the first probe of the authenticated successful schedule."""
    if n != 5 or kcz != 3 or kcz2 != 10 or nonidentity_automorphisms != 0:
        raise ValueError("unsupported successful honesty fixture")
    if len(state) < 21 or len(output_ideal) < 25:
        raise ValueError("short successful honesty scheduler state")
    if len(outer_schedule) < 35 or len(probe_schedule) < 18:
        raise ValueError("short successful honesty schedule")
    if len(probe_norms) < 6 or len(probe_ideals) < 150:
        raise ValueError("short successful honesty probe transcript")
    # Exact source order: `(iz, p, raw J, last e, effective J)`.
    if (
        outer_schedule[0] != 4
        or outer_schedule[1] != 11
        or outer_schedule[2] != 4
        or outer_schedule[3] != 2
        or outer_schedule[4] != 4
        or outer_schedule[5] != 5
        or outer_schedule[6] != 13
        or outer_schedule[7] != 3
        or outer_schedule[8] != 1
        or outer_schedule[9] != 2
        or outer_schedule[10] != 6
        or outer_schedule[11] != 17
        or outer_schedule[12] != 2
        or outer_schedule[13] != 1
        or outer_schedule[14] != 1
        or outer_schedule[15] != 7
        or outer_schedule[16] != 19
        or outer_schedule[17] != 2
        or outer_schedule[18] != 1
        or outer_schedule[19] != 1
        or outer_schedule[20] != 8
        or outer_schedule[21] != 23
        or outer_schedule[22] != 2
        or outer_schedule[23] != 1
        or outer_schedule[24] != 1
        or outer_schedule[25] != 9
        or outer_schedule[26] != 29
        or outer_schedule[27] != 4
        or outer_schedule[28] != 1
        or outer_schedule[29] != 3
        or outer_schedule[30] != 10
        or outer_schedule[31] != 31
        or outer_schedule[32] != 2
        or outer_schedule[33] != 1
        or outer_schedule[34] != 1
    ):
        raise ValueError("unexpected successful honesty outer schedule")
    # Exact checked representatives: three over 11, one over 13, two over 29.
    if (
        probe_schedule[0] != 4
        or probe_schedule[1] != 11
        or probe_schedule[2] != 1
        or probe_schedule[3] != 4
        or probe_schedule[4] != 11
        or probe_schedule[5] != 2
        or probe_schedule[6] != 4
        or probe_schedule[7] != 11
        or probe_schedule[8] != 3
        or probe_schedule[9] != 5
        or probe_schedule[10] != 13
        or probe_schedule[11] != 1
        or probe_schedule[12] != 9
        or probe_schedule[13] != 29
        or probe_schedule[14] != 1
        or probe_schedule[15] != 9
        or probe_schedule[16] != 29
        or probe_schedule[17] != 2
    ):
        raise ValueError("unexpected successful honesty probe schedule")
    for i in range(21):
        if state[i] != 0:
            raise ValueError("successful honesty scheduler is not fresh")
    if probe_norms[0] != 11:
        raise ValueError("unexpected first successful honesty norm")
    for i in range(25):
        output_ideal[i] = probe_ideals[i]
    state[0] = 3
    state[1] = 3
    state[2] = 10
    state[3] = 0
    state[4] = 1
    state[7] = 4
    state[14] = 4
    state[15] = 11
    state[16] = 1
    state[17] = 1
    state[18] = 1
    state[19] = 11
    state[20] = 3
    return 11


@native
def pari_honesty_success_resume(
    probe_success: int,
    outer_schedule: Int64Buffer,
    probe_schedule: Int64Buffer,
    probe_norms: IntegerBuffer,
    probe_ideals: IntegerBuffer,
    random_state: IntegerBuffer,
    state: Int64Buffer,
    staged_ideal: IntegerBuffer,
    output_ideal: IntegerBuffer,
) -> int:
    """Consume one successful probe and transactionally publish its successor.

    Return 1 when another probe is published and 0 after the final successful
    probe. Failure diverges from the authenticated path and is rejected before
    scheduler, ideal, or RNG publication. The RNG is accepted as an observable
    owner but is deliberately untouched because this source path draws nothing.
    """
    if probe_success != 1:
        raise ValueError("probe result diverges from successful honesty oracle")
    if len(outer_schedule) < 35 or len(probe_schedule) < 18:
        raise ValueError("short successful honesty schedule")
    if len(probe_norms) < 6 or len(probe_ideals) < 150:
        raise ValueError("short successful honesty probe transcript")
    if len(random_state) < 66 or len(state) < 21:
        raise ValueError("short successful honesty observable state")
    if len(staged_ideal) < 25 or len(output_ideal) < 25:
        raise ValueError("short successful honesty ideal storage")
    if (
        state[0] < 3
        or state[0] > 6
        or state[1] != 3
        or state[2] != 10
        or state[3] < 0
        or state[3] > 5
        or state[8] != 0
        or state[10] != 0
        or state[11] != 0
        or state[12] != 0
        or state[13] != 0
        or state[17] != 1
    ):
        raise ValueError("invalid successful honesty scheduler state")

    current = state[3]
    next_probe = current + 1
    increment = 0
    if current == 2 or current == 3 or current == 5:
        increment = 1

    # Validate and stage the complete next publication before changing any
    # externally observable owner.
    if next_probe < 6:
        offset = next_probe * 25
        for i in range(25):
            staged_ideal[i] = probe_ideals[offset + i]
        next_norm = probe_norms[next_probe]
        if next_norm != 11 and next_norm != 13 and next_norm != 29:
            raise ValueError("unexpected successful honesty probe norm")
        iz = probe_schedule[next_probe * 3]
        prime = probe_schedule[next_probe * 3 + 1]
        slot = probe_schedule[next_probe * 3 + 2]
        if (
            (next_probe < 3 and (iz != 4 or prime != 11 or slot != next_probe + 1))
            or (next_probe == 3 and (iz != 5 or prime != 13 or slot != 1))
            or (next_probe > 3 and (iz != 9 or prime != 29 or slot != next_probe - 3))
        ):
            raise ValueError("invalid successful honesty successor")
    else:
        next_norm = 0
        iz = 0
        prime = 0
        slot = 0

    transient = state[0] + increment
    consumed = state[5] + 1
    increments = state[6] + increment
    maximum = state[20]
    if transient > maximum:
        maximum = transient

    if next_probe == 6:
        if transient != 6 or increments != 3 or consumed != 6:
            raise ValueError("incomplete successful honesty restoration")
        state[0] = state[1]
        state[5] = consumed
        state[6] = increments
        state[8] = 1
        state[9] = 1
        state[17] = 0
        state[20] = maximum
        return 0

    for i in range(25):
        output_ideal[i] = staged_ideal[i]
    state[0] = transient
    state[3] = next_probe
    state[4] += 1
    state[5] = consumed
    state[6] = increments
    state[14] = iz
    state[15] = prime
    state[16] = slot
    state[18] += 1
    state[19] = next_norm
    state[20] = maximum
    return 1
