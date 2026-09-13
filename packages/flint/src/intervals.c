#include "intervals.h"

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <gmp.h>
#include <mpfr.h>

#include <flint/acb.h>
#include <flint/arb.h>
#include <flint/arf.h>
#include <flint/fmpq.h>
#include <flint/fmpz.h>
#include <sagejs/native.h>

#include "floating.h"

#define REAL_INTERVAL_MAGIC UINT64_C(0x534147454A534149)
#define COMPLEX_INTERVAL_MAGIC UINT64_C(0x534147454A534349)
#define INTERVAL_GUARD_BITS 8

typedef struct
{
    uint64_t magic;
    arb_t value;
    slong precision;
} sagejs_real_interval;

typedef struct
{
    uint64_t magic;
    acb_t value;
    slong precision;
} sagejs_complex_interval;

static const napi_type_tag real_interval_type_tag = {
    UINT64_C(0x0901725fbc9848a8),
    UINT64_C(0xb859d8ba65d86041)
};

static const napi_type_tag complex_interval_type_tag = {
    UINT64_C(0x344544036e9b41f4),
    UINT64_C(0xac6176ddd89e5611)
};

static int check_napi(napi_env env, napi_status status)
{
    return sagejs_native_check_napi(env, status);
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

static int get_precision(napi_env env, napi_value value, slong *precision)
{
    int64_t result;

    if (!check_napi(env, napi_get_value_int64(env, value, &result)))
        return 0;
    if (result < MPFR_PREC_MIN || result > 1048576)
    {
        napi_throw_range_error(env, NULL, "interval precision must be from 2 through 1048576");
        return 0;
    }
    *precision = (slong) result;
    return 1;
}

static int get_operation(
    napi_env env, napi_value value, int32_t minimum, int32_t maximum,
    int32_t *operation)
{
    if (!check_napi(env, napi_get_value_int32(env, value, operation)))
        return 0;
    if (*operation < minimum || *operation > maximum)
    {
        napi_throw_range_error(env, NULL, "invalid interval operation");
        return 0;
    }
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
    words = (uint64_t *) malloc(count * sizeof(uint64_t));
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

static int values_to_fmpq(
    napi_env env, napi_value numerator_value, napi_value denominator_value,
    fmpq_t rational)
{
    mpz_t numerator;
    mpz_t denominator;
    fmpz_t flint_numerator;
    fmpz_t flint_denominator;
    int valid;

    mpz_init(numerator);
    mpz_init(denominator);
    valid = bigint_to_mpz(env, numerator_value, numerator) &&
        bigint_to_mpz(env, denominator_value, denominator);
    if (valid && mpz_sgn(denominator) == 0)
    {
        napi_throw_range_error(env, NULL, "interval denominator must be nonzero");
        valid = 0;
    }
    if (valid)
    {
        fmpz_init(flint_numerator);
        fmpz_init(flint_denominator);
        fmpz_set_mpz(flint_numerator, numerator);
        fmpz_set_mpz(flint_denominator, denominator);
        fmpq_set_fmpz_frac(rational, flint_numerator, flint_denominator);
        fmpz_clear(flint_denominator);
        fmpz_clear(flint_numerator);
    }
    mpz_clear(denominator);
    mpz_clear(numerator);
    return valid;
}

static void finalize_real_interval(
    node_api_basic_env env, void *data, void *hint)
{
    sagejs_real_interval *interval = (sagejs_real_interval *) data;
    (void) env;
    (void) hint;
    if (interval != NULL && interval->magic == REAL_INTERVAL_MAGIC)
    {
        arb_clear(interval->value);
        interval->magic = 0;
        free(interval);
    }
}

static void finalize_complex_interval(
    node_api_basic_env env, void *data, void *hint)
{
    sagejs_complex_interval *interval = (sagejs_complex_interval *) data;
    (void) env;
    (void) hint;
    if (interval != NULL && interval->magic == COMPLEX_INTERVAL_MAGIC)
    {
        acb_clear(interval->value);
        interval->magic = 0;
        free(interval);
    }
}

static sagejs_real_interval *new_real_interval(napi_env env, slong precision)
{
    sagejs_real_interval *interval =
        (sagejs_real_interval *) malloc(sizeof(*interval));
    if (interval == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate an Arb interval");
        return NULL;
    }
    interval->magic = REAL_INTERVAL_MAGIC;
    interval->precision = precision;
    arb_init(interval->value);
    return interval;
}

static sagejs_complex_interval *new_complex_interval(
    napi_env env, slong precision)
{
    sagejs_complex_interval *interval =
        (sagejs_complex_interval *) malloc(sizeof(*interval));
    if (interval == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate an Acb interval");
        return NULL;
    }
    interval->magic = COMPLEX_INTERVAL_MAGIC;
    interval->precision = precision;
    acb_init(interval->value);
    return interval;
}

static napi_value wrap_real_interval(
    napi_env env, sagejs_real_interval *interval)
{
    napi_value object;
    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env,
            napi_type_tag_object(env, object, &real_interval_type_tag)) ||
        !check_napi(env, napi_wrap(env, object, interval,
            finalize_real_interval, NULL, NULL)))
    {
        finalize_real_interval(env, interval, NULL);
        return NULL;
    }
    return object;
}

static napi_value wrap_complex_interval(
    napi_env env, sagejs_complex_interval *interval)
{
    napi_value object;
    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env,
            napi_type_tag_object(env, object, &complex_interval_type_tag)) ||
        !check_napi(env, napi_wrap(env, object, interval,
            finalize_complex_interval, NULL, NULL)))
    {
        finalize_complex_interval(env, interval, NULL);
        return NULL;
    }
    return object;
}

static sagejs_real_interval *unwrap_real_interval(
    napi_env env, napi_value object)
{
    bool tagged = false;
    sagejs_real_interval *interval = NULL;
    if (!check_napi(env, napi_check_object_type_tag(
            env, object, &real_interval_type_tag, &tagged)))
        return NULL;
    if (!tagged || !check_napi(env,
            napi_unwrap(env, object, (void **) &interval)) ||
        interval == NULL || interval->magic != REAL_INTERVAL_MAGIC)
    {
        napi_throw_type_error(env, NULL, "expected a Sage.js Arb interval");
        return NULL;
    }
    return interval;
}

static sagejs_complex_interval *unwrap_complex_interval(
    napi_env env, napi_value object)
{
    bool tagged = false;
    sagejs_complex_interval *interval = NULL;
    if (!check_napi(env, napi_check_object_type_tag(
            env, object, &complex_interval_type_tag, &tagged)))
        return NULL;
    if (!tagged || !check_napi(env,
            napi_unwrap(env, object, (void **) &interval)) ||
        interval == NULL || interval->magic != COMPLEX_INTERVAL_MAGIC)
    {
        napi_throw_type_error(env, NULL, "expected a Sage.js Acb interval");
        return NULL;
    }
    return interval;
}

static void round_arb_enclosure(arb_t value, slong precision)
{
    mpfr_t exact_lower;
    mpfr_t exact_upper;
    mpfr_t lower;
    mpfr_t upper;
    arb_t rounded;
    mpfr_init2(exact_lower, (mpfr_prec_t) precision + 64);
    mpfr_init2(exact_upper, (mpfr_prec_t) precision + 64);
    mpfr_init2(lower, (mpfr_prec_t) precision);
    mpfr_init2(upper, (mpfr_prec_t) precision);
    arb_get_interval_mpfr(exact_lower, exact_upper, value);
    mpfr_set(lower, exact_lower, MPFR_RNDD);
    mpfr_set(upper, exact_upper, MPFR_RNDU);
    arb_init(rounded);
    arb_set_interval_mpfr(
        rounded, lower, upper, precision + INTERVAL_GUARD_BITS);
    arb_swap(value, rounded);
    arb_clear(rounded);
    mpfr_clear(upper);
    mpfr_clear(lower);
    mpfr_clear(exact_upper);
    mpfr_clear(exact_lower);
}

static void round_acb_enclosure(acb_t value, slong precision)
{
    round_arb_enclosure(acb_realref(value), precision);
    round_arb_enclosure(acb_imagref(value), precision);
}

static char *join_interval_strings(const char *lower, const char *upper)
{
    size_t length = strlen(lower) + strlen(upper) + 7;
    char *result = (char *) malloc(length + 1);
    if (result != NULL)
        snprintf(result, length + 1, "[%s .. %s]", lower, upper);
    return result;
}

static char *format_arb_brackets(const arb_t value, slong precision)
{
    mpfr_t lower;
    mpfr_t upper;
    char *lower_text;
    char *upper_text;
    char *result;
    size_t digits =
        (size_t) ceil(precision * 0.30102999566398119521) + 1;

    if (!arb_is_finite(value))
    {
        char *raw = arb_get_str(value,
            (slong) ceil(precision * 0.30102999566398119521) + 1,
            ARB_STR_MORE);
        if (raw == NULL)
            return NULL;
        result = (char *) malloc(strlen(raw) + 1);
        if (result != NULL)
            strcpy(result, raw);
        flint_free(raw);
        return result;
    }
    mpfr_init2(lower, (mpfr_prec_t) precision + 64);
    mpfr_init2(upper, (mpfr_prec_t) precision + 64);
    arb_get_interval_mpfr(lower, upper, value);
    lower_text = sagejs_format_real_digits(lower, MPFR_RNDD, digits);
    upper_text = sagejs_format_real_digits(upper, MPFR_RNDU, digits);
    result = lower_text != NULL && upper_text != NULL
        ? join_interval_strings(lower_text, upper_text) : NULL;
    free(upper_text);
    free(lower_text);
    mpfr_clear(upper);
    mpfr_clear(lower);
    return result;
}

/*
 * Sage's compact interval notation chooses the most precise decimal midpoint
 * whose implicit one-unit error still encloses both directed endpoints.  This
 * is the error_digits=0 case of Sage's MPFI formatter, applied to Arb bounds.
 */
static char *format_arb_question(const arb_t value, slong precision)
{
    mpfr_t lower;
    mpfr_t upper;
    mpfr_exp_t lower_exponent;
    mpfr_exp_t upper_exponent;
    mpfr_exp_t exponent;
    char *lower_digits = NULL;
    char *upper_digits = NULL;
    char *mantissa_digits = NULL;
    char *result = NULL;
    mpz_t lower_integer;
    mpz_t upper_integer;
    mpz_t divisor;
    mpz_t error;
    size_t lower_count;
    size_t upper_count;
    size_t digits;
    long scientific_exponent;
    int scientific;

    if (!arb_is_finite(value))
        return format_arb_brackets(value, precision);
    if (arb_is_exact(value) && arb_is_int(value))
    {
        fmpz_t integer;
        char *raw;
        fmpz_init(integer);
        arf_get_fmpz(integer, arb_midref(value), ARF_RND_NEAR);
        raw = fmpz_get_str(NULL, 10, integer);
        fmpz_clear(integer);
        if (raw == NULL)
            return NULL;
        result = (char *) malloc(strlen(raw) + 1);
        if (result != NULL)
            strcpy(result, raw);
        flint_free(raw);
        return result;
    }

    mpfr_init2(lower, (mpfr_prec_t) precision + 64);
    mpfr_init2(upper, (mpfr_prec_t) precision + 64);
    arb_get_interval_mpfr(lower, upper, value);
    lower_digits = mpfr_get_str(
        NULL, &lower_exponent, 10, 0, lower, MPFR_RNDD);
    upper_digits = mpfr_get_str(
        NULL, &upper_exponent, 10, 0, upper, MPFR_RNDU);
    if (lower_digits == NULL || upper_digits == NULL)
        goto cleanup_reals;
    lower_count = strlen(lower_digits) - (lower_digits[0] == '-' ? 1 : 0);
    upper_count = strlen(upper_digits) - (upper_digits[0] == '-' ? 1 : 0);
    lower_exponent -= (mpfr_exp_t) lower_count;
    upper_exponent -= (mpfr_exp_t) upper_count;
    if (lower_exponent - upper_exponent > 4096 ||
        upper_exponent - lower_exponent > 4096)
    {
        mpfr_free_str(upper_digits);
        mpfr_free_str(lower_digits);
        mpfr_clear(upper);
        mpfr_clear(lower);
        return format_arb_brackets(value, precision);
    }

    mpz_init_set_str(lower_integer, lower_digits, 10);
    mpz_init_set_str(upper_integer, upper_digits, 10);
    mpz_init(divisor);
    mpz_init(error);
    if (mpfr_zero_p(lower))
        lower_exponent = upper_exponent;
    if (mpfr_zero_p(upper))
        upper_exponent = lower_exponent;
    if (lower_exponent < upper_exponent)
    {
        unsigned long delta = (unsigned long) (upper_exponent - lower_exponent);
        mpz_ui_pow_ui(divisor, 10, delta);
        mpz_fdiv_q(lower_integer, lower_integer, divisor);
        lower_exponent = upper_exponent;
    }
    else if (upper_exponent < lower_exponent)
    {
        unsigned long delta = (unsigned long) (lower_exponent - upper_exponent);
        mpz_ui_pow_ui(divisor, 10, delta);
        mpz_cdiv_q(upper_integer, upper_integer, divisor);
        upper_exponent = lower_exponent;
    }
    exponent = lower_exponent;
    mpz_sub(error, upper_integer, lower_integer);
    while (mpz_cmp_ui(error, 2) > 0)
    {
        mpz_fdiv_q_ui(lower_integer, lower_integer, 10);
        mpz_cdiv_q_ui(upper_integer, upper_integer, 10);
        exponent++;
        mpz_sub(error, upper_integer, lower_integer);
    }
    mpz_add(lower_integer, lower_integer, upper_integer);
    if (mpz_sgn(lower_integer) >= 0)
        mpz_cdiv_q_2exp(lower_integer, lower_integer, 1);
    else
        mpz_fdiv_q_2exp(lower_integer, lower_integer, 1);
    mantissa_digits = mpz_get_str(NULL, 10, lower_integer);
    if (mantissa_digits == NULL)
        goto cleanup_integers;
    {
        int negative = mantissa_digits[0] == '-';
        const char *magnitude = mantissa_digits + negative;
        digits = strlen(magnitude);
        scientific_exponent = (long) exponent + (long) digits - 1;
        scientific = exponent > 0 || labs(scientific_exponent) >= 6;
        if (scientific)
        {
            size_t length = (size_t) negative + digits + 32;
            result = (char *) malloc(length);
            if (result != NULL)
                snprintf(result, length, "%s%c.%s?e%ld",
                    negative ? "-" : "", magnitude[0], magnitude + 1,
                    scientific_exponent);
        }
        else if (exponent + (mpfr_exp_t) digits <= 0)
        {
            size_t zeros = (size_t) (-(exponent + (mpfr_exp_t) digits));
            size_t length = (size_t) negative + 2 + zeros + digits + 2;
            char *out;
            result = (char *) malloc(length + 1);
            if (result != NULL)
            {
                out = result;
                if (negative)
                    *out++ = '-';
                *out++ = '0';
                *out++ = '.';
                memset(out, '0', zeros);
                out += zeros;
                memcpy(out, magnitude, digits);
                out += digits;
                *out++ = '?';
                *out = '\0';
            }
        }
        else
        {
            size_t before = (size_t) (exponent + (mpfr_exp_t) digits);
            size_t length = (size_t) negative + digits + 3;
            char *out;
            result = (char *) malloc(length + 1);
            if (result != NULL)
            {
                out = result;
                if (negative)
                    *out++ = '-';
                memcpy(out, magnitude, before);
                out += before;
                *out++ = '.';
                memcpy(out, magnitude + before, digits - before);
                out += digits - before;
                *out++ = '?';
                *out = '\0';
            }
        }
    }

cleanup_integers:
    free(mantissa_digits);
    mpz_clear(error);
    mpz_clear(divisor);
    mpz_clear(upper_integer);
    mpz_clear(lower_integer);
cleanup_reals:
    if (upper_digits != NULL)
        mpfr_free_str(upper_digits);
    if (lower_digits != NULL)
        mpfr_free_str(lower_digits);
    mpfr_clear(upper);
    mpfr_clear(lower);
    return result;
}

static napi_value string_result(napi_env env, char *text, const char *error)
{
    napi_value result;
    if (text == NULL)
    {
        napi_throw_error(env, NULL, error);
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

napi_value sagejs_real_interval_from_rational(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    slong precision;
    fmpq_t rational;
    mpq_t mpq_rational;
    mpfr_t lower;
    mpfr_t upper;
    sagejs_real_interval *result;
    if (!require_arguments(env, info, 3, args) ||
        !get_precision(env, args[2], &precision))
        return NULL;
    fmpq_init(rational);
    if (!values_to_fmpq(env, args[0], args[1], rational))
    {
        fmpq_clear(rational);
        return NULL;
    }
    result = new_real_interval(env, precision);
    if (result == NULL)
    {
        fmpq_clear(rational);
        return NULL;
    }
    mpq_init(mpq_rational);
    fmpq_get_mpq(mpq_rational, rational);
    mpfr_init2(lower, (mpfr_prec_t) precision);
    mpfr_init2(upper, (mpfr_prec_t) precision);
    mpfr_set_q(lower, mpq_rational, MPFR_RNDD);
    mpfr_set_q(upper, mpq_rational, MPFR_RNDU);
    arb_set_interval_mpfr(result->value, lower, upper, precision + 8);
    mpfr_clear(upper);
    mpfr_clear(lower);
    mpq_clear(mpq_rational);
    fmpq_clear(rational);
    return wrap_real_interval(env, result);
}

napi_value sagejs_real_interval_from_bounds(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    slong precision;
    sagejs_real *lower;
    sagejs_real *upper;
    sagejs_real_interval *result;
    if (!require_arguments(env, info, 3, args) ||
        (lower = sagejs_native_unwrap_real(env, args[0])) == NULL ||
        (upper = sagejs_native_unwrap_real(env, args[1])) == NULL ||
        !get_precision(env, args[2], &precision))
        return NULL;
    if (mpfr_greater_p(lower->value, upper->value))
    {
        napi_throw_range_error(env, NULL,
            "interval lower endpoint must not exceed its upper endpoint");
        return NULL;
    }
    result = new_real_interval(env, precision);
    if (result == NULL)
        return NULL;
    arb_set_interval_mpfr(
        result->value, lower->value, upper->value, precision + 8);
    return wrap_real_interval(env, result);
}

napi_value sagejs_real_interval_round(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    slong precision;
    sagejs_real_interval *source;
    sagejs_real_interval *result;
    if (!require_arguments(env, info, 2, args) ||
        (source = unwrap_real_interval(env, args[0])) == NULL ||
        !get_precision(env, args[1], &precision))
        return NULL;
    result = new_real_interval(env, precision);
    if (result == NULL)
        return NULL;
    arb_set_round(result->value, source->value, precision);
    return wrap_real_interval(env, result);
}

napi_value sagejs_real_interval_binary(napi_env env, napi_callback_info info)
{
    napi_value args[4];
    int32_t operation;
    slong precision;
    sagejs_real_interval *left;
    sagejs_real_interval *right;
    sagejs_real_interval *result;
    if (!require_arguments(env, info, 4, args) ||
        !get_operation(env, args[0], 0, 5, &operation) ||
        (left = unwrap_real_interval(env, args[1])) == NULL ||
        (right = unwrap_real_interval(env, args[2])) == NULL ||
        !get_precision(env, args[3], &precision))
        return NULL;
    result = new_real_interval(env, precision);
    if (result == NULL)
        return NULL;
    if (operation == 0)
        arb_add(result->value, left->value, right->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 1)
        arb_sub(result->value, left->value, right->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 2)
        arb_mul(result->value, left->value, right->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 3)
        arb_div(result->value, left->value, right->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 4 &&
        !arb_intersection(result->value, left->value, right->value,
            precision + INTERVAL_GUARD_BITS))
    {
        finalize_real_interval(env, result, NULL);
        napi_throw_range_error(env, NULL, "intervals do not overlap");
        return NULL;
    }
    else if (operation == 5)
        arb_union(result->value, left->value, right->value,
            precision + INTERVAL_GUARD_BITS);
    round_arb_enclosure(result->value, precision);
    return wrap_real_interval(env, result);
}

napi_value sagejs_real_interval_unary(napi_env env, napi_callback_info info)
{
    napi_value args[3];
    int32_t operation;
    slong precision;
    sagejs_real_interval *source;
    sagejs_real_interval *result;
    if (!require_arguments(env, info, 3, args) ||
        !get_operation(env, args[0], 0, 7, &operation) ||
        (source = unwrap_real_interval(env, args[1])) == NULL ||
        !get_precision(env, args[2], &precision))
        return NULL;
    result = new_real_interval(env, precision);
    if (result == NULL)
        return NULL;
    if (operation == 0)
        arb_neg(result->value, source->value);
    else if (operation == 1)
        arb_sqrt(result->value, source->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 2)
        arb_exp(result->value, source->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 3)
        arb_log(result->value, source->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 4)
        arb_sin(result->value, source->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 5)
        arb_cos(result->value, source->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 6)
        arb_tan(result->value, source->value,
            precision + INTERVAL_GUARD_BITS);
    else
        arb_abs(result->value, source->value);
    round_arb_enclosure(result->value, precision);
    return wrap_real_interval(env, result);
}

napi_value sagejs_real_interval_pow_int(napi_env env, napi_callback_info info)
{
    napi_value args[3];
    slong precision;
    sagejs_real_interval *source;
    sagejs_real_interval *result;
    mpz_t exponent;
    fmpz_t flint_exponent;
    if (!require_arguments(env, info, 3, args) ||
        (source = unwrap_real_interval(env, args[0])) == NULL ||
        !get_precision(env, args[2], &precision))
        return NULL;
    mpz_init(exponent);
    if (!bigint_to_mpz(env, args[1], exponent))
    {
        mpz_clear(exponent);
        return NULL;
    }
    result = new_real_interval(env, precision);
    if (result == NULL)
    {
        mpz_clear(exponent);
        return NULL;
    }
    fmpz_init(flint_exponent);
    fmpz_set_mpz(flint_exponent, exponent);
    arb_pow_fmpz(result->value, source->value, flint_exponent,
        precision + INTERVAL_GUARD_BITS);
    round_arb_enclosure(result->value, precision);
    fmpz_clear(flint_exponent);
    mpz_clear(exponent);
    return wrap_real_interval(env, result);
}

napi_value sagejs_real_interval_relation(napi_env env, napi_callback_info info)
{
    napi_value args[3];
    napi_value result;
    int32_t operation;
    int answer;
    sagejs_real_interval *left;
    sagejs_real_interval *right;
    if (!require_arguments(env, info, 3, args) ||
        !get_operation(env, args[0], 0, 2, &operation) ||
        (left = unwrap_real_interval(env, args[1])) == NULL ||
        (right = unwrap_real_interval(env, args[2])) == NULL)
        return NULL;
    answer = operation == 0 ? arb_equal(left->value, right->value)
        : operation == 1 ? arb_contains(left->value, right->value)
        : arb_overlaps(left->value, right->value);
    if (!check_napi(env, napi_get_boolean(env, answer, &result)))
        return NULL;
    return result;
}

napi_value sagejs_real_interval_part(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    int32_t operation;
    sagejs_real_interval *source;
    sagejs_real *result;
    mpfr_t lower;
    mpfr_t upper;
    if (!require_arguments(env, info, 2, args) ||
        !get_operation(env, args[0], 0, 5, &operation) ||
        (source = unwrap_real_interval(env, args[1])) == NULL)
        return NULL;
    result = sagejs_native_new_real(env, (mpfr_prec_t) source->precision);
    if (result == NULL)
        return NULL;
    mpfr_init2(lower, (mpfr_prec_t) source->precision);
    mpfr_init2(upper, (mpfr_prec_t) source->precision);
    arb_get_interval_mpfr(lower, upper, source->value);
    if (operation == 0)
        mpfr_set(result->value, lower, MPFR_RNDD);
    else if (operation == 1)
        mpfr_set(result->value, upper, MPFR_RNDU);
    else if (operation == 2)
        arf_get_mpfr(result->value, arb_midref(source->value), MPFR_RNDN);
    else if (operation == 3)
    {
        arf_t radius;
        arf_init(radius);
        arf_set_mag(radius, arb_radref(source->value));
        arf_get_mpfr(result->value, radius, MPFR_RNDU);
        arf_clear(radius);
    }
    else
    {
        mpfr_sub(result->value, upper, lower, MPFR_RNDU);
        if (operation == 5)
        {
            mpfr_t center;
            mpfr_init2(center, (mpfr_prec_t) source->precision);
            arf_get_mpfr(center, arb_midref(source->value), MPFR_RNDN);
            mpfr_abs(center, center, MPFR_RNDD);
            mpfr_div(result->value, result->value, center, MPFR_RNDU);
            mpfr_clear(center);
        }
    }
    mpfr_clear(upper);
    mpfr_clear(lower);
    return sagejs_native_wrap_real(env, result);
}

napi_value sagejs_real_interval_to_string(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    int32_t style;
    sagejs_real_interval *interval;
    char *text;
    if (!require_arguments(env, info, 2, args) ||
        (interval = unwrap_real_interval(env, args[0])) == NULL ||
        !get_operation(env, args[1], 0, 1, &style))
        return NULL;
    text = style == 0
        ? format_arb_question(interval->value, interval->precision)
        : format_arb_brackets(interval->value, interval->precision);
    return string_result(env, text, "unable to format an Arb interval");
}

napi_value sagejs_real_interval_precision(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_real_interval *interval;
    if (!require_arguments(env, info, 1, args) ||
        (interval = unwrap_real_interval(env, args[0])) == NULL)
        return NULL;
    if (!check_napi(env,
        napi_create_int64(env, (int64_t) interval->precision, &result)))
        return NULL;
    return result;
}

napi_value sagejs_complex_interval_from_parts(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    slong precision;
    sagejs_real_interval *real;
    sagejs_real_interval *imaginary;
    sagejs_complex_interval *result;
    if (!require_arguments(env, info, 3, args) ||
        (real = unwrap_real_interval(env, args[0])) == NULL ||
        (imaginary = unwrap_real_interval(env, args[1])) == NULL ||
        !get_precision(env, args[2], &precision))
        return NULL;
    result = new_complex_interval(env, precision);
    if (result == NULL)
        return NULL;
    if (real->precision == precision)
        arb_set(acb_realref(result->value), real->value);
    else
        arb_set_round(acb_realref(result->value), real->value, precision);
    if (imaginary->precision == precision)
        arb_set(acb_imagref(result->value), imaginary->value);
    else
        arb_set_round(acb_imagref(result->value), imaginary->value, precision);
    return wrap_complex_interval(env, result);
}

napi_value sagejs_complex_interval_round(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    slong precision;
    sagejs_complex_interval *source;
    sagejs_complex_interval *result;
    if (!require_arguments(env, info, 2, args) ||
        (source = unwrap_complex_interval(env, args[0])) == NULL ||
        !get_precision(env, args[1], &precision))
        return NULL;
    result = new_complex_interval(env, precision);
    if (result == NULL)
        return NULL;
    acb_set_round(result->value, source->value, precision);
    return wrap_complex_interval(env, result);
}

napi_value sagejs_complex_interval_binary(
    napi_env env, napi_callback_info info)
{
    napi_value args[4];
    int32_t operation;
    slong precision;
    sagejs_complex_interval *left;
    sagejs_complex_interval *right;
    sagejs_complex_interval *result;
    if (!require_arguments(env, info, 4, args) ||
        !get_operation(env, args[0], 0, 3, &operation) ||
        (left = unwrap_complex_interval(env, args[1])) == NULL ||
        (right = unwrap_complex_interval(env, args[2])) == NULL ||
        !get_precision(env, args[3], &precision))
        return NULL;
    result = new_complex_interval(env, precision);
    if (result == NULL)
        return NULL;
    if (operation == 0)
        acb_add(result->value, left->value, right->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 1)
        acb_sub(result->value, left->value, right->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 2)
        acb_mul(result->value, left->value, right->value,
            precision + INTERVAL_GUARD_BITS);
    else
        acb_div(result->value, left->value, right->value,
            precision + INTERVAL_GUARD_BITS);
    round_acb_enclosure(result->value, precision);
    return wrap_complex_interval(env, result);
}

napi_value sagejs_complex_interval_unary(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    int32_t operation;
    slong precision;
    sagejs_complex_interval *source;
    sagejs_complex_interval *result;
    if (!require_arguments(env, info, 3, args) ||
        !get_operation(env, args[0], 0, 6, &operation) ||
        (source = unwrap_complex_interval(env, args[1])) == NULL ||
        !get_precision(env, args[2], &precision))
        return NULL;
    result = new_complex_interval(env, precision);
    if (result == NULL)
        return NULL;
    if (operation == 0)
        acb_neg(result->value, source->value);
    else if (operation == 1)
        acb_sqrt(result->value, source->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 2)
        acb_exp(result->value, source->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 3)
        acb_log(result->value, source->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 4)
        acb_sin(result->value, source->value,
            precision + INTERVAL_GUARD_BITS);
    else if (operation == 5)
        acb_cos(result->value, source->value,
            precision + INTERVAL_GUARD_BITS);
    else
        acb_tan(result->value, source->value,
            precision + INTERVAL_GUARD_BITS);
    round_acb_enclosure(result->value, precision);
    return wrap_complex_interval(env, result);
}

napi_value sagejs_complex_interval_pow_int(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    slong precision;
    sagejs_complex_interval *source;
    sagejs_complex_interval *result;
    mpz_t exponent;
    fmpz_t flint_exponent;
    if (!require_arguments(env, info, 3, args) ||
        (source = unwrap_complex_interval(env, args[0])) == NULL ||
        !get_precision(env, args[2], &precision))
        return NULL;
    mpz_init(exponent);
    if (!bigint_to_mpz(env, args[1], exponent))
    {
        mpz_clear(exponent);
        return NULL;
    }
    result = new_complex_interval(env, precision);
    if (result == NULL)
    {
        mpz_clear(exponent);
        return NULL;
    }
    fmpz_init(flint_exponent);
    fmpz_set_mpz(flint_exponent, exponent);
    acb_pow_fmpz(result->value, source->value, flint_exponent,
        precision + INTERVAL_GUARD_BITS);
    round_acb_enclosure(result->value, precision);
    fmpz_clear(flint_exponent);
    mpz_clear(exponent);
    return wrap_complex_interval(env, result);
}

napi_value sagejs_complex_interval_relation(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    napi_value result;
    int32_t operation;
    int answer;
    sagejs_complex_interval *left;
    sagejs_complex_interval *right;
    if (!require_arguments(env, info, 3, args) ||
        !get_operation(env, args[0], 0, 2, &operation) ||
        (left = unwrap_complex_interval(env, args[1])) == NULL ||
        (right = unwrap_complex_interval(env, args[2])) == NULL)
        return NULL;
    answer = operation == 0 ? acb_equal(left->value, right->value)
        : operation == 1 ? acb_contains(left->value, right->value)
        : acb_overlaps(left->value, right->value);
    if (!check_napi(env, napi_get_boolean(env, answer, &result)))
        return NULL;
    return result;
}

napi_value sagejs_complex_interval_part(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    int32_t operation;
    sagejs_complex_interval *source;
    sagejs_real_interval *result;
    if (!require_arguments(env, info, 2, args) ||
        !get_operation(env, args[0], 0, 1, &operation) ||
        (source = unwrap_complex_interval(env, args[1])) == NULL)
        return NULL;
    result = new_real_interval(env, source->precision);
    if (result == NULL)
        return NULL;
    arb_set(result->value,
        operation == 0 ? acb_realref(source->value) : acb_imagref(source->value));
    return wrap_real_interval(env, result);
}

napi_value sagejs_complex_interval_to_string(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    int32_t style;
    sagejs_complex_interval *interval;
    arb_t imaginary;
    char *real_text;
    char *imaginary_text;
    char *result;
    int negative;
    size_t length;
    if (!require_arguments(env, info, 2, args) ||
        (interval = unwrap_complex_interval(env, args[0])) == NULL ||
        !get_operation(env, args[1], 0, 1, &style))
        return NULL;
    if (arb_is_zero(acb_imagref(interval->value)))
    {
        result = style == 0
            ? format_arb_question(acb_realref(interval->value), interval->precision)
            : format_arb_brackets(acb_realref(interval->value), interval->precision);
        return string_result(env, result, "unable to format an Acb interval");
    }
    real_text = style == 0
        ? format_arb_question(acb_realref(interval->value), interval->precision)
        : format_arb_brackets(acb_realref(interval->value), interval->precision);
    arb_init(imaginary);
    negative = arb_is_negative(acb_imagref(interval->value));
    if (negative)
        arb_neg(imaginary, acb_imagref(interval->value));
    else
        arb_set(imaginary, acb_imagref(interval->value));
    imaginary_text = style == 0
        ? format_arb_question(imaginary, interval->precision)
        : format_arb_brackets(imaginary, interval->precision);
    arb_clear(imaginary);
    if (real_text == NULL || imaginary_text == NULL)
    {
        free(imaginary_text);
        free(real_text);
        napi_throw_error(env, NULL, "unable to format an Acb interval");
        return NULL;
    }
    length = strlen(real_text) + strlen(imaginary_text) + 8;
    result = (char *) malloc(length + 1);
    if (result != NULL)
        snprintf(result, length + 1, "%s %c %s*I",
            real_text, negative ? '-' : '+', imaginary_text);
    free(imaginary_text);
    free(real_text);
    return string_result(env, result, "unable to format an Acb interval");
}

napi_value sagejs_complex_interval_precision(
    napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_complex_interval *interval;
    if (!require_arguments(env, info, 1, args) ||
        (interval = unwrap_complex_interval(env, args[0])) == NULL)
        return NULL;
    if (!check_napi(env,
        napi_create_int64(env, (int64_t) interval->precision, &result)))
        return NULL;
    return result;
}
