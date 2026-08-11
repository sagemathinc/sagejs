#ifndef SAGEJS_FMPQ_MATRIX_FFI_H
#define SAGEJS_FMPQ_MATRIX_FFI_H

#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <flint/flint.h>
#include <flint/fmpq.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpz.h>
#include <flint/fmpz_extras.h>

/*
 * Host-neutral resource ABI for dense rational matrices.
 *
 * These types are owned by generated Sage.js adapters.  A host sees an opaque
 * lifetime token; compiled kernels see the ordinary FLINT value while a call
 * is in progress.  No FLINT pointer becomes part of a public Matrix object.
 */

typedef struct
{
    fmpq_mat_t value;
    slong known_rank;
    size_t retained_bytes;
} sagejs_fmpq_matrix_struct;

typedef sagejs_fmpq_matrix_struct sagejs_fmpq_matrix_t[1];

typedef fmpq_t sagejs_fmpq_value_t;

typedef struct
{
    unsigned char *data;
    size_t length;
} sagejs_flint_byte_region_struct;

typedef sagejs_flint_byte_region_struct sagejs_flint_byte_region_t[1];

static inline size_t sagejs_retained_size_add(
    size_t left, size_t right)
{
    return left > SIZE_MAX - right ? SIZE_MAX : left + right;
}

static inline size_t sagejs_retained_size_multiply(
    size_t left, size_t right)
{
    return left != 0 && right > SIZE_MAX / left ? SIZE_MAX : left * right;
}

static inline size_t sagejs_fmpz_retained_bytes(const fmpz_t value)
{
    const slong allocated = fmpz_allocated_bytes(value);
    return allocated > 0 ? (size_t) allocated : 0;
}

static inline size_t sagejs_fmpq_retained_bytes(const fmpq *value)
{
    return sagejs_retained_size_add(
        sagejs_fmpz_retained_bytes(fmpq_numref(value)),
        sagejs_fmpz_retained_bytes(fmpq_denref(value)));
}

static inline size_t sagejs_fmpq_matrix_structural_bytes(
    uint64_t rows, uint64_t columns)
{
    const size_t entries = sagejs_retained_size_multiply(
        (size_t) rows, (size_t) columns);
    return sagejs_retained_size_add(
        sizeof(sagejs_fmpq_matrix_struct),
        sagejs_retained_size_multiply(entries, sizeof(fmpq)));
}

static inline void sagejs_fmpq_matrix_recompute_allocated_bytes(
    sagejs_fmpq_matrix_t matrix)
{
    const slong rows = fmpq_mat_nrows(matrix->value);
    const slong columns = fmpq_mat_ncols(matrix->value);
    size_t retained = sagejs_fmpq_matrix_structural_bytes(
        (uint64_t) rows, (uint64_t) columns);
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            retained = sagejs_retained_size_add(retained,
                sagejs_fmpq_retained_bytes(
                    fmpq_mat_entry(matrix->value, row, column)));
    matrix->retained_bytes = retained;
}

static inline size_t sagejs_fmpq_matrix_allocated_bytes(
    const sagejs_fmpq_matrix_t matrix)
{
    return matrix->retained_bytes;
}

static inline size_t sagejs_fmpq_value_allocated_bytes(
    const sagejs_fmpq_value_t value)
{
    return sagejs_retained_size_add(
        sizeof(fmpq), sagejs_fmpq_retained_bytes(value));
}

static inline size_t sagejs_flint_byte_region_allocated_bytes(
    const sagejs_flint_byte_region_t region)
{
    const size_t data_bytes = region->data == NULL
        ? 0 : (region->length == 0 ? 1 : region->length);
    return sagejs_retained_size_add(
        sizeof(sagejs_flint_byte_region_struct), data_bytes);
}

static inline int sagejs_fmpq_matrix_init(
    sagejs_fmpq_matrix_t result, uint64_t rows, uint64_t columns)
{
    if (rows > (uint64_t) WORD_MAX || columns > (uint64_t) WORD_MAX ||
        (rows != 0 && columns > (uint64_t) SIZE_MAX / rows))
        return 0;
    fmpq_mat_init(result->value, (slong) rows, (slong) columns);
    result->known_rank = -1;
    result->retained_bytes =
        sagejs_fmpq_matrix_structural_bytes(rows, columns);
    return 1;
}

static inline void sagejs_fmpq_matrix_clear(sagejs_fmpq_matrix_t matrix)
{
    fmpq_mat_clear(matrix->value);
    matrix->known_rank = -1;
    matrix->retained_bytes = 0;
}

static inline int sagejs_fmpq_matrix_randbits(
    sagejs_fmpq_matrix_t result, uint64_t rows, uint64_t columns,
    uint64_t bits, uint64_t seed1, uint64_t seed2)
{
    if (bits == 0 || bits > (uint64_t) UWORD_MAX ||
        seed1 > (uint64_t) UWORD_MAX || seed2 > (uint64_t) UWORD_MAX ||
        !sagejs_fmpq_matrix_init(result, rows, columns))
        return 0;
    flint_rand_t state;
    flint_rand_init(state);
    if (seed1 == 0 && seed2 == 0)
        seed2 = 1;
    flint_rand_set_seed(state, (ulong) seed1, (ulong) seed2);
    fmpq_mat_randbits(result->value, state, (flint_bitcnt_t) bits);
    flint_rand_clear(state);
    result->known_rank = -1;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_set_entry(
    sagejs_fmpq_matrix_t matrix, uint64_t row, uint64_t column,
    const fmpz_t numerator, const fmpz_t denominator)
{
    if (row >= (uint64_t) fmpq_mat_nrows(matrix->value) ||
        column >= (uint64_t) fmpq_mat_ncols(matrix->value) ||
        fmpz_is_zero(denominator))
        return 0;
    fmpq *entry = fmpq_mat_entry(
        matrix->value, (slong) row, (slong) column);
    const size_t previous = sagejs_fmpq_retained_bytes(entry);
    fmpq_set_fmpz_frac(entry, numerator, denominator);
    const size_t current = sagejs_fmpq_retained_bytes(entry);
    if (matrix->retained_bytes != SIZE_MAX)
    {
        if (previous <= matrix->retained_bytes)
        {
            matrix->retained_bytes -= previous;
            matrix->retained_bytes = sagejs_retained_size_add(
                matrix->retained_bytes, current);
        }
        else
            sagejs_fmpq_matrix_recompute_allocated_bytes(matrix);
    }
    matrix->known_rank = -1;
    return 1;
}

static inline int sagejs_fmpq_matrix_entry_numerator(
    fmpz_t result, const sagejs_fmpq_matrix_t matrix,
    uint64_t row, uint64_t column)
{
    if (row >= (uint64_t) fmpq_mat_nrows(matrix->value) ||
        column >= (uint64_t) fmpq_mat_ncols(matrix->value))
        return 0;
    fmpz_set(result,
        fmpq_mat_entry_num(matrix->value, (slong) row, (slong) column));
    return 1;
}

static inline int sagejs_fmpq_matrix_entry_denominator(
    fmpz_t result, const sagejs_fmpq_matrix_t matrix,
    uint64_t row, uint64_t column)
{
    if (row >= (uint64_t) fmpq_mat_nrows(matrix->value) ||
        column >= (uint64_t) fmpq_mat_ncols(matrix->value))
        return 0;
    fmpz_set(result,
        fmpq_mat_entry_den(matrix->value, (slong) row, (slong) column));
    return 1;
}

static inline int sagejs_fmpq_matrix_entry_is_zero(
    const sagejs_fmpq_matrix_t matrix, uint64_t row, uint64_t column)
{
    if (row >= (uint64_t) fmpq_mat_nrows(matrix->value) ||
        column >= (uint64_t) fmpq_mat_ncols(matrix->value))
        return 0;
    return fmpz_is_zero(
        fmpq_mat_entry_num(matrix->value, (slong) row, (slong) column));
}

static inline uint64_t sagejs_fmpq_matrix_nrows(
    const sagejs_fmpq_matrix_t matrix)
{
    return (uint64_t) fmpq_mat_nrows(matrix->value);
}

static inline uint64_t sagejs_fmpq_matrix_ncols(
    const sagejs_fmpq_matrix_t matrix)
{
    return (uint64_t) fmpq_mat_ncols(matrix->value);
}

static inline int sagejs_fmpq_matrix_init_set(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t source)
{
    fmpq_mat_init_set(result->value, source->value);
    result->known_rank = source->known_rank;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_neg(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t source)
{
    fmpq_mat_init(result->value,
        fmpq_mat_nrows(source->value), fmpq_mat_ncols(source->value));
    fmpq_mat_neg(result->value, source->value);
    result->known_rank = source->known_rank;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_scalar_mul(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t source,
    const fmpz_t numerator, const fmpz_t denominator)
{
    fmpq_t scalar;
    if (fmpz_is_zero(denominator))
        return 0;
    fmpq_init(scalar);
    fmpq_set_fmpz_frac(scalar, numerator, denominator);
    fmpq_mat_init(result->value,
        fmpq_mat_nrows(source->value), fmpq_mat_ncols(source->value));
    fmpq_mat_scalar_mul_fmpq(result->value, source->value, scalar);
    result->known_rank = fmpq_is_zero(scalar) ? 0 : source->known_rank;
    fmpq_clear(scalar);
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_equal(
    const sagejs_fmpq_matrix_t left, const sagejs_fmpq_matrix_t right)
{
    return fmpq_mat_equal(left->value, right->value);
}

static inline int sagejs_fmpq_matrix_is_zero(
    const sagejs_fmpq_matrix_t matrix)
{
    return fmpq_mat_is_zero(matrix->value);
}

static inline int sagejs_fmpq_matrix_is_one(
    const sagejs_fmpq_matrix_t matrix)
{
    if (fmpq_mat_nrows(matrix->value) != fmpq_mat_ncols(matrix->value))
        return 0;
    return fmpq_mat_is_one(matrix->value);
}

static inline int sagejs_fmpq_matrix_add(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t left,
    const sagejs_fmpq_matrix_t right)
{
    if (fmpq_mat_nrows(left->value) != fmpq_mat_nrows(right->value) ||
        fmpq_mat_ncols(left->value) != fmpq_mat_ncols(right->value))
        return 0;
    fmpq_mat_init(result->value,
        fmpq_mat_nrows(left->value), fmpq_mat_ncols(left->value));
    fmpq_mat_add(result->value, left->value, right->value);
    result->known_rank = -1;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_sub(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t left,
    const sagejs_fmpq_matrix_t right)
{
    if (fmpq_mat_nrows(left->value) != fmpq_mat_nrows(right->value) ||
        fmpq_mat_ncols(left->value) != fmpq_mat_ncols(right->value))
        return 0;
    fmpq_mat_init(result->value,
        fmpq_mat_nrows(left->value), fmpq_mat_ncols(left->value));
    fmpq_mat_sub(result->value, left->value, right->value);
    result->known_rank = -1;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_transpose(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t source)
{
    fmpq_mat_init(result->value,
        fmpq_mat_ncols(source->value), fmpq_mat_nrows(source->value));
    fmpq_mat_transpose(result->value, source->value);
    result->known_rank = source->known_rank;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_mul(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t left,
    const sagejs_fmpq_matrix_t right)
{
    if (fmpq_mat_ncols(left->value) != fmpq_mat_nrows(right->value))
        return 0;
    fmpq_mat_init(result->value,
        fmpq_mat_nrows(left->value), fmpq_mat_ncols(right->value));
    fmpq_mat_mul(result->value, left->value, right->value);
    result->known_rank = -1;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_inv(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t source)
{
    const slong rows = fmpq_mat_nrows(source->value);
    if (rows != fmpq_mat_ncols(source->value))
        return 0;
    fmpq_mat_init(result->value, rows, rows);
    if (!fmpq_mat_inv(result->value, source->value))
    {
        fmpq_mat_clear(result->value);
        result->known_rank = -1;
        result->retained_bytes = 0;
        return 0;
    }
    result->known_rank = rows;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_solve(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t left,
    const sagejs_fmpq_matrix_t right)
{
    if (fmpq_mat_nrows(left->value) != fmpq_mat_nrows(right->value))
        return 0;
    fmpq_mat_init(result->value,
        fmpq_mat_ncols(left->value), fmpq_mat_ncols(right->value));
    if (!fmpq_mat_can_solve(result->value, left->value, right->value))
    {
        fmpq_mat_clear(result->value);
        result->known_rank = -1;
        result->retained_bytes = 0;
        return 0;
    }
    result->known_rank = -1;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_rref(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t source)
{
    fmpq_mat_init(result->value,
        fmpq_mat_nrows(source->value), fmpq_mat_ncols(source->value));
    result->known_rank = fmpq_mat_rref(result->value, source->value);
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

/*
 * Return the canonical RREF row basis of the rational right kernel.
 *
 * The source is reduced exactly once, with its columns reversed.  Those
 * pivots are the lexicographically latest independent source columns, so
 * their complement is the lexicographically earliest kernel pivot set.
 * Reversing the constructed columns and basis-row order therefore produces
 * Sage's canonical RREF basis directly, without a second elimination.  No
 * caller-selected limb capacity or packed intermediate is involved.
 */
static inline int sagejs_fmpq_matrix_right_kernel(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t source)
{
    const slong rows = fmpq_mat_nrows(source->value);
    const slong columns = fmpq_mat_ncols(source->value);
    if (columns == 0)
        return sagejs_fmpq_matrix_init(result, 0, 0);
    if (rows == 0)
    {
        if (!sagejs_fmpq_matrix_init(
                result, (uint64_t) columns, (uint64_t) columns))
            return 0;
        fmpq_mat_one(result->value);
        result->known_rank = columns;
        sagejs_fmpq_matrix_recompute_allocated_bytes(result);
        return 1;
    }

    fmpq_mat_t reversed;
    fmpq_mat_t reduced;
    fmpq_mat_init(reversed, rows, columns);
    fmpq_mat_init(reduced, rows, columns);
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            fmpq_set(fmpq_mat_entry(reversed, row, column),
                fmpq_mat_entry(source->value,
                    row, columns - column - 1));
    const slong rank = fmpq_mat_rref(reduced, reversed);
    fmpq_mat_clear(reversed);
    const slong nullity = columns - rank;
    if (!sagejs_fmpq_matrix_init(
            result, (uint64_t) nullity, (uint64_t) columns))
    {
        fmpq_mat_clear(reduced);
        return 0;
    }
    if (nullity == 0)
    {
        fmpq_mat_clear(reduced);
        result->known_rank = 0;
        return 1;
    }
    if (rank == 0)
    {
        fmpq_mat_one(result->value);
        fmpq_mat_clear(reduced);
        result->known_rank = nullity;
        sagejs_fmpq_matrix_recompute_allocated_bytes(result);
        return 1;
    }

    if ((size_t) rank > SIZE_MAX / sizeof(slong))
    {
        fmpq_mat_clear(reduced);
        goto fail_result;
    }
    slong *pivot_columns = (slong *) malloc((size_t) rank * sizeof(slong));
    if (pivot_columns == NULL)
    {
        fmpq_mat_clear(reduced);
        goto fail_result;
    }
    for (slong row = 0; row < rank; row++)
    {
        slong pivot_column = 0;
        while (pivot_column < columns &&
               fmpq_is_zero(fmpq_mat_entry(reduced, row, pivot_column)))
            pivot_column++;
        if (pivot_column >= columns ||
            (row > 0 && pivot_column <= pivot_columns[row - 1]))
        {
            free(pivot_columns);
            fmpq_mat_clear(reduced);
            goto fail_result;
        }
        pivot_columns[row] = pivot_column;
    }

    slong pivot_row = 0;
    slong basis_row = 0;
    for (slong column = 0; column < columns; column++)
    {
        const int is_pivot =
            pivot_row < rank && pivot_columns[pivot_row] == column;
        if (is_pivot)
        {
            pivot_row++;
            continue;
        }
        const slong result_row = nullity - basis_row - 1;
        const slong result_column = columns - column - 1;
        fmpq_one(
            fmpq_mat_entry(result->value, result_row, result_column));
        for (slong row = 0; row < rank; row++)
            fmpq_neg(
                fmpq_mat_entry(
                    result->value, result_row,
                    columns - pivot_columns[row] - 1),
                fmpq_mat_entry(reduced, row, column));
        basis_row++;
    }
    free(pivot_columns);
    fmpq_mat_clear(reduced);
    if (pivot_row != rank || basis_row != nullity)
        goto fail_result;

    result->known_rank = nullity;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;

fail_result:
    fmpq_mat_clear(result->value);
    result->known_rank = -1;
    result->retained_bytes = 0;
    return 0;
}

static inline uint64_t sagejs_fmpq_matrix_rank(
    sagejs_fmpq_matrix_t matrix)
{
    if (matrix->known_rank >= 0)
        return (uint64_t) matrix->known_rank;
    fmpq_mat_t reduced;
    fmpq_mat_init(reduced,
        fmpq_mat_nrows(matrix->value), fmpq_mat_ncols(matrix->value));
    const slong rank = fmpq_mat_rref(reduced, matrix->value);
    fmpq_mat_clear(reduced);
    matrix->known_rank = rank;
    return (uint64_t) rank;
}

static inline int sagejs_fmpq_matrix_det(
    sagejs_fmpq_value_t result, const sagejs_fmpq_matrix_t source)
{
    if (fmpq_mat_nrows(source->value) != fmpq_mat_ncols(source->value))
        return 0;
    fmpq_init(result);
    fmpq_mat_det(result, source->value);
    return 1;
}

static inline int sagejs_fmpq_matrix_trace(
    sagejs_fmpq_value_t result, const sagejs_fmpq_matrix_t source)
{
    if (fmpq_mat_nrows(source->value) != fmpq_mat_ncols(source->value))
        return 0;
    fmpq_init(result);
    fmpq_mat_trace(result, source->value);
    return 1;
}

static inline int sagejs_fmpq_matrix_submatrix(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t source,
    uint64_t row_start, uint64_t row_stop,
    uint64_t column_start, uint64_t column_stop)
{
    const uint64_t rows = (uint64_t) fmpq_mat_nrows(source->value);
    const uint64_t columns = (uint64_t) fmpq_mat_ncols(source->value);
    if (row_start > row_stop || row_stop > rows ||
        column_start > column_stop || column_stop > columns ||
        !sagejs_fmpq_matrix_init(
            result, row_stop - row_start, column_stop - column_start))
        return 0;
    for (uint64_t row = row_start; row < row_stop; row++)
        for (uint64_t column = column_start;
             column < column_stop; column++)
            fmpq_set(fmpq_mat_entry(result->value,
                    (slong) (row - row_start),
                    (slong) (column - column_start)),
                fmpq_mat_entry(source->value,
                    (slong) row, (slong) column));
    result->known_rank = -1;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

/*
 * Index selections preserve order and permit duplicates.  Validate every
 * borrowed index before initializing the owned result, so a rejected call
 * never leaves a partially initialized resource for its generated adapter.
 */
static inline int sagejs_fmpq_matrix_select_rows(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t source,
    const uint64_t *selected_rows, uint64_t count)
{
    const uint64_t rows = (uint64_t) fmpq_mat_nrows(source->value);
    const uint64_t columns = (uint64_t) fmpq_mat_ncols(source->value);
    if ((count != 0 && selected_rows == NULL) ||
        count > (uint64_t) WORD_MAX ||
        (count != 0 && columns > (uint64_t) SIZE_MAX / count))
        return 0;
    for (uint64_t index = 0; index < count; index++)
        if (selected_rows[index] >= rows)
            return 0;
    if (!sagejs_fmpq_matrix_init(result, count, columns))
        return 0;
    for (uint64_t row = 0; row < count; row++)
        for (uint64_t column = 0; column < columns; column++)
            fmpq_set(fmpq_mat_entry(result->value,
                    (slong) row, (slong) column),
                fmpq_mat_entry(source->value,
                    (slong) selected_rows[row], (slong) column));
    result->known_rank = -1;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_select_columns(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t source,
    const uint64_t *selected_columns, uint64_t count)
{
    const uint64_t rows = (uint64_t) fmpq_mat_nrows(source->value);
    const uint64_t columns = (uint64_t) fmpq_mat_ncols(source->value);
    if ((count != 0 && selected_columns == NULL) ||
        count > (uint64_t) WORD_MAX ||
        (rows != 0 && count > (uint64_t) SIZE_MAX / rows))
        return 0;
    for (uint64_t index = 0; index < count; index++)
        if (selected_columns[index] >= columns)
            return 0;
    if (!sagejs_fmpq_matrix_init(result, rows, count))
        return 0;
    for (uint64_t row = 0; row < rows; row++)
        for (uint64_t column = 0; column < count; column++)
            fmpq_set(fmpq_mat_entry(result->value,
                    (slong) row, (slong) column),
                fmpq_mat_entry(source->value,
                    (slong) row, (slong) selected_columns[column]));
    result->known_rank = -1;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_set_block(
    sagejs_fmpq_matrix_t target, uint64_t target_row,
    uint64_t target_column, const sagejs_fmpq_matrix_t source)
{
    const uint64_t target_rows =
        (uint64_t) fmpq_mat_nrows(target->value);
    const uint64_t target_columns =
        (uint64_t) fmpq_mat_ncols(target->value);
    const uint64_t source_rows =
        (uint64_t) fmpq_mat_nrows(source->value);
    const uint64_t source_columns =
        (uint64_t) fmpq_mat_ncols(source->value);
    if (target == source || target_row > target_rows ||
        source_rows > target_rows - target_row ||
        target_column > target_columns ||
        source_columns > target_columns - target_column)
        return 0;
    for (uint64_t row = 0; row < source_rows; row++)
        for (uint64_t column = 0; column < source_columns; column++)
            fmpq_set(fmpq_mat_entry(target->value,
                    (slong) (target_row + row),
                    (slong) (target_column + column)),
                fmpq_mat_entry(source->value,
                    (slong) row, (slong) column));
    target->known_rank = -1;
    sagejs_fmpq_matrix_recompute_allocated_bytes(target);
    return 1;
}

static inline int sagejs_fmpq_matrix_dimension_add(
    uint64_t *result, uint64_t left, uint64_t right)
{
    if (left > UINT64_MAX - right)
        return 0;
    *result = left + right;
    return 1;
}

static inline int sagejs_fmpq_matrix_stack(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t top,
    const sagejs_fmpq_matrix_t bottom)
{
    const uint64_t top_rows = (uint64_t) fmpq_mat_nrows(top->value);
    const uint64_t bottom_rows = (uint64_t) fmpq_mat_nrows(bottom->value);
    const uint64_t columns = (uint64_t) fmpq_mat_ncols(top->value);
    uint64_t rows;
    if (fmpq_mat_ncols(top->value) != fmpq_mat_ncols(bottom->value) ||
        !sagejs_fmpq_matrix_dimension_add(&rows, top_rows, bottom_rows) ||
        !sagejs_fmpq_matrix_init(result, rows, columns))
        return 0;
    for (uint64_t row = 0; row < top_rows; row++)
        for (uint64_t column = 0; column < columns; column++)
            fmpq_set(fmpq_mat_entry(result->value,
                    (slong) row, (slong) column),
                fmpq_mat_entry(top->value,
                    (slong) row, (slong) column));
    for (uint64_t row = 0; row < bottom_rows; row++)
        for (uint64_t column = 0; column < columns; column++)
            fmpq_set(fmpq_mat_entry(result->value,
                    (slong) (top_rows + row), (slong) column),
                fmpq_mat_entry(bottom->value,
                    (slong) row, (slong) column));
    result->known_rank = -1;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_augment(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t left,
    const sagejs_fmpq_matrix_t right)
{
    const uint64_t rows = (uint64_t) fmpq_mat_nrows(left->value);
    const uint64_t left_columns =
        (uint64_t) fmpq_mat_ncols(left->value);
    const uint64_t right_columns =
        (uint64_t) fmpq_mat_ncols(right->value);
    uint64_t columns;
    if (fmpq_mat_nrows(left->value) != fmpq_mat_nrows(right->value) ||
        !sagejs_fmpq_matrix_dimension_add(
            &columns, left_columns, right_columns) ||
        !sagejs_fmpq_matrix_init(result, rows, columns))
        return 0;
    for (uint64_t row = 0; row < rows; row++)
    {
        for (uint64_t column = 0; column < left_columns; column++)
            fmpq_set(fmpq_mat_entry(result->value,
                    (slong) row, (slong) column),
                fmpq_mat_entry(left->value,
                    (slong) row, (slong) column));
        for (uint64_t column = 0; column < right_columns; column++)
            fmpq_set(fmpq_mat_entry(result->value,
                    (slong) row, (slong) (left_columns + column)),
                fmpq_mat_entry(right->value,
                    (slong) row, (slong) column));
    }
    result->known_rank = -1;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline uint64_t sagejs_fmpq_matrix_nonzero_count(
    const sagejs_fmpq_matrix_t source)
{
    const slong rows = fmpq_mat_nrows(source->value);
    const slong columns = fmpq_mat_ncols(source->value);
    uint64_t count = 0;
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            count += !fmpz_is_zero(
                fmpq_mat_entry_num(source->value, row, column));
    return count;
}

static inline void sagejs_fmpq_value_clear(sagejs_fmpq_value_t value)
{
    fmpq_clear(value);
}

static inline void sagejs_fmpq_value_numerator(
    fmpz_t result, const sagejs_fmpq_value_t value)
{
    fmpz_set(result, fmpq_numref(value));
}

static inline void sagejs_fmpq_value_denominator(
    fmpz_t result, const sagejs_fmpq_value_t value)
{
    fmpz_set(result, fmpq_denref(value));
}

static inline void sagejs_flint_byte_region_clear(
    sagejs_flint_byte_region_t region)
{
    free(region->data);
    region->data = NULL;
    region->length = 0;
}

static inline int sagejs_size_add(size_t *value, size_t increment)
{
    if (*value > SIZE_MAX - increment)
        return 0;
    *value += increment;
    return 1;
}

static inline int sagejs_fmpq_matrix_format(
    sagejs_flint_byte_region_t result, const sagejs_fmpq_matrix_t source)
{
    const slong rows = fmpq_mat_nrows(source->value);
    const slong columns = fmpq_mat_ncols(source->value);
    const size_t count = (size_t) rows * (size_t) columns;
    char **entries = NULL;
    size_t width = 0;
    size_t length = 0;
    result->data = NULL;
    result->length = 0;
    if (count != 0)
    {
        if (count > SIZE_MAX / sizeof(char *))
            return 0;
        entries = (char **) calloc(count, sizeof(char *));
        if (entries == NULL)
            return 0;
    }
    for (size_t index = 0; index < count; index++)
    {
        const slong row = (slong) (index / (size_t) columns);
        const slong column = (slong) (index % (size_t) columns);
        entries[index] = fmpq_get_str(
            NULL, 10, fmpq_mat_entry(source->value, row, column));
        if (entries[index] == NULL)
            goto fail;
        const size_t entry_length = strlen(entries[index]);
        if (entry_length > width)
            width = entry_length;
    }
    if (rows == 0)
        length = 2;
    else
    {
        for (slong row = 0; row < rows; row++)
        {
            if (columns > 0 && width > SIZE_MAX / (size_t) columns)
                goto fail;
            if (!sagejs_size_add(&length, 2) ||
                (columns > 0 &&
                 (!sagejs_size_add(&length, (size_t) columns * width) ||
                  !sagejs_size_add(&length, (size_t) columns - 1))) ||
                (row + 1 < rows && !sagejs_size_add(&length, 1)))
                goto fail;
        }
    }
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (result->data == NULL)
        goto fail;
    result->length = length;
    size_t offset = 0;
    if (rows == 0)
    {
        result->data[offset++] = '[';
        result->data[offset++] = ']';
    }
    else
    {
        for (slong row = 0; row < rows; row++)
        {
            result->data[offset++] = '[';
            for (slong column = 0; column < columns; column++)
            {
                const char *entry = entries[(size_t) row * (size_t) columns +
                    (size_t) column];
                const size_t entry_length = strlen(entry);
                for (size_t padding = entry_length; padding < width; padding++)
                    result->data[offset++] = ' ';
                memcpy(result->data + offset, entry, entry_length);
                offset += entry_length;
                if (column + 1 < columns)
                    result->data[offset++] = ' ';
            }
            result->data[offset++] = ']';
            if (row + 1 < rows)
                result->data[offset++] = '\n';
        }
    }
    for (size_t index = 0; index < count; index++)
        flint_free(entries[index]);
    free(entries);
    return 1;

fail:
    for (size_t index = 0; index < count; index++)
        if (entries != NULL && entries[index] != NULL)
            flint_free(entries[index]);
    free(entries);
    sagejs_flint_byte_region_clear(result);
    return 0;
}

static inline size_t sagejs_fmpz_serialized_bytes(const fmpz_t value)
{
    return fmpz_is_zero(value)
        ? 0 : (size_t) ((fmpz_bits(value) + 7) / 8);
}

static inline int sagejs_fmpq_matrix_serialize(
    sagejs_flint_byte_region_t result, const sagejs_fmpq_matrix_t source)
{
    const slong rows = fmpq_mat_nrows(source->value);
    const slong columns = fmpq_mat_ncols(source->value);
    const size_t count = (size_t) rows * (size_t) columns;
    size_t length = 0;
    size_t maximum_bytes = 0;
    result->data = NULL;
    result->length = 0;
    for (size_t index = 0; index < count; index++)
    {
        const slong row = (slong) (index / (size_t) columns);
        const slong column = (slong) (index % (size_t) columns);
        const fmpq *entry = fmpq_mat_entry(source->value, row, column);
        const size_t numerator_bytes =
            sagejs_fmpz_serialized_bytes(fmpq_numref(entry));
        const size_t denominator_bytes =
            sagejs_fmpz_serialized_bytes(fmpq_denref(entry));
        if (numerator_bytes > maximum_bytes)
            maximum_bytes = numerator_bytes;
        if (denominator_bytes > maximum_bytes)
            maximum_bytes = denominator_bytes;
        if (numerator_bytes > UINT32_MAX / 2 || denominator_bytes > UINT32_MAX ||
            !sagejs_size_add(&length, 8) ||
            !sagejs_size_add(&length, numerator_bytes) ||
            !sagejs_size_add(&length, denominator_bytes))
            return 0;
    }
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (result->data == NULL)
        return 0;
    result->length = length;
    const size_t maximum_words =
        (maximum_bytes + sizeof(ulong) - 1) / sizeof(ulong);
    ulong *words = maximum_words == 0 ? NULL :
        (ulong *) calloc(maximum_words, sizeof(ulong));
    if (maximum_words != 0 && words == NULL)
    {
        sagejs_flint_byte_region_clear(result);
        return 0;
    }
    size_t offset = 0;
    fmpz_t magnitude;
    fmpz_init(magnitude);
    for (size_t index = 0; index < count; index++)
    {
        const slong row = (slong) (index / (size_t) columns);
        const slong column = (slong) (index % (size_t) columns);
        const fmpq *entry = fmpq_mat_entry(source->value, row, column);
        const fmpz *parts[2] = {fmpq_numref(entry), fmpq_denref(entry)};
        for (size_t part = 0; part < 2; part++)
        {
            const size_t byte_count = sagejs_fmpz_serialized_bytes(parts[part]);
            uint32_t header = (uint32_t) byte_count;
            if (part == 0 && fmpz_sgn(parts[part]) < 0)
                header |= UINT32_C(0x80000000);
            for (size_t byte = 0; byte < 4; byte++)
                result->data[offset++] = (unsigned char) (header >> (8 * byte));
            if (byte_count != 0)
            {
                const slong word_count =
                    (slong) ((byte_count + sizeof(ulong) - 1) / sizeof(ulong));
                fmpz_abs(magnitude, parts[part]);
                fmpz_get_ui_array(words, word_count, magnitude);
                for (size_t byte = 0; byte < byte_count; byte++)
                    result->data[offset++] = (unsigned char)
                        (words[byte / sizeof(ulong)] >>
                         (8 * (byte % sizeof(ulong))));
            }
        }
    }
    fmpz_clear(magnitude);
    free(words);
    return 1;
}

static inline uint32_t sagejs_fmpq_matrix_read_u32(
    const unsigned char *data, size_t offset)
{
    uint32_t result = 0;
    for (size_t byte = 0; byte < 4; byte++)
        result |= (uint32_t) data[offset + byte] << (8 * byte);
    return result;
}

static inline int sagejs_fmpq_matrix_deserialize(
    sagejs_fmpq_matrix_t result, const sagejs_flint_byte_region_t source,
    uint64_t rows, uint64_t columns)
{
    const unsigned char *data = source->data;
    const size_t length = source->length;
    if (data == NULL || rows > (uint64_t) WORD_MAX ||
        columns > (uint64_t) WORD_MAX ||
        (rows != 0 && columns > (uint64_t) SIZE_MAX / rows))
        return 0;
    const size_t count = (size_t) rows * (size_t) columns;
    if (count > length / 8)
        return 0;

    size_t offset = 0;
    size_t maximum_bytes = 0;
    for (size_t index = 0; index < count; index++)
    {
        for (size_t part = 0; part < 2; part++)
        {
            if (length - offset < 4)
                return 0;
            const uint32_t header =
                sagejs_fmpq_matrix_read_u32(data, offset);
            offset += 4;
            const int negative =
                (header & UINT32_C(0x80000000)) != 0;
            const size_t byte_count =
                (size_t) (header & UINT32_C(0x7fffffff));
            if (byte_count > length - offset ||
                (byte_count == 0 && negative) ||
                (byte_count != 0 && data[offset + byte_count - 1] == 0) ||
                (part == 1 && (negative || byte_count == 0)))
                return 0;
            if (byte_count > maximum_bytes)
                maximum_bytes = byte_count;
            offset += byte_count;
        }
    }
    if (offset != length)
        return 0;

    /* This is one reusable decode workspace, not uniform matrix capacity.
       FLINT owns independently sized numerator and denominator values. */
    const size_t maximum_words =
        (maximum_bytes + sizeof(ulong) - 1) / sizeof(ulong);
    ulong *words = maximum_words == 0 ? NULL :
        (ulong *) calloc(maximum_words, sizeof(ulong));
    if (maximum_words != 0 && words == NULL)
        return 0;
    if (!sagejs_fmpq_matrix_init(result, rows, columns))
    {
        free(words);
        return 0;
    }

    offset = 0;
    for (size_t index = 0; index < count; index++)
    {
        fmpq *entry = fmpq_mat_entry(result->value,
            (slong) (index / (size_t) columns),
            (slong) (index % (size_t) columns));
        fmpz *parts[2] = {fmpq_numref(entry), fmpq_denref(entry)};
        for (size_t part = 0; part < 2; part++)
        {
            const uint32_t header =
                sagejs_fmpq_matrix_read_u32(data, offset);
            offset += 4;
            const int negative =
                (header & UINT32_C(0x80000000)) != 0;
            const size_t byte_count =
                (size_t) (header & UINT32_C(0x7fffffff));
            const size_t word_count =
                (byte_count + sizeof(ulong) - 1) / sizeof(ulong);
            if (word_count != 0)
                memset(words, 0, word_count * sizeof(ulong));
            for (size_t byte = 0; byte < byte_count; byte++)
                words[byte / sizeof(ulong)] |=
                    (ulong) data[offset + byte] <<
                    (8 * (byte % sizeof(ulong)));
            if (word_count == 0)
                fmpz_zero(parts[part]);
            else
                fmpz_set_ui_array(parts[part], words, (slong) word_count);
            if (negative)
                fmpz_neg(parts[part], parts[part]);
            offset += byte_count;
        }
        fmpq_canonicalise(entry);
    }
    free(words);
    result->known_rank = -1;
    sagejs_fmpq_matrix_recompute_allocated_bytes(result);
    return 1;
}

static inline uint64_t sagejs_flint_byte_region_length(
    const sagejs_flint_byte_region_t region)
{
    return (uint64_t) region->length;
}

static inline const unsigned char *sagejs_flint_byte_region_data(
    const sagejs_flint_byte_region_t region)
{
    return region->data;
}

static inline uint64_t sagejs_flint_byte_region_get(
    const sagejs_flint_byte_region_t region, uint64_t index)
{
    return index < (uint64_t) region->length ? (uint64_t) region->data[index] : 0;
}

#endif
