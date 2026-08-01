/*
 * Sparse exact row reduction over Q and algebraic numbers.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 */

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <flint/fmpq.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpq_vec.h>
#include <flint/gr_mat.h>
#include <flint/qqbar.h>

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
    fmpq *workspace_values = NULL;
    fmpq_t coefficient;
    size_t rank = 0;
    int status = 0;

    if (rank_out == NULL || row_offsets == NULL ||
        (row_offsets[rows] != 0 &&
            (column_indices == NULL || values == NULL)) ||
        fmpq_mat_nrows(output) < (slong) maximum_rank ||
        fmpq_mat_ncols(output) != (slong) columns ||
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
        for (size_t row = 0; row < maximum_rank; row++)
            sparse_qrow_clear(&pivots[row]);
    free(pivots);
    free(row_order);
    free(pivot_by_column);
    free(workspace_columns);
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
