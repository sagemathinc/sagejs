#include <limits.h>
#include <math.h>
#include <stdint.h>
#include <stdlib.h>

#include <node_api.h>

#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/fmpz_factor.h>
#include <flint/fmpz_poly.h>
#include <flint/fmpq.h>
#include <flint/fmpq_poly.h>
#include <sagejs/native.h>

#include "floating.h"

#if ULONG_MAX != UINT64_MAX
#error "The initial Sage.js FLINT bridge requires 64-bit FLINT limbs"
#endif

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

static int number_to_ulong(napi_env env, napi_value value, ulong *result)
{
    napi_valuetype type;
    double number;

    if (!check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_number)
    {
        napi_throw_type_error(env, NULL, "expected a Number");
        return 0;
    }
    if (!check_napi(env, napi_get_value_double(env, value, &number)))
        return 0;
    if (!isfinite(number) || number < 0 ||
        number > 9007199254740991.0 || floor(number) != number)
    {
        napi_throw_range_error(
            env, NULL, "expected a nonnegative safe integer");
        return 0;
    }
    *result = (ulong) number;
    return 1;
}

static int bigint_to_ulong(napi_env env, napi_value value, ulong *result)
{
    napi_valuetype type;
    uint64_t number;
    bool lossless;

    if (!check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_bigint)
    {
        napi_throw_type_error(env, NULL, "expected a BigInt");
        return 0;
    }
    if (!check_napi(env,
        napi_get_value_bigint_uint64(env, value, &number, &lossless)))
        return 0;
    if (!lossless || number > ULONG_MAX)
    {
        napi_throw_range_error(env, NULL, "polynomial exponent is too large");
        return 0;
    }
    *result = (ulong) number;
    return 1;
}

typedef enum
{
    SAGEJS_POLY_ZZ = 1,
    SAGEJS_POLY_QQ = 2
} sagejs_poly_kind;

typedef struct
{
    uint64_t magic;
    sagejs_poly_kind kind;
    fmpz_poly_t integer;
    fmpq_poly_t rational;
} sagejs_poly;

#define SAGEJS_POLY_MAGIC UINT64_C(0x534147454A53504F)
static const napi_type_tag sagejs_poly_type_tag = {
    UINT64_C(0x9a13f79522144b52),
    UINT64_C(0x88bc528f3dbf4e42)
};

static void finalize_poly(napi_env env, void *data, void *hint)
{
    sagejs_poly *poly = (sagejs_poly *) data;
    (void) env;
    (void) hint;

    if (poly == NULL || poly->magic != SAGEJS_POLY_MAGIC)
        return;
    if (poly->kind == SAGEJS_POLY_ZZ)
        fmpz_poly_clear(poly->integer);
    else if (poly->kind == SAGEJS_POLY_QQ)
        fmpq_poly_clear(poly->rational);
    poly->magic = 0;
    free(poly);
}

static napi_value create_poly(napi_env env, sagejs_poly_kind kind)
{
    sagejs_poly *poly;
    napi_value object;

    poly = calloc(1, sizeof(*poly));
    if (poly == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate polynomial");
        return NULL;
    }
    poly->magic = SAGEJS_POLY_MAGIC;
    poly->kind = kind;
    if (kind == SAGEJS_POLY_ZZ)
        fmpz_poly_init(poly->integer);
    else
        fmpq_poly_init(poly->rational);

    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env,
            napi_type_tag_object(env, object, &sagejs_poly_type_tag)) ||
        !check_napi(env,
            napi_wrap(env, object, poly, finalize_poly, NULL, NULL)))
    {
        finalize_poly(env, poly, NULL);
        return NULL;
    }
    return object;
}

static sagejs_poly *unwrap_poly(
    napi_env env,
    napi_value object,
    sagejs_poly_kind expected)
{
    sagejs_poly *poly = NULL;
    bool tagged = false;

    if (!check_napi(env,
        napi_check_object_type_tag(
            env, object, &sagejs_poly_type_tag, &tagged)))
        return NULL;
    if (!tagged)
    {
        napi_throw_type_error(env, NULL, "expected a Sage.js FLINT polynomial");
        return NULL;
    }
    if (!check_napi(env, napi_unwrap(env, object, (void **) &poly)))
        return NULL;
    if (poly == NULL || poly->magic != SAGEJS_POLY_MAGIC)
    {
        napi_throw_error(env, NULL, "invalid Sage.js FLINT polynomial");
        return NULL;
    }
    if (expected != 0 && poly->kind != expected)
    {
        napi_throw_type_error(env, NULL, "polynomials have different base rings");
        return NULL;
    }
    return poly;
}

static sagejs_poly *unwrap_same_kind(
    napi_env env,
    napi_value left_value,
    napi_value right_value,
    sagejs_poly **right)
{
    sagejs_poly *left = unwrap_poly(env, left_value, 0);

    if (left == NULL)
        return NULL;
    *right = unwrap_poly(env, right_value, left->kind);
    return *right == NULL ? NULL : left;
}

static napi_value zz_poly_constant(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_poly *poly;
    fmpz_t value;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    fmpz_init(value);
    if (!bigint_to_fmpz(env, args[0], value))
    {
        fmpz_clear(value);
        return NULL;
    }
    result = create_poly(env, SAGEJS_POLY_ZZ);
    if (result == NULL)
    {
        fmpz_clear(value);
        return NULL;
    }
    poly = unwrap_poly(env, result, SAGEJS_POLY_ZZ);
    if (poly != NULL)
        fmpz_poly_set_fmpz(poly->integer, value);
    fmpz_clear(value);
    return poly == NULL ? NULL : result;
}

static napi_value qq_poly_constant(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_poly *poly;
    fmpz_t numerator;
    fmpz_t denominator;
    fmpq_t value;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    fmpz_init(numerator);
    fmpz_init(denominator);
    fmpq_init(value);
    if (!bigint_to_fmpz(env, args[0], numerator) ||
        !bigint_to_fmpz(env, args[1], denominator))
    {
        fmpz_clear(numerator);
        fmpz_clear(denominator);
        fmpq_clear(value);
        return NULL;
    }
    if (fmpz_is_zero(denominator))
    {
        fmpz_clear(numerator);
        fmpz_clear(denominator);
        fmpq_clear(value);
        napi_throw_range_error(env, NULL, "rational denominator is zero");
        return NULL;
    }
    fmpq_set_fmpz_frac(value, numerator, denominator);
    result = create_poly(env, SAGEJS_POLY_QQ);
    if (result != NULL)
    {
        poly = unwrap_poly(env, result, SAGEJS_POLY_QQ);
        if (poly != NULL)
            fmpq_poly_set_fmpq(poly->rational, value);
    }
    else
    {
        poly = NULL;
    }
    fmpz_clear(numerator);
    fmpz_clear(denominator);
    fmpq_clear(value);
    return poly == NULL ? NULL : result;
}

static napi_value zz_poly_gen(napi_env env, napi_callback_info info)
{
    napi_value result;
    sagejs_poly *poly;

    if (!require_arguments(env, info, 0, NULL))
        return NULL;
    result = create_poly(env, SAGEJS_POLY_ZZ);
    if (result == NULL)
        return NULL;
    poly = unwrap_poly(env, result, SAGEJS_POLY_ZZ);
    if (poly == NULL)
        return NULL;
    fmpz_poly_set_coeff_ui(poly->integer, 1, 1);
    return result;
}

static napi_value qq_poly_gen(napi_env env, napi_callback_info info)
{
    napi_value result;
    sagejs_poly *poly;

    if (!require_arguments(env, info, 0, NULL))
        return NULL;
    result = create_poly(env, SAGEJS_POLY_QQ);
    if (result == NULL)
        return NULL;
    poly = unwrap_poly(env, result, SAGEJS_POLY_QQ);
    if (poly == NULL)
        return NULL;
    fmpq_poly_set_coeff_ui(poly->rational, 1, 1);
    return result;
}

static napi_value zz_poly_to_qq(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_poly *source;
    sagejs_poly *target;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_poly(env, args[0], SAGEJS_POLY_ZZ);
    if (source == NULL)
        return NULL;
    result = create_poly(env, SAGEJS_POLY_QQ);
    if (result == NULL)
        return NULL;
    target = unwrap_poly(env, result, SAGEJS_POLY_QQ);
    if (target == NULL)
        return NULL;
    fmpq_poly_set_fmpz_poly(target->rational, source->integer);
    return result;
}

typedef enum
{
    SAGEJS_POLY_ADD,
    SAGEJS_POLY_SUB,
    SAGEJS_POLY_MUL
} sagejs_poly_binary_operation;

static napi_value poly_binary(
    napi_env env,
    napi_callback_info info,
    sagejs_poly_binary_operation operation)
{
    napi_value args[2];
    napi_value result;
    sagejs_poly *left;
    sagejs_poly *right;
    sagejs_poly *answer;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_same_kind(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    result = create_poly(env, left->kind);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, left->kind);
    if (answer == NULL)
        return NULL;

    if (left->kind == SAGEJS_POLY_ZZ)
    {
        if (operation == SAGEJS_POLY_ADD)
            fmpz_poly_add(answer->integer, left->integer, right->integer);
        else if (operation == SAGEJS_POLY_SUB)
            fmpz_poly_sub(answer->integer, left->integer, right->integer);
        else
            fmpz_poly_mul(answer->integer, left->integer, right->integer);
    }
    else
    {
        if (operation == SAGEJS_POLY_ADD)
            fmpq_poly_add(answer->rational, left->rational, right->rational);
        else if (operation == SAGEJS_POLY_SUB)
            fmpq_poly_sub(answer->rational, left->rational, right->rational);
        else
            fmpq_poly_mul(answer->rational, left->rational, right->rational);
    }
    return result;
}

static napi_value poly_add(napi_env env, napi_callback_info info)
{
    return poly_binary(env, info, SAGEJS_POLY_ADD);
}

static napi_value poly_sub(napi_env env, napi_callback_info info)
{
    return poly_binary(env, info, SAGEJS_POLY_SUB);
}

static napi_value poly_mul(napi_env env, napi_callback_info info)
{
    return poly_binary(env, info, SAGEJS_POLY_MUL);
}

static napi_value poly_neg(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_poly *source;
    sagejs_poly *answer;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_poly(env, args[0], 0);
    if (source == NULL)
        return NULL;
    result = create_poly(env, source->kind);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, source->kind);
    if (answer == NULL)
        return NULL;
    if (source->kind == SAGEJS_POLY_ZZ)
        fmpz_poly_neg(answer->integer, source->integer);
    else
        fmpq_poly_neg(answer->rational, source->rational);
    return result;
}

static napi_value poly_pow(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_poly *source;
    sagejs_poly *answer;
    ulong exponent;

    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_ulong(env, args[1], &exponent))
        return NULL;
    source = unwrap_poly(env, args[0], 0);
    if (source == NULL)
        return NULL;
    result = create_poly(env, source->kind);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, source->kind);
    if (answer == NULL)
        return NULL;
    if (source->kind == SAGEJS_POLY_ZZ)
        fmpz_poly_pow(answer->integer, source->integer, exponent);
    else
        fmpq_poly_pow(answer->rational, source->rational, exponent);
    return result;
}

static napi_value poly_equal(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_poly *left;
    sagejs_poly *right;
    int equal;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_same_kind(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    equal = left->kind == SAGEJS_POLY_ZZ
        ? fmpz_poly_equal(left->integer, right->integer)
        : fmpq_poly_equal(left->rational, right->rational);
    if (!check_napi(env, napi_get_boolean(env, equal, &result)))
        return NULL;
    return result;
}

static napi_value poly_to_string(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_poly *poly;
    size_t variable_length;
    char *variable;
    char *pretty;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    poly = unwrap_poly(env, args[0], 0);
    if (poly == NULL)
        return NULL;
    if (!check_napi(env,
        napi_get_value_string_utf8(env, args[1], NULL, 0, &variable_length)))
        return NULL;
    variable = malloc(variable_length + 1);
    if (variable == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate variable name");
        return NULL;
    }
    if (!check_napi(env,
        napi_get_value_string_utf8(
            env, args[1], variable, variable_length + 1, &variable_length)))
    {
        free(variable);
        return NULL;
    }
    pretty = poly->kind == SAGEJS_POLY_ZZ
        ? fmpz_poly_get_str_pretty(poly->integer, variable)
        : fmpq_poly_get_str_pretty(poly->rational, variable);
    free(variable);
    if (pretty == NULL)
    {
        napi_throw_error(env, NULL, "FLINT could not format polynomial");
        return NULL;
    }
    if (!check_napi(env,
        napi_create_string_utf8(env, pretty, NAPI_AUTO_LENGTH, &result)))
    {
        flint_free(pretty);
        return NULL;
    }
    flint_free(pretty);
    return result;
}

static napi_value identity(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    fmpz_t value;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    fmpz_init(value);
    if (!bigint_to_fmpz(env, args[0], value))
    {
        fmpz_clear(value);
        return NULL;
    }
    result = fmpz_to_bigint(env, value);
    fmpz_clear(value);
    return result;
}

static napi_value gcd(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    fmpz_t left;
    fmpz_t right;
    fmpz_t answer;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    fmpz_init(left);
    fmpz_init(right);
    fmpz_init(answer);
    if (!bigint_to_fmpz(env, args[0], left) ||
        !bigint_to_fmpz(env, args[1], right))
    {
        fmpz_clear(left);
        fmpz_clear(right);
        fmpz_clear(answer);
        return NULL;
    }
    fmpz_gcd(answer, left, right);
    result = fmpz_to_bigint(env, answer);
    fmpz_clear(left);
    fmpz_clear(right);
    fmpz_clear(answer);
    return result;
}

typedef void (*unary_ui_operation)(fmpz_t, ulong);

static napi_value unary_ui(
    napi_env env,
    napi_callback_info info,
    unary_ui_operation operation)
{
    napi_value args[1];
    napi_value result;
    ulong input;
    fmpz_t answer;

    if (!require_arguments(env, info, 1, args) ||
        !number_to_ulong(env, args[0], &input))
        return NULL;
    fmpz_init(answer);
    operation(answer, input);
    result = fmpz_to_bigint(env, answer);
    fmpz_clear(answer);
    return result;
}

static napi_value factorial(napi_env env, napi_callback_info info)
{
    return unary_ui(env, info, fmpz_fac_ui);
}

static napi_value fibonacci(napi_env env, napi_callback_info info)
{
    return unary_ui(env, info, fmpz_fib_ui);
}

static napi_value primorial(napi_env env, napi_callback_info info)
{
    return unary_ui(env, info, fmpz_primorial);
}

static napi_value binomial(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    ulong n;
    ulong k;
    fmpz_t answer;

    if (!require_arguments(env, info, 2, args) ||
        !number_to_ulong(env, args[0], &n) ||
        !number_to_ulong(env, args[1], &k))
        return NULL;
    fmpz_init(answer);
    fmpz_bin_uiui(answer, n, k);
    result = fmpz_to_bigint(env, answer);
    fmpz_clear(answer);
    return result;
}

static napi_value factor(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    napi_value factors;
    napi_value sign;
    fmpz_t input;
    fmpz_factor_t decomposition;
    slong index;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    fmpz_init(input);
    if (!bigint_to_fmpz(env, args[0], input))
    {
        fmpz_clear(input);
        return NULL;
    }
    if (fmpz_is_zero(input))
    {
        fmpz_clear(input);
        napi_throw_range_error(env, NULL, "cannot factor zero");
        return NULL;
    }

    fmpz_factor_init(decomposition);
    fmpz_factor(decomposition, input);
    fmpz_clear(input);

    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env,
            napi_create_int32(env, decomposition->sign, &sign)) ||
        !check_napi(env,
            napi_set_named_property(env, result, "sign", sign)) ||
        !check_napi(env,
            napi_create_array_with_length(
                env, (size_t) decomposition->num, &factors)))
    {
        fmpz_factor_clear(decomposition);
        return NULL;
    }

    for (index = 0; index < decomposition->num; index++)
    {
        napi_value pair;
        napi_value prime;
        napi_value exponent;

        if (!check_napi(env, napi_create_array_with_length(env, 2, &pair)))
        {
            fmpz_factor_clear(decomposition);
            return NULL;
        }
        prime = fmpz_to_bigint(env, decomposition->p + index);
        if (prime == NULL ||
            !check_napi(env,
                napi_create_double(
                    env, (double) decomposition->exp[index], &exponent)) ||
            !check_napi(env, napi_set_element(env, pair, 0, prime)) ||
            !check_napi(env, napi_set_element(env, pair, 1, exponent)) ||
            !check_napi(env,
                napi_set_element(env, factors, (uint32_t) index, pair)))
        {
            fmpz_factor_clear(decomposition);
            return NULL;
        }
    }
    fmpz_factor_clear(decomposition);
    if (!check_napi(env,
        napi_set_named_property(env, result, "factors", factors)))
        return NULL;
    return result;
}

static napi_value version(napi_env env, napi_callback_info info)
{
    napi_value result;
    (void) info;

    if (!check_napi(env,
        napi_create_string_utf8(env, flint_version, NAPI_AUTO_LENGTH, &result)))
        return NULL;
    return result;
}

static napi_value native_abi_version(napi_env env, napi_callback_info info)
{
    napi_value result;
    (void) info;

    if (!check_napi(env,
        napi_create_uint32(env, SAGEJS_NATIVE_ABI_VERSION, &result)))
        return NULL;
    return result;
}

static napi_value initialize(napi_env env, napi_value exports)
{
    napi_property_descriptor properties[] = {
        {"identity", NULL, identity, NULL, NULL, NULL, napi_default, NULL},
        {"gcd", NULL, gcd, NULL, NULL, NULL, napi_default, NULL},
        {"factorial", NULL, factorial, NULL, NULL, NULL, napi_default, NULL},
        {"fibonacci", NULL, fibonacci, NULL, NULL, NULL, napi_default, NULL},
        {"primorial", NULL, primorial, NULL, NULL, NULL, napi_default, NULL},
        {"binomial", NULL, binomial, NULL, NULL, NULL, napi_default, NULL},
        {"factor", NULL, factor, NULL, NULL, NULL, napi_default, NULL},
        {"zzPolyConstant", NULL, zz_poly_constant, NULL, NULL, NULL,
            napi_default, NULL},
        {"qqPolyConstant", NULL, qq_poly_constant, NULL, NULL, NULL,
            napi_default, NULL},
        {"zzPolyGen", NULL, zz_poly_gen, NULL, NULL, NULL,
            napi_default, NULL},
        {"qqPolyGen", NULL, qq_poly_gen, NULL, NULL, NULL,
            napi_default, NULL},
        {"zzPolyToQQ", NULL, zz_poly_to_qq, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyAdd", NULL, poly_add, NULL, NULL, NULL, napi_default, NULL},
        {"polySub", NULL, poly_sub, NULL, NULL, NULL, napi_default, NULL},
        {"polyMul", NULL, poly_mul, NULL, NULL, NULL, napi_default, NULL},
        {"polyNeg", NULL, poly_neg, NULL, NULL, NULL, napi_default, NULL},
        {"polyPow", NULL, poly_pow, NULL, NULL, NULL, napi_default, NULL},
        {"polyEqual", NULL, poly_equal, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyToString", NULL, poly_to_string, NULL, NULL, NULL,
            napi_default, NULL},
        {"realFromString", NULL, sagejs_real_from_string, NULL, NULL, NULL,
            napi_default, NULL},
        {"realFromBigInt", NULL, sagejs_real_from_bigint, NULL, NULL, NULL,
            napi_default, NULL},
        {"realFromRational", NULL, sagejs_real_from_rational, NULL, NULL, NULL,
            napi_default, NULL},
        {"realRound", NULL, sagejs_real_round, NULL, NULL, NULL,
            napi_default, NULL},
        {"realAdd", NULL, sagejs_real_add, NULL, NULL, NULL,
            napi_default, NULL},
        {"realSub", NULL, sagejs_real_sub, NULL, NULL, NULL,
            napi_default, NULL},
        {"realMul", NULL, sagejs_real_mul, NULL, NULL, NULL,
            napi_default, NULL},
        {"realDiv", NULL, sagejs_real_div, NULL, NULL, NULL,
            napi_default, NULL},
        {"realNeg", NULL, sagejs_real_neg, NULL, NULL, NULL,
            napi_default, NULL},
        {"realPowInt", NULL, sagejs_real_pow_int, NULL, NULL, NULL,
            napi_default, NULL},
        {"realEqual", NULL, sagejs_real_equal, NULL, NULL, NULL,
            napi_default, NULL},
        {"realToString", NULL, sagejs_real_to_string, NULL, NULL, NULL,
            napi_default, NULL},
        {"realPrecision", NULL, sagejs_real_precision, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexFromReals", NULL, sagejs_complex_from_reals, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexRound", NULL, sagejs_complex_round, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexAdd", NULL, sagejs_complex_add, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexSub", NULL, sagejs_complex_sub, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexMul", NULL, sagejs_complex_mul, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexDiv", NULL, sagejs_complex_div, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexNeg", NULL, sagejs_complex_neg, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexPowInt", NULL, sagejs_complex_pow_int, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexEqual", NULL, sagejs_complex_equal, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexToString", NULL, sagejs_complex_to_string, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexPrecision", NULL, sagejs_complex_precision, NULL, NULL, NULL,
            napi_default, NULL},
        {"nativeAbiVersion", NULL, native_abi_version, NULL, NULL, NULL,
            napi_default, NULL},
        {"version", NULL, version, NULL, NULL, NULL, napi_default, NULL},
    };

    if (!check_napi(env,
        napi_define_properties(
            env,
            exports,
            sizeof(properties) / sizeof(properties[0]),
            properties)))
        return NULL;
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
