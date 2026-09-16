"""PARI 2.17.4 initial factor-base preparation from cached decompositions.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This is an upstream-assumed experimental translation, not a proof certificate.
"""

from math import log

from sagejs.native import Float64Buffer, IntegerBuffer, checked_float64, native

from .grh_bound import pari_prepared_grh_search
from .factor_base import pari_prepared_factor_base


@native
def pari_prepared_nthideal(
    degree: int,
    n: int,
    primes: IntegerBuffer,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    degrees: IntegerBuffer,
    multiplicities: IntegerBuffer,
    norms: IntegerBuffer,
) -> int:
    """Replay buch2.c nthideal, including its ordered in-place insertions.

    norms has n+1 slots for the upstream one-based scratch representation.
    Slot zero is scratch (the GEN header is not part of this representation).
    The catalog consists of sorted primes and distinct sorted residue degrees.
    Missing coverage raises; it does not produce a guessed relation bound.
    """
    if n < 1 or degree < 2:
        raise ValueError("invalid prepared nthideal dimension")
    for i in range(1, n + 1):
        norms[i] = 9223372036854775807
    i = 0
    while i < len(primes):
        p = primes[i]
        start = offsets[i]
        if counts[i] < 1:
            raise ValueError("missing prepared prime decomposition")
        if degrees[start] != degree:
            j = counts[i] - 1
            while j >= 0:
                position = start + j
                norm = 1
                exponent = 0
                while exponent < degrees[position]:
                    norm *= p
                    if norm > 18446744073709551615:
                        norm = 0
                        break
                    exponent += 1
                if norm != 0:
                    k = 1
                    while k <= n and norms[k] <= norm:
                        k += 1
                    if k <= n:
                        number = multiplicities[position]
                        # Preserve PARI's forward copy, rather than silently
                        # replacing this with a conventional reverse insertion.
                        for l in range(k + number, n + 1):
                            norms[l] = norms[l - number]
                        l = 0
                        while l < number and k + l <= n:
                            norms[k + l] = norm
                            l += 1
                        while l <= k:
                            norms[l] = norm
                            l += 1
                j -= 1
        if p > norms[n]:
            return norms[n]
        i += 1
    raise ValueError("prepared nthideal prime catalog exhausted")


@native
def pari_prepared_initial_base(
    degree: int,
    real_places: int,
    configuration: Float64Buffer,
    primes: IntegerBuffer,
    pattern_offsets: IntegerBuffer,
    pattern_counts: IntegerBuffer,
    pattern_degrees: IntegerBuffer,
    multiplicities: IntegerBuffer,
    full_offsets: IntegerBuffer,
    full_counts: IntegerBuffer,
    full_degrees: IntegerBuffer,
    norms: IntegerBuffer,
    constants_logs: Float64Buffer,
    sums: Float64Buffer,
    factor_logs: Float64Buffer,
    selected_primes: IntegerBuffer,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    complete_groups: IntegerBuffer,
    selected_indices: IntegerBuffer,
) -> tuple[int, int, int, int, int, int, int]:
    """Connect initial GRH search, nthideal and first FBgen selection.

    configuration contains LOGD, cbach, cbach2. LOGD is the explicit prepared
    dbllog2(abs(discriminant))*M_LN2 scalar. Decompositions remain prepared;
    constants/logs/norms are caller-owned scratch, not externally supplied
    answers. Returns C1,C2,KC,KCZ,KCZ2,KC2,prodZ. SubFB and retry work are not
    included, nor the intervening inverse-residue computation.
    """
    log_d = configuration[0]
    cbach = configuration[1]
    cbach2 = configuration[2]
    if cbach > 12.0:
        if cbach2 < cbach:
            cbach2 = cbach
        cbach = 12.0
    if cbach < 0.0:
        raise ValueError("negative Bach constant")
    log_d_squared = log_d * log_d
    maximum = int(4.0 * log_d_squared)
    initial = int(cbach2 * log_d_squared)
    if initial < 1:
        initial = 1
    pi = 3.141592653589793
    constants_logs[0] = (
        log_d
        - checked_float64(degree) * 3.801387092431
        - checked_float64(real_places) * pi / 2.0
    )
    constants_logs[1] = checked_float64(real_places) * 3.663862376709 + checked_float64(
        degree
    ) * (pi * pi / 2.0)
    for i in range(len(primes)):
        value = log(checked_float64(primes[i]))
        constants_logs[i + 2] = value
        factor_logs[i + 1] = value
    checking = pari_prepared_grh_search(
        initial,
        maximum,
        primes,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        multiplicities,
        constants_logs,
        sums,
    )
    relation = int(cbach * log_d_squared)
    if cbach == 0.0:
        relation = checking
    lower = pari_prepared_nthideal(
        degree,
        degree,
        primes,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        multiplicities,
        norms,
    )
    if relation < lower:
        relation = lower
    if checking < relation:
        checking = relation
    factor_logs[0] = log(checked_float64(checking) + 0.5)
    active, active_primes, all_primes, all_ideals, product = pari_prepared_factor_base(
        degree,
        relation,
        checking,
        primes,
        full_offsets,
        full_counts,
        full_degrees,
        factor_logs,
        selected_primes,
        offsets,
        counts,
        complete_groups,
        selected_indices,
    )
    return relation, checking, active, active_primes, all_primes, all_ideals, product
