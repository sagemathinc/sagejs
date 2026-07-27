#include <limits.h>
#include <math.h>
#include <stdint.h>
#include <stdlib.h>

#include <node_api.h>

#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/fmpz_factor.h>

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
