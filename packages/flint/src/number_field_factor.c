/*
 * Exact univariate factorization over cyclotomic number fields.
 *
 * This implements Trager's reduction to factorization over Q: after a
 * separating shift x -> x - k*a, take the field norm, factor that rational
 * polynomial with FLINT, and recover the factors over Q(a) by exact gcds.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 */

#include <limits.h>
#include <stdlib.h>

#include <node_api.h>

#include <flint/flint.h>
#include <flint/fmpq.h>
#include <flint/fmpq_poly.h>
#include <flint/fmpz.h>
#include <flint/fmpz_poly.h>
#include <flint/fmpz_poly_factor.h>
#include <flint/fmpz_vec.h>
#include <flint/gr.h>
#include <flint/gr_poly.h>
#include <flint/nf.h>
#include <flint/nf_elem.h>
#include <flint/qqbar.h>

#include "algebraic.h"
#include "number_field_factor.h"

static int check_napi(napi_env env, napi_status status)
{
    const napi_extended_error_info *info;

    if (status == napi_ok)
        return 1;
    napi_get_last_error_info(env, &info);
    napi_throw_error(env, NULL,
        info != NULL && info->error_message != NULL
            ? info->error_message
            : "Node-API call failed");
    return 0;
}

static int require_arguments(
    napi_env env,
    napi_callback_info info,
    size_t expected,
    napi_value *args)
{
    size_t argc = expected;

    if (!check_napi(env, napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return 0;
    if (argc != expected)
    {
        napi_throw_type_error(env, NULL, "wrong number of arguments");
        return 0;
    }
    return 1;
}

static int array_length(napi_env env, napi_value value, uint32_t *length)
{
    bool is_array;

    if (!check_napi(env, napi_is_array(env, value, &is_array)))
        return 0;
    if (!is_array)
    {
        napi_throw_type_error(env, NULL, "expected an Array");
        return 0;
    }
    return check_napi(env, napi_get_array_length(env, value, length));
}

static int express_in_field(
    fmpq_poly_t result,
    const qqbar_t generator,
    const qqbar_t value)
{
    slong height = qqbar_height_bits(value);
    slong precision = height > (WORD_MAX - 40) / 2
        ? WORD_MAX : 2 * height + 40;

    if (precision < 128)
        precision = 128;
    for (int attempt = 0; attempt < 5; attempt++)
    {
        if (qqbar_express_in_field(
                result, generator, value, precision, 0, precision))
            return 1;
        if (precision <= WORD_MAX / 2)
            precision *= 2;
    }
    return 0;
}

static int input_polynomial(
    napi_env env,
    gr_poly_t result,
    napi_value coefficients,
    const qqbar_t generator,
    const nf_t field,
    gr_ctx_t context)
{
    uint32_t length;
    fmpq_poly_t representation;

    if (!array_length(env, coefficients, &length))
        return 0;
    fmpq_poly_init(representation);
    for (uint32_t index = 0; index < length; index++)
    {
        napi_value item;
        qqbar_srcptr value;

        if (!check_napi(env,
                napi_get_element(env, coefficients, index, &item)) ||
            (value = sagejs_qqbar_unwrap(env, item)) == NULL)
        {
            fmpq_poly_clear(representation);
            return 0;
        }
        fmpq_poly_zero(representation);
        if (!express_in_field(representation, generator, value))
        {
            fmpq_poly_clear(representation);
            napi_throw_range_error(env, NULL,
                "polynomial coefficient is not in the cyclotomic field");
            return 0;
        }
        gr_poly_fit_length(result, (slong) index + 1, context);
        nf_elem_set_fmpq_poly(
            (nf_elem_struct *) gr_poly_coeff_ptr(
                result, (slong) index, context),
            representation, field);
        if ((slong) index >= result->length)
            _gr_poly_set_length(result, (slong) index + 1, context);
    }
    _gr_poly_normalise(result, context);
    fmpq_poly_clear(representation);
    return 1;
}

/* Compute Norm(f(x - shift*a)) as a primitive integer polynomial. */
static int shifted_norm(
    fmpz_poly_t result,
    const gr_poly_t polynomial,
    slong shift,
    const nf_t field,
    gr_ctx_t field_context)
{
    int status = GR_SUCCESS;
    gr_ctx_t rational_polynomial_context;
    gr_poly_t shifted, linear, coefficient, defining;
    gr_ptr norm;
    fmpq_poly_t x, representation;
    fmpq_t value;

    gr_ctx_init_fmpq_poly(rational_polynomial_context);
    gr_poly_init(shifted, rational_polynomial_context);
    gr_poly_init(linear, rational_polynomial_context);
    gr_poly_init(coefficient, rational_polynomial_context);
    gr_poly_init(defining, rational_polynomial_context);
    norm = gr_heap_init(rational_polynomial_context);
    fmpq_poly_init(x);
    fmpq_poly_init(representation);
    fmpq_init(value);

    fmpq_poly_set_coeff_ui(x, 1, 1);
    status |= gr_poly_set_coeff_scalar(
        linear, 0, x, rational_polynomial_context);
    status |= gr_poly_set_coeff_si(
        linear, 1, -shift, rational_polynomial_context);

    for (slong index = polynomial->length - 1; index >= 0; index--)
    {
        status |= gr_poly_mul(
            shifted, shifted, linear, rational_polynomial_context);
        status |= gr_poly_zero(
            coefficient, rational_polynomial_context);
        nf_elem_get_fmpq_poly(
            representation,
            (const nf_elem_struct *) gr_poly_coeff_srcptr(
                polynomial, index, field_context),
            field);
        for (slong exponent = 0;
             exponent < fmpq_poly_length(representation); exponent++)
        {
            fmpq_poly_get_coeff_fmpq(value, representation, exponent);
            status |= gr_poly_set_coeff_fmpq(
                coefficient, exponent, value,
                rational_polynomial_context);
        }
        status |= gr_poly_add(
            shifted, shifted, coefficient,
            rational_polynomial_context);
    }

    for (slong exponent = 0;
         exponent < fmpq_poly_length(field->pol); exponent++)
    {
        fmpq_poly_get_coeff_fmpq(value, field->pol, exponent);
        status |= gr_poly_set_coeff_fmpq(
            defining, exponent, value,
            rational_polynomial_context);
    }
    status |= gr_poly_resultant(
        norm, defining, shifted, rational_polynomial_context);
    if (status == GR_SUCCESS)
    {
        fmpq_poly_get_numerator(
            result, (const fmpq_poly_struct *) norm);
        fmpz_poly_primitive_part(result, result);
        if (fmpz_sgn(fmpz_poly_lead(result)) < 0)
            fmpz_poly_neg(result, result);
    }

    fmpq_clear(value);
    fmpq_poly_clear(representation);
    fmpq_poly_clear(x);
    gr_heap_clear(norm, rational_polynomial_context);
    gr_poly_clear(defining, rational_polynomial_context);
    gr_poly_clear(coefficient, rational_polynomial_context);
    gr_poly_clear(linear, rational_polynomial_context);
    gr_poly_clear(shifted, rational_polynomial_context);
    gr_ctx_clear(rational_polynomial_context);
    return status == GR_SUCCESS;
}

static int append_irreducible_factors(
    gr_poly_vec_t factors,
    fmpz_vec_t exponents,
    const gr_poly_t squarefree,
    const fmpz_t multiplicity,
    const nf_t field,
    gr_ctx_t context)
{
    int success = 0;
    slong separating_shift = 0;
    fmpz_poly_t norm;
    fmpz_poly_factor_t rational_factors;
    gr_poly_t remaining, rational_factor, linear, composed, recovered;
    nf_elem_t generator, constant;

    fmpz_poly_init(norm);
    fmpz_poly_factor_init(rational_factors);
    gr_poly_init(remaining, context);
    gr_poly_init(rational_factor, context);
    gr_poly_init(linear, context);
    gr_poly_init(composed, context);
    gr_poly_init(recovered, context);
    nf_elem_init(generator, field);
    nf_elem_init(constant, field);
    nf_elem_gen(generator, field);
    if (gr_poly_set(remaining, squarefree, context) != GR_SUCCESS)
        goto cleanup;

    for (slong attempt = 0; attempt < 17; attempt++)
    {
        separating_shift = attempt == 0
            ? 0
            : (attempt % 2 ? (attempt + 1) / 2 : -attempt / 2);
        if (!shifted_norm(
                norm, squarefree, separating_shift, field, context))
            goto cleanup;
        if (
            fmpz_poly_degree(norm)
                == (squarefree->length - 1)
                    * fmpq_poly_degree(field->pol)
            && fmpz_poly_is_squarefree(norm)
        )
            break;
        if (attempt == 16)
            goto cleanup;
    }

    fmpz_poly_factor(rational_factors, norm);
    nf_elem_scalar_mul_si(
        constant, generator, separating_shift, field);
    if (gr_poly_set_coeff_scalar(linear, 0, constant, context) != GR_SUCCESS ||
        gr_poly_set_coeff_si(linear, 1, 1, context) != GR_SUCCESS)
        goto cleanup;

    for (slong index = 0;
         index < rational_factors->num && remaining->length > 1; index++)
    {
        if (gr_poly_zero(rational_factor, context) != GR_SUCCESS)
            goto cleanup;
        for (slong exponent = 0;
             exponent < fmpz_poly_length(rational_factors->p + index);
             exponent++)
        {
            if (gr_poly_set_coeff_fmpz(
                    rational_factor, exponent,
                    fmpz_poly_get_coeff_ptr(
                        rational_factors->p + index, exponent),
                    context) != GR_SUCCESS)
                goto cleanup;
        }
        if (gr_poly_compose(
                composed, rational_factor, linear, context) != GR_SUCCESS ||
            gr_poly_gcd(recovered, remaining, composed, context)
                != GR_SUCCESS)
            goto cleanup;
        if (recovered->length > 1)
        {
            if (gr_poly_vec_append(factors, recovered, context)
                    != GR_SUCCESS)
                goto cleanup;
            fmpz_vec_append(exponents, multiplicity);
            if (gr_poly_divexact(
                    remaining, remaining, recovered, context) != GR_SUCCESS)
                goto cleanup;
        }
    }
    if (remaining->length > 1)
    {
        if (gr_poly_vec_append(factors, remaining, context) != GR_SUCCESS)
            goto cleanup;
        fmpz_vec_append(exponents, multiplicity);
    }
    success = 1;

cleanup:
    nf_elem_clear(constant, field);
    nf_elem_clear(generator, field);
    gr_poly_clear(recovered, context);
    gr_poly_clear(composed, context);
    gr_poly_clear(linear, context);
    gr_poly_clear(rational_factor, context);
    gr_poly_clear(remaining, context);
    fmpz_poly_factor_clear(rational_factors);
    fmpz_poly_clear(norm);
    return success;
}

static napi_value output_element(
    napi_env env,
    const nf_elem_struct *element,
    const qqbar_t generator,
    const nf_t field)
{
    napi_value result;
    fmpq_poly_t representation;
    qqbar_t value;

    fmpq_poly_init(representation);
    qqbar_init(value);
    nf_elem_get_fmpq_poly(representation, element, field);
    qqbar_evaluate_fmpq_poly(value, representation, generator);
    result = sagejs_qqbar_wrap_copy(env, value);
    qqbar_clear(value);
    fmpq_poly_clear(representation);
    return result;
}

static napi_value output_factorization(
    napi_env env,
    const nf_elem_struct *unit,
    const gr_poly_vec_t factors,
    const fmpz_vec_t exponents,
    const qqbar_t generator,
    const nf_t field,
    gr_ctx_t context)
{
    napi_value result, unit_value, factor_values;

    unit_value = output_element(env, unit, generator, field);
    if (unit_value == NULL ||
        !check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env,
            napi_set_named_property(env, result, "unit", unit_value)) ||
        !check_napi(env,
            napi_create_array_with_length(
                env, (size_t) factors->length, &factor_values)))
        return NULL;

    for (slong index = 0; index < factors->length; index++)
    {
        const gr_poly_struct *factor = gr_poly_vec_entry_srcptr(
            factors, index, context);
        napi_value pair, coefficients, exponent_value;

        if (!check_napi(env,
                napi_create_array_with_length(
                    env, (size_t) factor->length, &coefficients)))
            return NULL;
        for (slong coefficient_index = 0;
             coefficient_index < factor->length; coefficient_index++)
        {
            napi_value coefficient = output_element(
                env,
                (const nf_elem_struct *) gr_poly_coeff_srcptr(
                    factor, coefficient_index, context),
                generator, field);
            if (coefficient == NULL ||
                !check_napi(env,
                    napi_set_element(
                        env, coefficients, (uint32_t) coefficient_index,
                        coefficient)))
                return NULL;
        }
        if (!check_napi(env, napi_create_array_with_length(env, 2, &pair)) ||
            !check_napi(env,
                napi_create_double(
                    env, (double) fmpz_get_si(exponents->entries + index),
                    &exponent_value)) ||
            !check_napi(env, napi_set_element(env, pair, 0, coefficients)) ||
            !check_napi(env, napi_set_element(env, pair, 1, exponent_value)) ||
            !check_napi(env,
                napi_set_element(env, factor_values, (uint32_t) index, pair)))
            return NULL;
    }
    if (!check_napi(env,
            napi_set_named_property(env, result, "factors", factor_values)))
        return NULL;
    return result;
}

napi_value sagejs_cyclotomic_poly_factor(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value answer = NULL;
    qqbar_srcptr generator;
    fmpq_poly_t defining;
    nf_t field;
    gr_ctx_t context;
    gr_poly_t polynomial, monic;
    gr_ptr unit, squarefree_unit;
    gr_poly_vec_t squarefree_factors, factors;
    fmpz_vec_t squarefree_exponents, exponents;
    int initialized_field = 0;

    if (!require_arguments(env, info, 2, args) ||
        (generator = sagejs_qqbar_unwrap(env, args[0])) == NULL)
        return NULL;
    fmpq_poly_init(defining);
    fmpq_poly_set_fmpz_poly(defining, QQBAR_POLY(generator));
    if (fmpq_poly_degree(defining) < 2)
    {
        fmpq_poly_clear(defining);
        napi_throw_range_error(env, NULL,
            "cyclotomic factorization requires a nontrivial number field");
        return NULL;
    }
    nf_init(field, defining);
    initialized_field = 1;
    _gr_ctx_init_nf_from_ref(context, field);
    gr_poly_init(polynomial, context);
    gr_poly_init(monic, context);
    unit = gr_heap_init(context);
    squarefree_unit = gr_heap_init(context);
    gr_poly_vec_init(squarefree_factors, 0, context);
    gr_poly_vec_init(factors, 0, context);
    fmpz_vec_init(squarefree_exponents, 0);
    fmpz_vec_init(exponents, 0);

    if (!input_polynomial(
            env, polynomial, args[1], generator, field, context))
        goto cleanup;
    if (polynomial->length == 0)
    {
        napi_throw_range_error(env, NULL,
            "the zero polynomial does not have a factorization");
        goto cleanup;
    }
    if (gr_set(
            unit,
            gr_poly_coeff_srcptr(
                polynomial, polynomial->length - 1, context),
            context) != GR_SUCCESS ||
        gr_poly_make_monic(monic, polynomial, context) != GR_SUCCESS ||
        gr_poly_factor_squarefree(
            squarefree_unit, squarefree_factors,
            squarefree_exponents, monic, context) != GR_SUCCESS)
    {
        napi_throw_error(env, NULL,
            "FLINT could not compute squarefree factors over the number field");
        goto cleanup;
    }
    for (slong index = 0; index < squarefree_factors->length; index++)
    {
        if (!append_irreducible_factors(
                factors, exponents,
                gr_poly_vec_entry_ptr(squarefree_factors, index, context),
                squarefree_exponents->entries + index,
                field, context))
        {
            napi_throw_error(env, NULL,
                "FLINT could not separate number-field polynomial factors");
            goto cleanup;
        }
    }
    answer = output_factorization(
        env, (const nf_elem_struct *) unit,
        factors, exponents, generator, field, context);

cleanup:
    fmpz_vec_clear(exponents);
    fmpz_vec_clear(squarefree_exponents);
    gr_poly_vec_clear(factors, context);
    gr_poly_vec_clear(squarefree_factors, context);
    gr_heap_clear(squarefree_unit, context);
    gr_heap_clear(unit, context);
    gr_poly_clear(monic, context);
    gr_poly_clear(polynomial, context);
    if (initialized_field)
        nf_clear(field);
    fmpq_poly_clear(defining);
    return answer;
}
