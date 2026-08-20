#ifndef SAGEJS_NUMBER_FIELD_ZETA_CORE_H
#define SAGEJS_NUMBER_FIELD_ZETA_CORE_H

#include <stdint.h>

#include <flint/fmpz.h>

/*
 * Factor one monic integer polynomial modulo several primes.  Each output
 * row has ``degree`` slots; only the first ``factor_counts[row]`` are used.
 * Return zero on success, or the one-based index of the failing prime.
 */
int sagejs_nf_factor_degrees_batch(
    uint64_t *factor_counts,
    uint64_t *exponents,
    uint64_t *degrees,
    const fmpz *coefficients,
    slong coefficient_count,
    const uint64_t *primes,
    slong prime_count);

#endif
