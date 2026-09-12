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


if __name__ == "__main__":
    coefficients = [int(x) for x in sys.argv[1].split(",")]
    print(json.dumps(audit(coefficients, int(sys.argv[2]), int(sys.argv[3]))))
