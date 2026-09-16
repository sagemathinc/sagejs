"""PARI 2.17.4 `base2.c:pow_ei_mod_p` and its modular callbacks.

Copyright (C) 2000 The PARI group. GPL-2.0-or-later, without warranty.
The prepared maximal-order multiplication table is an explicit input, not an
`nfinit` implementation. The first integral basis element must be one. Packed
disjoint columns replace GEN allocation. The left-to-right `gen_pow_fold`
callback schedule and `base3.c:zk_ei_mul` arithmetic are retained.
"""

from sagejs.native import IntegerBuffer, native

from .integral_field_arithmetic import (
    pari_integral_field_square,
    pari_nonzero_coefficient_product,
)


@native
def pari_integral_basis_multiply(
    table: IntegerBuffer,
    value: IntegerBuffer,
    n: int,
    basis_index: int,
    output: IntegerBuffer,
) -> int:
    """`zk_ei_mul`: multiply a column by a one-based integral basis element.

    Table[(i*n+j)*n+k] is the coefficient of w_k in w_i*w_j. Owners
    must be disjoint. In particular this is not general field multiplication.
    """
    if n < 3 or n > 4 or basis_index < 1 or basis_index > n:
        raise ValueError("unsupported integral basis multiplication domain")
    if len(table) < n * n * n or len(value) < n or len(output) < n:
        raise ValueError("insufficient integral basis multiplication storage")
    if basis_index == 1:
        for k in range(n):
            output[k] = value[k]
        return 0
    for k in range(n):
        total = 0
        for j in range(n):
            coefficient = table[((basis_index - 1) * n + j) * n + k]
            if coefficient != 0:
                total += pari_nonzero_coefficient_product(coefficient, value[j])
        output[k] = total
    return 0


@native
def pari_integral_basis_frobenius(
    table: IntegerBuffer,
    n: int,
    basis_index: int,
    p: int,
    temporary: IntegerBuffer,
    output: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    """Compute `nf.zk[basis_index]^p mod p` using the source fold callbacks.

    Primehood and a valid integral table are caller preconditions. Positive
    composite controls have the same modular-power meaning. Unlike a word-only
    exponent interface, the bit scan also admits arbitrary-precision p.
    Diagnostic entries count plain sqr callbacks, msqr callbacks, and their
    ordered base-four trace (1=plain sqr, 2=msqr). Each msqr itself performs
    one square, reduction, dedicated basis multiplication, then reduction.
    Output and scratch tails are untouched; all owners must be disjoint.
    """
    if n < 3 or n > 4 or basis_index < 1 or basis_index > n or p < 2:
        raise ValueError("unsupported integral Frobenius domain")
    if len(table) < n * n * n or len(temporary) < n or len(output) < n:
        raise ValueError("insufficient integral Frobenius storage")
    if len(diagnostic) < 3:
        raise ValueError("insufficient integral Frobenius diagnostic storage")
    diagnostic[0] = 0
    diagnostic[1] = 0
    diagnostic[2] = 0
    for k in range(n):
        output[k] = 0
    output[basis_index - 1] = 1
    if basis_index == 1:
        return 0
    bit = 1
    while bit <= p // 2:
        bit *= 2
    bit //= 2
    while bit != 0:
        pari_integral_field_square(table, output, n, temporary)
        for k in range(n):
            temporary[k] %= p
        if (p // bit) % 2 != 0:
            pari_integral_basis_multiply(table, temporary, n, basis_index, output)
            for k in range(n):
                output[k] %= p
            diagnostic[1] += 1
            diagnostic[2] = diagnostic[2] * 4 + 2
        else:
            for k in range(n):
                output[k] = temporary[k]
            diagnostic[0] += 1
            diagnostic[2] = diagnostic[2] * 4 + 1
        bit //= 2
    return 0
