#ifndef SAGEJS_FMPZ_MATRIX_FFI_H
#define SAGEJS_FMPZ_MATRIX_FFI_H

#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/fmpz_mat.h>

#include "sagejs/fmpq_matrix_ffi.h"

/*
 * Host-neutral owned-resource ABI for dense integer matrices.
 *
 * An fmpz matrix is a valid mathematical value after every successful entry
 * mutation: FLINT initializes all entries to zero and each setter replaces one
 * complete fmpz.  Unlike polynomial builders, no normalization/seal phase is
 * necessary.  Generated adapters own and type-check these resources, account
 * for their retained native memory, and clear them exactly once.
 */

typedef struct
{
    fmpz_mat_t value;
    size_t retained_bytes;
} sagejs_fmpz_matrix_struct;

typedef sagejs_fmpz_matrix_struct sagejs_fmpz_matrix_t[1];

static inline size_t sagejs_fmpz_matrix_structural_bytes(
    uint64_t rows, uint64_t columns)
{
    const size_t entries = sagejs_retained_size_multiply(
        (size_t) rows, (size_t) columns);
    size_t retained = sizeof(sagejs_fmpz_matrix_struct);
    retained = sagejs_retained_size_add(retained,
        sagejs_retained_size_multiply(entries, sizeof(fmpz)));
    retained = sagejs_retained_size_add(retained,
        sagejs_retained_size_multiply((size_t) rows, sizeof(fmpz *)));
    return retained;
}

static inline void sagejs_fmpz_matrix_recompute_allocated_bytes(
    sagejs_fmpz_matrix_t matrix)
{
    const slong rows = fmpz_mat_nrows(matrix->value);
    const slong columns = fmpz_mat_ncols(matrix->value);
    size_t retained = sagejs_fmpz_matrix_structural_bytes(
        (uint64_t) rows, (uint64_t) columns);
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            retained = sagejs_retained_size_add(retained,
                sagejs_fmpz_retained_bytes(
                    fmpz_mat_entry(matrix->value, row, column)));
    matrix->retained_bytes = retained;
}

static inline size_t sagejs_fmpz_matrix_allocated_bytes(
    const sagejs_fmpz_matrix_t matrix)
{
    return matrix->retained_bytes;
}

static inline int sagejs_fmpz_matrix_dimensions_fit(
    uint64_t rows, uint64_t columns)
{
    return rows <= (uint64_t) WORD_MAX &&
        columns <= (uint64_t) WORD_MAX &&
        (rows == 0 || columns <= (uint64_t) SIZE_MAX / rows) &&
        rows <= (uint64_t) SIZE_MAX / sizeof(fmpz *) &&
        sagejs_retained_size_multiply((size_t) rows, (size_t) columns) <=
            SIZE_MAX / sizeof(fmpz);
}

static inline int sagejs_fmpz_matrix_init(
    sagejs_fmpz_matrix_t result, uint64_t rows, uint64_t columns)
{
    if (!sagejs_fmpz_matrix_dimensions_fit(rows, columns))
        return 0;
    fmpz_mat_init(result->value, (slong) rows, (slong) columns);
    result->retained_bytes = sagejs_fmpz_matrix_structural_bytes(rows, columns);
    return 1;
}

static inline void sagejs_fmpz_matrix_clear(sagejs_fmpz_matrix_t matrix)
{
    fmpz_mat_clear(matrix->value);
    matrix->retained_bytes = 0;
}

static inline uint64_t sagejs_fmpz_matrix_nrows(
    const sagejs_fmpz_matrix_t matrix)
{
    return (uint64_t) fmpz_mat_nrows(matrix->value);
}

static inline uint64_t sagejs_fmpz_matrix_ncols(
    const sagejs_fmpz_matrix_t matrix)
{
    return (uint64_t) fmpz_mat_ncols(matrix->value);
}

static inline int sagejs_fmpz_matrix_set_entry(
    sagejs_fmpz_matrix_t matrix, uint64_t row, uint64_t column,
    const fmpz_t entry)
{
    if (row >= (uint64_t) fmpz_mat_nrows(matrix->value) ||
        column >= (uint64_t) fmpz_mat_ncols(matrix->value))
        return 0;
    fmpz *destination = fmpz_mat_entry(
        matrix->value, (slong) row, (slong) column);
    const size_t previous = sagejs_fmpz_retained_bytes(destination);
    fmpz_set(destination, entry);
    const size_t current = sagejs_fmpz_retained_bytes(destination);
    if (matrix->retained_bytes != SIZE_MAX &&
        previous <= matrix->retained_bytes)
    {
        matrix->retained_bytes -= previous;
        matrix->retained_bytes = sagejs_retained_size_add(
            matrix->retained_bytes, current);
    }
    else
        sagejs_fmpz_matrix_recompute_allocated_bytes(matrix);
    return 1;
}

static inline int sagejs_fmpz_matrix_entry(
    fmpz_t result, const sagejs_fmpz_matrix_t matrix,
    uint64_t row, uint64_t column)
{
    if (row >= (uint64_t) fmpz_mat_nrows(matrix->value) ||
        column >= (uint64_t) fmpz_mat_ncols(matrix->value))
        return 0;
    fmpz_set(result,
        fmpz_mat_entry(matrix->value, (slong) row, (slong) column));
    return 1;
}

static inline void sagejs_fmpz_matrix_finish_result(
    sagejs_fmpz_matrix_t result)
{
    sagejs_fmpz_matrix_recompute_allocated_bytes(result);
}

static inline int sagejs_fmpz_matrix_init_set(
    sagejs_fmpz_matrix_t result, const sagejs_fmpz_matrix_t source)
{
    fmpz_mat_init_set(result->value, source->value);
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_matrix_neg(
    sagejs_fmpz_matrix_t result, const sagejs_fmpz_matrix_t source)
{
    fmpz_mat_init(result->value,
        fmpz_mat_nrows(source->value), fmpz_mat_ncols(source->value));
    fmpz_mat_neg(result->value, source->value);
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_matrix_scalar_mul(
    sagejs_fmpz_matrix_t result, const sagejs_fmpz_matrix_t source,
    const fmpz_t scalar)
{
    fmpz_mat_init(result->value,
        fmpz_mat_nrows(source->value), fmpz_mat_ncols(source->value));
    fmpz_mat_scalar_mul_fmpz(result->value, source->value, scalar);
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_matrix_equal(
    const sagejs_fmpz_matrix_t left, const sagejs_fmpz_matrix_t right)
{
    return fmpz_mat_equal(left->value, right->value);
}

static inline int sagejs_fmpz_matrix_is_zero(
    const sagejs_fmpz_matrix_t matrix)
{
    return fmpz_mat_is_zero(matrix->value);
}

static inline int sagejs_fmpz_matrix_is_one(
    const sagejs_fmpz_matrix_t matrix)
{
    return fmpz_mat_nrows(matrix->value) == fmpz_mat_ncols(matrix->value) &&
        fmpz_mat_is_one(matrix->value);
}

static inline int sagejs_fmpz_matrix_add(
    sagejs_fmpz_matrix_t result, const sagejs_fmpz_matrix_t left,
    const sagejs_fmpz_matrix_t right)
{
    if (fmpz_mat_nrows(left->value) != fmpz_mat_nrows(right->value) ||
        fmpz_mat_ncols(left->value) != fmpz_mat_ncols(right->value))
        return 0;
    fmpz_mat_init(result->value,
        fmpz_mat_nrows(left->value), fmpz_mat_ncols(left->value));
    fmpz_mat_add(result->value, left->value, right->value);
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_matrix_sub(
    sagejs_fmpz_matrix_t result, const sagejs_fmpz_matrix_t left,
    const sagejs_fmpz_matrix_t right)
{
    if (fmpz_mat_nrows(left->value) != fmpz_mat_nrows(right->value) ||
        fmpz_mat_ncols(left->value) != fmpz_mat_ncols(right->value))
        return 0;
    fmpz_mat_init(result->value,
        fmpz_mat_nrows(left->value), fmpz_mat_ncols(left->value));
    fmpz_mat_sub(result->value, left->value, right->value);
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_matrix_transpose(
    sagejs_fmpz_matrix_t result, const sagejs_fmpz_matrix_t source)
{
    fmpz_mat_init(result->value,
        fmpz_mat_ncols(source->value), fmpz_mat_nrows(source->value));
    fmpz_mat_transpose(result->value, source->value);
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_matrix_mul(
    sagejs_fmpz_matrix_t result, const sagejs_fmpz_matrix_t left,
    const sagejs_fmpz_matrix_t right)
{
    if (fmpz_mat_ncols(left->value) != fmpz_mat_nrows(right->value))
        return 0;
    fmpz_mat_init(result->value,
        fmpz_mat_nrows(left->value), fmpz_mat_ncols(right->value));
    fmpz_mat_mul(result->value, left->value, right->value);
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_matrix_pow(
    sagejs_fmpz_matrix_t result, const sagejs_fmpz_matrix_t source,
    uint64_t exponent)
{
    const slong rows = fmpz_mat_nrows(source->value);
    if (rows != fmpz_mat_ncols(source->value) ||
        exponent > (uint64_t) UWORD_MAX)
        return 0;
    fmpz_mat_init(result->value, rows, rows);
    fmpz_mat_pow(result->value, source->value, (ulong) exponent);
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

static inline uint64_t sagejs_fmpz_matrix_rank(
    const sagejs_fmpz_matrix_t matrix)
{
    return (uint64_t) fmpz_mat_rank(matrix->value);
}

static inline int sagejs_fmpz_matrix_det(
    fmpz_t result, const sagejs_fmpz_matrix_t source)
{
    if (fmpz_mat_nrows(source->value) != fmpz_mat_ncols(source->value))
        return 0;
    fmpz_mat_det(result, source->value);
    return 1;
}

static inline int sagejs_fmpz_matrix_trace(
    fmpz_t result, const sagejs_fmpz_matrix_t source)
{
    const slong rows = fmpz_mat_nrows(source->value);
    if (rows != fmpz_mat_ncols(source->value))
        return 0;
    fmpz_zero(result);
    for (slong index = 0; index < rows; index++)
        fmpz_add(result, result, fmpz_mat_entry(source->value, index, index));
    return 1;
}

static inline int sagejs_fmpz_matrix_hnf(
    sagejs_fmpz_matrix_t result, const sagejs_fmpz_matrix_t source)
{
    fmpz_mat_init(result->value,
        fmpz_mat_nrows(source->value), fmpz_mat_ncols(source->value));
    fmpz_mat_hnf(result->value, source->value);
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_matrix_snf(
    sagejs_fmpz_matrix_t result, const sagejs_fmpz_matrix_t source)
{
    fmpz_mat_init(result->value,
        fmpz_mat_nrows(source->value), fmpz_mat_ncols(source->value));
    fmpz_mat_snf(result->value, source->value);
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_matrix_format(
    sagejs_flint_byte_region_t result, const sagejs_fmpz_matrix_t source)
{
    const slong rows = fmpz_mat_nrows(source->value);
    const slong columns = fmpz_mat_ncols(source->value);
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
        entries[index] = fmpz_get_str(NULL, 10,
            fmpz_mat_entry(source->value, row, column));
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
                const char *entry = entries[(size_t) row *
                    (size_t) columns + (size_t) column];
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

/*
 * Stable SJZM v1 integer-matrix serialization:
 *
 *   bytes 0..3    ASCII "SJZM"
 *   byte 4        version 1
 *   bytes 5..7    zero (reserved)
 *   bytes 8..15   row count, unsigned 64-bit little-endian
 *   bytes 16..23  column count, unsigned 64-bit little-endian
 *   remaining     row-major entries
 *
 * Each entry starts with an unsigned 32-bit little-endian header.  Bit 31 is
 * the sign and bits 0..30 are the magnitude byte count.  Magnitudes are
 * unsigned little-endian without leading zero bytes; zero has a zero length
 * and a clear sign bit.  Readers must reject noncanonical encodings.
 */
static inline void sagejs_fmpz_matrix_write_u64(
    unsigned char *data, size_t offset, uint64_t value)
{
    for (size_t byte = 0; byte < 8; byte++)
        data[offset + byte] = (unsigned char) (value >> (8 * byte));
}

static inline uint32_t sagejs_fmpz_matrix_read_u32(
    const unsigned char *data, size_t offset)
{
    uint32_t result = 0;
    for (size_t byte = 0; byte < 4; byte++)
        result |= (uint32_t) data[offset + byte] << (8 * byte);
    return result;
}

static inline uint64_t sagejs_fmpz_matrix_read_u64(
    const unsigned char *data, size_t offset)
{
    uint64_t result = 0;
    for (size_t byte = 0; byte < 8; byte++)
        result |= (uint64_t) data[offset + byte] << (8 * byte);
    return result;
}

static inline void sagejs_fmpz_matrix_write_entry(
    unsigned char *data, size_t *offset, const fmpz_t value,
    fmpz_t magnitude, ulong *words)
{
    const size_t byte_count = sagejs_fmpz_serialized_bytes(value);
    uint32_t header = (uint32_t) byte_count;
    if (fmpz_sgn(value) < 0)
        header |= UINT32_C(0x80000000);
    for (size_t byte = 0; byte < 4; byte++)
        data[(*offset)++] = (unsigned char) (header >> (8 * byte));
    if (byte_count == 0)
        return;
    const slong word_count =
        (slong) ((byte_count + sizeof(ulong) - 1) / sizeof(ulong));
    fmpz_abs(magnitude, value);
    fmpz_get_ui_array(words, word_count, magnitude);
    for (size_t byte = 0; byte < byte_count; byte++)
        data[(*offset)++] = (unsigned char)
            (words[byte / sizeof(ulong)] >>
             (8 * (byte % sizeof(ulong))));
}

static inline int sagejs_fmpz_matrix_serialize(
    sagejs_flint_byte_region_t result, const sagejs_fmpz_matrix_t source)
{
    const slong rows = fmpz_mat_nrows(source->value);
    const slong columns = fmpz_mat_ncols(source->value);
    size_t length = 24;
    size_t maximum_bytes = 0;
    result->data = NULL;
    result->length = 0;
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
        {
            const size_t bytes = sagejs_fmpz_serialized_bytes(
                fmpz_mat_entry(source->value, row, column));
            if (bytes > UINT32_MAX / 2 ||
                !sagejs_size_add(&length, 4) ||
                !sagejs_size_add(&length, bytes))
                return 0;
            if (bytes > maximum_bytes)
                maximum_bytes = bytes;
        }
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (result->data == NULL)
        return 0;
    result->length = length;
    memcpy(result->data, "SJZM", 4);
    result->data[4] = 1;
    result->data[5] = 0;
    result->data[6] = 0;
    result->data[7] = 0;
    sagejs_fmpz_matrix_write_u64(result->data, 8, (uint64_t) rows);
    sagejs_fmpz_matrix_write_u64(result->data, 16, (uint64_t) columns);
    const size_t maximum_words =
        (maximum_bytes + sizeof(ulong) - 1) / sizeof(ulong);
    ulong *words = maximum_words == 0 ? NULL :
        (ulong *) calloc(maximum_words, sizeof(ulong));
    if (maximum_words != 0 && words == NULL)
    {
        sagejs_flint_byte_region_clear(result);
        return 0;
    }
    fmpz_t magnitude;
    fmpz_init(magnitude);
    size_t offset = 24;
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            sagejs_fmpz_matrix_write_entry(result->data, &offset,
                fmpz_mat_entry(source->value, row, column),
                magnitude, words);
    fmpz_clear(magnitude);
    free(words);
    return 1;
}

/*
 * Constructing a byte region is intentionally part of the resource ABI.
 * It gives hosts a safe, pointer-free way to supply persisted SJZM data to
 * the deserializer.  Bulk byte-buffer lowering can later optimize this
 * boundary without changing the stable serialization format.
 */
static inline int sagejs_flint_byte_region_init(
    sagejs_flint_byte_region_t result, uint64_t length)
{
    result->data = NULL;
    result->length = 0;
    if (length > (uint64_t) SIZE_MAX)
        return 0;
    const size_t size = (size_t) length;
    result->data = (unsigned char *) calloc(size == 0 ? 1 : size, 1);
    if (result->data == NULL)
        return 0;
    result->length = size;
    return 1;
}

static inline int sagejs_flint_byte_region_set(
    sagejs_flint_byte_region_t region, uint64_t index, uint64_t value)
{
    if (index >= (uint64_t) region->length || value > UINT8_MAX)
        return 0;
    region->data[(size_t) index] = (unsigned char) value;
    return 1;
}

/*
 * Decode the stable SJZM v1 representation emitted above.
 *
 * The parser validates the complete byte stream before initializing the
 * result, so every rejected input leaves no partially owned FLINT object.
 * Integer magnitudes are canonical unsigned little-endian byte strings:
 * zero has length zero, nonzero values have a nonzero final byte, and the
 * sign bit may not encode negative zero.
 */
static inline int sagejs_fmpz_matrix_deserialize(
    sagejs_fmpz_matrix_t result, const sagejs_flint_byte_region_t source)
{
    const unsigned char *data = source->data;
    const size_t length = source->length;
    if (data == NULL || length < 24 || memcmp(data, "SJZM", 4) != 0 ||
        data[4] != 1 || data[5] != 0 || data[6] != 0 || data[7] != 0)
        return 0;

    const uint64_t rows = sagejs_fmpz_matrix_read_u64(data, 8);
    const uint64_t columns = sagejs_fmpz_matrix_read_u64(data, 16);
    if (!sagejs_fmpz_matrix_dimensions_fit(rows, columns))
        return 0;
    const size_t count = (size_t) rows * (size_t) columns;
    if (count > (length - 24) / 4)
        return 0;

    size_t offset = 24;
    size_t maximum_bytes = 0;
    for (size_t index = 0; index < count; index++)
    {
        if (offset > length - 4)
            return 0;
        const uint32_t header = sagejs_fmpz_matrix_read_u32(data, offset);
        offset += 4;
        const int negative = (header & UINT32_C(0x80000000)) != 0;
        const size_t byte_count =
            (size_t) (header & UINT32_C(0x7fffffff));
        if (byte_count > length - offset ||
            (byte_count == 0 && negative) ||
            (byte_count != 0 && data[offset + byte_count - 1] == 0))
            return 0;
        if (byte_count > maximum_bytes)
            maximum_bytes = byte_count;
        offset += byte_count;
    }
    if (offset != length)
        return 0;

    const size_t maximum_words =
        (maximum_bytes + sizeof(ulong) - 1) / sizeof(ulong);
    ulong *words = maximum_words == 0 ? NULL :
        (ulong *) calloc(maximum_words, sizeof(ulong));
    if (maximum_words != 0 && words == NULL)
        return 0;
    if (!sagejs_fmpz_matrix_init(result, rows, columns))
    {
        free(words);
        return 0;
    }

    offset = 24;
    for (size_t index = 0; index < count; index++)
    {
        const uint32_t header = sagejs_fmpz_matrix_read_u32(data, offset);
        offset += 4;
        const int negative = (header & UINT32_C(0x80000000)) != 0;
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
        fmpz *entry = fmpz_mat_entry(result->value,
            (slong) (index / (size_t) columns),
            (slong) (index % (size_t) columns));
        if (word_count == 0)
            fmpz_zero(entry);
        else
        {
            fmpz_set_ui_array(entry, words, (slong) word_count);
            if (negative)
                fmpz_neg(entry, entry);
        }
        offset += byte_count;
    }
    free(words);
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

#endif
