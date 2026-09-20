// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

#include <gmp.h>
#include <flint/fmpz.h>
#include <flint/fmpz_lll.h>
#include <flint/fmpz_mat.h>
#include <flint/arb.h>
#include <flint/arb_calc.h>
#include <limits.h>
#include <stdint.h>
#include <time.h>

static uint64_t sagejs_rust_monotonic_ns(void)
{
    struct timespec value;
    if (clock_gettime(CLOCK_MONOTONIC, &value) != 0)
        return 0;
    return (uint64_t) value.tv_sec * UINT64_C(1000000000) +
        (uint64_t) value.tv_nsec;
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
    uint64_t basis_denominator, size_t relations,
    mpz_srcptr const *generator_coordinates, mpz_srcptr const *unit_exponents,
    slong precision, mpz_ptr lower, mpz_ptr upper, int64_t *binary_exponent)
{
    if (polynomial == NULL || basis_numerators == NULL ||
        basis_denominator == 0 || relations == 0 ||
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
    for (slong index = 0; index < root_count && selected_count < 3; index++)
        if (flags[index] != 0)
            selected_roots[selected_count++] = index;
    if (selected_count != 3)
        status = -2;

    arb_t roots[3];
    for (size_t root = 0; root < 3; root++)
        arb_init(roots[root]);
    if (status == 0)
        for (size_t root = 0; root < 3; root++)
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
            for (size_t root = 0; root < 3 && status == 0; root++)
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
                for (size_t unit = 0; unit < 2; unit++)
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
        arb_mul(determinant, unit_logs[0][0], unit_logs[1][1], precision);
        arb_mul(cross, unit_logs[0][1], unit_logs[1][0], precision);
        arb_sub(determinant, determinant, cross, precision);
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
