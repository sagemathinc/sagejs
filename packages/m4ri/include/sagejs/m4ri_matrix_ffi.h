#ifndef SAGEJS_M4RI_MATRIX_FFI_H
#define SAGEJS_M4RI_MATRIX_FFI_H

#include <limits.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#if !defined(_WIN32)
#include <m4ri/m4ri.h>
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef struct
{
#if defined(_WIN32)
    void *value;
#else
    mzd_t *value;
#endif
    size_t retained_bytes;
    uint64_t known_rank;
    int rank_is_known;
} sagejs_m4ri_matrix_struct;

typedef sagejs_m4ri_matrix_struct sagejs_m4ri_matrix_t[1];

typedef struct
{
    unsigned char *data;
    size_t length;
} sagejs_m4ri_byte_region_struct;

typedef sagejs_m4ri_byte_region_struct sagejs_m4ri_byte_region_t[1];

static inline size_t sagejs_m4ri_size_add(size_t left, size_t right)
{
    return left > SIZE_MAX - right ? SIZE_MAX : left + right;
}

static inline size_t sagejs_m4ri_size_multiply(size_t left, size_t right)
{
    return left != 0 && right > SIZE_MAX / left ? SIZE_MAX : left * right;
}

static inline int sagejs_m4ri_available(void)
{
#if defined(_WIN32)
    return 0;
#else
    return 1;
#endif
}

static inline size_t sagejs_m4ri_matrix_allocated_bytes(
    const sagejs_m4ri_matrix_t matrix)
{
    return matrix->retained_bytes;
}

static inline size_t sagejs_m4ri_byte_region_allocated_bytes(
    const sagejs_m4ri_byte_region_t region)
{
    return sagejs_m4ri_size_add(
        sizeof(sagejs_m4ri_byte_region_struct),
        region->data == NULL ? 0 : (region->length == 0 ? 1 : region->length));
}

static inline void sagejs_m4ri_byte_region_clear(
    sagejs_m4ri_byte_region_t region)
{
    free(region->data);
    region->data = NULL;
    region->length = 0;
}

static inline const unsigned char *sagejs_m4ri_byte_region_data(
    const sagejs_m4ri_byte_region_t region)
{
    return region->data;
}

static inline uint64_t sagejs_m4ri_byte_region_length(
    const sagejs_m4ri_byte_region_t region)
{
    return (uint64_t) region->length;
}

static inline int sagejs_m4ri_byte_region_init_copy(
    sagejs_m4ri_byte_region_t result,
    const unsigned char *source,
    size_t length)
{
    result->data = NULL;
    result->length = 0;
    if (length != 0 && source == NULL)
        return 0;
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (result->data == NULL)
        return 0;
    if (length != 0)
        memcpy(result->data, source, length);
    result->length = length;
    return 1;
}

#if !defined(_WIN32)

static inline int sagejs_m4ri_checked_dimensions(
    uint64_t rows, uint64_t columns, rci_t *r, rci_t *c)
{
    if (rows > (uint64_t) INT_MAX || columns > (uint64_t) INT_MAX)
        return 0;
    const size_t width = columns == 0 ? 0 : (size_t) ((columns + 63) / 64);
    const size_t rowstride = (width & 1) == 0 ? width : width + 1;
    if (rows != 0 && rowstride > SIZE_MAX / (size_t) rows)
        return 0;
    if ((size_t) rows * rowstride > SIZE_MAX / sizeof(word))
        return 0;
    *r = (rci_t) rows;
    *c = (rci_t) columns;
    return 1;
}

static inline size_t sagejs_m4ri_matrix_physical_bytes(const mzd_t *matrix)
{
    return sagejs_m4ri_size_add(
        sizeof(sagejs_m4ri_matrix_struct) + sizeof(mzd_t),
        sagejs_m4ri_size_multiply(
            sagejs_m4ri_size_multiply(
                (size_t) matrix->nrows, (size_t) matrix->rowstride),
            sizeof(word)));
}

static inline int sagejs_m4ri_matrix_adopt(
    sagejs_m4ri_matrix_t result, mzd_t *value)
{
    result->value = value;
    result->retained_bytes =
        value == NULL ? 0 : sagejs_m4ri_matrix_physical_bytes(value);
    result->known_rank = 0;
    result->rank_is_known =
        value != NULL && (value->nrows == 0 || value->ncols == 0);
    return value != NULL;
}

static inline int sagejs_m4ri_matrix_adopt_with_rank(
    sagejs_m4ri_matrix_t result, mzd_t *value, uint64_t rank)
{
    if (!sagejs_m4ri_matrix_adopt(result, value))
        return 0;
    result->known_rank = rank;
    result->rank_is_known = 1;
    return 1;
}

static inline int sagejs_m4ri_matrix_init(
    sagejs_m4ri_matrix_t result, uint64_t rows, uint64_t columns)
{
    rci_t r;
    rci_t c;
    result->value = NULL;
    result->retained_bytes = 0;
    result->known_rank = 0;
    result->rank_is_known = 0;
    if (!sagejs_m4ri_checked_dimensions(rows, columns, &r, &c))
        return 0;
    return sagejs_m4ri_matrix_adopt_with_rank(result, mzd_init(r, c), 0);
}

static inline void sagejs_m4ri_matrix_clear(sagejs_m4ri_matrix_t matrix)
{
    if (matrix->value != NULL)
        mzd_free(matrix->value);
    matrix->value = NULL;
    matrix->retained_bytes = 0;
    matrix->known_rank = 0;
    matrix->rank_is_known = 0;
}

static inline mzd_t *sagejs_m4ri_safe_copy(const mzd_t *source)
{
    if (source->nrows == 0 || source->ncols == 0)
        return mzd_init(source->nrows, source->ncols);
    return mzd_copy(NULL, source);
}

static inline uint64_t sagejs_m4ri_matrix_nrows(
    const sagejs_m4ri_matrix_t matrix)
{
    return (uint64_t) matrix->value->nrows;
}

static inline uint64_t sagejs_m4ri_matrix_ncols(
    const sagejs_m4ri_matrix_t matrix)
{
    return (uint64_t) matrix->value->ncols;
}

static inline int sagejs_m4ri_matrix_set_entry(
    sagejs_m4ri_matrix_t matrix,
    uint64_t row,
    uint64_t column,
    uint64_t value)
{
    if (value > 1 || row >= (uint64_t) matrix->value->nrows ||
        column >= (uint64_t) matrix->value->ncols)
        return 0;
    if ((uint64_t) mzd_read_bit(
            matrix->value, (rci_t) row, (rci_t) column) != value)
    {
        mzd_write_bit(matrix->value, (rci_t) row, (rci_t) column, (BIT) value);
        matrix->known_rank = 0;
        matrix->rank_is_known = 0;
    }
    return 1;
}

static inline int sagejs_m4ri_matrix_swap_rows(
    sagejs_m4ri_matrix_t matrix, uint64_t first, uint64_t second)
{
    if (first >= (uint64_t) matrix->value->nrows ||
        second >= (uint64_t) matrix->value->nrows)
        return 0;
    mzd_row_swap(matrix->value, (rci_t) first, (rci_t) second);
    return 1;
}

static inline int sagejs_m4ri_matrix_swap_columns(
    sagejs_m4ri_matrix_t matrix, uint64_t first, uint64_t second)
{
    if (first >= (uint64_t) matrix->value->ncols ||
        second >= (uint64_t) matrix->value->ncols)
        return 0;
    mzd_col_swap(matrix->value, (rci_t) first, (rci_t) second);
    return 1;
}

static inline uint64_t sagejs_m4ri_matrix_entry_code(
    const sagejs_m4ri_matrix_t matrix, uint64_t row, uint64_t column)
{
    if (row >= (uint64_t) matrix->value->nrows ||
        column >= (uint64_t) matrix->value->ncols)
        return 2;
    return (uint64_t) mzd_read_bit(
        matrix->value, (rci_t) row, (rci_t) column);
}

static inline int sagejs_m4ri_matrix_init_set(
    sagejs_m4ri_matrix_t result, const sagejs_m4ri_matrix_t source)
{
    mzd_t *copy = sagejs_m4ri_safe_copy(source->value);
    if (source->rank_is_known)
        return sagejs_m4ri_matrix_adopt_with_rank(
            result, copy, source->known_rank);
    return sagejs_m4ri_matrix_adopt(result, copy);
}

/*
 * Copy rows in the caller's order and permit repetitions. Validate the
 * complete borrowed index vector and output dimensions before allocating the
 * independent owned result.
 */
static inline int sagejs_m4ri_matrix_select_rows(
    sagejs_m4ri_matrix_t result, const sagejs_m4ri_matrix_t source,
    const uint64_t *selected_rows, uint64_t count)
{
    rci_t result_rows;
    rci_t result_columns;
    const uint64_t source_rows = (uint64_t) source->value->nrows;
    const uint64_t source_columns = (uint64_t) source->value->ncols;
    if ((count != 0 && selected_rows == NULL) ||
        !sagejs_m4ri_checked_dimensions(
            count, source_columns, &result_rows, &result_columns))
        return 0;
    for (uint64_t row = 0; row < count; row++)
        if (selected_rows[row] >= source_rows)
            return 0;
    mzd_t *selected = mzd_init(result_rows, result_columns);
    if (result_columns != 0)
        for (rci_t row = 0; row < result_rows; row++)
            mzd_copy_row(
                selected, row, source->value, (rci_t) selected_rows[row]);
    return sagejs_m4ri_matrix_adopt(result, selected);
}

static inline int sagejs_m4ri_matrix_prefix_rows(
    sagejs_m4ri_matrix_t result, const sagejs_m4ri_matrix_t source,
    uint64_t count)
{
    rci_t result_rows;
    rci_t result_columns;
    const uint64_t source_rows = (uint64_t) source->value->nrows;
    const uint64_t source_columns = (uint64_t) source->value->ncols;
    if (count > source_rows || !sagejs_m4ri_checked_dimensions(
            count, source_columns, &result_rows, &result_columns))
        return 0;
    mzd_t *selected = mzd_init(result_rows, result_columns);
    if (selected == NULL)
        return 0;
    if (result_columns != 0)
        for (rci_t row = 0; row < result_rows; row++)
            mzd_copy_row(selected, row, source->value, row);
    return sagejs_m4ri_matrix_adopt(result, selected);
}

static inline int sagejs_m4ri_matrix_equal(
    const sagejs_m4ri_matrix_t left, const sagejs_m4ri_matrix_t right)
{
    if (left->value->nrows != right->value->nrows ||
        left->value->ncols != right->value->ncols)
        return 0;
    if (left->value->nrows == 0 || left->value->ncols == 0)
        return 1;
    return mzd_equal(left->value, right->value);
}

static inline int sagejs_m4ri_matrix_add(
    sagejs_m4ri_matrix_t result,
    const sagejs_m4ri_matrix_t left,
    const sagejs_m4ri_matrix_t right)
{
    if (left->value->nrows != right->value->nrows ||
        left->value->ncols != right->value->ncols)
        return 0;
    if (left->value->nrows == 0 || left->value->ncols == 0)
        return sagejs_m4ri_matrix_init(
            result, (uint64_t) left->value->nrows,
            (uint64_t) left->value->ncols);
    return sagejs_m4ri_matrix_adopt(
        result, mzd_add(NULL, left->value, right->value));
}

static inline int sagejs_m4ri_matrix_mul(
    sagejs_m4ri_matrix_t result,
    const sagejs_m4ri_matrix_t left,
    const sagejs_m4ri_matrix_t right)
{
    if (left->value->ncols != right->value->nrows)
        return 0;
    if (left->value->nrows == 0 || right->value->ncols == 0 ||
        left->value->ncols == 0)
        return sagejs_m4ri_matrix_init(
            result, (uint64_t) left->value->nrows,
            (uint64_t) right->value->ncols);
    return sagejs_m4ri_matrix_adopt(
        result, mzd_mul(NULL, left->value, right->value, 0));
}

static inline int sagejs_m4ri_matrix_transpose(
    sagejs_m4ri_matrix_t result, const sagejs_m4ri_matrix_t source)
{
    if (source->value->nrows == 0 || source->value->ncols == 0)
        return sagejs_m4ri_matrix_init(
            result, (uint64_t) source->value->ncols,
            (uint64_t) source->value->nrows);
    mzd_t *transpose = mzd_transpose(NULL, source->value);
    if (source->rank_is_known)
        return sagejs_m4ri_matrix_adopt_with_rank(
            result, transpose, source->known_rank);
    return sagejs_m4ri_matrix_adopt(result, transpose);
}

static inline uint64_t sagejs_m4ri_matrix_rank(
    const sagejs_m4ri_matrix_t source)
{
    if (source->rank_is_known)
        return source->known_rank;
    if (source->value->nrows == 0 || source->value->ncols == 0)
        return 0;
    mzd_t *work = mzd_copy(NULL, source->value);
    const rci_t rank = mzd_echelonize(work, 0);
    mzd_free(work);
    return (uint64_t) rank;
}

static inline int sagejs_m4ri_matrix_rref(
    sagejs_m4ri_matrix_t result, const sagejs_m4ri_matrix_t source)
{
    mzd_t *work = sagejs_m4ri_safe_copy(source->value);
    rci_t rank = 0;
    if (source->value->nrows != 0 && source->value->ncols != 0)
        rank = mzd_echelonize(work, 1);
    return sagejs_m4ri_matrix_adopt_with_rank(
        result, work, (uint64_t) rank);
}

static inline uint64_t sagejs_m4ri_matrix_determinant_code(
    const sagejs_m4ri_matrix_t source)
{
    if (source->value->nrows != source->value->ncols)
        return 2;
    if (source->value->nrows == 0)
        return 1;
    return sagejs_m4ri_matrix_rank(source) == (uint64_t) source->value->nrows;
}

static inline int sagejs_m4ri_matrix_inverse(
    sagejs_m4ri_matrix_t result, const sagejs_m4ri_matrix_t source)
{
    const rci_t n = source->value->nrows;
    result->value = NULL;
    result->retained_bytes = 0;
    result->known_rank = 0;
    result->rank_is_known = 0;
    if (n != source->value->ncols)
        return 0;
    if (n == 0)
        return sagejs_m4ri_matrix_init(result, 0, 0);
    const uint64_t aligned_words = 64 * (uint64_t) source->value->width;
    if (aligned_words > (uint64_t) INT_MAX / 2)
        return 0;
    const rci_t aligned = (rci_t) aligned_words;
    mzd_t *augmented = mzd_init(n, 2 * aligned);
    mzd_t *left = mzd_init_window(augmented, 0, 0, n, n);
    mzd_t *right = mzd_init_window(augmented, 0, aligned, n, aligned + n);
    for (rci_t row = 0; row < n; row++)
    {
        for (rci_t column = 0; column < n; column++)
            mzd_write_bit(left, row, column,
                mzd_read_bit(source->value, row, column));
        mzd_write_bit(right, row, row, 1);
    }
    (void) mzd_echelonize_m4ri(augmented, 1, 0);
    int invertible = 1;
    for (rci_t row = 0; invertible && row < n; row++)
        for (rci_t column = 0; column < n; column++)
            if (mzd_read_bit(left, row, column) != (BIT) (row == column))
            {
                invertible = 0;
                break;
            }
    mzd_t *inverse = invertible ? mzd_copy(NULL, right) : NULL;
    mzd_free_window(right);
    mzd_free_window(left);
    mzd_free(augmented);
    return invertible && sagejs_m4ri_matrix_adopt_with_rank(
        result, inverse, (uint64_t) n);
}

static inline int sagejs_m4ri_matrix_is_zero_safe(const mzd_t *matrix)
{
    if (matrix->nrows == 0 || matrix->ncols == 0)
        return 1;
    for (rci_t row = 0; row < matrix->nrows; row++)
        for (wi_t column = 0; column < matrix->width; column++)
            if (mzd_row_const(matrix, row)[column] != 0)
                return 0;
    return 1;
}

static inline int sagejs_m4ri_matrix_solve(
    sagejs_m4ri_matrix_t result,
    const sagejs_m4ri_matrix_t left,
    const sagejs_m4ri_matrix_t right)
{
    const rci_t rows = left->value->nrows;
    const rci_t columns = left->value->ncols;
    const rci_t right_columns = right->value->ncols;
    result->value = NULL;
    result->retained_bytes = 0;
    result->known_rank = 0;
    result->rank_is_known = 0;
    if (rows != right->value->nrows)
        return 0;
    if (right_columns == 0)
        return sagejs_m4ri_matrix_init(
            result, (uint64_t) columns, 0);
    if (columns == 0)
    {
        if (!sagejs_m4ri_matrix_is_zero_safe(right->value))
            return 0;
        return sagejs_m4ri_matrix_init(result, 0, (uint64_t) right_columns);
    }
    if (rows == 0)
        return sagejs_m4ri_matrix_init(
            result, (uint64_t) columns, (uint64_t) right_columns);
    mzd_t *a = mzd_copy(NULL, left->value);
    const rci_t padded_rows = rows > columns ? rows : columns;
    mzd_t *b = mzd_init(padded_rows, right_columns);
    for (rci_t row = 0; row < rows; row++)
        for (rci_t column = 0; column < right_columns; column++)
            mzd_write_bit(b, row, column,
                mzd_read_bit(right->value, row, column));
    const int solved = mzd_solve_left(a, b, 0, 1) == 0;
    mzd_free(a);
    if (!solved)
    {
        mzd_free(b);
        return 0;
    }
    mzd_t *answer = mzd_init(columns, right_columns);
    for (rci_t row = 0; row < columns; row++)
        for (rci_t column = 0; column < right_columns; column++)
            mzd_write_bit(answer, row, column, mzd_read_bit(b, row, column));
    mzd_free(b);
    return sagejs_m4ri_matrix_adopt(result, answer);
}

static inline int sagejs_m4ri_matrix_right_kernel(
    sagejs_m4ri_matrix_t result, const sagejs_m4ri_matrix_t source)
{
    const rci_t rows = source->value->nrows;
    const rci_t columns = source->value->ncols;
    if (columns == 0)
        return sagejs_m4ri_matrix_init(result, 0, 0);
    if (rows == 0)
    {
        mzd_t *identity = mzd_init(columns, columns);
        for (rci_t index = 0; index < columns; index++)
            mzd_write_bit(identity, index, index, 1);
        return sagejs_m4ri_matrix_adopt(result, identity);
    }
    mzd_t *work = mzd_copy(NULL, source->value);
    mzd_t *columns_basis = mzd_kernel_left_pluq(work, 0);
    mzd_free(work);
    if (columns_basis == NULL)
        return sagejs_m4ri_matrix_init(result, 0, (uint64_t) columns);
    mzd_t *rows_basis = mzd_transpose(NULL, columns_basis);
    mzd_free(columns_basis);
    if (rows_basis->nrows != 0 && rows_basis->ncols != 0)
        (void) mzd_echelonize(rows_basis, 1);
    return sagejs_m4ri_matrix_adopt_with_rank(
        result, rows_basis, (uint64_t) rows_basis->nrows);
}

static inline uint64_t sagejs_m4ri_read_u64_le(
    const unsigned char *data)
{
    uint64_t result = 0;
    for (size_t byte = 0; byte < 8; byte++)
        result |= (uint64_t) data[byte] << (8 * byte);
    return result;
}

static inline void sagejs_m4ri_write_u64_le(
    unsigned char *data, uint64_t value)
{
    for (size_t byte = 0; byte < 8; byte++)
        data[byte] = (unsigned char) (value >> (8 * byte));
}

static inline int sagejs_m4ri_matrix_logical_words(
    sagejs_m4ri_byte_region_t result, const sagejs_m4ri_matrix_t source)
{
    const size_t words = sagejs_m4ri_size_multiply(
        (size_t) source->value->nrows, (size_t) source->value->width);
    const size_t length = sagejs_m4ri_size_multiply(words, 8);
    result->data = NULL;
    result->length = 0;
    if (words == SIZE_MAX || length == SIZE_MAX)
        return 0;
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (result->data == NULL)
        return 0;
    size_t offset = 0;
    for (rci_t row = 0; row < source->value->nrows; row++)
        for (wi_t column = 0; column < source->value->width; column++)
        {
            uint64_t value = mzd_row_const(source->value, row)[column];
            if (column + 1 == source->value->width)
                value &= source->value->high_bitmask;
            sagejs_m4ri_write_u64_le(result->data + offset, value);
            offset += 8;
        }
    result->length = length;
    return 1;
}

static inline int sagejs_m4ri_matrix_init_logical_words(
    sagejs_m4ri_matrix_t result,
    const sagejs_m4ri_byte_region_t source,
    uint64_t rows,
    uint64_t columns)
{
    rci_t r;
    rci_t c;
    if (!sagejs_m4ri_checked_dimensions(rows, columns, &r, &c))
        return 0;
    const size_t width = columns == 0 ? 0 : (size_t) ((columns + 63) / 64);
    const size_t words = sagejs_m4ri_size_multiply((size_t) rows, width);
    const size_t length = sagejs_m4ri_size_multiply(words, 8);
    if (words == SIZE_MAX || length == SIZE_MAX || source->length != length ||
        (length != 0 && source->data == NULL))
        return 0;
    mzd_t *matrix = mzd_init(r, c);
    size_t offset = 0;
    for (rci_t row = 0; row < r; row++)
        for (wi_t column = 0; column < matrix->width; column++)
        {
            const uint64_t value =
                sagejs_m4ri_read_u64_le(source->data + offset);
            if (column + 1 == matrix->width &&
                (value & ~matrix->high_bitmask) != 0)
            {
                mzd_free(matrix);
                return 0;
            }
            mzd_row(matrix, row)[column] = value;
            offset += 8;
        }
    return sagejs_m4ri_matrix_adopt(result, matrix);
}

static inline int sagejs_m4ri_matrix_sagepack_bytes(
    sagejs_m4ri_byte_region_t result, const sagejs_m4ri_matrix_t source)
{
    const size_t length = sagejs_m4ri_size_multiply(
        (size_t) source->value->nrows, (size_t) source->value->ncols);
    result->data = NULL;
    result->length = 0;
    if (length == SIZE_MAX)
        return 0;
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (result->data == NULL)
        return 0;
    size_t offset = 0;
    for (rci_t row = 0; row < source->value->nrows; row++)
        for (rci_t column = 0; column < source->value->ncols; column++)
            result->data[offset++] = (unsigned char)
                mzd_read_bit(source->value, row, column);
    result->length = length;
    return 1;
}

static inline int sagejs_m4ri_matrix_init_sagepack_bytes(
    sagejs_m4ri_matrix_t result,
    const sagejs_m4ri_byte_region_t source,
    uint64_t rows,
    uint64_t columns)
{
    rci_t r;
    rci_t c;
    if (!sagejs_m4ri_checked_dimensions(rows, columns, &r, &c))
        return 0;
    const size_t length = sagejs_m4ri_size_multiply(
        (size_t) rows, (size_t) columns);
    if (length == SIZE_MAX || source->length != length ||
        (length != 0 && source->data == NULL))
        return 0;
    mzd_t *matrix = mzd_init(r, c);
    size_t offset = 0;
    for (rci_t row = 0; row < r; row++)
        for (rci_t column = 0; column < c; column++)
        {
            const unsigned char value = source->data[offset++];
            if (value > 1)
            {
                mzd_free(matrix);
                return 0;
            }
            mzd_write_bit(matrix, row, column, (BIT) value);
        }
    return sagejs_m4ri_matrix_adopt(result, matrix);
}

static inline int sagejs_m4ri_matrix_format(
    sagejs_m4ri_byte_region_t result, const sagejs_m4ri_matrix_t source)
{
    const size_t rows = (size_t) source->value->nrows;
    const size_t columns = (size_t) source->value->ncols;
    size_t length = rows == 0 ? 2 : 0;
    if (rows != 0)
    {
        const size_t row_length = sagejs_m4ri_size_add(
            2, columns == 0 ? 0 : sagejs_m4ri_size_add(columns, columns - 1));
        length = sagejs_m4ri_size_add(
            sagejs_m4ri_size_multiply(rows, row_length), rows - 1);
    }
    result->data = NULL;
    result->length = 0;
    if (length == SIZE_MAX)
        return 0;
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (result->data == NULL)
        return 0;
    size_t offset = 0;
    if (rows == 0)
    {
        result->data[offset++] = '[';
        result->data[offset++] = ']';
    }
    else
    {
        for (rci_t row = 0; row < source->value->nrows; row++)
        {
            result->data[offset++] = '[';
            for (rci_t column = 0; column < source->value->ncols; column++)
            {
                result->data[offset++] = (unsigned char)
                    ('0' + mzd_read_bit(source->value, row, column));
                if (column + 1 < source->value->ncols)
                    result->data[offset++] = ' ';
            }
            result->data[offset++] = ']';
            if (row + 1 < source->value->nrows)
                result->data[offset++] = '\n';
        }
    }
    result->length = length;
    return 1;
}

#else

static inline int sagejs_m4ri_matrix_init(
    sagejs_m4ri_matrix_t result, uint64_t rows, uint64_t columns)
{
    (void) rows;
    (void) columns;
    result->value = NULL;
    result->retained_bytes = 0;
    result->known_rank = 0;
    result->rank_is_known = 0;
    return 0;
}

static inline void sagejs_m4ri_matrix_clear(sagejs_m4ri_matrix_t matrix)
{
    matrix->value = NULL;
    matrix->retained_bytes = 0;
    matrix->known_rank = 0;
    matrix->rank_is_known = 0;
}

#define SAGEJS_M4RI_STUB_DIRECT(name) \
    static inline uint64_t name(const sagejs_m4ri_matrix_t matrix) \
    { (void) matrix; return 0; }
SAGEJS_M4RI_STUB_DIRECT(sagejs_m4ri_matrix_nrows)
SAGEJS_M4RI_STUB_DIRECT(sagejs_m4ri_matrix_ncols)
SAGEJS_M4RI_STUB_DIRECT(sagejs_m4ri_matrix_rank)
SAGEJS_M4RI_STUB_DIRECT(sagejs_m4ri_matrix_determinant_code)
#undef SAGEJS_M4RI_STUB_DIRECT

static inline uint64_t sagejs_m4ri_matrix_entry_code(
    const sagejs_m4ri_matrix_t matrix, uint64_t row, uint64_t column)
{ (void) matrix; (void) row; (void) column; return 2; }
static inline int sagejs_m4ri_matrix_set_entry(
    sagejs_m4ri_matrix_t matrix, uint64_t row, uint64_t column, uint64_t value)
{ (void) matrix; (void) row; (void) column; (void) value; return 0; }
static inline int sagejs_m4ri_matrix_swap_rows(
    sagejs_m4ri_matrix_t matrix, uint64_t first, uint64_t second)
{ (void) matrix; (void) first; (void) second; return 0; }
static inline int sagejs_m4ri_matrix_swap_columns(
    sagejs_m4ri_matrix_t matrix, uint64_t first, uint64_t second)
{ (void) matrix; (void) first; (void) second; return 0; }
static inline int sagejs_m4ri_matrix_equal(
    const sagejs_m4ri_matrix_t left, const sagejs_m4ri_matrix_t right)
{ (void) left; (void) right; return 0; }

#define SAGEJS_M4RI_STUB_UNARY(name) \
    static inline int name(sagejs_m4ri_matrix_t result, \
        const sagejs_m4ri_matrix_t source) \
    { (void) result; (void) source; return 0; }
SAGEJS_M4RI_STUB_UNARY(sagejs_m4ri_matrix_init_set)
SAGEJS_M4RI_STUB_UNARY(sagejs_m4ri_matrix_transpose)
SAGEJS_M4RI_STUB_UNARY(sagejs_m4ri_matrix_rref)
SAGEJS_M4RI_STUB_UNARY(sagejs_m4ri_matrix_inverse)
SAGEJS_M4RI_STUB_UNARY(sagejs_m4ri_matrix_right_kernel)
#undef SAGEJS_M4RI_STUB_UNARY

static inline int sagejs_m4ri_matrix_select_rows(
    sagejs_m4ri_matrix_t result, const sagejs_m4ri_matrix_t source,
    const uint64_t *selected_rows, uint64_t count)
{
    (void) result;
    (void) source;
    (void) selected_rows;
    (void) count;
    return 0;
}

static inline int sagejs_m4ri_matrix_prefix_rows(
    sagejs_m4ri_matrix_t result, const sagejs_m4ri_matrix_t source,
    uint64_t count)
{
    (void) result;
    (void) source;
    (void) count;
    return 0;
}

#define SAGEJS_M4RI_STUB_BINARY(name) \
    static inline int name(sagejs_m4ri_matrix_t result, \
        const sagejs_m4ri_matrix_t left, const sagejs_m4ri_matrix_t right) \
    { (void) result; (void) left; (void) right; return 0; }
SAGEJS_M4RI_STUB_BINARY(sagejs_m4ri_matrix_add)
SAGEJS_M4RI_STUB_BINARY(sagejs_m4ri_matrix_mul)
SAGEJS_M4RI_STUB_BINARY(sagejs_m4ri_matrix_solve)
#undef SAGEJS_M4RI_STUB_BINARY

#define SAGEJS_M4RI_STUB_REGION(name) \
    static inline int name(sagejs_m4ri_byte_region_t result, \
        const sagejs_m4ri_matrix_t source) \
    { (void) result; (void) source; return 0; }
SAGEJS_M4RI_STUB_REGION(sagejs_m4ri_matrix_logical_words)
SAGEJS_M4RI_STUB_REGION(sagejs_m4ri_matrix_sagepack_bytes)
SAGEJS_M4RI_STUB_REGION(sagejs_m4ri_matrix_format)
#undef SAGEJS_M4RI_STUB_REGION

#define SAGEJS_M4RI_STUB_INGRESS(name) \
    static inline int name(sagejs_m4ri_matrix_t result, \
        const sagejs_m4ri_byte_region_t source, uint64_t rows, uint64_t columns) \
    { (void) result; (void) source; (void) rows; (void) columns; return 0; }
SAGEJS_M4RI_STUB_INGRESS(sagejs_m4ri_matrix_init_logical_words)
SAGEJS_M4RI_STUB_INGRESS(sagejs_m4ri_matrix_init_sagepack_bytes)
#undef SAGEJS_M4RI_STUB_INGRESS

#endif

#ifdef __cplusplus
}
#endif

#endif
