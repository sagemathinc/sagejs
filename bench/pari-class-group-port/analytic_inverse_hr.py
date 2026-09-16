"""Connected PARI residue-bound selection, inverse residue and hR normalization.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prime decompositions, field signature, discriminant and roots of unity remain
prepared field data. No class-number or regulator answer is an input.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, native
from .residue import pari_prepared_residue_front
from .float_conversion import pari_float_to_real
from .exponential_entry import pari_prepared_exp
from .regulator_normalization import pari_regulator_normalization


@native
def pari_analytic_inverse_hr(
    discriminant: int,
    real_places: int,
    complex_places: int,
    roots_of_unity: int,
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
    log_inverse_residue: Float64Buffer,
    inverse_residue: IntegerBuffer,
    exp_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int, int, int]:
    """Return selected bound, processed primes and inverse-hR real triple.

    Scratch owners are disjoint, with the contracts of the called source
    routines. Exponential and pi caches are distinct, and a/b/p/q/stack are
    reused sequentially. This prepared-data entry is not the buchall driver.
    Later input or resource failures can leave scratch partially mutated.
    """
    if len(inverse_residue) < 3:
        raise ValueError("short inverse-residue owner")
    bound, processed = pari_prepared_residue_front(
        real_places + 2 * complex_places,
        real_places,
        complex_places,
        log_discriminant,
        primes,
        offsets,
        counts,
        degrees,
        multiplicities,
        coefficients,
        table,
        tail,
        logarithms,
        log_inverse_residue,
    )
    xm, xp, xe = pari_float_to_real(log_inverse_residue[0])
    rm, rp, re = pari_prepared_exp(xm, xp, xe, exp_cache, a, b, p, q, stack)
    inverse_residue[0] = rm
    inverse_residue[1] = rp
    inverse_residue[2] = re
    hm, hp, he = pari_regulator_normalization(
        discriminant,
        real_places,
        complex_places,
        roots_of_unity,
        inverse_residue,
        pi_cache,
        a,
        b,
        p,
        q,
        stack,
    )
    return bound, processed, hm, hp, he
