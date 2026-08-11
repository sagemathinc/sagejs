/* Generated-FFI façade for FFLAS/FFPACK dense small-prime matrices. */
#ifndef SAGEJS_FFLAS_MATRIX_FFI_H
#define SAGEJS_FFLAS_MATRIX_FFI_H

#include <stddef.h>
#include <stdint.h>

#if defined(__cplusplus) && !defined(_WIN32)
#include <algorithm>
#include <limits>
#include <vector>

#include <fflas-ffpack/fflas-ffpack.h>
#include <givaro/modular-floating.h>
#endif

#ifdef __cplusplus
extern "C" {
#endif

static inline int sagejs_fflas_modular_float_available(void)
{
#if defined(_WIN32)
    return 0;
#else
    return 1;
#endif
}

#if defined(__cplusplus) && !defined(_WIN32)

static inline int sagejs_fflas_checked_product(
    uint64_t left, uint64_t right, size_t *result)
{
    if (left > (uint64_t) std::numeric_limits<size_t>::max() ||
        right > (uint64_t) std::numeric_limits<size_t>::max())
        return 0;
    const size_t a = (size_t) left;
    const size_t b = (size_t) right;
    if (a != 0 && b > std::numeric_limits<size_t>::max() / a)
        return 0;
    *result = a * b;
    return 1;
}

static inline int sagejs_fflas_small_prime(uint64_t modulus)
{
    if (modulus < 2 || modulus >= 256)
        return 0;
    for (uint64_t divisor = 2; divisor * divisor <= modulus; ++divisor)
        if (modulus % divisor == 0)
            return modulus == divisor;
    return 1;
}

static inline int sagejs_fflas_import(
    const uint64_t *source,
    size_t length,
    uint64_t modulus,
    const Givaro::Modular<float> &field,
    std::vector<float> *target)
{
    if (length != 0 && source == NULL)
        return 0;
    target->resize(length);
    for (size_t index = 0; index < length; ++index)
    {
        if (source[index] >= modulus)
            return 0;
        field.init((*target)[index], (int) source[index]);
    }
    return 1;
}

static inline int sagejs_fflas_export(
    uint64_t *target,
    const std::vector<float> &source,
    const Givaro::Modular<float> &field)
{
    if (!source.empty() && target == NULL)
        return 0;
    for (size_t index = 0; index < source.size(); ++index)
        field.convert(target[index], source[index]);
    return 1;
}

static inline int sagejs_fflas_modular_float_mul(
    uint64_t *output_data,
    uint64_t *left_data,
    uint64_t *right_data,
    uint64_t output_length,
    uint64_t left_length,
    uint64_t right_length,
    uint64_t left_rows,
    uint64_t inner,
    uint64_t right_columns,
    uint64_t modulus)
{
    size_t expected_output;
    size_t expected_left;
    size_t expected_right;
    if (!sagejs_fflas_small_prime(modulus) ||
        !sagejs_fflas_checked_product(left_rows, right_columns,
                                      &expected_output) ||
        !sagejs_fflas_checked_product(left_rows, inner, &expected_left) ||
        !sagejs_fflas_checked_product(inner, right_columns, &expected_right) ||
        output_length != (uint64_t) expected_output ||
        left_length != (uint64_t) expected_left ||
        right_length != (uint64_t) expected_right ||
        (expected_output != 0 && output_data == NULL))
        return 0;

    Givaro::Modular<float> field((int) modulus);
    std::vector<float> left;
    std::vector<float> right;
    std::vector<float> output(expected_output);
    if (!sagejs_fflas_import(left_data, expected_left, modulus, field, &left) ||
        !sagejs_fflas_import(right_data, expected_right, modulus, field, &right))
        return 0;

    if (expected_output != 0 && inner == 0)
        std::fill(output.begin(), output.end(), field.zero);
    else if (expected_output != 0)
        FFLAS::fgemm(
            field,
            FFLAS::FflasNoTrans,
            FFLAS::FflasNoTrans,
            (size_t) left_rows,
            (size_t) right_columns,
            (size_t) inner,
            field.one,
            left.data(),
            (size_t) inner,
            right.data(),
            (size_t) right_columns,
            field.zero,
            output.data(),
            (size_t) right_columns);

    return sagejs_fflas_export(output_data, output, field);
}

static inline int sagejs_fflas_modular_float_rank(
    uint64_t *rank_data,
    uint64_t *source_data,
    uint64_t rank_length,
    uint64_t source_length,
    uint64_t rows,
    uint64_t columns,
    uint64_t modulus)
{
    size_t expected;
    if (!sagejs_fflas_small_prime(modulus) ||
        !sagejs_fflas_checked_product(rows, columns, &expected) ||
        source_length != (uint64_t) expected ||
        rank_length != 1 || rank_data == NULL)
        return 0;

    if (rows == 0 || columns == 0)
    {
        rank_data[0] = 0;
        return 1;
    }

    Givaro::Modular<float> field((int) modulus);
    std::vector<float> matrix;
    if (!sagejs_fflas_import(source_data, expected, modulus, field, &matrix))
        return 0;

    rank_data[0] = (uint64_t) FFPACK::Rank(
        field,
        (size_t) rows,
        (size_t) columns,
        matrix.data(),
        (size_t) columns);
    return 1;
}

static inline int sagejs_fflas_modular_float_rref(
    uint64_t *output_data,
    uint64_t *rank_data,
    uint64_t *source_data,
    uint64_t output_length,
    uint64_t rank_length,
    uint64_t source_length,
    uint64_t rows,
    uint64_t columns,
    uint64_t modulus)
{
    size_t expected;
    if (!sagejs_fflas_small_prime(modulus) ||
        !sagejs_fflas_checked_product(rows, columns, &expected) ||
        output_length != (uint64_t) expected ||
        source_length != (uint64_t) expected ||
        rank_length != 1 || rank_data == NULL ||
        (expected != 0 && output_data == NULL))
        return 0;

    Givaro::Modular<float> field((int) modulus);
    std::vector<float> matrix;
    if (!sagejs_fflas_import(source_data, expected, modulus, field, &matrix))
        return 0;

    if (rows == 0 || columns == 0 ||
        std::all_of(matrix.begin(), matrix.end(),
                    [&field](float value) { return field.isZero(value); }))
    {
        rank_data[0] = 0;
        return sagejs_fflas_export(output_data, matrix, field);
    }

    std::vector<size_t> row_permutation((size_t) rows);
    std::vector<size_t> column_permutation((size_t) columns);
    std::vector<size_t> echelon_permutation((size_t) columns);
    std::vector<size_t> column_profile((size_t) columns);
    const size_t rank = FFPACK::ReducedRowEchelonForm(
        field,
        (size_t) rows,
        (size_t) columns,
        matrix.data(),
        (size_t) columns,
        row_permutation.data(),
        column_permutation.data(),
        false,
        FFPACK::FfpackTileRecursive);

    FFPACK::RankProfileFromLU(
        column_permutation.data(),
        (size_t) columns,
        rank,
        column_profile.data(),
        FFPACK::FfpackTileRecursive);
    FFPACK::PLUQtoEchelonPermutation(
        (size_t) columns,
        rank,
        column_permutation.data(),
        echelon_permutation.data());
    FFPACK::applyP(
        field,
        FFLAS::FflasLeft,
        FFLAS::FflasNoTrans,
        (size_t) columns,
        0,
        rank,
        matrix.data(),
        (size_t) columns,
        echelon_permutation.data());

    for (size_t row = 0; row < (size_t) rows; ++row)
    {
        for (size_t column = 0; column < rank; ++column)
            matrix[row * (size_t) columns + column] = field.zero;
        if (row < rank)
            matrix[row * (size_t) columns + row] = field.one;
    }

    size_t pivot = 0;
    size_t profile_index = 0;
    size_t nonpivot_index = rank;
    while (profile_index < rank && nonpivot_index < (size_t) columns)
    {
        if (column_profile[profile_index] > pivot)
            column_profile[nonpivot_index++] = pivot++;
        else
        {
            ++profile_index;
            ++pivot;
        }
    }
    while (nonpivot_index < (size_t) columns)
        column_profile[nonpivot_index++] = pivot++;

    FFPACK::MathPerm2LAPACKPerm(
        column_permutation.data(),
        column_profile.data(),
        (size_t) columns);
    FFPACK::applyP(
        field,
        FFLAS::FflasRight,
        FFLAS::FflasNoTrans,
        (size_t) rows,
        0,
        (size_t) columns,
        matrix.data(),
        (size_t) columns,
        column_permutation.data());

    rank_data[0] = (uint64_t) rank;
    return sagejs_fflas_export(output_data, matrix, field);
}

#elif defined(__cplusplus)

static inline int sagejs_fflas_modular_float_mul(
    uint64_t *, uint64_t *, uint64_t *, uint64_t, uint64_t, uint64_t,
    uint64_t, uint64_t, uint64_t, uint64_t)
{
    return 0;
}

static inline int sagejs_fflas_modular_float_rank(
    uint64_t *, uint64_t *, uint64_t, uint64_t, uint64_t, uint64_t, uint64_t)
{
    return 0;
}

static inline int sagejs_fflas_modular_float_rref(
    uint64_t *, uint64_t *, uint64_t *, uint64_t, uint64_t, uint64_t,
    uint64_t, uint64_t, uint64_t)
{
    return 0;
}

#endif

#ifdef __cplusplus
}
#endif

#endif
