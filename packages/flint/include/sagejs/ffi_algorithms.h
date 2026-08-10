#ifndef SAGEJS_FLINT_FFI_ALGORITHMS_H
#define SAGEJS_FLINT_FFI_ALGORITHMS_H

#include <stdint.h>

#include <flint/nmod_poly.h>
#include <flint/nmod_mat.h>
#include <flint/fmpq.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpq_poly.h>
#include <flint/fmpz_mat.h>
#include <flint/fmpz_poly.h>
#include <flint/ulong_extras.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Host-neutral packed adapter to FLINT's mature nmod polynomial
 * multiplication.  The declaration validates each slice length; this bridge
 * validates their algebraic relationship before allocating FLINT objects. */
static inline int sagejs_flint_nmod_poly_mul_packed(
    uint64_t *output,
    uint64_t *left,
    uint64_t *right,
    uint64_t output_length,
    uint64_t left_length,
    uint64_t right_length,
    uint64_t modulus)
{
    nmod_poly_t left_poly;
    nmod_poly_t right_poly;
    nmod_poly_t product;
    uint64_t expected = left_length == 0 || right_length == 0
        ? 0 : left_length + right_length - 1;

    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        left_length > (uint64_t) WORD_MAX ||
        right_length > (uint64_t) WORD_MAX ||
        output_length > (uint64_t) WORD_MAX ||
        (left_length != 0 && right_length != 0 &&
         expected < left_length) || output_length != expected)
        return 0;
    nmod_poly_init(left_poly, (ulong) modulus);
    nmod_poly_init(right_poly, (ulong) modulus);
    nmod_poly_init(product, (ulong) modulus);
    for (uint64_t index = 0; index < left_length; index++)
        nmod_poly_set_coeff_ui(left_poly, (slong) index,
            (ulong) (left[index] % modulus));
    for (uint64_t index = 0; index < right_length; index++)
        nmod_poly_set_coeff_ui(right_poly, (slong) index,
            (ulong) (right[index] % modulus));
    nmod_poly_mul(product, left_poly, right_poly);
    for (uint64_t index = 0; index < output_length; index++)
        output[index] = (uint64_t) nmod_poly_get_coeff_ui(
            product, (slong) index);
    nmod_poly_clear(product);
    nmod_poly_clear(right_poly);
    nmod_poly_clear(left_poly);
    return 1;
}

/* Host-neutral characteristic polynomial adapter.  Both buffers have a
 * stable row-major/scalar ABI; no FLINT object or host runtime handle crosses
 * this boundary. */
static inline int sagejs_flint_nmod_mat_charpoly_packed(
    uint64_t *output,
    uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t size,
    uint64_t modulus)
{
    nmod_mat_t matrix;
    nmod_poly_t polynomial;

    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        size > (uint64_t) WORD_MAX ||
        (size != 0 && size > UINT64_MAX / size) ||
        source_length != size * size ||
        size == UINT64_MAX || output_length != size + 1)
        return 0;
    nmod_mat_init(matrix, (slong) size, (slong) size, (ulong) modulus);
    nmod_poly_init(polynomial, (ulong) modulus);
    for (uint64_t row = 0; row < size; row++)
        for (uint64_t column = 0; column < size; column++)
            nmod_mat_entry(matrix, (slong) row, (slong) column) =
                (ulong) (source[row * size + column] % modulus);
    nmod_mat_charpoly(polynomial, matrix);
    for (uint64_t index = 0; index < output_length; index++)
        output[index] = (uint64_t) nmod_poly_get_coeff_ui(
            polynomial, (slong) index);
    nmod_poly_clear(polynomial);
    nmod_mat_clear(matrix);
    return 1;
}

static inline int sagejs_flint_nmod_mat_minpoly_packed(
    uint64_t *output,
    uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t size,
    uint64_t modulus)
{
    nmod_mat_t matrix;
    nmod_poly_t polynomial;

    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        size > (uint64_t) WORD_MAX ||
        (size != 0 && size > UINT64_MAX / size) ||
        source_length != size * size ||
        size == UINT64_MAX || output_length != size + 1)
        return 0;
    nmod_mat_init(matrix, (slong) size, (slong) size, (ulong) modulus);
    nmod_poly_init(polynomial, (ulong) modulus);
    for (uint64_t row = 0; row < size; row++)
        for (uint64_t column = 0; column < size; column++)
            nmod_mat_entry(matrix, (slong) row, (slong) column) =
                (ulong) (source[row * size + column] % modulus);
    nmod_mat_minpoly(polynomial, matrix);
    for (uint64_t index = 0; index < output_length; index++)
        output[index] = index < (uint64_t) nmod_poly_length(polynomial)
            ? (uint64_t) nmod_poly_get_coeff_ui(polynomial, (slong) index)
            : 0;
    nmod_poly_clear(polynomial);
    nmod_mat_clear(matrix);
    return 1;
}

/* Copying adapters keep caller-owned packed storage independent of FLINT's
 * internal matrix representation.  The generated FFI layer initializes and
 * clears every nmod_mat_t and transactionally copies writable outputs back. */
static inline slong sagejs_flint_nmod_mat_rref_copy(
    nmod_mat_t output, const nmod_mat_t source)
{
    nmod_mat_set(output, source);
    return nmod_mat_rref(output);
}

static inline int sagejs_flint_nmod_mat_mul(
    nmod_mat_t output, const nmod_mat_t left, const nmod_mat_t right)
{
    nmod_mat_mul(output, left, right);
    return 1;
}

static inline slong sagejs_flint_nmod_mat_right_kernel(
    nmod_mat_t output, const nmod_mat_t source)
{
    const slong columns = nmod_mat_ncols(source);
    const slong rank = nmod_mat_rank(source);
    const slong nullity = columns - rank;
    nmod_mat_t basis_columns;
    nmod_mat_init(basis_columns, columns, columns, source->mod.n);
    nmod_mat_nullspace(basis_columns, source);
    nmod_mat_zero(output);
    for (slong row = 0; row < nullity; row++)
        for (slong column = 0; column < columns; column++)
            nmod_mat_entry(output, row, column) =
                nmod_mat_entry(basis_columns, column, row);
    nmod_mat_rref(output);
    nmod_mat_clear(basis_columns);
    return nullity;
}

static inline int sagejs_flint_nmod_mat_solve(
    nmod_mat_t output, const nmod_mat_t left, const nmod_mat_t right)
{
    return nmod_mat_solve(output, left, right);
}

/* Host-neutral exact-matrix operations.  The generated declaration adapter
 * owns initialization, conversion, transactional copy-back, and cleanup of
 * every fmpz_mat_t.  These small wrappers express only algebraic shape rules
 * that are absent from the raw FLINT signatures. */
static inline int sagejs_flint_fmpz_mat_mul(
    fmpz_mat_t output, const fmpz_mat_t left, const fmpz_mat_t right)
{
    if (fmpz_mat_nrows(output) != fmpz_mat_nrows(left) ||
        fmpz_mat_ncols(left) != fmpz_mat_nrows(right) ||
        fmpz_mat_ncols(output) != fmpz_mat_ncols(right))
        return 0;
    fmpz_mat_mul(output, left, right);
    return 1;
}

static inline int sagejs_flint_fmpz_mat_det(
    fmpz_mat_t output, const fmpz_mat_t source)
{
    if (fmpz_mat_nrows(output) != 1 || fmpz_mat_ncols(output) != 1 ||
        fmpz_mat_nrows(source) != fmpz_mat_ncols(source))
        return 0;
    fmpz_mat_det(fmpz_mat_entry(output, 0, 0), source);
    return 1;
}

static inline int sagejs_flint_fmpz_mat_charpoly(
    fmpz_mat_t output, const fmpz_mat_t source)
{
    fmpz_poly_t polynomial;
    const slong size = fmpz_mat_nrows(source);
    if (fmpz_mat_ncols(source) != size ||
        fmpz_mat_nrows(output) != 1 ||
        fmpz_mat_ncols(output) != size + 1)
        return 0;
    fmpz_poly_init(polynomial);
    fmpz_mat_charpoly(polynomial, source);
    for (slong index = 0; index <= size; index++)
        fmpz_poly_get_coeff_fmpz(
            fmpz_mat_entry(output, 0, index), polynomial, index);
    fmpz_poly_clear(polynomial);
    return 1;
}

static inline int sagejs_flint_fmpz_mat_hnf(
    fmpz_mat_t output, const fmpz_mat_t source)
{
    if (fmpz_mat_nrows(output) != fmpz_mat_nrows(source) ||
        fmpz_mat_ncols(output) != fmpz_mat_ncols(source))
        return 0;
    fmpz_mat_hnf(output, source);
    return 1;
}

static inline int sagejs_flint_fmpz_mat_hnf_transform(
    fmpz_mat_t output, fmpz_mat_t transform, const fmpz_mat_t source)
{
    const slong rows = fmpz_mat_nrows(source);
    if (fmpz_mat_nrows(output) != rows ||
        fmpz_mat_ncols(output) != fmpz_mat_ncols(source) ||
        fmpz_mat_nrows(transform) != rows ||
        fmpz_mat_ncols(transform) != rows)
        return 0;
    fmpz_mat_hnf_transform(output, transform, source);
    return 1;
}

static inline int sagejs_flint_fmpz_mat_snf_transform(
    fmpz_mat_t output,
    fmpz_mat_t left_transform,
    fmpz_mat_t right_transform,
    const fmpz_mat_t source)
{
    const slong rows = fmpz_mat_nrows(source);
    const slong columns = fmpz_mat_ncols(source);
    if (fmpz_mat_nrows(output) != rows ||
        fmpz_mat_ncols(output) != columns ||
        fmpz_mat_nrows(left_transform) != rows ||
        fmpz_mat_ncols(left_transform) != rows ||
        fmpz_mat_nrows(right_transform) != columns ||
        fmpz_mat_ncols(right_transform) != columns)
        return 0;
    fmpz_mat_snf_transform(
        output, left_transform, right_transform, source);
    return 1;
}

static inline slong sagejs_flint_fmpz_mat_right_kernel(
    fmpz_mat_t output, const fmpz_mat_t source)
{
    const slong rows = fmpz_mat_nrows(source);
    const slong columns = fmpz_mat_ncols(source);
    const slong rank = fmpz_mat_rank(source);
    const slong nullity = columns - rank;
    fmpz_mat_t transpose;
    fmpz_mat_t hermite;
    fmpz_mat_t transform;
    fmpz_mat_t basis;
    if (fmpz_mat_nrows(output) != columns ||
        fmpz_mat_ncols(output) != columns)
        return -1;
    fmpz_mat_init(transpose, columns, rows);
    fmpz_mat_init(hermite, columns, rows);
    fmpz_mat_init(transform, columns, columns);
    fmpz_mat_init(basis, nullity, columns);
    fmpz_mat_transpose(transpose, source);
    fmpz_mat_hnf_transform(hermite, transform, transpose);
    for (slong row = 0; row < nullity; row++)
        for (slong column = 0; column < columns; column++)
            fmpz_set(
                fmpz_mat_entry(basis, row, column),
                fmpz_mat_entry(transform, rank + row, column));
    fmpz_mat_zero(output);
    if (nullity != 0)
    {
        fmpz_mat_t answer;
        fmpz_mat_init(answer, nullity, columns);
        fmpz_mat_hnf(answer, basis);
        for (slong row = 0; row < nullity; row++)
            for (slong column = 0; column < columns; column++)
                fmpz_set(
                    fmpz_mat_entry(output, row, column),
                    fmpz_mat_entry(answer, row, column));
        fmpz_mat_clear(answer);
    }
    fmpz_mat_clear(basis);
    fmpz_mat_clear(transform);
    fmpz_mat_clear(hermite);
    fmpz_mat_clear(transpose);
    return nullity;
}

/* Host-neutral rational matrices use two packed exact-integer matrices.
 * The generated declaration adapter owns those buffers and the temporary
 * fmpz_mat_t values.  These helpers alone construct lexical fmpq_mat_t
 * values, so public mathematical objects never own a FLINT or Node-API
 * handle. */
static inline int sagejs_flint_fmpq_mat_set_parts(
    fmpq_mat_t output,
    const fmpz_mat_t numerators,
    const fmpz_mat_t denominators)
{
    const slong rows = fmpq_mat_nrows(output);
    const slong columns = fmpq_mat_ncols(output);
    if (fmpz_mat_nrows(numerators) != rows ||
        fmpz_mat_ncols(numerators) != columns ||
        fmpz_mat_nrows(denominators) != rows ||
        fmpz_mat_ncols(denominators) != columns)
        return 0;
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
        {
            const fmpz *denominator =
                fmpz_mat_entry(denominators, row, column);
            if (fmpz_is_zero(denominator))
                return 0;
            fmpq_set_fmpz_frac(
                fmpq_mat_entry(output, row, column),
                fmpz_mat_entry(numerators, row, column),
                denominator);
            fmpq_canonicalise(fmpq_mat_entry(output, row, column));
        }
    return 1;
}

static inline int sagejs_flint_fmpq_mat_get_parts(
    fmpz_mat_t numerators,
    fmpz_mat_t denominators,
    const fmpq_mat_t source)
{
    const slong rows = fmpq_mat_nrows(source);
    const slong columns = fmpq_mat_ncols(source);
    if (fmpz_mat_nrows(numerators) != rows ||
        fmpz_mat_ncols(numerators) != columns ||
        fmpz_mat_nrows(denominators) != rows ||
        fmpz_mat_ncols(denominators) != columns)
        return 0;
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
        {
            const fmpq *entry = fmpq_mat_entry(source, row, column);
            fmpz_set(fmpz_mat_entry(numerators, row, column),
                fmpq_numref(entry));
            fmpz_set(fmpz_mat_entry(denominators, row, column),
                fmpq_denref(entry));
        }
    return 1;
}

static inline int sagejs_flint_fmpq_mat_mul_parts(
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t left_numerators,
    const fmpz_mat_t left_denominators,
    const fmpz_mat_t right_numerators,
    const fmpz_mat_t right_denominators)
{
    int success = 0;
    fmpq_mat_t left, right, output;
    fmpq_mat_init(left, fmpz_mat_nrows(left_numerators),
        fmpz_mat_ncols(left_numerators));
    fmpq_mat_init(right, fmpz_mat_nrows(right_numerators),
        fmpz_mat_ncols(right_numerators));
    fmpq_mat_init(output, fmpz_mat_nrows(output_numerators),
        fmpz_mat_ncols(output_numerators));
    if (!sagejs_flint_fmpq_mat_set_parts(
            left, left_numerators, left_denominators) ||
        !sagejs_flint_fmpq_mat_set_parts(
            right, right_numerators, right_denominators) ||
        fmpq_mat_nrows(output) != fmpq_mat_nrows(left) ||
        fmpq_mat_ncols(left) != fmpq_mat_nrows(right) ||
        fmpq_mat_ncols(output) != fmpq_mat_ncols(right))
        goto cleanup;
    fmpq_mat_mul(output, left, right);
    success = sagejs_flint_fmpq_mat_get_parts(
        output_numerators, output_denominators, output);
cleanup:
    fmpq_mat_clear(output);
    fmpq_mat_clear(right);
    fmpq_mat_clear(left);
    return success;
}

static inline int sagejs_flint_fmpq_mat_rank_parts(
    fmpz_mat_t output_rank,
    const fmpz_mat_t numerators,
    const fmpz_mat_t denominators)
{
    slong rank = -1;
    fmpq_mat_t source, reduced;
    if (fmpz_mat_nrows(output_rank) != 1 ||
        fmpz_mat_ncols(output_rank) != 1)
        return 0;
    fmpq_mat_init(source, fmpz_mat_nrows(numerators),
        fmpz_mat_ncols(numerators));
    fmpq_mat_init(reduced, fmpz_mat_nrows(numerators),
        fmpz_mat_ncols(numerators));
    if (sagejs_flint_fmpq_mat_set_parts(
            source, numerators, denominators))
        rank = fmpq_mat_rref(reduced, source);
    fmpq_mat_clear(reduced);
    fmpq_mat_clear(source);
    if (rank < 0)
        return 0;
    fmpz_set_si(fmpz_mat_entry(output_rank, 0, 0), rank);
    return 1;
}

static inline int sagejs_flint_fmpq_mat_rref_parts(
    fmpz_mat_t output_rank,
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t source_numerators,
    const fmpz_mat_t source_denominators)
{
    slong rank = -1;
    fmpq_mat_t source, output;
    if (fmpz_mat_nrows(output_rank) != 1 ||
        fmpz_mat_ncols(output_rank) != 1)
        return 0;
    fmpq_mat_init(source, fmpz_mat_nrows(source_numerators),
        fmpz_mat_ncols(source_numerators));
    fmpq_mat_init(output, fmpz_mat_nrows(output_numerators),
        fmpz_mat_ncols(output_numerators));
    if (sagejs_flint_fmpq_mat_set_parts(
            source, source_numerators, source_denominators) &&
        fmpq_mat_nrows(output) == fmpq_mat_nrows(source) &&
        fmpq_mat_ncols(output) == fmpq_mat_ncols(source))
    {
        rank = fmpq_mat_rref(output, source);
        if (!sagejs_flint_fmpq_mat_get_parts(
                output_numerators, output_denominators, output))
            rank = -1;
    }
    fmpq_mat_clear(output);
    fmpq_mat_clear(source);
    if (rank < 0)
        return 0;
    fmpz_set_si(fmpz_mat_entry(output_rank, 0, 0), rank);
    return 1;
}

static inline int sagejs_flint_fmpq_mat_inv_parts(
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t source_numerators,
    const fmpz_mat_t source_denominators)
{
    int success = 0;
    fmpq_mat_t source, output;
    fmpq_mat_init(source, fmpz_mat_nrows(source_numerators),
        fmpz_mat_ncols(source_numerators));
    fmpq_mat_init(output, fmpz_mat_nrows(output_numerators),
        fmpz_mat_ncols(output_numerators));
    if (sagejs_flint_fmpq_mat_set_parts(
            source, source_numerators, source_denominators) &&
        fmpq_mat_nrows(source) == fmpq_mat_ncols(source) &&
        fmpq_mat_nrows(output) == fmpq_mat_nrows(source) &&
        fmpq_mat_ncols(output) == fmpq_mat_ncols(source) &&
        fmpq_mat_inv(output, source))
        success = sagejs_flint_fmpq_mat_get_parts(
            output_numerators, output_denominators, output);
    fmpq_mat_clear(output);
    fmpq_mat_clear(source);
    return success;
}

static inline int sagejs_flint_fmpq_mat_solve_parts(
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t left_numerators,
    const fmpz_mat_t left_denominators,
    const fmpz_mat_t right_numerators,
    const fmpz_mat_t right_denominators)
{
    int success = 0;
    fmpq_mat_t left, right, output;
    fmpq_mat_init(left, fmpz_mat_nrows(left_numerators),
        fmpz_mat_ncols(left_numerators));
    fmpq_mat_init(right, fmpz_mat_nrows(right_numerators),
        fmpz_mat_ncols(right_numerators));
    fmpq_mat_init(output, fmpz_mat_nrows(output_numerators),
        fmpz_mat_ncols(output_numerators));
    if (sagejs_flint_fmpq_mat_set_parts(
            left, left_numerators, left_denominators) &&
        sagejs_flint_fmpq_mat_set_parts(
            right, right_numerators, right_denominators) &&
        fmpq_mat_nrows(left) == fmpq_mat_ncols(left) &&
        fmpq_mat_nrows(right) == fmpq_mat_nrows(left) &&
        fmpq_mat_nrows(output) == fmpq_mat_ncols(left) &&
        fmpq_mat_ncols(output) == fmpq_mat_ncols(right) &&
        fmpq_mat_solve(output, left, right))
        success = sagejs_flint_fmpq_mat_get_parts(
            output_numerators, output_denominators, output);
    fmpq_mat_clear(output);
    fmpq_mat_clear(right);
    fmpq_mat_clear(left);
    return success;
}

static inline int sagejs_flint_fmpq_mat_det_parts(
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t source_numerators,
    const fmpz_mat_t source_denominators)
{
    int success = 0;
    fmpq_mat_t source;
    fmpq_t determinant;
    if (fmpz_mat_nrows(output_numerators) != 1 ||
        fmpz_mat_ncols(output_numerators) != 1 ||
        fmpz_mat_nrows(output_denominators) != 1 ||
        fmpz_mat_ncols(output_denominators) != 1)
        return 0;
    fmpq_mat_init(source, fmpz_mat_nrows(source_numerators),
        fmpz_mat_ncols(source_numerators));
    fmpq_init(determinant);
    if (sagejs_flint_fmpq_mat_set_parts(
            source, source_numerators, source_denominators) &&
        fmpq_mat_nrows(source) == fmpq_mat_ncols(source))
    {
        fmpq_mat_det(determinant, source);
        fmpz_set(fmpz_mat_entry(output_numerators, 0, 0),
            fmpq_numref(determinant));
        fmpz_set(fmpz_mat_entry(output_denominators, 0, 0),
            fmpq_denref(determinant));
        success = 1;
    }
    fmpq_clear(determinant);
    fmpq_mat_clear(source);
    return success;
}

static inline int sagejs_flint_fmpq_mat_charpoly_parts(
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t source_numerators,
    const fmpz_mat_t source_denominators)
{
    int success = 0;
    const slong size = fmpz_mat_nrows(source_numerators);
    fmpq_mat_t source;
    fmpq_poly_t polynomial;
    fmpq_t coefficient;
    if (fmpz_mat_ncols(source_numerators) != size ||
        fmpz_mat_nrows(output_numerators) != 1 ||
        fmpz_mat_ncols(output_numerators) != size + 1 ||
        fmpz_mat_nrows(output_denominators) != 1 ||
        fmpz_mat_ncols(output_denominators) != size + 1)
        return 0;
    fmpq_mat_init(source, size, size);
    fmpq_poly_init(polynomial);
    fmpq_init(coefficient);
    if (sagejs_flint_fmpq_mat_set_parts(
            source, source_numerators, source_denominators))
    {
        fmpq_mat_charpoly(polynomial, source);
        for (slong index = 0; index <= size; index++)
        {
            fmpq_poly_get_coeff_fmpq(coefficient, polynomial, index);
            fmpz_set(fmpz_mat_entry(output_numerators, 0, index),
                fmpq_numref(coefficient));
            fmpz_set(fmpz_mat_entry(output_denominators, 0, index),
                fmpq_denref(coefficient));
        }
        success = 1;
    }
    fmpq_clear(coefficient);
    fmpq_poly_clear(polynomial);
    fmpq_mat_clear(source);
    return success;
}

#ifdef __cplusplus
}
#endif

#endif
