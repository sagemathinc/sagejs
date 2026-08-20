/*
 * Compact good-prime factor-degree data for Dedekind zeta coefficients.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 */

#include "number_field_zeta_core.h"

#include <stddef.h>

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

    if (polynomial_degree < 1 || polynomial_degree > UINT16_MAX)
        return 1;

    for (slong row = 0; row < prime_count; row++)
    {
        ulong prime = (ulong) primes[row];
        nmod_poly_t polynomial;
        nmod_poly_factor_t factorization;
        sagejs_nf_factor_pair *pairs;
        slong degree_sum = 0;
        slong count;

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

        nmod_poly_factor_init(factorization);
        nmod_poly_factor(factorization, polynomial);
        count = factorization->num;
        if (count < 1 || count > polynomial_degree)
        {
            nmod_poly_factor_clear(factorization);
            nmod_poly_clear(polynomial);
            return (int) row + 1;
        }

        pairs = flint_malloc((size_t) count * sizeof(*pairs));
        for (slong index = 0; index < count; index++)
        {
            slong factor_degree = nmod_poly_degree(factorization->p + index);
            slong exponent = factorization->exp[index];

            if (factor_degree < 1 || factor_degree > UINT16_MAX ||
                exponent < 1 || exponent > UINT16_MAX)
            {
                flint_free(pairs);
                nmod_poly_factor_clear(factorization);
                nmod_poly_clear(polynomial);
                return (int) row + 1;
            }
            pairs[index].degree = (uint16_t) factor_degree;
            pairs[index].exponent = (uint16_t) exponent;
            degree_sum += factor_degree * exponent;
        }
        if (degree_sum != polynomial_degree)
        {
            flint_free(pairs);
            nmod_poly_factor_clear(factorization);
            nmod_poly_clear(polynomial);
            return (int) row + 1;
        }
        sort_factor_pairs(pairs, count);
        factor_counts[row] = (uint64_t) count;
        for (slong index = 0; index < count; index++)
        {
            size_t offset = (size_t) row * (size_t) polynomial_degree
                + (size_t) index;
            exponents[offset] = (uint64_t) pairs[index].exponent;
            degrees[offset] = (uint64_t) pairs[index].degree;
        }

        flint_free(pairs);
        nmod_poly_factor_clear(factorization);
        nmod_poly_clear(polynomial);
    }
    return 0;
}
