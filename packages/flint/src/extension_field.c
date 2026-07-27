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

#include "extension_field.h"

typedef struct
{
    uint64_t magic;
    fq_default_ctx_t value;
    fmpz_t prime;
    slong degree;
    char *variable;
    size_t references;
} sagejs_fq_context_value;

typedef struct
{
    uint64_t magic;
    fq_default_t value;
    sagejs_fq_context_value *context;
} sagejs_fq_element;

#define SAGEJS_FQ_CONTEXT_MAGIC UINT64_C(0x534147454A534643)
#define SAGEJS_FQ_ELEMENT_MAGIC UINT64_C(0x534147454A534645)

static const napi_type_tag sagejs_fq_context_type_tag = {
    UINT64_C(0x188c953faeb14b5d),
    UINT64_C(0xa00e3b955e56fb4e)
};

static const napi_type_tag sagejs_fq_element_type_tag = {
    UINT64_C(0x7637e9d247b64b72),
    UINT64_C(0x82c5813184591e5b)
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

static void release_context(sagejs_fq_context_value *context)
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
    release_context(data);
}

static void finalize_element(napi_env env, void *data, void *hint)
{
    sagejs_fq_element *element = data;
    (void) env;
    (void) hint;

    if (element == NULL || element->magic != SAGEJS_FQ_ELEMENT_MAGIC)
        return;
    fq_default_clear(element->value, element->context->value);
    release_context(element->context);
    element->magic = 0;
    free(element);
}

static sagejs_fq_context_value *unwrap_context(
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
    context = unwrap_context(env, args[0]);
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
    context = unwrap_context(env, args[0]);
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
    context = unwrap_context(env, args[0]);
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
