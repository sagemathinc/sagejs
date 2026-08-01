/*
 * Multimodular RREF over cyclotomic fields.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 *
 * This follows the completely-split-prime strategy used by SageMath's
 * Matrix_cyclo_dense implementation: evaluate at every residue-field
 * embedding, reduce over word-prime fields, interpolate, combine by CRT,
 * and rationally reconstruct.  A height check certifies the result.
 */

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <flint/fmpq.h>
#include <flint/fmpq_poly.h>
#include <flint/fmpq_vec.h>
#include <flint/fmpz.h>
#include <flint/fmpz_poly.h>
#include <flint/fmpz_vec.h>
#include <flint/nmod.h>
#include <flint/nmod_mat.h>
#include <flint/qqbar.h>
#include <flint/ulong_extras.h>

#include "cyclotomic_rref.h"

void sagejs_cyclotomic_matrix_clear(sagejs_cyclotomic_matrix *matrix)
{
    size_t count;

    if (matrix == NULL)
        return;
    count = matrix->rank * matrix->columns * matrix->degree;
    if (matrix->coefficients != NULL)
        _fmpq_vec_clear(
            matrix->coefficients, (slong) (count == 0 ? 1 : count));
    memset(matrix, 0, sizeof(*matrix));
}

#define SAGEJS_CYCLOTOMIC_MAX_ORDER 256
#define SAGEJS_CYCLOTOMIC_MAX_DEGREE 64
#define SAGEJS_CYCLOTOMIC_MAX_PRIMES 64
#define SAGEJS_CYCLOTOMIC_PRIME_START UWORD(1000000000)

typedef struct
{
    size_t length;
    size_t capacity;
    size_t *columns;
    ulong *values;
} sagejs_sparse_nmod_row;

static void sparse_nmod_row_clear(sagejs_sparse_nmod_row *row)
{
    free(row->columns);
    free(row->values);
    memset(row, 0, sizeof(*row));
}

static int sparse_nmod_row_reserve(
    sagejs_sparse_nmod_row *row, size_t capacity)
{
    size_t next;
    size_t *columns;
    ulong *values;

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
    memcpy(columns, row->columns, row->length * sizeof(*columns));
    memcpy(values, row->values, row->length * sizeof(*values));
    free(row->columns);
    free(row->values);
    row->columns = columns;
    row->values = values;
    row->capacity = next;
    return 1;
}

static ulong sparse_nmod_row_entry(
    const sagejs_sparse_nmod_row *row, size_t column)
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

static int sparse_nmod_row_add(
    sagejs_sparse_nmod_row *row,
    size_t column,
    ulong value,
    nmod_t modulus)
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
    if (left < row->length && row->columns[left] == column)
    {
        value = nmod_add(row->values[left], value, modulus);
        if (value == 0)
        {
            memmove(row->columns + left, row->columns + left + 1,
                (row->length - left - 1) * sizeof(*row->columns));
            memmove(row->values + left, row->values + left + 1,
                (row->length - left - 1) * sizeof(*row->values));
            row->length--;
        }
        else
            row->values[left] = value;
        return 1;
    }
    if (value == 0)
        return 1;
    if (!sparse_nmod_row_reserve(row, row->length + 1))
        return 0;
    memmove(row->columns + left + 1, row->columns + left,
        (row->length - left) * sizeof(*row->columns));
    memmove(row->values + left + 1, row->values + left,
        (row->length - left) * sizeof(*row->values));
    row->columns[left] = column;
    row->values[left] = value;
    row->length++;
    return 1;
}

static int sparse_nmod_row_axpy(
    sagejs_sparse_nmod_row *left,
    const sagejs_sparse_nmod_row *right,
    ulong coefficient,
    size_t *workspace_columns,
    ulong *workspace_values,
    size_t workspace_capacity,
    nmod_t modulus)
{
    size_t i = 0, j = 0, used = 0;

    while (i < left->length || j < right->length)
    {
        size_t column;
        ulong value;
        if (used >= workspace_capacity)
            return 0;
        if (j == right->length ||
            (i < left->length && left->columns[i] < right->columns[j]))
        {
            column = left->columns[i];
            value = left->values[i++];
        }
        else if (i == left->length || right->columns[j] < left->columns[i])
        {
            column = right->columns[j];
            value = nmod_neg(nmod_mul(
                coefficient, right->values[j++], modulus), modulus);
        }
        else
        {
            column = left->columns[i];
            value = nmod_sub(left->values[i++],
                nmod_mul(coefficient, right->values[j++], modulus),
                modulus);
        }
        if (value != 0)
        {
            workspace_columns[used] = column;
            workspace_values[used++] = value;
        }
    }
    if (!sparse_nmod_row_reserve(left, used))
        return 0;
    memcpy(left->columns, workspace_columns, used * sizeof(*left->columns));
    memcpy(left->values, workspace_values, used * sizeof(*left->values));
    left->length = used;
    return 1;
}

static int sparse_nmod_row_compare(const void *left, const void *right)
{
    const sagejs_sparse_nmod_row *a = left;
    const sagejs_sparse_nmod_row *b = right;
    size_t ca = a->length == 0 ? SIZE_MAX : a->columns[0];
    size_t cb = b->length == 0 ? SIZE_MAX : b->columns[0];
    return ca < cb ? -1 : ca > cb;
}

static int sparse_nmod_rref(
    nmod_mat_t output,
    size_t *rank_out,
    size_t rows,
    size_t columns,
    const sagejs_cyclotomic_term *terms,
    size_t term_count,
    ulong root)
{
    sagejs_sparse_nmod_row *pivots = NULL;
    sagejs_sparse_nmod_row working = {0};
    size_t *pivot_by_column = NULL, *workspace_columns = NULL;
    size_t *backward_offsets = NULL, *backward_rows = NULL;
    size_t *backward_cursor = NULL;
    ulong *workspace_values = NULL;
    size_t rank = 0, cursor = 0;
    int status = 0;

    pivots = calloc(rows == 0 ? 1 : rows, sizeof(*pivots));
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

    for (size_t source_row = 0; source_row < rows; source_row++)
    {
        working.length = 0;
        while (cursor < term_count && terms[cursor].row < source_row)
            cursor++;
        while (cursor < term_count && terms[cursor].row == source_row)
        {
            const sagejs_cyclotomic_term *term = terms + cursor++;
            ulong coefficient = fmpz_fdiv_ui(
                &term->coefficient, output->mod.n);
            ulong contribution = nmod_mul(coefficient,
                n_powmod(root, (slong) term->exponent, output->mod.n),
                output->mod);
            if (term->column >= columns || !sparse_nmod_row_add(
                    &working, term->column, contribution, output->mod))
                goto done;
        }
        while (working.length != 0)
        {
            size_t pivot_column = working.columns[0];
            size_t pivot = pivot_by_column[pivot_column];
            if (pivot == SIZE_MAX)
            {
                ulong inverse = nmod_inv(working.values[0], output->mod);
                for (size_t item = 0; item < working.length; item++)
                    working.values[item] = nmod_mul(
                        working.values[item], inverse, output->mod);
                pivots[rank] = working;
                memset(&working, 0, sizeof(working));
                pivot_by_column[pivot_column] = rank++;
                break;
            }
            if (!sparse_nmod_row_axpy(
                    &working, &pivots[pivot], working.values[0],
                    workspace_columns, workspace_values, columns,
                    output->mod))
                goto done;
        }
    }

    qsort(pivots, rank, sizeof(*pivots), sparse_nmod_row_compare);
    for (size_t column = 0; column < columns; column++)
        pivot_by_column[column] = SIZE_MAX;
    for (size_t row = 0; row < rank; row++)
        pivot_by_column[pivots[row].columns[0]] = row;
    backward_offsets = calloc(rank + 1, sizeof(*backward_offsets));
    backward_cursor = malloc(
        (rank == 0 ? 1 : rank) * sizeof(*backward_cursor));
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
    for (size_t position = rank; position > 0; position--)
    {
        size_t row = position - 1;
        size_t pivot_column = pivots[row].columns[0];
        for (size_t occurrence = backward_offsets[row];
            occurrence < backward_offsets[row + 1]; occurrence++)
        {
            size_t earlier = backward_rows[occurrence];
            ulong coefficient = sparse_nmod_row_entry(
                &pivots[earlier], pivot_column);
            if (coefficient != 0 && !sparse_nmod_row_axpy(
                    &pivots[earlier], &pivots[row], coefficient,
                    workspace_columns, workspace_values, columns,
                    output->mod))
                goto done;
        }
    }
    nmod_mat_zero(output);
    for (size_t row = 0; row < rank; row++)
        for (size_t item = 0; item < pivots[row].length; item++)
            nmod_mat_entry(output, (slong) row,
                (slong) pivots[row].columns[item]) = pivots[row].values[item];
    *rank_out = rank;
    status = 1;

done:
    sparse_nmod_row_clear(&working);
    if (pivots != NULL)
        for (size_t row = 0; row < rows; row++)
            sparse_nmod_row_clear(&pivots[row]);
    free(pivots);
    free(pivot_by_column);
    free(workspace_columns);
    free(workspace_values);
    free(backward_offsets);
    free(backward_rows);
    free(backward_cursor);
    return status;
}

static int checked_product(size_t left, size_t right, size_t *result)
{
    if (left != 0 && right > SIZE_MAX / left)
        return 0;
    *result = left * right;
    return 1;
}

static int pivot_compare(
    const size_t *left, size_t left_rank,
    const size_t *right, size_t right_rank)
{
    size_t count = left_rank < right_rank ? left_rank : right_rank;
    for (size_t i = 0; i < count; i++)
        if (left[i] != right[i])
            return left[i] < right[i] ? -1 : 1;
    return left_rank < right_rank ? -1 : left_rank > right_rank;
}

static int extract_pivots(
    size_t *pivots, size_t rank,
    const nmod_mat_t matrix, size_t columns)
{
    size_t previous = 0;
    for (size_t row = 0; row < rank; row++)
    {
        size_t column = row == 0 ? 0 : previous + 1;
        while (column < columns &&
            nmod_mat_entry(matrix, (slong) row, (slong) column) == 0)
            column++;
        if (column >= columns)
            return 0;
        pivots[row] = column;
        previous = column;
    }
    return 1;
}

static ulong next_split_prime(ulong order, ulong *multiple)
{
    while (*multiple < UWORD_MAX / order)
    {
        ulong candidate = (*multiple)++ * order + 1;
        if (candidate > SAGEJS_CYCLOTOMIC_PRIME_START &&
            n_is_prime(candidate))
            return candidate;
    }
    return 0;
}

static int make_vandermonde(
    nmod_mat_t inverse,
    ulong *roots,
    ulong order,
    size_t degree,
    ulong prime)
{
    nmod_mat_t matrix;
    ulong primitive = n_primitive_root_prime(prime);
    ulong root = n_powmod(
        primitive, (slong) ((prime - 1) / order), prime);
    size_t found = 0;

    nmod_mat_init(matrix, (slong) degree, (slong) degree, prime);
    for (ulong exponent = 1; exponent <= order && found < degree; exponent++)
        if (n_gcd(exponent, order) == 1)
        {
            ulong value = n_powmod(root, (slong) exponent, prime);
            ulong power = 1;
            roots[found] = value;
            for (size_t column = 0; column < degree; column++)
            {
                nmod_mat_entry(matrix, (slong) found, (slong) column) = power;
                power = nmod_mul(power, value, matrix->mod);
            }
            found++;
        }
    if (found != degree || !nmod_mat_inv(inverse, matrix))
    {
        nmod_mat_clear(matrix);
        return 0;
    }
    nmod_mat_clear(matrix);
    return 1;
}

static int one_split_prime(
    ulong **values_out,
    size_t **pivots_out,
    size_t *rank_out,
    size_t rows,
    size_t columns,
    const sagejs_cyclotomic_term *terms,
    size_t term_count,
    ulong order,
    size_t degree,
    ulong prime)
{
    nmod_mat_t inverse, matrix;
    ulong *roots = NULL, *values = NULL;
    size_t *pivots = NULL, *current_pivots = NULL;
    size_t rank = 0, free_count = 0, cells = 0, total = 0;
    int status = 0;

    nmod_mat_init(inverse, (slong) degree, (slong) degree, prime);
    roots = malloc(degree * sizeof(*roots));
    current_pivots = malloc(
        (rows < columns ? rows : columns) * sizeof(*current_pivots));
    if (roots == NULL || current_pivots == NULL ||
        !make_vandermonde(inverse, roots, order, degree, prime))
        goto done;

    for (size_t embedding = 0; embedding < degree; embedding++)
    {
        size_t current_rank;
        nmod_mat_init(matrix, (slong) rows, (slong) columns, prime);
        if (!sparse_nmod_rref(matrix, &current_rank,
                rows, columns, terms, term_count, roots[embedding]))
        {
            nmod_mat_clear(matrix);
            goto done;
        }
        if (!extract_pivots(
                current_pivots, current_rank, matrix, columns))
        {
            nmod_mat_clear(matrix);
            goto done;
        }
        if (embedding == 0)
        {
            rank = current_rank;
            free_count = columns - rank;
            pivots = malloc((rank == 0 ? 1 : rank) * sizeof(*pivots));
            if (!checked_product(rank, free_count, &cells) ||
                !checked_product(degree, cells, &total))
            {
                nmod_mat_clear(matrix);
                goto done;
            }
            values = calloc(total == 0 ? 1 : total, sizeof(*values));
            if (pivots == NULL || values == NULL)
            {
                nmod_mat_clear(matrix);
                goto done;
            }
            memcpy(pivots, current_pivots, rank * sizeof(*pivots));
        }
        else if (current_rank != rank ||
            memcmp(pivots, current_pivots, rank * sizeof(*pivots)) != 0)
        {
            nmod_mat_clear(matrix);
            goto done;
        }
        {
            size_t pivot = 0, target = 0;
            for (size_t column = 0; column < columns; column++)
            {
                if (pivot < rank && pivots[pivot] == column)
                {
                    pivot++;
                    continue;
                }
                for (size_t row = 0; row < rank; row++)
                    values[(embedding * rank + row) * free_count + target] =
                        nmod_mat_entry(matrix, (slong) row, (slong) column);
                target++;
            }
        }
        nmod_mat_clear(matrix);
    }

    /* Interpolate the embedding values into the power basis in place. */
    {
        ulong *interpolated = calloc(
            total == 0 ? 1 : total, sizeof(*interpolated));
        if (interpolated == NULL)
            goto done;
        for (size_t power = 0; power < degree; power++)
            for (size_t row = 0; row < rank; row++)
                for (size_t column = 0; column < free_count; column++)
                {
                    ulong sum = 0;
                    for (size_t embedding = 0; embedding < degree; embedding++)
                    {
                        ulong product = nmod_mul(
                            nmod_mat_entry(inverse,
                                (slong) power, (slong) embedding),
                            values[(embedding * rank + row) * free_count +
                                column],
                            inverse->mod);
                        sum = nmod_add(sum, product, inverse->mod);
                    }
                    interpolated[(power * rank + row) * free_count +
                        column] = sum;
                }
        free(values);
        values = interpolated;
    }

    *values_out = values;
    *pivots_out = pivots;
    *rank_out = rank;
    values = NULL;
    pivots = NULL;
    status = 1;

done:
    free(roots);
    free(values);
    free(pivots);
    free(current_pivots);
    nmod_mat_clear(inverse);
    return status;
}

static int reconstruct_candidate(
    fmpq *candidate,
    size_t count,
    const fmpz *residues,
    const fmpz_t modulus)
{
    for (size_t item = 0; item < count; item++)
        if (!fmpq_reconstruct_fmpz(
                candidate + item, residues + item, modulus))
            return 0;
    return 1;
}

static int height_proves_reconstruction(
    const fmpq *candidate,
    size_t count,
    size_t columns,
    const fmpz_t source_bound,
    const fmpz_t modulus)
{
    fmpz_t denominator, coefficient_bound, temporary, bound;
    int proven;

    fmpz_init_set_ui(denominator, 1);
    fmpz_init(coefficient_bound);
    fmpz_init(temporary);
    fmpz_init(bound);
    for (size_t item = 0; item < count; item++)
        fmpz_lcm(denominator, denominator, fmpq_denref(candidate + item));
    for (size_t item = 0; item < count; item++)
    {
        fmpz_divexact(temporary,
            denominator, fmpq_denref(candidate + item));
        fmpz_mul(temporary, temporary, fmpq_numref(candidate + item));
        fmpz_abs(temporary, temporary);
        if (fmpz_cmp(temporary, coefficient_bound) > 0)
            fmpz_set(coefficient_bound, temporary);
    }
    fmpz_mul(bound, coefficient_bound, source_bound);
    fmpz_mul_ui(bound, bound, (ulong) columns);
    proven = fmpz_cmp(modulus, bound) > 0;
    fmpz_clear(denominator);
    fmpz_clear(coefficient_bound);
    fmpz_clear(temporary);
    fmpz_clear(bound);
    return proven;
}

static int candidate_to_qqbar(
    gr_mat_t output,
    const fmpq *candidate,
    size_t rank,
    size_t columns,
    const size_t *pivots,
    size_t degree,
    ulong order,
    gr_ctx_t context)
{
    qqbar_t root, value;
    fmpq_poly_t polynomial;

    if (gr_mat_zero(output, context) != GR_SUCCESS)
        return 0;
    qqbar_init(root);
    qqbar_init(value);
    fmpq_poly_init(polynomial);
    qqbar_root_of_unity(root, 1, order);
    for (size_t row = 0; row < rank; row++)
        qqbar_one((qqbar_ptr) gr_mat_entry_ptr(
            output, (slong) row, (slong) pivots[row], context));
    {
        size_t pivot = 0, target = 0;
        for (size_t column = 0; column < columns; column++)
        {
            if (pivot < rank && pivots[pivot] == column)
            {
                pivot++;
                continue;
            }
            for (size_t row = 0; row < rank; row++)
            {
            fmpq_poly_zero(polynomial);
            for (size_t power = 0; power < degree; power++)
                fmpq_poly_set_coeff_fmpq(polynomial, (slong) power,
                    candidate + (power * rank + row) * (columns - rank) +
                        target);
            qqbar_evaluate_fmpq_poly(value, polynomial, root);
            qqbar_set((qqbar_ptr) gr_mat_entry_ptr(
                output, (slong) row, (slong) column, context), value);
            }
            target++;
        }
    }
    fmpq_poly_clear(polynomial);
    qqbar_clear(value);
    qqbar_clear(root);
    return 1;
}

/*
 * Certify a reconstructed RREF directly over the number field.  The height
 * bound above is deliberately conservative and can require many unnecessary
 * CRT primes for matrices obtained by evaluating Hecke polynomials.  If R is
 * the candidate RREF and P lists its pivot columns, every source row v must
 * satisfy
 *
 *                 v = (v[P[0]], ..., v[P[r-1]]) R.
 *
 * This identity is an exact certificate of equality of row spaces once the
 * modular computations have established the candidate rank and pivot set.
 */
static void source_entry_polynomial(
    fmpq_poly_t output,
    size_t row,
    size_t column,
    const sagejs_cyclotomic_term *terms,
    size_t term_count)
{
    fmpq_t coefficient;

    fmpq_poly_zero(output);
    fmpq_init(coefficient);
    for (size_t item = 0; item < term_count; item++)
    {
        const sagejs_cyclotomic_term *term = terms + item;
        if (term->row != row || term->column != column)
            continue;
        fmpq_poly_get_coeff_fmpq(
            coefficient, output, (slong) term->exponent);
        fmpq_add_fmpz(coefficient, coefficient, &term->coefficient);
        fmpq_poly_set_coeff_fmpq(
            output, (slong) term->exponent, coefficient);
    }
    fmpq_clear(coefficient);
}

static int candidate_certifies_source(
    const fmpq *candidate,
    size_t rank,
    size_t rows,
    size_t columns,
    const size_t *pivots,
    const sagejs_cyclotomic_term *terms,
    size_t term_count,
    ulong order)
{
    size_t free_count = columns - rank;
    fmpq_poly_struct *multipliers = NULL;
    fmpq_poly_t cyclotomic, expected, actual, coefficient, product;
    fmpz_poly_t cyclotomic_integer;
    int status = 0;

    multipliers = malloc((rank == 0 ? 1 : rank) * sizeof(*multipliers));
    if (multipliers == NULL)
        return 0;
    for (size_t pivot = 0; pivot < rank; pivot++)
        fmpq_poly_init(multipliers + pivot);
    fmpz_poly_init(cyclotomic_integer);
    fmpq_poly_init(cyclotomic);
    fmpq_poly_init(expected);
    fmpq_poly_init(actual);
    fmpq_poly_init(coefficient);
    fmpq_poly_init(product);
    fmpz_poly_cyclotomic(cyclotomic_integer, order);
    fmpq_poly_set_fmpz_poly(cyclotomic, cyclotomic_integer);

    for (size_t row = 0; row < rows; row++)
    {
        size_t pivot_cursor = 0, target = 0;
        for (size_t pivot = 0; pivot < rank; pivot++)
        {
            source_entry_polynomial(multipliers + pivot,
                row, pivots[pivot], terms, term_count);
            fmpq_poly_rem(multipliers + pivot,
                multipliers + pivot, cyclotomic);
        }
        for (size_t column = 0; column < columns; column++)
        {
            if (pivot_cursor < rank && pivots[pivot_cursor] == column)
            {
                pivot_cursor++;
                continue;
            }
            source_entry_polynomial(
                expected, row, column, terms, term_count);
            fmpq_poly_rem(expected, expected, cyclotomic);
            fmpq_poly_zero(actual);
            for (size_t pivot = 0; pivot < rank; pivot++)
            {
                fmpq_poly_zero(coefficient);
                for (size_t power = 0;
                    power < (size_t) n_euler_phi(order); power++)
                    fmpq_poly_set_coeff_fmpq(
                        coefficient, (slong) power,
                        candidate +
                            (power * rank + pivot) * free_count + target);
                fmpq_poly_mul(product, multipliers + pivot, coefficient);
                fmpq_poly_add(actual, actual, product);
            }
            fmpq_poly_rem(actual, actual, cyclotomic);
            if (!fmpq_poly_equal(actual, expected))
                goto done;
            target++;
        }
    }
    status = 1;

done:
    fmpq_poly_clear(product);
    fmpq_poly_clear(coefficient);
    fmpq_poly_clear(actual);
    fmpq_poly_clear(expected);
    fmpq_poly_clear(cyclotomic);
    fmpz_poly_clear(cyclotomic_integer);
    for (size_t pivot = 0; pivot < rank; pivot++)
        fmpq_poly_clear(multipliers + pivot);
    free(multipliers);
    return status;
}

int sagejs_cyclotomic_rref_multimodular(
    gr_mat_t output,
    slong *rank_out,
    size_t rows,
    size_t columns,
    const sagejs_cyclotomic_term *terms,
    size_t term_count,
    ulong order,
    const fmpz_t source_coefficient_bound,
    gr_ctx_t context,
    sagejs_cyclotomic_matrix *coordinates)
{
    size_t degree, maximum_rank, coefficient_count = 0;
    size_t residue_count = 0, candidate_count = 0;
    size_t target_rank = 0, accepted = 0;
    size_t *target_pivots = NULL;
    fmpz *residues = NULL;
    fmpq *candidate = NULL;
    fmpz_t modulus, scaled_source_bound;
    fmpz_poly_t cyclotomic, monomial, remainder;
    ulong multiple, prime;
    int status = 0;

    if (rank_out == NULL || order < 3 ||
        order > SAGEJS_CYCLOTOMIC_MAX_ORDER)
        return 0;
    degree = (size_t) n_euler_phi(order);
    if (degree == 0 || degree > SAGEJS_CYCLOTOMIC_MAX_DEGREE)
        return 0;
    maximum_rank = rows < columns ? rows : columns;
    target_pivots = malloc(
        (maximum_rank == 0 ? 1 : maximum_rank) * sizeof(*target_pivots));
    if (target_pivots == NULL)
        return 0;

    fmpz_init_set_ui(modulus, 1);
    fmpz_init_set(scaled_source_bound, source_coefficient_bound);
    fmpz_poly_init(cyclotomic);
    fmpz_poly_init(monomial);
    fmpz_poly_init(remainder);
    fmpz_poly_cyclotomic(cyclotomic, order);

    /* Bound coefficients of every root power in the cyclotomic power basis. */
    {
        fmpz_t power_bound, absolute;
        fmpz_init_set_ui(power_bound, 1);
        fmpz_init(absolute);
        for (ulong exponent = 0; exponent < order; exponent++)
        {
            fmpz_poly_zero(monomial);
            fmpz_poly_set_coeff_ui(monomial, (slong) exponent, 1);
            fmpz_poly_rem(remainder, monomial, cyclotomic);
            for (slong i = 0; i < fmpz_poly_length(remainder); i++)
            {
                fmpz_abs(absolute, fmpz_poly_get_coeff_ptr(remainder, i));
                if (fmpz_cmp(absolute, power_bound) > 0)
                    fmpz_set(power_bound, absolute);
            }
        }
        fmpz_mul(scaled_source_bound,
            scaled_source_bound, power_bound);
        fmpz_clear(power_bound);
        fmpz_clear(absolute);
    }

    multiple = SAGEJS_CYCLOTOMIC_PRIME_START / order + 1;
    for (size_t attempt = 0;
        attempt < SAGEJS_CYCLOTOMIC_MAX_PRIMES; attempt++)
    {
        ulong *prime_values = NULL;
        size_t *prime_pivots = NULL;
        size_t prime_rank = 0;
        int comparison;

        prime = next_split_prime(order, &multiple);
        if (prime == 0 || !one_split_prime(
                &prime_values, &prime_pivots, &prime_rank,
                rows, columns, terms, term_count,
                order, degree, prime))
        {
            free(prime_values);
            free(prime_pivots);
            continue;
        }
        comparison = accepted == 0 ? 1 : pivot_compare(
            prime_pivots, prime_rank, target_pivots, target_rank);
        if (accepted != 0 && comparison < 0)
        {
            free(prime_values);
            free(prime_pivots);
            continue;
        }
        if (accepted == 0 || comparison > 0)
        {
            if (residues != NULL)
                _fmpz_vec_clear(residues,
                    (slong) (residue_count == 0 ? 1 : residue_count));
            residues = NULL;
            residue_count = 0;
            if (candidate != NULL)
                _fmpq_vec_clear(candidate,
                    (slong) (candidate_count == 0 ? 1 : candidate_count));
            candidate = NULL;
            candidate_count = 0;
            if (!checked_product(degree, prime_rank, &coefficient_count) ||
                !checked_product(coefficient_count, columns - prime_rank,
                    &coefficient_count))
            {
                free(prime_values);
                free(prime_pivots);
                goto done;
            }
            residues = _fmpz_vec_init(
                (slong) (coefficient_count == 0 ? 1 : coefficient_count));
            if (residues == NULL)
            {
                free(prime_values);
                free(prime_pivots);
                goto done;
            }
            residue_count = coefficient_count;
            target_rank = prime_rank;
            memcpy(target_pivots, prime_pivots,
                target_rank * sizeof(*target_pivots));
            fmpz_set_ui(modulus, 1);
            accepted = 0;
        }
        if (prime_rank != target_rank ||
            memcmp(prime_pivots, target_pivots,
                target_rank * sizeof(*target_pivots)) != 0)
        {
            free(prime_values);
            free(prime_pivots);
            continue;
        }
        if (accepted == 0)
            for (size_t item = 0; item < coefficient_count; item++)
                fmpz_set_ui(residues + item, prime_values[item]);
        else
            for (size_t item = 0; item < coefficient_count; item++)
                fmpz_CRT_ui(residues + item,
                    residues + item, modulus,
                    prime_values[item], prime, 0);
        fmpz_mul_ui(modulus, modulus, prime);
        accepted++;
        free(prime_values);
        free(prime_pivots);

        if (accepted >= 2)
        {
            int reconstructed, converted, proven, certified;
            if (candidate == NULL)
            {
                candidate = _fmpq_vec_init((slong)
                    (coefficient_count == 0 ? 1 : coefficient_count));
                candidate_count = coefficient_count;
            }
            if (candidate == NULL)
                goto done;
            reconstructed = reconstruct_candidate(
                candidate, coefficient_count, residues, modulus);
            converted = reconstructed && candidate_to_qqbar(
                output, candidate, target_rank, columns, target_pivots,
                degree, order, context);
            proven = converted && height_proves_reconstruction(
                candidate, coefficient_count, columns,
                scaled_source_bound, modulus);
            certified = converted && rows <= 64 && columns <= 64 &&
                candidate_certifies_source(
                    candidate, target_rank, rows, columns, target_pivots,
                    terms, term_count, order);
            if (converted && (proven || certified))
            {
                if (coordinates != NULL)
                {
                    sagejs_cyclotomic_matrix_clear(coordinates);
                    coordinates->rank = target_rank;
                    coordinates->columns = columns - target_rank;
                    coordinates->degree = degree;
                    coordinates->order = order;
                    coordinates->coefficients = candidate;
                    candidate = NULL;
                    candidate_count = 0;
                }
                *rank_out = (slong) target_rank;
                status = 1;
                goto done;
            }
        }
    }

done:
    free(target_pivots);
    if (residues != NULL)
        _fmpz_vec_clear(residues,
            (slong) (residue_count == 0 ? 1 : residue_count));
    if (candidate != NULL)
        _fmpq_vec_clear(candidate,
            (slong) (candidate_count == 0 ? 1 : candidate_count));
    fmpz_poly_clear(cyclotomic);
    fmpz_poly_clear(monomial);
    fmpz_poly_clear(remainder);
    fmpz_clear(modulus);
    fmpz_clear(scaled_source_bound);
    return status;
}
