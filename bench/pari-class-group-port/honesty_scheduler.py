"""Transactional scheduler for one authenticated PARI honesty path.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The frozen path is the unequal-bound check for `x^3-20018*x+20034` with
`C1=5`, `C2=31` and `setrand(1)`. It has no automorphism orbit, skips the
single unramified prime above 7, starts with the first prime ideal above 11,
and exhausts all 51 no-cache probes.
Probe computation is intentionally outside this resumable scheduler: the
caller runs the existing no-cache collector on each published ideal and then
resumes with its exact Boolean result.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .honesty_branch import pari_honesty_retry_ideal
from .pari_random import pari_random_word


# State layout.  These constants are documentation only; native code uses the
# literal slots because module globals are not part of the compiled ABI.
# 0 KCZ, 1 KCZ0, 2 KCZ2, 3 iz, 4 p, 5 ideal slot, 6 nbtest,
# 7 probes published, 8 random products, 9 terminal (-1/0/1),
# 10 primitive-part calls, 11 idealred calls, 12 orbit mode,
# 13 probe pending, 14 last exponent, 15 publication serial,
# 16 RNG draws, 17 current norm, 18 last reduction decision,
# 19 outer-prime skips, 20 orbit representatives selected.
STATE_LENGTH = 21


@native
def pari_honesty_begin_frozen(
    initial_ideal: IntegerBuffer,
    n: int,
    kcz: int,
    kcz2: int,
    nonidentity_automorphisms: int,
    outer_schedule: Int64Buffer,
    state: Int64Buffer,
    output_ideal: IntegerBuffer,
) -> int:
    """Publish the first probe in the authenticated unequal-bound schedule."""
    if n != 3 or kcz != 2 or kcz2 != 9 or nonidentity_automorphisms != 0:
        raise ValueError("unsupported frozen honesty schedule")
    if len(state) < 21 or len(initial_ideal) < 9 or len(output_ideal) < 9:
        raise ValueError("short frozen honesty scheduler storage")
    if len(outer_schedule) < 10:
        raise ValueError("short frozen honesty outer schedule")
    if (
        outer_schedule[0] != 3
        or outer_schedule[1] != 7
        or outer_schedule[2] != 2
        or outer_schedule[3] != 1
        or outer_schedule[4] != 1
        or outer_schedule[5] != 4
        or outer_schedule[6] != 11
        or outer_schedule[7] != 3
        or outer_schedule[8] != 2
        or outer_schedule[9] != 3
    ):
        raise ValueError("unexpected frozen honesty outer schedule")
    for i in range(21):
        if state[i] != 0:
            raise ValueError("frozen honesty scheduler is not fresh")
    for i in range(9):
        output_ideal[i] = initial_ideal[i]
    state[0] = 2
    state[1] = 2
    state[2] = 9
    state[3] = 4
    state[4] = 11
    state[5] = 1
    state[7] = 1
    state[12] = 0
    state[13] = 1
    state[15] = 1
    norm = output_ideal[0] * output_ideal[4] * output_ideal[8]
    state[17] = norm
    state[19] = 1
    state[20] = 1
    return norm


@native
def pari_honesty_resume_frozen(
    probe_success: int,
    basis_table: IntegerBuffer,
    initial_ideal: IntegerBuffer,
    subfactor_generator: IntegerBuffer,
    n: int,
    prime: int,
    ramification: int,
    residue_degree: int,
    random_state: IntegerBuffer,
    staged_random_state: IntegerBuffer,
    state: Int64Buffer,
    power_primitive: IntegerBuffer,
    power_temporary: IntegerBuffer,
    power_alpha: IntegerBuffer,
    power_metadata: IntegerBuffer,
    power_diagnostic: IntegerBuffer,
    alpha_table: IntegerBuffer,
    ideal_primitive: IntegerBuffer,
    product: IntegerBuffer,
    work: IntegerBuffer,
    triangular: IntegerBuffer,
    moduli: IntegerBuffer,
    staged_ideal: IntegerBuffer,
    output_ideal: IntegerBuffer,
) -> int:
    """Consume one probe result and publish the next retry transactionally.

    Return 1 when another ideal has been published and 0 after terminal
    failure.  A successful probe diverges from this frozen oracle path and is
    rejected before any state is changed.  Scratch buffers may change on an
    arithmetic error, but RNG, scheduler state, and the published ideal do not.
    """
    if probe_success != 0:
        raise ValueError("probe result diverges from frozen honesty oracle")
    if n != 3 or prime != 3 or ramification != 1 or residue_degree != 1:
        raise ValueError("unsupported frozen honesty retry descriptor")
    if len(state) < 21 or len(random_state) < 66:
        raise ValueError("short frozen honesty scheduler state")
    if len(staged_random_state) < 66 or len(staged_ideal) < 9:
        raise ValueError("short frozen honesty staging storage")
    if len(output_ideal) < 9 or len(initial_ideal) < 9:
        raise ValueError("short frozen honesty ideal storage")
    if (
        state[0] != 2
        or state[1] != 2
        or state[2] != 9
        or state[3] != 4
        or state[4] != 11
        or state[5] != 1
        or state[9] != 0
        or state[12] != 0
        or state[13] != 1
    ):
        raise ValueError("invalid frozen honesty scheduler state")

    next_test = state[6] + 1
    if next_test > 50:
        state[6] = next_test
        state[9] = -1
        state[13] = 0
        return 0

    # Stage the random draw.  Nothing observable is committed until the ideal
    # arithmetic and every frozen-path branch condition have succeeded.
    for i in range(66):
        staged_random_state[i] = random_state[i]
    exponent = pari_random_word(staged_random_state) >> 60
    norm = pari_honesty_retry_ideal(
        basis_table,
        initial_ideal,
        subfactor_generator,
        n,
        prime,
        ramification,
        residue_degree,
        exponent,
        power_primitive,
        power_temporary,
        power_alpha,
        power_metadata,
        power_diagnostic,
        alpha_table,
        ideal_primitive,
        product,
        work,
        triangular,
        moduli,
        staged_ideal,
    )

    # PARI's outer Q_primpart and idealred decisions are both false for every
    # retry on this authenticated path.  Fail closed if a future arithmetic
    # change reaches either still-generic dependency.
    if staged_ideal[8] != 1:
        raise ValueError("frozen honesty retry requires outer primitive part")
    top = staged_ideal[0]
    if top < 0:
        top = -top
    bits = 0
    while top > 0:
        bits += 1
        top //= 2
    if bits > 101:
        raise ValueError("frozen honesty retry requires ideal reduction")

    for i in range(66):
        random_state[i] = staged_random_state[i]
    for i in range(9):
        output_ideal[i] = staged_ideal[i]
    state[6] = next_test
    state[7] += 1
    state[8] += 1
    state[13] = 1
    state[14] = exponent
    state[15] += 1
    state[16] += 1
    state[17] = norm
    state[18] = 0
    return 1
