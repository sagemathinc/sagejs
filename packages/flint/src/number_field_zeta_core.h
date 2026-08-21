#ifndef SAGEJS_NUMBER_FIELD_ZETA_CORE_H
#define SAGEJS_NUMBER_FIELD_ZETA_CORE_H

#include <stdint.h>

#include <flint/fmpz.h>

/*
 * Flat, host-neutral word-prime boundary shared by Node and WebAssembly.
 *
 * ``coefficient_residues`` contains ``prime_count`` consecutive rows of
 * ``degree + 1`` uint32_t coefficients, in ascending polynomial order.  Row
 * ``i`` is reduced modulo ``primes[i]`` and must have monic leading
 * coefficient 1.  The output arrays contain one factor count per row and
 * ``degree`` row-major slots for the exponent and residue degree pairs.
 * Unused output slots are zero.
 *
 * The caller owns every buffer.  Return zero on success, a negative
 * ``SAGEJS_NF_FACTOR_*`` status for a malformed batch, or the one-based row
 * index of a rejected prime/polynomial row.  In particular, no FLINT/GMP
 * representation crosses this boundary and every external size is fixed.
 */
enum sagejs_nf_factor_status
{
    SAGEJS_NF_FACTOR_OK = 0,
    SAGEJS_NF_FACTOR_INVALID_ARGUMENT = -1,
    SAGEJS_NF_FACTOR_UNSUPPORTED_DEGREE = -2,
    SAGEJS_NF_FACTOR_TOO_MANY_PRIMES = -3,
    SAGEJS_NF_FACTOR_SIZE_OVERFLOW = -4,
    SAGEJS_NF_FACTOR_ALLOCATION_FAILED = -5
};

#define SAGEJS_NF_FACTOR_MAX_DEGREE UINT32_C(64)
#define SAGEJS_NF_FACTOR_MAX_PRIMES UINT32_C(65536)

int sagejs_nf_factor_degrees_residue_batch(
    uint16_t *factor_counts,
    uint16_t *exponents,
    uint16_t *degrees,
    const uint32_t *coefficient_residues,
    const uint32_t *primes,
    uint32_t degree,
    uint32_t prime_count);

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
