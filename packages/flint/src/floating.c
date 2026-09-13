#include "floating.h"

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <gmp.h>
#include <mpc.h>
#include <mpfr.h>

#include <flint/acb.h>
#include <flint/acb_dirichlet.h>
#include <flint/acb_hypgeom.h>
#include <flint/arb.h>
#include <flint/fmpz.h>
#include <sagejs/native.h>

#define check_napi sagejs_native_check_napi
#define finalize_real sagejs_native_finalize_real
#define finalize_complex sagejs_native_finalize_complex
#define wrap_real sagejs_native_wrap_real
#define wrap_complex sagejs_native_wrap_complex
#define new_real sagejs_native_new_real
#define new_complex sagejs_native_new_complex
#define unwrap_real sagejs_native_unwrap_real
#define unwrap_complex sagejs_native_unwrap_complex

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

static int require_optional_argument(
    napi_env env,
    napi_callback_info info,
    size_t required,
    napi_value *args,
    size_t *argc_result)
{
    size_t argc = required + 1;

    if (!check_napi(env, napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return 0;
    if (argc < required || argc > required + 1)
    {
        napi_throw_type_error(env, NULL, "wrong number of arguments");
        return 0;
    }
    *argc_result = argc;
    return 1;
}

static int require_argument_range(
    napi_env env,
    napi_callback_info info,
    size_t minimum,
    size_t maximum,
    napi_value *args,
    size_t *argc_result)
{
    size_t argc = maximum;

    if (!check_napi(env, napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return 0;
    if (argc < minimum || argc > maximum)
    {
        napi_throw_type_error(env, NULL, "wrong number of arguments");
        return 0;
    }
    *argc_result = argc;
    return 1;
}

static int get_rounding(
    napi_env env, napi_value value, mpfr_rnd_t *rounding)
{
    int32_t code;

    if (!check_napi(env, napi_get_value_int32(env, value, &code)))
        return 0;
    switch (code)
    {
        case 0: *rounding = MPFR_RNDN; return 1;
        case 1: *rounding = MPFR_RNDU; return 1;
        case 2: *rounding = MPFR_RNDD; return 1;
        case 3: *rounding = MPFR_RNDZ; return 1;
        case 4: *rounding = MPFR_RNDA; return 1;
        default:
            napi_throw_range_error(env, NULL, "invalid MPFR rounding mode");
            return 0;
    }
}

static napi_value mpz_to_bigint(napi_env env, const mpz_t value)
{
    napi_value result;
    int sign = mpz_sgn(value) < 0;
    size_t count = 0;
    uint64_t *words = NULL;
    mpz_t magnitude;

    mpz_init(magnitude);
    mpz_abs(magnitude, value);
    if (mpz_sgn(magnitude) != 0)
    {
        count = (mpz_sizeinbase(magnitude, 2) + 63) / 64;
        words = calloc(count, sizeof(uint64_t));
        if (words == NULL)
        {
            mpz_clear(magnitude);
            napi_throw_error(env, NULL, "unable to allocate BigInt limbs");
            return NULL;
        }
        mpz_export(words, &count, -1, sizeof(uint64_t), 0, 0, magnitude);
    }
    mpz_clear(magnitude);
    if (!check_napi(env,
        napi_create_bigint_words(env, sign, count, words, &result)))
    {
        free(words);
        return NULL;
    }
    free(words);
    return result;
}

static int get_precision(
    napi_env env, napi_value value, mpfr_prec_t *precision)
{
    int64_t result;

    if (!check_napi(env, napi_get_value_int64(env, value, &result)))
        return 0;
    if (result < MPFR_PREC_MIN || (uint64_t) result > MPFR_PREC_MAX)
    {
        napi_throw_range_error(env, NULL, "invalid MPFR precision");
        return 0;
    }
    *precision = (mpfr_prec_t) result;
    return 1;
}

static int bigint_to_mpz(napi_env env, napi_value value, mpz_t result)
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
        mpz_set_ui(result, 0);
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
    mpz_import(result, count, -1, sizeof(uint64_t), 0, 0, words);
    free(words);
    if (sign)
        mpz_neg(result, result);
    return 1;
}

static char *value_string(napi_env env, napi_value value)
{
    size_t length;
    char *text;

    if (!check_napi(env,
        napi_get_value_string_utf8(env, value, NULL, 0, &length)))
        return NULL;
    text = malloc(length + 1);
    if (text == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate a numeric string");
        return NULL;
    }
    if (!check_napi(env,
        napi_get_value_string_utf8(env, value, text, length + 1, &length)))
    {
        free(text);
        return NULL;
    }
    return text;
}

napi_value sagejs_real_from_string(napi_env env, napi_callback_info info)
{
    napi_value args[4];
    size_t argc;
    mpfr_prec_t precision;
    mpfr_rnd_t rounding = MPFR_RNDN;
    int32_t base = 10;
    sagejs_real *real;
    char *text;
    char *read;
    char *write;

    if (!require_argument_range(env, info, 2, 4, args, &argc) ||
        !get_precision(env, args[1], &precision) ||
        (argc >= 3 && !get_rounding(env, args[2], &rounding)) ||
        (argc == 4 &&
            !check_napi(env, napi_get_value_int32(env, args[3], &base))))
        return NULL;
    if (base != 2 && base != 10)
    {
        napi_throw_range_error(env, NULL, "real input base must be 2 or 10");
        return NULL;
    }
    text = value_string(env, args[0]);
    if (text == NULL)
        return NULL;
    for (read = text, write = text; *read != '\0'; read++)
        if (*read != '_')
            *write++ = *read;
    *write = '\0';
    real = new_real(env, precision);
    if (real == NULL)
    {
        free(text);
        return NULL;
    }
    if (mpfr_set_str(real->value, text, base, rounding) != 0)
    {
        free(text);
        finalize_real(env, real, NULL);
        napi_throw_type_error(env, NULL, "unable to parse real number");
        return NULL;
    }
    free(text);
    return wrap_real(env, real);
}

napi_value sagejs_real_from_bigint(napi_env env, napi_callback_info info)
{
    napi_value args[3];
    size_t argc;
    mpfr_prec_t precision;
    mpfr_rnd_t rounding = MPFR_RNDN;
    sagejs_real *real;
    mpz_t integer;

    if (!require_optional_argument(env, info, 2, args, &argc) ||
        !get_precision(env, args[1], &precision) ||
        (argc == 3 && !get_rounding(env, args[2], &rounding)))
        return NULL;
    real = new_real(env, precision);
    if (real == NULL)
        return NULL;
    mpz_init(integer);
    if (!bigint_to_mpz(env, args[0], integer))
    {
        mpz_clear(integer);
        finalize_real(env, real, NULL);
        return NULL;
    }
    mpfr_set_z(real->value, integer, rounding);
    mpz_clear(integer);
    return wrap_real(env, real);
}

napi_value sagejs_real_from_rational(napi_env env, napi_callback_info info)
{
    napi_value args[4];
    size_t argc;
    mpfr_prec_t precision;
    mpfr_rnd_t rounding = MPFR_RNDN;
    sagejs_real *real;
    mpz_t numerator;
    mpz_t denominator;
    mpq_t rational;

    if (!require_optional_argument(env, info, 3, args, &argc) ||
        !get_precision(env, args[2], &precision) ||
        (argc == 4 && !get_rounding(env, args[3], &rounding)))
        return NULL;
    real = new_real(env, precision);
    if (real == NULL)
        return NULL;
    mpz_init(numerator);
    mpz_init(denominator);
    if (!bigint_to_mpz(env, args[0], numerator) ||
        !bigint_to_mpz(env, args[1], denominator))
    {
        mpz_clear(numerator);
        mpz_clear(denominator);
        finalize_real(env, real, NULL);
        return NULL;
    }
    if (mpz_sgn(denominator) == 0)
    {
        mpz_clear(numerator);
        mpz_clear(denominator);
        finalize_real(env, real, NULL);
        napi_throw_range_error(env, NULL, "rational denominator is zero");
        return NULL;
    }
    mpq_init(rational);
    mpq_set_num(rational, numerator);
    mpq_set_den(rational, denominator);
    mpq_canonicalize(rational);
    mpfr_set_q(real->value, rational, rounding);
    mpq_clear(rational);
    mpz_clear(numerator);
    mpz_clear(denominator);
    return wrap_real(env, real);
}

napi_value sagejs_real_round(napi_env env, napi_callback_info info)
{
    napi_value args[3];
    size_t argc;
    mpfr_prec_t precision;
    mpfr_rnd_t rounding = MPFR_RNDN;
    sagejs_real *source;
    sagejs_real *result;

    if (!require_optional_argument(env, info, 2, args, &argc) ||
        !get_precision(env, args[1], &precision) ||
        (argc == 3 && !get_rounding(env, args[2], &rounding)) ||
        (source = unwrap_real(env, args[0])) == NULL)
        return NULL;
    result = new_real(env, precision);
    if (result == NULL)
        return NULL;
    mpfr_set(result->value, source->value, rounding);
    return wrap_real(env, result);
}

typedef int (*real_binary_op)(
    mpfr_ptr, mpfr_srcptr, mpfr_srcptr, mpfr_rnd_t);

static napi_value real_binary(
    napi_env env, napi_callback_info info, real_binary_op operation)
{
    napi_value args[3];
    size_t argc;
    mpfr_rnd_t rounding = MPFR_RNDN;
    sagejs_real *left;
    sagejs_real *right;
    sagejs_real *result;

    if (!require_optional_argument(env, info, 2, args, &argc) ||
        (argc == 3 && !get_rounding(env, args[2], &rounding)) ||
        (left = unwrap_real(env, args[0])) == NULL ||
        (right = unwrap_real(env, args[1])) == NULL)
        return NULL;
    result = new_real(env, mpfr_get_prec(left->value));
    if (result == NULL)
        return NULL;
    operation(result->value, left->value, right->value, rounding);
    return wrap_real(env, result);
}

napi_value sagejs_real_add(napi_env env, napi_callback_info info)
{
    return real_binary(env, info, mpfr_add);
}
napi_value sagejs_real_sub(napi_env env, napi_callback_info info)
{
    return real_binary(env, info, mpfr_sub);
}
napi_value sagejs_real_mul(napi_env env, napi_callback_info info)
{
    return real_binary(env, info, mpfr_mul);
}
napi_value sagejs_real_div(napi_env env, napi_callback_info info)
{
    return real_binary(env, info, mpfr_div);
}

napi_value sagejs_real_neg(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    sagejs_real *source;
    sagejs_real *result;

    if (!require_arguments(env, info, 1, args) ||
        (source = unwrap_real(env, args[0])) == NULL)
        return NULL;
    result = new_real(env, mpfr_get_prec(source->value));
    if (result == NULL)
        return NULL;
    mpfr_neg(result->value, source->value, MPFR_RNDN);
    return wrap_real(env, result);
}

napi_value sagejs_real_pow_int(napi_env env, napi_callback_info info)
{
    napi_value args[3];
    size_t argc;
    mpfr_rnd_t rounding = MPFR_RNDN;
    sagejs_real *source;
    sagejs_real *result;
    mpz_t exponent;

    if (!require_optional_argument(env, info, 2, args, &argc) ||
        (argc == 3 && !get_rounding(env, args[2], &rounding)) ||
        (source = unwrap_real(env, args[0])) == NULL)
        return NULL;
    mpz_init(exponent);
    if (!bigint_to_mpz(env, args[1], exponent))
    {
        mpz_clear(exponent);
        return NULL;
    }
    result = new_real(env, mpfr_get_prec(source->value));
    if (result == NULL)
    {
        mpz_clear(exponent);
        return NULL;
    }
    mpfr_pow_z(result->value, source->value, exponent, rounding);
    mpz_clear(exponent);
    return wrap_real(env, result);
}

napi_value sagejs_real_equal(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_real *left;
    sagejs_real *right;

    if (!require_arguments(env, info, 2, args) ||
        (left = unwrap_real(env, args[0])) == NULL ||
        (right = unwrap_real(env, args[1])) == NULL)
        return NULL;
    if (!check_napi(env,
        napi_get_boolean(env, mpfr_equal_p(left->value, right->value), &result)))
        return NULL;
    return result;
}

char *sagejs_format_real_digits(
    mpfr_srcptr value, mpfr_rnd_t rounding, size_t digits)
{
    mpfr_exp_t exponent;
    char *raw;
    char *magnitude;
    char *result;
    size_t sign;
    size_t length;

    if (mpfr_nan_p(value))
        return strdup("NaN");
    if (mpfr_inf_p(value))
        return strdup(mpfr_signbit(value) ? "-infinity" : "+infinity");
    if (digits < 2)
        digits = 2;
    if (mpfr_zero_p(value))
    {
        result = malloc(digits + 4);
        if (result == NULL)
            return NULL;
        snprintf(result, digits + 4, "%s0.", mpfr_signbit(value) ? "-" : "");
        memset(result + (mpfr_signbit(value) ? 3 : 2), '0', digits);
        result[(mpfr_signbit(value) ? 3 : 2) + digits] = '\0';
        return result;
    }

    raw = mpfr_get_str(NULL, &exponent, 10, digits, value, rounding);
    if (raw == NULL)
        return NULL;
    sign = raw[0] == '-' ? 1 : 0;
    magnitude = raw + sign;

    if (exponent >= -4 && exponent <= 6)
    {
        size_t before = exponent > 0 ? (size_t) exponent : 1;
        size_t leading = exponent <= 0 ? (size_t) (-exponent) : 0;
        size_t after = exponent > 0
            ? (digits > (size_t) exponent ? digits - (size_t) exponent : 1)
            : leading + digits;
        length = sign + before + 1 + after;
        result = malloc(length + 1);
        if (result != NULL)
        {
            char *out = result;
            if (sign)
                *out++ = '-';
            if (exponent <= 0)
            {
                *out++ = '0';
                *out++ = '.';
                memset(out, '0', leading);
                out += leading;
                memcpy(out, magnitude, digits);
                out += digits;
            }
            else
            {
                size_t integer_digits = (size_t) exponent;
                size_t copied = integer_digits < digits
                    ? integer_digits : digits;
                memcpy(out, magnitude, copied);
                out += copied;
                if (integer_digits > copied)
                {
                    memset(out, '0', integer_digits - copied);
                    out += integer_digits - copied;
                }
                *out++ = '.';
                if (digits > integer_digits)
                {
                    memcpy(out, magnitude + integer_digits,
                        digits - integer_digits);
                    out += digits - integer_digits;
                }
                else
                    *out++ = '0';
            }
            *out = '\0';
        }
    }
    else
    {
        int exponent_chars = snprintf(NULL, 0, "%ld", (long) exponent - 1);
        length = sign + 1 + 1 + (digits - 1) + 1 +
            (size_t) exponent_chars;
        result = malloc(length + 1);
        if (result != NULL)
            snprintf(result, length + 1, "%s%c.%.*se%ld",
                sign ? "-" : "", magnitude[0], (int) digits - 1,
                magnitude + 1, (long) exponent - 1);
    }
    mpfr_free_str(raw);
    return result;
}

char *sagejs_format_real_rounding(mpfr_srcptr value, mpfr_rnd_t rounding)
{
    size_t digits = (size_t) floor(
        (mpfr_get_prec(value) - 1) * 0.30102999566398119521);
    return sagejs_format_real_digits(value, rounding, digits);
}

static char *format_real_full(mpfr_srcptr value, mpfr_rnd_t rounding)
{
    size_t digits = (size_t) ceil(
        mpfr_get_prec(value) * 0.30102999566398119521) + 1;
    return sagejs_format_real_digits(value, rounding, digits);
}

static char *format_real(mpfr_srcptr value)
{
    return sagejs_format_real_rounding(value, MPFR_RNDN);
}

static char *format_real_base2(mpfr_srcptr value)
{
    mpfr_prec_t precision = mpfr_get_prec(value);
    mpfr_exp_t exponent;
    char *raw;
    char *magnitude;
    char *result;
    char *out;
    size_t sign;
    size_t digits = (size_t) precision;
    size_t leading;
    size_t integer_digits;
    size_t length;

    if (mpfr_nan_p(value))
        return strdup("NaN");
    if (mpfr_inf_p(value))
        return strdup(mpfr_signbit(value) ? "-infinity" : "+infinity");
    if (mpfr_zero_p(value))
    {
        result = malloc(digits + 4);
        if (result == NULL)
            return NULL;
        snprintf(result, digits + 4, "%s0.", mpfr_signbit(value) ? "-" : "");
        memset(result + (mpfr_signbit(value) ? 3 : 2), '0', digits);
        result[(mpfr_signbit(value) ? 3 : 2) + digits] = '\0';
        return result;
    }

    raw = mpfr_get_str(NULL, &exponent, 2, digits, value, MPFR_RNDN);
    if (raw == NULL)
        return NULL;
    sign = raw[0] == '-' ? 1 : 0;
    magnitude = raw + sign;
    leading = exponent <= 0 ? (size_t) (-exponent) : 0;
    integer_digits = exponent > 0 ? (size_t) exponent : 1;
    length = sign + integer_digits + 1 +
        (exponent > 0
            ? (digits > (size_t) exponent ? digits - (size_t) exponent : 1)
            : leading + digits);
    result = malloc(length + 1);
    if (result == NULL)
    {
        mpfr_free_str(raw);
        return NULL;
    }
    out = result;
    if (sign)
        *out++ = '-';
    if (exponent <= 0)
    {
        *out++ = '0';
        *out++ = '.';
        memset(out, '0', leading);
        out += leading;
        memcpy(out, magnitude, digits);
        out += digits;
    }
    else
    {
        size_t copied = integer_digits < digits ? integer_digits : digits;
        memcpy(out, magnitude, copied);
        out += copied;
        if (integer_digits > copied)
        {
            memset(out, '0', integer_digits - copied);
            out += integer_digits - copied;
        }
        *out++ = '.';
        if (digits > integer_digits)
        {
            memcpy(out, magnitude + integer_digits, digits - integer_digits);
            out += digits - integer_digits;
        }
        else
            *out++ = '0';
    }
    *out = '\0';
    mpfr_free_str(raw);
    return result;
}

napi_value sagejs_real_to_string(napi_env env, napi_callback_info info)
{
    napi_value args[4];
    size_t argc = 4;
    napi_value result;
    sagejs_real *real;
    char *text;
    int32_t base = 10;
    mpfr_rnd_t rounding = MPFR_RNDN;
    bool full = false;

    if (!require_argument_range(env, info, 1, 4, args, &argc) ||
        (argc == 2 &&
            !check_napi(env, napi_get_value_int32(env, args[1], &base))) ||
        (argc >= 3 &&
            (!check_napi(env, napi_get_value_int32(env, args[1], &base)) ||
             !get_rounding(env, args[2], &rounding))) ||
        (argc == 4 &&
            !check_napi(env, napi_get_value_bool(env, args[3], &full))) ||
        (real = unwrap_real(env, args[0])) == NULL)
        return NULL;
    if (base != 2 && base != 10)
    {
        napi_throw_range_error(env, NULL, "real string base must be 2 or 10");
        return NULL;
    }
    text = base == 2 ? format_real_base2(real->value)
        : full ? format_real_full(real->value, rounding)
        : sagejs_format_real_rounding(real->value, rounding);
    if (text == NULL)
    {
        napi_throw_error(env, NULL, "unable to format an MPFR value");
        return NULL;
    }
    if (!check_napi(env,
        napi_create_string_utf8(env, text, NAPI_AUTO_LENGTH, &result)))
    {
        free(text);
        return NULL;
    }
    free(text);
    return result;
}

napi_value sagejs_real_next(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    int32_t direction;
    sagejs_real *source;
    sagejs_real *result;

    if (!require_arguments(env, info, 2, args) ||
        !check_napi(env, napi_get_value_int32(env, args[1], &direction)) ||
        (source = unwrap_real(env, args[0])) == NULL)
        return NULL;
    if (direction != -1 && direction != 1)
    {
        napi_throw_range_error(env, NULL, "real next direction must be -1 or 1");
        return NULL;
    }
    result = new_real(env, mpfr_get_prec(source->value));
    if (result == NULL)
        return NULL;
    mpfr_set(result->value, source->value, MPFR_RNDN);
    if (direction < 0)
        mpfr_nextbelow(result->value);
    else
        mpfr_nextabove(result->value);
    return wrap_real(env, result);
}

napi_value sagejs_real_parts(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    napi_value item;
    sagejs_real *real;
    mpz_t mantissa;
    mpfr_exp_t exponent;
    int sign;

    if (!require_arguments(env, info, 1, args) ||
        (real = unwrap_real(env, args[0])) == NULL)
        return NULL;
    mpz_init(mantissa);
    exponent = mpfr_get_z_2exp(mantissa, real->value);
    sign = mpz_sgn(mantissa);
    mpz_abs(mantissa, mantissa);
    if (!check_napi(env, napi_create_array_with_length(env, 3, &result)) ||
        !check_napi(env, napi_create_int32(env, sign, &item)) ||
        !check_napi(env, napi_set_element(env, result, 0, item)))
    {
        mpz_clear(mantissa);
        return NULL;
    }
    item = mpz_to_bigint(env, mantissa);
    mpz_clear(mantissa);
    if (item == NULL ||
        !check_napi(env, napi_set_element(env, result, 1, item)) ||
        !check_napi(env,
            napi_create_bigint_int64(env, (int64_t) exponent, &item)) ||
        !check_napi(env, napi_set_element(env, result, 2, item)))
        return NULL;
    return result;
}

napi_value sagejs_real_to_double(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_real *real;

    if (!require_arguments(env, info, 1, args) ||
        (real = unwrap_real(env, args[0])) == NULL)
        return NULL;
    if (!check_napi(env, napi_create_double(
        env, mpfr_get_d(real->value, MPFR_RNDN), &result)))
        return NULL;
    return result;
}

napi_value sagejs_real_precision(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_real *real;

    if (!require_arguments(env, info, 1, args) ||
        (real = unwrap_real(env, args[0])) == NULL)
        return NULL;
    if (!check_napi(env, napi_create_int64(
        env, (int64_t) mpfr_get_prec(real->value), &result)))
        return NULL;
    return result;
}

napi_value sagejs_complex_from_reals(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    sagejs_real *real;
    sagejs_real *imag;
    sagejs_complex *result;
    mpfr_prec_t precision;

    if (!require_arguments(env, info, 2, args) ||
        (real = unwrap_real(env, args[0])) == NULL ||
        (imag = unwrap_real(env, args[1])) == NULL)
        return NULL;
    precision = mpfr_get_prec(real->value);
    if (precision != mpfr_get_prec(imag->value))
    {
        napi_throw_range_error(env, NULL, "real parts have different precision");
        return NULL;
    }
    result = new_complex(env, precision);
    if (result == NULL)
        return NULL;
    mpc_set_fr_fr(result->value, real->value, imag->value, MPC_RNDNN);
    return wrap_complex(env, result);
}

napi_value sagejs_complex_round(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    mpfr_prec_t precision;
    sagejs_complex *source;
    sagejs_complex *result;

    if (!require_arguments(env, info, 2, args) ||
        !get_precision(env, args[1], &precision) ||
        (source = unwrap_complex(env, args[0])) == NULL)
        return NULL;
    result = new_complex(env, precision);
    if (result == NULL)
        return NULL;
    mpc_set(result->value, source->value, MPC_RNDNN);
    return wrap_complex(env, result);
}

typedef int (*complex_binary_op)(
    mpc_ptr, mpc_srcptr, mpc_srcptr, mpc_rnd_t);

static napi_value complex_binary(
    napi_env env, napi_callback_info info, complex_binary_op operation)
{
    napi_value args[2];
    sagejs_complex *left;
    sagejs_complex *right;
    sagejs_complex *result;

    if (!require_arguments(env, info, 2, args) ||
        (left = unwrap_complex(env, args[0])) == NULL ||
        (right = unwrap_complex(env, args[1])) == NULL)
        return NULL;
    result = new_complex(env, mpc_get_prec(left->value));
    if (result == NULL)
        return NULL;
    operation(result->value, left->value, right->value, MPC_RNDNN);
    return wrap_complex(env, result);
}

napi_value sagejs_complex_add(napi_env env, napi_callback_info info)
{
    return complex_binary(env, info, mpc_add);
}
napi_value sagejs_complex_sub(napi_env env, napi_callback_info info)
{
    return complex_binary(env, info, mpc_sub);
}
napi_value sagejs_complex_mul(napi_env env, napi_callback_info info)
{
    return complex_binary(env, info, mpc_mul);
}
napi_value sagejs_complex_div(napi_env env, napi_callback_info info)
{
    return complex_binary(env, info, mpc_div);
}

napi_value sagejs_complex_neg(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    sagejs_complex *source;
    sagejs_complex *result;

    if (!require_arguments(env, info, 1, args) ||
        (source = unwrap_complex(env, args[0])) == NULL)
        return NULL;
    result = new_complex(env, mpc_get_prec(source->value));
    if (result == NULL)
        return NULL;
    mpc_neg(result->value, source->value, MPC_RNDNN);
    return wrap_complex(env, result);
}

napi_value sagejs_complex_pow_int(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    sagejs_complex *source;
    sagejs_complex *result;
    mpz_t exponent;

    if (!require_arguments(env, info, 2, args) ||
        (source = unwrap_complex(env, args[0])) == NULL)
        return NULL;
    mpz_init(exponent);
    if (!bigint_to_mpz(env, args[1], exponent))
    {
        mpz_clear(exponent);
        return NULL;
    }
    result = new_complex(env, mpc_get_prec(source->value));
    if (result == NULL)
    {
        mpz_clear(exponent);
        return NULL;
    }
    mpc_pow_z(result->value, source->value, exponent, MPC_RNDNN);
    mpz_clear(exponent);
    return wrap_complex(env, result);
}

napi_value sagejs_complex_equal(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_complex *left;
    sagejs_complex *right;

    if (!require_arguments(env, info, 2, args) ||
        (left = unwrap_complex(env, args[0])) == NULL ||
        (right = unwrap_complex(env, args[1])) == NULL)
        return NULL;
    if (!check_napi(env,
        napi_get_boolean(env, mpc_cmp(left->value, right->value) == 0, &result)))
        return NULL;
    return result;
}

napi_value sagejs_complex_to_string(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_complex *complex;
    char *real;
    char *imag;
    char *text;
    size_t length;
    int real_zero;
    int imag_zero;
    int imag_negative;
    const char *imag_magnitude;

    if (!require_arguments(env, info, 1, args) ||
        (complex = unwrap_complex(env, args[0])) == NULL)
        return NULL;
    real_zero = mpfr_zero_p(mpc_realref(complex->value));
    imag_zero = mpfr_zero_p(mpc_imagref(complex->value));
    imag_negative = mpfr_signbit(mpc_imagref(complex->value));
    real = format_real(mpc_realref(complex->value));
    imag = format_real(mpc_imagref(complex->value));
    if (real == NULL || imag == NULL)
    {
        free(real);
        free(imag);
        napi_throw_error(env, NULL, "unable to format an MPC value");
        return NULL;
    }
    imag_magnitude = imag_negative ? imag + 1 : imag;
    if (imag_zero)
        text = strdup(real);
    else if (real_zero)
    {
        length = strlen(imag) + 3;
        text = malloc(length + 1);
        if (text != NULL)
            snprintf(text, length + 1, "%s*I", imag);
    }
    else
    {
        length = strlen(real) + strlen(imag_magnitude) + 6;
        text = malloc(length + 1);
        if (text != NULL)
            snprintf(text, length + 1, "%s %c %s*I", real,
                imag_negative ? '-' : '+', imag_magnitude);
    }
    free(real);
    free(imag);
    if (text == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate an MPC string");
        return NULL;
    }
    if (!check_napi(env,
        napi_create_string_utf8(env, text, NAPI_AUTO_LENGTH, &result)))
    {
        free(text);
        return NULL;
    }
    free(text);
    return result;
}

napi_value sagejs_complex_precision(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_complex *complex;

    if (!require_arguments(env, info, 1, args) ||
        (complex = unwrap_complex(env, args[0])) == NULL)
        return NULL;
    if (!check_napi(env, napi_create_int64(
        env, (int64_t) mpc_get_prec(complex->value), &result)))
        return NULL;
    return result;
}

napi_value sagejs_complex_real(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    sagejs_complex *source;
    sagejs_real *result;

    if (!require_arguments(env, info, 1, args) ||
        (source = unwrap_complex(env, args[0])) == NULL)
        return NULL;
    result = new_real(env, mpc_get_prec(source->value));
    if (result == NULL)
        return NULL;
    mpfr_set(result->value, mpc_realref(source->value), MPFR_RNDN);
    return wrap_real(env, result);
}

napi_value sagejs_complex_imag(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    sagejs_complex *source;
    sagejs_real *result;

    if (!require_arguments(env, info, 1, args) ||
        (source = unwrap_complex(env, args[0])) == NULL)
        return NULL;
    result = new_real(env, mpc_get_prec(source->value));
    if (result == NULL)
        return NULL;
    mpfr_set(result->value, mpc_imagref(source->value), MPFR_RNDN);
    return wrap_real(env, result);
}

napi_value sagejs_complex_real_double(
    napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_complex *source;

    if (!require_arguments(env, info, 1, args) ||
        (source = unwrap_complex(env, args[0])) == NULL)
        return NULL;
    if (!check_napi(env, napi_create_double(
        env,
        mpfr_get_d(mpc_realref(source->value), MPFR_RNDN),
        &result)))
        return NULL;
    return result;
}

napi_value sagejs_complex_imag_double(
    napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_complex *source;

    if (!require_arguments(env, info, 1, args) ||
        (source = unwrap_complex(env, args[0])) == NULL)
        return NULL;
    if (!check_napi(env, napi_create_double(
        env,
        mpfr_get_d(mpc_imagref(source->value), MPFR_RNDN),
        &result)))
        return NULL;
    return result;
}

napi_value sagejs_complex_ei(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    sagejs_complex *source;
    sagejs_complex *result;
    mpfr_prec_t precision;
    acb_t input;
    acb_t output;

    if (!require_arguments(env, info, 1, args) ||
        (source = unwrap_complex(env, args[0])) == NULL)
        return NULL;
    precision = mpc_get_prec(source->value);
    result = new_complex(env, precision);
    if (result == NULL)
        return NULL;

    acb_init(input);
    acb_init(output);
    arb_set_interval_mpfr(
        acb_realref(input),
        mpc_realref(source->value),
        mpc_realref(source->value),
        precision);
    arb_set_interval_mpfr(
        acb_imagref(input),
        mpc_imagref(source->value),
        mpc_imagref(source->value),
        precision);
    acb_hypgeom_ei(output, input, precision);
    arf_get_mpfr(
        mpc_realref(result->value),
        arb_midref(acb_realref(output)),
        MPFR_RNDN);
    arf_get_mpfr(
        mpc_imagref(result->value),
        arb_midref(acb_imagref(output)),
        MPFR_RNDN);
    acb_clear(output);
    acb_clear(input);
    return wrap_complex(env, result);
}

napi_value sagejs_complex_bessel_i(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    sagejs_complex *order;
    sagejs_complex *argument;
    sagejs_complex *result;
    mpfr_prec_t precision;
    acb_t acb_order;
    acb_t acb_argument;
    acb_t output;

    if (!require_arguments(env, info, 2, args) ||
        (order = unwrap_complex(env, args[0])) == NULL ||
        (argument = unwrap_complex(env, args[1])) == NULL)
        return NULL;
    precision = mpc_get_prec(argument->value);
    if (mpc_get_prec(order->value) > precision)
        precision = mpc_get_prec(order->value);
    result = new_complex(env, precision);
    if (result == NULL)
        return NULL;

    acb_init(acb_order);
    acb_init(acb_argument);
    acb_init(output);
    arb_set_interval_mpfr(
        acb_realref(acb_order),
        mpc_realref(order->value),
        mpc_realref(order->value),
        precision);
    arb_set_interval_mpfr(
        acb_imagref(acb_order),
        mpc_imagref(order->value),
        mpc_imagref(order->value),
        precision);
    arb_set_interval_mpfr(
        acb_realref(acb_argument),
        mpc_realref(argument->value),
        mpc_realref(argument->value),
        precision);
    arb_set_interval_mpfr(
        acb_imagref(acb_argument),
        mpc_imagref(argument->value),
        mpc_imagref(argument->value),
        precision);
    acb_hypgeom_bessel_i(
        output, acb_order, acb_argument, precision);
    arf_get_mpfr(
        mpc_realref(result->value),
        arb_midref(acb_realref(output)),
        MPFR_RNDN);
    arf_get_mpfr(
        mpc_imagref(result->value),
        arb_midref(acb_imagref(output)),
        MPFR_RNDN);
    acb_clear(output);
    acb_clear(acb_argument);
    acb_clear(acb_order);
    return wrap_complex(env, result);
}

napi_value sagejs_zeta_zeros(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    napi_value zero;
    int64_t count_value;
    mpfr_prec_t precision;
    slong count;
    slong index;
    fmpz_t start;
    arb_ptr zeros;

    if (!require_arguments(env, info, 2, args) ||
        !check_napi(env,
            napi_get_value_int64(env, args[0], &count_value)) ||
        !get_precision(env, args[1], &precision))
        return NULL;
    if (count_value < 0 || count_value > WORD_MAX)
    {
        napi_throw_range_error(env, NULL, "invalid zeta-zero count");
        return NULL;
    }
    count = (slong) count_value;
    zeros = _arb_vec_init(count);
    fmpz_init(start);
    fmpz_one(start);
    acb_dirichlet_hardy_z_zeros(zeros, start, count, precision);
    fmpz_clear(start);

    if (!check_napi(env,
        napi_create_array_with_length(env, (size_t) count, &result)))
    {
        _arb_vec_clear(zeros, count);
        return NULL;
    }
    for (index = 0; index < count; index++)
    {
        double approximation = arf_get_d(
            arb_midref(zeros + index), ARF_RND_NEAR);
        if (!check_napi(env,
                napi_create_double(env, approximation, &zero)) ||
            !check_napi(env,
                napi_set_element(env, result, (uint32_t) index, zero)))
        {
            _arb_vec_clear(zeros, count);
            return NULL;
        }
    }
    _arb_vec_clear(zeros, count);
    return result;
}
