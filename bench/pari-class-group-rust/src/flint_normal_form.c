// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

#include <flint/fmpz.h>
#include <flint/fmpz_lll.h>
#include <flint/fmpz_mat.h>
#include <limits.h>
#include <stdint.h>

static int sagejs_rust_flint_set_i64_matrix(
    fmpz_mat_t matrix, size_t rows, size_t columns, const int64_t *entries)
{
    if (rows == 0 || columns == 0 || entries == NULL || rows > LONG_MAX ||
        columns > LONG_MAX || (columns != 0 && rows > SIZE_MAX / columns))
        return 0;
    fmpz_mat_init(matrix, (slong) rows, (slong) columns);
    for (size_t row = 0; row < rows; row++)
        for (size_t column = 0; column < columns; column++)
            fmpz_set_si(fmpz_mat_entry(matrix, (slong) row, (slong) column),
                        (slong) entries[row * columns + column]);
    return 1;
}

int sagejs_rust_flint_snf_i64(
    size_t rows, size_t columns, const int64_t *entries, int64_t *diagonal)
{
    if (rows == 0 || columns == 0 || entries == NULL || diagonal == NULL ||
        rows > LONG_MAX || columns > LONG_MAX ||
        (columns != 0 && rows > SIZE_MAX / columns))
        return -1;
    fmpz_mat_t source;
    fmpz_mat_t smith;
    if (!sagejs_rust_flint_set_i64_matrix(source, rows, columns, entries))
        return -1;
    fmpz_mat_init(smith, (slong) rows, (slong) columns);
    fmpz_mat_snf(smith, source);
    size_t count = rows < columns ? rows : columns;
    int status = 0;
    for (size_t index = 0; index < count; index++)
    {
        const fmpz *entry = fmpz_mat_entry(smith, (slong) index, (slong) index);
        if (!fmpz_fits_si(entry))
        {
            status = -2;
            break;
        }
        diagonal[index] = (int64_t) fmpz_get_si(entry);
    }
    fmpz_mat_clear(smith);
    fmpz_mat_clear(source);
    flint_cleanup();
    return status;
}

int sagejs_rust_flint_hnf_basis_i64(
    size_t rows, size_t columns, const int64_t *entries, int64_t *basis)
{
    if (rows < columns || basis == NULL)
        return -1;
    fmpz_mat_t source;
    fmpz_mat_t hermite;
    if (!sagejs_rust_flint_set_i64_matrix(source, rows, columns, entries))
        return -1;
    fmpz_mat_init(hermite, (slong) rows, (slong) columns);
    fmpz_mat_hnf(hermite, source);
    size_t output_row = 0;
    int status = 0;
    for (size_t row = 0; row < rows; row++)
    {
        int nonzero = 0;
        for (size_t column = 0; column < columns; column++)
            if (!fmpz_is_zero(fmpz_mat_entry(
                    hermite, (slong) row, (slong) column)))
            {
                nonzero = 1;
                break;
            }
        if (!nonzero)
            continue;
        if (output_row == columns)
        {
            status = -3;
            break;
        }
        for (size_t column = 0; column < columns; column++)
        {
            const fmpz *entry = fmpz_mat_entry(
                hermite, (slong) row, (slong) column);
            if (!fmpz_fits_si(entry))
            {
                status = -2;
                break;
            }
            basis[output_row * columns + column] =
                (int64_t) fmpz_get_si(entry);
        }
        if (status != 0)
            break;
        output_row++;
    }
    if (status == 0 && output_row != columns)
        status = -3;
    fmpz_mat_clear(hermite);
    fmpz_mat_clear(source);
    flint_cleanup();
    return status;
}

int sagejs_rust_flint_lll_columns_decimal(
    const char *const *entries, int64_t *transform)
{
    if (entries == NULL || transform == NULL)
        return -1;
    fmpz_mat_t basis;
    fmpz_mat_t left_transform;
    fmpz_mat_init(basis, 3, 3);
    fmpz_mat_init(left_transform, 3, 3);
    for (size_t row = 0; row < 3; row++)
        for (size_t column = 0; column < 3; column++)
        {
            const char *entry = entries[column * 3 + row];
            if (entry == NULL ||
                fmpz_set_str(fmpz_mat_entry(basis, (slong) row, (slong) column),
                             entry, 10) != 0)
            {
                fmpz_mat_clear(left_transform);
                fmpz_mat_clear(basis);
                return -1;
            }
        }
    fmpz_mat_one(left_transform);
    fmpz_lll_t context;
    fmpz_lll_context_init(context, 0.99, 0.5, Z_BASIS, EXACT);
    fmpz_lll(basis, left_transform, context);
    int status = 0;
    for (size_t row = 0; row < 3; row++)
        for (size_t column = 0; column < 3; column++)
        {
            /* Transpose U because the Rust lattice stores basis vectors as
               columns, whereas FLINT reduced the transposed row basis. */
            const fmpz *entry = fmpz_mat_entry(
                left_transform, (slong) column, (slong) row);
            if (!fmpz_fits_si(entry))
            {
                status = -2;
                break;
            }
            transform[row * 3 + column] = (int64_t) fmpz_get_si(entry);
        }
    fmpz_mat_clear(left_transform);
    fmpz_mat_clear(basis);
    flint_cleanup();
    return status;
}

int sagejs_rust_flint_snf_class_map_i64(
    size_t size, const int64_t *entries, int64_t *invariant_factors,
    int64_t *generator_coordinates, size_t *invariant_count)
{
    if (size == 0 || invariant_factors == NULL ||
        generator_coordinates == NULL || invariant_count == NULL)
        return -1;
    fmpz_mat_t source;
    fmpz_mat_t smith;
    fmpz_mat_t left_transform;
    fmpz_mat_t right_transform;
    if (!sagejs_rust_flint_set_i64_matrix(source, size, size, entries))
        return -1;
    fmpz_mat_init(smith, (slong) size, (slong) size);
    fmpz_mat_init(left_transform, (slong) size, (slong) size);
    fmpz_mat_init(right_transform, (slong) size, (slong) size);
    fmpz_mat_snf_transform(smith, left_transform, right_transform, source);

    size_t count = 0;
    int status = 0;
    fmpz_t absolute;
    fmpz_init(absolute);
    for (size_t diagonal = 0; diagonal < size; diagonal++)
    {
        const fmpz *entry = fmpz_mat_entry(
            smith, (slong) diagonal, (slong) diagonal);
        fmpz_abs(absolute, entry);
        if (fmpz_cmp_ui(absolute, 1) <= 0)
            continue;
        if (!fmpz_fits_si(absolute))
        {
            status = -2;
            break;
        }
        const ulong modulus = fmpz_get_ui(absolute);
        invariant_factors[count] = (int64_t) modulus;
        for (size_t generator = 0; generator < size; generator++)
        {
            const fmpz *coordinate = fmpz_mat_entry(
                right_transform, (slong) generator, (slong) diagonal);
            generator_coordinates[generator * size + count] =
                (int64_t) fmpz_fdiv_ui(coordinate, modulus);
        }
        count++;
    }
    *invariant_count = count;
    fmpz_clear(absolute);
    fmpz_mat_clear(right_transform);
    fmpz_mat_clear(left_transform);
    fmpz_mat_clear(smith);
    fmpz_mat_clear(source);
    flint_cleanup();
    return status;
}
