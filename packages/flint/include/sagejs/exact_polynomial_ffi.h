#ifndef SAGEJS_EXACT_POLYNOMIAL_FFI_H
#define SAGEJS_EXACT_POLYNOMIAL_FFI_H

#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <flint/flint.h>
#include <flint/fmpq.h>
#include <flint/fmpq_poly.h>
#include <flint/fmpz.h>
#include <flint/fmpz_poly.h>
#include <flint/fmpz_poly_factor.h>

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

/*
 * A completed exact factorization owns FLINT's variable-size factor array.
 * The same representation serves ZZ[x] and QQ[x]: FLINT factors the primitive
 * integer numerator, while denominator records the rational unit denominator.
 * No coefficient capacity is chosen by the caller and factorization is never
 * repeated merely to export a larger result.
 */

typedef struct
{
    fmpz_poly_factor_t value;
    fmpz_t denominator;
    size_t retained_bytes;
} sagejs_exact_polynomial_factorization_struct;

typedef sagejs_exact_polynomial_factorization_struct
    sagejs_exact_polynomial_factorization_t[1];

/*
 * Quotient/remainder is one mathematical operation. These result owners keep
 * both variable-size FLINT polynomials alive after one division, so generated
 * host adapters can publish each component without recomputing the division
 * or predicting coefficient capacities.
 */

typedef struct
{
    sagejs_fmpz_polynomial_struct quotient;
    sagejs_fmpz_polynomial_struct remainder;
    size_t retained_bytes;
} sagejs_fmpz_polynomial_division_result_struct;

typedef sagejs_fmpz_polynomial_division_result_struct
    sagejs_fmpz_polynomial_division_result_t[1];

typedef struct
{
    sagejs_fmpq_polynomial_struct quotient;
    sagejs_fmpq_polynomial_struct remainder;
    size_t retained_bytes;
} sagejs_fmpq_polynomial_division_result_struct;

typedef sagejs_fmpq_polynomial_division_result_struct
    sagejs_fmpq_polynomial_division_result_t[1];

/*
 * Extended GCD returns three independently variable-size polynomials.  Keep
 * the complete FLINT result behind one generated owner so the mathematical
 * operation runs once and callers never predict coefficient capacities.
 */

typedef struct
{
    sagejs_fmpz_polynomial_struct gcd;
    sagejs_fmpz_polynomial_struct left_coefficient;
    sagejs_fmpz_polynomial_struct right_coefficient;
    size_t retained_bytes;
} sagejs_fmpz_polynomial_xgcd_result_struct;

typedef sagejs_fmpz_polynomial_xgcd_result_struct
    sagejs_fmpz_polynomial_xgcd_result_t[1];

typedef struct
{
    sagejs_fmpq_polynomial_struct gcd;
    sagejs_fmpq_polynomial_struct left_coefficient;
    sagejs_fmpq_polynomial_struct right_coefficient;
    size_t retained_bytes;
} sagejs_fmpq_polynomial_xgcd_result_struct;

typedef sagejs_fmpq_polynomial_xgcd_result_struct
    sagejs_fmpq_polynomial_xgcd_result_t[1];

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

static inline int sagejs_fmpz_polynomial_derivative(
    sagejs_fmpz_polynomial_t result,
    const sagejs_fmpz_polynomial_t source)
{
    if (!source->sealed)
        return 0;
    fmpz_poly_init(result->value);
    fmpz_poly_derivative(result->value, source->value);
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

static inline int sagejs_fmpz_polynomial_gcd(
    sagejs_fmpz_polynomial_t result,
    const sagejs_fmpz_polynomial_t left,
    const sagejs_fmpz_polynomial_t right)
{
    if (!left->sealed || !right->sealed)
        return 0;
    fmpz_poly_init(result->value);
    fmpz_poly_gcd(result->value, left->value, right->value);
    sagejs_fmpz_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_polynomial_divexact(
    sagejs_fmpz_polynomial_t result,
    const sagejs_fmpz_polynomial_t dividend,
    const sagejs_fmpz_polynomial_t divisor)
{
    if (!dividend->sealed || !divisor->sealed ||
        fmpz_poly_is_zero(divisor->value))
        return 0;
    fmpz_poly_init(result->value);
    if (!fmpz_poly_divides(result->value, dividend->value, divisor->value))
    {
        fmpz_poly_clear(result->value);
        memset(result, 0, sizeof(*result));
        return 0;
    }
    sagejs_fmpz_polynomial_finish_result(result);
    return 1;
}

static inline size_t sagejs_fmpz_polynomial_division_result_allocated_bytes(
    const sagejs_fmpz_polynomial_division_result_t division)
{
    return division->retained_bytes;
}

static inline void sagejs_fmpz_polynomial_division_result_clear(
    sagejs_fmpz_polynomial_division_result_t division)
{
    sagejs_fmpz_polynomial_clear(&division->quotient);
    sagejs_fmpz_polynomial_clear(&division->remainder);
    division->retained_bytes = 0;
}

static inline int sagejs_fmpz_polynomial_quo_rem_resource(
    sagejs_fmpz_polynomial_division_result_t result,
    const sagejs_fmpz_polynomial_t dividend,
    const sagejs_fmpz_polynomial_t divisor)
{
    if (!dividend->sealed || !divisor->sealed ||
        fmpz_poly_is_zero(divisor->value))
        return 0;
    fmpz_poly_init(result->quotient.value);
    fmpz_poly_init(result->remainder.value);
    fmpz_poly_divrem(result->quotient.value, result->remainder.value,
        dividend->value, divisor->value);
    sagejs_fmpz_polynomial_finish_result(&result->quotient);
    sagejs_fmpz_polynomial_finish_result(&result->remainder);
    result->retained_bytes = sizeof(*result);
    result->retained_bytes = sagejs_retained_size_add(
        result->retained_bytes,
        result->quotient.retained_bytes - sizeof(result->quotient));
    result->retained_bytes = sagejs_retained_size_add(
        result->retained_bytes,
        result->remainder.retained_bytes - sizeof(result->remainder));
    return 1;
}

static inline int sagejs_fmpz_polynomial_division_result_quotient(
    sagejs_fmpz_polynomial_t result,
    const sagejs_fmpz_polynomial_division_result_t division)
{
    fmpz_poly_init(result->value);
    fmpz_poly_set(result->value, division->quotient.value);
    sagejs_fmpz_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_polynomial_division_result_remainder(
    sagejs_fmpz_polynomial_t result,
    const sagejs_fmpz_polynomial_division_result_t division)
{
    fmpz_poly_init(result->value);
    fmpz_poly_set(result->value, division->remainder.value);
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

static inline int sagejs_fmpz_polynomial_cyclotomic(
    sagejs_fmpz_polynomial_t result, uint64_t order)
{
    if (order == 0 || order > (uint64_t) UWORD_MAX)
        return 0;
    fmpz_poly_init(result->value);
    fmpz_poly_cyclotomic(result->value, (ulong) order);
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

static inline void sagejs_exact_polynomial_factorization_recompute_allocated_bytes(
    sagejs_exact_polynomial_factorization_t factorization)
{
    size_t retained = sizeof(sagejs_exact_polynomial_factorization_struct);
    retained = sagejs_retained_size_add(retained,
        sagejs_retained_size_multiply(
            (size_t) factorization->value->alloc,
            sizeof(fmpz_poly_struct)));
    retained = sagejs_retained_size_add(retained,
        sagejs_retained_size_multiply(
            (size_t) factorization->value->alloc, sizeof(slong)));
    retained = sagejs_retained_size_add(retained,
        sagejs_fmpz_retained_bytes(&factorization->value->c));
    retained = sagejs_retained_size_add(retained,
        sagejs_fmpz_retained_bytes(factorization->denominator));
    for (slong factor_index = 0;
         factor_index < factorization->value->alloc; factor_index++)
    {
        const fmpz_poly_struct *factor =
            factorization->value->p + factor_index;
        retained = sagejs_retained_size_add(retained,
            sagejs_retained_size_multiply(
                (size_t) factor->alloc, sizeof(fmpz)));
        for (slong coefficient = 0;
             coefficient < factor->alloc; coefficient++)
            retained = sagejs_retained_size_add(retained,
                sagejs_fmpz_retained_bytes(
                    factor->coeffs + coefficient));
    }
    factorization->retained_bytes = retained;
}

static inline size_t sagejs_exact_polynomial_factorization_allocated_bytes(
    const sagejs_exact_polynomial_factorization_t factorization)
{
    return factorization->retained_bytes;
}

static inline void sagejs_exact_polynomial_factorization_clear(
    sagejs_exact_polynomial_factorization_t factorization)
{
    fmpz_poly_factor_clear(factorization->value);
    fmpz_clear(factorization->denominator);
    factorization->retained_bytes = 0;
}

static inline void sagejs_exact_polynomial_factorization_finish(
    sagejs_exact_polynomial_factorization_t result)
{
    sagejs_exact_polynomial_factorization_recompute_allocated_bytes(result);
}

static inline int sagejs_fmpz_polynomial_factor_resource(
    sagejs_exact_polynomial_factorization_t result,
    const sagejs_fmpz_polynomial_t source)
{
    if (!source->sealed || fmpz_poly_is_zero(source->value))
        return 0;
    fmpz_poly_factor_init(result->value);
    fmpz_init(result->denominator);
    fmpz_one(result->denominator);
    fmpz_poly_factor(result->value, source->value);
    sagejs_exact_polynomial_factorization_finish(result);
    return 1;
}

static inline int sagejs_fmpq_polynomial_factor_resource(
    sagejs_exact_polynomial_factorization_t result,
    const sagejs_fmpq_polynomial_t source)
{
    if (!source->sealed || fmpq_poly_is_zero(source->value))
        return 0;
    fmpz_poly_t numerator;
    fmpz_poly_init(numerator);
    fmpq_poly_get_numerator(numerator, source->value);
    fmpz_poly_factor_init(result->value);
    fmpz_init(result->denominator);
    fmpq_poly_get_denominator(result->denominator, source->value);
    fmpz_poly_factor(result->value, numerator);
    fmpz_poly_clear(numerator);
    sagejs_exact_polynomial_factorization_finish(result);
    return 1;
}

static inline int sagejs_exact_polynomial_factorization_count(
    fmpz_t result,
    const sagejs_exact_polynomial_factorization_t factorization)
{
    fmpz_set_ui(result, (ulong) factorization->value->num);
    return 1;
}

static inline int sagejs_exact_polynomial_factorization_exponent(
    fmpz_t result,
    const sagejs_exact_polynomial_factorization_t factorization,
    uint64_t index)
{
    if (index >= (uint64_t) factorization->value->num)
        return 0;
    fmpz_set_si(result, factorization->value->exp[(slong) index]);
    return 1;
}

static inline int sagejs_exact_polynomial_factorization_unit_numerator(
    fmpz_t result,
    const sagejs_exact_polynomial_factorization_t factorization)
{
    fmpz_set(result, &factorization->value->c);
    return 1;
}

static inline int sagejs_exact_polynomial_factorization_unit_denominator(
    fmpz_t result,
    const sagejs_exact_polynomial_factorization_t factorization)
{
    fmpz_set(result, factorization->denominator);
    return 1;
}

static inline int sagejs_exact_polynomial_factorization_fmpz_factor(
    sagejs_fmpz_polynomial_t result,
    const sagejs_exact_polynomial_factorization_t factorization,
    uint64_t index)
{
    if (index >= (uint64_t) factorization->value->num)
        return 0;
    fmpz_poly_init(result->value);
    fmpz_poly_set(result->value,
        factorization->value->p + (slong) index);
    sagejs_fmpz_polynomial_finish_result(result);
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

/*
 * Keep exact matrix polynomials resource-to-resource. FLINT owns every
 * variable-size coefficient while it computes, and the generated adapter
 * publishes the completed polynomial as one sealed owner. The caller never
 * predicts coefficient sizes or materializes a packed matrix.
 */

static inline int sagejs_fmpq_matrix_charpoly_resource(
    sagejs_fmpq_polynomial_t result,
    const sagejs_fmpq_matrix_t source)
{
    if (fmpq_mat_nrows(source->value) != fmpq_mat_ncols(source->value))
        return 0;
    fmpq_poly_init(result->value);
    fmpq_mat_charpoly(result->value, source->value);
    sagejs_fmpq_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpq_matrix_minpoly_resource(
    sagejs_fmpq_polynomial_t result,
    const sagejs_fmpq_matrix_t source)
{
    if (fmpq_mat_nrows(source->value) != fmpq_mat_ncols(source->value))
        return 0;
    fmpq_poly_init(result->value);
    fmpq_mat_minpoly(result->value, source->value);
    sagejs_fmpq_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_exact_polynomial_factorization_fmpq_factor(
    sagejs_fmpq_polynomial_t result,
    const sagejs_exact_polynomial_factorization_t factorization,
    uint64_t index)
{
    if (index >= (uint64_t) factorization->value->num)
        return 0;
    fmpq_poly_init(result->value);
    fmpq_poly_set_fmpz_poly(result->value,
        factorization->value->p + (slong) index);
    sagejs_fmpq_polynomial_finish_result(result);
    return 1;
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
SAGEJS_FMPQ_POLYNOMIAL_BINARY(
    sagejs_fmpq_polynomial_gcd, fmpq_poly_gcd)

#undef SAGEJS_FMPQ_POLYNOMIAL_BINARY

static inline int sagejs_fmpq_polynomial_divexact(
    sagejs_fmpq_polynomial_t result,
    const sagejs_fmpq_polynomial_t dividend,
    const sagejs_fmpq_polynomial_t divisor)
{
    if (!dividend->sealed || !divisor->sealed ||
        fmpq_poly_is_zero(divisor->value))
        return 0;
    fmpq_poly_init(result->value);
    if (!fmpq_poly_divides(result->value, dividend->value, divisor->value))
    {
        fmpq_poly_clear(result->value);
        memset(result, 0, sizeof(*result));
        return 0;
    }
    sagejs_fmpq_polynomial_finish_result(result);
    return 1;
}

static inline size_t sagejs_fmpq_polynomial_division_result_allocated_bytes(
    const sagejs_fmpq_polynomial_division_result_t division)
{
    return division->retained_bytes;
}

static inline void sagejs_fmpq_polynomial_division_result_clear(
    sagejs_fmpq_polynomial_division_result_t division)
{
    sagejs_fmpq_polynomial_clear(&division->quotient);
    sagejs_fmpq_polynomial_clear(&division->remainder);
    division->retained_bytes = 0;
}

static inline int sagejs_fmpq_polynomial_quo_rem_resource(
    sagejs_fmpq_polynomial_division_result_t result,
    const sagejs_fmpq_polynomial_t dividend,
    const sagejs_fmpq_polynomial_t divisor)
{
    if (!dividend->sealed || !divisor->sealed ||
        fmpq_poly_is_zero(divisor->value))
        return 0;
    fmpq_poly_init(result->quotient.value);
    fmpq_poly_init(result->remainder.value);
    fmpq_poly_divrem(result->quotient.value, result->remainder.value,
        dividend->value, divisor->value);
    sagejs_fmpq_polynomial_finish_result(&result->quotient);
    sagejs_fmpq_polynomial_finish_result(&result->remainder);
    result->retained_bytes = sizeof(*result);
    result->retained_bytes = sagejs_retained_size_add(
        result->retained_bytes,
        result->quotient.retained_bytes - sizeof(result->quotient));
    result->retained_bytes = sagejs_retained_size_add(
        result->retained_bytes,
        result->remainder.retained_bytes - sizeof(result->remainder));
    return 1;
}

static inline int sagejs_fmpq_polynomial_division_result_quotient(
    sagejs_fmpq_polynomial_t result,
    const sagejs_fmpq_polynomial_division_result_t division)
{
    fmpq_poly_init(result->value);
    fmpq_poly_set(result->value, division->quotient.value);
    sagejs_fmpq_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpq_polynomial_division_result_remainder(
    sagejs_fmpq_polynomial_t result,
    const sagejs_fmpq_polynomial_division_result_t division)
{
    fmpq_poly_init(result->value);
    fmpq_poly_set(result->value, division->remainder.value);
    sagejs_fmpq_polynomial_finish_result(result);
    return 1;
}

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

static inline int sagejs_fmpq_polynomial_derivative(
    sagejs_fmpq_polynomial_t result,
    const sagejs_fmpq_polynomial_t source)
{
    if (!source->sealed)
        return 0;
    fmpq_poly_init(result->value);
    fmpq_poly_derivative(result->value, source->value);
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

/*
 * Materialize a complete factorization as one self-describing byte stream.
 *
 * The fixed section contains the factor count followed by (exponent,
 * coefficient-count) pairs.  The variable section uses the same canonical
 * signed-magnitude integer encoding as exact polynomial serialization: unit
 * numerator, unit denominator, then every factor's low-to-high coefficients.
 * This lets generated hosts cross into native code once, close the FLINT
 * factorization immediately, and construct independent lazy polynomial
 * values without one child-resource call per factor.
 */
static inline int sagejs_exact_polynomial_factorization_copy_bytes(
    unsigned char **output, uint64_t *output_length,
    const sagejs_exact_polynomial_factorization_t factorization)
{
    *output = NULL;
    *output_length = 0;
    const slong count = factorization->value->num;
    if (count < 0 ||
        (uint64_t) count > (uint64_t) ((SIZE_MAX - 16) / 16))
        return 0;
    size_t length = 16 + 16 * (size_t) count;
    size_t maximum_bytes = 0;
    if (!sagejs_exact_polynomial_serialized_size(
            &length, &maximum_bytes, &factorization->value->c) ||
        !sagejs_exact_polynomial_serialized_size(
            &length, &maximum_bytes, factorization->denominator))
        return 0;
    for (slong factor_index = 0; factor_index < count; factor_index++)
    {
        const fmpz_poly_struct *factor =
            factorization->value->p + factor_index;
        if (factorization->value->exp[factor_index] < 0)
            return 0;
        for (slong coefficient = 0;
             coefficient < factor->length; coefficient++)
            if (!sagejs_exact_polynomial_serialized_size(
                    &length, &maximum_bytes,
                    factor->coeffs + coefficient))
                return 0;
    }
    slong *order = count == 0 ? NULL :
        (slong *) malloc((size_t) count * sizeof(slong));
    char **sort_keys = count == 0 ? NULL :
        (char **) calloc((size_t) count, sizeof(char *));
    if (count != 0 && (order == NULL || sort_keys == NULL))
    {
        free(order);
        free(sort_keys);
        return 0;
    }
    for (slong factor_index = 0; factor_index < count; factor_index++)
    {
        order[factor_index] = factor_index;
        sort_keys[factor_index] = fmpz_poly_get_str_pretty(
            factorization->value->p + factor_index, "x");
        if (sort_keys[factor_index] == NULL)
        {
            for (slong clear_index = 0;
                 clear_index < factor_index; clear_index++)
                flint_free(sort_keys[clear_index]);
            free(sort_keys);
            free(order);
            return 0;
        }
    }
    /* Sage.js Factorization historically sorts polynomial keys by display
       text.  Perform the same stable ordering while the factors are still in
       FLINT, rather than formatting every lazy child through another host
       crossing. */
    for (slong index = 1; index < count; index++)
    {
        const slong current = order[index];
        slong position = index;
        while (position > 0 &&
               strcmp(sort_keys[order[position - 1]], sort_keys[current]) > 0)
        {
            order[position] = order[position - 1];
            position--;
        }
        order[position] = current;
    }
    unsigned char *data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (data == NULL)
    {
        for (slong factor_index = 0; factor_index < count; factor_index++)
            flint_free(sort_keys[factor_index]);
        free(sort_keys);
        free(order);
        return 0;
    }
    data[0] = 'S';
    data[1] = 'J';
    data[2] = 'P';
    data[3] = 'F';
    data[4] = 1;
    data[5] = 0;
    data[6] = 0;
    data[7] = 0;
    sagejs_exact_polynomial_write_u64(data, 8, (uint64_t) count);
    for (slong factor_index = 0; factor_index < count; factor_index++)
    {
        const slong source_index = order[factor_index];
        const size_t metadata = 16 + 16 * (size_t) factor_index;
        sagejs_exact_polynomial_write_u64(data, metadata,
            (uint64_t) factorization->value->exp[source_index]);
        sagejs_exact_polynomial_write_u64(data, metadata + 8,
            (uint64_t) factorization->value->p[source_index].length);
    }
    const size_t maximum_words =
        (maximum_bytes + sizeof(ulong) - 1) / sizeof(ulong);
    ulong *words = maximum_words == 0 ? NULL :
        (ulong *) calloc(maximum_words, sizeof(ulong));
    if (maximum_words != 0 && words == NULL)
    {
        free(data);
        for (slong factor_index = 0; factor_index < count; factor_index++)
            flint_free(sort_keys[factor_index]);
        free(sort_keys);
        free(order);
        return 0;
    }
    fmpz_t magnitude;
    fmpz_init(magnitude);
    size_t offset = 16 + 16 * (size_t) count;
    sagejs_exact_polynomial_write_fmpz(
        data, &offset, &factorization->value->c, magnitude, words);
    sagejs_exact_polynomial_write_fmpz(
        data, &offset, factorization->denominator, magnitude, words);
    for (slong factor_index = 0; factor_index < count; factor_index++)
    {
        const slong source_index = order[factor_index];
        const fmpz_poly_struct *factor =
            factorization->value->p + source_index;
        for (slong coefficient = 0;
             coefficient < factor->length; coefficient++)
            sagejs_exact_polynomial_write_fmpz(
                data, &offset, factor->coeffs + coefficient,
                magnitude, words);
    }
    fmpz_clear(magnitude);
    free(words);
    for (slong factor_index = 0; factor_index < count; factor_index++)
        flint_free(sort_keys[factor_index]);
    free(sort_keys);
    free(order);
    if (offset != length)
    {
        free(data);
        return 0;
    }
    *output = data;
    *output_length = (uint64_t) length;
    return 1;
}

static inline void sagejs_exact_polynomial_factorization_free_bytes(
    unsigned char *data)
{
    free(data);
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

static inline int sagejs_fmpz_polynomial_format(
    sagejs_flint_byte_region_t result,
    const sagejs_fmpz_polynomial_t source)
{
    result->data = NULL;
    result->length = 0;
    if (!source->sealed)
        return 0;
    char *text = fmpz_poly_get_str_pretty(source->value, "x");
    if (text == NULL)
        return 0;
    const size_t length = strlen(text);
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    const int ok = result->data != NULL;
    if (ok)
    {
        memcpy(result->data, text, length);
        result->length = length;
    }
    flint_free(text);
    return ok;
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

static inline int sagejs_fmpq_polynomial_format(
    sagejs_flint_byte_region_t result,
    const sagejs_fmpq_polynomial_t source)
{
    result->data = NULL;
    result->length = 0;
    if (!source->sealed)
        return 0;
    char *text = fmpq_poly_get_str_pretty(source->value, "x");
    if (text == NULL)
        return 0;
    const size_t length = strlen(text);
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    const int ok = result->data != NULL;
    if (ok)
    {
        memcpy(result->data, text, length);
        result->length = length;
    }
    flint_free(text);
    return ok;
}

/*
 * Decode the stable SJPZ/SJPQ v1 stream from one nonnegative exact-integer
 * transport token. The public serialization is still an exact byte stream;
 * the generated exact-integer adapter merely moves its little-endian bytes
 * across the host boundary in one checked call.
 *
 * Validation is transactional. No member of result is initialized until a
 * complete canonical polynomial has been constructed in a temporary owner.
 * In particular, rational coefficients must already be reduced, zero must be
 * 0/1, and a positive-length stream may not end in a zero coefficient.
 */

static inline unsigned char sagejs_exact_polynomial_packed_byte(
    const ulong *words, size_t index)
{
    return (unsigned char) (
        words[index / sizeof(ulong)] >>
        (8 * (index % sizeof(ulong))));
}

static inline uint32_t sagejs_exact_polynomial_read_packed_u32(
    const ulong *words, size_t offset)
{
    uint32_t result = 0;
    for (size_t byte = 0; byte < 4; byte++)
        result |= (uint32_t) sagejs_exact_polynomial_packed_byte(
            words, offset + byte) << (8 * byte);
    return result;
}

static inline uint64_t sagejs_exact_polynomial_read_packed_u64(
    const ulong *words, size_t offset)
{
    uint64_t result = 0;
    for (size_t byte = 0; byte < 8; byte++)
        result |= (uint64_t) sagejs_exact_polynomial_packed_byte(
            words, offset + byte) << (8 * byte);
    return result;
}

static inline int sagejs_exact_polynomial_validate_packed_integer(
    const ulong *words, size_t length, size_t *offset,
    size_t *byte_count, int *negative, size_t *maximum_bytes)
{
    if (*offset > length || length - *offset < 4)
        return 0;
    const uint32_t header = sagejs_exact_polynomial_read_packed_u32(
        words, *offset);
    *offset += 4;
    *byte_count = (size_t) (header & UINT32_C(0x7fffffff));
    *negative = (header & UINT32_C(0x80000000)) != 0;
    if (*byte_count > length - *offset ||
        (*byte_count != 0 &&
         sagejs_exact_polynomial_packed_byte(
             words, *offset + *byte_count - 1) == 0) ||
        (*negative && *byte_count == 0))
        return 0;
    if (*byte_count > *maximum_bytes)
        *maximum_bytes = *byte_count;
    *offset += *byte_count;
    return 1;
}

static inline int sagejs_exact_polynomial_validate_packed(
    const ulong *words, size_t word_count, size_t length,
    const char magic[4], int rational,
    slong *coefficient_count, size_t *maximum_bytes)
{
    const size_t required_words =
        length / sizeof(ulong) + (length % sizeof(ulong) != 0);
    if (words == NULL || length < 16 || word_count != required_words)
        return 0;
    const size_t remainder = length % sizeof(ulong);
    if (remainder != 0 &&
        (words[word_count - 1] >> (8 * remainder)) != 0)
        return 0;
    for (size_t index = 0; index < 4; index++)
        if (sagejs_exact_polynomial_packed_byte(words, index) !=
            (unsigned char) magic[index])
            return 0;
    if (sagejs_exact_polynomial_packed_byte(words, 4) != 1 ||
        sagejs_exact_polynomial_packed_byte(words, 5) != 0 ||
        sagejs_exact_polynomial_packed_byte(words, 6) != 0 ||
        sagejs_exact_polynomial_packed_byte(words, 7) != 0)
        return 0;
    const uint64_t count_value =
        sagejs_exact_polynomial_read_packed_u64(words, 8);
    if (count_value > (uint64_t) WORD_MAX ||
        count_value > (uint64_t) SIZE_MAX)
        return 0;
    const size_t count = (size_t) count_value;
    const size_t minimum_coefficient_bytes = rational ? 8 : 4;
    if (count > (length - 16) / minimum_coefficient_bytes)
        return 0;
    size_t offset = 16;
    *maximum_bytes = 0;
    for (size_t index = 0; index < count; index++)
    {
        size_t numerator_bytes;
        int numerator_negative;
        if (!sagejs_exact_polynomial_validate_packed_integer(
                words, length, &offset, &numerator_bytes,
                &numerator_negative, maximum_bytes))
            return 0;
        if (rational)
        {
            size_t denominator_bytes;
            int denominator_negative;
            if (!sagejs_exact_polynomial_validate_packed_integer(
                    words, length, &offset, &denominator_bytes,
                    &denominator_negative, maximum_bytes) ||
                denominator_negative || denominator_bytes == 0)
                return 0;
        }
        if (index + 1 == count && numerator_bytes == 0)
            return 0;
    }
    if (offset != length)
        return 0;
    *coefficient_count = (slong) count;
    return 1;
}

static inline void sagejs_exact_polynomial_read_packed_fmpz(
    fmpz_t result, const ulong *source, size_t *offset,
    ulong *words, size_t word_capacity)
{
    const uint32_t header = sagejs_exact_polynomial_read_packed_u32(
        source, *offset);
    *offset += 4;
    const size_t byte_count =
        (size_t) (header & UINT32_C(0x7fffffff));
    const size_t word_count =
        (byte_count + sizeof(ulong) - 1) / sizeof(ulong);
    if (word_capacity != 0)
        memset(words, 0, word_capacity * sizeof(ulong));
    for (size_t byte = 0; byte < byte_count; byte++)
        words[byte / sizeof(ulong)] |=
            (ulong) sagejs_exact_polynomial_packed_byte(
                source, *offset + byte) <<
            (8 * (byte % sizeof(ulong)));
    if (word_count == 0)
        fmpz_zero(result);
    else
        fmpz_set_ui_array(result, words, (slong) word_count);
    if ((header & UINT32_C(0x80000000)) != 0)
        fmpz_neg(result, result);
    *offset += byte_count;
}

static inline ulong *sagejs_exact_polynomial_decode_words(
    size_t maximum_bytes, size_t *word_capacity)
{
    *word_capacity =
        (maximum_bytes + sizeof(ulong) - 1) / sizeof(ulong);
    if (*word_capacity == 0)
        return NULL;
    if (*word_capacity > SIZE_MAX / sizeof(ulong))
        return NULL;
    return (ulong *) calloc(*word_capacity, sizeof(ulong));
}

static inline ulong *sagejs_exact_polynomial_transport_words(
    const fmpz_t payload, uint64_t byte_length_value,
    size_t *byte_length, size_t *word_count)
{
    *byte_length = 0;
    *word_count = 0;
    if (fmpz_sgn(payload) < 0 ||
        byte_length_value > (uint64_t) SIZE_MAX)
        return NULL;
    const size_t length = (size_t) byte_length_value;
    if (length < 16)
        return NULL;
    const size_t count =
        length / sizeof(ulong) + (length % sizeof(ulong) != 0);
    if (count > SIZE_MAX / sizeof(ulong))
        return NULL;
    const size_t payload_bytes = fmpz_is_zero(payload) ? 0 :
        sagejs_fmpz_serialized_bytes(payload);
    /*
     * Every nonzero canonical polynomial stream ends in the nonzero high
     * magnitude byte of its leading coefficient. Thus only the 16-byte zero
     * polynomial header may legitimately contain high zero transport bytes.
     * Reject inconsistent lengths before allocating attacker-controlled
     * storage.
     */
    if (payload_bytes > length ||
        (length != 16 && payload_bytes != length))
        return NULL;
    ulong *words = (ulong *) calloc(count, sizeof(ulong));
    if (words == NULL)
        return NULL;
    const size_t payload_words =
        payload_bytes / sizeof(ulong) +
        (payload_bytes % sizeof(ulong) != 0);
    if (payload_words > (size_t) WORD_MAX)
    {
        free(words);
        return NULL;
    }
    if (payload_words != 0)
        fmpz_get_ui_array(words, (slong) payload_words, payload);
    *byte_length = length;
    *word_count = count;
    return words;
}

static inline int sagejs_fmpz_polynomial_deserialize_packed(
    sagejs_fmpz_polynomial_t result, const fmpz_t payload,
    uint64_t byte_length_value)
{
    size_t byte_length;
    size_t source_word_count;
    ulong *source = sagejs_exact_polynomial_transport_words(
        payload, byte_length_value, &byte_length, &source_word_count);
    if (source == NULL)
        return 0;
    slong count;
    size_t maximum_bytes;
    if (!sagejs_exact_polynomial_validate_packed(
            source, source_word_count, byte_length, "SJPZ", 0,
            &count, &maximum_bytes))
    {
        free(source);
        return 0;
    }
    size_t word_capacity;
    ulong *words = sagejs_exact_polynomial_decode_words(
        maximum_bytes, &word_capacity);
    if (word_capacity != 0 && words == NULL)
    {
        free(source);
        return 0;
    }
    sagejs_fmpz_polynomial_t temporary;
    memset(temporary, 0, sizeof(temporary));
    if (!sagejs_fmpz_polynomial_init(temporary, (uint64_t) count))
    {
        free(words);
        free(source);
        return 0;
    }
    fmpz_t coefficient;
    fmpz_init(coefficient);
    size_t offset = 16;
    for (slong index = 0; index < count; index++)
    {
        sagejs_exact_polynomial_read_packed_fmpz(
            coefficient, source, &offset, words, word_capacity);
        if (!sagejs_fmpz_polynomial_set_coefficient(
                temporary, (uint64_t) index, coefficient))
        {
            fmpz_clear(coefficient);
            sagejs_fmpz_polynomial_clear(temporary);
            free(words);
            free(source);
            return 0;
        }
    }
    fmpz_clear(coefficient);
    free(words);
    free(source);
    if (!sagejs_fmpz_polynomial_seal(temporary))
    {
        sagejs_fmpz_polynomial_clear(temporary);
        return 0;
    }
    result[0] = temporary[0];
    return 1;
}

static inline int sagejs_fmpq_polynomial_deserialize_packed(
    sagejs_fmpq_polynomial_t result, const fmpz_t payload,
    uint64_t byte_length_value)
{
    size_t byte_length;
    size_t source_word_count;
    ulong *source = sagejs_exact_polynomial_transport_words(
        payload, byte_length_value, &byte_length, &source_word_count);
    if (source == NULL)
        return 0;
    slong count;
    size_t maximum_bytes;
    if (!sagejs_exact_polynomial_validate_packed(
            source, source_word_count, byte_length, "SJPQ", 1,
            &count, &maximum_bytes))
    {
        free(source);
        return 0;
    }
    size_t word_capacity;
    ulong *words = sagejs_exact_polynomial_decode_words(
        maximum_bytes, &word_capacity);
    if (word_capacity != 0 && words == NULL)
    {
        free(source);
        return 0;
    }
    sagejs_fmpq_polynomial_t temporary;
    memset(temporary, 0, sizeof(temporary));
    if (!sagejs_fmpq_polynomial_init(temporary, (uint64_t) count))
    {
        free(words);
        free(source);
        return 0;
    }
    fmpz_t numerator;
    fmpz_t denominator;
    fmpz_t divisor;
    fmpz_init(numerator);
    fmpz_init(denominator);
    fmpz_init(divisor);
    size_t offset = 16;
    for (slong index = 0; index < count; index++)
    {
        sagejs_exact_polynomial_read_packed_fmpz(
            numerator, source, &offset, words, word_capacity);
        sagejs_exact_polynomial_read_packed_fmpz(
            denominator, source, &offset, words, word_capacity);
        fmpz_gcd(divisor, numerator, denominator);
        if (!fmpz_is_one(divisor) ||
            !sagejs_fmpq_polynomial_set_coefficient(
                temporary, (uint64_t) index, numerator, denominator))
        {
            fmpz_clear(divisor);
            fmpz_clear(denominator);
            fmpz_clear(numerator);
            sagejs_fmpq_polynomial_clear(temporary);
            free(words);
            free(source);
            return 0;
        }
    }
    fmpz_clear(divisor);
    fmpz_clear(denominator);
    fmpz_clear(numerator);
    free(words);
    free(source);
    if (!sagejs_fmpq_polynomial_seal(temporary))
    {
        sagejs_fmpq_polynomial_clear(temporary);
        return 0;
    }
    result[0] = temporary[0];
    return 1;
}

static inline size_t sagejs_exact_polynomial_three_result_bytes(
    size_t structure_bytes, size_t first, size_t first_structure,
    size_t second, size_t second_structure,
    size_t third, size_t third_structure)
{
    size_t retained = structure_bytes;
    if (first < first_structure || second < second_structure ||
        third < third_structure)
        return SIZE_MAX;
    retained = sagejs_retained_size_add(retained, first - first_structure);
    retained = sagejs_retained_size_add(retained, second - second_structure);
    return sagejs_retained_size_add(retained, third - third_structure);
}

static inline void sagejs_fmpz_polynomial_xgcd_result_finish(
    sagejs_fmpz_polynomial_xgcd_result_t result)
{
    sagejs_fmpz_polynomial_finish_result(&result->gcd);
    sagejs_fmpz_polynomial_finish_result(&result->left_coefficient);
    sagejs_fmpz_polynomial_finish_result(&result->right_coefficient);
    result->retained_bytes = sagejs_exact_polynomial_three_result_bytes(
        sizeof(*result),
        result->gcd.retained_bytes, sizeof(result->gcd),
        result->left_coefficient.retained_bytes,
        sizeof(result->left_coefficient),
        result->right_coefficient.retained_bytes,
        sizeof(result->right_coefficient));
}

static inline size_t sagejs_fmpz_polynomial_xgcd_result_allocated_bytes(
    const sagejs_fmpz_polynomial_xgcd_result_t result)
{
    return result->retained_bytes;
}

static inline void sagejs_fmpz_polynomial_xgcd_result_clear(
    sagejs_fmpz_polynomial_xgcd_result_t result)
{
    sagejs_fmpz_polynomial_clear(&result->gcd);
    sagejs_fmpz_polynomial_clear(&result->left_coefficient);
    sagejs_fmpz_polynomial_clear(&result->right_coefficient);
    result->retained_bytes = 0;
}

static inline void sagejs_fmpz_polynomial_set_scaled_fmpq(
    fmpz_poly_t result, const fmpq_poly_t source, const fmpz_t scale)
{
    fmpq_poly_t scaled;
    fmpq_poly_init(scaled);
    fmpq_poly_scalar_mul_fmpz(scaled, source, scale);
    fmpq_poly_get_numerator(result, scaled);
    fmpq_poly_clear(scaled);
}

static inline int sagejs_fmpz_polynomial_xgcd_resource(
    sagejs_fmpz_polynomial_xgcd_result_t result,
    const sagejs_fmpz_polynomial_t left,
    const sagejs_fmpz_polynomial_t right)
{
    if (!left->sealed || !right->sealed)
        return 0;

    fmpz_poly_init(result->gcd.value);
    fmpz_poly_init(result->left_coefficient.value);
    fmpz_poly_init(result->right_coefficient.value);

    if (fmpz_poly_is_zero(left->value))
    {
        fmpz_poly_set(result->gcd.value, right->value);
        fmpz_poly_one(result->right_coefficient.value);
    }
    else if (fmpz_poly_is_zero(right->value))
    {
        fmpz_poly_set(result->gcd.value, left->value);
        fmpz_poly_one(result->left_coefficient.value);
    }
    else if (fmpz_poly_length(left->value) == 1 &&
             fmpz_poly_length(right->value) == 1)
    {
        fmpz_t gcd;
        fmpz_t left_coefficient;
        fmpz_t right_coefficient;
        fmpz_init(gcd);
        fmpz_init(left_coefficient);
        fmpz_init(right_coefficient);
        fmpz_xgcd(gcd, left_coefficient, right_coefficient,
            left->value->coeffs, right->value->coeffs);
        fmpz_poly_set_fmpz(result->gcd.value, gcd);
        fmpz_poly_set_fmpz(result->left_coefficient.value, left_coefficient);
        fmpz_poly_set_fmpz(result->right_coefficient.value, right_coefficient);
        fmpz_clear(right_coefficient);
        fmpz_clear(left_coefficient);
        fmpz_clear(gcd);
    }
    else
    {
        fmpz_t resultant;
        fmpz_init(resultant);
        fmpz_poly_xgcd(resultant,
            result->left_coefficient.value,
            result->right_coefficient.value,
            left->value, right->value);
        if (!fmpz_is_zero(resultant))
        {
            fmpz_poly_set_fmpz(result->gcd.value, resultant);
        }
        else
        {
            fmpq_poly_t rational_left;
            fmpq_poly_t rational_right;
            fmpq_poly_t rational_gcd;
            fmpq_poly_t rational_left_coefficient;
            fmpq_poly_t rational_right_coefficient;
            fmpz_t denominator;
            fmpq_poly_init(rational_left);
            fmpq_poly_init(rational_right);
            fmpq_poly_init(rational_gcd);
            fmpq_poly_init(rational_left_coefficient);
            fmpq_poly_init(rational_right_coefficient);
            fmpz_init(denominator);
            fmpq_poly_set_fmpz_poly(rational_left, left->value);
            fmpq_poly_set_fmpz_poly(rational_right, right->value);
            fmpq_poly_xgcd(rational_gcd,
                rational_left_coefficient,
                rational_right_coefficient,
                rational_left, rational_right);
            fmpz_lcm(denominator,
                fmpq_poly_denref(rational_gcd),
                fmpq_poly_denref(rational_left_coefficient));
            fmpz_lcm(denominator, denominator,
                fmpq_poly_denref(rational_right_coefficient));
            sagejs_fmpz_polynomial_set_scaled_fmpq(
                result->gcd.value, rational_gcd, denominator);
            sagejs_fmpz_polynomial_set_scaled_fmpq(
                result->left_coefficient.value,
                rational_left_coefficient, denominator);
            sagejs_fmpz_polynomial_set_scaled_fmpq(
                result->right_coefficient.value,
                rational_right_coefficient, denominator);
            fmpz_clear(denominator);
            fmpq_poly_clear(rational_right_coefficient);
            fmpq_poly_clear(rational_left_coefficient);
            fmpq_poly_clear(rational_gcd);
            fmpq_poly_clear(rational_right);
            fmpq_poly_clear(rational_left);
        }
        fmpz_clear(resultant);
    }
    sagejs_fmpz_polynomial_xgcd_result_finish(result);
    return 1;
}

#define SAGEJS_FMPZ_POLYNOMIAL_XGCD_SELECTOR(name, field)                \
static inline int name(                                                  \
    sagejs_fmpz_polynomial_t result,                                    \
    const sagejs_fmpz_polynomial_xgcd_result_t xgcd)                    \
{                                                                        \
    fmpz_poly_init(result->value);                                       \
    fmpz_poly_set(result->value, xgcd->field.value);                     \
    sagejs_fmpz_polynomial_finish_result(result);                        \
    return 1;                                                            \
}

SAGEJS_FMPZ_POLYNOMIAL_XGCD_SELECTOR(
    sagejs_fmpz_polynomial_xgcd_result_gcd, gcd)
SAGEJS_FMPZ_POLYNOMIAL_XGCD_SELECTOR(
    sagejs_fmpz_polynomial_xgcd_result_left_coefficient, left_coefficient)
SAGEJS_FMPZ_POLYNOMIAL_XGCD_SELECTOR(
    sagejs_fmpz_polynomial_xgcd_result_right_coefficient, right_coefficient)

#undef SAGEJS_FMPZ_POLYNOMIAL_XGCD_SELECTOR

static inline void sagejs_fmpq_polynomial_xgcd_result_finish(
    sagejs_fmpq_polynomial_xgcd_result_t result)
{
    sagejs_fmpq_polynomial_finish_result(&result->gcd);
    sagejs_fmpq_polynomial_finish_result(&result->left_coefficient);
    sagejs_fmpq_polynomial_finish_result(&result->right_coefficient);
    result->retained_bytes = sagejs_exact_polynomial_three_result_bytes(
        sizeof(*result),
        result->gcd.retained_bytes, sizeof(result->gcd),
        result->left_coefficient.retained_bytes,
        sizeof(result->left_coefficient),
        result->right_coefficient.retained_bytes,
        sizeof(result->right_coefficient));
}

static inline size_t sagejs_fmpq_polynomial_xgcd_result_allocated_bytes(
    const sagejs_fmpq_polynomial_xgcd_result_t result)
{
    return result->retained_bytes;
}

static inline void sagejs_fmpq_polynomial_xgcd_result_clear(
    sagejs_fmpq_polynomial_xgcd_result_t result)
{
    sagejs_fmpq_polynomial_clear(&result->gcd);
    sagejs_fmpq_polynomial_clear(&result->left_coefficient);
    sagejs_fmpq_polynomial_clear(&result->right_coefficient);
    result->retained_bytes = 0;
}

static inline int sagejs_fmpq_polynomial_xgcd_resource(
    sagejs_fmpq_polynomial_xgcd_result_t result,
    const sagejs_fmpq_polynomial_t left,
    const sagejs_fmpq_polynomial_t right)
{
    if (!left->sealed || !right->sealed)
        return 0;
    fmpq_poly_init(result->gcd.value);
    fmpq_poly_init(result->left_coefficient.value);
    fmpq_poly_init(result->right_coefficient.value);
    fmpq_poly_xgcd(result->gcd.value,
        result->left_coefficient.value,
        result->right_coefficient.value,
        left->value, right->value);
    sagejs_fmpq_polynomial_xgcd_result_finish(result);
    return 1;
}

#define SAGEJS_FMPQ_POLYNOMIAL_XGCD_SELECTOR(name, field)                \
static inline int name(                                                  \
    sagejs_fmpq_polynomial_t result,                                    \
    const sagejs_fmpq_polynomial_xgcd_result_t xgcd)                    \
{                                                                        \
    fmpq_poly_init(result->value);                                       \
    fmpq_poly_set(result->value, xgcd->field.value);                     \
    sagejs_fmpq_polynomial_finish_result(result);                        \
    return 1;                                                            \
}

SAGEJS_FMPQ_POLYNOMIAL_XGCD_SELECTOR(
    sagejs_fmpq_polynomial_xgcd_result_gcd, gcd)
SAGEJS_FMPQ_POLYNOMIAL_XGCD_SELECTOR(
    sagejs_fmpq_polynomial_xgcd_result_left_coefficient, left_coefficient)
SAGEJS_FMPQ_POLYNOMIAL_XGCD_SELECTOR(
    sagejs_fmpq_polynomial_xgcd_result_right_coefficient, right_coefficient)

#undef SAGEJS_FMPQ_POLYNOMIAL_XGCD_SELECTOR

#endif
