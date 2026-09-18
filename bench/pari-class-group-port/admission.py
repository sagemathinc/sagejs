"""Connected initial factorgen/can_factor stages from PARI 2.17.4 buch2.c.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This is not complete relation admission: prime-ideal division remains pending.
"""

from sagejs.native import IntegerBuffer, native
from .short_product import pari_prepared_factorgen_numerical, pari_prime_to_part
from .factorization import pari_smooth_factor_from_catalog, pari_word_factor_front


@native
def pari_prepared_admission_front(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    coefficients: IntegerBuffer,
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    degree: int,
    real_count: int,
    ideal_norm: int,
    factor_product: int,
    primes: IntegerBuffer,
    products: IntegerBuffer,
    factorlimit: int,
    prime_limit: int,
    factor_primes: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    previous_count: int,
) -> tuple[int, int, int, int, int]:
    """Return stage, rounded norm, rounding error, factor count, residual.

    Stages: 0 numerical rejection; 1 nonsmooth; 2 unresolved factorization;
    3 rational norm factored (NOT a successfully admitted relation).
    Numerical rejection preserves the previous factor count, as factorgen
    does not enter can_factor's count reset. Later stages reset that count.
    The output factors here are rational primes, not factor-base indices.
    """
    norm, error, proceed = pari_prepared_factorgen_numerical(
        matrix_m,
        matrix_p,
        matrix_e,
        coefficients,
        embedding_m,
        embedding_p,
        embedding_e,
        degree,
        real_count,
        ideal_norm,
    )
    if proceed == 0:
        return 0, norm, error, previous_count, 1
    stage, count, residual = pari_prepared_factor_norm(
        norm,
        factor_product,
        primes,
        products,
        factorlimit,
        prime_limit,
        factor_primes,
        factor_exponents,
    )
    return stage, norm, error, count, residual


@native
def pari_prepared_factor_norm(
    norm: int,
    factor_product: int,
    primes: IntegerBuffer,
    products: IntegerBuffer,
    factorlimit: int,
    prime_limit: int,
    factor_primes: IntegerBuffer,
    factor_exponents: IntegerBuffer,
) -> tuple[int, int, int]:
    """can_factor through absZ_factor: stage, rational factor count, residual.

    Stages remain 1 nonsmooth, 2 unresolved factorization, 3 norm factored.
    """
    absolute_norm = abs(norm)
    if absolute_norm == 1:
        return 3, 0, 1
    if absolute_norm == 0 or factor_product < 1:
        raise ValueError(
            "admission front requires nonzero norm and positive factor product"
        )
    if abs(pari_prime_to_part(norm, factor_product)) != 1:
        return 1, 0, absolute_norm
    if absolute_norm.bit_length() > 64:
        count, residual = pari_smooth_factor_from_catalog(
            absolute_norm,
            primes,
            factor_primes,
            factor_exponents,
            0,
        )
        if residual != 1:
            return 2, count, residual
        return 3, count, 1
    count, residual = pari_word_factor_front(
        absolute_norm,
        primes,
        products,
        factorlimit,
        prime_limit,
        factor_primes,
        factor_exponents,
        0,
        1,
    )
    if residual != 1:
        return 2, count, residual
    return 3, count, 1
