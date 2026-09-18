"""PARI 2.17.4 integer-basis element multiplication and squaring.

Copyright (C) 2000 The PARI group. GPL-2.0-or-later, without warranty.
Translate `base3.c:_mulii, nfmuli_ZC, nfsqri_ZC` with a prepared maximal-order
multiplication table and disjoint packed input/output buffers. Integer backend
representation replaces GEN allocation; the actual arithmetic source remains
visible. Scalar/type dispatch and rational denominators are external. The
bounded `bb_group.c:gen_powu_i` binary branch connects the two operations;
it is not yet the outer `nfpow` content/type wrapper.
"""

from sagejs.native import IntegerBuffer, native


@native
def pari_integral_field_binary_power(
    table: IntegerBuffer,
    value: IntegerBuffer,
    n: int,
    exponent: int,
    temporary: IntegerBuffer,
    output: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    """gen_powu_i's column-valued left-right branch for 1 <= exponent < 512.

    Report square/multiply counts and a base-four operation trace (1=square,
    2=multiply), preserving their order. A bounded
    bit scan replaces C word normalization; explicit output/scratch copies
    replace GEN aliases and newly allocated result columns. All buffers are
    disjoint. Sliding-window, content and scalar dispatch remain outside.
    """
    if n < 3 or n > 4 or exponent < 1 or exponent >= 512:
        raise ValueError("unsupported integral field binary power domain")
    if len(table) < n * n * n or len(value) < n or len(temporary) < n:
        raise ValueError("insufficient integral field power storage")
    if len(output) < n or len(diagnostic) < 3:
        raise ValueError("insufficient integral field power output storage")
    diagnostic[0] = 0
    diagnostic[1] = 0
    diagnostic[2] = 0
    for i in range(n):
        output[i] = value[i]
    bit = 1
    while bit <= exponent // 2:
        bit *= 2
    bit //= 2
    while bit != 0:
        pari_integral_field_square(table, output, n, temporary)
        diagnostic[0] += 1
        diagnostic[2] = diagnostic[2] * 4 + 1
        for i in range(n):
            output[i] = temporary[i]
        if (exponent // bit) % 2 != 0:
            pari_integral_field_multiply(table, output, value, n, temporary)
            diagnostic[1] += 1
            diagnostic[2] = diagnostic[2] * 4 + 2
            for i in range(n):
                output[i] = temporary[i]
        bit //= 2
    return 0


@native
def pari_nonzero_coefficient_product(coefficient: int, value: int) -> int:
    """_mulii, where the caller has already excluded coefficient zero."""
    if coefficient == 1:
        return value
    if coefficient == -1:
        return -value
    return coefficient * value


@native
def pari_integral_field_multiply(
    table: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
    n: int,
    output: IntegerBuffer,
) -> int:
    """nfmuli_ZC: ordered products in an integral basis whose first entry is 1.

    Table[(i*n+j)*n+k] is the coefficient of w_k in w_i*w_j. All buffers
    are disjoint; this entry is the column/column path, not scalar dispatch.
    """
    if n < 3 or n > 5:
        raise ValueError("unsupported integral field arithmetic degree")
    if len(table) < n * n * n or len(left) < n or len(right) < n or len(output) < n:
        raise ValueError("insufficient integral field arithmetic storage")
    for k in range(n):
        if k == 0:
            total = left[0] * right[0]
        else:
            total = left[0] * right[k] + left[k] * right[0]
        for i in range(1, n):
            xi = left[i]
            if xi == 0:
                continue
            present = False
            partial = 0
            for j in range(1, n):
                coefficient = table[(i * n + j) * n + k]
                if coefficient == 0:
                    continue
                term = pari_nonzero_coefficient_product(coefficient, right[j])
                if present:
                    partial += term
                else:
                    partial = term
                    present = True
            if present:
                total += xi * partial
        output[k] = total
    return 0


@native
def pari_integral_field_square(
    table: IntegerBuffer, value: IntegerBuffer, n: int, output: IntegerBuffer
) -> int:
    """nfsqri_ZC: retain triangular squaring, not general multiplication."""
    if n < 3 or n > 5:
        raise ValueError("unsupported integral field arithmetic degree")
    if len(table) < n * n * n or len(value) < n or len(output) < n:
        raise ValueError("insufficient integral field arithmetic storage")
    for k in range(n):
        if k == 0:
            total = value[0] * value[0]
        else:
            total = (value[0] * value[k]) << 1
        for i in range(1, n):
            xi = value[i]
            if xi == 0:
                continue
            coefficient = table[(i * n + i) * n + k]
            present = coefficient != 0
            partial = 0
            if present:
                partial = pari_nonzero_coefficient_product(coefficient, xi)
            for j in range(i + 1, n):
                coefficient = table[(i * n + j) * n + k]
                if coefficient == 0:
                    continue
                term = pari_nonzero_coefficient_product(coefficient, value[j] << 1)
                if present:
                    partial += term
                else:
                    partial = term
                    present = True
            if present:
                total += xi * partial
        output[k] = total
    return 0
