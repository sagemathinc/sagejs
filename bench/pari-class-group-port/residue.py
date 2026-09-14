"""PARI 2.17.4 compute_invres binary64 accumulation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The final mpexp(dbltor(loginvres)) is not replaced by binary64 exp here.
"""

from math import log, pow

from sagejs.native import Float64Buffer, IntegerBuffer, checked_float64, native

from .residue_bound import pari_prepared_primeneeded


@native
def pari_prepared_residue_front(
    degree: int,
    r1: int,
    r2: int,
    log_discriminant: Float64Buffer,
    primes: IntegerBuffer,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    degrees: IntegerBuffer,
    multiplicities: IntegerBuffer,
    coefficients: Float64Buffer,
    table: Float64Buffer,
    tail: Float64Buffer,
    logarithms: Float64Buffer,
    output: Float64Buffer,
) -> tuple[int, int]:
    """Select the residue bound and accumulate its logarithm in one call.

    Decompositions and LOGD remain prepared; all other buffers are scratch.
    Return selected bound and processed rational-prime count. Final PARI-real
    exponential and hR normalization are not part of this connected front.
    """
    bound = pari_prepared_primeneeded(
        degree, r1, r2, log_discriminant, coefficients, table, tail
    )
    for i in range(len(primes)):
        logarithms[i] = log(checked_float64(primes[i]))
    processed = pari_prepared_log_inverse_residue(
        bound, primes, offsets, counts, degrees, multiplicities, logarithms, output
    )
    return bound, processed


@native
def pari_prepared_log_inverse_residue(
    bound: int,
    primes: IntegerBuffer,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    degrees: IntegerBuffer,
    multiplicities: IntegerBuffer,
    logarithms: Float64Buffer,
    output: Float64Buffer,
) -> int:
    """Compute loginvres, the input to PARI's final real exponential.

    logarithms contains one cached logarithm per rational prime. The catalog
    must include a prime beyond bound; missing coverage is an input error.
    Return the number of rational primes processed for diagnostic comparison.
    """
    if bound < 2 or bound > 67108864:
        raise ValueError("unsupported prepared inverse-residue bound")
    # This explicit experimental range keeps p*p exactly convertible to
    # binary64. It is not a changed mathematical bound or a silent clamp.
    if len(primes) == 0 or primes[len(primes) - 1] <= bound:
        raise ValueError("prepared inverse-residue catalog exhausted")
    limit = checked_float64(bound)
    log_limit = log(limit)
    log_limit_squared = log_limit * log_limit
    denominator = 1.0 / (pow(limit, 3.0) * log_limit * log_limit_squared)
    c2 = (log_limit_squared + 3.0 * log_limit / 2.0 + 1.0) * denominator
    denominator *= limit
    c1 = (3.0 * log_limit_squared + 4.0 * log_limit + 2.0) * denominator
    denominator *= limit
    c0 = (3.0 * log_limit_squared + 5.0 * log_limit / 2.0 + 1.0) * denominator
    result = 0.0
    i = 0
    while i < len(primes):
        log_p = logarithms[i]
        power_limit = int(log_limit / log_p)
        if power_limit < 1:
            break
        p = primes[i]
        p_squared = p * p
        real_p = checked_float64(p)
        real_p_squared = checked_float64(p_squared)
        result += 1.0 / real_p
        norm_power = real_p
        k = 2
        while k <= power_limit:
            norm_power *= real_p
            result += 1.0 / (checked_float64(k) * norm_power)
            k += 1
        psi = power_limit
        psi1 = (
            real_p
            * (pow(real_p, checked_float64(power_limit)) - 1.0)
            / checked_float64(p - 1)
        )
        psi2 = (
            real_p_squared
            * (pow(real_p_squared, checked_float64(power_limit)) - 1.0)
            / checked_float64(p_squared - 1)
        )
        j = counts[i] - 1
        while j >= 0:
            position = offsets[i] + j
            f = degrees[position]
            if f <= power_limit:
                number = multiplicities[position]
                real_f = checked_float64(f)
                real_number = checked_float64(number)
                norm = pow(real_p, real_f)
                contribution = 1.0 / norm
                max_power = power_limit // f
                norm_power = norm
                k = 2
                while k <= max_power:
                    norm_power *= norm
                    contribution += 1.0 / (checked_float64(k) * norm_power)
                    k += 1
                norm_squared = norm * norm
                result -= real_number * contribution
                psi -= number * f * max_power
                psi1 -= real_number * (
                    real_f
                    * norm
                    * (pow(norm, checked_float64(max_power)) - 1.0)
                    / (norm - 1.0)
                )
                psi2 -= real_number * (
                    real_f
                    * norm_squared
                    * (pow(norm_squared, checked_float64(max_power)) - 1.0)
                    / (norm_squared - 1.0)
                )
            j -= 1
        result -= (checked_float64(psi) * c0 - psi1 * c1 + psi2 * c2) * log_p
        i += 1
    output[0] = result
    return i
