"""PARI 2.17.4 positive prime-ideal powers in two-element and HNF form.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate `base4.c:idealpowprime, idealsqrprime, idealhnf_two` on prepared
prime descriptors, retaining the upstream first/square/general branches.
Integer arithmetic and packed ownership replace GEN allocation. Prime
decomposition is outside; no powered ideal is supplied as an input answer.
"""

from math import gcd
from sagejs.native import IntegerBuffer, native
from .integral_power import (
    pari_integral_element_power,
    pari_nonnegative_integer_power,
)
from .integral_field_arithmetic import pari_integral_field_square
from .prime_ideal_hnf import pari_basis_multiplication_table
from .composite_ideal_hnf import pari_composite_modulus_hnf


@native
def pari_positive_prime_power_two(
    table: IntegerBuffer,
    generator: IntegerBuffer,
    n: int,
    prime: int,
    ramification: int,
    residue_degree: int,
    exponent: int,
    primitive: IntegerBuffer,
    temporary: IntegerBuffer,
    alpha: IntegerBuffer,
    metadata: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    """Return pr**exponent = content*(q,alpha), with explicit result metadata.

    metadata=(q,content,alpha_is_scalar). A NULL upstream content is encoded
    by 1; alpha always occupies n entries, even for a scalar. Prepared prime
    descriptors must be valid. Support positive exponents below 512 and n=3/4.
    All buffers are disjoint. Negative powers/inverse tau are not this path.
    """
    if n < 3 or n > 4 or prime < 2 or prime >= 18446744073709551616:
        raise ValueError("unsupported positive prime power domain")
    if ramification < 1 or residue_degree < 1 or ramification * residue_degree > n:
        raise ValueError("invalid prime power descriptor")
    if exponent < 1 or exponent >= 512:
        raise ValueError("unsupported positive prime power exponent")
    if len(alpha) < n or len(metadata) < 3 or len(diagnostic) < 3:
        raise ValueError("insufficient positive prime power output")
    q = prime
    content = 1
    scalar = 0
    unit_pair = False
    for i in range(3):
        diagnostic[i] = 0
    if exponent == 1:
        if residue_degree == n:
            content = prime
            q = 1
            scalar = 1
            unit_pair = True
        else:
            if len(generator) < n:
                raise ValueError("insufficient prime power generator")
            for i in range(n):
                alpha[i] = generator[i]
    elif exponent == 2:
        if ramification == 1:
            q = prime * prime
        if ramification <= 2 and ramification * residue_degree == n:
            content = q
            q = 1
            scalar = 1
            unit_pair = True
        else:
            pari_integral_field_square(table, generator, n, alpha)
            for i in range(n):
                alpha[i] %= q
    else:
        quotient = exponent // ramification
        remainder = exponent % ramification
        if ramification * residue_degree == n:
            if quotient != 0:
                content = pari_nonnegative_integer_power(prime, quotient)
            if remainder == 0:
                q = 1
                scalar = 1
                unit_pair = True
            else:
                scalar = pari_integral_element_power(
                    table,
                    generator,
                    n,
                    remainder,
                    primitive,
                    temporary,
                    alpha,
                    diagnostic,
                )
                for i in range(n):
                    alpha[i] %= q
        else:
            if remainder != 0:
                quotient += 1
            q = pari_nonnegative_integer_power(prime, quotient)
            scalar = pari_integral_element_power(
                table, generator, n, exponent, primitive, temporary, alpha, diagnostic
            )
            for i in range(n):
                alpha[i] %= q
    if unit_pair:
        for i in range(n):
            alpha[i] = 0
    metadata[0] = q
    metadata[1] = content
    metadata[2] = scalar
    return 0


@native
def pari_positive_prime_power_hnf(
    table: IntegerBuffer,
    generator: IntegerBuffer,
    n: int,
    prime: int,
    ramification: int,
    residue_degree: int,
    exponent: int,
    primitive: IntegerBuffer,
    temporary: IntegerBuffer,
    alpha: IntegerBuffer,
    metadata: IntegerBuffer,
    diagnostic: IntegerBuffer,
    multiplication: IntegerBuffer,
    work: IntegerBuffer,
    triangular: IntegerBuffer,
    moduli: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Prime branch of idealpow_aux: two-element form, HNF, restore content.

    The existing composite HNF entry still rejects modulus >=2**64. This
    explicit dependency limit is not a new mathematical stopping criterion.
    """
    if n < 3 or n > 4 or len(output) < n * n:
        raise ValueError("insufficient prime power HNF output")
    pari_positive_prime_power_two(
        table,
        generator,
        n,
        prime,
        ramification,
        residue_degree,
        exponent,
        primitive,
        temporary,
        alpha,
        metadata,
        diagnostic,
    )
    q = metadata[0]
    content = metadata[1]
    # zk_scalar_or_multable scalarizes a column too, without changing the
    # two-element result tag retained in metadata.
    scalar = True
    for i in range(1, n):
        if alpha[i] != 0:
            scalar = False
            break
    if scalar:
        diagonal = gcd(q, alpha[0])
        for i in range(n * n):
            output[i] = 0
        for i in range(n):
            output[i * n + i] = diagonal
    else:
        pari_basis_multiplication_table(table, alpha, n, multiplication)
        pari_composite_modulus_hnf(
            multiplication, n, n, q, work, triangular, moduli, output
        )
    if content != 1:
        for i in range(n * n):
            output[i] *= content
    return 0
