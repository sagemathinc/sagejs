/*
 * Sparse exact row reduction over Q and algebraic numbers.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 */

#include <stddef.h>
#include <stdint.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>

#include <flint/fmpq.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpq_vec.h>
#include <flint/gr_mat.h>
#include <flint/qqbar.h>
#include <flint/ulong_extras.h>

#include "sparse_rational.h"

typedef struct
{
    size_t length;
    size_t capacity;
    size_t *columns;
    fmpq *values;
} sagejs_sparse_qrow;

typedef struct
{
    size_t index;
    size_t length;
    size_t first_column;
} sagejs_sparse_row_order;

static int sparse_row_order_compare(const void *left, const void *right)
{
    const sagejs_sparse_row_order *a = left;
    const sagejs_sparse_row_order *b = right;
    if (a->length != b->length)
        return a->length < b->length ? -1 : 1;
    if (a->first_column != b->first_column)
        return a->first_column < b->first_column ? -1 : 1;
    return a->index < b->index ? -1 : a->index > b->index;
}

static void sparse_qrow_clear(sagejs_sparse_qrow *row)
{
    free(row->columns);
    if (row->values != NULL)
        _fmpq_vec_clear(row->values, (slong) row->capacity);
    memset(row, 0, sizeof(*row));
}

static int sparse_qrow_reserve(
    sagejs_sparse_qrow *row, size_t capacity)
{
    size_t next;
    size_t *columns;
    fmpq *values;

    if (capacity <= row->capacity)
        return 1;
    next = row->capacity == 0 ? 4 : row->capacity;
    while (next < capacity)
    {
        if (next > SIZE_MAX / 2 || next > (size_t) WORD_MAX / 2)
            return 0;
        next *= 2;
    }
    columns = malloc(next * sizeof(*columns));
    values = _fmpq_vec_init((slong) next);
    if (columns == NULL || values == NULL)
    {
        free(columns);
        if (values != NULL)
            _fmpq_vec_clear(values, (slong) next);
        return 0;
    }
    for (size_t item = 0; item < row->length; item++)
    {
        columns[item] = row->columns[item];
        fmpq_set(values + item, row->values + item);
    }
    free(row->columns);
    if (row->values != NULL)
        _fmpq_vec_clear(row->values, (slong) row->capacity);
    row->columns = columns;
    row->values = values;
    row->capacity = next;
    return 1;
}

static const fmpq *sparse_qrow_entry(
    const sagejs_sparse_qrow *row, size_t column)
{
    size_t left = 0, right = row->length;
    while (left < right)
    {
        size_t middle = left + (right - left) / 2;
        if (row->columns[middle] < column)
            left = middle + 1;
        else
            right = middle;
    }
    return left < row->length && row->columns[left] == column
        ? row->values + left : NULL;
}

/* Replace left by left - coefficient * right. */
static int sparse_qrow_axpy(
    sagejs_sparse_qrow *left,
    const sagejs_sparse_qrow *right,
    const fmpq_t coefficient,
    size_t *workspace_columns,
    fmpq *workspace_values,
    size_t workspace_capacity)
{
    size_t i = 0, j = 0, used = 0;

    while (i < left->length || j < right->length)
    {
        size_t column;
        if (used >= workspace_capacity)
            return 0;
        if (j == right->length ||
            (i < left->length && left->columns[i] < right->columns[j]))
        {
            column = left->columns[i];
            fmpq_set(workspace_values + used, left->values + i++);
        }
        else if (i == left->length || right->columns[j] < left->columns[i])
        {
            column = right->columns[j];
            fmpq_mul(workspace_values + used,
                coefficient, right->values + j++);
            fmpq_neg(workspace_values + used, workspace_values + used);
        }
        else
        {
            column = left->columns[i];
            fmpq_set(workspace_values + used, left->values + i++);
            fmpq_submul(workspace_values + used,
                coefficient, right->values + j++);
        }
        if (!fmpq_is_zero(workspace_values + used))
            workspace_columns[used++] = column;
    }
    if (!sparse_qrow_reserve(left, used))
        return 0;
    for (size_t item = 0; item < used; item++)
    {
        left->columns[item] = workspace_columns[item];
        fmpq_set(left->values + item, workspace_values + item);
    }
    left->length = used;
    return 1;
}

static int sparse_qrow_compare(const void *left, const void *right)
{
    const sagejs_sparse_qrow *a = left;
    const sagejs_sparse_qrow *b = right;
    size_t ca = a->length == 0 ? SIZE_MAX : a->columns[0];
    size_t cb = b->length == 0 ? SIZE_MAX : b->columns[0];
    return ca < cb ? -1 : ca > cb;
}

int sagejs_fmpq_mat_prefers_sparse_rref(const fmpq_mat_t source)
{
    slong rows = fmpq_mat_nrows(source);
    slong columns = fmpq_mat_ncols(source);
    size_t cells, limit, nonzero = 0;

    if (rows <= 0 || columns <= 0 ||
        (size_t) rows > SIZE_MAX / (size_t) columns)
        return 0;
    cells = (size_t) rows * (size_t) columns;
    if (cells < 4096)
        return 0;
    limit = cells / 8;
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            if (!fmpq_is_zero(fmpq_mat_entry(source, row, column)) &&
                ++nonzero > limit)
                return 0;
    return 1;
}

int sagejs_fmpq_mat_rref_sparse(
    fmpq_mat_t output, slong *rank_out, const fmpq_mat_t source)
{
    slong row_count = fmpq_mat_nrows(source);
    slong column_count = fmpq_mat_ncols(source);
    size_t rows = (size_t) row_count, columns = (size_t) column_count;
    sagejs_sparse_qrow *pivots = NULL;
    sagejs_sparse_qrow working = {0};
    size_t *pivot_by_column = NULL, *workspace_columns = NULL;
    fmpq *workspace_values = NULL;
    fmpq_t coefficient;
    size_t rank = 0;
    int status = 0;

    if (rank_out == NULL || row_count < 0 || column_count < 0)
        return 0;
    *rank_out = 0;
    fmpq_init(coefficient);
    pivots = calloc(rows == 0 ? 1 : rows, sizeof(*pivots));
    pivot_by_column = malloc(
        (columns == 0 ? 1 : columns) * sizeof(*pivot_by_column));
    workspace_columns = malloc(
        (columns == 0 ? 1 : columns) * sizeof(*workspace_columns));
    workspace_values = _fmpq_vec_init(
        (slong) (columns == 0 ? 1 : columns));
    if (pivots == NULL || pivot_by_column == NULL ||
        workspace_columns == NULL || workspace_values == NULL)
        goto done;
    for (size_t column = 0; column < columns; column++)
        pivot_by_column[column] = SIZE_MAX;

    for (size_t source_row = 0; source_row < rows; source_row++)
    {
        size_t count = 0;
        working.length = 0;
        for (size_t column = 0; column < columns; column++)
            count += !fmpq_is_zero(fmpq_mat_entry(
                source, (slong) source_row, (slong) column));
        if (!sparse_qrow_reserve(&working, count))
            goto done;
        for (size_t column = 0; column < columns; column++)
        {
            const fmpq *value = fmpq_mat_entry(
                source, (slong) source_row, (slong) column);
            if (!fmpq_is_zero(value))
            {
                working.columns[working.length] = column;
                fmpq_set(working.values + working.length++, value);
            }
        }
        while (working.length != 0)
        {
            size_t pivot_column = working.columns[0];
            size_t pivot = pivot_by_column[pivot_column];
            if (pivot == SIZE_MAX)
            {
                fmpq_set(coefficient, working.values);
                for (size_t item = 0; item < working.length; item++)
                    fmpq_div(working.values + item,
                        working.values + item, coefficient);
                pivots[rank] = working;
                memset(&working, 0, sizeof(working));
                pivot_by_column[pivot_column] = rank++;
                break;
            }
            fmpq_set(coefficient, working.values);
            if (!sparse_qrow_axpy(
                    &working, &pivots[pivot], coefficient,
                    workspace_columns, workspace_values, columns))
                goto done;
        }
    }

    qsort(pivots, rank, sizeof(*pivots), sparse_qrow_compare);
    for (size_t cursor = rank; cursor > 0; cursor--)
    {
        size_t row = cursor - 1;
        size_t pivot_column = pivots[row].columns[0];
        for (size_t earlier = 0; earlier < row; earlier++)
        {
            const fmpq *entry = sparse_qrow_entry(
                &pivots[earlier], pivot_column);
            if (entry != NULL)
            {
                fmpq_set(coefficient, entry);
                if (!sparse_qrow_axpy(
                        &pivots[earlier], &pivots[row], coefficient,
                        workspace_columns, workspace_values, columns))
                    goto done;
            }
        }
    }

    fmpq_mat_zero(output);
    for (size_t row = 0; row < rank; row++)
        for (size_t item = 0; item < pivots[row].length; item++)
            fmpq_set(fmpq_mat_entry(
                output, (slong) row, (slong) pivots[row].columns[item]),
                pivots[row].values + item);
    *rank_out = (slong) rank;
    status = 1;

done:
    fmpq_clear(coefficient);
    sparse_qrow_clear(&working);
    if (pivots != NULL)
        for (size_t row = 0; row < rows; row++)
            sparse_qrow_clear(&pivots[row]);
    free(pivots);
    free(pivot_by_column);
    free(workspace_columns);
    if (workspace_values != NULL)
        _fmpq_vec_clear(workspace_values,
            (slong) (columns == 0 ? 1 : columns));
    return status;
}

static int sparse_qrow_add_fmpz(
    sagejs_sparse_qrow *row, size_t column, const fmpz *value)
{
    size_t left = 0, right = row->length;

    if (fmpz_is_zero(value))
        return 1;
    while (left < right)
    {
        size_t middle = left + (right - left) / 2;
        if (row->columns[middle] < column)
            left = middle + 1;
        else
            right = middle;
    }
    if (left < row->length && row->columns[left] == column)
    {
        fmpq_add_fmpz(row->values + left, row->values + left, value);
        return 1;
    }
    if (!sparse_qrow_reserve(row, row->length + 1))
        return 0;
    for (size_t item = row->length; item > left; item--)
    {
        row->columns[item] = row->columns[item - 1];
        fmpq_swap(row->values + item, row->values + item - 1);
    }
    row->columns[left] = column;
    fmpq_set_fmpz(row->values + left, value);
    row->length++;
    return 1;
}

static void sparse_qrow_remove_zeros(sagejs_sparse_qrow *row)
{
    size_t used = 0;
    for (size_t item = 0; item < row->length; item++)
        if (!fmpq_is_zero(row->values + item))
        {
            if (used != item)
            {
                row->columns[used] = row->columns[item];
                fmpq_swap(row->values + used, row->values + item);
            }
            used++;
        }
    row->length = used;
}

typedef struct
{
    size_t length;
    size_t capacity;
    size_t *columns;
    slong *values;
} sagejs_sparse_irow;

static void sparse_irow_clear(sagejs_sparse_irow *row)
{
    free(row->columns);
    free(row->values);
    memset(row, 0, sizeof(*row));
}

static int sparse_irow_reserve(sagejs_sparse_irow *row, size_t capacity)
{
    size_t next;
    size_t *columns;
    slong *values;

    if (capacity <= row->capacity)
        return 1;
    next = row->capacity == 0 ? 4 : row->capacity;
    while (next < capacity)
    {
        if (next > SIZE_MAX / 2)
            return 0;
        next *= 2;
    }
    columns = malloc(next * sizeof(*columns));
    values = malloc(next * sizeof(*values));
    if (columns == NULL || values == NULL)
    {
        free(columns);
        free(values);
        return 0;
    }
    if (row->length != 0)
    {
        memcpy(columns, row->columns, row->length * sizeof(*columns));
        memcpy(values, row->values, row->length * sizeof(*values));
    }
    free(row->columns);
    free(row->values);
    row->columns = columns;
    row->values = values;
    row->capacity = next;
    return 1;
}

static int sparse_irow_add_fmpz(
    sagejs_sparse_irow *row, size_t column, const fmpz *value)
{
    size_t left = 0, right = row->length;
    slong integer;

    if (fmpz_is_zero(value))
        return 1;
    if (!fmpz_fits_si(value))
        return 0;
    integer = fmpz_get_si(value);
    while (left < right)
    {
        size_t middle = left + (right - left) / 2;
        if (row->columns[middle] < column)
            left = middle + 1;
        else
            right = middle;
    }
    if (left < row->length && row->columns[left] == column)
    {
        __int128 sum = (__int128) row->values[left] + integer;
        if (sum < LONG_MIN || sum > LONG_MAX)
            return 0;
        if (sum != 0)
            row->values[left] = (slong) sum;
        else
        {
            memmove(row->columns + left, row->columns + left + 1,
                (row->length - left - 1) * sizeof(*row->columns));
            memmove(row->values + left, row->values + left + 1,
                (row->length - left - 1) * sizeof(*row->values));
            row->length--;
        }
        return 1;
    }
    if (!sparse_irow_reserve(row, row->length + 1))
        return 0;
    memmove(row->columns + left + 1, row->columns + left,
        (row->length - left) * sizeof(*row->columns));
    memmove(row->values + left + 1, row->values + left,
        (row->length - left) * sizeof(*row->values));
    row->columns[left] = column;
    row->values[left] = integer;
    row->length++;
    return 1;
}

static ulong sparse_abs_slong(slong value)
{
    return value < 0
        ? (ulong) (-(value + 1)) + 1
        : (ulong) value;
}

static void sparse_irow_make_primitive(sagejs_sparse_irow *row)
{
    ulong common = 0;
    for (size_t item = 0; item < row->length; item++)
    {
        common = n_gcd(common, sparse_abs_slong(row->values[item]));
        if (common == 1)
            break;
    }
    if (common > 1)
        for (size_t item = 0; item < row->length; item++)
            row->values[item] /= (slong) common;
}

static slong sparse_irow_entry(
    const sagejs_sparse_irow *row, size_t column)
{
    size_t left = 0, right = row->length;
    while (left < right)
    {
        size_t middle = left + (right - left) / 2;
        if (row->columns[middle] < column)
            left = middle + 1;
        else
            right = middle;
    }
    return left < row->length && row->columns[left] == column
        ? row->values[left] : 0;
}

static int sparse_irow_combine(
    sagejs_sparse_irow *left,
    const sagejs_sparse_irow *right,
    slong left_multiplier,
    slong right_multiplier,
    size_t *workspace_columns,
    slong *workspace_values,
    size_t workspace_capacity)
{
    size_t i = 0, j = 0, used = 0;

    while (i < left->length || j < right->length)
    {
        size_t column;
        __int128 value;
        if (j == right->length ||
            (i < left->length && left->columns[i] < right->columns[j]))
        {
            column = left->columns[i];
            if (__builtin_mul_overflow((__int128) left_multiplier,
                    (__int128) left->values[i++], &value))
                return 0;
        }
        else if (i == left->length || right->columns[j] < left->columns[i])
        {
            __int128 product;
            column = right->columns[j];
            if (__builtin_mul_overflow((__int128) right_multiplier,
                    (__int128) right->values[j++], &product) ||
                __builtin_sub_overflow((__int128) 0, product, &value))
                return 0;
        }
        else
        {
            __int128 left_product, right_product;
            column = left->columns[i];
            if (__builtin_mul_overflow((__int128) left_multiplier,
                    (__int128) left->values[i++], &left_product) ||
                __builtin_mul_overflow((__int128) right_multiplier,
                    (__int128) right->values[j++], &right_product) ||
                __builtin_sub_overflow(left_product, right_product, &value))
                return 0;
        }
        if (value < LONG_MIN || value > LONG_MAX)
            return 0;
        if (value != 0)
        {
            if (used >= workspace_capacity)
                return 0;
            workspace_columns[used] = column;
            workspace_values[used++] = (slong) value;
        }
    }
    if (!sparse_irow_reserve(left, used))
        return 0;
    if (used != 0)
    {
        memcpy(left->columns, workspace_columns,
            used * sizeof(*workspace_columns));
        memcpy(left->values, workspace_values,
            used * sizeof(*workspace_values));
    }
    left->length = used;
    return 1;
}

static int sparse_irow_compare(const void *left, const void *right)
{
    const sagejs_sparse_irow *a = left;
    const sagejs_sparse_irow *b = right;
    size_t ca = a->length == 0 ? SIZE_MAX : a->columns[0];
    size_t cb = b->length == 0 ? SIZE_MAX : b->columns[0];
    return ca < cb ? -1 : ca > cb;
}

/* Try exact machine-integer RREF, falling back when coefficients grow. */
static int sparse_fmpz_csr_word_rref(
    fmpq_mat_t output,
    slong *rank_out,
    size_t rows,
    size_t columns,
    const size_t *row_offsets,
    const size_t *column_indices,
    const fmpz *values,
    const sagejs_sparse_row_order *row_order)
{
    size_t maximum_rank = rows < columns ? rows : columns;
    sagejs_sparse_irow *pivots = NULL;
    sagejs_sparse_irow working = {0};
    size_t *pivot_by_column = NULL, *workspace_columns = NULL;
    size_t *backward_offsets = NULL, *backward_rows = NULL;
    size_t *backward_cursor = NULL;
    slong *workspace_values = NULL;
    size_t rank = 0;
    int status = 0;

    pivots = calloc(maximum_rank == 0 ? 1 : maximum_rank, sizeof(*pivots));
    pivot_by_column = malloc(
        (columns == 0 ? 1 : columns) * sizeof(*pivot_by_column));
    workspace_columns = malloc(
        (columns == 0 ? 1 : columns) * sizeof(*workspace_columns));
    workspace_values = malloc(
        (columns == 0 ? 1 : columns) * sizeof(*workspace_values));
    if (pivots == NULL || pivot_by_column == NULL ||
        workspace_columns == NULL || workspace_values == NULL)
        goto done;
    for (size_t column = 0; column < columns; column++)
        pivot_by_column[column] = SIZE_MAX;
    for (size_t source_index = 0; source_index < rows; source_index++)
    {
        size_t source_row = row_order[source_index].index;
        working.length = 0;
        for (size_t item = row_offsets[source_row];
            item < row_offsets[source_row + 1]; item++)
            if (column_indices[item] >= columns ||
                !sparse_irow_add_fmpz(
                    &working, column_indices[item], values + item))
                goto done;
        while (working.length != 0)
        {
            size_t pivot_column = working.columns[0];
            size_t pivot = pivot_by_column[pivot_column];
            if (pivot == SIZE_MAX)
            {
                sparse_irow_make_primitive(&working);
                if (working.values[0] < 0)
                {
                    for (size_t item = 0; item < working.length; item++)
                    {
                        if (working.values[item] == LONG_MIN)
                            goto done;
                        working.values[item] = -working.values[item];
                    }
                }
                if (rank >= maximum_rank)
                    goto done;
                pivots[rank] = working;
                memset(&working, 0, sizeof(working));
                pivot_by_column[pivot_column] = rank++;
                break;
            }
            {
                slong coefficient = working.values[0];
                slong pivot_value = pivots[pivot].values[0];
                if (!sparse_irow_combine(
                        &working, &pivots[pivot], pivot_value, coefficient,
                        workspace_columns, workspace_values, columns))
                    goto done;
                if (pivot_value != 1)
                    sparse_irow_make_primitive(&working);
            }
        }
    }
    qsort(pivots, rank, sizeof(*pivots), sparse_irow_compare);
    for (size_t column = 0; column < columns; column++)
        pivot_by_column[column] = SIZE_MAX;
    for (size_t row = 0; row < rank; row++)
        pivot_by_column[pivots[row].columns[0]] = row;
    backward_offsets = calloc(rank + 1, sizeof(*backward_offsets));
    backward_cursor = malloc((rank == 0 ? 1 : rank) *
        sizeof(*backward_cursor));
    if (backward_offsets == NULL || backward_cursor == NULL)
        goto done;
    for (size_t row = 0; row < rank; row++)
        for (size_t item = 1; item < pivots[row].length; item++)
        {
            size_t pivot = pivot_by_column[pivots[row].columns[item]];
            if (pivot != SIZE_MAX && row < pivot)
            {
                if (backward_offsets[pivot + 1] == SIZE_MAX)
                    goto done;
                backward_offsets[pivot + 1]++;
            }
        }
    for (size_t row = 0; row < rank; row++)
    {
        if (backward_offsets[row + 1] >
            SIZE_MAX - backward_offsets[row])
            goto done;
        backward_offsets[row + 1] += backward_offsets[row];
        backward_cursor[row] = backward_offsets[row];
    }
    backward_rows = malloc((backward_offsets[rank] == 0
        ? 1 : backward_offsets[rank]) * sizeof(*backward_rows));
    if (backward_rows == NULL)
        goto done;
    for (size_t row = 0; row < rank; row++)
        for (size_t item = 1; item < pivots[row].length; item++)
        {
            size_t pivot = pivot_by_column[pivots[row].columns[item]];
            if (pivot != SIZE_MAX && row < pivot)
                backward_rows[backward_cursor[pivot]++] = row;
        }
    for (size_t cursor = rank; cursor > 0; cursor--)
    {
        size_t row = cursor - 1;
        size_t pivot_column = pivots[row].columns[0];
        for (size_t occurrence = backward_offsets[row];
            occurrence < backward_offsets[row + 1]; occurrence++)
        {
            size_t earlier = backward_rows[occurrence];
            slong coefficient = sparse_irow_entry(
                &pivots[earlier], pivot_column);
            if (coefficient != 0)
            {
                if (!sparse_irow_combine(
                        &pivots[earlier], &pivots[row],
                        pivots[row].values[0], coefficient,
                        workspace_columns, workspace_values, columns))
                    goto done;
                if (pivots[row].values[0] != 1)
                    sparse_irow_make_primitive(&pivots[earlier]);
            }
        }
    }
    fmpq_mat_init(output, (slong) rank, (slong) columns);
    for (size_t row = 0; row < rank; row++)
        for (size_t item = 0; item < pivots[row].length; item++)
            fmpq_set_si(fmpq_mat_entry(
                output, (slong) row, (slong) pivots[row].columns[item]),
                pivots[row].values[item], pivots[row].values[0]);
    *rank_out = (slong) rank;
    status = 1;

done:
    sparse_irow_clear(&working);
    if (pivots != NULL)
        for (size_t row = 0; row < maximum_rank; row++)
            sparse_irow_clear(&pivots[row]);
    free(pivots);
    free(pivot_by_column);
    free(workspace_columns);
    free(workspace_values);
    free(backward_offsets);
    free(backward_rows);
    free(backward_cursor);
    return status;
}

int sagejs_fmpq_rref_sparse_fmpz_csr(
    fmpq_mat_t output,
    slong *rank_out,
    size_t rows,
    size_t columns,
    const size_t *row_offsets,
    const size_t *column_indices,
    const fmpz *values)
{
    size_t maximum_rank = rows < columns ? rows : columns;
    sagejs_sparse_qrow *pivots = NULL;
    sagejs_sparse_qrow working = {0};
    sagejs_sparse_row_order *row_order = NULL;
    size_t *pivot_by_column = NULL, *workspace_columns = NULL;
    size_t *backward_offsets = NULL, *backward_rows = NULL;
    size_t *backward_cursor = NULL;
    fmpq *workspace_values = NULL;
    fmpq_t coefficient;
    size_t rank = 0;
    int status = 0;

    if (rank_out == NULL || row_offsets == NULL ||
        (row_offsets[rows] != 0 &&
            (column_indices == NULL || values == NULL)) ||
        rows > (size_t) WORD_MAX || columns > (size_t) WORD_MAX)
        return 0;
    *rank_out = 0;
    fmpq_init(coefficient);
    pivots = calloc(maximum_rank == 0 ? 1 : maximum_rank, sizeof(*pivots));
    row_order = malloc((rows == 0 ? 1 : rows) * sizeof(*row_order));
    pivot_by_column = malloc(
        (columns == 0 ? 1 : columns) * sizeof(*pivot_by_column));
    workspace_columns = malloc(
        (columns == 0 ? 1 : columns) * sizeof(*workspace_columns));
    workspace_values = _fmpq_vec_init(
        (slong) (columns == 0 ? 1 : columns));
    if (pivots == NULL || row_order == NULL || pivot_by_column == NULL ||
        workspace_columns == NULL || workspace_values == NULL)
        goto done;
    for (size_t column = 0; column < columns; column++)
        pivot_by_column[column] = SIZE_MAX;

    /*
     * Short Manin relations are particularly valuable pivots: consuming
     * them first sharply limits fill-in in the later exact rows. The first
     * column is a deterministic tie-breaker that also tends to expose pivots
     * from left to right. This ordering is only a performance heuristic;
     * the resulting RREF is canonical and independent of input row order.
     */
    for (size_t row = 0; row < rows; row++)
    {
        size_t length = 0, first = SIZE_MAX;
        if (row_offsets[row] > row_offsets[row + 1])
            goto done;
        for (size_t item = row_offsets[row]; item < row_offsets[row + 1]; item++)
            if (!fmpz_is_zero(values + item))
            {
                length++;
                if (column_indices[item] < first)
                    first = column_indices[item];
            }
        row_order[row] = (sagejs_sparse_row_order) {row, length, first};
    }
    qsort(row_order, rows, sizeof(*row_order), sparse_row_order_compare);
    if (sparse_fmpz_csr_word_rref(
            output, rank_out, rows, columns, row_offsets,
            column_indices, values, row_order))
    {
        status = 1;
        goto done;
    }

    for (size_t source_index = 0; source_index < rows; source_index++)
    {
        size_t source_row = row_order[source_index].index;
        working.length = 0;
        if (row_offsets[source_row] > row_offsets[source_row + 1])
            goto done;
        for (size_t item = row_offsets[source_row];
            item < row_offsets[source_row + 1]; item++)
        {
            if (column_indices[item] >= columns ||
                !sparse_qrow_add_fmpz(
                    &working, column_indices[item], values + item))
                goto done;
        }
        sparse_qrow_remove_zeros(&working);
        while (working.length != 0)
        {
            size_t pivot_column = working.columns[0];
            size_t pivot = pivot_by_column[pivot_column];
            if (pivot == SIZE_MAX)
            {
                if (rank >= maximum_rank)
                    goto done;
                fmpq_set(coefficient, working.values);
                for (size_t item = 0; item < working.length; item++)
                    fmpq_div(working.values + item,
                        working.values + item, coefficient);
                pivots[rank] = working;
                memset(&working, 0, sizeof(working));
                pivot_by_column[pivot_column] = rank++;
                break;
            }
            fmpq_set(coefficient, working.values);
            if (!sparse_qrow_axpy(
                    &working, &pivots[pivot], coefficient,
                    workspace_columns, workspace_values, columns))
                goto done;
        }
    }
    qsort(pivots, rank, sizeof(*pivots), sparse_qrow_compare);
    for (size_t column = 0; column < columns; column++)
        pivot_by_column[column] = SIZE_MAX;
    for (size_t row = 0; row < rank; row++)
        pivot_by_column[pivots[row].columns[0]] = row;
    backward_offsets = calloc(rank + 1, sizeof(*backward_offsets));
    backward_cursor = malloc((rank == 0 ? 1 : rank) *
        sizeof(*backward_cursor));
    if (backward_offsets == NULL || backward_cursor == NULL)
        goto done;
    for (size_t row = 0; row < rank; row++)
        for (size_t item = 1; item < pivots[row].length; item++)
        {
            size_t pivot = pivot_by_column[pivots[row].columns[item]];
            if (pivot != SIZE_MAX && row < pivot)
            {
                if (backward_offsets[pivot + 1] == SIZE_MAX)
                    goto done;
                backward_offsets[pivot + 1]++;
            }
        }
    for (size_t row = 0; row < rank; row++)
    {
        if (backward_offsets[row + 1] >
            SIZE_MAX - backward_offsets[row])
            goto done;
        backward_offsets[row + 1] += backward_offsets[row];
        backward_cursor[row] = backward_offsets[row];
    }
    backward_rows = malloc((backward_offsets[rank] == 0
        ? 1 : backward_offsets[rank]) * sizeof(*backward_rows));
    if (backward_rows == NULL)
        goto done;
    for (size_t row = 0; row < rank; row++)
        for (size_t item = 1; item < pivots[row].length; item++)
        {
            size_t pivot = pivot_by_column[pivots[row].columns[item]];
            if (pivot != SIZE_MAX && row < pivot)
                backward_rows[backward_cursor[pivot]++] = row;
        }
    for (size_t cursor = rank; cursor > 0; cursor--)
    {
        size_t row = cursor - 1;
        size_t pivot_column = pivots[row].columns[0];
        for (size_t occurrence = backward_offsets[row];
            occurrence < backward_offsets[row + 1]; occurrence++)
        {
            size_t earlier = backward_rows[occurrence];
            const fmpq *entry = sparse_qrow_entry(
                &pivots[earlier], pivot_column);
            if (entry != NULL)
            {
                fmpq_set(coefficient, entry);
                if (!sparse_qrow_axpy(
                        &pivots[earlier], &pivots[row], coefficient,
                        workspace_columns, workspace_values, columns))
                    goto done;
            }
        }
    }
    fmpq_mat_init(output, (slong) rank, (slong) columns);
    for (size_t row = 0; row < rank; row++)
        for (size_t item = 0; item < pivots[row].length; item++)
            fmpq_set(fmpq_mat_entry(
                output, (slong) row, (slong) pivots[row].columns[item]),
                pivots[row].values + item);
    *rank_out = (slong) rank;
    status = 1;

done:
    fmpq_clear(coefficient);
    sparse_qrow_clear(&working);
    if (pivots != NULL)
        for (size_t row = 0; row < maximum_rank; row++)
            sparse_qrow_clear(&pivots[row]);
    free(pivots);
    free(row_order);
    free(pivot_by_column);
    free(workspace_columns);
    free(backward_offsets);
    free(backward_rows);
    free(backward_cursor);
    if (workspace_values != NULL)
        _fmpq_vec_clear(workspace_values,
            (slong) (columns == 0 ? 1 : columns));
    return status;
}

typedef struct
{
    size_t length;
    size_t capacity;
    size_t *columns;
    qqbar_ptr values;
} sagejs_sparse_arow;

static void sparse_arow_clear(sagejs_sparse_arow *row)
{
    free(row->columns);
    if (row->values != NULL)
        _qqbar_vec_clear(row->values, (slong) row->capacity);
    memset(row, 0, sizeof(*row));
}

static int sparse_arow_reserve(
    sagejs_sparse_arow *row, size_t capacity)
{
    size_t next;
    size_t *columns;
    qqbar_ptr values;

    if (capacity <= row->capacity)
        return 1;
    next = row->capacity == 0 ? 4 : row->capacity;
    while (next < capacity)
    {
        if (next > SIZE_MAX / 2 || next > (size_t) WORD_MAX / 2)
            return 0;
        next *= 2;
    }
    columns = malloc(next * sizeof(*columns));
    values = _qqbar_vec_init((slong) next);
    if (columns == NULL || values == NULL)
    {
        free(columns);
        if (values != NULL)
            _qqbar_vec_clear(values, (slong) next);
        return 0;
    }
    for (size_t item = 0; item < row->length; item++)
    {
        columns[item] = row->columns[item];
        qqbar_set(values + item, row->values + item);
    }
    free(row->columns);
    if (row->values != NULL)
        _qqbar_vec_clear(row->values, (slong) row->capacity);
    row->columns = columns;
    row->values = values;
    row->capacity = next;
    return 1;
}

static qqbar_srcptr sparse_arow_entry(
    const sagejs_sparse_arow *row, size_t column)
{
    size_t left = 0, right = row->length;
    while (left < right)
    {
        size_t middle = left + (right - left) / 2;
        if (row->columns[middle] < column)
            left = middle + 1;
        else
            right = middle;
    }
    return left < row->length && row->columns[left] == column
        ? row->values + left : NULL;
}

/* Replace left by left - coefficient * right. */
static int sparse_arow_axpy(
    sagejs_sparse_arow *left,
    const sagejs_sparse_arow *right,
    const qqbar_t coefficient,
    size_t *workspace_columns,
    qqbar_ptr workspace_values,
    size_t workspace_capacity,
    qqbar_t temporary)
{
    size_t i = 0, j = 0, used = 0;

    while (i < left->length || j < right->length)
    {
        size_t column;
        if (used >= workspace_capacity)
            return 0;
        if (j == right->length ||
            (i < left->length && left->columns[i] < right->columns[j]))
        {
            column = left->columns[i];
            qqbar_set(workspace_values + used, left->values + i++);
        }
        else if (i == left->length || right->columns[j] < left->columns[i])
        {
            column = right->columns[j];
            qqbar_mul(workspace_values + used,
                coefficient, right->values + j++);
            qqbar_neg(workspace_values + used, workspace_values + used);
        }
        else
        {
            column = left->columns[i];
            qqbar_set(workspace_values + used, left->values + i++);
            qqbar_mul(temporary, coefficient, right->values + j++);
            qqbar_sub(workspace_values + used,
                workspace_values + used, temporary);
        }
        if (!qqbar_is_zero(workspace_values + used))
            workspace_columns[used++] = column;
    }
    if (!sparse_arow_reserve(left, used))
        return 0;
    for (size_t item = 0; item < used; item++)
    {
        left->columns[item] = workspace_columns[item];
        qqbar_set(left->values + item, workspace_values + item);
    }
    left->length = used;
    return 1;
}

static int sparse_arow_compare(const void *left, const void *right)
{
    const sagejs_sparse_arow *a = left;
    const sagejs_sparse_arow *b = right;
    size_t ca = a->length == 0 ? SIZE_MAX : a->columns[0];
    size_t cb = b->length == 0 ? SIZE_MAX : b->columns[0];
    return ca < cb ? -1 : ca > cb;
}

int sagejs_qqbar_gr_mat_rref_sparse(
    gr_mat_t output, slong *rank_out,
    const gr_mat_t source, gr_ctx_t context)
{
    slong row_count = gr_mat_nrows(source, context);
    slong column_count = gr_mat_ncols(source, context);
    size_t rows = (size_t) row_count, columns = (size_t) column_count;
    sagejs_sparse_arow *pivots = NULL;
    sagejs_sparse_arow working = {0};
    size_t *pivot_by_column = NULL, *workspace_columns = NULL;
    qqbar_ptr workspace_values = NULL;
    qqbar_t coefficient, temporary;
    size_t rank = 0;
    int status = 0;

    if (rank_out == NULL || row_count < 0 || column_count < 0)
        return 0;
    *rank_out = 0;
    qqbar_init(coefficient);
    qqbar_init(temporary);
    pivots = calloc(rows == 0 ? 1 : rows, sizeof(*pivots));
    pivot_by_column = malloc(
        (columns == 0 ? 1 : columns) * sizeof(*pivot_by_column));
    workspace_columns = malloc(
        (columns == 0 ? 1 : columns) * sizeof(*workspace_columns));
    workspace_values = _qqbar_vec_init(
        (slong) (columns == 0 ? 1 : columns));
    if (pivots == NULL || pivot_by_column == NULL ||
        workspace_columns == NULL || workspace_values == NULL)
        goto done;
    for (size_t column = 0; column < columns; column++)
        pivot_by_column[column] = SIZE_MAX;

    for (size_t source_row = 0; source_row < rows; source_row++)
    {
        size_t count = 0;
        working.length = 0;
        for (size_t column = 0; column < columns; column++)
            count += !qqbar_is_zero((qqbar_srcptr) gr_mat_entry_srcptr(
                source, (slong) source_row, (slong) column, context));
        if (!sparse_arow_reserve(&working, count))
            goto done;
        for (size_t column = 0; column < columns; column++)
        {
            qqbar_srcptr value = (qqbar_srcptr) gr_mat_entry_srcptr(
                source, (slong) source_row, (slong) column, context);
            if (!qqbar_is_zero(value))
            {
                working.columns[working.length] = column;
                qqbar_set(working.values + working.length++, value);
            }
        }
        while (working.length != 0)
        {
            size_t pivot_column = working.columns[0];
            size_t pivot = pivot_by_column[pivot_column];
            if (pivot == SIZE_MAX)
            {
                qqbar_set(coefficient, working.values);
                for (size_t item = 0; item < working.length; item++)
                    qqbar_div(working.values + item,
                        working.values + item, coefficient);
                pivots[rank] = working;
                memset(&working, 0, sizeof(working));
                pivot_by_column[pivot_column] = rank++;
                break;
            }
            qqbar_set(coefficient, working.values);
            if (!sparse_arow_axpy(
                    &working, &pivots[pivot], coefficient,
                    workspace_columns, workspace_values, columns,
                    temporary))
                goto done;
        }
    }

    qsort(pivots, rank, sizeof(*pivots), sparse_arow_compare);
    for (size_t cursor = rank; cursor > 0; cursor--)
    {
        size_t row = cursor - 1;
        size_t pivot_column = pivots[row].columns[0];
        for (size_t earlier = 0; earlier < row; earlier++)
        {
            qqbar_srcptr entry = sparse_arow_entry(
                &pivots[earlier], pivot_column);
            if (entry != NULL)
            {
                qqbar_set(coefficient, entry);
                if (!sparse_arow_axpy(
                        &pivots[earlier], &pivots[row], coefficient,
                        workspace_columns, workspace_values, columns,
                        temporary))
                    goto done;
            }
        }
    }

    if (gr_mat_zero(output, context) != GR_SUCCESS)
        goto done;
    for (size_t row = 0; row < rank; row++)
        for (size_t item = 0; item < pivots[row].length; item++)
            qqbar_set((qqbar_ptr) gr_mat_entry_ptr(
                output, (slong) row,
                (slong) pivots[row].columns[item], context),
                pivots[row].values + item);
    *rank_out = (slong) rank;
    status = 1;

done:
    qqbar_clear(coefficient);
    qqbar_clear(temporary);
    sparse_arow_clear(&working);
    if (pivots != NULL)
        for (size_t row = 0; row < rows; row++)
            sparse_arow_clear(&pivots[row]);
    free(pivots);
    free(pivot_by_column);
    free(workspace_columns);
    if (workspace_values != NULL)
        _qqbar_vec_clear(workspace_values,
            (slong) (columns == 0 ? 1 : columns));
    return status;
}
