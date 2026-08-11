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
} sagejs_fmpq_matrix_struct;

typedef sagejs_fmpq_matrix_struct sagejs_fmpq_matrix_t[1];

typedef fmpq_t sagejs_fmpq_value_t;

typedef struct
{
    unsigned char *data;
    size_t length;
} sagejs_flint_byte_region_struct;

typedef sagejs_flint_byte_region_struct sagejs_flint_byte_region_t[1];

static inline int sagejs_fmpq_matrix_init(
    sagejs_fmpq_matrix_t result, uint64_t rows, uint64_t columns)
{
    if (rows > (uint64_t) WORD_MAX || columns > (uint64_t) WORD_MAX ||
        (rows != 0 && columns > (uint64_t) SIZE_MAX / rows))
        return 0;
    fmpq_mat_init(result->value, (slong) rows, (slong) columns);
    result->known_rank = -1;
    return 1;
}

static inline void sagejs_fmpq_matrix_clear(sagejs_fmpq_matrix_t matrix)
{
    fmpq_mat_clear(matrix->value);
    matrix->known_rank = -1;
}

static inline int sagejs_fmpq_matrix_randbits(
    sagejs_fmpq_matrix_t result, uint64_t rows, uint64_t columns,
    uint64_t bits, uint64_t seed1, uint64_t seed2)
{
    if (bits == 0 || bits > (uint64_t) ULONG_MAX ||
        seed1 > (uint64_t) ULONG_MAX || seed2 > (uint64_t) ULONG_MAX ||
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
    fmpq_set_fmpz_frac(
        fmpq_mat_entry(matrix->value, (slong) row, (slong) column),
        numerator, denominator);
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
    return 1;
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
    return 1;
}

static inline int sagejs_fmpq_matrix_transpose(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t source)
{
    fmpq_mat_init(result->value,
        fmpq_mat_ncols(source->value), fmpq_mat_nrows(source->value));
    fmpq_mat_transpose(result->value, source->value);
    result->known_rank = source->known_rank;
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
        return 0;
    }
    result->known_rank = rows;
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
        return 0;
    }
    result->known_rank = -1;
    return 1;
}

static inline int sagejs_fmpq_matrix_rref(
    sagejs_fmpq_matrix_t result, const sagejs_fmpq_matrix_t source)
{
    fmpq_mat_init(result->value,
        fmpq_mat_nrows(source->value), fmpq_mat_ncols(source->value));
    result->known_rank = fmpq_mat_rref(result->value, source->value);
    return 1;
}

static inline uint64_t sagejs_fmpq_matrix_rank(
    const sagejs_fmpq_matrix_t matrix)
{
    if (matrix->known_rank >= 0)
        return (uint64_t) matrix->known_rank;
    fmpq_mat_t reduced;
    fmpq_mat_init(reduced,
        fmpq_mat_nrows(matrix->value), fmpq_mat_ncols(matrix->value));
    const slong rank = fmpq_mat_rref(reduced, matrix->value);
    fmpq_mat_clear(reduced);
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
    return (size_t) ((fmpz_bits(value) + 7) / 8);
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

static inline uint64_t sagejs_flint_byte_region_length(
    const sagejs_flint_byte_region_t region)
{
    return (uint64_t) region->length;
}

static inline uint64_t sagejs_flint_byte_region_get(
    const sagejs_flint_byte_region_t region, uint64_t index)
{
    return index < (uint64_t) region->length ? (uint64_t) region->data[index] : 0;
}

#endif
