"""Exact rational diagnostic of replacing the BF scale X/9 by floor(X/9).

This checks a formula discrepancy, not class-group correctness. The caller
must separately establish that the defining order is maximal before treating
polynomial factor degrees as the field's prime splitting data.
"""

import json
import math
import sys
from fractions import Fraction as Q


def add(a, b):
    return a[0] + b[0], a[1] + b[1]


def neg(a):
    return -a[1], -a[0]


def sub(a, b):
    return add(a, neg(b))


def mul(a, b):
    values = [x * y for x in a for y in b]
    return min(values), max(values)


def point(x):
    return Q(x), Q(x)


def div(a, b):
    assert b[0] > 0
    return mul(a, (1 / b[1], 1 / b[0]))


def sqrt_bounds(a, bits=160):
    assert a[0] >= 0
    scale = 1 << bits
    lower = math.isqrt(a[0].numerator * scale * scale // a[0].denominator)
    upper = math.isqrt(a[1].numerator * scale * scale // a[1].denominator) + 1
    return Q(lower, scale), Q(upper, scale)


def log_unit(x, terms=96):
    """Enclose log(x) for 1 <= x <= 2 by a positive atanh series."""
    assert 1 <= x <= 2
    t = (x - 1) / (x + 1)
    power = t
    total = Q(0)
    for k in range(terms):
        total += 2 * power / (2 * k + 1)
        power *= t * t
    tail = 2 * power / ((2 * terms + 1) * (1 - t * t))
    return total, total + tail


def log_bounds(x):
    x = Q(x)
    assert x >= 1
    exponent = 0
    while x >= 2:
        x /= 2
        exponent += 1
    return add(log_unit(x), mul(point(exponent), log_unit(Q(2))))


def residue_degrees(coefficients, prime):
    """Factor a monic cubic enough to recover distinct residue degrees."""
    polynomial = [x % prime for x in coefficients]
    degrees = []
    for root in range(prime):
        distinct = False
        while len(polynomial) > 1:
            value = 0
            for coefficient in reversed(polynomial):
                value = (value * root + coefficient) % prime
            if value:
                break
            if not distinct:
                degrees.append(1)
                distinct = True
            quotient = [0] * (len(polynomial) - 1)
            quotient[-1] = polynomial[-1]
            for i in range(len(quotient) - 2, -1, -1):
                quotient[i] = (polynomial[i + 1] + root * quotient[i + 1]) % prime
            polynomial = quotient
    if len(polynomial) > 1:
        degrees.append(len(polynomial) - 1)
    return degrees


def coefficient_sum(coefficients, cutoff):
    """Sum K-minus-Q 1/(m Np^m) for Np^m <= cutoff exactly."""
    total = Q(0)
    for prime in range(2, cutoff + 1):
        if any(prime % d == 0 for d in range(2, math.isqrt(prime) + 1)):
            continue
        degrees = [(d, 1) for d in residue_degrees(coefficients, prime)]
        degrees.append((1, -1))
        for degree, sign in degrees:
            norm = prime**degree
            power = norm
            exponent = 1
            while power <= cutoff:
                total += Q(sign, exponent * power)
                power *= norm
                exponent += 1
    return total


def audit(coefficients, discriminant, threshold):
    assert len(coefficients) == 4 and coefficients[3] == 1
    assert discriminant < 0 and threshold >= 69
    x = Q(threshold)
    y = x / 9
    q = threshold // 9
    # At an integer boundary n^m=q, its B(q) summand is exactly zero.
    # No integer norm power lies strictly between q and y < q+1.
    a = coefficient_sum(coefficients, q)
    log_y = log_bounds(y)
    log_q = log_bounds(Q(q))
    log_d = log_bounds(Q(-discriminant))
    denominator = mul(sqrt_bounds(point(x)), log_bounds(3 * x))
    multiplier = div(point(Q(3, 2)), denominator)
    difference_weight = sub(
        mul(sqrt_bounds(point(y)), log_y),
        mul(sqrt_bounds(point(q)), log_q),
    )
    finite_displacement = mul(mul(multiplier, difference_weight), point(a))
    # Difference of the two Theorem-1 tail formulas: all other terms cancel.
    factor = add(point(1), div(point(2), sqrt_bounds(log_d)))
    extra_tail = mul(
        mul(
            div(mul(point(Q(581, 250)), log_d), denominator),
            mul(point(Q(97, 25)), mul(factor, factor)),
        ),
        sub(div(point(1), log_q), div(point(1), log_y)),
    )
    displacement_exceeds_extra_tail = (
        finite_displacement[0] > extra_tail[1]
        or -finite_displacement[1] > extra_tail[1]
    )
    return {
        "coefficients": coefficients,
        "discriminant": discriminant,
        "threshold": threshold,
        "coefficient_sum": str(a),
        "finite_displacement": [str(v) for v in finite_displacement],
        "extra_tail": [str(v) for v in extra_tail],
        "displacement_exceeds_extra_tail": displacement_exceeds_extra_tail,
        "approximate_display_only": {
            "finite_displacement": [float(v) for v in finite_displacement],
            "extra_tail": [float(v) for v in extra_tail],
        },
    }


def audit_corollary_specialization():
    """Audit printed Theorem-7 constants at sigma=3/2 with exact fractions.

    This is not a counterexample to Corollary 8: a separate stronger estimate
    could justify it. It checks whether direct substitution and outward
    rounding produce its printed constants. No numerical CAS is required.
    """

    def atan_inverse(n):
        # An even alternating-series prefix ends below arctan(1/n).
        terms = 32
        lower = sum(
            (Q((-1) ** k, (2 * k + 1) * n ** (2 * k + 1)) for k in range(terms)),
            Q(0),
        )
        return lower, lower + Q(1, (2 * terms + 1) * n ** (2 * terms + 1))

    # Machin's formula, with signed interval multiplication.
    pi = sub(mul(point(16), atan_inverse(5)), mul(point(4), atan_inverse(239)))
    log_pi = log_bounds(pi[0])[0], log_bounds(pi[1])[1]
    log_two = log_bounds(2)
    count = 1000
    harmonic = sum((Q(1, k) for k in range(1, count + 1)), Q(0))
    # 1/(2(n+1)) < H_n-log(n)-gamma < 1/(2n).
    euler = sub(
        sub(point(harmonic), log_bounds(count)),
        (Q(1, 2 * (count + 1)), Q(1, 2 * count)),
    )
    constant = add(
        point(Q(35, 6)),
        div(sub(euler, add(mul(point(2), log_two), log_pi)), point(4)),
    )
    # psi(3/2)=2-gamma-2log(2), by recurrence and duplication.
    degree = add(sub(euler, point(2)), add(mul(point(3), log_two), log_pi))
    # (psi(5/4)-psi(3/4))/2=2-pi/2, by recurrence and reflection.
    real_place = sub(point(2), div(pi, point(2)))
    assert constant[0] > Q(5344, 1000) > Q(335, 100)
    assert degree[0] > Q(1801, 1000)
    assert real_place[1] < Q(430, 1000) < Q(619, 1000)
    assert constant[1] < Q(535, 100) and real_place[0] > Q(429, 1000)

    def report(interval):
        # Short rational outward endpoints avoid multi-thousand-digit output.
        scale = 10**12
        lo, hi = interval
        lower = Q(lo.numerator * scale // lo.denominator, scale)
        upper = Q(-((-hi.numerator * scale) // hi.denominator), scale)
        assert lower <= lo <= hi <= upper
        return {
            "lower": str(lower),
            "upper": str(upper),
            "approximate_display_only": [float(lo), float(hi)],
        }

    return {
        "exact_rational_audit": True,
        "corollary_counterexample": False,
        "certifies_class_groups": False,
        "sigma": "3/2",
        "constant": report(constant),
        "degree_coefficient": report(degree),
        "real_place_coefficient": report(real_place),
        "complex_cubic_constant": report(
            sub(sub(constant, mul(point(3), degree)), real_place)
        ),
        "conservative_roundings": ["5.35", "1.801", "0.429"],
        "printed_corollary": ["3.35", "1.801", "0.619"],
    }


if __name__ == "__main__":
    if sys.argv[1:] == ["--corollary-specialization"]:
        print(json.dumps(audit_corollary_specialization()))
    else:
        coefficients = [int(x) for x in sys.argv[1].split(",")]
        print(json.dumps(audit(coefficients, int(sys.argv[2]), int(sys.argv[3]))))
