#ifndef SAGEJS_FMPZ_MOD_POLYNOMIAL_FFI_H
#define SAGEJS_FMPZ_MOD_POLYNOMIAL_FFI_H

#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/fmpz_mod.h>
#include <flint/fmpz_mod_poly.h>
#include <flint/fmpz_mod_poly_factor.h>

#include "sagejs/exact_polynomial_ffi.h"

/*
 * Host-neutral resource ABI for univariate polynomials over arbitrary prime
 * fields.  Every published polynomial owns both its fmpz_mod_ctx and its
 * fmpz_mod_poly.  Results therefore have no lifetime dependency on a parent,
 * an operand, or another result resource.
 *
 * Construction is the only mutable phase.  All mathematical operations
 * require sealed inputs and publish fresh sealed resources.  Multi-resource
 * calls compare exact moduli before passing either value to FLINT; compatible
 * contexts need equal moduli, not pointer identity.
 */

typedef struct
{
    fmpz_mod_ctx_t context;
    fmpz_mod_poly_t value;
    slong builder_length;
    int sealed;
    size_t retained_bytes;
} sagejs_fmpz_mod_polynomial_struct;

typedef sagejs_fmpz_mod_polynomial_struct sagejs_fmpz_mod_polynomial_t[1];

typedef struct
{
    sagejs_fmpz_mod_polynomial_struct quotient;
    sagejs_fmpz_mod_polynomial_struct remainder;
    size_t retained_bytes;
} sagejs_fmpz_mod_polynomial_division_result_struct;

typedef sagejs_fmpz_mod_polynomial_division_result_struct
    sagejs_fmpz_mod_polynomial_division_result_t[1];

typedef struct
{
    sagejs_fmpz_mod_polynomial_struct gcd;
    sagejs_fmpz_mod_polynomial_struct left_coefficient;
    sagejs_fmpz_mod_polynomial_struct right_coefficient;
    size_t retained_bytes;
} sagejs_fmpz_mod_polynomial_xgcd_result_struct;

typedef sagejs_fmpz_mod_polynomial_xgcd_result_struct
    sagejs_fmpz_mod_polynomial_xgcd_result_t[1];

/*
 * Factor and root results retain their complete FLINT factor array.  A child
 * extraction copies one polynomial (or integer root) into independent output
 * ownership; closing the aggregate never invalidates an extracted value.
 */
typedef struct
{
    fmpz_mod_ctx_t context;
    fmpz_mod_poly_factor_t value;
    fmpz_t unit;
    size_t retained_bytes;
} sagejs_fmpz_mod_polynomial_factorization_struct;

typedef sagejs_fmpz_mod_polynomial_factorization_struct
    sagejs_fmpz_mod_polynomial_factorization_t[1];

typedef struct
{
    fmpz_mod_ctx_t context;
    fmpz_mod_poly_factor_t value;
    size_t retained_bytes;
} sagejs_fmpz_mod_polynomial_roots_struct;

typedef sagejs_fmpz_mod_polynomial_roots_struct
    sagejs_fmpz_mod_polynomial_roots_t[1];

/* Shared canonical unsigned-integer encoding helpers are defined with the
   ordinary polynomial serializer below, but factor and roots aggregate
   transfers use the same encoding earlier in this header. */
static inline int sagejs_fmpz_mod_polynomial_unsigned_size(
    size_t *total, size_t *maximum, const fmpz_t value);

static inline void sagejs_fmpz_mod_polynomial_write_unsigned(
    unsigned char *data, size_t *offset, const fmpz_t value,
    fmpz_t scratch, ulong *words);

static inline size_t sagejs_fmpz_mod_polynomial_fmpz_bytes(
    const fmpz_t value)
{
    return sagejs_fmpz_retained_bytes(value);
}

static inline size_t sagejs_fmpz_mod_polynomial_context_bytes(
    const fmpz_mod_ctx_t context)
{
    /* FLINT's huge preinverse is deliberately omitted: its internal size is
       not a public ABI.  The exact modulus allocation is always accounted. */
    return sagejs_retained_size_add(
        sizeof(fmpz_mod_ctx_struct),
        sagejs_fmpz_mod_polynomial_fmpz_bytes(
            fmpz_mod_ctx_modulus(context)));
}

static inline size_t sagejs_fmpz_mod_polynomial_value_bytes(
    const fmpz_mod_poly_t value)
{
    size_t retained = sagejs_retained_size_multiply(
        (size_t) value->alloc, sizeof(fmpz));
    for (slong index = 0; index < value->alloc; index++)
        retained = sagejs_retained_size_add(retained,
            sagejs_fmpz_mod_polynomial_fmpz_bytes(value->coeffs + index));
    return retained;
}

static inline void sagejs_fmpz_mod_polynomial_recompute_allocated_bytes(
    sagejs_fmpz_mod_polynomial_t polynomial)
{
    size_t retained = sizeof(sagejs_fmpz_mod_polynomial_struct);
    retained = sagejs_retained_size_add(retained,
        sagejs_fmpz_mod_polynomial_context_bytes(polynomial->context));
    retained = sagejs_retained_size_add(retained,
        sagejs_fmpz_mod_polynomial_value_bytes(polynomial->value));
    polynomial->retained_bytes = retained;
}

static inline size_t sagejs_fmpz_mod_polynomial_allocated_bytes(
    const sagejs_fmpz_mod_polynomial_t polynomial)
{
    return polynomial->retained_bytes;
}

static inline int sagejs_fmpz_mod_polynomial_valid_modulus(
    const fmpz_t modulus)
{
    /* The public finite-field parent has normally certified this already, but
       the generated safe FFI is independently callable.  Recheck at resource
       ingress so composite input can never reach FLINT field algorithms. */
    return fmpz_cmp_ui(modulus, 2) >= 0 && fmpz_is_prime(modulus);
}

static inline int sagejs_fmpz_mod_polynomial_same_modulus(
    const sagejs_fmpz_mod_polynomial_t left,
    const sagejs_fmpz_mod_polynomial_t right)
{
    return left->sealed && right->sealed &&
        fmpz_equal(fmpz_mod_ctx_modulus(left->context),
            fmpz_mod_ctx_modulus(right->context));
}

static inline int sagejs_fmpz_mod_polynomial_init(
    sagejs_fmpz_mod_polynomial_t result, const fmpz_t modulus,
    uint64_t length)
{
    if (!sagejs_fmpz_mod_polynomial_valid_modulus(modulus) ||
        length > (uint64_t) WORD_MAX ||
        length > (uint64_t) SIZE_MAX / sizeof(fmpz))
        return 0;
    fmpz_mod_ctx_init(result->context, modulus);
    fmpz_mod_poly_init2(result->value, (slong) length, result->context);
    result->builder_length = (slong) length;
    result->sealed = 0;
    sagejs_fmpz_mod_polynomial_recompute_allocated_bytes(result);
    return 1;
}

static inline void sagejs_fmpz_mod_polynomial_clear(
    sagejs_fmpz_mod_polynomial_t polynomial)
{
    fmpz_mod_poly_clear(polynomial->value, polynomial->context);
    fmpz_mod_ctx_clear(polynomial->context);
    polynomial->builder_length = 0;
    polynomial->sealed = 0;
    polynomial->retained_bytes = 0;
}

static inline int sagejs_fmpz_mod_polynomial_set_coefficient(
    sagejs_fmpz_mod_polynomial_t polynomial, uint64_t index,
    const fmpz_t coefficient)
{
    if (polynomial->sealed ||
        index >= (uint64_t) polynomial->builder_length)
        return 0;
    fmpz_mod_poly_set_coeff_fmpz(
        polynomial->value, (slong) index, coefficient,
        polynomial->context);
    sagejs_fmpz_mod_polynomial_recompute_allocated_bytes(polynomial);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_seal(
    sagejs_fmpz_mod_polynomial_t polynomial)
{
    if (polynomial->sealed)
        return 0;
    _fmpz_mod_poly_normalise(polynomial->value);
    polynomial->builder_length = 0;
    polynomial->sealed = 1;
    sagejs_fmpz_mod_polynomial_recompute_allocated_bytes(polynomial);
    return 1;
}

static inline void sagejs_fmpz_mod_polynomial_finish_result(
    sagejs_fmpz_mod_polynomial_t result)
{
    result->builder_length = 0;
    result->sealed = 1;
    sagejs_fmpz_mod_polynomial_recompute_allocated_bytes(result);
}

static inline void sagejs_fmpz_mod_polynomial_init_result(
    sagejs_fmpz_mod_polynomial_t result,
    const sagejs_fmpz_mod_polynomial_t source)
{
    fmpz_mod_ctx_init(result->context,
        fmpz_mod_ctx_modulus(source->context));
    fmpz_mod_poly_init(result->value, result->context);
    result->builder_length = 0;
    result->sealed = 0;
    result->retained_bytes = 0;
}

static inline int sagejs_fmpz_mod_polynomial_modulus(
    fmpz_t result, const sagejs_fmpz_mod_polynomial_t polynomial)
{
    if (!polynomial->sealed)
        return 0;
    fmpz_set(result, fmpz_mod_ctx_modulus(polynomial->context));
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_is_zero(
    fmpz_t result, const sagejs_fmpz_mod_polynomial_t polynomial)
{
    if (!polynomial->sealed)
        return 0;
    fmpz_set_ui(result, (ulong) (polynomial->value->length == 0));
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_length(
    fmpz_t result, const sagejs_fmpz_mod_polynomial_t polynomial)
{
    if (!polynomial->sealed)
        return 0;
    fmpz_set_ui(result,
        (ulong) fmpz_mod_poly_length(polynomial->value,
            polynomial->context));
    return 1;
}

static inline uint64_t sagejs_fmpz_mod_polynomial_entry_count(
    const sagejs_fmpz_mod_polynomial_t source)
{
    return source->sealed ? (uint64_t)
        fmpz_mod_poly_length(source->value, source->context) : 0;
}

static inline int sagejs_fmpz_mod_polynomial_coefficient(
    fmpz_t result, const sagejs_fmpz_mod_polynomial_t polynomial,
    uint64_t index)
{
    if (!polynomial->sealed || index > (uint64_t) WORD_MAX)
        return 0;
    fmpz_mod_poly_get_coeff_fmpz(result, polynomial->value,
        (slong) index, polynomial->context);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_copy(
    sagejs_fmpz_mod_polynomial_t result,
    const sagejs_fmpz_mod_polynomial_t source)
{
    if (!source->sealed)
        return 0;
    sagejs_fmpz_mod_polynomial_init_result(result, source);
    fmpz_mod_poly_set(result->value, source->value, result->context);
    sagejs_fmpz_mod_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_equal(
    fmpz_t result, const sagejs_fmpz_mod_polynomial_t left,
    const sagejs_fmpz_mod_polynomial_t right)
{
    if (!sagejs_fmpz_mod_polynomial_same_modulus(left, right))
        return 0;
    int equal = left->value->length == right->value->length;
    for (slong index = 0; equal && index < left->value->length; index++)
        equal = fmpz_equal(
            left->value->coeffs + index,
            right->value->coeffs + index);
    fmpz_set_ui(result, (ulong) equal);
    return 1;
}

#define SAGEJS_FMPZ_MOD_POLYNOMIAL_BINARY(name, operation)                 \
static inline int sagejs_fmpz_mod_polynomial_##name(                      \
    sagejs_fmpz_mod_polynomial_t result,                                  \
    const sagejs_fmpz_mod_polynomial_t left,                              \
    const sagejs_fmpz_mod_polynomial_t right)                             \
{                                                                         \
    if (!sagejs_fmpz_mod_polynomial_same_modulus(left, right))            \
        return 0;                                                         \
    sagejs_fmpz_mod_polynomial_init_result(result, left);                 \
    operation(result->value, left->value, right->value, result->context); \
    sagejs_fmpz_mod_polynomial_finish_result(result);                     \
    return 1;                                                             \
}

SAGEJS_FMPZ_MOD_POLYNOMIAL_BINARY(add, fmpz_mod_poly_add)
SAGEJS_FMPZ_MOD_POLYNOMIAL_BINARY(sub, fmpz_mod_poly_sub)
SAGEJS_FMPZ_MOD_POLYNOMIAL_BINARY(mul, fmpz_mod_poly_mul)

#undef SAGEJS_FMPZ_MOD_POLYNOMIAL_BINARY

static inline int sagejs_fmpz_mod_polynomial_neg(
    sagejs_fmpz_mod_polynomial_t result,
    const sagejs_fmpz_mod_polynomial_t source)
{
    if (!source->sealed)
        return 0;
    sagejs_fmpz_mod_polynomial_init_result(result, source);
    fmpz_mod_poly_neg(result->value, source->value, result->context);
    sagejs_fmpz_mod_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_pow(
    sagejs_fmpz_mod_polynomial_t result,
    const sagejs_fmpz_mod_polynomial_t source, uint64_t exponent)
{
    if (!source->sealed || exponent > (uint64_t) UWORD_MAX)
        return 0;
    sagejs_fmpz_mod_polynomial_init_result(result, source);
    fmpz_mod_poly_pow(result->value, source->value,
        (ulong) exponent, result->context);
    sagejs_fmpz_mod_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_derivative(
    sagejs_fmpz_mod_polynomial_t result,
    const sagejs_fmpz_mod_polynomial_t source)
{
    if (!source->sealed)
        return 0;
    sagejs_fmpz_mod_polynomial_init_result(result, source);
    fmpz_mod_poly_derivative(result->value, source->value,
        result->context);
    sagejs_fmpz_mod_polynomial_finish_result(result);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_evaluate(
    fmpz_t result, const sagejs_fmpz_mod_polynomial_t source,
    const fmpz_t argument)
{
    if (!source->sealed)
        return 0;
    fmpz_mod_poly_evaluate_fmpz(
        result, source->value, argument, source->context);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_gcd(
    sagejs_fmpz_mod_polynomial_t result,
    const sagejs_fmpz_mod_polynomial_t left,
    const sagejs_fmpz_mod_polynomial_t right)
{
    if (!sagejs_fmpz_mod_polynomial_same_modulus(left, right))
        return 0;
    sagejs_fmpz_mod_polynomial_init_result(result, left);
    fmpz_mod_poly_gcd(result->value, left->value, right->value,
        result->context);
    sagejs_fmpz_mod_polynomial_finish_result(result);
    return 1;
}

static inline size_t sagejs_fmpz_mod_polynomial_division_result_allocated_bytes(
    const sagejs_fmpz_mod_polynomial_division_result_t result)
{
    return result->retained_bytes;
}

static inline void sagejs_fmpz_mod_polynomial_division_result_clear(
    sagejs_fmpz_mod_polynomial_division_result_t result)
{
    sagejs_fmpz_mod_polynomial_clear(&result->remainder);
    sagejs_fmpz_mod_polynomial_clear(&result->quotient);
    result->retained_bytes = 0;
}

static inline int sagejs_fmpz_mod_polynomial_divrem_resource(
    sagejs_fmpz_mod_polynomial_division_result_t result,
    const sagejs_fmpz_mod_polynomial_t dividend,
    const sagejs_fmpz_mod_polynomial_t divisor)
{
    if (!sagejs_fmpz_mod_polynomial_same_modulus(dividend, divisor) ||
        fmpz_mod_poly_length(divisor->value, divisor->context) == 0)
        return 0;
    sagejs_fmpz_mod_polynomial_struct *quotient = &result->quotient;
    sagejs_fmpz_mod_polynomial_struct *remainder = &result->remainder;
    sagejs_fmpz_mod_polynomial_init_result(quotient, dividend);
    sagejs_fmpz_mod_polynomial_init_result(remainder, dividend);
    fmpz_mod_poly_divrem(result->quotient.value, result->remainder.value,
        dividend->value, divisor->value, result->quotient.context);
    sagejs_fmpz_mod_polynomial_finish_result(quotient);
    sagejs_fmpz_mod_polynomial_finish_result(remainder);
    result->retained_bytes = sagejs_retained_size_add(
        sizeof(sagejs_fmpz_mod_polynomial_division_result_struct),
        sagejs_retained_size_add(result->quotient.retained_bytes,
            result->remainder.retained_bytes));
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_division_result_quotient(
    sagejs_fmpz_mod_polynomial_t output,
    const sagejs_fmpz_mod_polynomial_division_result_t result)
{
    return sagejs_fmpz_mod_polynomial_copy(output, &result->quotient);
}

static inline int sagejs_fmpz_mod_polynomial_division_result_remainder(
    sagejs_fmpz_mod_polynomial_t output,
    const sagejs_fmpz_mod_polynomial_division_result_t result)
{
    return sagejs_fmpz_mod_polynomial_copy(output, &result->remainder);
}

static inline size_t sagejs_fmpz_mod_polynomial_xgcd_result_allocated_bytes(
    const sagejs_fmpz_mod_polynomial_xgcd_result_t result)
{
    return result->retained_bytes;
}

static inline void sagejs_fmpz_mod_polynomial_xgcd_result_clear(
    sagejs_fmpz_mod_polynomial_xgcd_result_t result)
{
    sagejs_fmpz_mod_polynomial_clear(&result->right_coefficient);
    sagejs_fmpz_mod_polynomial_clear(&result->left_coefficient);
    sagejs_fmpz_mod_polynomial_clear(&result->gcd);
    result->retained_bytes = 0;
}

static inline int sagejs_fmpz_mod_polynomial_xgcd_resource(
    sagejs_fmpz_mod_polynomial_xgcd_result_t result,
    const sagejs_fmpz_mod_polynomial_t left,
    const sagejs_fmpz_mod_polynomial_t right)
{
    if (!sagejs_fmpz_mod_polynomial_same_modulus(left, right))
        return 0;
    sagejs_fmpz_mod_polynomial_struct *gcd = &result->gcd;
    sagejs_fmpz_mod_polynomial_struct *left_coefficient =
        &result->left_coefficient;
    sagejs_fmpz_mod_polynomial_struct *right_coefficient =
        &result->right_coefficient;
    sagejs_fmpz_mod_polynomial_init_result(gcd, left);
    sagejs_fmpz_mod_polynomial_init_result(left_coefficient, left);
    sagejs_fmpz_mod_polynomial_init_result(right_coefficient, left);
    if (left->value->length == 0 && right->value->length == 0)
    {
        fmpz_mod_poly_one(result->left_coefficient.value,
            result->left_coefficient.context);
    }
    else
    {
        fmpz_mod_poly_xgcd(result->gcd.value,
            result->left_coefficient.value,
            result->right_coefficient.value,
            left->value, right->value, result->gcd.context);
    }
    sagejs_fmpz_mod_polynomial_finish_result(gcd);
    sagejs_fmpz_mod_polynomial_finish_result(left_coefficient);
    sagejs_fmpz_mod_polynomial_finish_result(right_coefficient);
    result->retained_bytes = sizeof(sagejs_fmpz_mod_polynomial_xgcd_result_struct);
    result->retained_bytes = sagejs_retained_size_add(result->retained_bytes,
        result->gcd.retained_bytes);
    result->retained_bytes = sagejs_retained_size_add(result->retained_bytes,
        result->left_coefficient.retained_bytes);
    result->retained_bytes = sagejs_retained_size_add(result->retained_bytes,
        result->right_coefficient.retained_bytes);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_xgcd_result_gcd(
    sagejs_fmpz_mod_polynomial_t output,
    const sagejs_fmpz_mod_polynomial_xgcd_result_t result)
{
    return sagejs_fmpz_mod_polynomial_copy(output, &result->gcd);
}

static inline int sagejs_fmpz_mod_polynomial_xgcd_result_left_coefficient(
    sagejs_fmpz_mod_polynomial_t output,
    const sagejs_fmpz_mod_polynomial_xgcd_result_t result)
{
    return sagejs_fmpz_mod_polynomial_copy(output,
        &result->left_coefficient);
}

static inline int sagejs_fmpz_mod_polynomial_xgcd_result_right_coefficient(
    sagejs_fmpz_mod_polynomial_t output,
    const sagejs_fmpz_mod_polynomial_xgcd_result_t result)
{
    return sagejs_fmpz_mod_polynomial_copy(output,
        &result->right_coefficient);
}

static inline size_t sagejs_fmpz_mod_polynomial_factorization_bytes(
    const fmpz_mod_poly_factor_t factorization,
    const fmpz_mod_ctx_t context)
{
    size_t retained = sagejs_retained_size_add(
        sizeof(fmpz_mod_poly_factor_struct),
        sagejs_retained_size_multiply((size_t) factorization->alloc,
            sizeof(fmpz_mod_poly_struct) + sizeof(slong)));
    for (slong index = 0; index < factorization->num; index++)
        retained = sagejs_retained_size_add(retained,
            sagejs_fmpz_mod_polynomial_value_bytes(
                factorization->poly + index));
    (void) context;
    return retained;
}

static inline size_t sagejs_fmpz_mod_polynomial_factorization_allocated_bytes(
    const sagejs_fmpz_mod_polynomial_factorization_t factorization)
{
    return factorization->retained_bytes;
}

static inline void sagejs_fmpz_mod_polynomial_factorization_clear(
    sagejs_fmpz_mod_polynomial_factorization_t factorization)
{
    fmpz_clear(factorization->unit);
    fmpz_mod_poly_factor_clear(factorization->value,
        factorization->context);
    fmpz_mod_ctx_clear(factorization->context);
    factorization->retained_bytes = 0;
}

static inline int sagejs_fmpz_mod_polynomial_factor_resource(
    sagejs_fmpz_mod_polynomial_factorization_t result,
    const sagejs_fmpz_mod_polynomial_t source)
{
    if (!source->sealed || source->value->length == 0)
        return 0;
    fmpz_mod_ctx_init(result->context,
        fmpz_mod_ctx_modulus(source->context));
    fmpz_mod_poly_factor_init(result->value, result->context);
    fmpz_init(result->unit);
    fmpz_mod_poly_get_coeff_fmpz(result->unit, source->value,
        fmpz_mod_poly_degree(source->value, source->context), source->context);
    fmpz_mod_poly_t monic;
    fmpz_mod_poly_init(monic, result->context);
    fmpz_mod_poly_make_monic(monic, source->value, result->context);
    fmpz_mod_poly_factor(result->value, monic, result->context);
    fmpz_mod_poly_clear(monic, result->context);
    result->retained_bytes = sizeof(sagejs_fmpz_mod_polynomial_factorization_struct);
    result->retained_bytes = sagejs_retained_size_add(result->retained_bytes,
        sagejs_fmpz_mod_polynomial_context_bytes(result->context));
    result->retained_bytes = sagejs_retained_size_add(result->retained_bytes,
        sagejs_fmpz_mod_polynomial_fmpz_bytes(result->unit));
    result->retained_bytes = sagejs_retained_size_add(result->retained_bytes,
        sagejs_fmpz_mod_polynomial_factorization_bytes(result->value,
            result->context));
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_factorization_count(
    fmpz_t output,
    const sagejs_fmpz_mod_polynomial_factorization_t factorization)
{
    fmpz_set_ui(output, (ulong) factorization->value->num);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_factorization_unit(
    fmpz_t output,
    const sagejs_fmpz_mod_polynomial_factorization_t factorization)
{
    fmpz_set(output, factorization->unit);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_factorization_exponent(
    fmpz_t output,
    const sagejs_fmpz_mod_polynomial_factorization_t factorization,
    uint64_t index)
{
    if (index >= (uint64_t) factorization->value->num)
        return 0;
    fmpz_set_ui(output, (ulong) factorization->value->exp[(slong) index]);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_factorization_factor(
    sagejs_fmpz_mod_polynomial_t output,
    const sagejs_fmpz_mod_polynomial_factorization_t factorization,
    uint64_t index)
{
    if (index >= (uint64_t) factorization->value->num)
        return 0;
    fmpz_mod_ctx_init(output->context,
        fmpz_mod_ctx_modulus(factorization->context));
    fmpz_mod_poly_init(output->value, output->context);
    fmpz_mod_poly_factor_get_poly(output->value, factorization->value,
        (slong) index, output->context);
    sagejs_fmpz_mod_polynomial_finish_result(output);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_factorization_copy_bytes(
    unsigned char **output, uint64_t *output_length,
    const sagejs_fmpz_mod_polynomial_factorization_t factorization)
{
    *output = NULL;
    *output_length = 0;
    const slong count = factorization->value->num;
    if (count < 0 || (uint64_t) count >
            (uint64_t) ((SIZE_MAX - 16) / 16))
        return 0;
    size_t length = 16 + 16 * (size_t) count;
    size_t maximum = 0;
    if (!sagejs_fmpz_mod_polynomial_unsigned_size(&length, &maximum,
            fmpz_mod_ctx_modulus(factorization->context)) ||
        !sagejs_fmpz_mod_polynomial_unsigned_size(&length, &maximum,
            factorization->unit))
        return 0;
    for (slong factor = 0; factor < count; factor++)
        for (slong coefficient = 0;
             coefficient < factorization->value->poly[factor].length;
             coefficient++)
            if (!sagejs_fmpz_mod_polynomial_unsigned_size(&length, &maximum,
                    factorization->value->poly[factor].coeffs + coefficient))
                return 0;
    unsigned char *data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (data == NULL)
        return 0;
    memcpy(data, "SJFPM\1\0\0", 8);
    sagejs_exact_polynomial_write_u64(data, 8, (uint64_t) count);
    for (slong factor = 0; factor < count; factor++)
    {
        const size_t metadata = 16 + 16 * (size_t) factor;
        sagejs_exact_polynomial_write_u64(data, metadata,
            (uint64_t) factorization->value->exp[factor]);
        sagejs_exact_polynomial_write_u64(data, metadata + 8,
            (uint64_t) factorization->value->poly[factor].length);
    }
    const size_t maximum_words =
        (maximum + sizeof(ulong) - 1) / sizeof(ulong);
    ulong *words = maximum_words == 0 ? NULL :
        (ulong *) calloc(maximum_words, sizeof(ulong));
    if (maximum_words != 0 && words == NULL)
    {
        free(data);
        return 0;
    }
    fmpz_t scratch;
    fmpz_init(scratch);
    size_t offset = 16 + 16 * (size_t) count;
    sagejs_fmpz_mod_polynomial_write_unsigned(data, &offset,
        fmpz_mod_ctx_modulus(factorization->context), scratch, words);
    sagejs_fmpz_mod_polynomial_write_unsigned(data, &offset,
        factorization->unit, scratch, words);
    for (slong factor = 0; factor < count; factor++)
        for (slong coefficient = 0;
             coefficient < factorization->value->poly[factor].length;
             coefficient++)
            sagejs_fmpz_mod_polynomial_write_unsigned(data, &offset,
                factorization->value->poly[factor].coeffs + coefficient,
                scratch, words);
    fmpz_clear(scratch);
    free(words);
    if (offset != length)
    {
        free(data);
        return 0;
    }
    *output = data;
    *output_length = (uint64_t) length;
    return 1;
}

static inline void sagejs_fmpz_mod_polynomial_free_bytes(
    unsigned char *data)
{
    free(data);
}

static inline size_t sagejs_fmpz_mod_polynomial_roots_allocated_bytes(
    const sagejs_fmpz_mod_polynomial_roots_t roots)
{
    return roots->retained_bytes;
}

static inline void sagejs_fmpz_mod_polynomial_roots_clear(
    sagejs_fmpz_mod_polynomial_roots_t roots)
{
    fmpz_mod_poly_factor_clear(roots->value, roots->context);
    fmpz_mod_ctx_clear(roots->context);
    roots->retained_bytes = 0;
}

static inline int sagejs_fmpz_mod_polynomial_roots_resource(
    sagejs_fmpz_mod_polynomial_roots_t result,
    const sagejs_fmpz_mod_polynomial_t source)
{
    if (!source->sealed || source->value->length == 0)
        return 0;
    fmpz_mod_ctx_init(result->context,
        fmpz_mod_ctx_modulus(source->context));
    fmpz_mod_poly_factor_init(result->value, result->context);
    fmpz_mod_poly_roots(result->value, source->value, 1, result->context);
    result->retained_bytes = sizeof(sagejs_fmpz_mod_polynomial_roots_struct);
    result->retained_bytes = sagejs_retained_size_add(result->retained_bytes,
        sagejs_fmpz_mod_polynomial_context_bytes(result->context));
    result->retained_bytes = sagejs_retained_size_add(result->retained_bytes,
        sagejs_fmpz_mod_polynomial_factorization_bytes(result->value,
            result->context));
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_roots_count(
    fmpz_t output, const sagejs_fmpz_mod_polynomial_roots_t roots)
{
    fmpz_set_ui(output, (ulong) roots->value->num);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_roots_exponent(
    fmpz_t output, const sagejs_fmpz_mod_polynomial_roots_t roots,
    uint64_t index)
{
    if (index >= (uint64_t) roots->value->num)
        return 0;
    fmpz_set_ui(output, (ulong) roots->value->exp[(slong) index]);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_roots_root(
    fmpz_t output, const sagejs_fmpz_mod_polynomial_roots_t roots,
    uint64_t index)
{
    if (index >= (uint64_t) roots->value->num ||
        roots->value->poly[(slong) index].length != 2)
        return 0;
    const fmpz_mod_poly_struct *factor =
        roots->value->poly + (slong) index;
    fmpz_neg(output, factor->coeffs + 0);
    fmpz_mod_set_fmpz(output, output, roots->context);
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_roots_copy_bytes(
    unsigned char **output, uint64_t *output_length,
    const sagejs_fmpz_mod_polynomial_roots_t roots)
{
    *output = NULL;
    *output_length = 0;
    const slong count = roots->value->num;
    if (count < 0 || (uint64_t) count >
            (uint64_t) ((SIZE_MAX - 16) / 8))
        return 0;
    size_t length = 16 + 8 * (size_t) count;
    size_t maximum = 0;
    if (!sagejs_fmpz_mod_polynomial_unsigned_size(&length, &maximum,
            fmpz_mod_ctx_modulus(roots->context)))
        return 0;
    fmpz_t root;
    fmpz_init(root);
    for (slong index = 0; index < count; index++)
    {
        if (!sagejs_fmpz_mod_polynomial_roots_root(
                root, roots, (uint64_t) index) ||
            !sagejs_fmpz_mod_polynomial_unsigned_size(
                &length, &maximum, root))
        {
            fmpz_clear(root);
            return 0;
        }
    }
    unsigned char *data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (data == NULL)
    {
        fmpz_clear(root);
        return 0;
    }
    memcpy(data, "SJRPM\1\0\0", 8);
    sagejs_exact_polynomial_write_u64(data, 8, (uint64_t) count);
    for (slong index = 0; index < count; index++)
        sagejs_exact_polynomial_write_u64(data, 16 + 8 * (size_t) index,
            (uint64_t) roots->value->exp[index]);
    const size_t maximum_words =
        (maximum + sizeof(ulong) - 1) / sizeof(ulong);
    ulong *words = maximum_words == 0 ? NULL :
        (ulong *) calloc(maximum_words, sizeof(ulong));
    if (maximum_words != 0 && words == NULL)
    {
        free(data);
        fmpz_clear(root);
        return 0;
    }
    fmpz_t scratch;
    fmpz_init(scratch);
    size_t offset = 16 + 8 * (size_t) count;
    sagejs_fmpz_mod_polynomial_write_unsigned(data, &offset,
        fmpz_mod_ctx_modulus(roots->context), scratch, words);
    for (slong index = 0; index < count; index++)
    {
        (void) sagejs_fmpz_mod_polynomial_roots_root(
            root, roots, (uint64_t) index);
        sagejs_fmpz_mod_polynomial_write_unsigned(data, &offset,
            root, scratch, words);
    }
    fmpz_clear(scratch);
    fmpz_clear(root);
    free(words);
    if (offset != length)
    {
        free(data);
        return 0;
    }
    *output = data;
    *output_length = (uint64_t) length;
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_format(
    sagejs_flint_byte_region_t result,
    const sagejs_fmpz_mod_polynomial_t source)
{
    result->data = NULL;
    result->length = 0;
    if (!source->sealed)
        return 0;
    char *text = fmpz_mod_poly_get_str_pretty(
        source->value, "x", source->context);
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

/* SJMP v1: eight-byte magic/version, unsigned little-endian modulus with a
   u64 byte length, u64 coefficient count, then the same unsigned encoding for
   each canonical low-to-high coefficient. */
static inline int sagejs_fmpz_mod_polynomial_unsigned_size(
    size_t *total, size_t *maximum, const fmpz_t value)
{
    const size_t encoded = sagejs_fmpz_serialized_bytes(value);
    const size_t length = encoded == 0 ? 1 : encoded;
    if (!sagejs_size_add(total, 8) || !sagejs_size_add(total, length))
        return 0;
    if (length > *maximum)
        *maximum = length;
    return 1;
}

static inline void sagejs_fmpz_mod_polynomial_write_unsigned(
    unsigned char *data, size_t *offset, const fmpz_t value,
    fmpz_t scratch, ulong *words)
{
    const size_t encoded = sagejs_fmpz_serialized_bytes(value);
    const size_t length = encoded == 0 ? 1 : encoded;
    sagejs_exact_polynomial_write_u64(data, *offset, (uint64_t) length);
    *offset += 8;
    const slong word_count = (slong)
        ((length + sizeof(ulong) - 1) / sizeof(ulong));
    fmpz_set(scratch, value);
    if (encoded != 0)
        fmpz_get_ui_array(words, word_count, scratch);
    else
        words[0] = 0;
    for (size_t byte = 0; byte < length; byte++)
        data[(*offset)++] = (unsigned char)
            (words[byte / sizeof(ulong)] >>
             (8 * (byte % sizeof(ulong))));
}

static inline int sagejs_fmpz_mod_polynomial_serialize(
    sagejs_flint_byte_region_t result,
    const sagejs_fmpz_mod_polynomial_t source)
{
    result->data = NULL;
    result->length = 0;
    if (!source->sealed)
        return 0;
    const slong count = fmpz_mod_poly_length(source->value,
        source->context);
    size_t length = 8;
    size_t maximum = 0;
    if (!sagejs_fmpz_mod_polynomial_unsigned_size(&length, &maximum,
            fmpz_mod_ctx_modulus(source->context)) ||
        !sagejs_size_add(&length, 8))
        return 0;
    for (slong index = 0; index < count; index++)
        if (!sagejs_fmpz_mod_polynomial_unsigned_size(&length, &maximum,
                source->value->coeffs + index))
            return 0;
    result->data = (unsigned char *) malloc(length == 0 ? 1 : length);
    if (result->data == NULL)
        return 0;
    result->length = length;
    memcpy(result->data, "SJMP\1\0\0\0", 8);
    const size_t maximum_words =
        (maximum + sizeof(ulong) - 1) / sizeof(ulong);
    ulong *words = maximum_words == 0 ? NULL :
        (ulong *) calloc(maximum_words, sizeof(ulong));
    if (maximum_words != 0 && words == NULL)
    {
        sagejs_flint_byte_region_clear(result);
        return 0;
    }
    fmpz_t scratch;
    fmpz_init(scratch);
    size_t offset = 8;
    sagejs_fmpz_mod_polynomial_write_unsigned(result->data, &offset,
        fmpz_mod_ctx_modulus(source->context), scratch, words);
    sagejs_exact_polynomial_write_u64(result->data, offset,
        (uint64_t) count);
    offset += 8;
    for (slong index = 0; index < count; index++)
        sagejs_fmpz_mod_polynomial_write_unsigned(result->data, &offset,
            source->value->coeffs + index, scratch, words);
    fmpz_clear(scratch);
    free(words);
    if (offset != length)
    {
        sagejs_flint_byte_region_clear(result);
        return 0;
    }
    return 1;
}

static inline uint64_t sagejs_fmpz_mod_polynomial_read_u64(
    const unsigned char *data, size_t offset)
{
    uint64_t value = 0;
    for (size_t byte = 0; byte < 8; byte++)
        value |= (uint64_t) data[offset + byte] << (8 * byte);
    return value;
}

static inline int sagejs_fmpz_mod_polynomial_read_unsigned(
    fmpz_t output, const unsigned char *data, size_t length,
    size_t *offset)
{
    if (*offset > length || length - *offset < 8)
        return 0;
    const uint64_t byte_count = sagejs_fmpz_mod_polynomial_read_u64(
        data, *offset);
    *offset += 8;
    if (byte_count == 0 || byte_count > (uint64_t) (length - *offset) ||
        byte_count > (uint64_t) WORD_MAX)
        return 0;
    if (byte_count > 1 && data[*offset + (size_t) byte_count - 1] == 0)
        return 0;
    const slong word_count = (slong)
        ((byte_count + sizeof(ulong) - 1) / sizeof(ulong));
    ulong *words = (ulong *) calloc((size_t) word_count, sizeof(ulong));
    if (words == NULL)
        return 0;
    for (uint64_t byte = 0; byte < byte_count; byte++)
        words[byte / sizeof(ulong)] |=
            (ulong) data[*offset + (size_t) byte] <<
            (8 * (byte % sizeof(ulong)));
    fmpz_set_ui_array(output, words, word_count);
    free(words);
    *offset += (size_t) byte_count;
    return 1;
}

static inline int sagejs_fmpz_mod_polynomial_deserialize(
    sagejs_fmpz_mod_polynomial_t result,
    const sagejs_flint_byte_region_t source)
{
    const unsigned char *data = source->data;
    const size_t length = source->length;
    if (length < 24 || memcmp(data, "SJMP\1\0\0\0", 8) != 0)
        return 0;
    size_t offset = 8;
    fmpz_t modulus;
    fmpz_init(modulus);
    if (!sagejs_fmpz_mod_polynomial_read_unsigned(
            modulus, data, length, &offset) ||
        !sagejs_fmpz_mod_polynomial_valid_modulus(modulus) ||
        length - offset < 8)
    {
        fmpz_clear(modulus);
        return 0;
    }
    const uint64_t count = sagejs_fmpz_mod_polynomial_read_u64(data, offset);
    offset += 8;
    if (count > (uint64_t) WORD_MAX || count > (uint64_t) (length - offset) / 9)
    {
        fmpz_clear(modulus);
        return 0;
    }
    if (!sagejs_fmpz_mod_polynomial_init(result, modulus, count))
    {
        fmpz_clear(modulus);
        return 0;
    }
    fmpz_clear(modulus);
    fmpz_t coefficient;
    fmpz_init(coefficient);
    int ok = 1;
    for (uint64_t index = 0; index < count; index++)
    {
        if (!sagejs_fmpz_mod_polynomial_read_unsigned(
                coefficient, data, length, &offset) ||
            fmpz_cmp(coefficient,
                fmpz_mod_ctx_modulus(result->context)) >= 0)
        {
            ok = 0;
            break;
        }
        fmpz_mod_poly_set_coeff_fmpz(result->value, (slong) index,
            coefficient, result->context);
    }
    fmpz_clear(coefficient);
    if (!ok || offset != length ||
        (count != 0 && result->value->length != (slong) count))
    {
        sagejs_fmpz_mod_polynomial_clear(result);
        return 0;
    }
    sagejs_fmpz_mod_polynomial_finish_result(result);
    return 1;
}

#endif /* SAGEJS_FMPZ_MOD_POLYNOMIAL_FFI_H */
