#include <limits.h>
#include <math.h>
#include <stdint.h>
#include <stdlib.h>

#include <node_api.h>

#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/fmpz_mod.h>
#include <flint/fmpz_mod_poly.h>
#include <flint/fq_default.h>
#include <flint/fq_default_mat.h>
#include <flint/fq_default_poly.h>
#include <flint/fq_default_poly_factor.h>

#include "extension_field.h"

struct sagejs_fq_context_value
{
    uint64_t magic;
    fq_default_ctx_t value;
    fmpz_t prime;
    slong degree;
    char *variable;
    size_t references;
};

typedef struct
{
    uint64_t magic;
    fq_default_t value;
    sagejs_fq_context_value *context;
} sagejs_fq_element;

typedef struct
{
    uint64_t magic;
    fq_default_poly_t value;
    sagejs_fq_context_value *context;
} sagejs_fq_poly;

typedef struct
{
    uint64_t magic;
    fq_default_mat_t value;
    sagejs_fq_context_value *context;
} sagejs_fq_matrix_value;

#define SAGEJS_FQ_CONTEXT_MAGIC UINT64_C(0x534147454A534643)
#define SAGEJS_FQ_ELEMENT_MAGIC UINT64_C(0x534147454A534645)
#define SAGEJS_FQ_POLY_MAGIC UINT64_C(0x534147454A534650)
#define SAGEJS_FQ_MATRIX_MAGIC UINT64_C(0x534147454A53464D)

static const napi_type_tag sagejs_fq_context_type_tag = {
    UINT64_C(0x188c953faeb14b5d),
    UINT64_C(0xa00e3b955e56fb4e)
};

static const napi_type_tag sagejs_fq_element_type_tag = {
    UINT64_C(0x7637e9d247b64b72),
    UINT64_C(0x82c5813184591e5b)
};

static const napi_type_tag sagejs_fq_poly_type_tag = {
    UINT64_C(0xb74448cfe5374c19),
    UINT64_C(0xb8539af6a361d8ae)
};

static const napi_type_tag sagejs_fq_matrix_type_tag = {
    UINT64_C(0x190081fb82654c73),
    UINT64_C(0xa0f93986d49ecee9)
};

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

static int bigint_to_fmpz(napi_env env, napi_value value, fmpz_t result)
{
    napi_valuetype type;
    int sign = 0;
    size_t count = 0;
    uint64_t *words;

    if (!check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_bigint)
    {
        napi_throw_type_error(env, NULL, "expected a BigInt");
        return 0;
    }
    if (!check_napi(env,
        napi_get_value_bigint_words(env, value, NULL, &count, NULL)))
        return 0;
    if (count == 0)
    {
        fmpz_zero(result);
        return 1;
    }
    words = malloc(count * sizeof(uint64_t));
    if (words == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate BigInt limbs");
        return 0;
    }
    if (!check_napi(env,
        napi_get_value_bigint_words(env, value, &sign, &count, words)))
    {
        free(words);
        return 0;
    }
    fmpz_set_ui_array(result, (const ulong *) words, (slong) count);
    free(words);
    if (sign)
        fmpz_neg(result, result);
    return 1;
}

static napi_value fmpz_to_bigint(napi_env env, const fmpz_t value)
{
    napi_value result;
    fmpz_t magnitude;
    flint_bitcnt_t bits;
    size_t count;
    uint64_t *words;
    int sign = fmpz_sgn(value) < 0;

    if (fmpz_is_zero(value))
    {
        if (!check_napi(env, napi_create_bigint_uint64(env, 0, &result)))
            return NULL;
        return result;
    }
    fmpz_init(magnitude);
    fmpz_abs(magnitude, value);
    bits = fmpz_bits(magnitude);
    count = (size_t) ((bits + 63) / 64);
    words = malloc(count * sizeof(uint64_t));
    if (words == NULL)
    {
        fmpz_clear(magnitude);
        napi_throw_error(env, NULL, "unable to allocate FLINT limbs");
        return NULL;
    }
    fmpz_get_ui_array((ulong *) words, (slong) count, magnitude);
    fmpz_clear(magnitude);
    if (!check_napi(env,
        napi_create_bigint_words(env, sign, count, words, &result)))
    {
        free(words);
        return NULL;
    }
    free(words);
    return result;
}

static int value_to_degree(napi_env env, napi_value value, slong *degree)
{
    napi_valuetype type;
    double number;

    if (!check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_number)
    {
        napi_throw_type_error(env, NULL,
            "extension degree must be a Number");
        return 0;
    }
    if (!check_napi(env, napi_get_value_double(env, value, &number)))
        return 0;
    if (!isfinite(number) || floor(number) != number ||
        number < 2 || number > (double) WORD_MAX)
    {
        napi_throw_range_error(env, NULL,
            "extension degree must be an integer at least 2");
        return 0;
    }
    *degree = (slong) number;
    return 1;
}

static char *value_to_string(napi_env env, napi_value value)
{
    napi_valuetype type;
    size_t length;
    char *result;

    if (!check_napi(env, napi_typeof(env, value, &type)))
        return NULL;
    if (type != napi_string)
    {
        napi_throw_type_error(env, NULL, "expected a string");
        return NULL;
    }
    if (!check_napi(env,
        napi_get_value_string_utf8(env, value, NULL, 0, &length)))
        return NULL;
    result = malloc(length + 1);
    if (result == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate string");
        return NULL;
    }
    if (!check_napi(env,
        napi_get_value_string_utf8(
            env, value, result, length + 1, &length)))
    {
        free(result);
        return NULL;
    }
    return result;
}

void sagejs_fq_retain_context(sagejs_fq_context_value *context)
{
    if (context != NULL && context->magic == SAGEJS_FQ_CONTEXT_MAGIC)
        context->references++;
}

void sagejs_fq_release_context(sagejs_fq_context_value *context)
{
    if (context == NULL || context->magic != SAGEJS_FQ_CONTEXT_MAGIC)
        return;
    if (--context->references != 0)
        return;
    fq_default_ctx_clear(context->value);
    fmpz_clear(context->prime);
    free(context->variable);
    context->magic = 0;
    free(context);
}

static void finalize_context(napi_env env, void *data, void *hint)
{
    (void) env;
    (void) hint;
    sagejs_fq_release_context(data);
}

static void finalize_element(napi_env env, void *data, void *hint)
{
    sagejs_fq_element *element = data;
    (void) env;
    (void) hint;

    if (element == NULL || element->magic != SAGEJS_FQ_ELEMENT_MAGIC)
        return;
    fq_default_clear(element->value, element->context->value);
    sagejs_fq_release_context(element->context);
    element->magic = 0;
    free(element);
}

sagejs_fq_context_value *sagejs_fq_unwrap_context(
    napi_env env,
    napi_value object)
{
    sagejs_fq_context_value *context = NULL;
    bool tagged = false;

    if (!check_napi(env,
        napi_check_object_type_tag(
            env, object, &sagejs_fq_context_type_tag, &tagged)))
        return NULL;
    if (!tagged)
    {
        napi_throw_type_error(env, NULL,
            "expected a Sage.js FLINT finite-field context");
        return NULL;
    }
    if (!check_napi(env, napi_unwrap(env, object, (void **) &context)))
        return NULL;
    if (context == NULL || context->magic != SAGEJS_FQ_CONTEXT_MAGIC)
    {
        napi_throw_error(env, NULL,
            "invalid Sage.js FLINT finite-field context");
        return NULL;
    }
    return context;
}

static sagejs_fq_element *unwrap_element(
    napi_env env,
    napi_value object)
{
    sagejs_fq_element *element = NULL;
    bool tagged = false;

    if (!check_napi(env,
        napi_check_object_type_tag(
            env, object, &sagejs_fq_element_type_tag, &tagged)))
        return NULL;
    if (!tagged)
    {
        napi_throw_type_error(env, NULL,
            "expected a Sage.js FLINT finite-field element");
        return NULL;
    }
    if (!check_napi(env, napi_unwrap(env, object, (void **) &element)))
        return NULL;
    if (element == NULL || element->magic != SAGEJS_FQ_ELEMENT_MAGIC)
    {
        napi_throw_error(env, NULL,
            "invalid Sage.js FLINT finite-field element");
        return NULL;
    }
    return element;
}

fq_nmod_ctx_struct *sagejs_fq_nmod_context(
    napi_env env, sagejs_fq_context_value *context)
{
    if (context == NULL || context->magic != SAGEJS_FQ_CONTEXT_MAGIC)
    {
        napi_throw_type_error(env, NULL,
            "expected a Sage.js FLINT finite-field context");
        return NULL;
    }
    if (fq_default_ctx_type(context->value) != FQ_DEFAULT_FQ_NMOD)
    {
        napi_throw_range_error(env, NULL,
            "multivariate extension fields currently require "
            "word-sized characteristic");
        return NULL;
    }
    return FQ_DEFAULT_CTX_FQ_NMOD(context->value);
}

int sagejs_fq_nmod_mpoly_set_constant(
    napi_env env,
    napi_value value,
    sagejs_fq_context_value *context,
    fq_nmod_mpoly_t polynomial,
    const fq_nmod_mpoly_ctx_t polynomial_context)
{
    sagejs_fq_element *element = unwrap_element(env, value);
    if (element == NULL)
        return 0;
    if (element->context != context)
    {
        napi_throw_type_error(env, NULL,
            "finite-field coefficient has a different parent");
        return 0;
    }
    fq_nmod_mpoly_set_fq_nmod(
        polynomial, element->value->fq_nmod, polynomial_context);
    return 1;
}

static napi_value create_element(
    napi_env env,
    sagejs_fq_context_value *context)
{
    sagejs_fq_element *element;
    napi_value object;

    element = calloc(1, sizeof(*element));
    if (element == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate finite-field element");
        return NULL;
    }
    element->magic = SAGEJS_FQ_ELEMENT_MAGIC;
    element->context = context;
    context->references++;
    fq_default_init(element->value, context->value);
    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env,
            napi_type_tag_object(env, object, &sagejs_fq_element_type_tag)) ||
        !check_napi(env,
            napi_wrap(env, object, element, finalize_element, NULL, NULL)))
    {
        finalize_element(env, element, NULL);
        return NULL;
    }
    return object;
}

static sagejs_fq_element *unwrap_pair(
    napi_env env,
    napi_value left_value,
    napi_value right_value,
    sagejs_fq_element **right)
{
    sagejs_fq_element *left = unwrap_element(env, left_value);

    if (left == NULL)
        return NULL;
    *right = unwrap_element(env, right_value);
    if (*right == NULL)
        return NULL;
    if (left->context != (*right)->context)
    {
        napi_throw_type_error(env, NULL,
            "finite-field elements have different parents");
        return NULL;
    }
    return left;
}

napi_value sagejs_fq_context(napi_env env, napi_callback_info info)
{
    napi_value args[3];
    napi_value object;
    sagejs_fq_context_value *context;
    fmpz_t prime;
    slong degree;
    char *variable;

    if (!require_arguments(env, info, 3, args))
        return NULL;
    fmpz_init(prime);
    if (!bigint_to_fmpz(env, args[0], prime) ||
        !value_to_degree(env, args[1], &degree))
    {
        fmpz_clear(prime);
        return NULL;
    }
    if (!fmpz_is_prime(prime))
    {
        fmpz_clear(prime);
        napi_throw_range_error(env, NULL,
            "finite-field characteristic must be prime");
        return NULL;
    }
    variable = value_to_string(env, args[2]);
    if (variable == NULL)
    {
        fmpz_clear(prime);
        return NULL;
    }
    context = calloc(1, sizeof(*context));
    if (context == NULL)
    {
        fmpz_clear(prime);
        free(variable);
        napi_throw_error(env, NULL,
            "unable to allocate finite-field context");
        return NULL;
    }
    fmpz_init_set(context->prime, prime);
    fmpz_clear(prime);
    context->degree = degree;
    context->variable = variable;
    context->references = 1;
    fq_default_ctx_init_type(
        context->value,
        context->prime,
        degree,
        context->variable,
        fmpz_abs_fits_ui(context->prime)
            ? FQ_DEFAULT_FQ_NMOD
            : FQ_DEFAULT_FQ);
    context->magic = SAGEJS_FQ_CONTEXT_MAGIC;
    if ((fq_default_ctx_type(context->value) == FQ_DEFAULT_FQ_NMOD &&
            !FQ_DEFAULT_CTX_FQ_NMOD(context->value)->is_conway) ||
        (fq_default_ctx_type(context->value) == FQ_DEFAULT_FQ &&
            !FQ_DEFAULT_CTX_FQ(context->value)->is_conway))
    {
        finalize_context(env, context, NULL);
        napi_throw_range_error(env, NULL,
            "the FLINT Conway polynomial is not available");
        return NULL;
    }
    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env,
            napi_type_tag_object(env, object, &sagejs_fq_context_type_tag)) ||
        !check_napi(env,
            napi_wrap(env, object, context, finalize_context, NULL, NULL)))
    {
        finalize_context(env, context, NULL);
        return NULL;
    }
    return object;
}

napi_value sagejs_fq_context_modulus(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_context_value *context;
    fmpz_mod_ctx_t modulus_context;
    fmpz_mod_poly_t modulus;
    fmpz_t coefficient;
    slong index;
    slong length;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    context = sagejs_fq_unwrap_context(env, args[0]);
    if (context == NULL)
        return NULL;
    fmpz_mod_ctx_init(modulus_context, context->prime);
    fmpz_mod_poly_init(modulus, modulus_context);
    fq_default_ctx_modulus(modulus, context->value);
    length = fmpz_mod_poly_length(modulus, modulus_context);
    if (!check_napi(env,
        napi_create_array_with_length(env, (size_t) length, &result)))
    {
        fmpz_mod_poly_clear(modulus, modulus_context);
        fmpz_mod_ctx_clear(modulus_context);
        return NULL;
    }
    fmpz_init(coefficient);
    for (index = 0; index < length; index++)
    {
        napi_value value;

        fmpz_mod_poly_get_coeff_fmpz(
            coefficient, modulus, index, modulus_context);
        value = fmpz_to_bigint(env, coefficient);
        if (value == NULL ||
            !check_napi(env,
                napi_set_element(env, result, (uint32_t) index, value)))
        {
            fmpz_clear(coefficient);
            fmpz_mod_poly_clear(modulus, modulus_context);
            fmpz_mod_ctx_clear(modulus_context);
            return NULL;
        }
    }
    fmpz_clear(coefficient);
    fmpz_mod_poly_clear(modulus, modulus_context);
    fmpz_mod_ctx_clear(modulus_context);
    return result;
}

napi_value sagejs_fq_from_bigint(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_context_value *context;
    sagejs_fq_element *element;
    fmpz_t value;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    context = sagejs_fq_unwrap_context(env, args[0]);
    if (context == NULL)
        return NULL;
    fmpz_init(value);
    if (!bigint_to_fmpz(env, args[1], value))
    {
        fmpz_clear(value);
        return NULL;
    }
    result = create_element(env, context);
    if (result == NULL)
    {
        fmpz_clear(value);
        return NULL;
    }
    element = unwrap_element(env, result);
    if (element != NULL)
        fq_default_set_fmpz(element->value, value, context->value);
    fmpz_clear(value);
    return element == NULL ? NULL : result;
}

napi_value sagejs_fq_gen(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_context_value *context;
    sagejs_fq_element *element;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    context = sagejs_fq_unwrap_context(env, args[0]);
    if (context == NULL)
        return NULL;
    result = create_element(env, context);
    if (result == NULL)
        return NULL;
    element = unwrap_element(env, result);
    if (element == NULL)
        return NULL;
    fq_default_gen(element->value, context->value);
    return result;
}

typedef enum
{
    SAGEJS_FQ_ADD,
    SAGEJS_FQ_SUB,
    SAGEJS_FQ_MUL,
    SAGEJS_FQ_DIV
} sagejs_fq_binary_operation;

static napi_value fq_binary(
    napi_env env,
    napi_callback_info info,
    sagejs_fq_binary_operation operation)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_element *left;
    sagejs_fq_element *right;
    sagejs_fq_element *answer;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_pair(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    if (operation == SAGEJS_FQ_DIV &&
        fq_default_is_zero(right->value, right->context->value))
    {
        napi_throw_range_error(env, NULL, "finite-field division by zero");
        return NULL;
    }
    result = create_element(env, left->context);
    if (result == NULL)
        return NULL;
    answer = unwrap_element(env, result);
    if (answer == NULL)
        return NULL;
    if (operation == SAGEJS_FQ_ADD)
        fq_default_add(
            answer->value, left->value, right->value, left->context->value);
    else if (operation == SAGEJS_FQ_SUB)
        fq_default_sub(
            answer->value, left->value, right->value, left->context->value);
    else if (operation == SAGEJS_FQ_MUL)
        fq_default_mul(
            answer->value, left->value, right->value, left->context->value);
    else
        fq_default_div(
            answer->value, left->value, right->value, left->context->value);
    return result;
}

napi_value sagejs_fq_add(napi_env env, napi_callback_info info)
{
    return fq_binary(env, info, SAGEJS_FQ_ADD);
}

napi_value sagejs_fq_sub(napi_env env, napi_callback_info info)
{
    return fq_binary(env, info, SAGEJS_FQ_SUB);
}

napi_value sagejs_fq_mul(napi_env env, napi_callback_info info)
{
    return fq_binary(env, info, SAGEJS_FQ_MUL);
}

napi_value sagejs_fq_div(napi_env env, napi_callback_info info)
{
    return fq_binary(env, info, SAGEJS_FQ_DIV);
}

napi_value sagejs_fq_neg(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_element *source;
    sagejs_fq_element *answer;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_element(env, args[0]);
    if (source == NULL)
        return NULL;
    result = create_element(env, source->context);
    if (result == NULL)
        return NULL;
    answer = unwrap_element(env, result);
    if (answer == NULL)
        return NULL;
    fq_default_neg(answer->value, source->value, source->context->value);
    return result;
}

napi_value sagejs_fq_pow(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_element *source;
    sagejs_fq_element *answer;
    fmpz_t exponent;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    source = unwrap_element(env, args[0]);
    if (source == NULL)
        return NULL;
    fmpz_init(exponent);
    if (!bigint_to_fmpz(env, args[1], exponent))
    {
        fmpz_clear(exponent);
        return NULL;
    }
    if (fmpz_sgn(exponent) < 0 &&
        fq_default_is_zero(source->value, source->context->value))
    {
        fmpz_clear(exponent);
        napi_throw_range_error(env, NULL,
            "zero cannot be raised to a negative power");
        return NULL;
    }
    result = create_element(env, source->context);
    if (result == NULL)
    {
        fmpz_clear(exponent);
        return NULL;
    }
    answer = unwrap_element(env, result);
    if (answer != NULL)
        fq_default_pow(
            answer->value, source->value, exponent, source->context->value);
    fmpz_clear(exponent);
    return answer == NULL ? NULL : result;
}

napi_value sagejs_fq_equal(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_element *left;
    sagejs_fq_element *right;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_pair(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    if (!check_napi(env,
        napi_get_boolean(
            env,
            fq_default_equal(
                left->value, right->value, left->context->value),
            &result)))
        return NULL;
    return result;
}

static napi_value fq_predicate(
    napi_env env,
    napi_callback_info info,
    int one)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_element *element;
    int value;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    element = unwrap_element(env, args[0]);
    if (element == NULL)
        return NULL;
    value = one
        ? fq_default_is_one(element->value, element->context->value)
        : fq_default_is_zero(element->value, element->context->value);
    if (!check_napi(env, napi_get_boolean(env, value, &result)))
        return NULL;
    return result;
}

napi_value sagejs_fq_is_zero(napi_env env, napi_callback_info info)
{
    return fq_predicate(env, info, 0);
}

napi_value sagejs_fq_is_one(napi_env env, napi_callback_info info)
{
    return fq_predicate(env, info, 1);
}

napi_value sagejs_fq_to_string(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_element *element;
    char *text;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    element = unwrap_element(env, args[0]);
    if (element == NULL)
        return NULL;
    text = fq_default_get_str_pretty(
        element->value, element->context->value);
    if (text == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to format finite-field element");
        return NULL;
    }
    if (!check_napi(env,
        napi_create_string_utf8(env, text, NAPI_AUTO_LENGTH, &result)))
    {
        flint_free(text);
        return NULL;
    }
    flint_free(text);
    return result;
}

static void finalize_fq_poly(napi_env env, void *data, void *hint)
{
    sagejs_fq_poly *poly = data;
    (void) env;
    (void) hint;

    if (poly == NULL || poly->magic != SAGEJS_FQ_POLY_MAGIC)
        return;
    fq_default_poly_clear(poly->value, poly->context->value);
    sagejs_fq_release_context(poly->context);
    poly->magic = 0;
    free(poly);
}

static napi_value create_fq_poly(
    napi_env env,
    sagejs_fq_context_value *context)
{
    sagejs_fq_poly *poly;
    napi_value object;

    poly = calloc(1, sizeof(*poly));
    if (poly == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate extension-field polynomial");
        return NULL;
    }
    poly->magic = SAGEJS_FQ_POLY_MAGIC;
    poly->context = context;
    context->references++;
    fq_default_poly_init(poly->value, context->value);
    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env,
            napi_type_tag_object(env, object, &sagejs_fq_poly_type_tag)) ||
        !check_napi(env,
            napi_wrap(env, object, poly, finalize_fq_poly, NULL, NULL)))
    {
        finalize_fq_poly(env, poly, NULL);
        return NULL;
    }
    return object;
}

static sagejs_fq_poly *unwrap_fq_poly(
    napi_env env,
    napi_value object)
{
    sagejs_fq_poly *poly = NULL;
    bool tagged = false;

    if (!check_napi(env,
        napi_check_object_type_tag(
            env, object, &sagejs_fq_poly_type_tag, &tagged)))
        return NULL;
    if (!tagged)
    {
        napi_throw_type_error(env, NULL,
            "expected a Sage.js FLINT extension-field polynomial");
        return NULL;
    }
    if (!check_napi(env, napi_unwrap(env, object, (void **) &poly)))
        return NULL;
    if (poly == NULL || poly->magic != SAGEJS_FQ_POLY_MAGIC)
    {
        napi_throw_error(env, NULL,
            "invalid Sage.js FLINT extension-field polynomial");
        return NULL;
    }
    return poly;
}

static sagejs_fq_poly *unwrap_fq_poly_pair(
    napi_env env,
    napi_value left_value,
    napi_value right_value,
    sagejs_fq_poly **right)
{
    sagejs_fq_poly *left = unwrap_fq_poly(env, left_value);

    if (left == NULL)
        return NULL;
    *right = unwrap_fq_poly(env, right_value);
    if (*right == NULL)
        return NULL;
    if (left->context != (*right)->context)
    {
        napi_throw_type_error(env, NULL,
            "extension-field polynomials have different base fields");
        return NULL;
    }
    return left;
}

static int bigint_to_nonnegative_ulong(
    napi_env env,
    napi_value value,
    ulong *result)
{
    fmpz_t integer;
    int valid;

    fmpz_init(integer);
    if (!bigint_to_fmpz(env, value, integer))
    {
        fmpz_clear(integer);
        return 0;
    }
    valid = fmpz_sgn(integer) >= 0 && fmpz_abs_fits_ui(integer);
    if (valid)
        *result = fmpz_get_ui(integer);
    fmpz_clear(integer);
    if (!valid)
    {
        napi_throw_range_error(env, NULL,
            "polynomial exponent must be a nonnegative FLINT word");
        return 0;
    }
    return 1;
}

napi_value sagejs_fq_poly_constant(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_context_value *context;
    sagejs_fq_element *coefficient;
    sagejs_fq_poly *poly;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    context = sagejs_fq_unwrap_context(env, args[0]);
    coefficient = unwrap_element(env, args[1]);
    if (context == NULL || coefficient == NULL)
        return NULL;
    if (coefficient->context != context)
    {
        napi_throw_type_error(env, NULL,
            "polynomial coefficient has the wrong finite-field parent");
        return NULL;
    }
    result = create_fq_poly(env, context);
    if (result == NULL)
        return NULL;
    poly = unwrap_fq_poly(env, result);
    if (poly == NULL)
        return NULL;
    fq_default_poly_set_coeff(
        poly->value, 0, coefficient->value, context->value);
    return result;
}

napi_value sagejs_fq_poly_gen(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_context_value *context;
    sagejs_fq_poly *poly;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    context = sagejs_fq_unwrap_context(env, args[0]);
    if (context == NULL)
        return NULL;
    result = create_fq_poly(env, context);
    if (result == NULL)
        return NULL;
    poly = unwrap_fq_poly(env, result);
    if (poly == NULL)
        return NULL;
    fq_default_poly_gen(poly->value, context->value);
    return result;
}

typedef enum
{
    SAGEJS_FQ_POLY_ADD,
    SAGEJS_FQ_POLY_SUB,
    SAGEJS_FQ_POLY_MUL
} sagejs_fq_poly_binary_operation;

static napi_value fq_poly_binary(
    napi_env env,
    napi_callback_info info,
    sagejs_fq_poly_binary_operation operation)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_poly *left;
    sagejs_fq_poly *right;
    sagejs_fq_poly *answer;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_fq_poly_pair(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    result = create_fq_poly(env, left->context);
    if (result == NULL)
        return NULL;
    answer = unwrap_fq_poly(env, result);
    if (answer == NULL)
        return NULL;
    if (operation == SAGEJS_FQ_POLY_ADD)
        fq_default_poly_add(
            answer->value, left->value, right->value,
            left->context->value);
    else if (operation == SAGEJS_FQ_POLY_SUB)
        fq_default_poly_sub(
            answer->value, left->value, right->value,
            left->context->value);
    else
        fq_default_poly_mul(
            answer->value, left->value, right->value,
            left->context->value);
    return result;
}

napi_value sagejs_fq_poly_add(napi_env env, napi_callback_info info)
{
    return fq_poly_binary(env, info, SAGEJS_FQ_POLY_ADD);
}

napi_value sagejs_fq_poly_sub(napi_env env, napi_callback_info info)
{
    return fq_poly_binary(env, info, SAGEJS_FQ_POLY_SUB);
}

napi_value sagejs_fq_poly_mul(napi_env env, napi_callback_info info)
{
    return fq_poly_binary(env, info, SAGEJS_FQ_POLY_MUL);
}

napi_value sagejs_fq_poly_neg(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_poly *source;
    sagejs_fq_poly *answer;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_fq_poly(env, args[0]);
    if (source == NULL)
        return NULL;
    result = create_fq_poly(env, source->context);
    if (result == NULL)
        return NULL;
    answer = unwrap_fq_poly(env, result);
    if (answer == NULL)
        return NULL;
    fq_default_poly_neg(
        answer->value, source->value, source->context->value);
    return result;
}

napi_value sagejs_fq_poly_pow(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_poly *source;
    sagejs_fq_poly *answer;
    ulong exponent;

    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_nonnegative_ulong(env, args[1], &exponent))
        return NULL;
    source = unwrap_fq_poly(env, args[0]);
    if (source == NULL)
        return NULL;
    result = create_fq_poly(env, source->context);
    if (result == NULL)
        return NULL;
    answer = unwrap_fq_poly(env, result);
    if (answer == NULL)
        return NULL;
    fq_default_poly_pow(
        answer->value, source->value, exponent, source->context->value);
    return result;
}

napi_value sagejs_fq_poly_equal(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_poly *left;
    sagejs_fq_poly *right;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_fq_poly_pair(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    if (!check_napi(env, napi_get_boolean(
        env,
        fq_default_poly_equal(
            left->value, right->value, left->context->value),
        &result)))
        return NULL;
    return result;
}

napi_value sagejs_fq_poly_divexact(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_poly *left;
    sagejs_fq_poly *right;
    sagejs_fq_poly *answer;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_fq_poly_pair(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    if (fq_default_poly_is_zero(right->value, right->context->value))
    {
        napi_throw_range_error(env, NULL, "polynomial division by zero");
        return NULL;
    }
    result = create_fq_poly(env, left->context);
    if (result == NULL)
        return NULL;
    answer = unwrap_fq_poly(env, result);
    if (answer == NULL)
        return NULL;
    if (!fq_default_poly_divides(
        answer->value, left->value, right->value, left->context->value))
    {
        napi_throw_range_error(env, NULL,
            "polynomial division is not exact");
        return NULL;
    }
    return result;
}

napi_value sagejs_fq_poly_gcd(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_poly *left;
    sagejs_fq_poly *right;
    sagejs_fq_poly *answer;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_fq_poly_pair(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    result = create_fq_poly(env, left->context);
    if (result == NULL)
        return NULL;
    answer = unwrap_fq_poly(env, result);
    if (answer == NULL)
        return NULL;
    fq_default_poly_gcd(
        answer->value, left->value, right->value, left->context->value);
    return result;
}

napi_value sagejs_fq_poly_is_irreducible(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_poly *poly;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    poly = unwrap_fq_poly(env, args[0]);
    if (poly == NULL)
        return NULL;
    if (!check_napi(env, napi_get_boolean(
        env,
        fq_default_poly_is_irreducible(
            poly->value, poly->context->value),
        &result)))
        return NULL;
    return result;
}

napi_value sagejs_fq_poly_to_string(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_poly *poly;
    char *variable;
    char *text;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    poly = unwrap_fq_poly(env, args[0]);
    if (poly == NULL)
        return NULL;
    variable = value_to_string(env, args[1]);
    if (variable == NULL)
        return NULL;
    text = fq_default_poly_get_str_pretty(
        poly->value, variable, poly->context->value);
    free(variable);
    if (text == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to format extension-field polynomial");
        return NULL;
    }
    if (!check_napi(env,
        napi_create_string_utf8(env, text, NAPI_AUTO_LENGTH, &result)))
    {
        flint_free(text);
        return NULL;
    }
    flint_free(text);
    return result;
}

napi_value sagejs_fq_poly_coefficients(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_poly *poly;
    slong index;
    slong length;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    poly = unwrap_fq_poly(env, args[0]);
    if (poly == NULL)
        return NULL;
    length = fq_default_poly_length(
        poly->value, poly->context->value);
    if (!check_napi(env,
        napi_create_array_with_length(env, (size_t) length, &result)))
        return NULL;
    for (index = 0; index < length; index++)
    {
        napi_value coefficient_value;
        sagejs_fq_element *coefficient;

        coefficient_value = create_element(env, poly->context);
        if (coefficient_value == NULL)
            return NULL;
        coefficient = unwrap_element(env, coefficient_value);
        if (coefficient == NULL)
            return NULL;
        fq_default_poly_get_coeff(
            coefficient->value, poly->value, index, poly->context->value);
        if (!check_napi(env, napi_set_element(
            env, result, (uint32_t) index, coefficient_value)))
            return NULL;
    }
    return result;
}

static napi_value fq_poly_factorization_result(
    napi_env env,
    sagejs_fq_poly *poly,
    fq_default_poly_factor_t decomposition,
    const fq_default_t unit)
{
    napi_value result;
    napi_value factors;
    napi_value unit_value;
    sagejs_fq_element *unit_element;
    slong index;
    slong length;

    unit_value = create_element(env, poly->context);
    if (unit_value == NULL)
        return NULL;
    unit_element = unwrap_element(env, unit_value);
    if (unit_element == NULL)
        return NULL;
    fq_default_set(
        unit_element->value, unit, poly->context->value);
    length = fq_default_poly_factor_length(
        decomposition, poly->context->value);
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env, napi_set_named_property(
            env, result, "unit", unit_value)) ||
        !check_napi(env, napi_create_array_with_length(
            env, (size_t) length, &factors)))
        return NULL;
    for (index = 0; index < length; index++)
    {
        napi_value pair;
        napi_value factor_value;
        napi_value exponent;
        sagejs_fq_poly *factor;

        factor_value = create_fq_poly(env, poly->context);
        if (factor_value == NULL)
            return NULL;
        factor = unwrap_fq_poly(env, factor_value);
        if (factor == NULL)
            return NULL;
        fq_default_poly_factor_get_poly(
            factor->value, decomposition, index, poly->context->value);
        if (!check_napi(env, napi_create_array_with_length(
                env, 2, &pair)) ||
            !check_napi(env, napi_create_int64(
                env,
                fq_default_poly_factor_exp(
                    decomposition, index, poly->context->value),
                &exponent)) ||
            !check_napi(env, napi_set_element(
                env, pair, 0, factor_value)) ||
            !check_napi(env, napi_set_element(
                env, pair, 1, exponent)) ||
            !check_napi(env, napi_set_element(
                env, factors, (uint32_t) index, pair)))
            return NULL;
    }
    if (!check_napi(env, napi_set_named_property(
        env, result, "factors", factors)))
        return NULL;
    return result;
}

napi_value sagejs_fq_poly_factor(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_poly *poly;
    fq_default_poly_factor_t decomposition;
    fq_default_t unit;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    poly = unwrap_fq_poly(env, args[0]);
    if (poly == NULL)
        return NULL;
    if (fq_default_poly_is_zero(poly->value, poly->context->value))
    {
        napi_throw_range_error(env, NULL,
            "factorization of 0 is not defined");
        return NULL;
    }
    fq_default_poly_factor_init(
        decomposition, poly->context->value);
    fq_default_init(unit, poly->context->value);
    fq_default_poly_factor(
        decomposition, unit, poly->value, poly->context->value);
    result = fq_poly_factorization_result(
        env, poly, decomposition, unit);
    fq_default_clear(unit, poly->context->value);
    fq_default_poly_factor_clear(
        decomposition, poly->context->value);
    return result;
}

napi_value sagejs_fq_poly_roots(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_poly *poly;
    fq_default_poly_factor_t roots;
    fq_default_poly_t factor;
    slong index;
    slong length;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    poly = unwrap_fq_poly(env, args[0]);
    if (poly == NULL)
        return NULL;
    if (fq_default_poly_is_zero(poly->value, poly->context->value))
    {
        napi_throw_range_error(env, NULL,
            "the zero polynomial has infinitely many roots");
        return NULL;
    }
    fq_default_poly_factor_init(roots, poly->context->value);
    fq_default_poly_roots(
        roots, poly->value, 1, poly->context->value);
    length = fq_default_poly_factor_length(
        roots, poly->context->value);
    if (!check_napi(env,
        napi_create_array_with_length(env, (size_t) length, &result)))
    {
        fq_default_poly_factor_clear(
            roots, poly->context->value);
        return NULL;
    }
    fq_default_poly_init(factor, poly->context->value);
    for (index = 0; index < length; index++)
    {
        napi_value pair;
        napi_value root_value;
        napi_value exponent;
        sagejs_fq_element *root;

        root_value = create_element(env, poly->context);
        if (root_value == NULL)
        {
            fq_default_poly_clear(factor, poly->context->value);
            fq_default_poly_factor_clear(
                roots, poly->context->value);
            return NULL;
        }
        root = unwrap_element(env, root_value);
        if (root == NULL)
        {
            fq_default_poly_clear(factor, poly->context->value);
            fq_default_poly_factor_clear(
                roots, poly->context->value);
            return NULL;
        }
        fq_default_poly_factor_get_poly(
            factor, roots, index, poly->context->value);
        fq_default_poly_get_coeff(
            root->value, factor, 0, poly->context->value);
        fq_default_neg(
            root->value, root->value, poly->context->value);
        if (!check_napi(env,
                napi_create_array_with_length(env, 2, &pair)) ||
            !check_napi(env, napi_create_int64(
                env,
                fq_default_poly_factor_exp(
                    roots, index, poly->context->value),
                &exponent)) ||
            !check_napi(env, napi_set_element(
                env, pair, 0, root_value)) ||
            !check_napi(env, napi_set_element(
                env, pair, 1, exponent)) ||
            !check_napi(env, napi_set_element(
                env, result, (uint32_t) index, pair)))
        {
            fq_default_poly_clear(factor, poly->context->value);
            fq_default_poly_factor_clear(
                roots, poly->context->value);
            return NULL;
        }
    }
    fq_default_poly_clear(factor, poly->context->value);
    fq_default_poly_factor_clear(
        roots, poly->context->value);
    return result;
}

static int value_to_matrix_dimension(
    napi_env env,
    napi_value value,
    slong *result)
{
    napi_valuetype type;
    double number;

    if (!check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_number)
    {
        napi_throw_type_error(env, NULL,
            "matrix dimensions must be Numbers");
        return 0;
    }
    if (!check_napi(env, napi_get_value_double(env, value, &number)))
        return 0;
    if (!isfinite(number) || floor(number) != number ||
        number < 0 || number > 2147483647.0)
    {
        napi_throw_range_error(env, NULL,
            "matrix dimensions must be nonnegative integers");
        return 0;
    }
    *result = (slong) number;
    return 1;
}

static void finalize_fq_matrix(napi_env env, void *data, void *hint)
{
    sagejs_fq_matrix_value *matrix = data;
    (void) env;
    (void) hint;

    if (matrix == NULL || matrix->magic != SAGEJS_FQ_MATRIX_MAGIC)
        return;
    fq_default_mat_clear(matrix->value, matrix->context->value);
    sagejs_fq_release_context(matrix->context);
    matrix->magic = 0;
    free(matrix);
}

static napi_value create_fq_matrix(
    napi_env env,
    sagejs_fq_context_value *context,
    slong rows,
    slong cols)
{
    sagejs_fq_matrix_value *matrix;
    napi_value object;

    matrix = calloc(1, sizeof(*matrix));
    if (matrix == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate extension-field matrix");
        return NULL;
    }
    matrix->magic = SAGEJS_FQ_MATRIX_MAGIC;
    matrix->context = context;
    context->references++;
    fq_default_mat_init(matrix->value, rows, cols, context->value);
    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env,
            napi_type_tag_object(env, object, &sagejs_fq_matrix_type_tag)) ||
        !check_napi(env,
            napi_wrap(env, object, matrix, finalize_fq_matrix, NULL, NULL)))
    {
        finalize_fq_matrix(env, matrix, NULL);
        return NULL;
    }
    return object;
}

static sagejs_fq_matrix_value *unwrap_fq_matrix(
    napi_env env,
    napi_value object)
{
    sagejs_fq_matrix_value *matrix = NULL;
    bool tagged = false;

    if (!check_napi(env,
        napi_check_object_type_tag(
            env, object, &sagejs_fq_matrix_type_tag, &tagged)))
        return NULL;
    if (!tagged)
    {
        napi_throw_type_error(env, NULL,
            "expected a Sage.js FLINT extension-field matrix");
        return NULL;
    }
    if (!check_napi(env, napi_unwrap(env, object, (void **) &matrix)))
        return NULL;
    if (matrix == NULL || matrix->magic != SAGEJS_FQ_MATRIX_MAGIC)
    {
        napi_throw_error(env, NULL,
            "invalid Sage.js FLINT extension-field matrix");
        return NULL;
    }
    return matrix;
}

static sagejs_fq_matrix_value *unwrap_fq_matrix_pair(
    napi_env env,
    napi_value left_value,
    napi_value right_value,
    sagejs_fq_matrix_value **right)
{
    sagejs_fq_matrix_value *left =
        unwrap_fq_matrix(env, left_value);

    if (left == NULL)
        return NULL;
    *right = unwrap_fq_matrix(env, right_value);
    if (*right == NULL)
        return NULL;
    if (left->context != (*right)->context)
    {
        napi_throw_type_error(env, NULL,
            "extension-field matrices have different base fields");
        return NULL;
    }
    return left;
}

static slong fq_matrix_nrows(
    const sagejs_fq_matrix_value *matrix)
{
    return fq_default_mat_nrows(
        matrix->value, matrix->context->value);
}

static slong fq_matrix_ncols(
    const sagejs_fq_matrix_value *matrix)
{
    return fq_default_mat_ncols(
        matrix->value, matrix->context->value);
}

napi_value sagejs_fq_matrix(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[4];
    napi_value result;
    sagejs_fq_context_value *context;
    sagejs_fq_matrix_value *matrix;
    slong rows;
    slong cols;
    uint32_t length;
    slong index;
    bool is_array;

    if (!require_arguments(env, info, 4, args))
        return NULL;
    context = sagejs_fq_unwrap_context(env, args[0]);
    if (context == NULL ||
        !value_to_matrix_dimension(env, args[1], &rows) ||
        !value_to_matrix_dimension(env, args[2], &cols))
        return NULL;
    if (!check_napi(env, napi_is_array(env, args[3], &is_array)))
        return NULL;
    if (!is_array)
    {
        napi_throw_type_error(env, NULL,
            "matrix entries must be an Array");
        return NULL;
    }
    if (!check_napi(env, napi_get_array_length(env, args[3], &length)))
        return NULL;
    if ((uint64_t) length != (uint64_t) rows * (uint64_t) cols)
    {
        napi_throw_range_error(env, NULL,
            "matrix entry count does not match its dimensions");
        return NULL;
    }
    result = create_fq_matrix(env, context, rows, cols);
    if (result == NULL)
        return NULL;
    matrix = unwrap_fq_matrix(env, result);
    if (matrix == NULL)
        return NULL;
    for (index = 0; index < rows * cols; index++)
    {
        napi_value entry_value;
        sagejs_fq_element *entry;

        if (!check_napi(env, napi_get_element(
            env, args[3], (uint32_t) index, &entry_value)))
            return NULL;
        entry = unwrap_element(env, entry_value);
        if (entry == NULL)
            return NULL;
        if (entry->context != context)
        {
            napi_throw_type_error(env, NULL,
                "matrix entry has the wrong finite-field parent");
            return NULL;
        }
        fq_default_mat_entry_set(
            matrix->value,
            index / cols,
            index % cols,
            entry->value,
            context->value);
    }
    return result;
}

typedef enum
{
    SAGEJS_FQ_MATRIX_ADD,
    SAGEJS_FQ_MATRIX_SUB,
    SAGEJS_FQ_MATRIX_MUL
} sagejs_fq_matrix_binary_operation;

static napi_value fq_matrix_binary(
    napi_env env,
    napi_callback_info info,
    sagejs_fq_matrix_binary_operation operation)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_matrix_value *left;
    sagejs_fq_matrix_value *right;
    sagejs_fq_matrix_value *answer;
    slong rows;
    slong cols;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_fq_matrix_pair(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    rows = fq_matrix_nrows(left);
    cols = operation == SAGEJS_FQ_MATRIX_MUL
        ? fq_matrix_ncols(right)
        : fq_matrix_ncols(left);
    if (
        (operation == SAGEJS_FQ_MATRIX_MUL &&
            fq_matrix_ncols(left) != fq_matrix_nrows(right)) ||
        (operation != SAGEJS_FQ_MATRIX_MUL &&
            (rows != fq_matrix_nrows(right) ||
                cols != fq_matrix_ncols(right)))
    )
    {
        napi_throw_range_error(env, NULL,
            "matrix dimensions are incompatible");
        return NULL;
    }
    result = create_fq_matrix(env, left->context, rows, cols);
    if (result == NULL)
        return NULL;
    answer = unwrap_fq_matrix(env, result);
    if (answer == NULL)
        return NULL;
    if (operation == SAGEJS_FQ_MATRIX_ADD)
        fq_default_mat_add(
            answer->value, left->value, right->value,
            left->context->value);
    else if (operation == SAGEJS_FQ_MATRIX_SUB)
        fq_default_mat_sub(
            answer->value, left->value, right->value,
            left->context->value);
    else
        fq_default_mat_mul(
            answer->value, left->value, right->value,
            left->context->value);
    return result;
}

napi_value sagejs_fq_matrix_add(napi_env env, napi_callback_info info)
{
    return fq_matrix_binary(env, info, SAGEJS_FQ_MATRIX_ADD);
}

napi_value sagejs_fq_matrix_sub(napi_env env, napi_callback_info info)
{
    return fq_matrix_binary(env, info, SAGEJS_FQ_MATRIX_SUB);
}

napi_value sagejs_fq_matrix_mul(napi_env env, napi_callback_info info)
{
    return fq_matrix_binary(env, info, SAGEJS_FQ_MATRIX_MUL);
}

napi_value sagejs_fq_matrix_neg(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_matrix_value *source;
    sagejs_fq_matrix_value *answer;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_fq_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    result = create_fq_matrix(
        env, source->context,
        fq_matrix_nrows(source), fq_matrix_ncols(source));
    if (result == NULL)
        return NULL;
    answer = unwrap_fq_matrix(env, result);
    if (answer == NULL)
        return NULL;
    fq_default_mat_neg(
        answer->value, source->value, source->context->value);
    return result;
}

napi_value sagejs_fq_matrix_scalar_mul(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_matrix_value *source;
    sagejs_fq_element *scalar;
    sagejs_fq_matrix_value *answer;
    fq_default_t entry;
    slong row;
    slong col;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    source = unwrap_fq_matrix(env, args[0]);
    scalar = unwrap_element(env, args[1]);
    if (source == NULL || scalar == NULL)
        return NULL;
    if (source->context != scalar->context)
    {
        napi_throw_type_error(env, NULL,
            "matrix scalar has the wrong finite-field parent");
        return NULL;
    }
    result = create_fq_matrix(
        env, source->context,
        fq_matrix_nrows(source), fq_matrix_ncols(source));
    if (result == NULL)
        return NULL;
    answer = unwrap_fq_matrix(env, result);
    if (answer == NULL)
        return NULL;
    fq_default_init(entry, source->context->value);
    for (row = 0; row < fq_matrix_nrows(source); row++)
    {
        for (col = 0; col < fq_matrix_ncols(source); col++)
        {
            fq_default_mat_entry(
                entry, source->value, row, col, source->context->value);
            fq_default_mul(
                entry, entry, scalar->value, source->context->value);
            fq_default_mat_entry_set(
                answer->value, row, col, entry, source->context->value);
        }
    }
    fq_default_clear(entry, source->context->value);
    return result;
}

napi_value sagejs_fq_matrix_transpose(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_matrix_value *source;
    sagejs_fq_matrix_value *answer;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_fq_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    result = create_fq_matrix(
        env, source->context,
        fq_matrix_ncols(source), fq_matrix_nrows(source));
    if (result == NULL)
        return NULL;
    answer = unwrap_fq_matrix(env, result);
    if (answer == NULL)
        return NULL;
    fq_default_mat_transpose(
        answer->value, source->value, source->context->value);
    return result;
}

napi_value sagejs_fq_matrix_equal(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_matrix_value *left;
    sagejs_fq_matrix_value *right;
    int equal = 0;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_fq_matrix_pair(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    if (
        fq_matrix_nrows(left) == fq_matrix_nrows(right) &&
        fq_matrix_ncols(left) == fq_matrix_ncols(right)
    )
        equal = fq_default_mat_equal(
            left->value, right->value, left->context->value);
    if (!check_napi(env, napi_get_boolean(env, equal, &result)))
        return NULL;
    return result;
}

napi_value sagejs_fq_matrix_entry(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[3];
    napi_value result;
    sagejs_fq_matrix_value *matrix;
    sagejs_fq_element *entry;
    slong row;
    slong col;

    if (!require_arguments(env, info, 3, args))
        return NULL;
    matrix = unwrap_fq_matrix(env, args[0]);
    if (matrix == NULL ||
        !value_to_matrix_dimension(env, args[1], &row) ||
        !value_to_matrix_dimension(env, args[2], &col))
        return NULL;
    if (row >= fq_matrix_nrows(matrix) ||
        col >= fq_matrix_ncols(matrix))
    {
        napi_throw_range_error(env, NULL, "matrix index out of range");
        return NULL;
    }
    result = create_element(env, matrix->context);
    if (result == NULL)
        return NULL;
    entry = unwrap_element(env, result);
    if (entry == NULL)
        return NULL;
    fq_default_mat_entry(
        entry->value, matrix->value, row, col, matrix->context->value);
    return result;
}

napi_value sagejs_fq_matrix_det(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_matrix_value *source;
    sagejs_fq_element *answer;
    fq_default_mat_t lu;
    fq_default_t diagonal;
    slong *permutation;
    slong size;
    slong rank;
    slong row;
    slong left;
    slong right;
    int odd = 0;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_fq_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    size = fq_matrix_nrows(source);
    if (size != fq_matrix_ncols(source))
    {
        napi_throw_range_error(env, NULL,
            "determinant requires a square matrix");
        return NULL;
    }
    result = create_element(env, source->context);
    if (result == NULL)
        return NULL;
    answer = unwrap_element(env, result);
    if (answer == NULL)
        return NULL;
    if (size == 0)
    {
        fq_default_one(answer->value, source->context->value);
        return result;
    }
    permutation = malloc((size_t) size * sizeof(slong));
    if (permutation == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate matrix permutation");
        return NULL;
    }
    fq_default_mat_init_set(lu, source->value, source->context->value);
    rank = fq_default_mat_lu(
        permutation, lu, 1, source->context->value);
    if (rank < size)
    {
        fq_default_zero(answer->value, source->context->value);
    }
    else
    {
        fq_default_one(answer->value, source->context->value);
        fq_default_init(diagonal, source->context->value);
        for (row = 0; row < size; row++)
        {
            fq_default_mat_entry(
                diagonal, lu, row, row, source->context->value);
            fq_default_mul(
                answer->value, answer->value, diagonal,
                source->context->value);
        }
        fq_default_clear(diagonal, source->context->value);
        for (left = 0; left < size; left++)
            for (right = left + 1; right < size; right++)
                if (permutation[left] > permutation[right])
                    odd = !odd;
        if (odd)
            fq_default_neg(
                answer->value, answer->value, source->context->value);
    }
    fq_default_mat_clear(lu, source->context->value);
    free(permutation);
    return result;
}

napi_value sagejs_fq_matrix_rank(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_matrix_value *matrix;
    slong rank;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    matrix = unwrap_fq_matrix(env, args[0]);
    if (matrix == NULL)
        return NULL;
    rank = fq_default_mat_rank(
        matrix->value, matrix->context->value);
    if (!check_napi(env, napi_create_int64(env, rank, &result)))
        return NULL;
    return result;
}

napi_value sagejs_fq_matrix_rref(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_matrix_value *source;
    sagejs_fq_matrix_value *answer;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_fq_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    result = create_fq_matrix(
        env, source->context,
        fq_matrix_nrows(source), fq_matrix_ncols(source));
    if (result == NULL)
        return NULL;
    answer = unwrap_fq_matrix(env, result);
    if (answer == NULL)
        return NULL;
    fq_default_mat_rref(
        answer->value, source->value, source->context->value);
    return result;
}

napi_value sagejs_fq_matrix_right_kernel(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_matrix_value *source;
    sagejs_fq_matrix_value *answer;
    fq_default_mat_t basis_columns;
    fq_default_t entry;
    slong rows;
    slong cols;
    slong nullity;
    slong row;
    slong col;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_fq_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    rows = fq_matrix_nrows(source);
    cols = fq_matrix_ncols(source);
    fq_default_mat_init(
        basis_columns, cols, cols, source->context->value);
    nullity = fq_default_mat_nullspace(
        basis_columns, source->value, source->context->value);
    result = create_fq_matrix(
        env, source->context, nullity, cols);
    if (result == NULL)
    {
        fq_default_mat_clear(
            basis_columns, source->context->value);
        return NULL;
    }
    answer = unwrap_fq_matrix(env, result);
    if (answer == NULL)
    {
        fq_default_mat_clear(
            basis_columns, source->context->value);
        return NULL;
    }
    fq_default_init(entry, source->context->value);
    for (row = 0; row < nullity; row++)
    {
        for (col = 0; col < cols; col++)
        {
            fq_default_mat_entry(
                entry, basis_columns, col, row, source->context->value);
            fq_default_mat_entry_set(
                answer->value, row, col, entry, source->context->value);
        }
    }
    fq_default_clear(entry, source->context->value);
    fq_default_mat_clear(basis_columns, source->context->value);
    if (nullity > 0)
        fq_default_mat_rref(
            answer->value, answer->value, source->context->value);
    (void) rows;
    return result;
}

napi_value sagejs_fq_matrix_solve(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_fq_matrix_value *left;
    sagejs_fq_matrix_value *right;
    sagejs_fq_matrix_value *answer;
    slong size;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_fq_matrix_pair(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    size = fq_matrix_nrows(left);
    if (
        size != fq_matrix_ncols(left) ||
        size != fq_matrix_nrows(right)
    )
    {
        napi_throw_range_error(env, NULL,
            "matrix solve requires a square coefficient matrix");
        return NULL;
    }
    result = create_fq_matrix(
        env, left->context, size, fq_matrix_ncols(right));
    if (result == NULL)
        return NULL;
    answer = unwrap_fq_matrix(env, result);
    if (answer == NULL)
        return NULL;
    if (!fq_default_mat_solve(
        answer->value, left->value, right->value, left->context->value))
    {
        napi_throw_range_error(env, NULL,
            "matrix equation has no unique solution");
        return NULL;
    }
    return result;
}

napi_value sagejs_fq_matrix_inverse(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_matrix_value *source;
    sagejs_fq_matrix_value *answer;
    slong size;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_fq_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    size = fq_matrix_nrows(source);
    if (size != fq_matrix_ncols(source))
    {
        napi_throw_range_error(env, NULL,
            "matrix inverse requires a square matrix");
        return NULL;
    }
    result = create_fq_matrix(
        env, source->context, size, size);
    if (result == NULL)
        return NULL;
    answer = unwrap_fq_matrix(env, result);
    if (answer == NULL)
        return NULL;
    if (!fq_default_mat_inv(
        answer->value, source->value, source->context->value))
    {
        napi_throw_range_error(env, NULL, "matrix is singular");
        return NULL;
    }
    return result;
}

napi_value sagejs_fq_matrix_charpoly(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_fq_matrix_value *matrix;
    sagejs_fq_poly *polynomial;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    matrix = unwrap_fq_matrix(env, args[0]);
    if (matrix == NULL)
        return NULL;
    if (fq_matrix_nrows(matrix) != fq_matrix_ncols(matrix))
    {
        napi_throw_range_error(env, NULL,
            "characteristic polynomial requires a square matrix");
        return NULL;
    }
    result = create_fq_poly(env, matrix->context);
    if (result == NULL)
        return NULL;
    polynomial = unwrap_fq_poly(env, result);
    if (polynomial == NULL)
        return NULL;
    fq_default_mat_charpoly(
        polynomial->value, matrix->value, matrix->context->value);
    return result;
}
