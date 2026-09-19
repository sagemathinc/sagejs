"""PARI 2.17.4 buch2.c can_factor with explicit incomplete factorization.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared prime decompositions are inputs; no factor-base selection here.
"""

from sagejs.native import (
    IntegerBuffer,
    checked_int64,
    diagnostic_stage_switch,
    int64,
    native,
)
from .admission import pari_prepared_factor_norm
from .valuation import pari_prepared_divide_prime_at
from .short_product import pari_prepared_factorgen_numerical


@native
def pari_prepared_factorgen(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    real_count: int,
    ideal_norm: int,
    coordinates: IntegerBuffer,
    ideal: IntegerBuffer,
    mode: int,
    degree: int,
    factor_product: int,
    primes: IntegerBuffer,
    products: IntegerBuffer,
    factorlimit: int,
    prime_limit: int,
    rational_factors: IntegerBuffer,
    rational_exponents: IntegerBuffer,
    prime_offsets: IntegerBuffer,
    prime_counts: IntegerBuffer,
    group_tau: IntegerBuffer,
    group_e: IntegerBuffer,
    group_f: IntegerBuffer,
    group_inert: IntegerBuffer,
    tau: IntegerBuffer,
    x: IntegerBuffer,
    y: IntegerBuffer,
    spare: IntegerBuffer,
    stack: IntegerBuffer,
    primitive: IntegerBuffer,
    columns: IntegerBuffer,
    values: IntegerBuffer,
    temporary: IntegerBuffer,
    indices: IntegerBuffer,
    exponents: IntegerBuffer,
    previous_count: int,
    bounded_real: int,
) -> tuple[int, int, int, int64, int]:
    """Connected prepared factorgen, with status 2 for unported factoring.

    Return status, rounded norm, rounding error exponent, count and residual.
    Mode zero represents absent I/NI; mode two is an integral element/ideal
    quotient with ideal_norm = norm(I). No factor-base selection is performed.
    """
    if mode != 0 and mode != 2:
        raise ValueError("factorgen requires an element or element/ideal quotient")
    diagnostic_stage_switch(1)
    norm, error, proceed = pari_prepared_factorgen_numerical(
        matrix_m,
        matrix_p,
        matrix_e,
        coordinates,
        embedding_m,
        embedding_p,
        embedding_e,
        degree,
        real_count,
        ideal_norm,
        bounded_real,
    )
    if proceed == 0:
        diagnostic_stage_switch(0)
        return 0, norm, error, checked_int64(previous_count), 1
    diagnostic_stage_switch(2)
    status, count, residual = pari_prepared_can_factor(
        norm,
        coordinates,
        ideal,
        mode,
        degree,
        factor_product,
        primes,
        products,
        factorlimit,
        prime_limit,
        rational_factors,
        rational_exponents,
        prime_offsets,
        prime_counts,
        group_tau,
        group_e,
        group_f,
        group_inert,
        tau,
        x,
        y,
        spare,
        stack,
        primitive,
        columns,
        values,
        temporary,
        indices,
        exponents,
    )
    diagnostic_stage_switch(0)
    return status, norm, error, count, residual


@native
def pari_prepared_can_factor(
    norm: int,
    coordinates: IntegerBuffer,
    ideal: IntegerBuffer,
    mode: int,
    degree: int,
    factor_product: int,
    primes: IntegerBuffer,
    products: IntegerBuffer,
    factorlimit: int,
    prime_limit: int,
    rational_factors: IntegerBuffer,
    rational_exponents: IntegerBuffer,
    prime_offsets: IntegerBuffer,
    prime_counts: IntegerBuffer,
    group_tau: IntegerBuffer,
    group_e: IntegerBuffer,
    group_f: IntegerBuffer,
    group_inert: IntegerBuffer,
    tau: IntegerBuffer,
    x: IntegerBuffer,
    y: IntegerBuffer,
    spare: IntegerBuffer,
    stack: IntegerBuffer,
    primitive: IntegerBuffer,
    columns: IntegerBuffer,
    values: IntegerBuffer,
    temporary: IntegerBuffer,
    indices: IntegerBuffer,
    exponents: IntegerBuffer,
) -> tuple[int, int64, int]:
    """Return status, factor-base entry count, unresolved rational cofactor.

    Status 0 is PARI rejection, 1 PARI success, 2 an unported factoring path.
    Reset count on entry, preserving partial prime-ideal writes on rejection.
    Offsets/counts are indexed by rational prime, just as F->LV/F->iLP are.
    An offset is both the start in the flattened group storage and the
    zero-based global factor-base offset; published indices are one-based.
    """
    diagnostic_stage_switch(3)
    stage, rational_count, residual = pari_prepared_factor_norm(
        norm,
        factor_product,
        primes,
        products,
        factorlimit,
        prime_limit,
        rational_factors,
        rational_exponents,
    )
    if stage == 1:
        diagnostic_stage_switch(0)
        return 0, checked_int64(0), 1
    if stage == 2:
        diagnostic_stage_switch(0)
        return 2, checked_int64(0), residual
    diagnostic_stage_switch(4)
    count: int64 = 0
    for i in range(rational_count):
        prime = rational_factors[i]
        if prime >= len(prime_offsets) or prime_offsets[prime] < 0:
            raise ValueError(
                "factored rational prime missing from prepared factor base"
            )
        offset = prime_offsets[prime]
        accepted, count = pari_prepared_divide_prime_at(
            coordinates,
            ideal,
            group_tau,
            group_e,
            group_f,
            group_inert,
            tau,
            x,
            y,
            spare,
            stack,
            primitive,
            columns,
            values,
            temporary,
            indices,
            exponents,
            checked_int64(degree),
            checked_int64(prime),
            checked_int64(prime_counts[prime]),
            checked_int64(offset),
            checked_int64(rational_exponents[i]),
            checked_int64(mode),
            checked_int64(count),
            checked_int64(offset),
        )
        if accepted == 0:
            diagnostic_stage_switch(0)
            return 0, count, 1
    diagnostic_stage_switch(0)
    return 1, count, 1
