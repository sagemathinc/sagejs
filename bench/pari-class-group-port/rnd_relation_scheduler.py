"""Resident PARI 2.17.4 random-relation scheduling and ideal preparation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the scheduling and `get_random_ideal` prefix of `rnd_rel`, not the
Fincke--Pohst collector.  The caller suspends after the random ideal is built,
runs the existing prepared ideal collector for every live search ideal, then
calls the finish function.  Fixed buffers replace PARI stack allocation.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .composite_ideal_hnf import pari_integral_ideal_mul_two
from .pari_random import pari_random_word
from .prime_ideal_hnf import pari_basis_multiplication_table
from .prime_ideal_power import (
    pari_positive_prime_power_hnf,
    pari_positive_prime_power_two,
)


@native
def pari_begin_random_relation_schedule(
    bad: IntegerBuffer,
    permutation: IntegerBuffer,
    preferred: IntegerBuffer,
    preferred_count: int,
    current: IntegerBuffer,
    state: Int64Buffer,
    chosen: IntegerBuffer,
    present: IntegerBuffer,
) -> int:
    """Translate the outer `rnd_rel` scheduling branch.

    State is `(need, nreldep, sfb_trials, sfb_chg, subFB_count,
    MAXDEPSIZESFB, MAXDEPSFB, LIMC, LIMCMAX, active, changed, old_count)`.
    Return 0 when gated, 1 when the caller must run `rnd_rel`, and 2 when PARI
    would restart factor-base construction.  On 1, `current` is the exact
    resident subfactor base to use for random powers.  The preferred list is
    the current `F.L_jid`; finish publishes the full permutation separately.
    """
    if len(state) < 12 or len(bad) != len(permutation):
        raise ValueError("invalid random-relation scheduler state")
    if state[9] != 0:
        raise ValueError("random-relation scheduler already active")
    if state[0] <= 0:
        return 0
    size = len(bad)
    if state[4] < 1 or state[5] < 1 or state[6] < 1:
        raise ValueError("invalid random-relation dependency limits")
    if state[1] < 0 or state[2] < 0 or state[3] < 0 or state[3] > 2:
        raise ValueError("invalid random-relation counters")
    if (
        preferred_count < -1
        or preferred_count > len(preferred)
        or preferred_count > size
        or len(present) < size
        or len(chosen) < size
        or len(current) < size
    ):
        raise ValueError("invalid random-relation subfactor storage")
    for permutation_slot in range(size):
        if permutation[permutation_slot] < 1 or permutation[permutation_slot] > size:
            raise ValueError("invalid random-relation permutation")
    for preferred_slot in range(preferred_count):
        if preferred[preferred_slot] < 1 or preferred[preferred_slot] > size:
            raise ValueError("invalid random-relation preferred ID")
    state[1] += 1
    if state[1] > state[5]:
        state[2] += 1
        if state[2] > 10 and state[7] < state[8] // 2:
            return 2
        state[3] = 2
        state[1] = 0
    elif state[1] % state[6] == 0:
        state[3] = 1
    state[11] = state[4]
    state[10] = 0
    if state[3] != 0:
        minimum = state[4]
        if state[3] == 2:
            minimum += 1
        if minimum > size:
            return 2
        for cleared_slot in range(size):
            present[cleared_slot] = 0
        count = 0
        scan = 0
        while scan < preferred_count:
            ideal = preferred[scan]
            if bad[ideal - 1] == 0:
                chosen[count] = ideal
                count += 1
                present[ideal - 1] = 1
                if count >= minimum:
                    break
            scan += 1
        if count < minimum:
            while scan < size:
                ideal = permutation[scan]
                if present[ideal - 1] == 0 and bad[ideal - 1] == 0:
                    chosen[count] = ideal
                    count += 1
                    if count >= minimum:
                        break
                scan += 1
            if scan == size:
                return 2
        changed = 0
        if state[4] != count:
            changed = 1
        else:
            for compared_slot in range(count):
                if current[compared_slot] != chosen[compared_slot]:
                    changed = 1
        if changed != 0:
            for assigned_slot in range(count):
                current[assigned_slot] = chosen[assigned_slot]
            state[4] = count
            state[5] = count * 16
            state[6] = (count * 16) // 10
        state[10] = changed
        state[3] = 0
    state[9] = 1
    return 1


@native
def pari_finish_random_relation_schedule(
    permutation: IntegerBuffer,
    state: Int64Buffer,
    search: IntegerBuffer,
) -> int:
    """Resume after `rnd_rel` and publish `F.L_jid = F.perm`.

    Return the live permutation length. Relation cache and HNF owners are not
    arguments because the source scheduling statements do not mutate them.
    """
    if len(state) < 12 or state[9] != 1 or len(search) < len(permutation):
        raise ValueError("random-relation scheduler is not active")
    for i in range(len(permutation)):
        if permutation[i] < 1 or permutation[i] > len(permutation):
            raise ValueError("invalid random-relation permutation")
        search[i] = permutation[i]
    state[9] = 0
    return len(permutation)


@native
def pari_random_subfactor_ideal(
    basis_table: IntegerBuffer,
    random_state: IntegerBuffer,
    subfactor: IntegerBuffer,
    subfactor_count: int,
    primes: IntegerBuffer,
    ramification: IntegerBuffer,
    residue_degree: IntegerBuffer,
    generators: IntegerBuffer,
    n: int,
    exponents: Int64Buffer,
    generator: IntegerBuffer,
    power_primitive: IntegerBuffer,
    power_temporary: IntegerBuffer,
    power_alpha: IntegerBuffer,
    power_metadata: IntegerBuffer,
    power_diagnostic: IntegerBuffer,
    alpha_table: IntegerBuffer,
    ideal_primitive: IntegerBuffer,
    power_hnf: IntegerBuffer,
    product: IntegerBuffer,
    work: IntegerBuffer,
    triangular: IntegerBuffer,
    moduli: IntegerBuffer,
    next_ideal: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Translate `get_random_ideal` for prepared degree-three/four factors.

    `subfactor` contains one-based factor-base IDs. Descriptor arrays are
    indexed by factor-base ID minus one, and generators use packed `n`-entry
    rows. Exactly one `random_bits(4)` draw is consumed per live subfactor on
    every attempt. Scalar ideals are discarded exactly as upstream does.
    Return the number of attempts; `output` and `exponents` hold the accepted
    random ideal and its powers.
    """
    size = len(primes)
    if n < 3 or n > 4 or subfactor_count < 1 or subfactor_count > len(subfactor):
        raise ValueError("unsupported random subfactor ideal shape")
    if (
        len(ramification) != size
        or len(residue_degree) != size
        or len(generators) < size * n
        or len(exponents) < subfactor_count
        or len(generator) < n
        or len(output) < n * n
        or len(next_ideal) < n * n
        or len(power_hnf) < n * n
    ):
        raise ValueError("short random subfactor ideal storage")
    for i in range(subfactor_count):
        if subfactor[i] < 1 or subfactor[i] > size:
            raise ValueError("random subfactor ID out of range")
        descriptor = subfactor[i] - 1
        if (
            primes[descriptor] < 2
            or primes[descriptor] >= 18446744073709551616
            or ramification[descriptor] < 1
            or residue_degree[descriptor] < 1
            or ramification[descriptor] * residue_degree[descriptor] > n
        ):
            raise ValueError("invalid random subfactor descriptor")
    attempts = 0
    while True:
        attempts += 1
        have_ideal = 0
        for slot in range(subfactor_count):
            exponent = pari_random_word(random_state) >> 60
            exponents[slot] = exponent
            if exponent == 0:
                continue
            descriptor = subfactor[slot] - 1
            for j in range(n):
                generator[j] = generators[descriptor * n + j]
            if have_ideal == 0:
                pari_positive_prime_power_hnf(
                    basis_table,
                    generator,
                    n,
                    primes[descriptor],
                    ramification[descriptor],
                    residue_degree[descriptor],
                    exponent,
                    power_primitive,
                    power_temporary,
                    power_alpha,
                    power_metadata,
                    power_diagnostic,
                    alpha_table,
                    work,
                    triangular,
                    moduli,
                    power_hnf,
                )
                for j in range(n * n):
                    output[j] = power_hnf[j]
                have_ideal = 1
            else:
                pari_positive_prime_power_two(
                    basis_table,
                    generator,
                    n,
                    primes[descriptor],
                    ramification[descriptor],
                    residue_degree[descriptor],
                    exponent,
                    power_primitive,
                    power_temporary,
                    power_alpha,
                    power_metadata,
                    power_diagnostic,
                )
                alpha_is_scalar = 1
                for j in range(1, n):
                    if power_alpha[j] != 0:
                        alpha_is_scalar = 0
                if alpha_is_scalar == 0:
                    pari_basis_multiplication_table(
                        basis_table, power_alpha, n, alpha_table
                    )
                pari_integral_ideal_mul_two(
                    output,
                    alpha_table,
                    power_metadata[0],
                    n,
                    alpha_is_scalar,
                    power_alpha[0],
                    ideal_primitive,
                    product,
                    work,
                    triangular,
                    moduli,
                    next_ideal,
                )
                content = power_metadata[1]
                for j in range(n * n):
                    output[j] = next_ideal[j] * content
        if have_ideal == 0:
            continue
        scalar = 1
        diagonal = output[0]
        for row in range(n):
            for column in range(n):
                value = output[row * n + column]
                if row == column:
                    if value != diagonal:
                        scalar = 0
                elif value != 0:
                    scalar = 0
        if scalar == 0:
            return attempts
