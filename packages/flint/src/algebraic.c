#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <node_api.h>
#include <sagejs/native.h>

#include <flint/acb.h>
#include <flint/arb.h>
#include <flint/arf.h>
#include <flint/fmpq.h>
#include <flint/fmpq_poly.h>
#include <flint/fmpz.h>
#include <flint/fmpz_poly.h>
#include <flint/qqbar.h>

#include "algebraic.h"

#define SAGEJS_QQBAR_MAGIC UINT64_C(0x534147454A535141)

typedef struct
{
    uint64_t magic;
    qqbar_t value;
} sagejs_qqbar;

static const napi_type_tag sagejs_qqbar_type_tag = {
    UINT64_C(0xc766e7f128534b72),
    UINT64_C(0xb748d4412b875de1)
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
    if (!lossless || number > (uint64_t) WORD_MAX)
    {
        napi_throw_range_error(
            env, NULL, "root-of-unity data is too large");
        return 0;
    }
    *result = (ulong) number;
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

static void finalize_qqbar(napi_env env, void *data, void *hint)
{
    sagejs_qqbar *number = data;
    (void) env;
    (void) hint;

    if (number != NULL && number->magic == SAGEJS_QQBAR_MAGIC)
    {
        qqbar_clear(number->value);
        number->magic = 0;
        free(number);
    }
}

static napi_value wrap_owned(napi_env env, sagejs_qqbar *number)
{
    napi_value object;

    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env,
            napi_type_tag_object(env, object, &sagejs_qqbar_type_tag)) ||
        !check_napi(env,
            napi_wrap(env, object, number, finalize_qqbar, NULL, NULL)))
    {
        finalize_qqbar(env, number, NULL);
        return NULL;
    }
    return object;
}

napi_value sagejs_qqbar_wrap_copy(napi_env env, const qqbar_t value)
{
    sagejs_qqbar *number = malloc(sizeof(*number));

    if (number == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate an algebraic number");
        return NULL;
    }
    number->magic = SAGEJS_QQBAR_MAGIC;
    qqbar_init(number->value);
    qqbar_set(number->value, value);
    return wrap_owned(env, number);
}

qqbar_srcptr sagejs_qqbar_unwrap(napi_env env, napi_value object)
{
    sagejs_qqbar *number = NULL;
    bool tagged = false;

    if (!check_napi(env,
        napi_check_object_type_tag(
            env, object, &sagejs_qqbar_type_tag, &tagged)))
        return NULL;
    if (!tagged ||
        !check_napi(env, napi_unwrap(env, object, (void **) &number)) ||
        number == NULL || number->magic != SAGEJS_QQBAR_MAGIC)
    {
        napi_throw_type_error(
            env, NULL, "expected a Sage.js FLINT algebraic number");
        return NULL;
    }
    return number->value;
}

napi_value sagejs_qqbar_from_rational(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    fmpz_t numerator;
    fmpz_t denominator;
    fmpq_t rational;
    qqbar_t result;
    napi_value answer = NULL;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    fmpz_init(numerator);
    fmpz_init(denominator);
    fmpq_init(rational);
    qqbar_init(result);
    if (!bigint_to_fmpz(env, args[0], numerator) ||
        !bigint_to_fmpz(env, args[1], denominator))
        goto cleanup;
    if (fmpz_is_zero(denominator))
    {
        napi_throw_range_error(env, NULL, "denominator must be nonzero");
        goto cleanup;
    }
    fmpq_set_fmpz_frac(rational, numerator, denominator);
    qqbar_set_fmpq(result, rational);
    answer = sagejs_qqbar_wrap_copy(env, result);

cleanup:
    qqbar_clear(result);
    fmpq_clear(rational);
    fmpz_clear(numerator);
    fmpz_clear(denominator);
    return answer;
}

napi_value sagejs_qqbar_i(napi_env env, napi_callback_info info)
{
    qqbar_t result;
    napi_value answer;
    napi_value args[1];

    if (!require_arguments(env, info, 0, args))
        return NULL;
    qqbar_init(result);
    qqbar_i(result);
    answer = sagejs_qqbar_wrap_copy(env, result);
    qqbar_clear(result);
    return answer;
}

napi_value sagejs_qqbar_root_of_unity(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    ulong exponent;
    ulong order;
    qqbar_t result;
    napi_value answer;

    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_ulong(env, args[0], &exponent) ||
        !bigint_to_ulong(env, args[1], &order))
        return NULL;
    if (order == 0)
    {
        napi_throw_range_error(
            env, NULL, "root-of-unity order must be positive");
        return NULL;
    }
    exponent %= order;
    qqbar_init(result);
    qqbar_root_of_unity(result, (slong) exponent, order);
    answer = sagejs_qqbar_wrap_copy(env, result);
    qqbar_clear(result);
    return answer;
}

napi_value sagejs_cyclotomic_root_coefficients(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    napi_value coefficient;
    ulong order;
    ulong exponent;
    slong index;
    slong length;
    fmpz_poly_t cyclotomic;
    fmpz_poly_t monomial;
    fmpz_poly_t remainder;

    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_ulong(env, args[0], &exponent) ||
        !bigint_to_ulong(env, args[1], &order))
        return NULL;
    if (order == 0)
    {
        napi_throw_range_error(
            env, NULL, "cyclotomic order must be positive");
        return NULL;
    }
    exponent %= order;
    fmpz_poly_init(cyclotomic);
    fmpz_poly_init(monomial);
    fmpz_poly_init(remainder);
    fmpz_poly_cyclotomic(cyclotomic, order);
    fmpz_poly_set_coeff_ui(monomial, (slong) exponent, 1);
    fmpz_poly_rem(remainder, monomial, cyclotomic);
    length = fmpz_poly_length(remainder);
    if (!check_napi(env,
        napi_create_array_with_length(env, (size_t) length, &result)))
        goto failure;
    for (index = 0; index < length; index++)
    {
        coefficient = fmpz_to_bigint(
            env, fmpz_poly_get_coeff_ptr(remainder, index));
        if (coefficient == NULL ||
            !check_napi(env,
                napi_set_element(
                    env, result, (uint32_t) index, coefficient)))
            goto failure;
    }
    fmpz_poly_clear(remainder);
    fmpz_poly_clear(monomial);
    fmpz_poly_clear(cyclotomic);
    return result;

failure:
    fmpz_poly_clear(remainder);
    fmpz_poly_clear(monomial);
    fmpz_poly_clear(cyclotomic);
    return NULL;
}

napi_value sagejs_cyclotomic_element_coefficients(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result = NULL;
    napi_value pair;
    napi_value numerator;
    napi_value denominator;
    qqbar_srcptr value;
    ulong order;
    slong index;
    slong length;
    slong height;
    slong precision;
    int expressed = 0;
    qqbar_t generator;
    fmpq_poly_t coefficients;

    if (!require_arguments(env, info, 2, args) ||
        (value = sagejs_qqbar_unwrap(env, args[0])) == NULL ||
        !bigint_to_ulong(env, args[1], &order))
        return NULL;
    if (order == 0)
    {
        napi_throw_range_error(
            env, NULL, "cyclotomic order must be positive");
        return NULL;
    }
    qqbar_init(generator);
    fmpq_poly_init(coefficients);
    qqbar_root_of_unity(generator, 1, order);
    height = qqbar_height_bits(value);
    precision = height > (WORD_MAX - 40) / 2
        ? WORD_MAX : 2 * height + 40;
    if (precision < 128)
        precision = 128;
    for (int attempt = 0; attempt < 4 && !expressed; attempt++)
    {
        expressed = qqbar_express_in_field(
            coefficients, generator, value, precision, 0, precision);
        if (precision <= WORD_MAX / 2)
            precision *= 2;
    }
    if (!expressed)
    {
        napi_throw_range_error(env, NULL,
            "algebraic number is not in the requested cyclotomic field");
        goto cleanup;
    }
    length = fmpq_poly_length(coefficients);
    if (!check_napi(env,
        napi_create_array_with_length(env, (size_t) length, &result)))
    {
        result = NULL;
        goto cleanup;
    }
    for (index = 0; index < length; index++)
    {
        numerator = fmpz_to_bigint(
            env, fmpq_poly_numref(coefficients) + index);
        denominator = fmpz_to_bigint(
            env, fmpq_poly_denref(coefficients));
        if (numerator == NULL || denominator == NULL ||
            !check_napi(env,
                napi_create_array_with_length(env, 2, &pair)) ||
            !check_napi(env,
                napi_set_element(env, pair, 0, numerator)) ||
            !check_napi(env,
                napi_set_element(env, pair, 1, denominator)) ||
            !check_napi(env,
                napi_set_element(env, result, (uint32_t) index, pair)))
        {
            result = NULL;
            goto cleanup;
        }
    }

cleanup:
    fmpq_poly_clear(coefficients);
    qqbar_clear(generator);
    return result;
}

typedef void (*sagejs_qqbar_binary_function)(
    qqbar_t, const qqbar_t, const qqbar_t);

static napi_value binary(
    napi_env env,
    napi_callback_info info,
    sagejs_qqbar_binary_function operation)
{
    napi_value args[2];
    qqbar_srcptr left;
    qqbar_srcptr right;
    qqbar_t result;
    napi_value answer;

    if (!require_arguments(env, info, 2, args) ||
        (left = sagejs_qqbar_unwrap(env, args[0])) == NULL ||
        (right = sagejs_qqbar_unwrap(env, args[1])) == NULL)
        return NULL;
    qqbar_init(result);
    operation(result, left, right);
    answer = sagejs_qqbar_wrap_copy(env, result);
    qqbar_clear(result);
    return answer;
}

napi_value sagejs_qqbar_add(napi_env env, napi_callback_info info)
{
    return binary(env, info, qqbar_add);
}

napi_value sagejs_qqbar_sub(napi_env env, napi_callback_info info)
{
    return binary(env, info, qqbar_sub);
}

napi_value sagejs_qqbar_mul(napi_env env, napi_callback_info info)
{
    return binary(env, info, qqbar_mul);
}

napi_value sagejs_qqbar_div(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    qqbar_srcptr left;
    qqbar_srcptr right;
    qqbar_t result;
    napi_value answer;

    if (!require_arguments(env, info, 2, args) ||
        (left = sagejs_qqbar_unwrap(env, args[0])) == NULL ||
        (right = sagejs_qqbar_unwrap(env, args[1])) == NULL)
        return NULL;
    if (qqbar_is_zero(right))
    {
        napi_throw_range_error(env, NULL, "algebraic division by zero");
        return NULL;
    }
    qqbar_init(result);
    qqbar_div(result, left, right);
    answer = sagejs_qqbar_wrap_copy(env, result);
    qqbar_clear(result);
    return answer;
}

static napi_value unary(
    napi_env env,
    napi_callback_info info,
    void (*operation)(qqbar_t, const qqbar_t))
{
    napi_value args[1];
    qqbar_srcptr source;
    qqbar_t result;
    napi_value answer;

    if (!require_arguments(env, info, 1, args) ||
        (source = sagejs_qqbar_unwrap(env, args[0])) == NULL)
        return NULL;
    qqbar_init(result);
    operation(result, source);
    answer = sagejs_qqbar_wrap_copy(env, result);
    qqbar_clear(result);
    return answer;
}

napi_value sagejs_qqbar_neg(napi_env env, napi_callback_info info)
{
    return unary(env, info, qqbar_neg);
}

napi_value sagejs_qqbar_sqrt(napi_env env, napi_callback_info info)
{
    return unary(env, info, qqbar_sqrt);
}

napi_value sagejs_qqbar_real(napi_env env, napi_callback_info info)
{
    return unary(env, info, qqbar_re);
}

napi_value sagejs_qqbar_imag(napi_env env, napi_callback_info info)
{
    return unary(env, info, qqbar_im);
}

napi_value sagejs_qqbar_conjugate(napi_env env, napi_callback_info info)
{
    return unary(env, info, qqbar_conj);
}

napi_value sagejs_qqbar_abs(napi_env env, napi_callback_info info)
{
    return unary(env, info, qqbar_abs);
}

napi_value sagejs_qqbar_pow(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    qqbar_srcptr source;
    fmpz_t exponent;
    qqbar_t result;
    napi_value answer = NULL;

    if (!require_arguments(env, info, 2, args) ||
        (source = sagejs_qqbar_unwrap(env, args[0])) == NULL)
        return NULL;
    fmpz_init(exponent);
    qqbar_init(result);
    if (bigint_to_fmpz(env, args[1], exponent))
    {
        if (qqbar_is_zero(source) && fmpz_sgn(exponent) < 0)
        {
            napi_throw_range_error(
                env, NULL, "zero cannot be raised to a negative power");
            goto cleanup;
        }
        qqbar_pow_fmpz(result, source, exponent);
        answer = sagejs_qqbar_wrap_copy(env, result);
    }

cleanup:
    qqbar_clear(result);
    fmpz_clear(exponent);
    return answer;
}

napi_value sagejs_qqbar_pow_rational(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    qqbar_srcptr source;
    fmpz_t numerator;
    fmpz_t denominator;
    fmpq_t exponent;
    qqbar_t result;
    napi_value answer = NULL;

    if (!require_arguments(env, info, 3, args) ||
        (source = sagejs_qqbar_unwrap(env, args[0])) == NULL)
        return NULL;
    fmpz_init(numerator);
    fmpz_init(denominator);
    fmpq_init(exponent);
    qqbar_init(result);
    if (!bigint_to_fmpz(env, args[1], numerator) ||
        !bigint_to_fmpz(env, args[2], denominator))
        goto cleanup;
    if (fmpz_is_zero(denominator))
    {
        napi_throw_range_error(env, NULL, "denominator must be nonzero");
        goto cleanup;
    }
    fmpq_set_fmpz_frac(exponent, numerator, denominator);
    if (qqbar_is_zero(source) && fmpq_sgn(exponent) < 0)
    {
        napi_throw_range_error(
            env, NULL, "zero cannot be raised to a negative power");
        goto cleanup;
    }
    qqbar_pow_fmpq(result, source, exponent);
    answer = sagejs_qqbar_wrap_copy(env, result);

cleanup:
    qqbar_clear(result);
    fmpq_clear(exponent);
    fmpz_clear(numerator);
    fmpz_clear(denominator);
    return answer;
}

static napi_value predicate(
    napi_env env,
    napi_callback_info info,
    int (*test)(const qqbar_t))
{
    napi_value args[1];
    napi_value result;
    qqbar_srcptr value;

    if (!require_arguments(env, info, 1, args) ||
        (value = sagejs_qqbar_unwrap(env, args[0])) == NULL ||
        !check_napi(env, napi_get_boolean(env, test(value) != 0, &result)))
        return NULL;
    return result;
}

napi_value sagejs_qqbar_equal(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    qqbar_srcptr left;
    qqbar_srcptr right;

    if (!require_arguments(env, info, 2, args) ||
        (left = sagejs_qqbar_unwrap(env, args[0])) == NULL ||
        (right = sagejs_qqbar_unwrap(env, args[1])) == NULL ||
        !check_napi(env,
            napi_get_boolean(env, qqbar_equal(left, right), &result)))
        return NULL;
    return result;
}

napi_value sagejs_qqbar_compare_real(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    qqbar_srcptr left;
    qqbar_srcptr right;

    if (!require_arguments(env, info, 2, args) ||
        (left = sagejs_qqbar_unwrap(env, args[0])) == NULL ||
        (right = sagejs_qqbar_unwrap(env, args[1])) == NULL)
        return NULL;
    if (!qqbar_is_real(left) || !qqbar_is_real(right))
    {
        napi_throw_type_error(env, NULL,
            "algebraic comparison requires real values");
        return NULL;
    }
    if (!check_napi(env,
        napi_create_int32(env, qqbar_cmp_re(left, right), &result)))
        return NULL;
    return result;
}

napi_value sagejs_qqbar_is_real(napi_env env, napi_callback_info info)
{
    return predicate(env, info, qqbar_is_real);
}

napi_value sagejs_qqbar_is_rational(napi_env env, napi_callback_info info)
{
    return predicate(env, info, qqbar_is_rational);
}

napi_value sagejs_qqbar_degree(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    qqbar_srcptr value;

    if (!require_arguments(env, info, 1, args) ||
        (value = sagejs_qqbar_unwrap(env, args[0])) == NULL ||
        !check_napi(env,
            napi_create_int64(env, qqbar_degree(value), &result)))
        return NULL;
    return result;
}

napi_value sagejs_qqbar_minpoly_coefficients(
    napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    napi_value coefficient;
    qqbar_srcptr value;
    slong index;
    slong degree;

    if (!require_arguments(env, info, 1, args) ||
        (value = sagejs_qqbar_unwrap(env, args[0])) == NULL)
        return NULL;
    degree = qqbar_degree(value);
    if (!check_napi(env,
        napi_create_array_with_length(env, (size_t) degree + 1, &result)))
        return NULL;
    for (index = 0; index <= degree; index++)
    {
        coefficient = fmpz_to_bigint(env, QQBAR_COEFFS(value) + index);
        if (coefficient == NULL ||
            !check_napi(env,
                napi_set_element(
                    env, result, (uint32_t) index, coefficient)))
            return NULL;
    }
    return result;
}

napi_value sagejs_qqbar_to_string(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    qqbar_srcptr value;
    double requested;
    slong digits;
    char *text = NULL;
    fmpq_t rational;

    if (!require_arguments(env, info, 2, args) ||
        (value = sagejs_qqbar_unwrap(env, args[0])) == NULL ||
        !check_napi(env, napi_get_value_double(env, args[1], &requested)))
        return NULL;
    if (!isfinite(requested) || requested < 1 ||
        requested > 1000000 || floor(requested) != requested)
    {
        napi_throw_range_error(env, NULL,
            "display digits must be a positive integer");
        return NULL;
    }
    digits = (slong) requested;
    if (qqbar_is_rational(value))
    {
        fmpq_init(rational);
        qqbar_get_fmpq(rational, value);
        text = fmpq_get_str(NULL, 10, rational);
        fmpq_clear(rational);
    }
    else
    {
        /*
         * Exact Gaussian rationals have degree at most two.  Restricting the
         * exact real/imaginary decomposition to that case is important:
         * qqbar_re_im can itself be substantial algebraic-number work for
         * high-degree roots, while their displayed decimal only needs the
         * already isolated complex enclosure.
         */
        if (qqbar_degree(value) <= 2)
        {
            qqbar_t real_part;
            qqbar_t imag_part;

            qqbar_init(real_part);
            qqbar_init(imag_part);
            qqbar_re_im(real_part, imag_part, value);
            if (qqbar_is_rational(real_part) &&
                qqbar_is_rational(imag_part))
            {
                fmpq_t real_rational;
                fmpq_t real_absolute;
                fmpq_t imag_rational;
                fmpq_t imag_absolute;
                char *real_text;
                char *imag_text;
                const char *imag_coefficient;
                const char *sign;
                size_t size;

                fmpq_init(real_rational);
                fmpq_init(real_absolute);
                fmpq_init(imag_rational);
                fmpq_init(imag_absolute);
                qqbar_get_fmpq(real_rational, real_part);
                qqbar_get_fmpq(imag_rational, imag_part);
                fmpq_abs(real_absolute, real_rational);
                fmpq_abs(imag_absolute, imag_rational);
                real_text = fmpq_get_str(NULL, 10, real_absolute);
                imag_text = fmpq_get_str(NULL, 10, imag_absolute);
                imag_coefficient =
                    fmpq_is_one(imag_absolute) ? "" : imag_text;
                sign = fmpq_sgn(imag_rational) < 0 ? "-" : "";
                size = strlen(real_text) + strlen(imag_text) + 8;
                text = flint_malloc(size);
                if (fmpq_is_zero(real_rational))
                    flint_sprintf(
                        text, "%s%s%sI",
                        sign,
                        imag_coefficient,
                        *imag_coefficient == '\0' ? "" : "*");
                else
                    flint_sprintf(
                        text, "%s%s%sI %s %s",
                        sign,
                        imag_coefficient,
                        *imag_coefficient == '\0' ? "" : "*",
                        fmpq_sgn(real_rational) < 0 ? "-" : "+",
                        real_text);
                flint_free(real_text);
                flint_free(imag_text);
                fmpq_clear(real_rational);
                fmpq_clear(real_absolute);
                fmpq_clear(imag_rational);
                fmpq_clear(imag_absolute);
            }
            qqbar_clear(real_part);
            qqbar_clear(imag_part);
        }

        if (text == NULL)
        {
            acb_t approximation;
            arb_t imag_absolute;
            char *real_text;
            char *imag_text;
            int real_sign = qqbar_sgn_re(value);
            int imag_sign = qqbar_sgn_im(value);
            slong precision = (slong) ceil(
                (double) digits * 3.321928094887363) + 16;
            size_t size;

            acb_init(approximation);
            arb_init(imag_absolute);
            qqbar_get_acb(approximation, value, precision);
            arb_abs(imag_absolute, acb_imagref(approximation));
            real_text = arb_get_str(
                acb_realref(approximation),
                digits,
                ARB_STR_NO_RADIUS);
            imag_text = arb_get_str(
                imag_absolute,
                digits,
                ARB_STR_NO_RADIUS);
            if (imag_sign == 0)
            {
                text = real_text;
                real_text = NULL;
            }
            else
            {
                size = strlen(real_text) + strlen(imag_text) + 8;
                text = flint_malloc(size);
                if (real_sign == 0)
                    flint_sprintf(
                        text, "%s%s*I",
                        imag_sign < 0 ? "-" : "",
                        imag_text);
                else
                    flint_sprintf(
                        text, "%s %s %s*I",
                        real_text,
                        imag_sign < 0 ? "-" : "+",
                        imag_text);
            }
            flint_free(real_text);
            flint_free(imag_text);
            arb_clear(imag_absolute);
            acb_clear(approximation);
        }
    }
    if (text == NULL)
    {
        napi_throw_error(env, NULL,
            "FLINT could not format the algebraic number");
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

napi_value sagejs_qqbar_approx(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    qqbar_srcptr value;
    double requested;
    slong precision;
    acb_t enclosure;
    sagejs_complex *result;

    if (!require_arguments(env, info, 2, args) ||
        (value = sagejs_qqbar_unwrap(env, args[0])) == NULL ||
        !check_napi(env, napi_get_value_double(env, args[1], &requested)))
        return NULL;
    if (!isfinite(requested) || requested < 2 ||
        requested > 100000000 || floor(requested) != requested)
    {
        napi_throw_range_error(env, NULL,
            "precision must be an integer of at least 2 bits");
        return NULL;
    }
    precision = (slong) requested;
    result = sagejs_native_new_complex(env, (mpfr_prec_t) precision);
    if (result == NULL)
        return NULL;
    acb_init(enclosure);
    qqbar_get_acb(enclosure, value, precision);
    arf_get_mpfr(
        mpc_realref(result->value),
        arb_midref(acb_realref(enclosure)),
        MPFR_RNDN);
    arf_get_mpfr(
        mpc_imagref(result->value),
        arb_midref(acb_imagref(enclosure)),
        MPFR_RNDN);
    acb_clear(enclosure);
    return sagejs_native_wrap_complex(env, result);
}
