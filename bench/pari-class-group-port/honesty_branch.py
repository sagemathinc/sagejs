"""Bounded PARI 2.17.4 unequal-bound honesty retry dependencies.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This file translates the resident RNG draw and positive-prime-power ideal
update used after a failed `be_honest` probe.  It deliberately does not claim
the complete `be_honest` loop: automorphism orbits, the connected no-cache
Fincke--Pohst call, and `idealred` remain explicit outer dependencies.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .composite_ideal_hnf import pari_integral_ideal_mul_two
from .pari_random import pari_random_word
from .prime_ideal_power import pari_positive_prime_power_two
from .prime_ideal_hnf import pari_basis_multiplication_table


@native
def pari_honesty_random_powers(
    random_state: IntegerBuffer, count: int, output: Int64Buffer
) -> int:
    """Emit PARI's `random_bits(4)` sequence for honesty retries."""
    if count < 0 or count > 51 or len(output) < count:
        raise ValueError("invalid honesty random-power storage")
    for i in range(count):
        output[i] = pari_random_word(random_state) >> 60
    return count


@native
def pari_honesty_retry_ideal(
    basis_table: IntegerBuffer,
    initial_ideal: IntegerBuffer,
    subfactor_generator: IntegerBuffer,
    n: int,
    prime: int,
    ramification: int,
    residue_degree: int,
    exponent: int,
    power_primitive: IntegerBuffer,
    power_temporary: IntegerBuffer,
    power_alpha: IntegerBuffer,
    power_metadata: IntegerBuffer,
    power_diagnostic: IntegerBuffer,
    alpha_table: IntegerBuffer,
    ideal_primitive: IntegerBuffer,
    product: IntegerBuffer,
    work: IntegerBuffer,
    triangular: IntegerBuffer,
    moduli: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Return `initial_ideal * subfactor_prime**exponent` and its norm.

    This is the one-subfactor, positive-exponent update exercised by the frozen
    unequal-bound fixture.  It follows `idealmulpowprime`: compute the prime
    power in two-element form, remove the input ideal's rational content, run
    `idealHNF_mul_two`, and restore both contents.  The caller starts from the
    original checked ideal on every retry, exactly as `be_honest` does.
    """
    if n < 3 or n > 4 or exponent < 0 or exponent >= 16:
        raise ValueError("unsupported bounded honesty retry")
    if len(initial_ideal) < n * n or len(output) < n * n:
        raise ValueError("short honesty ideal storage")
    if exponent == 0:
        for i in range(n * n):
            output[i] = initial_ideal[i]
    else:
        pari_positive_prime_power_two(
            basis_table,
            subfactor_generator,
            n,
            prime,
            ramification,
            residue_degree,
            exponent,
            power_primitive,
            power_temporary,
            power_alpha,
            power_metadata,
            power_diagnostic,
        )
        alpha_is_scalar = 1
        for i in range(1, n):
            if power_alpha[i] != 0:
                alpha_is_scalar = 0
        if alpha_is_scalar == 0:
            pari_basis_multiplication_table(basis_table, power_alpha, n, alpha_table)
        pari_integral_ideal_mul_two(
            initial_ideal,
            alpha_table,
            power_metadata[0],
            n,
            alpha_is_scalar,
            power_alpha[0],
            ideal_primitive,
            product,
            work,
            triangular,
            moduli,
            output,
        )
        content = power_metadata[1]
        if content != 1:
            for i in range(n * n):
                output[i] *= content
    norm = output[0]
    for i in range(1, n):
        norm *= output[i * n + i]
    return norm
