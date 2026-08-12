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

static inline int sagejs_fflas_modular_double_available(void)
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

static inline int sagejs_fflas_double_prime(uint64_t modulus)
{
    if (modulus < 2 ||
        modulus >=
            (uint64_t) Givaro::Modular<double>::maxCardinality())
        return 0;
    for (uint64_t divisor = 2; divisor * divisor <= modulus; ++divisor)
        if (modulus % divisor == 0)
            return modulus == divisor;
    return 1;
}

#ifdef __cplusplus
}
#endif

template <typename Element>
static inline int sagejs_fflas_import(
    const uint64_t *source,
    size_t length,
    uint64_t modulus,
    const Givaro::Modular<Element> &field,
    std::vector<Element> *target)
{
    (void) field;
    if (length != 0 && source == NULL)
        return 0;
    target->resize(length);
    for (size_t index = 0; index < length; ++index)
    {
        if (source[index] >= modulus)
            return 0;
        /* The packed ABI already requires canonical residues.  Both supported
           Givaro representations store those residues as exact floating-point
           integers, so a second field normalization is pure boundary cost. */
        (*target)[index] = static_cast<Element>(source[index]);
    }
    return 1;
}

template <typename Element>
static inline int sagejs_fflas_export(
    uint64_t *target,
    const std::vector<Element> &source,
    const Givaro::Modular<Element> &field)
{
    (void) field;
    if (!source.empty() && target == NULL)
        return 0;
    for (size_t index = 0; index < source.size(); ++index)
        target[index] = static_cast<uint64_t>(source[index]);
    return 1;
}

template <typename Element>
struct sagejs_fflas_allocation
{
    Element *data;

    explicit sagejs_fflas_allocation(Element *value) : data(value) {}

    ~sagejs_fflas_allocation()
    {
        if (data != NULL)
            FFLAS::fflas_delete(data);
    }

    sagejs_fflas_allocation(const sagejs_fflas_allocation &) = delete;
    sagejs_fflas_allocation &operator=(
        const sagejs_fflas_allocation &) = delete;
};

template <typename Element>
static inline size_t sagejs_fflas_canonical_rref(
    const Givaro::Modular<Element> &field,
    size_t rows,
    size_t columns,
    Element *matrix)
{
    if (rows == 0 || columns == 0 ||
        std::all_of(
            matrix,
            matrix + rows * columns,
            [&field](Element value) { return field.isZero(value); }))
        return 0;

    std::vector<size_t> row_permutation(rows);
    std::vector<size_t> column_permutation(columns);
    std::vector<size_t> echelon_permutation(columns);
    std::vector<size_t> column_profile(columns);
    const size_t rank = FFPACK::ReducedRowEchelonForm(
        field,
        rows,
        columns,
        matrix,
        columns,
        row_permutation.data(),
        column_permutation.data(),
        false,
        FFPACK::FfpackTileRecursive);

    FFPACK::RankProfileFromLU(
        column_permutation.data(),
        columns,
        rank,
        column_profile.data(),
        FFPACK::FfpackTileRecursive);
    FFPACK::PLUQtoEchelonPermutation(
        columns,
        rank,
        column_permutation.data(),
        echelon_permutation.data());
    FFPACK::applyP(
        field,
        FFLAS::FflasLeft,
        FFLAS::FflasNoTrans,
        columns,
        0,
        rank,
        matrix,
        columns,
        echelon_permutation.data());

    for (size_t row = 0; row < rows; ++row)
    {
        for (size_t column = 0; column < rank; ++column)
            matrix[row * columns + column] = field.zero;
        if (row < rank)
            matrix[row * columns + row] = field.one;
    }

    size_t pivot = 0;
    size_t profile_index = 0;
    size_t nonpivot_index = rank;
    while (profile_index < rank && nonpivot_index < columns)
    {
        if (column_profile[profile_index] > pivot)
            column_profile[nonpivot_index++] = pivot++;
        else
        {
            ++profile_index;
            ++pivot;
        }
    }
    while (nonpivot_index < columns)
        column_profile[nonpivot_index++] = pivot++;

    FFPACK::MathPerm2LAPACKPerm(
        column_permutation.data(), column_profile.data(), columns);
    FFPACK::applyP(
        field,
        FFLAS::FflasRight,
        FFLAS::FflasNoTrans,
        rows,
        0,
        columns,
        matrix,
        columns,
        column_permutation.data());
    return rank;
}

#ifdef __cplusplus
extern "C" {
#endif

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

    rank_data[0] = (uint64_t) sagejs_fflas_canonical_rref(
        field, (size_t) rows, (size_t) columns, matrix.data());
    return sagejs_fflas_export(output_data, matrix, field);
}

static inline int sagejs_fflas_modular_float_right_nullspace(
    uint64_t *output_data,
    uint64_t *nullity_data,
    uint64_t *source_data,
    uint64_t output_length,
    uint64_t nullity_length,
    uint64_t source_length,
    uint64_t rows,
    uint64_t columns,
    uint64_t modulus)
{
    size_t expected_source;
    size_t expected_output;
    if (!sagejs_fflas_small_prime(modulus) ||
        !sagejs_fflas_checked_product(rows, columns, &expected_source) ||
        !sagejs_fflas_checked_product(columns, columns, &expected_output) ||
        source_length != (uint64_t) expected_source ||
        output_length != (uint64_t) expected_output ||
        nullity_length != 1 || nullity_data == NULL ||
        (expected_output != 0 && output_data == NULL))
        return 0;

    Givaro::Modular<float> field((int) modulus);
    std::vector<float> source;
    std::vector<float> output(expected_output, field.zero);
    if (!sagejs_fflas_import(
            source_data, expected_source, modulus, field, &source))
        return 0;

    if (columns == 0)
    {
        nullity_data[0] = 0;
        return 1;
    }
    if (rows == 0)
    {
        FFLAS::fidentity(
            field,
            (size_t) columns,
            (size_t) columns,
            output.data(),
            (size_t) columns);
        if (!sagejs_fflas_export(output_data, output, field))
            return 0;
        nullity_data[0] = columns;
        return 1;
    }

    sagejs_fflas_allocation<float> basis_owner(NULL);
    size_t leading_dimension = 0;
    size_t nullity = 0;
    const size_t returned_nullity = FFPACK::NullSpaceBasis(
        field,
        FFLAS::FflasRight,
        (size_t) rows,
        (size_t) columns,
        source.data(),
        (size_t) columns,
        basis_owner.data,
        leading_dimension,
        nullity);
    if (returned_nullity != nullity || nullity > (size_t) columns ||
        leading_dimension != nullity ||
        (nullity != 0 && basis_owner.data == NULL))
        return 0;

    for (size_t row = 0; row < nullity; ++row)
        for (size_t column = 0; column < (size_t) columns; ++column)
            output[row * (size_t) columns + column] =
                basis_owner.data[column * leading_dimension + row];

    if (sagejs_fflas_canonical_rref(
            field,
            nullity,
            (size_t) columns,
            output.data()) != nullity)
        return 0;
    if (!sagejs_fflas_export(output_data, output, field))
        return 0;
    nullity_data[0] = (uint64_t) nullity;
    return 1;
}


static inline int sagejs_fflas_modular_double_mul(
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
    if (!sagejs_fflas_double_prime(modulus) ||
        !sagejs_fflas_checked_product(left_rows, right_columns,
                                      &expected_output) ||
        !sagejs_fflas_checked_product(left_rows, inner, &expected_left) ||
        !sagejs_fflas_checked_product(inner, right_columns, &expected_right) ||
        output_length != (uint64_t) expected_output ||
        left_length != (uint64_t) expected_left ||
        right_length != (uint64_t) expected_right ||
        (expected_output != 0 && output_data == NULL))
        return 0;

    Givaro::Modular<double> field((int) modulus);
    std::vector<double> left;
    std::vector<double> right;
    std::vector<double> output(expected_output);
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

static inline int sagejs_fflas_modular_double_rank(
    uint64_t *rank_data,
    uint64_t *source_data,
    uint64_t rank_length,
    uint64_t source_length,
    uint64_t rows,
    uint64_t columns,
    uint64_t modulus)
{
    size_t expected;
    if (!sagejs_fflas_double_prime(modulus) ||
        !sagejs_fflas_checked_product(rows, columns, &expected) ||
        source_length != (uint64_t) expected ||
        rank_length != 1 || rank_data == NULL)
        return 0;

    if (rows == 0 || columns == 0)
    {
        rank_data[0] = 0;
        return 1;
    }

    Givaro::Modular<double> field((int) modulus);
    std::vector<double> matrix;
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

static inline int sagejs_fflas_modular_double_rref(
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
    if (!sagejs_fflas_double_prime(modulus) ||
        !sagejs_fflas_checked_product(rows, columns, &expected) ||
        output_length != (uint64_t) expected ||
        source_length != (uint64_t) expected ||
        rank_length != 1 || rank_data == NULL ||
        (expected != 0 && output_data == NULL))
        return 0;

    Givaro::Modular<double> field((int) modulus);
    std::vector<double> matrix;
    if (!sagejs_fflas_import(source_data, expected, modulus, field, &matrix))
        return 0;

    rank_data[0] = (uint64_t) sagejs_fflas_canonical_rref(
        field, (size_t) rows, (size_t) columns, matrix.data());
    return sagejs_fflas_export(output_data, matrix, field);
}

static inline int sagejs_fflas_modular_double_right_nullspace(
    uint64_t *output_data,
    uint64_t *nullity_data,
    uint64_t *source_data,
    uint64_t output_length,
    uint64_t nullity_length,
    uint64_t source_length,
    uint64_t rows,
    uint64_t columns,
    uint64_t modulus)
{
    size_t expected_source;
    size_t expected_output;
    if (!sagejs_fflas_double_prime(modulus) ||
        !sagejs_fflas_checked_product(rows, columns, &expected_source) ||
        !sagejs_fflas_checked_product(columns, columns, &expected_output) ||
        source_length != (uint64_t) expected_source ||
        output_length != (uint64_t) expected_output ||
        nullity_length != 1 || nullity_data == NULL ||
        (expected_output != 0 && output_data == NULL))
        return 0;

    Givaro::Modular<double> field((int) modulus);
    std::vector<double> source;
    std::vector<double> output(expected_output, field.zero);
    if (!sagejs_fflas_import(
            source_data, expected_source, modulus, field, &source))
        return 0;

    if (columns == 0)
    {
        nullity_data[0] = 0;
        return 1;
    }
    if (rows == 0)
    {
        FFLAS::fidentity(
            field,
            (size_t) columns,
            (size_t) columns,
            output.data(),
            (size_t) columns);
        if (!sagejs_fflas_export(output_data, output, field))
            return 0;
        nullity_data[0] = columns;
        return 1;
    }

    sagejs_fflas_allocation<double> basis_owner(NULL);
    size_t leading_dimension = 0;
    size_t nullity = 0;
    const size_t returned_nullity = FFPACK::NullSpaceBasis(
        field,
        FFLAS::FflasRight,
        (size_t) rows,
        (size_t) columns,
        source.data(),
        (size_t) columns,
        basis_owner.data,
        leading_dimension,
        nullity);
    if (returned_nullity != nullity || nullity > (size_t) columns ||
        leading_dimension != nullity ||
        (nullity != 0 && basis_owner.data == NULL))
        return 0;

    for (size_t row = 0; row < nullity; ++row)
        for (size_t column = 0; column < (size_t) columns; ++column)
            output[row * (size_t) columns + column] =
                basis_owner.data[column * leading_dimension + row];

    if (sagejs_fflas_canonical_rref(
            field,
            nullity,
            (size_t) columns,
            output.data()) != nullity)
        return 0;
    if (!sagejs_fflas_export(output_data, output, field))
        return 0;
    nullity_data[0] = (uint64_t) nullity;
    return 1;
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

static inline int sagejs_fflas_modular_float_right_nullspace(
    uint64_t *, uint64_t *, uint64_t *, uint64_t, uint64_t, uint64_t,
    uint64_t, uint64_t, uint64_t)
{
    return 0;
}


static inline int sagejs_fflas_modular_double_mul(
    uint64_t *, uint64_t *, uint64_t *, uint64_t, uint64_t, uint64_t,
    uint64_t, uint64_t, uint64_t, uint64_t)
{
    return 0;
}

static inline int sagejs_fflas_modular_double_rank(
    uint64_t *, uint64_t *, uint64_t, uint64_t, uint64_t, uint64_t, uint64_t)
{
    return 0;
}

static inline int sagejs_fflas_modular_double_rref(
    uint64_t *, uint64_t *, uint64_t *, uint64_t, uint64_t, uint64_t,
    uint64_t, uint64_t, uint64_t)
{
    return 0;
}

static inline int sagejs_fflas_modular_double_right_nullspace(
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
