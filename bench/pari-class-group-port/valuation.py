"""Prepared prime-ideal valuation translation from PARI 2.17.4.

Derived from base3.c ZC_nfvalrem and gen2.c gen_lval/rem, gen_pvalrem_DC.
Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared tau is row-major; scalar tau uses the inert flag. No prime
decomposition is supplied by this module. Scratch owners must be disjoint.
"""

from sagejs.native import IntegerBuffer, native


@native
def pari_vector_divide(
    x: IntegerBuffer, y: IntegerBuffer, degree: int, divisor: int
) -> int:
    """Return smallest nonzero quotient lgefint, or zero on failure."""
    minimum = 9223372036854775807
    for i in range(degree):
        a = x[i]
        if a % divisor != 0:
            return 0
        y[i] = a // divisor
        if y[i] != 0:
            size = 2 + (abs(y[i]).bit_length() + 63) // 64
            if size < minimum:
                minimum = size
    return minimum


@native
def pari_vector_strip_dc(
    x: IntegerBuffer, y: IntegerBuffer, stack: IntegerBuffer, degree: int, divisor: int
) -> int:
    """Explicit stack for gen_pvalrem_DC; reduced vector is copied to x.

    Input is nonzero. Preserve recursive division/squaring/unwind order.
    The explicit stack replaces recursive allocation, not the arithmetic.
    """
    current = x
    spare = y
    depth = 0
    q = divisor
    value = 0
    descending = 1
    while descending != 0:
        size = pari_vector_divide(current, spare, degree, q)
        if size == 0:
            value = 0
            descending = 0
        else:
            temporary = current
            current = spare
            spare = temporary
            if 2 * (2 + (q.bit_length() + 63) // 64) <= size + 3:
                if depth >= len(stack):
                    raise ValueError("valuation stack capacity exhausted")
                stack[depth] = q
                depth += 1
                q *= q
            else:
                value = 1
                if pari_vector_divide(current, spare, degree, q) != 0:
                    temporary = current
                    current = spare
                    spare = temporary
                    value = 2
                descending = 0
    while depth > 0:
        depth -= 1
        q = stack[depth]
        value = 2 * value + 1
        if pari_vector_divide(current, spare, degree, q) != 0:
            temporary = current
            current = spare
            spare = temporary
            value += 1
    for i in range(degree):
        x[i] = current[i]
    return value


@native
def pari_vector_strip(
    x: IntegerBuffer, y: IntegerBuffer, stack: IntegerBuffer, degree: int, prime: int
) -> int:
    """Word-prime gen_lvalrem; modifies x to its prime-to-part.

    The p=2 scalar vali leaf currently uses exact repeated halving rather than
    PARI's trailing-zero primitive. This leaf cost is a labeled representation
    difference; it cannot support a language-only performance claim.
    """
    if prime == 2:
        minimum = 9223372036854775807
        for i in range(degree):
            a = abs(x[i])
            if a != 0:
                count = 0
                while a % 2 == 0:
                    a //= 2
                    count += 1
                if count < minimum:
                    minimum = count
                if minimum == 0:
                    return 0
        for i in range(degree):
            x[i] = x[i] >> minimum
        return minimum
    value = 0
    while value < 16:
        if pari_vector_divide(x, y, degree, prime) == 0:
            return value
        for i in range(degree):
            x[i] = y[i]
        value += 1
    value += 2 * pari_vector_strip_dc(x, y, stack, degree, prime * prime)
    if pari_vector_divide(x, y, degree, prime) != 0:
        for i in range(degree):
            x[i] = y[i]
        value += 1
    return value


@native
def pari_prepared_ideal_valuation(
    coordinates: IntegerBuffer,
    tau: IntegerBuffer,
    x: IntegerBuffer,
    y: IntegerBuffer,
    spare: IntegerBuffer,
    stack: IntegerBuffer,
    degree: int,
    prime: int,
    ramification: int,
    inert: int,
) -> int:
    """ZC_nfval's no-remainder path from prepared pr_get_tau data."""
    if degree <= 0 or prime < 2 or prime.bit_length() > 64 or ramification < 1:
        raise ValueError("invalid prepared prime-ideal valuation input")
    nonzero = 0
    for i in range(degree):
        x[i] = coordinates[i]
        if x[i] != 0:
            nonzero = 1
    if nonzero == 0:
        raise ValueError("zero element valuation is not finite")
    if inert != 0:
        if prime == 2:
            return pari_vector_strip(x, y, stack, degree, prime)
        # gen_lval does not take gen_lvalrem's divide-and-conquer branch.
        value = 0
        while True:
            for i in range(degree):
                a = abs(x[i])
                x[i] = a // prime
                if a % prime != 0:
                    return value
            value += 1
    value = 0
    while True:
        for i in range(degree):
            total = tau[i * degree] * x[0]
            for j in range(1, degree):
                term = tau[i * degree + j] * x[j]
                if term != 0:
                    total += term
            if total % prime != 0:
                return value
            y[i] = total // prime
        for i in range(degree):
            x[i] = y[i]
        if value % 16 == 15:
            value += ramification * pari_vector_strip(x, spare, stack, degree, prime)
        value += 1
