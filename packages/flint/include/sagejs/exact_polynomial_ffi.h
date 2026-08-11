#ifndef SAGEJS_EXACT_POLYNOMIAL_FFI_H
#define SAGEJS_EXACT_POLYNOMIAL_FFI_H

#include <limits.h>
#include <stdint.h>
#include <stdlib.h>

#include <flint/flint.h>
#include <flint/fmpq.h>
#include <flint/fmpq_poly.h>
#include <flint/fmpz.h>
#include <flint/fmpz_poly.h>

#include "sagejs/fmpq_matrix_ffi.h"

/*
 * Host-neutral owned-resource ABI for exact univariate polynomials.
 *
 * A construction resource is mutable only until seal. Every mathematical
 * operation rejects an unsealed input and publishes a sealed result. The
 * generated host adapter owns the resource, reports retained FLINT memory,
 * and clears it exactly once.
 */

typedef struct
{
    fmpz_poly_t value;
    slong builder_length;
    int sealed;
    size_t retained_bytes;
} sagejs_fmpz_polynomial_struct;

typedef sagejs_fmpz_polynomial_struct sagejs_fmpz_polynomial_t[1];

typedef struct
{
    fmpq_poly_t value;
    fmpq *builder;
    slong builder_length;
    int sealed;
    size_t retained_bytes;
} sagejs_fmpq_polynomial_struct;

typedef sagejs_fmpq_polynomial_struct sagejs_fmpq_polynomial_t[1];

static inline void sagejs_exact_polynomial_adjust_retained_bytes(
    size_t *retained, size_t previous, size_t current)
{
    if (*retained == SIZE_MAX)
        return;
    if (previous > *retained)
    {
        *retained = SIZE_MAX;
        return;
    }
    *retained -= previous;
    *retained = sagejs_retained_size_add(*retained, current);
}

static inline size_t sagejs_fmpz_polynomial_structural_bytes(slong alloc)
{
    return sagejs_retained_size_add(
        sizeof(sagejs_fmpz_polynomial_struct),
        sagejs_retained_size_multiply((size_t) alloc, sizeof(fmpz)));
}

static inline void sagejs_fmpz_polynomial_recompute_allocated_bytes(
    sagejs_fmpz_polynomial_t polynomial)
{
    size_t retained = sagejs_fmpz_polynomial_structural_bytes(
        polynomial->value->alloc);
    for (slong index = 0; index < polynomial->value->alloc; index++)
        retained = sagejs_retained_size_add(retained,
            sagejs_fmpz_retained_bytes(polynomial->value->coeffs + index));
    polynomial->retained_bytes = retained;
}

static inline size_t sagejs_fmpz_polynomial_allocated_bytes(
    const sagejs_fmpz_polynomial_t polynomial)
{
    return polynomial->retained_bytes;
}

static inline int sagejs_fmpz_polynomial_init(
    sagejs_fmpz_polynomial_t result, uint64_t length)
{
    if (length > (uint64_t) WORD_MAX ||
        length > (uint64_t) SIZE_MAX / sizeof(fmpz))
        return 0;
    fmpz_poly_init2(result->value, (slong) length);
    result->builder_length = (slong) length;
    result->sealed = 0;
    result->retained_bytes = sagejs_fmpz_polynomial_structural_bytes(
        result->value->alloc);
    return 1;
}

static inline void sagejs_fmpz_polynomial_clear(
    sagejs_fmpz_polynomial_t polynomial)
{
    fmpz_poly_clear(polynomial->value);
    polynomial->builder_length = 0;
    polynomial->sealed = 0;
    polynomial->retained_bytes = 0;
}

static inline int sagejs_fmpz_polynomial_set_coefficient(
    sagejs_fmpz_polynomial_t polynomial, uint64_t index,
    const fmpz_t coefficient)
{
    if (polynomial->sealed ||
        index >= (uint64_t) polynomial->builder_length)
        return 0;
    const size_t previous = sagejs_fmpz_retained_bytes(
        polynomial->value->coeffs + (slong) index);
    fmpz_poly_set_coeff_fmpz(
        polynomial->value, (slong) index, coefficient);
    const size_t current = sagejs_fmpz_retained_bytes(
        polynomial->value->coeffs + (slong) index);
    sagejs_exact_polynomial_adjust_retained_bytes(
        &polynomial->retained_bytes, previous, current);
    return 1;
}

static inline int sagejs_fmpz_polynomial_seal(
    sagejs_fmpz_polynomial_t polynomial)
{
    if (polynomial->sealed)
        return 0;
    _fmpz_poly_normalise(polynomial->value);
    polynomial->builder_length = 0;
    polynomial->sealed = 1;
    sagejs_fmpz_polynomial_recompute_allocated_bytes(polynomial);
    return 1;
}

static inline int sagejs_fmpz_polynomial_length(
    fmpz_t result, const sagejs_fmpz_polynomial_t polynomial)
{
    if (!polynomial->sealed)
        return 0;
    fmpz_set_ui(result, (ulong) fmpz_poly_length(polynomial->value));
    return 1;
}

static inline int sagejs_fmpz_polynomial_equal(
    fmpz_t result, const sagejs_fmpz_polynomial_t left,
    const sagejs_fmpz_polynomial_t right)
{
    if (!left->sealed || !right->sealed)
        return 0;
    fmpz_set_ui(result, (ulong) fmpz_poly_equal(left->value, right->value));
    return 1;
}

static inline int sagejs_fmpz_polynomial_coefficient(
    fmpz_t result, const sagejs_fmpz_polynomial_t polynomial,
    uint64_t index)
{
    if (!polynomial->sealed ||
        index >= (uint64_t) fmpz_poly_length(polynomial->value))
        return 0;
    fmpz_poly_get_coeff_fmpz(result, polynomial->value, (slong) index);
    return 1;
}

static inline void sagejs_fmpz_polynomial_finish_result(
    sagejs_fmpz_polynomial_t result)
{
    result->builder_length = 0;
    result->sealed = 1;
    sagejs_fmpz_polynomial_recompute_allocated_bytes(result);
}

static inline int sagejs_fmpz_polynomial_add(
    sagejs_fmpz_polynomial_t result,
    const sagejs_fmpz_polynomial_t left,
    const sagejs_fmpz_polynomial_t right)
{
    if (!left->sealed || !right->sealed)
        return 0;
    fmpz_poly_init(result->value);
    fmpz_poly_add(result->value, left->value, right->value);
    sagejs_fmpz_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_polynomial_sub(
    sagejs_fmpz_polynomial_t result,
    const sagejs_fmpz_polynomial_t left,
    const sagejs_fmpz_polynomial_t right)
{
    if (!left->sealed || !right->sealed)
        return 0;
    fmpz_poly_init(result->value);
    fmpz_poly_sub(result->value, left->value, right->value);
    sagejs_fmpz_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_polynomial_neg(
    sagejs_fmpz_polynomial_t result,
    const sagejs_fmpz_polynomial_t source)
{
    if (!source->sealed)
        return 0;
    fmpz_poly_init(result->value);
    fmpz_poly_neg(result->value, source->value);
    sagejs_fmpz_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_polynomial_mul(
    sagejs_fmpz_polynomial_t result,
    const sagejs_fmpz_polynomial_t left,
    const sagejs_fmpz_polynomial_t right)
{
    if (!left->sealed || !right->sealed)
        return 0;
    fmpz_poly_init(result->value);
    fmpz_poly_mul(result->value, left->value, right->value);
    sagejs_fmpz_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_polynomial_pow(
    sagejs_fmpz_polynomial_t result,
    const sagejs_fmpz_polynomial_t source, uint64_t exponent)
{
    if (!source->sealed || exponent > (uint64_t) UWORD_MAX)
        return 0;
    fmpz_poly_init(result->value);
    fmpz_poly_pow(result->value, source->value, (ulong) exponent);
    sagejs_fmpz_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_polynomial_evaluate(
    fmpz_t result, const sagejs_fmpz_polynomial_t source,
    const fmpz_t argument)
{
    if (!source->sealed)
        return 0;
    fmpz_poly_evaluate_fmpz(result, source->value, argument);
    return 1;
}

static inline int sagejs_fmpz_polynomial_evaluate_rational(
    sagejs_fmpq_value_t result,
    const sagejs_fmpz_polynomial_t source,
    const fmpz_t numerator, const fmpz_t denominator)
{
    if (!source->sealed || fmpz_is_zero(denominator))
        return 0;
    fmpq_t argument;
    fmpq_init(argument);
    fmpq_set_fmpz_frac(argument, numerator, denominator);
    fmpq_init(result);
    fmpz_poly_evaluate_fmpq(result, source->value, argument);
    fmpq_clear(argument);
    return 1;
}

static inline size_t sagejs_fmpq_builder_structural_bytes(slong length)
{
    return sagejs_retained_size_add(
        sizeof(sagejs_fmpq_polynomial_struct),
        sagejs_retained_size_multiply((size_t) length, sizeof(fmpq)));
}

static inline void sagejs_fmpq_polynomial_recompute_allocated_bytes(
    sagejs_fmpq_polynomial_t polynomial)
{
    size_t retained = sizeof(sagejs_fmpq_polynomial_struct);
    if (polynomial->sealed)
    {
        retained = sagejs_retained_size_add(retained,
            sagejs_retained_size_multiply(
                (size_t) polynomial->value->alloc, sizeof(fmpz)));
        for (slong index = 0; index < polynomial->value->alloc; index++)
            retained = sagejs_retained_size_add(retained,
                sagejs_fmpz_retained_bytes(
                    polynomial->value->coeffs + index));
        retained = sagejs_retained_size_add(retained,
            sagejs_fmpz_retained_bytes(polynomial->value->den));
    }
    else
    {
        retained = sagejs_fmpq_builder_structural_bytes(
            polynomial->builder_length);
        for (slong index = 0; index < polynomial->builder_length; index++)
            retained = sagejs_retained_size_add(retained,
                sagejs_fmpq_retained_bytes(polynomial->builder + index));
    }
    polynomial->retained_bytes = retained;
}

static inline size_t sagejs_fmpq_polynomial_allocated_bytes(
    const sagejs_fmpq_polynomial_t polynomial)
{
    return polynomial->retained_bytes;
}

static inline int sagejs_fmpq_polynomial_init(
    sagejs_fmpq_polynomial_t result, uint64_t length)
{
    if (length > (uint64_t) WORD_MAX ||
        length > (uint64_t) SIZE_MAX / sizeof(fmpq))
        return 0;
    result->builder = length == 0 ? NULL :
        (fmpq *) flint_malloc((size_t) length * sizeof(fmpq));
    if (length != 0 && result->builder == NULL)
        return 0;
    result->builder_length = (slong) length;
    result->sealed = 0;
    for (slong index = 0; index < (slong) length; index++)
        fmpq_init(result->builder + index);
    result->retained_bytes = sagejs_fmpq_builder_structural_bytes(
        (slong) length);
    return 1;
}

static inline void sagejs_fmpq_polynomial_clear(
    sagejs_fmpq_polynomial_t polynomial)
{
    if (polynomial->sealed)
        fmpq_poly_clear(polynomial->value);
    else
    {
        for (slong index = 0; index < polynomial->builder_length; index++)
            fmpq_clear(polynomial->builder + index);
        flint_free(polynomial->builder);
    }
    polynomial->builder = NULL;
    polynomial->builder_length = 0;
    polynomial->sealed = 0;
    polynomial->retained_bytes = 0;
}

static inline int sagejs_fmpq_polynomial_set_coefficient(
    sagejs_fmpq_polynomial_t polynomial, uint64_t index,
    const fmpz_t numerator, const fmpz_t denominator)
{
    if (polynomial->sealed ||
        index >= (uint64_t) polynomial->builder_length ||
        fmpz_is_zero(denominator))
        return 0;
    const size_t previous = sagejs_fmpq_retained_bytes(
        polynomial->builder + (slong) index);
    fmpq_set_fmpz_frac(
        polynomial->builder + (slong) index, numerator, denominator);
    const size_t current = sagejs_fmpq_retained_bytes(
        polynomial->builder + (slong) index);
    sagejs_exact_polynomial_adjust_retained_bytes(
        &polynomial->retained_bytes, previous, current);
    return 1;
}

static inline int sagejs_fmpq_polynomial_seal(
    sagejs_fmpq_polynomial_t polynomial)
{
    if (polynomial->sealed)
        return 0;
    fmpz_t common_denominator;
    fmpz_t multiplier;
    fmpz_init(common_denominator);
    fmpz_init(multiplier);
    fmpz_one(common_denominator);
    for (slong index = 0; index < polynomial->builder_length; index++)
        fmpz_lcm(common_denominator, common_denominator,
            fmpq_denref(polynomial->builder + index));
    fmpq_poly_init2(polynomial->value, polynomial->builder_length);
    fmpq_poly_fit_length(polynomial->value, polynomial->builder_length);
    for (slong index = 0; index < polynomial->builder_length; index++)
    {
        fmpz_divexact(multiplier, common_denominator,
            fmpq_denref(polynomial->builder + index));
        fmpz_mul(polynomial->value->coeffs + index,
            fmpq_numref(polynomial->builder + index), multiplier);
    }
    _fmpq_poly_set_length(polynomial->value, polynomial->builder_length);
    fmpz_set(polynomial->value->den, common_denominator);
    fmpq_poly_canonicalise(polynomial->value);
    for (slong index = 0; index < polynomial->builder_length; index++)
        fmpq_clear(polynomial->builder + index);
    flint_free(polynomial->builder);
    polynomial->builder = NULL;
    polynomial->builder_length = 0;
    polynomial->sealed = 1;
    fmpz_clear(multiplier);
    fmpz_clear(common_denominator);
    sagejs_fmpq_polynomial_recompute_allocated_bytes(polynomial);
    return 1;
}

static inline int sagejs_fmpq_polynomial_length(
    fmpz_t result, const sagejs_fmpq_polynomial_t polynomial)
{
    if (!polynomial->sealed)
        return 0;
    fmpz_set_ui(result, (ulong) fmpq_poly_length(polynomial->value));
    return 1;
}

static inline int sagejs_fmpq_polynomial_equal(
    fmpz_t result, const sagejs_fmpq_polynomial_t left,
    const sagejs_fmpq_polynomial_t right)
{
    if (!left->sealed || !right->sealed)
        return 0;
    fmpz_set_ui(result, (ulong) fmpq_poly_equal(left->value, right->value));
    return 1;
}

static inline int sagejs_fmpq_polynomial_coefficient_numerator(
    fmpz_t result, const sagejs_fmpq_polynomial_t polynomial,
    uint64_t index)
{
    if (!polynomial->sealed ||
        index >= (uint64_t) fmpq_poly_length(polynomial->value))
        return 0;
    fmpz_t divisor;
    fmpz_init(divisor);
    fmpz_gcd(divisor, polynomial->value->coeffs + (slong) index,
        polynomial->value->den);
    fmpz_divexact(result,
        polynomial->value->coeffs + (slong) index, divisor);
    fmpz_clear(divisor);
    return 1;
}

static inline int sagejs_fmpq_polynomial_coefficient_denominator(
    fmpz_t result, const sagejs_fmpq_polynomial_t polynomial,
    uint64_t index)
{
    if (!polynomial->sealed ||
        index >= (uint64_t) fmpq_poly_length(polynomial->value))
        return 0;
    fmpz_t divisor;
    fmpz_init(divisor);
    fmpz_gcd(divisor, polynomial->value->coeffs + (slong) index,
        polynomial->value->den);
    fmpz_divexact(result, polynomial->value->den, divisor);
    fmpz_clear(divisor);
    return 1;
}

static inline void sagejs_fmpq_polynomial_finish_result(
    sagejs_fmpq_polynomial_t result)
{
    result->builder = NULL;
    result->builder_length = 0;
    result->sealed = 1;
    sagejs_fmpq_polynomial_recompute_allocated_bytes(result);
}

#define SAGEJS_FMPQ_POLYNOMIAL_BINARY(name, operation)                    \
static inline int name(                                                  \
    sagejs_fmpq_polynomial_t result,                                     \
    const sagejs_fmpq_polynomial_t left,                                 \
    const sagejs_fmpq_polynomial_t right)                                \
{                                                                        \
    if (!left->sealed || !right->sealed)                                 \
        return 0;                                                        \
    fmpq_poly_init(result->value);                                       \
    operation(result->value, left->value, right->value);                 \
    sagejs_fmpq_polynomial_finish_result(result);                        \
    return 1;                                                            \
}

SAGEJS_FMPQ_POLYNOMIAL_BINARY(
    sagejs_fmpq_polynomial_add, fmpq_poly_add)
SAGEJS_FMPQ_POLYNOMIAL_BINARY(
    sagejs_fmpq_polynomial_sub, fmpq_poly_sub)
SAGEJS_FMPQ_POLYNOMIAL_BINARY(
    sagejs_fmpq_polynomial_mul, fmpq_poly_mul)

#undef SAGEJS_FMPQ_POLYNOMIAL_BINARY

static inline int sagejs_fmpq_polynomial_neg(
    sagejs_fmpq_polynomial_t result,
    const sagejs_fmpq_polynomial_t source)
{
    if (!source->sealed)
        return 0;
    fmpq_poly_init(result->value);
    fmpq_poly_neg(result->value, source->value);
    sagejs_fmpq_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpq_polynomial_pow(
    sagejs_fmpq_polynomial_t result,
    const sagejs_fmpq_polynomial_t source, uint64_t exponent)
{
    if (!source->sealed || exponent > (uint64_t) UWORD_MAX)
        return 0;
    fmpq_poly_init(result->value);
    fmpq_poly_pow(result->value, source->value, (ulong) exponent);
    sagejs_fmpq_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpq_polynomial_evaluate(
    sagejs_fmpq_value_t result,
    const sagejs_fmpq_polynomial_t source,
    const fmpz_t numerator, const fmpz_t denominator)
{
    if (!source->sealed || fmpz_is_zero(denominator))
        return 0;
    fmpq_t argument;
    fmpq_init(argument);
    fmpq_set_fmpz_frac(argument, numerator, denominator);
    fmpq_init(result);
    fmpq_poly_evaluate_fmpq(result, source->value, argument);
    fmpq_clear(argument);
    return 1;
}

static inline int sagejs_exact_polynomial_serialized_size(
    size_t *length, size_t *maximum_bytes, const fmpz_t value)
{
    const size_t bytes = sagejs_fmpz_serialized_bytes(value);
    if (bytes > UINT32_MAX / 2 ||
        !sagejs_size_add(length, 4) || !sagejs_size_add(length, bytes))
        return 0;
    if (bytes > *maximum_bytes)
        *maximum_bytes = bytes;
    return 1;
}

static inline void sagejs_exact_polynomial_write_u64(
    unsigned char *data, size_t offset, uint64_t value)
{
    for (size_t byte = 0; byte < 8; byte++)
        data[offset + byte] = (unsigned char) (value >> (8 * byte));
}

static inline void sagejs_exact_polynomial_write_fmpz(
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

static inline int sagejs_exact_polynomial_prepare_region(
    sagejs_flint_byte_region_t result, const char magic[4],
    uint64_t coefficient_count, size_t length, size_t maximum_bytes,
    size_t *offset, fmpz_t magnitude, ulong **words)
{
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (result->data == NULL)
        return 0;
    result->length = length;
    result->data[0] = (unsigned char) magic[0];
    result->data[1] = (unsigned char) magic[1];
    result->data[2] = (unsigned char) magic[2];
    result->data[3] = (unsigned char) magic[3];
    result->data[4] = 1;
    result->data[5] = 0;
    result->data[6] = 0;
    result->data[7] = 0;
    sagejs_exact_polynomial_write_u64(result->data, 8, coefficient_count);
    *offset = 16;
    const size_t maximum_words =
        (maximum_bytes + sizeof(ulong) - 1) / sizeof(ulong);
    *words = maximum_words == 0 ? NULL :
        (ulong *) calloc(maximum_words, sizeof(ulong));
    if (maximum_words != 0 && *words == NULL)
    {
        sagejs_flint_byte_region_clear(result);
        return 0;
    }
    fmpz_init(magnitude);
    return 1;
}

static inline int sagejs_fmpz_polynomial_serialize(
    sagejs_flint_byte_region_t result,
    const sagejs_fmpz_polynomial_t source)
{
    result->data = NULL;
    result->length = 0;
    if (!source->sealed)
        return 0;
    const slong count = fmpz_poly_length(source->value);
    size_t length = 16;
    size_t maximum_bytes = 0;
    for (slong index = 0; index < count; index++)
        if (!sagejs_exact_polynomial_serialized_size(
                &length, &maximum_bytes, source->value->coeffs + index))
            return 0;
    size_t offset;
    ulong *words;
    fmpz_t magnitude;
    if (!sagejs_exact_polynomial_prepare_region(result, "SJPZ",
            (uint64_t) count, length, maximum_bytes,
            &offset, magnitude, &words))
        return 0;
    for (slong index = 0; index < count; index++)
        sagejs_exact_polynomial_write_fmpz(
            result->data, &offset, source->value->coeffs + index,
            magnitude, words);
    fmpz_clear(magnitude);
    free(words);
    return 1;
}

static inline int sagejs_fmpq_polynomial_serialize(
    sagejs_flint_byte_region_t result,
    const sagejs_fmpq_polynomial_t source)
{
    result->data = NULL;
    result->length = 0;
    if (!source->sealed)
        return 0;
    const slong count = fmpq_poly_length(source->value);
    size_t length = 16;
    size_t maximum_bytes = 0;
    fmpq_t coefficient;
    fmpq_init(coefficient);
    for (slong index = 0; index < count; index++)
    {
        fmpq_poly_get_coeff_fmpq(coefficient, source->value, index);
        if (!sagejs_exact_polynomial_serialized_size(
                &length, &maximum_bytes, fmpq_numref(coefficient)) ||
            !sagejs_exact_polynomial_serialized_size(
                &length, &maximum_bytes, fmpq_denref(coefficient)))
        {
            fmpq_clear(coefficient);
            return 0;
        }
    }
    size_t offset;
    ulong *words;
    fmpz_t magnitude;
    if (!sagejs_exact_polynomial_prepare_region(result, "SJPQ",
            (uint64_t) count, length, maximum_bytes,
            &offset, magnitude, &words))
    {
        fmpq_clear(coefficient);
        return 0;
    }
    for (slong index = 0; index < count; index++)
    {
        fmpq_poly_get_coeff_fmpq(coefficient, source->value, index);
        sagejs_exact_polynomial_write_fmpz(result->data, &offset,
            fmpq_numref(coefficient), magnitude, words);
        sagejs_exact_polynomial_write_fmpz(result->data, &offset,
            fmpq_denref(coefficient), magnitude, words);
    }
    fmpz_clear(magnitude);
    free(words);
    fmpq_clear(coefficient);
    return 1;
}

#endif
