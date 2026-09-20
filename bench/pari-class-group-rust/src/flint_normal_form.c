// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

#include <gmp.h>
#include <flint/fmpz.h>
#include <flint/fmpz_lll.h>
#include <flint/fmpz_mat.h>
#include <flint/nmod_mat.h>
#include <flint/arb.h>
#include <flint/arb_calc.h>
#include <limits.h>
#include <stdint.h>
#include <string.h>
#include <time.h>

static uint64_t sagejs_rust_monotonic_ns(void)
{
    struct timespec value;
    if (clock_gettime(CLOCK_MONOTONIC, &value) != 0)
        return 0;
    return (uint64_t) value.tv_sec * UINT64_C(1000000000) +
        (uint64_t) value.tv_nsec;
}

static int sagejs_rust_gf2_right_nullspace_i64(
    size_t rows, size_t columns, const int64_t *entries,
    uint8_t *generator_coordinates, size_t coordinate_capacity,
    size_t *nullity)
{
    if (rows == 0 || columns == 0 || entries == NULL ||
        generator_coordinates == NULL || nullity == NULL ||
        columns > SIZE_MAX - 63 || rows > SIZE_MAX / columns ||
        coordinate_capacity < columns * columns)
        return 0;
    const size_t words = (columns + 63) / 64;
    if (words == 0 || rows > SIZE_MAX / words ||
        rows * words > SIZE_MAX / sizeof(uint64_t))
        return 0;
    uint64_t *bits = flint_calloc(rows * words, sizeof(uint64_t));
    size_t *pivot_columns = flint_malloc(columns * sizeof(size_t));
    uint64_t *vector = flint_calloc(words, sizeof(uint64_t));
    if (bits == NULL || pivot_columns == NULL || vector == NULL)
    {
        flint_free(vector);
        flint_free(pivot_columns);
        flint_free(bits);
        return 0;
    }
    for (size_t row = 0; row < rows; row++)
        for (size_t column = 0; column < columns; column++)
            if (((uint64_t) entries[row * columns + column]) & 1)
                bits[row * words + column / 64] |=
                    UINT64_C(1) << (column % 64);

    size_t rank = 0;
    for (size_t column = 0; column < columns && rank < rows; column++)
    {
        size_t pivot = rank;
        while (pivot < rows &&
            !(bits[pivot * words + column / 64] &
                (UINT64_C(1) << (column % 64))))
            pivot++;
        if (pivot == rows)
            continue;
        if (pivot != rank)
            for (size_t word = 0; word < words; word++)
            {
                uint64_t temporary = bits[rank * words + word];
                bits[rank * words + word] = bits[pivot * words + word];
                bits[pivot * words + word] = temporary;
            }
        pivot_columns[rank] = column;
        for (size_t row = rank + 1; row < rows; row++)
            if (bits[row * words + column / 64] &
                (UINT64_C(1) << (column % 64)))
                for (size_t word = column / 64; word < words; word++)
                    bits[row * words + word] ^= bits[rank * words + word];
        rank++;
    }

    *nullity = columns - rank;
    size_t free_index = 0;
    size_t next_pivot = 0;
    for (size_t free_column = 0; free_column < columns; free_column++)
    {
        if (next_pivot < rank && pivot_columns[next_pivot] == free_column)
        {
            next_pivot++;
            continue;
        }
        memset(vector, 0, words * sizeof(uint64_t));
        vector[free_column / 64] |= UINT64_C(1) << (free_column % 64);
        for (size_t offset = rank; offset > 0; offset--)
        {
            const size_t pivot_row = offset - 1;
            unsigned parity = 0;
            for (size_t word = pivot_columns[pivot_row] / 64;
                 word < words; word++)
                parity ^= (unsigned) __builtin_parityll(
                    bits[pivot_row * words + word] & vector[word]);
            if (parity & 1)
                vector[pivot_columns[pivot_row] / 64] |=
                    UINT64_C(1) << (pivot_columns[pivot_row] % 64);
        }
        for (size_t generator = 0; generator < columns; generator++)
            generator_coordinates[generator * *nullity + free_index] =
                (uint8_t) ((vector[generator / 64] >> (generator % 64)) & 1);
        free_index++;
    }
    flint_free(vector);
    flint_free(pivot_columns);
    flint_free(bits);
    return 1;
}

static void sagejs_rust_flint_hnf_metadata(
    const fmpz_mat_t matrix, size_t size, size_t *maximum_entry_bits,
    size_t *determinant_bits)
{
    fmpz_t determinant;
    fmpz_init_set_ui(determinant, 1);
    size_t largest = 0;
    for (size_t row = 0; row < size; row++)
    {
        fmpz_mul(determinant, determinant,
            fmpz_mat_entry(matrix, (slong) row, (slong) row));
        for (size_t column = 0; column < size; column++)
        {
            size_t bits = (size_t) fmpz_bits(fmpz_mat_entry(
                matrix, (slong) row, (slong) column));
            if (bits > largest)
                largest = bits;
        }
    }
    *maximum_entry_bits = largest;
    *determinant_bits = (size_t) fmpz_bits(determinant);
    fmpz_clear(determinant);
}

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

int sagejs_rust_flint_hnf_profile_i64(
    size_t size, const int64_t *entries, size_t *maximum_entry_bits,
    size_t *determinant_bits)
{
    if (size == 0 || maximum_entry_bits == NULL || determinant_bits == NULL)
        return -1;
    fmpz_mat_t source;
    fmpz_mat_t hermite;
    if (!sagejs_rust_flint_set_i64_matrix(source, size, size, entries))
        return -1;
    fmpz_mat_init(hermite, (slong) size, (slong) size);
    fmpz_mat_hnf(hermite, source);
    int status = 0;
    for (size_t row = 0; row < size; row++)
    {
        const fmpz *diagonal = fmpz_mat_entry(
            hermite, (slong) row, (slong) row);
        if (fmpz_is_zero(diagonal))
        {
            status = -3;
            break;
        }
    }
    if (status == 0)
        sagejs_rust_flint_hnf_metadata(
            hermite, size, maximum_entry_bits, determinant_bits);
    else
    {
        *maximum_entry_bits = 0;
        *determinant_bits = 0;
    }
    fmpz_mat_clear(hermite);
    fmpz_mat_clear(source);
    flint_cleanup();
    return status;
}

int sagejs_rust_flint_incremental_hnf_i64(
    size_t size, size_t remaining_rows, const int64_t *square_entries,
    const int64_t *remaining_entries, int64_t *basis,
    size_t *initial_maximum_entry_bits, size_t *initial_determinant_bits,
    size_t *final_maximum_entry_bits, size_t *final_determinant_bits,
    uint64_t *determinant_ns, uint64_t *initial_hnf_ns,
    uint64_t *saturation_ns)
{
    if (size == 0 || square_entries == NULL || basis == NULL ||
        initial_maximum_entry_bits == NULL || initial_determinant_bits == NULL ||
        final_maximum_entry_bits == NULL || final_determinant_bits == NULL ||
        determinant_ns == NULL || initial_hnf_ns == NULL ||
        saturation_ns == NULL ||
        (remaining_rows != 0 && remaining_entries == NULL) ||
        size > LONG_MAX || remaining_rows > LONG_MAX - size)
        return -1;
    fmpz_mat_t square;
    fmpz_mat_t initial;
    if (!sagejs_rust_flint_set_i64_matrix(
            square, size, size, square_entries))
        return -1;
    fmpz_mat_init(initial, (slong) size, (slong) size);
    uint64_t started = sagejs_rust_monotonic_ns();
    fmpz_t determinant;
    fmpz_init(determinant);
    fmpz_mat_det(determinant, square);
    uint64_t finished = sagejs_rust_monotonic_ns();
    *determinant_ns = finished >= started ? finished - started : 0;
    fmpz_abs(determinant, determinant);
    int status = fmpz_is_zero(determinant) ? -3 : 0;
    if (status == 0)
    {
        started = sagejs_rust_monotonic_ns();
        fmpz_mat_set(initial, square);
        fmpz_mat_hnf_modular_eldiv(initial, determinant);
        finished = sagejs_rust_monotonic_ns();
        *initial_hnf_ns = finished >= started ? finished - started : 0;
    }
    for (size_t row = 0; row < size; row++)
    {
        const fmpz *diagonal = fmpz_mat_entry(
            initial, (slong) row, (slong) row);
        if (fmpz_is_zero(diagonal))
        {
            status = -3;
            break;
        }
    }
    if (status == 0)
        sagejs_rust_flint_hnf_metadata(initial, size,
            initial_maximum_entry_bits, initial_determinant_bits);

    fmpz_mat_t saturated;
    fmpz_mat_init(saturated, (slong) (size + remaining_rows), (slong) size);
    if (status == 0)
    {
        for (size_t row = 0; row < size; row++)
            for (size_t column = 0; column < size; column++)
                fmpz_set(fmpz_mat_entry(saturated, (slong) row, (slong) column),
                    fmpz_mat_entry(initial, (slong) row, (slong) column));
        for (size_t row = 0; row < remaining_rows; row++)
            for (size_t column = 0; column < size; column++)
                fmpz_set_si(fmpz_mat_entry(saturated,
                        (slong) (size + row), (slong) column),
                    (slong) remaining_entries[row * size + column]);
        started = sagejs_rust_monotonic_ns();
        fmpz_mat_hnf_modular_eldiv(saturated, determinant);
        finished = sagejs_rust_monotonic_ns();
        *saturation_ns = finished >= started ? finished - started : 0;
    }

    size_t output_row = 0;
    if (status == 0)
        for (size_t row = 0; row < size + remaining_rows; row++)
        {
            int nonzero = 0;
            for (size_t column = 0; column < size; column++)
                if (!fmpz_is_zero(fmpz_mat_entry(
                        saturated, (slong) row, (slong) column)))
                {
                    nonzero = 1;
                    break;
                }
            if (!nonzero)
                continue;
            if (output_row == size)
            {
                status = -3;
                break;
            }
            for (size_t column = 0; column < size; column++)
            {
                const fmpz *entry = fmpz_mat_entry(
                    saturated, (slong) row, (slong) column);
                if (!fmpz_fits_si(entry))
                {
                    status = -2;
                    break;
                }
                basis[output_row * size + column] =
                    (int64_t) fmpz_get_si(entry);
            }
            if (status != 0)
                break;
            output_row++;
        }
    if (status == 0 && output_row != size)
        status = -3;
    if (status == 0)
        sagejs_rust_flint_hnf_metadata(saturated, size,
            final_maximum_entry_bits, final_determinant_bits);

    fmpz_mat_clear(saturated);
    fmpz_clear(determinant);
    fmpz_mat_clear(initial);
    fmpz_mat_clear(square);
    flint_cleanup();
    return status;
}

typedef struct
{
    size_t size;
    fmpz_mat_t fflu;
    fmpz_t determinant;
    slong *permutation;
    int determinant_sign;
} sagejs_rust_small_surplus_workspace;

void sagejs_rust_flint_small_surplus_workspace_free(void *opaque)
{
    if (opaque == NULL)
        return;
    sagejs_rust_small_surplus_workspace *workspace = opaque;
    fmpz_mat_clear(workspace->fflu);
    fmpz_clear(workspace->determinant);
    flint_free(workspace->permutation);
    flint_free(workspace);
    flint_cleanup();
}

int sagejs_rust_flint_small_surplus_class_order_i64(
    size_t size, size_t surplus_rows, const int64_t *square_entries,
    const int64_t *surplus_entries, mpz_ptr class_order,
    size_t *two_rank, uint8_t *class_coordinates,
    size_t class_coordinate_capacity, mpz_ptr const *dependency_entries,
    size_t dependency_capacity, size_t *determinant_bits,
    uint64_t *determinant_ns, uint64_t *solve_ns, uint64_t *kernel_ns,
    void **workspace_output)
{
    if (size == 0 || surplus_rows == 0 || square_entries == NULL ||
        surplus_entries == NULL || class_order == NULL || two_rank == NULL ||
        class_coordinates == NULL ||
        dependency_entries == NULL ||
        determinant_bits == NULL || determinant_ns == NULL ||
        solve_ns == NULL || kernel_ns == NULL || size > LONG_MAX ||
        surplus_rows > LONG_MAX || surplus_rows > SIZE_MAX - size ||
        size > SIZE_MAX / size || surplus_rows > SIZE_MAX / size ||
        surplus_rows > SIZE_MAX / (size + surplus_rows) ||
        size + surplus_rows > SIZE_MAX / size ||
        (size + surplus_rows) * size > SIZE_MAX / sizeof(int64_t) ||
        class_coordinate_capacity < size * size ||
        dependency_capacity < surplus_rows * (size + surplus_rows))
        return -1;
    int status = 0;
    fmpz_mat_t square, square_transpose, surplus_transpose, coordinates;
    if (!sagejs_rust_flint_set_i64_matrix(
            square, size, size, square_entries))
        return -1;
    fmpz_mat_init(square_transpose, (slong) size, (slong) size);
    fmpz_mat_init(surplus_transpose, (slong) size, (slong) surplus_rows);
    fmpz_mat_init(coordinates, (slong) size, (slong) surplus_rows);
    sagejs_rust_small_surplus_workspace *workspace =
        flint_malloc(sizeof(sagejs_rust_small_surplus_workspace));
    if (workspace == NULL)
    {
        fmpz_mat_clear(coordinates);
        fmpz_mat_clear(surplus_transpose);
        fmpz_mat_clear(square_transpose);
        fmpz_mat_clear(square);
        return -2;
    }
    workspace->size = size;
    fmpz_mat_init(workspace->fflu, (slong) size, (slong) size);
    fmpz_init(workspace->determinant);
    workspace->permutation = flint_malloc(size * sizeof(slong));
    if (workspace->permutation == NULL)
    {
        sagejs_rust_flint_small_surplus_workspace_free(workspace);
        fmpz_mat_clear(coordinates);
        fmpz_mat_clear(surplus_transpose);
        fmpz_mat_clear(square_transpose);
        fmpz_mat_clear(square);
        return -2;
    }
    fmpz_mat_transpose(square_transpose, square);
    for (size_t row = 0; row < surplus_rows; row++)
        for (size_t column = 0; column < size; column++)
            fmpz_set_si(fmpz_mat_entry(surplus_transpose,
                    (slong) column, (slong) row),
                (slong) surplus_entries[row * size + column]);

    fmpz_t denominator, kernel_index, quotient, remainder;
    fmpz_init(denominator);
    fmpz_init(kernel_index);
    fmpz_init(quotient);
    fmpz_init(remainder);
    uint64_t started = sagejs_rust_monotonic_ns();
    for (size_t index = 0; index < size; index++)
        workspace->permutation[index] = (slong) index;
    slong rank = fmpz_mat_fflu(
        workspace->fflu, workspace->determinant, workspace->permutation,
        square_transpose, 1);
    workspace->determinant_sign = fmpz_sgn(workspace->determinant);
    uint64_t finished = sagejs_rust_monotonic_ns();
    *determinant_ns = finished >= started ? finished - started : 0;
    fmpz_abs(workspace->determinant, workspace->determinant);
    *determinant_bits = (size_t) fmpz_bits(workspace->determinant);
    if (rank != (slong) size || fmpz_is_zero(workspace->determinant))
        status = -3;

    started = sagejs_rust_monotonic_ns();
    if (status == 0 &&
        (!fmpz_mat_solve_fflu_precomp(coordinates, workspace->permutation,
             workspace->fflu, surplus_transpose) ||
         fmpz_is_zero(workspace->determinant)))
        status = -4;
    if (status == 0 && workspace->determinant_sign < 0)
        fmpz_mat_neg(coordinates, coordinates);
    fmpz_set(denominator, workspace->determinant);
    finished = sagejs_rust_monotonic_ns();
    *solve_ns = finished >= started ? finished - started : 0;

    const size_t augmented_columns = surplus_rows + size;
    fmpz_mat_t lattice_basis, transform, next_basis, vector, saturated;
    fmpz_mat_init(lattice_basis, (slong) surplus_rows, (slong) surplus_rows);
    fmpz_mat_init(transform, (slong) surplus_rows, (slong) surplus_rows);
    fmpz_mat_init(next_basis, (slong) surplus_rows, (slong) surplus_rows);
    fmpz_mat_init(vector, (slong) surplus_rows, 1);
    fmpz_mat_init(saturated, (slong) surplus_rows, (slong) augmented_columns);
    fmpz_mat_one(lattice_basis);
    fmpz_t gcd, bezout_left, bezout_right, quotient_left, quotient_right;
    fmpz_t old_left, old_right, sum, multiplier;
    fmpz_init(gcd);
    fmpz_init(bezout_left);
    fmpz_init(bezout_right);
    fmpz_init(quotient_left);
    fmpz_init(quotient_right);
    fmpz_init(old_left);
    fmpz_init(old_right);
    fmpz_init(sum);
    fmpz_init(multiplier);

    started = sagejs_rust_monotonic_ns();
    if (status == 0)
    {
        /* Intersect Z^surplus_rows with one congruence at a time.  Every
         * update is only surplus_rows square (seven for row 6), instead of
         * constructing a (size + surplus_rows)-square rational nullspace. */
        for (size_t constraint = 0; constraint < size; constraint++)
        {
            int nonzero = 0;
            for (size_t row = 0; row < surplus_rows; row++)
            {
                fmpz_zero(sum);
                for (size_t column = 0; column < surplus_rows; column++)
                    fmpz_addmul(sum,
                        fmpz_mat_entry(lattice_basis,
                            (slong) row, (slong) column),
                        fmpz_mat_entry(coordinates,
                            (slong) constraint, (slong) column));
                fmpz_mod(fmpz_mat_entry(vector, (slong) row, 0),
                    sum, denominator);
                nonzero |= !fmpz_is_zero(
                    fmpz_mat_entry(vector, (slong) row, 0));
            }
            if (!nonzero)
                continue;

            fmpz_mat_one(transform);
            for (size_t row = 1; row < surplus_rows; row++)
            {
                const fmpz *left = fmpz_mat_entry(vector, 0, 0);
                const fmpz *right = fmpz_mat_entry(vector, (slong) row, 0);
                if (fmpz_is_zero(right))
                    continue;
                fmpz_xgcd(gcd, bezout_left, bezout_right, left, right);
                fmpz_divexact(quotient_left, left, gcd);
                fmpz_divexact(quotient_right, right, gcd);
                for (size_t column = 0; column < surplus_rows; column++)
                {
                    fmpz_set(old_left,
                        fmpz_mat_entry(transform, 0, (slong) column));
                    fmpz_set(old_right,
                        fmpz_mat_entry(transform, (slong) row,
                            (slong) column));
                    fmpz_mul(sum, bezout_left, old_left);
                    fmpz_addmul(sum, bezout_right, old_right);
                    fmpz_set(fmpz_mat_entry(transform, 0,
                        (slong) column), sum);
                    fmpz_mul(sum, quotient_left, old_right);
                    fmpz_submul(sum, quotient_right, old_left);
                    fmpz_set(fmpz_mat_entry(transform, (slong) row,
                        (slong) column), sum);
                }
                fmpz_set(fmpz_mat_entry(vector, 0, 0), gcd);
                fmpz_zero(fmpz_mat_entry(vector, (slong) row, 0));
            }
            fmpz_gcd(gcd, denominator, fmpz_mat_entry(vector, 0, 0));
            fmpz_divexact(multiplier, denominator, gcd);
            for (size_t column = 0; column < surplus_rows; column++)
                fmpz_mul(fmpz_mat_entry(transform, 0, (slong) column),
                    fmpz_mat_entry(transform, 0, (slong) column), multiplier);
            fmpz_mat_mul(next_basis, transform, lattice_basis);
            fmpz_mat_hnf(lattice_basis, next_basis);
        }

        for (size_t row = 0; row < surplus_rows; row++)
        {
            for (size_t column = 0; column < surplus_rows; column++)
                fmpz_set(fmpz_mat_entry(saturated, (slong) row,
                        (slong) column),
                    fmpz_mat_entry(lattice_basis, (slong) row,
                        (slong) column));
            for (size_t column = 0; column < size; column++)
            {
                fmpz_zero(sum);
                for (size_t index = 0; index < surplus_rows; index++)
                    fmpz_addmul(sum,
                        fmpz_mat_entry(lattice_basis, (slong) row,
                            (slong) index),
                        fmpz_mat_entry(coordinates, (slong) column,
                            (slong) index));
                fmpz_fdiv_qr(quotient, remainder, sum, denominator);
                if (!fmpz_is_zero(remainder))
                {
                    status = -5;
                    break;
                }
                fmpz_set(fmpz_mat_entry(saturated, (slong) row,
                    (slong) (surplus_rows + column)), quotient);
            }
        }
    }
    if (status == 0)
        for (size_t row = 0; row < surplus_rows && status == 0; row++)
            for (size_t column = 0; column < augmented_columns; column++)
            {
                mpz_ptr destination = dependency_entries[
                    row * augmented_columns + column];
                if (destination == NULL)
                {
                    status = -1;
                    break;
                }
                /* saturated stores (y,z) with B^T y = A^T z.  Export
                 * (-z,y), ordered as the square rows followed by the
                 * surplus rows, so each row directly annihilates [A;B]. */
                if (column < size)
                {
                    fmpz_neg(quotient,
                        fmpz_mat_entry(saturated, (slong) row,
                            (slong) (surplus_rows + column)));
                    fmpz_get_mpz(destination, quotient);
                }
                else
                    fmpz_get_mpz(destination,
                        fmpz_mat_entry(saturated, (slong) row,
                            (slong) (column - size)));
            }
    if (status == 0)
    {
        fmpz_mat_det(kernel_index, lattice_basis);
        fmpz_abs(kernel_index, kernel_index);
        if (fmpz_is_zero(kernel_index))
            status = -7;
    }
    if (status == 0)
    {
        fmpz_fdiv_qr(quotient, remainder, workspace->determinant, kernel_index);
        if (!fmpz_is_zero(remainder) || fmpz_sgn(quotient) <= 0)
            status = -8;
        else
            fmpz_get_mpz(class_order, quotient);
    }
    finished = sagejs_rust_monotonic_ns();
    *kernel_ns = finished >= started ? finished - started : 0;

    int64_t *complete_entries = flint_malloc(
        (size + surplus_rows) * size * sizeof(int64_t));
    memcpy(complete_entries, square_entries, size * size * sizeof(int64_t));
    memcpy(complete_entries + size * size, surplus_entries,
        surplus_rows * size * sizeof(int64_t));
    if (!sagejs_rust_gf2_right_nullspace_i64(size + surplus_rows, size,
            complete_entries, class_coordinates, class_coordinate_capacity,
            two_rank))
        status = -9;
    flint_free(complete_entries);

    fmpz_clear(multiplier);
    fmpz_clear(sum);
    fmpz_clear(old_right);
    fmpz_clear(old_left);
    fmpz_clear(quotient_right);
    fmpz_clear(quotient_left);
    fmpz_clear(bezout_right);
    fmpz_clear(bezout_left);
    fmpz_clear(gcd);
    fmpz_mat_clear(saturated);
    fmpz_mat_clear(vector);
    fmpz_mat_clear(next_basis);
    fmpz_mat_clear(transform);
    fmpz_mat_clear(lattice_basis);
    fmpz_clear(remainder);
    fmpz_clear(quotient);
    fmpz_clear(kernel_index);
    fmpz_clear(denominator);
    fmpz_mat_clear(coordinates);
    fmpz_mat_clear(surplus_transpose);
    fmpz_mat_clear(square_transpose);
    fmpz_mat_clear(square);
    if (workspace_output != NULL && status == 0)
        *workspace_output = workspace;
    else
        sagejs_rust_flint_small_surplus_workspace_free(workspace);
    return status;
}

int sagejs_rust_flint_small_surplus_relation_witnesses_i64(
    size_t size, size_t surplus_rows, const int64_t *square_entries,
    const int64_t *surplus_entries, size_t target_count,
    const int64_t *targets, mpz_ptr const *witnesses,
    size_t *maximum_coefficient_bits, size_t *nonzero_counts,
    uint64_t *solve_ns, uint64_t *affine_kernel_ns,
    void *workspace_input)
{
    if (size == 0 || surplus_rows == 0 || target_count == 0 ||
        square_entries == NULL || surplus_entries == NULL || targets == NULL ||
        witnesses == NULL || maximum_coefficient_bits == NULL ||
        nonzero_counts == NULL || solve_ns == NULL || affine_kernel_ns == NULL ||
        size > LONG_MAX || surplus_rows > LONG_MAX || target_count > LONG_MAX ||
        surplus_rows == SIZE_MAX || size > SIZE_MAX / size ||
        surplus_rows > SIZE_MAX / size || target_count > SIZE_MAX / size ||
        target_count > SIZE_MAX / (size + surplus_rows))
        return -1;

    int status = 0;
    sagejs_rust_small_surplus_workspace *workspace = workspace_input;
    if (workspace != NULL && workspace->size != size)
        return -1;
    const int owns_factorization = workspace == NULL;
    const size_t right_columns = surplus_rows + target_count;
    const size_t relation_count = size + surplus_rows;
    fmpz_mat_t square, square_transpose, right, solutions, fflu;
    if (owns_factorization)
    {
        if (!sagejs_rust_flint_set_i64_matrix(
                square, size, size, square_entries))
            return -1;
        fmpz_mat_init(square_transpose, (slong) size, (slong) size);
        fmpz_mat_transpose(square_transpose, square);
        fmpz_mat_init(fflu, (slong) size, (slong) size);
    }
    fmpz_mat_init(right, (slong) size, (slong) right_columns);
    fmpz_mat_init(solutions, (slong) size, (slong) right_columns);
    for (size_t row = 0; row < surplus_rows; row++)
        for (size_t column = 0; column < size; column++)
            fmpz_set_si(fmpz_mat_entry(right, (slong) column, (slong) row),
                (slong) surplus_entries[row * size + column]);
    for (size_t target = 0; target < target_count; target++)
        for (size_t column = 0; column < size; column++)
            fmpz_set_si(fmpz_mat_entry(right, (slong) column,
                    (slong) (surplus_rows + target)),
                (slong) targets[target * size + column]);

    fmpz_t determinant, remainder, sum, gcd, bezout_left, bezout_right;
    fmpz_t quotient_left, quotient_right, old_left, old_right, multiplier;
    fmpz_init(determinant);
    fmpz_init(remainder);
    fmpz_init(sum);
    fmpz_init(gcd);
    fmpz_init(bezout_left);
    fmpz_init(bezout_right);
    fmpz_init(quotient_left);
    fmpz_init(quotient_right);
    fmpz_init(old_left);
    fmpz_init(old_right);
    fmpz_init(multiplier);
    slong *permutation = NULL;
    uint64_t started = sagejs_rust_monotonic_ns();
    if (owns_factorization)
    {
        permutation = flint_malloc(size * sizeof(slong));
        if (permutation == NULL)
            status = -2;
        for (size_t index = 0; index < size && status == 0; index++)
            permutation[index] = (slong) index;
        slong rank = status == 0
            ? fmpz_mat_fflu(fflu, determinant, permutation,
                square_transpose, 1)
            : 0;
        const int determinant_sign = fmpz_sgn(determinant);
        if (status == 0 &&
            (rank != (slong) size || fmpz_is_zero(determinant)))
            status = -3;
        if (status == 0 && !fmpz_mat_solve_fflu_precomp(
                solutions, permutation, fflu, right))
            status = -4;
        if (status == 0 && determinant_sign < 0)
            fmpz_mat_neg(solutions, solutions);
        fmpz_abs(determinant, determinant);
    }
    else
    {
        fmpz_set(determinant, workspace->determinant);
        if (!fmpz_mat_solve_fflu_precomp(solutions,
                workspace->permutation, workspace->fflu, right))
            status = -4;
        if (status == 0 && workspace->determinant_sign < 0)
            fmpz_mat_neg(solutions, solutions);
    }
    uint64_t finished = sagejs_rust_monotonic_ns();
    *solve_ns = finished >= started ? finished - started : 0;

    const size_t affine_dimension = surplus_rows + 1;
    fmpz_mat_t lattice_basis, transform, next_basis, vector;
    fmpz_mat_init(lattice_basis, (slong) affine_dimension,
        (slong) affine_dimension);
    fmpz_mat_init(transform, (slong) affine_dimension,
        (slong) affine_dimension);
    fmpz_mat_init(next_basis, (slong) affine_dimension,
        (slong) affine_dimension);
    fmpz_mat_init(vector, (slong) affine_dimension, 1);
    started = sagejs_rust_monotonic_ns();
    *maximum_coefficient_bits = 0;
    for (size_t target = 0; target < target_count && status == 0; target++)
    {
        fmpz_mat_one(lattice_basis);
        for (size_t constraint = 0; constraint < size; constraint++)
        {
            int nonzero = 0;
            for (size_t row = 0; row < affine_dimension; row++)
            {
                fmpz_zero(sum);
                for (size_t column = 0; column < affine_dimension; column++)
                {
                    const fmpz *congruence = column < surplus_rows
                        ? fmpz_mat_entry(solutions, (slong) constraint,
                            (slong) column)
                        : fmpz_mat_entry(solutions, (slong) constraint,
                            (slong) (surplus_rows + target));
                    if (column < surplus_rows)
                        fmpz_addmul(sum,
                            fmpz_mat_entry(lattice_basis, (slong) row,
                                (slong) column), congruence);
                    else
                        fmpz_submul(sum,
                            fmpz_mat_entry(lattice_basis, (slong) row,
                                (slong) column), congruence);
                }
                fmpz_mod(fmpz_mat_entry(vector, (slong) row, 0),
                    sum, determinant);
                nonzero |= !fmpz_is_zero(
                    fmpz_mat_entry(vector, (slong) row, 0));
            }
            if (!nonzero)
                continue;

            fmpz_mat_one(transform);
            for (size_t row = 1; row < affine_dimension; row++)
            {
                const fmpz *left = fmpz_mat_entry(vector, 0, 0);
                const fmpz *right_entry =
                    fmpz_mat_entry(vector, (slong) row, 0);
                if (fmpz_is_zero(right_entry))
                    continue;
                fmpz_xgcd(gcd, bezout_left, bezout_right, left, right_entry);
                fmpz_divexact(quotient_left, left, gcd);
                fmpz_divexact(quotient_right, right_entry, gcd);
                for (size_t column = 0; column < affine_dimension; column++)
                {
                    fmpz_set(old_left,
                        fmpz_mat_entry(transform, 0, (slong) column));
                    fmpz_set(old_right,
                        fmpz_mat_entry(transform, (slong) row,
                            (slong) column));
                    fmpz_mul(sum, bezout_left, old_left);
                    fmpz_addmul(sum, bezout_right, old_right);
                    fmpz_set(fmpz_mat_entry(transform, 0,
                        (slong) column), sum);
                    fmpz_mul(sum, quotient_left, old_right);
                    fmpz_submul(sum, quotient_right, old_left);
                    fmpz_set(fmpz_mat_entry(transform, (slong) row,
                        (slong) column), sum);
                }
                fmpz_set(fmpz_mat_entry(vector, 0, 0), gcd);
                fmpz_zero(fmpz_mat_entry(vector, (slong) row, 0));
            }
            fmpz_gcd(gcd, determinant, fmpz_mat_entry(vector, 0, 0));
            fmpz_divexact(multiplier, determinant, gcd);
            for (size_t column = 0; column < affine_dimension; column++)
                fmpz_mul(fmpz_mat_entry(transform, 0, (slong) column),
                    fmpz_mat_entry(transform, 0, (slong) column), multiplier);
            fmpz_mat_mul(next_basis, transform, lattice_basis);
            fmpz_mat_hnf(lattice_basis, next_basis);
        }

        /* HNF need not expose a vector whose final coordinate is one as a
         * basis row.  Compute a Bezout combination of that final column;
         * target membership is exactly the assertion that its gcd is one. */
        fmpz_mat_one(transform);
        for (size_t row = 0; row < affine_dimension; row++)
            fmpz_set(fmpz_mat_entry(vector, (slong) row, 0),
                fmpz_mat_entry(lattice_basis, (slong) row,
                    (slong) surplus_rows));
        for (size_t row = 1; row < affine_dimension; row++)
        {
            const fmpz *left = fmpz_mat_entry(vector, 0, 0);
            const fmpz *right_entry =
                fmpz_mat_entry(vector, (slong) row, 0);
            if (fmpz_is_zero(right_entry))
                continue;
            fmpz_xgcd(gcd, bezout_left, bezout_right, left, right_entry);
            fmpz_divexact(quotient_left, left, gcd);
            fmpz_divexact(quotient_right, right_entry, gcd);
            for (size_t column = 0; column < affine_dimension; column++)
            {
                fmpz_set(old_left,
                    fmpz_mat_entry(transform, 0, (slong) column));
                fmpz_set(old_right,
                    fmpz_mat_entry(transform, (slong) row, (slong) column));
                fmpz_mul(sum, bezout_left, old_left);
                fmpz_addmul(sum, bezout_right, old_right);
                fmpz_set(fmpz_mat_entry(transform, 0, (slong) column), sum);
                fmpz_mul(sum, quotient_left, old_right);
                fmpz_submul(sum, quotient_right, old_left);
                fmpz_set(fmpz_mat_entry(transform, (slong) row,
                    (slong) column), sum);
            }
            fmpz_set(fmpz_mat_entry(vector, 0, 0), gcd);
            fmpz_zero(fmpz_mat_entry(vector, (slong) row, 0));
        }
        fmpz_mat_mul(next_basis, transform, lattice_basis);
        const fmpz *last = fmpz_mat_entry(next_basis, 0,
            (slong) surplus_rows);
        if (!fmpz_is_one(last) && !fmpz_equal_si(last, -1))
        {
            status = -10;
            break;
        }
        const int solution_sign = fmpz_sgn(last);

        nonzero_counts[target] = 0;
        for (size_t column = 0; column < size; column++)
        {
            fmpz_set(sum, fmpz_mat_entry(solutions, (slong) column,
                (slong) (surplus_rows + target)));
            for (size_t row = 0; row < surplus_rows; row++)
            {
                fmpz_set(multiplier, fmpz_mat_entry(next_basis,
                    0, (slong) row));
                if (solution_sign < 0)
                    fmpz_neg(multiplier, multiplier);
                fmpz_submul(sum, fmpz_mat_entry(solutions,
                    (slong) column, (slong) row), multiplier);
            }
            fmpz_fdiv_qr(multiplier, remainder, sum, determinant);
            if (!fmpz_is_zero(remainder))
            {
                status = -5;
                break;
            }
            fmpz_get_mpz(witnesses[target * relation_count + column],
                multiplier);
        }
        for (size_t row = 0; row < surplus_rows && status == 0; row++)
        {
            fmpz_set(multiplier, fmpz_mat_entry(next_basis,
                0, (slong) row));
            if (solution_sign < 0)
                fmpz_neg(multiplier, multiplier);
            fmpz_get_mpz(witnesses[target * relation_count + size + row],
                multiplier);
        }

        for (size_t relation = 0; relation < relation_count && status == 0;
             relation++)
        {
            mpz_srcptr coefficient =
                witnesses[target * relation_count + relation];
            if (coefficient == NULL)
            {
                status = -1;
                break;
            }
            fmpz_set_mpz(multiplier, coefficient);
            if (!fmpz_is_zero(multiplier))
            {
                nonzero_counts[target]++;
                size_t bits = (size_t) fmpz_bits(multiplier);
                if (bits > *maximum_coefficient_bits)
                    *maximum_coefficient_bits = bits;
            }
        }
        for (size_t column = 0; column < size && status == 0; column++)
        {
            fmpz_zero(sum);
            for (size_t relation = 0; relation < relation_count; relation++)
            {
                fmpz_set_mpz(multiplier,
                    witnesses[target * relation_count + relation]);
                int64_t entry = relation < size
                    ? square_entries[relation * size + column]
                    : surplus_entries[(relation - size) * size + column];
                fmpz_addmul_si(sum, multiplier, (slong) entry);
            }
            if (fmpz_cmp_si(sum,
                    (slong) targets[target * size + column]) != 0)
                status = -6;
        }
    }
    finished = sagejs_rust_monotonic_ns();
    *affine_kernel_ns = finished >= started ? finished - started : 0;

    fmpz_mat_clear(vector);
    fmpz_mat_clear(next_basis);
    fmpz_mat_clear(transform);
    fmpz_mat_clear(lattice_basis);
    if (owns_factorization)
        flint_free(permutation);
    fmpz_clear(multiplier);
    fmpz_clear(old_right);
    fmpz_clear(old_left);
    fmpz_clear(quotient_right);
    fmpz_clear(quotient_left);
    fmpz_clear(bezout_right);
    fmpz_clear(bezout_left);
    fmpz_clear(gcd);
    fmpz_clear(sum);
    fmpz_clear(remainder);
    fmpz_clear(determinant);
    if (owns_factorization)
        fmpz_mat_clear(fflu);
    fmpz_mat_clear(solutions);
    fmpz_mat_clear(right);
    if (owns_factorization)
    {
        fmpz_mat_clear(square_transpose);
        fmpz_mat_clear(square);
        flint_cleanup();
    }
    return status;
}

int sagejs_rust_flint_lll_columns_mpz(
    mpz_srcptr const *entries, int64_t *transform)
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
            mpz_srcptr entry = entries[column * 3 + row];
            if (entry == NULL)
            {
                fmpz_mat_clear(left_transform);
                fmpz_mat_clear(basis);
                return -1;
            }
            fmpz_set_mpz(
                fmpz_mat_entry(basis, (slong) row, (slong) column), entry);
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
    /* This is a hot per-ideal boundary. FLINT cleanup releases thread caches
     * and belongs at the end of a computation, not after every 3x3 LLL call.
     * The later one-shot normal-form boundary performs cleanup. */
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

int sagejs_rust_flint_relation_witnesses_i64(
    size_t rows, size_t columns, const int64_t *entries,
    size_t target_count, const int64_t *targets, mpz_ptr const *witnesses,
    size_t *maximum_coefficient_bits, size_t *nonzero_counts,
    uint64_t *hnf_ns, uint64_t *solve_ns)
{
    if (rows < columns || columns == 0 || entries == NULL ||
        target_count == 0 || targets == NULL || witnesses == NULL ||
        maximum_coefficient_bits == NULL || nonzero_counts == NULL ||
        hnf_ns == NULL || solve_ns == NULL || rows > LONG_MAX ||
        columns > LONG_MAX || target_count > LONG_MAX ||
        rows > SIZE_MAX / columns || target_count > SIZE_MAX / columns ||
        target_count > SIZE_MAX / rows)
        return -1;

    fmpz_mat_t source;
    fmpz_mat_t hermite;
    fmpz_mat_t transform;
    if (!sagejs_rust_flint_set_i64_matrix(source, rows, columns, entries))
        return -1;
    fmpz_mat_init(hermite, (slong) rows, (slong) columns);
    fmpz_mat_init(transform, (slong) rows, (slong) rows);
    uint64_t started = sagejs_rust_monotonic_ns();
    fmpz_mat_hnf_transform(hermite, transform, source);
    uint64_t finished = sagejs_rust_monotonic_ns();
    *hnf_ns = finished >= started ? finished - started : 0;

    size_t *basis_rows = flint_malloc(columns * sizeof(size_t));
    size_t basis_count = 0;
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
        if (nonzero)
        {
            if (basis_count == columns)
            {
                basis_count++;
                break;
            }
            basis_rows[basis_count++] = row;
        }
    }

    int status = basis_count == columns ? 0 : -3;
    fmpz_mat_t basis_transpose;
    fmpz_mat_t target_transpose;
    fmpz_mat_t solution;
    fmpz_mat_init(basis_transpose, (slong) columns, (slong) columns);
    fmpz_mat_init(target_transpose, (slong) columns, (slong) target_count);
    fmpz_mat_init(solution, (slong) columns, (slong) target_count);
    if (status == 0)
    {
        for (size_t row = 0; row < columns; row++)
            for (size_t column = 0; column < columns; column++)
                fmpz_set(fmpz_mat_entry(basis_transpose,
                        (slong) column, (slong) row),
                    fmpz_mat_entry(hermite, (slong) basis_rows[row],
                        (slong) column));
        for (size_t target = 0; target < target_count; target++)
            for (size_t column = 0; column < columns; column++)
                fmpz_set_si(fmpz_mat_entry(target_transpose,
                        (slong) column, (slong) target),
                    (slong) targets[target * columns + column]);
    }

    fmpz_t denominator;
    fmpz_t remainder;
    fmpz_t coefficient;
    fmpz_t check;
    fmpz_init(denominator);
    fmpz_init(remainder);
    fmpz_init(coefficient);
    fmpz_init(check);
    if (status == 0)
    {
        started = sagejs_rust_monotonic_ns();
        if (!fmpz_mat_solve(
                solution, denominator, basis_transpose, target_transpose) ||
            fmpz_is_zero(denominator))
            status = -4;
        finished = sagejs_rust_monotonic_ns();
        *solve_ns = finished >= started ? finished - started : 0;
    }

    if (status == 0)
        for (size_t row = 0; row < columns && status == 0; row++)
            for (size_t target = 0; target < target_count; target++)
            {
                fmpz_mod(remainder,
                    fmpz_mat_entry(solution, (slong) row, (slong) target),
                    denominator);
                if (!fmpz_is_zero(remainder))
                {
                    status = -5;
                    break;
                }
                fmpz_divexact(
                    fmpz_mat_entry(solution, (slong) row, (slong) target),
                    fmpz_mat_entry(solution, (slong) row, (slong) target),
                    denominator);
            }

    *maximum_coefficient_bits = 0;
    for (size_t target = 0; target < target_count; target++)
        nonzero_counts[target] = 0;
    if (status == 0)
        for (size_t target = 0; target < target_count && status == 0; target++)
            for (size_t relation = 0; relation < rows; relation++)
            {
                fmpz_zero(coefficient);
                for (size_t basis_row = 0; basis_row < columns; basis_row++)
                    fmpz_addmul(coefficient,
                        fmpz_mat_entry(solution, (slong) basis_row,
                            (slong) target),
                        fmpz_mat_entry(transform,
                            (slong) basis_rows[basis_row],
                            (slong) relation));
                mpz_ptr output = witnesses[target * rows + relation];
                if (output == NULL)
                {
                    status = -1;
                    break;
                }
                fmpz_get_mpz(output, coefficient);
                if (!fmpz_is_zero(coefficient))
                {
                    nonzero_counts[target]++;
                    size_t bits = (size_t) fmpz_bits(coefficient);
                    if (bits > *maximum_coefficient_bits)
                        *maximum_coefficient_bits = bits;
                }
            }

    /* Verify the exported coefficients against the original relation matrix
       before releasing the FLINT-owned transform. */
    if (status == 0)
        for (size_t target = 0; target < target_count && status == 0; target++)
            for (size_t column = 0; column < columns; column++)
            {
                fmpz_zero(check);
                for (size_t relation = 0; relation < rows; relation++)
                {
                    fmpz_set_mpz(coefficient,
                        witnesses[target * rows + relation]);
                    fmpz_addmul_si(check, coefficient,
                        (slong) entries[relation * columns + column]);
                }
                if (fmpz_cmp_si(check,
                        (slong) targets[target * columns + column]) != 0)
                    status = -6;
            }

    fmpz_clear(check);
    fmpz_clear(coefficient);
    fmpz_clear(remainder);
    fmpz_clear(denominator);
    fmpz_mat_clear(solution);
    fmpz_mat_clear(target_transpose);
    fmpz_mat_clear(basis_transpose);
    flint_free(basis_rows);
    fmpz_mat_clear(transform);
    fmpz_mat_clear(hermite);
    fmpz_mat_clear(source);
    flint_cleanup();
    return status;
}

int sagejs_rust_flint_staged_relation_witnesses_i64(
    size_t size, size_t remaining_rows, const int64_t *square_entries,
    const int64_t *remaining_entries, size_t target_count,
    const int64_t *targets, mpz_ptr const *witnesses,
    size_t *maximum_coefficient_bits, size_t *nonzero_counts,
    uint64_t *initial_hnf_ns, uint64_t *saturation_transform_ns,
    uint64_t *target_solve_ns, uint64_t *square_solve_ns)
{
    if (size == 0 || square_entries == NULL || target_count == 0 ||
        targets == NULL || witnesses == NULL ||
        maximum_coefficient_bits == NULL || nonzero_counts == NULL ||
        initial_hnf_ns == NULL || saturation_transform_ns == NULL ||
        target_solve_ns == NULL || square_solve_ns == NULL ||
        (remaining_rows != 0 && remaining_entries == NULL) ||
        size > LONG_MAX || remaining_rows > LONG_MAX - size ||
        target_count > LONG_MAX)
        return -1;
    const size_t rows = size + remaining_rows;

    fmpz_mat_t square;
    fmpz_mat_t initial;
    if (!sagejs_rust_flint_set_i64_matrix(square, size, size, square_entries))
        return -1;
    fmpz_mat_init(initial, (slong) size, (slong) size);
    fmpz_t determinant;
    fmpz_init(determinant);
    fmpz_mat_det(determinant, square);
    fmpz_abs(determinant, determinant);
    int status = fmpz_is_zero(determinant) ? -3 : 0;
    uint64_t started = sagejs_rust_monotonic_ns();
    if (status == 0)
    {
        fmpz_mat_set(initial, square);
        fmpz_mat_hnf_modular_eldiv(initial, determinant);
    }
    uint64_t finished = sagejs_rust_monotonic_ns();
    *initial_hnf_ns = finished >= started ? finished - started : 0;

    fmpz_mat_t augmented;
    fmpz_mat_t hermite;
    fmpz_mat_t transform;
    fmpz_mat_init(augmented, (slong) rows, (slong) size);
    fmpz_mat_init(hermite, (slong) rows, (slong) size);
    fmpz_mat_init(transform, (slong) rows, (slong) rows);
    if (status == 0)
    {
        for (size_t row = 0; row < size; row++)
            for (size_t column = 0; column < size; column++)
                fmpz_set(fmpz_mat_entry(augmented, (slong) row,
                        (slong) column),
                    fmpz_mat_entry(initial, (slong) row, (slong) column));
        for (size_t row = 0; row < remaining_rows; row++)
            for (size_t column = 0; column < size; column++)
                fmpz_set_si(fmpz_mat_entry(augmented,
                        (slong) (size + row), (slong) column),
                    (slong) remaining_entries[row * size + column]);
        started = sagejs_rust_monotonic_ns();
        fmpz_mat_hnf_transform(hermite, transform, augmented);
        finished = sagejs_rust_monotonic_ns();
        *saturation_transform_ns = finished >= started ? finished - started : 0;
    }

    size_t *basis_rows = flint_malloc(size * sizeof(size_t));
    size_t basis_count = 0;
    if (status == 0)
        for (size_t row = 0; row < rows; row++)
        {
            int nonzero = 0;
            for (size_t column = 0; column < size; column++)
                if (!fmpz_is_zero(fmpz_mat_entry(
                        hermite, (slong) row, (slong) column)))
                {
                    nonzero = 1;
                    break;
                }
            if (nonzero)
            {
                if (basis_count == size)
                {
                    basis_count++;
                    break;
                }
                basis_rows[basis_count++] = row;
            }
        }
    if (status == 0 && basis_count != size)
        status = -3;

    fmpz_mat_t basis_transpose;
    fmpz_mat_t target_transpose;
    fmpz_mat_t target_solution;
    fmpz_mat_init(basis_transpose, (slong) size, (slong) size);
    fmpz_mat_init(target_transpose, (slong) size, (slong) target_count);
    fmpz_mat_init(target_solution, (slong) size, (slong) target_count);
    if (status == 0)
    {
        for (size_t row = 0; row < size; row++)
            for (size_t column = 0; column < size; column++)
                fmpz_set(fmpz_mat_entry(basis_transpose,
                        (slong) column, (slong) row),
                    fmpz_mat_entry(hermite, (slong) basis_rows[row],
                        (slong) column));
        for (size_t target = 0; target < target_count; target++)
            for (size_t column = 0; column < size; column++)
                fmpz_set_si(fmpz_mat_entry(target_transpose,
                        (slong) column, (slong) target),
                    (slong) targets[target * size + column]);
    }
    fmpz_t denominator;
    fmpz_t remainder;
    fmpz_t check;
    fmpz_init(denominator);
    fmpz_init(remainder);
    fmpz_init(check);
    if (status == 0)
    {
        started = sagejs_rust_monotonic_ns();
        if (!fmpz_mat_solve(target_solution, denominator,
                basis_transpose, target_transpose) ||
            fmpz_is_zero(denominator))
            status = -4;
        finished = sagejs_rust_monotonic_ns();
        *target_solve_ns = finished >= started ? finished - started : 0;
    }
    if (status == 0)
        for (size_t row = 0; row < size && status == 0; row++)
            for (size_t target = 0; target < target_count; target++)
            {
                fmpz_mod(remainder, fmpz_mat_entry(target_solution,
                    (slong) row, (slong) target), denominator);
                if (!fmpz_is_zero(remainder))
                {
                    status = -5;
                    break;
                }
                fmpz_divexact(fmpz_mat_entry(target_solution,
                        (slong) row, (slong) target),
                    fmpz_mat_entry(target_solution,
                        (slong) row, (slong) target), denominator);
            }

    fmpz_mat_t augmented_weights;
    fmpz_mat_init(augmented_weights, (slong) target_count, (slong) rows);
    if (status == 0)
        for (size_t target = 0; target < target_count; target++)
            for (size_t row = 0; row < rows; row++)
                for (size_t basis_row = 0; basis_row < size; basis_row++)
                    fmpz_addmul(fmpz_mat_entry(augmented_weights,
                            (slong) target, (slong) row),
                        fmpz_mat_entry(target_solution,
                            (slong) basis_row, (slong) target),
                        fmpz_mat_entry(transform,
                            (slong) basis_rows[basis_row], (slong) row));

    fmpz_mat_t square_rhs;
    fmpz_mat_t square_solution;
    fmpz_mat_t square_transpose;
    fmpz_mat_init(square_rhs, (slong) size, (slong) target_count);
    fmpz_mat_init(square_solution, (slong) size, (slong) target_count);
    fmpz_mat_init(square_transpose, (slong) size, (slong) size);
    if (status == 0)
    {
        fmpz_mat_transpose(square_transpose, square);
        for (size_t target = 0; target < target_count; target++)
            for (size_t column = 0; column < size; column++)
                for (size_t row = 0; row < size; row++)
                    fmpz_addmul(fmpz_mat_entry(square_rhs,
                            (slong) column, (slong) target),
                        fmpz_mat_entry(augmented_weights,
                            (slong) target, (slong) row),
                        fmpz_mat_entry(initial,
                            (slong) row, (slong) column));
        started = sagejs_rust_monotonic_ns();
        if (!fmpz_mat_solve(square_solution, denominator,
                square_transpose, square_rhs) ||
            fmpz_is_zero(denominator))
            status = -4;
        finished = sagejs_rust_monotonic_ns();
        *square_solve_ns = finished >= started ? finished - started : 0;
    }
    if (status == 0)
        for (size_t row = 0; row < size && status == 0; row++)
            for (size_t target = 0; target < target_count; target++)
            {
                fmpz_mod(remainder, fmpz_mat_entry(square_solution,
                    (slong) row, (slong) target), denominator);
                if (!fmpz_is_zero(remainder))
                {
                    status = -5;
                    break;
                }
                fmpz_divexact(fmpz_mat_entry(square_solution,
                        (slong) row, (slong) target),
                    fmpz_mat_entry(square_solution,
                        (slong) row, (slong) target), denominator);
            }

    *maximum_coefficient_bits = 0;
    for (size_t target = 0; target < target_count; target++)
        nonzero_counts[target] = 0;
    if (status == 0)
        for (size_t target = 0; target < target_count && status == 0; target++)
            for (size_t row = 0; row < rows; row++)
            {
                const fmpz *coefficient = row < size
                    ? fmpz_mat_entry(square_solution, (slong) row,
                        (slong) target)
                    : fmpz_mat_entry(augmented_weights, (slong) target,
                        (slong) row);
                mpz_ptr output = witnesses[target * rows + row];
                if (output == NULL)
                {
                    status = -1;
                    break;
                }
                fmpz_get_mpz(output, coefficient);
                if (!fmpz_is_zero(coefficient))
                {
                    nonzero_counts[target]++;
                    size_t bits = (size_t) fmpz_bits(coefficient);
                    if (bits > *maximum_coefficient_bits)
                        *maximum_coefficient_bits = bits;
                }
            }

    if (status == 0)
        for (size_t target = 0; target < target_count && status == 0; target++)
            for (size_t column = 0; column < size; column++)
            {
                fmpz_zero(check);
                for (size_t row = 0; row < size; row++)
                    fmpz_addmul_si(check,
                        fmpz_mat_entry(square_solution,
                            (slong) row, (slong) target),
                        (slong) square_entries[row * size + column]);
                for (size_t row = 0; row < remaining_rows; row++)
                    fmpz_addmul_si(check,
                        fmpz_mat_entry(augmented_weights,
                            (slong) target, (slong) (size + row)),
                        (slong) remaining_entries[row * size + column]);
                if (fmpz_cmp_si(check,
                        (slong) targets[target * size + column]) != 0)
                    status = -6;
            }

    fmpz_mat_clear(square_transpose);
    fmpz_mat_clear(square_solution);
    fmpz_mat_clear(square_rhs);
    fmpz_mat_clear(augmented_weights);
    fmpz_clear(check);
    fmpz_clear(remainder);
    fmpz_clear(denominator);
    fmpz_mat_clear(target_solution);
    fmpz_mat_clear(target_transpose);
    fmpz_mat_clear(basis_transpose);
    flint_free(basis_rows);
    fmpz_mat_clear(transform);
    fmpz_mat_clear(hermite);
    fmpz_mat_clear(augmented);
    fmpz_clear(determinant);
    fmpz_mat_clear(initial);
    fmpz_mat_clear(square);
    flint_cleanup();
    return status;
}

int sagejs_rust_flint_left_kernel_i64(
    size_t rows, size_t columns, const int64_t *entries,
    size_t kernel_capacity, mpz_ptr const *kernel_entries,
    size_t *kernel_rank, size_t *maximum_coefficient_bits,
    size_t *nonzero_counts, uint64_t *kernel_ns)
{
    if (rows < columns || columns == 0 || entries == NULL ||
        kernel_capacity == 0 || kernel_entries == NULL ||
        kernel_rank == NULL || maximum_coefficient_bits == NULL ||
        nonzero_counts == NULL || kernel_ns == NULL || rows > LONG_MAX ||
        columns > LONG_MAX || kernel_capacity > rows)
        return -1;

    fmpz_mat_t transpose;
    fmpz_mat_init(transpose, (slong) columns, (slong) rows);
    for (size_t row = 0; row < rows; row++)
        for (size_t column = 0; column < columns; column++)
            fmpz_set_si(fmpz_mat_entry(transpose,
                    (slong) column, (slong) row),
                (slong) entries[row * columns + column]);

    uint64_t started = sagejs_rust_monotonic_ns();
    fmpz_mat_t nullspace_columns;
    fmpz_mat_init(nullspace_columns, (slong) rows, (slong) rows);
    const slong nullity = fmpz_mat_nullspace(nullspace_columns, transpose);
    int status = nullity < 0 || (size_t) nullity > kernel_capacity ? -7 : 0;

    fmpz_mat_t basis;
    fmpz_mat_t basis_transpose;
    fmpz_mat_t hermite_transpose;
    fmpz_mat_t lattice_basis;
    fmpz_mat_t saturated;
    fmpz_mat_init(basis, nullity, (slong) rows);
    fmpz_mat_init(basis_transpose, (slong) rows, nullity);
    fmpz_mat_init(hermite_transpose, (slong) rows, nullity);
    fmpz_mat_init(lattice_basis, nullity, nullity);
    fmpz_mat_init(saturated, nullity, (slong) rows);
    if (status == 0)
    {
        for (slong row = 0; row < nullity; row++)
            for (size_t column = 0; column < rows; column++)
                fmpz_set(fmpz_mat_entry(basis, row, (slong) column),
                    fmpz_mat_entry(nullspace_columns,
                        (slong) column, row));
        fmpz_mat_transpose(basis_transpose, basis);
        fmpz_mat_hnf(hermite_transpose, basis_transpose);
        for (slong row = 0; row < nullity; row++)
            for (slong column = 0; column < nullity; column++)
                fmpz_set(fmpz_mat_entry(lattice_basis, row, column),
                    fmpz_mat_entry(hermite_transpose, column, row));
    }

    fmpz_t denominator;
    fmpz_t remainder;
    fmpz_t check;
    fmpz_init(denominator);
    fmpz_init(remainder);
    fmpz_init(check);
    if (status == 0 && nullity != 0)
    {
        if (!fmpz_mat_solve(
                saturated, denominator, lattice_basis, basis) ||
            fmpz_is_zero(denominator))
            status = -4;
    }
    if (status == 0)
        for (slong row = 0; row < nullity && status == 0; row++)
            for (size_t column = 0; column < rows; column++)
            {
                fmpz_mod(remainder,
                    fmpz_mat_entry(saturated, row, (slong) column),
                    denominator);
                if (!fmpz_is_zero(remainder))
                {
                    status = -5;
                    break;
                }
                fmpz_divexact(fmpz_mat_entry(saturated,
                        row, (slong) column),
                    fmpz_mat_entry(saturated, row, (slong) column),
                    denominator);
            }
    if (status == 0 && nullity != 0)
        fmpz_mat_hnf(basis, saturated);
    uint64_t finished = sagejs_rust_monotonic_ns();
    *kernel_ns = finished >= started ? finished - started : 0;

    *kernel_rank = status == 0 ? (size_t) nullity : 0;
    *maximum_coefficient_bits = 0;
    for (size_t row = 0; row < kernel_capacity; row++)
        nonzero_counts[row] = 0;
    if (status == 0)
        for (slong kernel_row = 0; kernel_row < nullity; kernel_row++)
            for (size_t relation = 0; relation < rows; relation++)
            {
                const fmpz *coefficient = fmpz_mat_entry(
                    basis, kernel_row, (slong) relation);
                mpz_ptr output = kernel_entries[
                    (size_t) kernel_row * rows + relation];
                if (output == NULL)
                {
                    status = -1;
                    break;
                }
                fmpz_get_mpz(output, coefficient);
                if (!fmpz_is_zero(coefficient))
                {
                    nonzero_counts[kernel_row]++;
                    size_t bits = (size_t) fmpz_bits(coefficient);
                    if (bits > *maximum_coefficient_bits)
                        *maximum_coefficient_bits = bits;
                }
            }

    if (status == 0)
        for (slong kernel_row = 0;
             kernel_row < nullity && status == 0; kernel_row++)
            for (size_t column = 0; column < columns; column++)
            {
                fmpz_zero(check);
                for (size_t relation = 0; relation < rows; relation++)
                    fmpz_addmul_si(check,
                        fmpz_mat_entry(basis,
                            kernel_row, (slong) relation),
                        (slong) entries[relation * columns + column]);
                if (!fmpz_is_zero(check))
                    status = -6;
            }

    fmpz_clear(check);
    fmpz_clear(remainder);
    fmpz_clear(denominator);
    fmpz_mat_clear(saturated);
    fmpz_mat_clear(lattice_basis);
    fmpz_mat_clear(hermite_transpose);
    fmpz_mat_clear(basis_transpose);
    fmpz_mat_clear(basis);
    fmpz_mat_clear(nullspace_columns);
    fmpz_mat_clear(transpose);
    flint_cleanup();
    return status;
}

static int sagejs_rust_cubic_callback(
    arb_ptr output, const arb_t input, void *parameter, slong order, slong prec)
{
    const int64_t *polynomial = (const int64_t *) parameter;
    if (order > 0)
    {
        arb_set_si(output + 0, (slong) polynomial[3]);
        arb_mul(output + 0, output + 0, input, prec);
        arb_add_si(output + 0, output + 0, (slong) polynomial[2], prec);
        arb_mul(output + 0, output + 0, input, prec);
        arb_add_si(output + 0, output + 0, (slong) polynomial[1], prec);
        arb_mul(output + 0, output + 0, input, prec);
        arb_add_si(output + 0, output + 0, (slong) polynomial[0], prec);
    }
    if (order > 1)
    {
        arb_set_si(output + 1, 3 * (slong) polynomial[3]);
        arb_mul(output + 1, output + 1, input, prec);
        arb_add_si(output + 1, output + 1, 2 * (slong) polynomial[2], prec);
        arb_mul(output + 1, output + 1, input, prec);
        arb_add_si(output + 1, output + 1, (slong) polynomial[1], prec);
    }
    if (order > 2)
    {
        arb_mul_si(output + 2, input, 3 * (slong) polynomial[3], prec);
        arb_add_si(output + 2, output + 2, (slong) polynomial[2], prec);
    }
    if (order > 3)
        arb_set_si(output + 3, (slong) polynomial[3]);
    for (slong index = 4; index < order; index++)
        arb_zero(output + index);
    return 0;
}

int sagejs_rust_flint_compact_cubic_regulator(
    const int64_t *polynomial, const int64_t *basis_numerators,
    uint64_t basis_denominator, uint64_t real_places, uint64_t unit_rank,
    size_t relations,
    mpz_srcptr const *generator_coordinates, mpz_srcptr const *unit_exponents,
    slong precision, mpz_ptr lower, mpz_ptr upper, int64_t *binary_exponent)
{
    if (polynomial == NULL || basis_numerators == NULL ||
        basis_denominator == 0 || relations == 0 ||
        !((real_places == 3 && unit_rank == 2) ||
          (real_places == 1 && unit_rank == 1)) ||
        generator_coordinates == NULL || unit_exponents == NULL ||
        precision < 64 || lower == NULL || upper == NULL ||
        binary_exponent == NULL || sizeof(slong) < sizeof(int64_t))
        return -1;

    int status = 0;
    int64_t bound = 2;
    for (size_t index = 0; index < 3; index++)
    {
        int64_t coefficient = polynomial[index];
        int64_t magnitude = coefficient < 0 ? -coefficient : coefficient;
        if (magnitude >= bound)
            bound = magnitude + 1;
    }
    arf_interval_t initial;
    arf_interval_init(initial);
    arf_set_si(&initial->a, (slong) -bound);
    arf_set_si(&initial->b, (slong) bound);
    arf_interval_ptr isolated = NULL;
    int *flags = NULL;
    slong root_count = arb_calc_isolate_roots(
        &isolated, &flags, sagejs_rust_cubic_callback, (void *) polynomial,
        initial, 256, 100000, 3, 128);
    slong selected_roots[3];
    slong selected_count = 0;
    /* flags distinguish certified roots from unresolved subintervals. */
    for (slong index = 0;
         index < root_count && selected_count < (slong) real_places; index++)
        if (flags[index] != 0)
            selected_roots[selected_count++] = index;
    if (selected_count != (slong) real_places)
        status = -2;

    arb_t roots[3];
    for (size_t root = 0; root < 3; root++)
        arb_init(roots[root]);
    if (status == 0)
        for (size_t root = 0; root < real_places; root++)
        {
            arf_interval_t refined;
            arf_interval_init(refined);
            int refined_status = arb_calc_refine_root_bisect(
                refined, sagejs_rust_cubic_callback, (void *) polynomial,
                isolated + selected_roots[root], precision + 32, precision + 64);
            if (refined_status != ARB_CALC_SUCCESS)
                status = -3;
            else
                arf_interval_get_arb(roots[root], refined, precision);
            arf_interval_clear(refined);
        }

    arb_t unit_logs[2][3];
    for (size_t unit = 0; unit < 2; unit++)
        for (size_t root = 0; root < 3; root++)
        {
            arb_init(unit_logs[unit][root]);
            arb_zero(unit_logs[unit][root]);
        }
    fmpz_t coordinates[3], coefficients[3], exponent;
    for (size_t index = 0; index < 3; index++)
    {
        fmpz_init(coordinates[index]);
        fmpz_init(coefficients[index]);
    }
    fmpz_init(exponent);
    arb_t value, logarithm;
    arb_init(value);
    arb_init(logarithm);
    if (status == 0)
        for (size_t relation = 0; relation < relations && status == 0; relation++)
        {
            for (size_t coordinate = 0; coordinate < 3; coordinate++)
            {
                mpz_srcptr input = generator_coordinates[3 * relation + coordinate];
                if (input == NULL)
                {
                    status = -1;
                    break;
                }
                fmpz_set_mpz(coordinates[coordinate], input);
            }
            for (size_t power = 0; power < 3 && status == 0; power++)
            {
                fmpz_zero(coefficients[power]);
                for (size_t coordinate = 0; coordinate < 3; coordinate++)
                    fmpz_addmul_si(coefficients[power], coordinates[coordinate],
                        (slong) basis_numerators[3 * coordinate + power]);
            }
            for (size_t root = 0; root < real_places && status == 0; root++)
            {
                arb_set_fmpz(value, coefficients[2]);
                arb_mul(value, value, roots[root], precision);
                arb_add_fmpz(value, value, coefficients[1], precision);
                arb_mul(value, value, roots[root], precision);
                arb_add_fmpz(value, value, coefficients[0], precision);
                arb_div_ui(value, value, (ulong) basis_denominator, precision);
                arb_abs(value, value);
                if (arb_contains_zero(value))
                {
                    status = -4;
                    break;
                }
                arb_log(logarithm, value, precision);
                for (size_t unit = 0; unit < unit_rank; unit++)
                {
                    mpz_srcptr input = unit_exponents[unit * relations + relation];
                    if (input == NULL)
                    {
                        status = -1;
                        break;
                    }
                    fmpz_set_mpz(exponent, input);
                    arb_addmul_fmpz(unit_logs[unit][root], logarithm,
                        exponent, precision);
                }
            }
        }

    arb_t determinant, cross;
    arb_init(determinant);
    arb_init(cross);
    fmpz_t lower_fmpz, upper_fmpz, interval_exponent;
    fmpz_init(lower_fmpz);
    fmpz_init(upper_fmpz);
    fmpz_init(interval_exponent);
    if (status == 0)
    {
        if (unit_rank == 1)
            arb_set(determinant, unit_logs[0][0]);
        else
        {
            arb_mul(determinant, unit_logs[0][0], unit_logs[1][1], precision);
            arb_mul(cross, unit_logs[0][1], unit_logs[1][0], precision);
            arb_sub(determinant, determinant, cross, precision);
        }
        arb_abs(determinant, determinant);
        if (!arb_is_finite(determinant) || arb_contains_zero(determinant))
            status = -5;
        else
        {
            arb_get_interval_fmpz_2exp(
                lower_fmpz, upper_fmpz, interval_exponent, determinant);
            if (!fmpz_fits_si(interval_exponent))
                status = -6;
            else
            {
                fmpz_get_mpz(lower, lower_fmpz);
                fmpz_get_mpz(upper, upper_fmpz);
                *binary_exponent = (int64_t) fmpz_get_si(interval_exponent);
            }
        }
    }

    fmpz_clear(interval_exponent);
    fmpz_clear(upper_fmpz);
    fmpz_clear(lower_fmpz);
    arb_clear(cross);
    arb_clear(determinant);
    arb_clear(logarithm);
    arb_clear(value);
    fmpz_clear(exponent);
    for (size_t index = 0; index < 3; index++)
    {
        fmpz_clear(coefficients[index]);
        fmpz_clear(coordinates[index]);
    }
    for (size_t unit = 0; unit < 2; unit++)
        for (size_t root = 0; root < 3; root++)
            arb_clear(unit_logs[unit][root]);
    for (size_t root = 0; root < 3; root++)
        arb_clear(roots[root]);
    if (isolated != NULL)
        _arf_interval_vec_clear(isolated, root_count);
    flint_free(flags);
    arf_interval_clear(initial);
    flint_cleanup();
    return status;
}

static int sagejs_rust_export_arb_interval(
    const arb_t value, mpz_ptr lower, mpz_ptr upper, int64_t *exponent)
{
    fmpz_t lower_value, upper_value, scale;
    fmpz_init(lower_value);
    fmpz_init(upper_value);
    fmpz_init(scale);
    arb_get_interval_fmpz_2exp(lower_value, upper_value, scale, value);
    int status = fmpz_fits_si(scale) ? 0 : -1;
    if (status == 0)
    {
        fmpz_get_mpz(lower, lower_value);
        fmpz_get_mpz(upper, upper_value);
        *exponent = (int64_t) fmpz_get_si(scale);
    }
    fmpz_clear(scale);
    fmpz_clear(upper_value);
    fmpz_clear(lower_value);
    return status;
}

int sagejs_rust_flint_bdf_factor_base_margin(
    size_t term_count, const int64_t *terms, uint64_t bound,
    mpz_srcptr discriminant, uint64_t degree, uint64_t real_places,
    slong precision, mpz_ptr lower, mpz_ptr upper, int64_t *exponent)
{
    if ((term_count != 0 && terms == NULL) || bound < 2 ||
        bound > ULONG_MAX || discriminant == NULL || degree < 2 ||
        real_places > degree || real_places > ULONG_MAX / 4 ||
        precision < 64 || lower == NULL ||
        upper == NULL || exponent == NULL)
        return -1;

    int status = 0;
    fmpz_t discriminant_value;
    fmpz_init(discriminant_value);
    fmpz_set_mpz(discriminant_value, discriminant);
    fmpz_abs(discriminant_value, discriminant_value);

    arb_t log_bound, total, log_norm, root, taper, summand, temporary;
    arb_t pi, catalan, gamma, archimedean, right, left, margin;
    arb_init(log_bound);
    arb_init(total);
    arb_init(log_norm);
    arb_init(root);
    arb_init(taper);
    arb_init(summand);
    arb_init(temporary);
    arb_init(pi);
    arb_init(catalan);
    arb_init(gamma);
    arb_init(archimedean);
    arb_init(right);
    arb_init(left);
    arb_init(margin);

    arb_log_ui(log_bound, (ulong) bound, precision);
    arb_zero(total);
    for (size_t index = 0; index < term_count && status == 0; index++)
    {
        int64_t multiplicity = terms[3 * index + 0];
        int64_t norm_signed = terms[3 * index + 1];
        int64_t exponent_signed = terms[3 * index + 2];
        if (multiplicity < 1 || norm_signed < 2 || exponent_signed < 1)
        {
            status = -2;
            break;
        }
        if ((uint64_t) norm_signed > ULONG_MAX)
        {
            status = -2;
            break;
        }
        ulong norm = (ulong) norm_signed;
        ulong power = 1;
        for (int64_t count = 0; count < exponent_signed; count++)
        {
            if (power > ULONG_MAX / norm)
            {
                status = -2;
                break;
            }
            power *= norm;
        }
        if (status != 0 || power >= bound)
        {
            status = -2;
            break;
        }
        arb_log_ui(log_norm, norm, precision);
        arb_sqrt_ui(root, power, precision);
        arb_div(summand, log_norm, root, precision);
        arb_mul_si(temporary, log_norm, (slong) exponent_signed, precision);
        arb_div(temporary, temporary, log_bound, precision);
        arb_one(taper);
        arb_sub(taper, taper, temporary, precision);
        arb_mul(summand, summand, taper, precision);
        arb_addmul_si(total, summand, (slong) multiplicity, precision);
    }

    if (status == 0)
    {
        arb_const_pi(pi, precision);
        arb_const_catalan(catalan, precision);
        arb_const_euler(gamma, precision);

        arb_mul(archimedean, pi, pi, precision);
        arb_mul_ui(archimedean, archimedean, (ulong) degree, precision);
        arb_mul_2exp_si(archimedean, archimedean, -1);
        arb_mul_ui(temporary, catalan, (ulong) (4 * real_places), precision);
        arb_add(archimedean, archimedean, temporary, precision);
        arb_div(archimedean, archimedean, log_bound, precision);
        arb_mul_2exp_si(right, total, 1);
        arb_sub(right, right, archimedean, precision);

        arb_log_fmpz(left, discriminant_value, precision);
        arb_log_ui(temporary, 8, precision);
        arb_add(temporary, temporary, gamma, precision);
        arb_log(pi, pi, precision);
        arb_add(temporary, temporary, pi, precision);
        arb_mul_ui(temporary, temporary, (ulong) degree, precision);
        arb_sub(left, left, temporary, precision);
        arb_const_pi(pi, precision);
        arb_mul_ui(temporary, pi, (ulong) real_places, precision);
        arb_mul_2exp_si(temporary, temporary, -1);
        arb_sub(left, left, temporary, precision);

        arb_sub(margin, right, left, precision);
        if (!arb_is_finite(margin))
            status = -3;
    }
    if (status == 0 &&
        sagejs_rust_export_arb_interval(margin, lower, upper, exponent) != 0)
        status = -4;

    arb_clear(margin);
    arb_clear(left);
    arb_clear(right);
    arb_clear(archimedean);
    arb_clear(gamma);
    arb_clear(catalan);
    arb_clear(pi);
    arb_clear(temporary);
    arb_clear(summand);
    arb_clear(taper);
    arb_clear(root);
    arb_clear(log_norm);
    arb_clear(total);
    arb_clear(log_bound);
    fmpz_clear(discriminant_value);
    flint_cleanup();
    return status;
}

int sagejs_rust_flint_bf_index_enclosure(
    size_t term_count, const int64_t *terms, uint64_t threshold,
    mpz_srcptr discriminant, uint64_t class_number, uint64_t roots_of_unity,
    uint64_t real_places, uint64_t complex_places,
    mpz_srcptr regulator_lower, mpz_srcptr regulator_upper,
    int64_t regulator_exponent, slong precision,
    mpz_ptr zeta_lower, mpz_ptr zeta_upper, int64_t *zeta_exponent,
    mpz_ptr tail_lower, mpz_ptr tail_upper, int64_t *tail_exponent,
    mpz_ptr index_lower, mpz_ptr index_upper, int64_t *index_exponent)
{
    if ((term_count != 0 && terms == NULL) || threshold < 72 ||
        threshold > ULONG_MAX / 3 ||
        threshold % 9 != 0 || discriminant == NULL || class_number == 0 ||
        roots_of_unity == 0 || regulator_lower == NULL ||
        regulator_upper == NULL || precision < 64 || zeta_lower == NULL ||
        complex_places > (ULONG_MAX - real_places) / 2 ||
        real_places + 2 * complex_places <= 1 ||
        zeta_upper == NULL || zeta_exponent == NULL || tail_lower == NULL ||
        tail_upper == NULL || tail_exponent == NULL || index_lower == NULL ||
        index_upper == NULL || index_exponent == NULL)
        return -1;

    int status = 0;
    fmpz_t discriminant_value, lower_value, upper_value, scale;
    fmpz_init(discriminant_value);
    fmpz_init(lower_value);
    fmpz_init(upper_value);
    fmpz_init(scale);
    fmpz_set_mpz(discriminant_value, discriminant);
    fmpz_abs(discriminant_value, discriminant_value);
    fmpz_set_mpz(lower_value, regulator_lower);
    fmpz_set_mpz(upper_value, regulator_upper);
    fmpz_set_si(scale, (slong) regulator_exponent);

    arf_t lower_arf, upper_arf;
    arf_init(lower_arf);
    arf_init(upper_arf);
    arf_set_fmpz_2exp(lower_arf, lower_value, scale);
    arf_set_fmpz_2exp(upper_arf, upper_value, scale);
    arb_t regulator;
    arb_init(regulator);
    arb_set_interval_arf(regulator, lower_arf, upper_arf, precision);
    if (!arb_is_positive(regulator))
        status = -2;

    arb_t sqrt_threshold, sqrt_ninth, log_threshold, log_ninth;
    arb_t scale_full, scale_ninth, total, summand, logarithm, root, power;
    arb_t multiplier, finite, tail, zeta, temporary, denominator;
    arb_init(sqrt_threshold);
    arb_init(sqrt_ninth);
    arb_init(log_threshold);
    arb_init(log_ninth);
    arb_init(scale_full);
    arb_init(scale_ninth);
    arb_init(total);
    arb_init(summand);
    arb_init(logarithm);
    arb_init(root);
    arb_init(power);
    arb_init(multiplier);
    arb_init(finite);
    arb_init(tail);
    arb_init(zeta);
    arb_init(temporary);
    arb_init(denominator);
    const ulong threshold_word = (ulong) threshold;
    const ulong ninth = threshold_word / 9;
    if (status == 0)
    {
        arb_sqrt_ui(sqrt_threshold, threshold_word, precision);
        arb_sqrt_ui(sqrt_ninth, ninth, precision);
        arb_log_ui(log_threshold, threshold_word, precision);
        arb_log_ui(log_ninth, ninth, precision);
        arb_mul(scale_full, sqrt_threshold, log_threshold, precision);
        arb_mul(scale_ninth, sqrt_ninth, log_ninth, precision);
        arb_zero(total);
        for (size_t index = 0; index < term_count && status == 0; index++)
        {
            int64_t multiplicity = terms[4 * index + 0];
            int64_t scale_index = terms[4 * index + 1];
            int64_t norm_signed = terms[4 * index + 2];
            int64_t exponent_signed = terms[4 * index + 3];
            if (multiplicity == 0 || (scale_index != 0 && scale_index != 1) ||
                norm_signed < 2 || exponent_signed < 1)
            {
                status = -3;
                break;
            }
            if ((uint64_t) norm_signed > ULONG_MAX)
            {
                status = -3;
                break;
            }
            ulong norm = (ulong) norm_signed;
            ulong exponent = (ulong) exponent_signed;
            ulong norm_power = 1;
            for (ulong count = 0; count < exponent; count++)
            {
                if (norm_power > ULONG_MAX / norm)
                {
                    status = -3;
                    break;
                }
                norm_power *= norm;
            }
            if (status != 0 || exponent > ULONG_MAX / norm_power)
            {
                status = -3;
                break;
            }
            arb_set(summand, scale_index == 0 ? scale_full : scale_ninth);
            arb_div_ui(summand, summand, exponent * norm_power, precision);
            arb_log_ui(logarithm, norm, precision);
            arb_set_ui(power, 1);
            for (ulong count = 0; count < exponent / 2; count++)
                arb_mul_ui(power, power, norm, precision);
            if (exponent % 2 != 0)
            {
                arb_sqrt_ui(root, norm, precision);
                arb_mul(power, power, root, precision);
            }
            arb_div(temporary, logarithm, power, precision);
            arb_sub(summand, summand, temporary, precision);
            arb_addmul_si(total, summand, (slong) multiplicity, precision);
        }
        arb_mul_ui(denominator, sqrt_threshold, 2, precision);
        arb_log_ui(temporary, 3 * threshold_word, precision);
        arb_mul(denominator, denominator, temporary, precision);
        arb_set_ui(multiplier, 3);
        arb_div(multiplier, multiplier, denominator, precision);
        arb_mul(finite, multiplier, total, precision);

        arb_log_fmpz(logarithm, discriminant_value, precision);
        arb_sqrt(root, logarithm, precision);
        arb_set_str(tail, "2.324", precision);
        arb_mul(tail, tail, logarithm, precision);
        arb_mul(denominator, sqrt_threshold, temporary, precision);
        arb_div(tail, tail, denominator, precision);
        arb_set_str(summand, "3.88", precision);
        arb_div(summand, summand, log_ninth, precision);
        arb_add_ui(summand, summand, 1, precision);
        arb_set_ui(power, 2);
        arb_div(power, power, root, precision);
        arb_add_ui(power, power, 1, precision);
        arb_mul(power, power, power, precision);
        arb_mul(summand, summand, power, precision);
        arb_set_str(power, "4.26", precision);
        arb_mul_ui(power, power,
            (ulong) (real_places + 2 * complex_places - 1), precision);
        arb_mul(denominator, sqrt_threshold, logarithm, precision);
        arb_div(power, power, denominator, precision);
        arb_add(summand, summand, power, precision);
        arb_mul(tail, tail, summand, precision);

        arb_set(zeta, finite);
        arb_add_error(zeta, tail);
    }

    arb_t algebraic, index_ball, pi;
    arb_init(algebraic);
    arb_init(index_ball);
    arb_init(pi);
    if (status == 0)
    {
        arb_log_ui(algebraic, 2, precision);
        arb_mul_ui(algebraic, algebraic,
            (ulong) (real_places + complex_places), precision);
        if (complex_places != 0)
        {
            arb_const_pi(pi, precision);
            arb_log(pi, pi, precision);
            arb_addmul_ui(algebraic, pi, (ulong) complex_places, precision);
        }
        arb_log_ui(temporary, roots_of_unity, precision);
        arb_sub(algebraic, algebraic, temporary, precision);
        arb_log_fmpz(temporary, discriminant_value, precision);
        arb_mul_2exp_si(temporary, temporary, -1);
        arb_sub(algebraic, algebraic, temporary, precision);
        arb_log_ui(temporary, class_number, precision);
        arb_add(algebraic, algebraic, temporary, precision);
        arb_log(temporary, regulator, precision);
        arb_add(algebraic, algebraic, temporary, precision);
        arb_sub(algebraic, algebraic, zeta, precision);
        arb_exp(index_ball, algebraic, precision);
        if (!arb_is_finite(index_ball) || !arb_is_positive(index_ball))
            status = -4;
    }
    if (status == 0 &&
        (sagejs_rust_export_arb_interval(zeta, zeta_lower, zeta_upper,
             zeta_exponent) != 0 ||
         sagejs_rust_export_arb_interval(tail, tail_lower, tail_upper,
             tail_exponent) != 0 ||
         sagejs_rust_export_arb_interval(index_ball, index_lower, index_upper,
             index_exponent) != 0))
        status = -5;

    arb_clear(pi);
    arb_clear(index_ball);
    arb_clear(algebraic);
    arb_clear(denominator);
    arb_clear(temporary);
    arb_clear(zeta);
    arb_clear(tail);
    arb_clear(finite);
    arb_clear(multiplier);
    arb_clear(power);
    arb_clear(root);
    arb_clear(logarithm);
    arb_clear(summand);
    arb_clear(total);
    arb_clear(scale_ninth);
    arb_clear(scale_full);
    arb_clear(log_ninth);
    arb_clear(log_threshold);
    arb_clear(sqrt_ninth);
    arb_clear(sqrt_threshold);
    arb_clear(regulator);
    arf_clear(upper_arf);
    arf_clear(lower_arf);
    fmpz_clear(scale);
    fmpz_clear(upper_value);
    fmpz_clear(lower_value);
    fmpz_clear(discriminant_value);
    flint_cleanup();
    return status;
}
