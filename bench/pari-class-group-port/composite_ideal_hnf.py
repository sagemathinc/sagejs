"""PARI 2.17.4 `ZM_hnfmodid` with a positive word-sized modulus.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate `hnf_snf.c:ZM_hnfmodall_i` with MODID and scalar modulus. Retain
column order, pivot insertion, diagonal accumulator and final reductions.
Explicit fixed-capacity workspaces replace column-pointer allocations.
"""

from math import gcd
from sagejs.native import IntegerBuffer, native
from .hnf_word_arithmetic import pari_word_bezout, pari_word_inverse_generator


@native
def pari_signed_remainder(value: int, modulus: int) -> int:
    """PARI remii with positive modulus (truncation, not Python floor)."""
    if value < 0:
        return -((-value) % modulus)
    return value % modulus


@native
def pari_hnf_column_step(
    matrix: IntegerBuffer, n: int, stride: int, j: int, k: int, a: int, b: int
) -> int:
    """ZC_elem without a transformation matrix; a and b are word-sized."""
    if b == 0:
        for i in range(n):
            temporary = matrix[i * stride + j]
            matrix[i * stride + j] = matrix[i * stride + k]
            matrix[i * stride + k] = temporary
        return 0
    d, u, v = pari_word_bezout(a, b)
    if u == 0:
        quotient = -(a // b)
        for i in range(n):
            matrix[i * stride + j] += quotient * matrix[i * stride + k]
        return 0
    if v == 0:
        quotient = -(b // a)
        for i in range(n):
            temporary = matrix[i * stride + j]
            matrix[i * stride + j] = matrix[i * stride + k] + quotient * temporary
            matrix[i * stride + k] = temporary
        return 0
    if d != 1:
        a //= d
        b //= d
    for i in range(n):
        left = matrix[i * stride + j]
        right = matrix[i * stride + k]
        matrix[i * stride + k] = u * left + v * right
        matrix[i * stride + j] = -a * right + b * left
    return 0


@native
def pari_ideal_hnf_mul_two(
    ideal: IntegerBuffer,
    alpha: IntegerBuffer,
    scalar: int,
    n: int,
    product: IntegerBuffer,
    work: IntegerBuffer,
    triangular: IntegerBuffer,
    moduli: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """base4.c idealHNF_mul_two, with a supplied integral alpha table.

    Compute HNF of alpha*ideal | scalar*ideal. The input ideal is integral
    HNF, scalar positive. Scalar alpha, prime powering, outer content removal
    and construction of alpha's table remain caller dependencies.
    """
    if n < 3 or n > 4 or scalar < 1:
        raise ValueError("unsupported two-element ideal product")
    if len(ideal) < n * n or len(alpha) < n * n or len(product) < 2 * n * n:
        raise ValueError("insufficient two-element ideal product storage")
    for i in range(n):
        for j in range(n):
            value = 0
            for k in range(n):
                value += alpha[i * n + k] * ideal[k * n + j]
            product[i * (2 * n) + j] = value
            product[i * (2 * n) + n + j] = scalar * ideal[i * n + j]
    return pari_composite_modulus_hnf(
        product, n, 2 * n, scalar * ideal[0], work, triangular, moduli, output
    )


@native
def pari_composite_modulus_hnf(
    original: IntegerBuffer,
    n: int,
    columns: int,
    modulus: int,
    work: IntegerBuffer,
    triangular: IntegerBuffer,
    moduli: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """HNF of original columns together with modulus*I; return zero.

    Support 3/4 rows and 1..2*n input columns with a positive modulus below
    2**64. Exact entries may be multiword, but a multiword Bezout pivot is an
    explicit unported dependency, not a guessed result. Work stride is 3*n+1,
    triangular stride n+1.
    Buffers must be disjoint. No determinant-only or centered-HNF modes.
    """
    if n < 3 or n > 4 or columns < 1 or columns > 2 * n:
        raise ValueError("unsupported composite HNF shape")
    if modulus < 1 or modulus >= 18446744073709551616:
        raise ValueError("multiword HNF modulus remains unported")
    stride = 3 * n + 1
    ts = n + 1
    if len(original) < n * columns or len(work) < n * stride:
        raise ValueError("insufficient composite HNF input storage")
    if len(triangular) < n * ts or len(moduli) < n or len(output) < n * n:
        raise ValueError("insufficient composite HNF output storage")
    for i in range(n * stride):
        work[i] = 0
    for i in range(n):
        for j in range(columns):
            work[i * stride + j] = original[i * columns + j]
    count = columns
    lower = n - count
    if lower < 0:
        lower = 0
    destination = count - 1
    row = n - 1
    while row >= lower:
        add_modulus = 1
        for j in range(destination):
            a = pari_signed_remainder(work[row * stride + j], modulus)
            work[row * stride + j] = a
            if a == 0:
                continue
            k = j + 1
            b = pari_signed_remainder(work[row * stride + k], modulus)
            work[row * stride + k] = b
            if b == 0:
                pari_hnf_column_step(work, n, stride, j, k, a, b)
                continue
            if add_modulus != 0:
                add_modulus = 0
                if a != 1:
                    a, unit = pari_word_inverse_generator(a, modulus)
                    for t in range(row):
                        work[t * stride + j] = work[t * stride + j] * unit % modulus
                    work[row * stride + j] = a
                    # Upstream's 2*lg(a)<lg(b) shortcut cannot hold for these
                    # reduced word operands (both integer lengths <=3).
            pari_hnf_column_step(work, n, stride, j, k, a, b)
            for t in range(row):
                if abs(work[t * stride + j]) >= 340282366920938463463374607431768211456:
                    work[t * stride + j] = pari_signed_remainder(
                        work[t * stride + j], modulus
                    )
                if abs(work[t * stride + k]) >= 340282366920938463463374607431768211456:
                    work[t * stride + k] = pari_signed_remainder(
                        work[t * stride + k], modulus
                    )
        if work[row * stride + destination] == 0:
            for j in range(count - 1, destination, -1):
                for t in range(n):
                    work[t * stride + j + 1] = work[t * stride + j]
            for t in range(n):
                work[t * stride + destination + 1] = 0
            work[row * stride + destination + 1] = modulus
            count += 1
            destination += 1
            lower -= 1
            if lower < 0:
                lower = 0
        row -= 1
        destination -= 1
    for i in range(n * ts):
        triangular[i] = 0
    if count < n:
        missing = n - count
        for i in range(missing):
            triangular[i * ts + i] = modulus
        for j in range(count):
            for i in range(n):
                triangular[i * ts + missing + j] = work[i * stride + j]
    else:
        for j in range(n):
            for i in range(n):
                triangular[i * ts + j] = work[i * stride + count - n + j]
    triangular[0] = gcd(triangular[0], modulus)
    for i in range(n):
        moduli[i] = modulus
    moduli[0] = triangular[0]
    for i in range(1, n - 1):
        candidate = abs(moduli[i - 1] * triangular[i * ts + i])
        if candidate >= modulus:
            break
        moduli[i] = candidate
    for i in range(n - 1, -1, -1):
        triangular[i * ts + n] = modulus
        for j in range(i, -1, -1):
            a = triangular[j * ts + n]
            if a == 0:
                continue
            pari_hnf_column_step(triangular, n, ts, n, j, a, triangular[j * ts + j])
            for k in range(j):
                triangular[k * ts + n] %= modulus
                triangular[k * ts + j] %= modulus
    for i in range(n - 1, -1, -1):
        diagonal = triangular[i * ts + i]
        if diagonal < 0:
            for k in range(n):
                triangular[k * ts + i] = -triangular[k * ts + i]
            diagonal = -diagonal
        if i != n - 1:
            for k in range(i):
                triangular[k * ts + i] = pari_signed_remainder(
                    triangular[k * ts + i], moduli[k]
                )
        for j in range(i + 1, n):
            value = pari_signed_remainder(triangular[i * ts + j], moduli[i])
            quotient = value // diagonal
            for k in range(i):
                triangular[k * ts + j] -= quotient * triangular[k * ts + i]
            triangular[i * ts + j] = value % diagonal
    for i in range(n):
        for j in range(n):
            output[i * n + j] = triangular[i * ts + j]
    return 0
