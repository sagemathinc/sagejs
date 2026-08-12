#ifndef SAGEJS_NMOD_MATRIX_FFI_H
#define SAGEJS_NMOD_MATRIX_FFI_H

#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <flint/flint.h>
#include <flint/nmod.h>
#include <flint/nmod_mat.h>
#include <flint/nmod_poly.h>
#include <flint/ulong_extras.h>

#include "sagejs/fmpq_matrix_ffi.h"

/*
 * Host-neutral owned resource ABI for dense matrices over word-size prime
 * fields.  Public hosts see only generated lifetime tokens.  FLINT's
 * `nmod_mat_t` stays behind this boundary and may be borrowed synchronously by
 * compiled typed Python or another declared FLINT operation.
 */

typedef struct
{
    nmod_mat_t value;
    slong known_rank;
    size_t retained_bytes;
} sagejs_nmod_matrix_struct;

typedef sagejs_nmod_matrix_struct sagejs_nmod_matrix_t[1];

static inline size_t sagejs_nmod_matrix_structural_bytes(
    uint64_t rows, uint64_t columns)
{
    if (rows != 0 && columns > (uint64_t) SIZE_MAX / rows)
        return SIZE_MAX;
    const size_t entries = (size_t) rows * (size_t) columns;
    if ((size_t) rows >
            (SIZE_MAX - sizeof(sagejs_nmod_matrix_struct)) / sizeof(ulong *) ||
        entries >
            (SIZE_MAX - sizeof(sagejs_nmod_matrix_struct) -
             (size_t) rows * sizeof(ulong *)) / sizeof(ulong))
        return SIZE_MAX;
    return sizeof(sagejs_nmod_matrix_struct) +
        (size_t) rows * sizeof(ulong *) + entries * sizeof(ulong);
}

static inline size_t sagejs_nmod_matrix_allocated_bytes(
    const sagejs_nmod_matrix_t matrix)
{
    return matrix->retained_bytes;
}

static inline int sagejs_nmod_matrix_dimensions_valid(
    uint64_t rows, uint64_t columns)
{
    return rows <= (uint64_t) WORD_MAX &&
        columns <= (uint64_t) WORD_MAX &&
        (rows == 0 || columns <= (uint64_t) SIZE_MAX / rows) &&
        sagejs_nmod_matrix_structural_bytes(rows, columns) != SIZE_MAX;
}

static inline int sagejs_nmod_matrix_init(
    sagejs_nmod_matrix_t result, uint64_t rows, uint64_t columns,
    uint64_t modulus)
{
    if (modulus < 2 || modulus > (uint64_t) UWORD_MAX ||
        !n_is_prime((ulong) modulus) ||
        !sagejs_nmod_matrix_dimensions_valid(rows, columns))
        return 0;
    nmod_mat_init(
        result->value, (slong) rows, (slong) columns, (ulong) modulus);
    result->known_rank = -1;
    result->retained_bytes =
        sagejs_nmod_matrix_structural_bytes(rows, columns);
    return 1;
}

static inline void sagejs_nmod_matrix_clear(sagejs_nmod_matrix_t matrix)
{
    nmod_mat_clear(matrix->value);
    matrix->known_rank = -1;
    matrix->retained_bytes = 0;
}

static inline int sagejs_nmod_matrix_from_entries(
    sagejs_nmod_matrix_t result, const uint64_t *entries,
    uint64_t entry_count, uint64_t rows, uint64_t columns,
    uint64_t modulus)
{
    if ((rows != 0 && columns > UINT64_MAX / rows) ||
        rows * columns != entry_count ||
        !sagejs_nmod_matrix_init(result, rows, columns, modulus))
        return 0;
    for (uint64_t index = 0; index < entry_count; index++)
    {
        if (entries[index] >= modulus)
        {
            sagejs_nmod_matrix_clear(result);
            return 0;
        }
        nmod_mat_entry(result->value,
            (slong) (index / columns), (slong) (index % columns)) =
            (ulong) entries[index];
    }
    return 1;
}

static inline int sagejs_nmod_matrix_random(
    sagejs_nmod_matrix_t result, uint64_t rows, uint64_t columns,
    uint64_t modulus, uint64_t seed1, uint64_t seed2)
{
    if (seed1 > (uint64_t) UWORD_MAX || seed2 > (uint64_t) UWORD_MAX ||
        !sagejs_nmod_matrix_init(result, rows, columns, modulus))
        return 0;
    flint_rand_t state;
    flint_rand_init(state);
    if (seed1 == 0 && seed2 == 0)
        seed2 = 1;
    flint_rand_set_seed(state, (ulong) seed1, (ulong) seed2);
    for (slong row = 0; row < nmod_mat_nrows(result->value); row++)
        for (slong column = 0; column < nmod_mat_ncols(result->value); column++)
            nmod_mat_entry(result->value, row, column) =
                n_randint(state, (ulong) modulus);
    flint_rand_clear(state);
    return 1;
}

static inline uint64_t sagejs_nmod_matrix_nrows(
    const sagejs_nmod_matrix_t matrix)
{
    return (uint64_t) nmod_mat_nrows(matrix->value);
}

static inline uint64_t sagejs_nmod_matrix_ncols(
    const sagejs_nmod_matrix_t matrix)
{
    return (uint64_t) nmod_mat_ncols(matrix->value);
}

static inline uint64_t sagejs_nmod_matrix_modulus(
    const sagejs_nmod_matrix_t matrix)
{
    return (uint64_t) matrix->value->mod.n;
}

/* Bounds failures return zero without touching foreign memory.  Public matrix
 * access validates indices first; this also keeps direct generated calls safe.
 */
static inline uint64_t sagejs_nmod_matrix_entry(
    const sagejs_nmod_matrix_t matrix, uint64_t row, uint64_t column)
{
    if (row >= (uint64_t) nmod_mat_nrows(matrix->value) ||
        column >= (uint64_t) nmod_mat_ncols(matrix->value))
        return UINT64_MAX;
    return (uint64_t) nmod_mat_entry(
        matrix->value, (slong) row, (slong) column);
}

static inline int sagejs_nmod_matrix_set_entry(
    sagejs_nmod_matrix_t matrix, uint64_t row, uint64_t column,
    uint64_t value)
{
    if (row >= (uint64_t) nmod_mat_nrows(matrix->value) ||
        column >= (uint64_t) nmod_mat_ncols(matrix->value) ||
        value >= (uint64_t) matrix->value->mod.n)
        return 0;
    nmod_mat_entry(matrix->value, (slong) row, (slong) column) =
        (ulong) value;
    matrix->known_rank = -1;
    return 1;
}

static inline int sagejs_nmod_matrix_init_set(
    sagejs_nmod_matrix_t result, const sagejs_nmod_matrix_t source)
{
    if (!sagejs_nmod_matrix_init(result,
            (uint64_t) nmod_mat_nrows(source->value),
            (uint64_t) nmod_mat_ncols(source->value),
            (uint64_t) source->value->mod.n))
        return 0;
    nmod_mat_set(result->value, source->value);
    result->known_rank = source->known_rank;
    return 1;
}

static inline int sagejs_nmod_matrix_same_field(
    const sagejs_nmod_matrix_t left, const sagejs_nmod_matrix_t right)
{
    return left->value->mod.n == right->value->mod.n;
}

static inline int sagejs_nmod_matrix_equal(
    const sagejs_nmod_matrix_t left, const sagejs_nmod_matrix_t right)
{
    return sagejs_nmod_matrix_same_field(left, right) &&
        nmod_mat_equal(left->value, right->value);
}

static inline int sagejs_nmod_matrix_is_zero(
    const sagejs_nmod_matrix_t matrix)
{
    return nmod_mat_is_zero(matrix->value);
}

static inline int sagejs_nmod_matrix_is_one(
    const sagejs_nmod_matrix_t matrix)
{
    return nmod_mat_nrows(matrix->value) == nmod_mat_ncols(matrix->value) &&
        nmod_mat_is_one(matrix->value);
}

static inline uint64_t sagejs_nmod_matrix_nonzero_count(
    const sagejs_nmod_matrix_t matrix)
{
    uint64_t count = 0;
    for (slong row = 0; row < nmod_mat_nrows(matrix->value); row++)
        for (slong column = 0; column < nmod_mat_ncols(matrix->value); column++)
            count += nmod_mat_entry(matrix->value, row, column) != 0;
    return count;
}

static inline int sagejs_nmod_matrix_binary_shape(
    const sagejs_nmod_matrix_t left, const sagejs_nmod_matrix_t right)
{
    return sagejs_nmod_matrix_same_field(left, right) &&
        nmod_mat_nrows(left->value) == nmod_mat_nrows(right->value) &&
        nmod_mat_ncols(left->value) == nmod_mat_ncols(right->value);
}

static inline int sagejs_nmod_matrix_add(
    sagejs_nmod_matrix_t result, const sagejs_nmod_matrix_t left,
    const sagejs_nmod_matrix_t right)
{
    if (!sagejs_nmod_matrix_binary_shape(left, right) ||
        !sagejs_nmod_matrix_init(result,
            (uint64_t) nmod_mat_nrows(left->value),
            (uint64_t) nmod_mat_ncols(left->value),
            (uint64_t) left->value->mod.n))
        return 0;
    nmod_mat_add(result->value, left->value, right->value);
    return 1;
}

static inline int sagejs_nmod_matrix_sub(
    sagejs_nmod_matrix_t result, const sagejs_nmod_matrix_t left,
    const sagejs_nmod_matrix_t right)
{
    if (!sagejs_nmod_matrix_binary_shape(left, right) ||
        !sagejs_nmod_matrix_init(result,
            (uint64_t) nmod_mat_nrows(left->value),
            (uint64_t) nmod_mat_ncols(left->value),
            (uint64_t) left->value->mod.n))
        return 0;
    nmod_mat_sub(result->value, left->value, right->value);
    return 1;
}

static inline int sagejs_nmod_matrix_neg(
    sagejs_nmod_matrix_t result, const sagejs_nmod_matrix_t source)
{
    if (!sagejs_nmod_matrix_init(result,
            (uint64_t) nmod_mat_nrows(source->value),
            (uint64_t) nmod_mat_ncols(source->value),
            (uint64_t) source->value->mod.n))
        return 0;
    nmod_mat_neg(result->value, source->value);
    result->known_rank = source->known_rank;
    return 1;
}

static inline int sagejs_nmod_matrix_scalar_mul(
    sagejs_nmod_matrix_t result, const sagejs_nmod_matrix_t source,
    uint64_t scalar)
{
    if (scalar >= (uint64_t) source->value->mod.n ||
        !sagejs_nmod_matrix_init(result,
            (uint64_t) nmod_mat_nrows(source->value),
            (uint64_t) nmod_mat_ncols(source->value),
            (uint64_t) source->value->mod.n))
        return 0;
    nmod_mat_scalar_mul(result->value, source->value, (ulong) scalar);
    result->known_rank = scalar == 0 ? 0 : source->known_rank;
    return 1;
}

static inline int sagejs_nmod_matrix_transpose(
    sagejs_nmod_matrix_t result, const sagejs_nmod_matrix_t source)
{
    if (!sagejs_nmod_matrix_init(result,
            (uint64_t) nmod_mat_ncols(source->value),
            (uint64_t) nmod_mat_nrows(source->value),
            (uint64_t) source->value->mod.n))
        return 0;
    nmod_mat_transpose(result->value, source->value);
    result->known_rank = source->known_rank;
    return 1;
}

static inline int sagejs_nmod_matrix_mul(
    sagejs_nmod_matrix_t result, const sagejs_nmod_matrix_t left,
    const sagejs_nmod_matrix_t right)
{
    if (!sagejs_nmod_matrix_same_field(left, right) ||
        nmod_mat_ncols(left->value) != nmod_mat_nrows(right->value) ||
        !sagejs_nmod_matrix_init(result,
            (uint64_t) nmod_mat_nrows(left->value),
            (uint64_t) nmod_mat_ncols(right->value),
            (uint64_t) left->value->mod.n))
        return 0;
    nmod_mat_mul(result->value, left->value, right->value);
    return 1;
}

static inline int sagejs_nmod_matrix_inv(
    sagejs_nmod_matrix_t result, const sagejs_nmod_matrix_t source)
{
    const slong rows = nmod_mat_nrows(source->value);
    if (rows != nmod_mat_ncols(source->value) ||
        !sagejs_nmod_matrix_init(result, (uint64_t) rows, (uint64_t) rows,
            (uint64_t) source->value->mod.n))
        return 0;
    if (!nmod_mat_inv(result->value, source->value))
    {
        sagejs_nmod_matrix_clear(result);
        return 0;
    }
    result->known_rank = rows;
    return 1;
}

static inline int sagejs_nmod_matrix_solve(
    sagejs_nmod_matrix_t result, const sagejs_nmod_matrix_t left,
    const sagejs_nmod_matrix_t right)
{
    const slong size = nmod_mat_nrows(left->value);
    if (!sagejs_nmod_matrix_same_field(left, right) ||
        nmod_mat_ncols(left->value) != size ||
        nmod_mat_nrows(right->value) != size ||
        !sagejs_nmod_matrix_init(result, (uint64_t) size,
            (uint64_t) nmod_mat_ncols(right->value),
            (uint64_t) left->value->mod.n))
        return 0;
    if (!nmod_mat_solve(result->value, left->value, right->value))
    {
        sagejs_nmod_matrix_clear(result);
        return 0;
    }
    return 1;
}

static inline uint64_t sagejs_nmod_matrix_rank(
    sagejs_nmod_matrix_t matrix)
{
    if (matrix->known_rank < 0)
    {
        nmod_mat_t copy;
        nmod_mat_init_set(copy, matrix->value);
        matrix->known_rank = nmod_mat_rank(copy);
        nmod_mat_clear(copy);
    }
    return (uint64_t) matrix->known_rank;
}

static inline int sagejs_nmod_matrix_rref(
    sagejs_nmod_matrix_t result, const sagejs_nmod_matrix_t source)
{
    if (!sagejs_nmod_matrix_init_set(result, source))
        return 0;
    result->known_rank = nmod_mat_rref(result->value);
    return 1;
}

static inline int sagejs_nmod_matrix_right_kernel(
    sagejs_nmod_matrix_t result, const sagejs_nmod_matrix_t source)
{
    const slong columns = nmod_mat_ncols(source->value);
    nmod_mat_t basis_columns;
    nmod_mat_init(
        basis_columns, columns, columns, source->value->mod.n);
    const slong nullity = nmod_mat_nullspace(basis_columns, source->value);
    if (!sagejs_nmod_matrix_init(result, (uint64_t) nullity,
            (uint64_t) columns, (uint64_t) source->value->mod.n))
    {
        nmod_mat_clear(basis_columns);
        return 0;
    }
    if (nullity == 0)
    {
        nmod_mat_clear(basis_columns);
        result->known_rank = 0;
        return 1;
    }
    for (slong row = 0; row < nullity; row++)
        for (slong column = 0; column < columns; column++)
            nmod_mat_entry(result->value, row, column) =
                nmod_mat_entry(basis_columns, column, row);
    nmod_mat_rref(result->value);
    nmod_mat_clear(basis_columns);
    result->known_rank = nullity;
    return 1;
}

static inline uint64_t sagejs_nmod_matrix_det(
    const sagejs_nmod_matrix_t source)
{
    if (nmod_mat_nrows(source->value) != nmod_mat_ncols(source->value))
        return 0;
    return (uint64_t) nmod_mat_det(source->value);
}

static inline uint64_t sagejs_nmod_matrix_trace(
    const sagejs_nmod_matrix_t source)
{
    const slong count = nmod_mat_nrows(source->value) <
            nmod_mat_ncols(source->value)
        ? nmod_mat_nrows(source->value) : nmod_mat_ncols(source->value);
    ulong result = 0;
    for (slong index = 0; index < count; index++)
        result = nmod_add(result,
            nmod_mat_entry(source->value, index, index),
            source->value->mod);
    return (uint64_t) result;
}

static inline int sagejs_nmod_matrix_swap_rows(
    sagejs_nmod_matrix_t matrix, uint64_t first, uint64_t second)
{
    if (first >= (uint64_t) nmod_mat_nrows(matrix->value) ||
        second >= (uint64_t) nmod_mat_nrows(matrix->value))
        return 0;
    nmod_mat_swap_rows(matrix->value, NULL, (slong) first, (slong) second);
    return 1;
}

static inline int sagejs_nmod_matrix_swap_columns(
    sagejs_nmod_matrix_t matrix, uint64_t first, uint64_t second)
{
    if (first >= (uint64_t) nmod_mat_ncols(matrix->value) ||
        second >= (uint64_t) nmod_mat_ncols(matrix->value))
        return 0;
    nmod_mat_swap_cols(matrix->value, NULL, (slong) first, (slong) second);
    return 1;
}

static inline size_t sagejs_nmod_decimal_length(ulong value)
{
    size_t length = 1;
    while (value >= 10)
    {
        value /= 10;
        length++;
    }
    return length;
}

static inline void sagejs_nmod_write_decimal(
    unsigned char *target, size_t length, ulong value)
{
    for (size_t index = length; index > 0; index--)
    {
        target[index - 1] = (unsigned char) ('0' + value % 10);
        value /= 10;
    }
}

static inline int sagejs_nmod_matrix_format(
    sagejs_flint_byte_region_t result,
    const sagejs_nmod_matrix_t source)
{
    const slong rows = nmod_mat_nrows(source->value);
    const slong columns = nmod_mat_ncols(source->value);
    size_t width = 1;
    size_t length = 0;
    result->data = NULL;
    result->length = 0;
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
        {
            const size_t entry_length = sagejs_nmod_decimal_length(
                nmod_mat_entry(source->value, row, column));
            if (entry_length > width)
                width = entry_length;
        }
    if (rows == 0)
        length = 2;
    else
    {
        for (slong row = 0; row < rows; row++)
        {
            if (!sagejs_size_add(&length, 2) ||
                (columns > 0 &&
                 (width > SIZE_MAX / (size_t) columns ||
                  !sagejs_size_add(&length, width * (size_t) columns) ||
                  !sagejs_size_add(&length, (size_t) columns - 1))) ||
                (row + 1 < rows && !sagejs_size_add(&length, 1)))
                return 0;
        }
    }
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (result->data == NULL)
        return 0;
    result->length = length;
    size_t offset = 0;
    if (rows == 0)
    {
        result->data[offset++] = '[';
        result->data[offset++] = ']';
        return 1;
    }
    for (slong row = 0; row < rows; row++)
    {
        result->data[offset++] = '[';
        for (slong column = 0; column < columns; column++)
        {
            const ulong value = nmod_mat_entry(source->value, row, column);
            const size_t entry_length = sagejs_nmod_decimal_length(value);
            for (size_t padding = entry_length; padding < width; padding++)
                result->data[offset++] = ' ';
            sagejs_nmod_write_decimal(
                result->data + offset, entry_length, value);
            offset += entry_length;
            if (column + 1 < columns)
                result->data[offset++] = ' ';
        }
        result->data[offset++] = ']';
        if (row + 1 < rows)
            result->data[offset++] = '\n';
    }
    return 1;
}

static inline int sagejs_nmod_matrix_serialize(
    sagejs_flint_byte_region_t result,
    const sagejs_nmod_matrix_t source, uint64_t width)
{
    const uint64_t rows = (uint64_t) nmod_mat_nrows(source->value);
    const uint64_t columns = (uint64_t) nmod_mat_ncols(source->value);
    result->data = NULL;
    result->length = 0;
    if ((width != 1 && width != 2 && width != 4 && width != 8) ||
        (rows != 0 && columns > (uint64_t) SIZE_MAX / rows))
        return 0;
    const size_t count = (size_t) rows * (size_t) columns;
    if (count > SIZE_MAX / (size_t) width)
        return 0;
    const size_t length = count * (size_t) width;
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (result->data == NULL)
        return 0;
    result->length = length;
    for (size_t index = 0; index < count; index++)
    {
        const ulong value = nmod_mat_entry(source->value,
            (slong) (index / (size_t) columns),
            (slong) (index % (size_t) columns));
        if (width < sizeof(ulong) && value >= ((ulong) 1 << (8 * width)))
        {
            sagejs_flint_byte_region_clear(result);
            return 0;
        }
        for (size_t byte = 0; byte < (size_t) width; byte++)
            result->data[index * (size_t) width + byte] =
                (unsigned char) (value >> (8 * byte));
    }
    return 1;
}

static inline int sagejs_nmod_matrix_polynomial_bytes(
    sagejs_flint_byte_region_t result,
    const sagejs_nmod_matrix_t source, int minimal)
{
    const slong rows = nmod_mat_nrows(source->value);
    result->data = NULL;
    result->length = 0;
    if (rows != nmod_mat_ncols(source->value))
        return 0;
    nmod_poly_t polynomial;
    nmod_poly_init(polynomial, source->value->mod.n);
    if (minimal)
        nmod_mat_minpoly(polynomial, source->value);
    else
        nmod_mat_charpoly(polynomial, source->value);
    const slong count = minimal ? nmod_poly_length(polynomial) : rows + 1;
    if (count < 0 || (size_t) count > SIZE_MAX / 8)
    {
        nmod_poly_clear(polynomial);
        return 0;
    }
    result->length = (size_t) count * 8;
    result->data = (unsigned char *) malloc(
        result->length == 0 ? 1 : result->length);
    if (result->data == NULL)
    {
        result->length = 0;
        nmod_poly_clear(polynomial);
        return 0;
    }
    for (slong index = 0; index < count; index++)
    {
        const ulong value = nmod_poly_get_coeff_ui(polynomial, index);
        for (size_t byte = 0; byte < 8; byte++)
            result->data[(size_t) index * 8 + byte] =
                (unsigned char) (value >> (8 * byte));
    }
    nmod_poly_clear(polynomial);
    return 1;
}

static inline int sagejs_nmod_matrix_charpoly(
    sagejs_flint_byte_region_t result,
    const sagejs_nmod_matrix_t source)
{
    return sagejs_nmod_matrix_polynomial_bytes(result, source, 0);
}

static inline int sagejs_nmod_matrix_minpoly(
    sagejs_flint_byte_region_t result,
    const sagejs_nmod_matrix_t source)
{
    return sagejs_nmod_matrix_polynomial_bytes(result, source, 1);
}

#endif
