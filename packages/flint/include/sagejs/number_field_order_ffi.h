#ifndef SAGEJS_NUMBER_FIELD_ORDER_FFI_H
#define SAGEJS_NUMBER_FIELD_ORDER_FFI_H

#include <stdint.h>
#include <stdlib.h>

#include <flint/fmpq.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpz.h>
#include <flint/fmpz_mat.h>
#include <flint/nmod_mat.h>
#include <flint/ulong_extras.h>

#include "sagejs/fmpq_matrix_ffi.h"
#include "sagejs/fmpz_matrix_ffi.h"

/*
 * Zassenhaus Round 2 over an integral multiplication table.
 *
 * The input has n^2 rows and n columns. Row i*n+j is the coordinate row of
 * e_i*e_j in the integral order basis. The result is a rational change-of-
 * basis matrix whose rows span the p-maximal overorder in that basis.
 *
 * This is deliberately a batched FLINT-storage boundary. The same algorithm
 * lives in ordinary Python in number_fields.py; this implementation removes
 * thousands of object-at-a-time crossings in difficult local computations.
 */

static inline ulong sagejs_nf_mulmod(
    ulong left, ulong right, ulong prime, ulong inverse)
{
    return n_mulmod2_preinv(left, right, prime, inverse);
}

static inline void sagejs_nf_modular_product(
    ulong *result, const ulong *left, const ulong *right,
    const ulong *table, slong degree, ulong prime, ulong inverse)
{
    for (slong k = 0; k < degree; k++) result[k] = 0;
    for (slong i = 0; i < degree; i++)
    {
        if (left[i] == 0) continue;
        for (slong j = 0; j < degree; j++)
        {
            if (right[j] == 0) continue;
            ulong scalar = sagejs_nf_mulmod(
                left[i], right[j], prime, inverse);
            const ulong *product = table + (i * degree + j) * degree;
            for (slong k = 0; k < degree; k++)
            {
                ulong term = sagejs_nf_mulmod(
                    scalar, product[k], prime, inverse);
                result[k] = n_addmod(result[k], term, prime);
            }
        }
    }
}

static inline void sagejs_nf_modular_power(
    ulong *result, const ulong *source, ulong exponent, const ulong *one,
    const ulong *table, slong degree, ulong prime, ulong inverse)
{
    ulong *base = (ulong *) flint_malloc((size_t) degree * sizeof(ulong));
    ulong *scratch = (ulong *) flint_malloc((size_t) degree * sizeof(ulong));
    for (slong i = 0; i < degree; i++)
    {
        result[i] = one[i];
        base[i] = source[i];
    }
    while (exponent != 0)
    {
        if (exponent & 1)
        {
            sagejs_nf_modular_product(
                scratch, result, base, table, degree, prime, inverse);
            for (slong i = 0; i < degree; i++) result[i] = scratch[i];
        }
        exponent >>= 1;
        if (exponent != 0)
        {
            sagejs_nf_modular_product(
                scratch, base, base, table, degree, prime, inverse);
            for (slong i = 0; i < degree; i++) base[i] = scratch[i];
        }
    }
    flint_free(scratch);
    flint_free(base);
}

/* Store a canonical row basis for the right kernel of source. */
static inline slong sagejs_nf_right_kernel_rows(
    nmod_mat_t rows, const nmod_mat_t source)
{
    const slong columns = nmod_mat_ncols(source);
    nmod_mat_t columns_matrix;
    nmod_mat_init(columns_matrix, columns, columns, source->mod.n);
    const slong nullity = nmod_mat_nullspace(columns_matrix, source);
    nmod_mat_zero(rows);
    for (slong i = 0; i < nullity; i++)
        for (slong j = 0; j < columns; j++)
            nmod_mat_entry(rows, i, j) =
                nmod_mat_entry(columns_matrix, j, i);
    if (nullity != 0)
    {
        nmod_mat_t window;
        nmod_mat_window_init(window, rows, 0, 0, nullity, columns);
        nmod_mat_rref(window);
        nmod_mat_window_clear(window);
    }
    nmod_mat_clear(columns_matrix);
    return nullity;
}

static inline void sagejs_nf_p_radical(
    nmod_mat_t radical, slong *dimension, const ulong *table,
    const fmpz *identity, slong degree, ulong prime, ulong inverse)
{
    nmod_mat_t defining;
    nmod_mat_init(defining, degree, degree, prime);
    if (prime > (ulong) degree)
    {
        /* Trace(M_i M_j), reduced modulo p. */
        for (slong i = 0; i < degree; i++)
            for (slong j = 0; j < degree; j++)
            {
                ulong trace = 0;
                for (slong row = 0; row < degree; row++)
                    for (slong column = 0; column < degree; column++)
                    {
                        ulong left = table[(i * degree + column) * degree + row];
                        ulong right = table[(j * degree + row) * degree + column];
                        ulong term = sagejs_nf_mulmod(
                            left, right, prime, inverse);
                        trace = n_addmod(trace, term, prime);
                    }
                nmod_mat_entry(defining, i, j) = trace;
            }
    }
    else
    {
        ulong *one = (ulong *) flint_malloc((size_t) degree * sizeof(ulong));
        ulong *source = (ulong *) flint_calloc((size_t) degree, sizeof(ulong));
        ulong *power = (ulong *) flint_malloc((size_t) degree * sizeof(ulong));
        for (slong i = 0; i < degree; i++)
            one[i] = fmpz_fdiv_ui(identity + i, prime);
        for (slong column = 0; column < degree; column++)
        {
            for (slong i = 0; i < degree; i++) source[i] = 0;
            source[column] = 1;
            sagejs_nf_modular_power(
                power, source, prime, one, table, degree, prime, inverse);
            for (slong row = 0; row < degree; row++)
                nmod_mat_entry(defining, row, column) = power[row];
        }
        ulong bound = prime;
        while (bound < (ulong) degree)
        {
            nmod_mat_t product;
            nmod_mat_init(product, degree, degree, prime);
            nmod_mat_mul(product, defining, defining);
            nmod_mat_set(defining, product);
            nmod_mat_clear(product);
            if (bound > UWORD_MAX / prime) break;
            bound *= prime;
        }
        flint_free(power);
        flint_free(source);
        flint_free(one);
    }
    *dimension = sagejs_nf_right_kernel_rows(radical, defining);
    nmod_mat_clear(defining);
}

static inline slong sagejs_nf_pivot_columns(
    slong *pivots, const nmod_mat_t rows, slong row_count, slong degree)
{
    slong previous = -1;
    for (slong row = 0; row < row_count; row++)
    {
        slong column = previous + 1;
        while (column < degree && nmod_mat_entry(rows, row, column) == 0)
            column++;
        if (column == degree) return row;
        pivots[row] = column;
        previous = column;
    }
    return row_count;
}

static inline void sagejs_nf_build_lattice(
    fmpz_mat_t lattice, const nmod_mat_t radical, slong radical_dimension,
    slong degree, ulong prime)
{
    slong *pivots = (slong *) flint_malloc((size_t) degree * sizeof(slong));
    unsigned char *is_pivot = (unsigned char *) flint_calloc(
        (size_t) degree, sizeof(unsigned char));
    sagejs_nf_pivot_columns(pivots, radical, radical_dimension, degree);
    for (slong row = 0; row < radical_dimension; row++)
    {
        is_pivot[pivots[row]] = 1;
        for (slong column = 0; column < degree; column++)
            fmpz_set_ui(fmpz_mat_entry(lattice, row, column),
                nmod_mat_entry(radical, row, column));
    }
    slong row = radical_dimension;
    for (slong column = 0; column < degree; column++)
        if (!is_pivot[column])
            fmpz_set_ui(fmpz_mat_entry(lattice, row++, column), prime);
    flint_free(is_pivot);
    flint_free(pivots);
}

static inline slong sagejs_nf_multiplier_kernel(
    nmod_mat_t kernel, const fmpz_mat_t *multiplication,
    const nmod_mat_t radical, slong radical_dimension,
    slong degree, ulong prime)
{
    fmpz_mat_t lattice, inverse;
    fmpz_t denominator, sum, term;
    nmod_mat_t equations;
    fmpz_mat_init(lattice, degree, degree);
    fmpz_mat_init(inverse, degree, degree);
    fmpz_init(denominator);
    fmpz_init(sum);
    fmpz_init(term);
    sagejs_nf_build_lattice(
        lattice, radical, radical_dimension, degree, prime);
    if (!fmpz_mat_inv(inverse, denominator, lattice))
    {
        fmpz_clear(term); fmpz_clear(sum); fmpz_clear(denominator);
        fmpz_mat_clear(inverse); fmpz_mat_clear(lattice);
        return -1;
    }
    nmod_mat_init(equations, degree * degree, degree, prime);
    fmpz *product = _fmpz_vec_init(degree);
    for (slong ideal_row = 0; ideal_row < degree; ideal_row++)
        for (slong basis = 0; basis < degree; basis++)
        {
            for (slong coordinate = 0; coordinate < degree; coordinate++)
            {
                fmpz_zero(product + coordinate);
                for (slong source = 0; source < degree; source++)
                    fmpz_addmul(
                        product + coordinate,
                        fmpz_mat_entry(lattice, ideal_row, source),
                        fmpz_mat_entry(multiplication[basis], coordinate, source));
            }
            for (slong coordinate = 0; coordinate < degree; coordinate++)
            {
                fmpz_zero(sum);
                for (slong source = 0; source < degree; source++)
                    fmpz_addmul(sum, product + source,
                        fmpz_mat_entry(inverse, source, coordinate));
                fmpz_divexact(term, sum, denominator);
                nmod_mat_entry(
                    equations, ideal_row * degree + coordinate, basis) =
                    fmpz_fdiv_ui(term, prime);
            }
        }
    _fmpz_vec_clear(product, degree);
    const slong nullity = sagejs_nf_right_kernel_rows(kernel, equations);
    nmod_mat_clear(equations);
    fmpz_clear(term); fmpz_clear(sum); fmpz_clear(denominator);
    fmpz_mat_clear(inverse); fmpz_mat_clear(lattice);
    return nullity;
}

static inline int sagejs_nf_change_basis(
    fmpz_mat_t *multiplication, fmpq_mat_t total_basis, fmpz *identity,
    const nmod_mat_t kernel, slong nullity, slong degree, ulong prime)
{
    slong *pivots = (slong *) flint_malloc((size_t) degree * sizeof(slong));
    unsigned char *is_pivot = (unsigned char *) flint_calloc(
        (size_t) degree, sizeof(unsigned char));
    fmpq_mat_t change, inverse, transpose, temporary, combined, updated_basis;
    fmpq_t value, product;
    fmpq_mat_init(change, degree, degree);
    fmpq_mat_init(inverse, degree, degree);
    fmpq_mat_init(transpose, degree, degree);
    fmpq_mat_init(temporary, degree, degree);
    fmpq_mat_init(combined, degree, degree);
    fmpq_mat_init(updated_basis, degree, degree);
    fmpq_init(value);
    fmpq_init(product);
    sagejs_nf_pivot_columns(pivots, kernel, nullity, degree);
    fmpz_t prime_value;
    fmpz_init_set_ui(prime_value, prime);
    for (slong row = 0; row < nullity; row++)
    {
        is_pivot[pivots[row]] = 1;
        for (slong column = 0; column < degree; column++)
        {
            fmpz_set_ui(fmpq_numref(fmpq_mat_entry(change, row, column)),
                nmod_mat_entry(kernel, row, column));
            fmpz_set(fmpq_denref(fmpq_mat_entry(change, row, column)),
                prime_value);
            fmpq_canonicalise(fmpq_mat_entry(change, row, column));
        }
    }
    slong row = nullity;
    for (slong column = 0; column < degree; column++)
        if (!is_pivot[column])
            fmpq_one(fmpq_mat_entry(change, row++, column));
    if (!fmpq_mat_inv(inverse, change)) goto fail;

    /* Update identity coordinates: u_new = u_old * change^-1. */
    fmpz *new_identity = _fmpz_vec_init(degree);
    for (slong column = 0; column < degree; column++)
    {
        fmpq_zero(value);
        for (slong source = 0; source < degree; source++)
        {
            fmpq_set_fmpz(product, identity + source);
            fmpq_mul(product, product, fmpq_mat_entry(inverse, source, column));
            fmpq_add(value, value, product);
        }
        if (!fmpz_is_one(fmpq_denref(value)))
        {
            _fmpz_vec_clear(new_identity, degree);
            goto fail;
        }
        fmpz_set(new_identity + column, fmpq_numref(value));
    }
    for (slong i = 0; i < degree; i++) fmpz_set(identity + i, new_identity + i);
    _fmpz_vec_clear(new_identity, degree);

    fmpq_mat_transpose(transpose, change);
    fmpq_mat_t inverse_transpose;
    fmpq_mat_init(inverse_transpose, degree, degree);
    fmpq_mat_transpose(inverse_transpose, inverse);
    fmpz_mat_t *new_multiplication = (fmpz_mat_t *) flint_malloc(
        (size_t) degree * sizeof(fmpz_mat_t));
    for (slong i = 0; i < degree; i++)
    {
        fmpz_mat_init(new_multiplication[i], degree, degree);
        fmpq_mat_zero(combined);
        for (slong source = 0; source < degree; source++)
            for (slong r = 0; r < degree; r++)
                for (slong c = 0; c < degree; c++)
                {
                    fmpq_set_fmpz(product,
                        fmpz_mat_entry(multiplication[source], r, c));
                    fmpq_mul(product, product,
                        fmpq_mat_entry(change, i, source));
                    fmpq_add(fmpq_mat_entry(combined, r, c),
                        fmpq_mat_entry(combined, r, c), product);
                }
        fmpq_mat_mul(temporary, combined, transpose);
        fmpq_mat_mul(combined, inverse_transpose, temporary);
        for (slong r = 0; r < degree; r++)
            for (slong c = 0; c < degree; c++)
            {
                const fmpq *entry = fmpq_mat_entry(combined, r, c);
                if (!fmpz_is_one(fmpq_denref(entry)))
                {
                    for (slong j = 0; j <= i; j++)
                        fmpz_mat_clear(new_multiplication[j]);
                    flint_free(new_multiplication);
                    fmpq_mat_clear(inverse_transpose);
                    goto fail;
                }
                fmpz_set(fmpz_mat_entry(new_multiplication[i], r, c),
                    fmpq_numref(entry));
            }
    }
    for (slong i = 0; i < degree; i++)
    {
        fmpz_mat_clear(multiplication[i]);
        fmpz_mat_init_set(multiplication[i], new_multiplication[i]);
        fmpz_mat_clear(new_multiplication[i]);
    }
    flint_free(new_multiplication);
    fmpq_mat_clear(inverse_transpose);
    fmpq_mat_mul(updated_basis, change, total_basis);
    fmpq_mat_set(total_basis, updated_basis);
    fmpz_clear(prime_value);
    fmpq_clear(product); fmpq_clear(value);
    fmpq_mat_clear(updated_basis); fmpq_mat_clear(combined);
    fmpq_mat_clear(temporary); fmpq_mat_clear(transpose);
    fmpq_mat_clear(inverse); fmpq_mat_clear(change);
    flint_free(is_pivot); flint_free(pivots);
    return 1;

fail:
    fmpz_clear(prime_value);
    fmpq_clear(product); fmpq_clear(value);
    fmpq_mat_clear(updated_basis); fmpq_mat_clear(combined);
    fmpq_mat_clear(temporary); fmpq_mat_clear(transpose);
    fmpq_mat_clear(inverse); fmpq_mat_clear(change);
    flint_free(is_pivot); flint_free(pivots);
    return 0;
}

static inline int sagejs_number_field_order_maximal_at_primes(
    sagejs_fmpq_matrix_t result,
    const sagejs_fmpz_matrix_t source,
    const uint64_t *prime_inputs,
    uint64_t prime_count)
{
    const slong rows = fmpz_mat_nrows(source->value);
    const slong degree = fmpz_mat_ncols(source->value);
    if (degree < 1 || rows != degree * degree || prime_count == 0)
        return 0;
    for (uint64_t index = 0; index < prime_count; index++)
        if (prime_inputs[index] < 2 ||
            prime_inputs[index] > (uint64_t) UWORD_MAX ||
            !n_is_prime((ulong) prime_inputs[index]))
            return 0;
    const size_t table_size = (size_t) degree * (size_t) degree * (size_t) degree;
    ulong *table = (ulong *) flint_malloc(table_size * sizeof(ulong));
    fmpz_mat_t *multiplication = (fmpz_mat_t *) flint_malloc(
        (size_t) degree * sizeof(fmpz_mat_t));
    for (slong i = 0; i < degree; i++)
    {
        fmpz_mat_init(multiplication[i], degree, degree);
        for (slong j = 0; j < degree; j++)
            for (slong k = 0; k < degree; k++)
            {
                const fmpz *entry = fmpz_mat_entry(
                    source->value, i * degree + j, k);
                fmpz_set(fmpz_mat_entry(multiplication[i], k, j), entry);
            }
    }
    fmpq_mat_t basis;
    fmpq_mat_init(basis, degree, degree);
    fmpq_mat_one(basis);
    fmpz *identity = _fmpz_vec_init(degree);
    fmpz_one(identity);
    int success = 1;
    for (uint64_t prime_index = 0;
         prime_index < prime_count && success;
         prime_index++)
    {
        const ulong prime = (ulong) prime_inputs[prime_index];
        const ulong prime_inverse = n_preinvert_limb(prime);
        for (;;)
        {
            /* Refresh the compact modular table after each basis change. */
            for (slong i = 0; i < degree; i++)
                for (slong j = 0; j < degree; j++)
                    for (slong k = 0; k < degree; k++)
                        table[(i * degree + j) * degree + k] = fmpz_fdiv_ui(
                            fmpz_mat_entry(multiplication[i], k, j), prime);
            nmod_mat_t radical, kernel;
            nmod_mat_init(radical, degree, degree, prime);
            nmod_mat_init(kernel, degree, degree, prime);
            slong radical_dimension;
            sagejs_nf_p_radical(radical, &radical_dimension, table,
                identity, degree, prime, prime_inverse);
            const slong nullity = sagejs_nf_multiplier_kernel(
                kernel, multiplication, radical, radical_dimension,
                degree, prime);
            nmod_mat_clear(radical);
            if (nullity < 0)
            {
                nmod_mat_clear(kernel);
                success = 0;
                break;
            }
            if (nullity == 0)
            {
                nmod_mat_clear(kernel);
                break;
            }
            if (!sagejs_nf_change_basis(multiplication, basis, identity,
                    kernel, nullity, degree, prime))
            {
                nmod_mat_clear(kernel);
                success = 0;
                break;
            }
            nmod_mat_clear(kernel);
        }
    }
    if (success)
    {
        if (!sagejs_fmpq_matrix_init(result, (uint64_t) degree, (uint64_t) degree))
            success = 0;
        else
        {
            fmpq_mat_set(result->value, basis);
            sagejs_fmpq_matrix_recompute_allocated_bytes(result);
        }
    }
    _fmpz_vec_clear(identity, degree);
    fmpq_mat_clear(basis);
    for (slong i = 0; i < degree; i++) fmpz_mat_clear(multiplication[i]);
    flint_free(multiplication);
    flint_free(table);
    return success;
}

static inline int sagejs_number_field_order_pmaximal(
    sagejs_fmpq_matrix_t result,
    const sagejs_fmpz_matrix_t source,
    uint64_t prime)
{
    return sagejs_number_field_order_maximal_at_primes(
        result, source, &prime, 1);
}

#endif
