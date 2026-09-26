"""PARI 2.17.4 buch2.c GRHchk and initial bound search.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Upstream assumptions are accepted for this experiment, not independently proved.
Prime decompositions and the init_GRHcheck constants remain prepared inputs.
"""

from math import log, pow, sqrt

from sagejs.native import Float64Buffer, IntegerBuffer, checked_float64, native


@native
def pari_grh_inverse_sqrt(value: float) -> float:
    return 1.0 / sqrt(value)


@native
def pari_prepared_grh_check(
    bound: int,
    primes: IntegerBuffer,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    degrees: IntegerBuffer,
    multiplicities: IntegerBuffer,
    constants_logs: Float64Buffer,
    sums: Float64Buffer,
) -> int:
    """Replay GRHchk using sorted distinct residue degrees per rational prime.

    constants_logs begins with cD,cN, followed by the cached prime logarithms.
    The input catalog covers the bound, including one prime beyond it. Missing
    coverage raises rather than reporting failure of the mathematical check.
    sums receives SA,SB for diagnostic comparison; no proof state is published.
    """
    if bound < 1 or bound > 9007199254740992:
        raise ValueError("unsupported prepared GRH bound")
    if len(primes) == 0 or primes[len(primes) - 1] <= bound:
        raise ValueError("prepared GRH prime catalog exhausted")
    log_c = log(checked_float64(bound))
    sa = 0.0
    sb = 0.0
    i = 0
    while i < len(primes):
        p = primes[i]
        if p > bound:
            break
        ratio = log_c / constants_logs[i + 2]
        j = 0
        while j < counts[i]:
            position = offsets[i] + j
            f = degrees[position]
            if checked_float64(f) > ratio:
                break
            log_np = checked_float64(f) * constants_logs[i + 2]
            # upowuu(p,f): the admitted norm is bounded by the checking bound.
            norm = 1
            k = 0
            while k < f:
                norm *= p
                k += 1
            q = pari_grh_inverse_sqrt(checked_float64(norm))
            a = log_np * q
            b = log_np * a
            m = int(ratio / checked_float64(f))
            if m > 1:
                inverse = 1.0 / (1.0 - q)
                a *= (1.0 - pow(q, checked_float64(m))) * inverse
                b *= (
                    (
                        1.0
                        - pow(q, checked_float64(m))
                        * (checked_float64(m + 1) - checked_float64(m) * q)
                    )
                    * inverse
                    * inverse
                )
            number = checked_float64(multiplicities[position])
            sa += number * a
            sb += number * b
            j += 1
        if p == bound:
            break
        i += 1
    sums[0] = sa
    sums[1] = sb
    # At bound=1 the upstream C expression divides positive cN by +0 and
    # compares +infinity. Python division must not introduce an exception.
    if bound == 1:
        if constants_logs[1] <= 0.0:
            raise ValueError("invalid prepared GRH constant")
        return 0
    if constants_logs[0] + (constants_logs[1] + 2.0 * sb) / log_c - 2.0 * sa < -1e-8:
        return 1
    return 0


@native
def pari_prepared_grh_search(
    initial: int,
    maximum: int,
    primes: IntegerBuffer,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    degrees: IntegerBuffer,
    multiplicities: IntegerBuffer,
    constants_logs: Float64Buffer,
    sums: Float64Buffer,
) -> int:
    """Replay Buchall's doubling/bisection and final LIMCMAX clamp.

    initial is max(int(cbach2*LOGD**2),1); maximum is int(4*LOGD**2).
    Catalog exhaustion is incomplete scaffolding, never a negative GRH result.
    """
    if initial < 1 or maximum < 1:
        raise ValueError("invalid prepared GRH search limits")
    high = initial
    low = initial
    while (
        pari_prepared_grh_check(
            high, primes, offsets, counts, degrees, multiplicities, constants_logs, sums
        )
        == 0
    ):
        low = high
        high *= 2
    while high - low > 1:
        test = (low + high) // 2
        if (
            pari_prepared_grh_check(
                test,
                primes,
                offsets,
                counts,
                degrees,
                multiplicities,
                constants_logs,
                sums,
            )
            != 0
        ):
            high = test
        else:
            low = test
    if high == initial + 1:
        if (
            pari_prepared_grh_check(
                initial,
                primes,
                offsets,
                counts,
                degrees,
                multiplicities,
                constants_logs,
                sums,
            )
            != 0
        ):
            high = initial
    if high > maximum:
        high = maximum
    return high
