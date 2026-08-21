/*
 * Compact good-prime factor-degree data for Dedekind zeta coefficients.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 */

#include "number_field_zeta_core.h"

#include <limits.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>

#include <flint/nmod_poly.h>
#include <flint/nmod_poly_factor.h>
#include <flint/ulong_extras.h>

typedef struct
{
    uint16_t exponent;
    uint16_t degree;
} sagejs_nf_factor_pair;

static void sort_factor_pairs(sagejs_nf_factor_pair *pairs, slong count)
{
    for (slong index = 1; index < count; index++)
    {
        sagejs_nf_factor_pair current = pairs[index];
        slong position = index;

        while (position > 0 &&
            (pairs[position - 1].degree > current.degree ||
             (pairs[position - 1].degree == current.degree &&
              pairs[position - 1].exponent > current.exponent)))
        {
            pairs[position] = pairs[position - 1];
            position--;
        }
        pairs[position] = current;
    }
}

static int factor_polynomial(
    uint16_t *factor_count,
    uint16_t *exponents,
    uint16_t *degrees,
    const nmod_poly_t polynomial,
    slong polynomial_degree)
{
    nmod_poly_factor_t factorization;
    sagejs_nf_factor_pair pairs[SAGEJS_NF_FACTOR_MAX_DEGREE];
    slong degree_sum = 0;
    slong count;

    nmod_poly_factor_init(factorization);
    nmod_poly_factor(factorization, polynomial);
    count = factorization->num;
    if (count < 1 || count > polynomial_degree ||
        count > (slong) SAGEJS_NF_FACTOR_MAX_DEGREE)
    {
        nmod_poly_factor_clear(factorization);
        return 0;
    }

    for (slong index = 0; index < count; index++)
    {
        slong factor_degree = nmod_poly_degree(factorization->p + index);
        slong exponent = factorization->exp[index];

        if (factor_degree < 1 || factor_degree > UINT16_MAX ||
            exponent < 1 || exponent > UINT16_MAX)
        {
            nmod_poly_factor_clear(factorization);
            return 0;
        }
        pairs[index].degree = (uint16_t) factor_degree;
        pairs[index].exponent = (uint16_t) exponent;
        degree_sum += factor_degree * exponent;
    }
    if (degree_sum != polynomial_degree)
    {
        nmod_poly_factor_clear(factorization);
        return 0;
    }

    sort_factor_pairs(pairs, count);
    *factor_count = (uint16_t) count;
    for (slong index = 0; index < count; index++)
    {
        exponents[index] = pairs[index].exponent;
        degrees[index] = pairs[index].degree;
    }
    nmod_poly_factor_clear(factorization);
    return 1;
}

int sagejs_nf_factor_degrees_residue_batch(
    uint16_t *factor_counts,
    uint16_t *exponents,
    uint16_t *degrees,
    const uint32_t *coefficient_residues,
    const uint32_t *primes,
    uint32_t degree,
    uint32_t prime_count)
{
    size_t cells;

    if (degree < 1 || degree > SAGEJS_NF_FACTOR_MAX_DEGREE)
        return SAGEJS_NF_FACTOR_UNSUPPORTED_DEGREE;
    if (prime_count > SAGEJS_NF_FACTOR_MAX_PRIMES)
        return SAGEJS_NF_FACTOR_TOO_MANY_PRIMES;
    if (prime_count == 0)
        return SAGEJS_NF_FACTOR_OK;
    if (factor_counts == NULL || exponents == NULL || degrees == NULL ||
        coefficient_residues == NULL || primes == NULL)
        return SAGEJS_NF_FACTOR_INVALID_ARGUMENT;
    if ((size_t) prime_count > SIZE_MAX / (size_t) degree)
        return SAGEJS_NF_FACTOR_SIZE_OVERFLOW;
    cells = (size_t) prime_count * (size_t) degree;
    memset(factor_counts, 0, (size_t) prime_count * sizeof(*factor_counts));
    memset(exponents, 0, cells * sizeof(*exponents));
    memset(degrees, 0, cells * sizeof(*degrees));

    for (uint32_t row = 0; row < prime_count; row++)
    {
        uint32_t prime_word = primes[row];
        ulong prime = (ulong) prime_word;
        const uint32_t *residues = coefficient_residues +
            (size_t) row * ((size_t) degree + 1U);
        nmod_poly_t polynomial;

        if ((uint64_t) prime != (uint64_t) prime_word || prime < 2 ||
            !n_is_prime(prime))
            return (int) row + 1;
        nmod_poly_init(polynomial, prime);
        for (uint32_t index = 0; index <= degree; index++)
        {
            if (residues[index] >= prime_word)
            {
                nmod_poly_clear(polynomial);
                return (int) row + 1;
            }
            nmod_poly_set_coeff_ui(polynomial, (slong) index,
                (ulong) residues[index]);
        }
        if (residues[degree] != 1U ||
            nmod_poly_degree(polynomial) != (slong) degree ||
            !factor_polynomial(factor_counts + row,
                exponents + (size_t) row * (size_t) degree,
                degrees + (size_t) row * (size_t) degree,
                polynomial, (slong) degree))
        {
            nmod_poly_clear(polynomial);
            return (int) row + 1;
        }
        nmod_poly_clear(polynomial);
    }
    return SAGEJS_NF_FACTOR_OK;
}

int sagejs_nf_factor_degrees_batch(
    uint64_t *factor_counts,
    uint64_t *exponents,
    uint64_t *degrees,
    const fmpz *coefficients,
    slong coefficient_count,
    const uint64_t *primes,
    slong prime_count)
{
    slong polynomial_degree = coefficient_count - 1;
    int use_residue_batch = 1;

    /*
     * The native arbitrary-integer/64-bit route remains available for the
     * Node adapter and for primes above the Wasm32 word-prime boundary.  It
     * shares factor validation and ordering with the residue ABI above.
     */

    if (polynomial_degree < 1 ||
        polynomial_degree > (slong) SAGEJS_NF_FACTOR_MAX_DEGREE ||
        prime_count < 0 ||
        (uint64_t) prime_count > SAGEJS_NF_FACTOR_MAX_PRIMES)
        return SAGEJS_NF_FACTOR_INVALID_ARGUMENT;

    for (slong row = 0; row < prime_count; row++)
    {
        if (primes[row] > UINT32_MAX)
        {
            use_residue_batch = 0;
            break;
        }
    }
    if (use_residue_batch && prime_count > 0)
    {
        size_t coefficient_cells = (size_t) prime_count *
            (size_t) coefficient_count;
        size_t factor_cells = (size_t) prime_count *
            (size_t) polynomial_degree;
        uint32_t *residues = malloc(coefficient_cells * sizeof(*residues));
        uint32_t *word_primes = malloc((size_t) prime_count *
            sizeof(*word_primes));
        uint16_t *word_counts = malloc((size_t) prime_count *
            sizeof(*word_counts));
        uint16_t *word_exponents = malloc(factor_cells *
            sizeof(*word_exponents));
        uint16_t *word_degrees = malloc(factor_cells *
            sizeof(*word_degrees));
        int status;

        if (residues == NULL || word_primes == NULL || word_counts == NULL ||
            word_exponents == NULL || word_degrees == NULL)
        {
            free(residues);
            free(word_primes);
            free(word_counts);
            free(word_exponents);
            free(word_degrees);
            return SAGEJS_NF_FACTOR_ALLOCATION_FAILED;
        }
        for (slong row = 0; row < prime_count; row++)
        {
            word_primes[row] = (uint32_t) primes[row];
            for (slong index = 0; index < coefficient_count; index++)
            {
                residues[(size_t) row * (size_t) coefficient_count +
                    (size_t) index] = (uint32_t) fmpz_fdiv_ui(
                        coefficients + index, (ulong) word_primes[row]);
            }
        }
        status = sagejs_nf_factor_degrees_residue_batch(word_counts,
            word_exponents, word_degrees, residues, word_primes,
            (uint32_t) polynomial_degree, (uint32_t) prime_count);
        if (status == SAGEJS_NF_FACTOR_OK)
        {
            for (slong row = 0; row < prime_count; row++)
                factor_counts[row] = (uint64_t) word_counts[row];
            for (size_t index = 0; index < factor_cells; index++)
            {
                exponents[index] = (uint64_t) word_exponents[index];
                degrees[index] = (uint64_t) word_degrees[index];
            }
        }
        free(residues);
        free(word_primes);
        free(word_counts);
        free(word_exponents);
        free(word_degrees);
        return status;
    }

    for (slong row = 0; row < prime_count; row++)
    {
        ulong prime = (ulong) primes[row];
        nmod_poly_t polynomial;
        uint16_t factor_count = 0;
        uint16_t pair_exponents[SAGEJS_NF_FACTOR_MAX_DEGREE] = {0};
        uint16_t pair_degrees[SAGEJS_NF_FACTOR_MAX_DEGREE] = {0};

        if ((uint64_t) prime != primes[row] || prime < 2 || !n_is_prime(prime))
            return (int) row + 1;

        nmod_poly_init(polynomial, prime);
        for (slong index = 0; index < coefficient_count; index++)
            nmod_poly_set_coeff_ui(
                polynomial, index, fmpz_fdiv_ui(coefficients + index, prime));
        if (nmod_poly_degree(polynomial) != polynomial_degree)
        {
            nmod_poly_clear(polynomial);
            return (int) row + 1;
        }

        if (!factor_polynomial(&factor_count, pair_exponents, pair_degrees,
                polynomial, polynomial_degree))
        {
            nmod_poly_clear(polynomial);
            return (int) row + 1;
        }
        factor_counts[row] = (uint64_t) factor_count;
        for (slong index = 0; index < (slong) factor_count; index++)
        {
            size_t offset = (size_t) row * (size_t) polynomial_degree
                + (size_t) index;
            exponents[offset] = (uint64_t) pair_exponents[index];
            degrees[offset] = (uint64_t) pair_degrees[index];
        }

        nmod_poly_clear(polynomial);
    }
    return 0;
}
