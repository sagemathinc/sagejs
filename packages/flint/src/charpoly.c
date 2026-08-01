/*
 * Certified characteristic polynomials with sparsity-sensitive bounds.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 */

#include <math.h>
#include <stdlib.h>

#include <flint/fmpz.h>
#include <flint/fmpz_mat.h>
#include <flint/fmpz_poly.h>
#include <flint/fmpz_vec.h>
#include <flint/nmod_mat.h>
#include <flint/nmod.h>
#include <flint/nmod_poly.h>
#include <flint/ulong_extras.h>

#include "charpoly.h"

#define SAGEJS_CHARPOLY_NORM_SCALE_BITS 16

typedef struct
{
    slong nonzero;
    slong *offsets;
    slong *columns;
    const fmpz **values;
} sparse_integer_matrix;

static void sparse_integer_matrix_clear(sparse_integer_matrix *sparse)
{
    free(sparse->offsets);
    free(sparse->columns);
    free(sparse->values);
    sparse->nonzero = 0;
    sparse->offsets = NULL;
    sparse->columns = NULL;
    sparse->values = NULL;
}

static int sparse_integer_matrix_init(
    sparse_integer_matrix *sparse, const fmpz_mat_t matrix)
{
    slong n = matrix->r;
    slong used = 0;

    sparse->nonzero = 0;
    sparse->offsets = calloc((size_t) n + 1, sizeof(*sparse->offsets));
    sparse->columns = NULL;
    sparse->values = NULL;
    for (slong row = 0; row < n; row++)
        for (slong column = 0; column < n; column++)
            sparse->nonzero += !fmpz_is_zero(
                fmpz_mat_entry(matrix, row, column));
    sparse->columns = malloc(
        (sparse->nonzero == 0 ? 1 : (size_t) sparse->nonzero) *
        sizeof(*sparse->columns));
    sparse->values = malloc(
        (sparse->nonzero == 0 ? 1 : (size_t) sparse->nonzero) *
        sizeof(*sparse->values));
    if (sparse->offsets == NULL || sparse->columns == NULL ||
        sparse->values == NULL)
    {
        sparse_integer_matrix_clear(sparse);
        return 0;
    }
    for (slong row = 0; row < n; row++)
    {
        sparse->offsets[row] = used;
        for (slong column = 0; column < n; column++)
        {
            const fmpz *entry = fmpz_mat_entry(matrix, row, column);
            if (!fmpz_is_zero(entry))
            {
                sparse->columns[used] = column;
                sparse->values[used++] = entry;
            }
        }
    }
    sparse->offsets[n] = used;
    return used == sparse->nonzero;
}

static slong cyclic_seed(slong index, slong attempt)
{
    if (attempt == 0)
        return index == 0;
    return ((17 * index + 11 * attempt + 3) % 11) - 5;
}

static int find_cyclic_seed(
    slong *seed,
    const sparse_integer_matrix *sparse,
    slong n)
{
    const ulong prime = 1073741827;
    nmod_t modulus;
    nmod_mat_t krylov;
    ulong *current = NULL, *next = NULL;
    int found = 0;

    nmod_init(&modulus, prime);
    nmod_mat_init(krylov, n, n, prime);
    current = malloc((n == 0 ? 1 : (size_t) n) * sizeof(*current));
    next = malloc((n == 0 ? 1 : (size_t) n) * sizeof(*next));
    if (current == NULL || next == NULL)
        goto done;
    for (slong attempt = 0; attempt < 3 && !found; attempt++)
    {
        for (slong row = 0; row < n; row++)
        {
            seed[row] = cyclic_seed(row, attempt);
            current[row] = nmod_set_si(seed[row], modulus);
        }
        for (slong power = 0; power < n; power++)
        {
            for (slong row = 0; row < n; row++)
            {
                ulong value = 0;
                nmod_mat_entry(krylov, row, power) = current[row];
                for (slong item = sparse->offsets[row];
                     item < sparse->offsets[row + 1]; item++)
                {
                    ulong entry = fmpz_fdiv_ui(
                        sparse->values[item], prime);
                    value = nmod_add(value, nmod_mul(
                        entry, current[sparse->columns[item]], modulus),
                        modulus);
                }
                next[row] = value;
            }
            {
                ulong *swap = current;
                current = next;
                next = swap;
            }
        }
        found = nmod_mat_rank(krylov) == n;
    }

done:
    free(current);
    free(next);
    nmod_mat_clear(krylov);
    return found;
}

/*
 * If a cyclic vector exists, its exact Krylov relation is the characteristic
 * polynomial. FLINT's Dixon solver then obtains every coefficient from one
 * exact linear solve instead of recomputing a modular charpoly at each prime.
 */
static int charpoly_cyclic_krylov(
    fmpz_poly_t polynomial, const fmpz_mat_t matrix)
{
    slong n = matrix->r;
    sparse_integer_matrix sparse;
    slong *seed = NULL;
    fmpz *current = NULL, *next = NULL;
    fmpz_mat_t krylov, right, solution;
    fmpz_t denominator;
    int matrices_initialized = 0, success = 0;

    if (n < 32 || n > 600)
        return 0;
    if (!sparse_integer_matrix_init(&sparse, matrix))
        return 0;
    /*
     * The Krylov matrix is dense.  Restrict this route to matrices where
     * sparse matrix-vector products can repay the rank test and exact solve.
     */
    if (sparse.nonzero > (n * n) / 8)
        goto done;
    seed = malloc((n == 0 ? 1 : (size_t) n) * sizeof(*seed));
    if (seed == NULL || !find_cyclic_seed(seed, &sparse, n))
        goto done;

    current = _fmpz_vec_init(n == 0 ? 1 : n);
    next = _fmpz_vec_init(n == 0 ? 1 : n);
    fmpz_mat_init(krylov, n, n);
    fmpz_mat_init(right, n, 1);
    fmpz_mat_init(solution, n, 1);
    fmpz_init(denominator);
    matrices_initialized = 1;
    for (slong row = 0; row < n; row++)
        fmpz_set_si(current + row, seed[row]);
    for (slong power = 0; power < n; power++)
    {
        for (slong row = 0; row < n; row++)
        {
            fmpz_set(fmpz_mat_entry(krylov, row, power), current + row);
            fmpz_zero(next + row);
            for (slong item = sparse.offsets[row];
                 item < sparse.offsets[row + 1]; item++)
                fmpz_addmul(next + row, sparse.values[item],
                    current + sparse.columns[item]);
        }
        {
            fmpz *swap = current;
            current = next;
            next = swap;
        }
    }
    for (slong row = 0; row < n; row++)
        fmpz_neg(fmpz_mat_entry(right, row, 0), current + row);
    if (!fmpz_mat_solve_dixon_den(
            solution, denominator, krylov, right) ||
        fmpz_is_zero(denominator))
        goto done;

    fmpz_poly_fit_length(polynomial, n + 1);
    _fmpz_poly_set_length(polynomial, n + 1);
    _fmpz_vec_zero(polynomial->coeffs, n + 1);
    for (slong degree = 0; degree < n; degree++)
    {
        const fmpz *coefficient = fmpz_mat_entry(solution, degree, 0);
        if (!fmpz_divisible(coefficient, denominator))
            goto done;
        fmpz_divexact(
            fmpz_poly_get_coeff_ptr(polynomial, degree),
            coefficient, denominator);
    }
    fmpz_one(polynomial->coeffs + n);
    success = 1;

done:
    if (matrices_initialized)
    {
        fmpz_clear(denominator);
        fmpz_mat_clear(krylov);
        fmpz_mat_clear(right);
        fmpz_mat_clear(solution);
        _fmpz_vec_clear(current, n == 0 ? 1 : n);
        _fmpz_vec_clear(next, n == 0 ? 1 : n);
    }
    free(seed);
    sparse_integer_matrix_clear(&sparse);
    return success;
}

/* FLINT's Dumas--Pernet--Wan uniform coefficient bit bound. */
static slong uniform_bound_bits(const fmpz_mat_t matrix)
{
    slong n = matrix->r;
    const fmpz *largest;
    double magnitude;

    if (n == 0)
        return 1;
    largest = fmpz_mat_entry(matrix, 0, 0);
    for (slong row = 0; row < n; row++)
        for (slong column = 0; column < n; column++)
            if (fmpz_cmpabs(
                    largest, fmpz_mat_entry(matrix, row, column)) < 0)
                largest = fmpz_mat_entry(matrix, row, column);
    if (fmpz_is_zero(largest))
        return 0;
    magnitude = fmpz_bits(largest) <= FLINT_D_BITS
        ? log2(fabs(fmpz_get_d(largest)))
        : (double) fmpz_bits(largest);
    return (slong) ceil((n / 2.0) *
        (log2((double) n) + 2.0 * magnitude + 1.6669));
}

/*
 * Bound coefficient k by the elementary symmetric polynomial in full row
 * norms. This follows by writing the coefficient as the sum of principal
 * k-minors and applying Hadamard to each minor. Row norms are rounded upward
 * exactly after scaling, so the resulting target modulus is rigorous.
 */
static void row_norm_target(fmpz_t target, const fmpz_mat_t matrix)
{
    slong n = matrix->r;
    fmpz *symmetric = _fmpz_vec_init(n + 1);
    fmpz_t squared, scaled, norm, check, candidate;

    fmpz_init(squared);
    fmpz_init(scaled);
    fmpz_init(norm);
    fmpz_init(check);
    fmpz_init(candidate);
    fmpz_zero(target);
    fmpz_one(symmetric);

    for (slong row = 0; row < n; row++)
    {
        fmpz_zero(squared);
        for (slong column = 0; column < n; column++)
        {
            const fmpz *entry = fmpz_mat_entry(matrix, row, column);
            fmpz_addmul(squared, entry, entry);
        }
        fmpz_mul_2exp(
            scaled, squared, 2 * SAGEJS_CHARPOLY_NORM_SCALE_BITS);
        fmpz_sqrt(norm, scaled);
        fmpz_mul(check, norm, norm);
        if (fmpz_cmp(check, scaled) < 0)
            fmpz_add_ui(norm, norm, 1);
        for (slong degree = row + 1; degree > 0; degree--)
            fmpz_addmul(
                symmetric + degree, symmetric + degree - 1, norm);
    }

    for (slong degree = 1; degree <= n; degree++)
    {
        fmpz_mul_2exp(candidate, symmetric + degree, 1);
        fmpz_cdiv_q_2exp(candidate, candidate,
            SAGEJS_CHARPOLY_NORM_SCALE_BITS * degree);
        if (fmpz_cmp(target, candidate) < 0)
            fmpz_set(target, candidate);
    }

    fmpz_clear(squared);
    fmpz_clear(scaled);
    fmpz_clear(norm);
    fmpz_clear(check);
    fmpz_clear(candidate);
    _fmpz_vec_clear(symmetric, n + 1);
}

static void charpoly_row_norm_modular(
    fmpz_poly_t polynomial,
    const fmpz_mat_t matrix,
    const fmpz_t target)
{
    slong n = matrix->r;
    ulong prime = UWORD(1) << (FLINT_BITS - 1);
    fmpz_t modulus;

    fmpz_poly_fit_length(polynomial, n + 1);
    _fmpz_poly_set_length(polynomial, n + 1);
    _fmpz_vec_zero(polynomial->coeffs, n + 1);
    fmpz_one(polynomial->coeffs + n);
    if (fmpz_is_zero(target))
        return;

    fmpz_init_set_ui(modulus, 1);
    while (fmpz_cmp(modulus, target) <= 0)
    {
        nmod_mat_t modular_matrix;
        nmod_poly_t modular_polynomial;

        prime = n_nextprime(prime, 0);
        nmod_mat_init(modular_matrix, n, n, prime);
        nmod_poly_init(modular_polynomial, prime);
        fmpz_mat_get_nmod_mat(modular_matrix, matrix);
        nmod_mat_charpoly(modular_polynomial, modular_matrix);
        _fmpz_poly_CRT_ui(
            polynomial->coeffs,
            polynomial->coeffs,
            n + 1,
            modulus,
            modular_polynomial->coeffs,
            n + 1,
            modular_polynomial->mod.n,
            modular_polynomial->mod.ninv,
            1);
        fmpz_mul_ui(modulus, modulus, prime);
        nmod_mat_clear(modular_matrix);
        nmod_poly_clear(modular_polynomial);
    }
    fmpz_clear(modulus);
}

void sagejs_fmpz_mat_charpoly(
    fmpz_poly_t polynomial, const fmpz_mat_t matrix)
{
    slong n = matrix->r;
    slong generic_bits;
    fmpz_t target;

    if (n < 4)
    {
        fmpz_mat_charpoly(polynomial, matrix);
        return;
    }
    if (charpoly_cyclic_krylov(polynomial, matrix))
        return;
    generic_bits = uniform_bound_bits(matrix);
    if (generic_bits == 0)
    {
        fmpz_poly_zero(polynomial);
        fmpz_poly_set_coeff_ui(polynomial, n, 1);
        return;
    }
    fmpz_init(target);
    row_norm_target(target, matrix);
    if (fmpz_bits(target) >= (flint_bitcnt_t) generic_bits)
        fmpz_mat_charpoly(polynomial, matrix);
    else
        charpoly_row_norm_modular(polynomial, matrix, target);
    fmpz_clear(target);
}
