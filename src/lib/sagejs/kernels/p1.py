"""Source-transparent exact-integer P1 and Heilbronn algorithms.

The functions in this module are intentionally ordinary CPython source.  They
are a readable transcription of the continued-fraction representative code in
``packages/flint/src/p1.c`` and retain that body as their dynamic fallback.
This module is initially a differential compiler witness; production callers
move here only after the packed output ABI and distribution path are proven.
"""

from __future__ import annotations

from typing import Tuple

from sagejs.native import native, uint64


@native
def p1_gcd(left: int, right: int) -> int:
    """Return a nonnegative greatest common divisor."""
    left = abs(left)
    right = abs(right)
    while right != 0:
        remainder = left % right
        left = right
        right = remainder
    return left


@native
def p1_xgcd_left(left: int, right: int) -> Tuple[int, int]:
    """Return ``gcd(left, right)`` and the Bezout coefficient of ``left``."""
    old_remainder = left
    remainder = right
    old_coefficient = 1
    coefficient = 0
    while remainder != 0:
        quotient = old_remainder // remainder
        next_remainder = old_remainder - quotient * remainder
        next_coefficient = old_coefficient - quotient * coefficient
        old_remainder = remainder
        remainder = next_remainder
        old_coefficient = coefficient
        coefficient = next_coefficient
    return old_remainder, old_coefficient


@native
def p1_normalize_with_scalar(
    level: uint64, input_u: int, input_v: int,
) -> Tuple[bool, int, int, int]:
    """Normalize a pair in ``P^1(Z/level Z)`` and return its unit scalar.

    A false first component denotes a non-projective pair.  This is the same
    algorithm as ``p1_normalize_pair`` in ``p1_core.c``, expressed without
    pointer outputs or fixed-width storage bookkeeping.
    """
    exact_level = level + 0
    if exact_level == 0:
        return False, 0, 0, 0
    if exact_level == 1:
        return True, 0, 0, 1
    u = input_u % exact_level
    v = input_v % exact_level
    if u == 0:
        if p1_gcd(v, exact_level) == 1:
            return True, 0, 1, v
        return False, 0, 0, 0

    gcd_value, bezout = p1_xgcd_left(u, exact_level)
    if p1_gcd(gcd_value, v) != 1:
        return False, 0, 0, 0
    scale = bezout % exact_level
    if gcd_value != 1:
        step = exact_level // gcd_value
        while p1_gcd(scale, exact_level) != 1:
            scale = (scale + step) % exact_level

    u = gcd_value
    v = (scale * v) % exact_level
    minimum_v = v
    minimum_t = 1
    if gcd_value != 1:
        quotient = exact_level // gcd_value
        t = 1
        v_step = (v * quotient) % exact_level
        for _index in range(2, gcd_value + 1):
            v = (v + v_step) % exact_level
            t = (t + quotient) % exact_level
            if v < minimum_v and p1_gcd(t, exact_level) == 1:
                minimum_v = v
                minimum_t = t

    product = (scale * minimum_t) % exact_level
    inverse_gcd, inverse = p1_xgcd_left(product, exact_level)
    if inverse_gcd != 1:
        return False, 0, 0, 0
    scalar = inverse % exact_level
    return True, u, minimum_v, scalar


@native
def p1_round_quotient(numerator: int, denominator: int) -> int:
    """Round a rational number to the nearest integer, away from zero on ties."""
    absolute_numerator = abs(numerator)
    absolute_denominator = abs(denominator)
    quotient = (
        absolute_numerator + absolute_denominator // 2
    ) // absolute_denominator
    if (numerator < 0) == (denominator < 0):
        return quotient
    return -quotient


@native
def heilbronn_cremona_count(prime: uint64) -> int:
    """Count Cremona's continued-fraction Heilbronn representatives for ``T_p``."""
    if prime == 2:
        return 4
    count = 1
    half = prime // 2
    for residue in range(-half, half + 1):
        left = -prime
        right = residue
        count += 1
        while right != 0:
            quotient = p1_round_quotient(left, right)
            remainder = left - right * quotient
            left = -right
            right = remainder
            count += 1
    return count


@native
def heilbronn_cremona_digest(
    prime: uint64,
) -> Tuple[int, int, int, int, int, int]:
    """Return a lossless-enough differential digest of the generated matrices.

    The first component is the matrix count.  The other components are ordered
    polynomial moments.  Tests also use :func:`heilbronn_cremona_entry` to
    compare every generated matrix, so this digest is only a fast benchmark
    interface rather than a substitute for output validation.
    """
    exact_prime = prime + 0
    count = 1
    sum_a = 1
    sum_b = 0
    sum_c = 0
    sum_d = exact_prime
    ordered_moment = exact_prime
    if prime == 2:
        # (2, 0, 0, 1), (2, 1, 0, 1), (1, 0, 1, 2)
        count = 4
        sum_a = 6
        sum_b = 1
        sum_c = 1
        sum_d = 6
        ordered_moment = 61
        return count, sum_a, sum_b, sum_c, sum_d, ordered_moment
    half = prime // 2
    for residue in range(-half, half + 1):
        x1 = exact_prime
        x2 = -residue
        y1 = 0
        y2 = 1
        left = -prime
        right = residue
        count += 1
        sum_a += x1
        sum_b += x2
        sum_c += y1
        sum_d += y2
        ordered_moment += count * (x1 + 3 * x2 + 5 * y1 + 7 * y2)
        while right != 0:
            quotient = p1_round_quotient(left, right)
            remainder = left - right * quotient
            left = -right
            right = remainder
            x3 = quotient * x2 - x1
            x1 = x2
            x2 = x3
            y3 = quotient * y2 - y1
            y1 = y2
            y2 = y3
            count += 1
            sum_a += x1
            sum_b += x2
            sum_c += y1
            sum_d += y2
            ordered_moment += count * (x1 + 3 * x2 + 5 * y1 + 7 * y2)
    return count, sum_a, sum_b, sum_c, sum_d, ordered_moment


@native
def heilbronn_cremona_entry(
    prime: uint64, target: uint64,
) -> Tuple[bool, int, int, int, int]:
    """Return representative ``target`` without maintaining a second algorithm."""
    exact_prime = prime + 0
    position = 0
    if target == position:
        return True, 1, 0, 0, exact_prime
    position += 1
    if prime == 2:
        if target == position:
            return True, 2, 0, 0, 1
        position += 1
        if target == position:
            return True, 2, 1, 0, 1
        position += 1
        if target == position:
            return True, 1, 0, 1, 2
        return False, 0, 0, 0, 0
    half = prime // 2
    for residue in range(-half, half + 1):
        x1 = exact_prime
        x2 = -residue
        y1 = 0
        y2 = 1
        if target == position:
            return True, x1, x2, y1, y2
        position += 1
        left = -prime
        right = residue
        while right != 0:
            quotient = p1_round_quotient(left, right)
            remainder = left - right * quotient
            left = -right
            right = remainder
            x3 = quotient * x2 - x1
            x1 = x2
            x2 = x3
            y3 = quotient * y2 - y1
            y1 = y2
            y2 = y3
            if target == position:
                return True, x1, x2, y1, y2
            position += 1
    return False, 0, 0, 0, 0


@native
def heilbronn_merel_digest(
    index: uint64,
) -> Tuple[int, int, int, int, int, int]:
    """Return ordered moments for Merel's determinant-``index`` matrices."""
    exact_index = index + 0
    count = 0
    sum_a = 0
    sum_b = 0
    sum_c = 0
    sum_d = 0
    ordered_moment = 0
    for a in range(1, exact_index + 1):
        quotient = exact_index // a
        if quotient * a == exact_index:
            d = quotient
            for b in range(0, a):
                count += 1
                sum_a += a
                sum_b += b
                sum_d += d
                ordered_moment += count * (a + 3 * b + 7 * d)
            for c in range(1, d):
                count += 1
                sum_a += a
                sum_c += c
                sum_d += d
                ordered_moment += count * (a + 5 * c + 7 * d)
        for d in range(quotient + 1, exact_index + 1):
            bc = a * d - exact_index
            for c in range(bc // a + 1, d):
                if bc % c == 0:
                    b = bc // c
                    count += 1
                    sum_a += a
                    sum_b += b
                    sum_c += c
                    sum_d += d
                    ordered_moment += count * (a + 3 * b + 5 * c + 7 * d)
    return count, sum_a, sum_b, sum_c, sum_d, ordered_moment


@native
def heilbronn_merel_entry(
    index: uint64, target: uint64,
) -> Tuple[bool, int, int, int, int]:
    """Return one Merel matrix using the source enumeration order."""
    exact_index = index + 0
    position = 0
    for a in range(1, exact_index + 1):
        quotient = exact_index // a
        if quotient * a == exact_index:
            d = quotient
            for b in range(0, a):
                if target == position:
                    return True, a, b, 0, d
                position += 1
            for c in range(1, d):
                if target == position:
                    return True, a, 0, c, d
                position += 1
        for d in range(quotient + 1, exact_index + 1):
            bc = a * d - exact_index
            for c in range(bc // a + 1, d):
                if bc % c == 0:
                    b = bc // c
                    if target == position:
                        return True, a, b, c, d
                    position += 1
    return False, 0, 0, 0, 0
