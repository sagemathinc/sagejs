#include <limits.h>
#include <math.h>
#include <stdint.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <windows.h>
#define strdup _strdup
#else
#include <unistd.h>
#endif

#include <node_api.h>
#include <pthread.h>

#include <flint/arith.h>
#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/fmpz_factor.h>
#include <flint/fmpz_poly.h>
#include <flint/fmpz_poly_factor.h>
#include <flint/fmpz_vec.h>
#include <flint/fmpq.h>
#include <flint/fmpq_poly.h>
#include <flint/nmod_poly.h>
#include <flint/nmod_poly_factor.h>
#include <flint/qfb.h>
#include <flint/ulong_extras.h>
#include <sagejs/native.h>
#ifdef SAGEJS_HAVE_SMALLJAC
#include <smalljac.h>
#endif

#include "algebraic.h"
#include "dirichlet.h"
#include "eclib_rank.h"
#include "elliptic_lfunction.h"
#include "extension_field.h"
#include "floating.h"
#include "matrix.h"
#include "multivariate.h"
#include "number_field_factor.h"
#include "p1.h"
#include "prime_count.h"

#if FLINT_BITS != 64
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

static int value_to_qfb(napi_env env, napi_value value, qfb_t form)
{
    bool is_array;
    uint32_t length;
    uint32_t index;
    fmpz *entries[3] = {form->a, form->b, form->c};

    if (!check_napi(env, napi_is_array(env, value, &is_array)))
        return 0;
    if (!is_array ||
        !check_napi(env, napi_get_array_length(env, value, &length)))
    {
        if (!is_array)
            napi_throw_type_error(env, NULL,
                "quadratic form must be an array");
        return 0;
    }
    if (length != 3)
    {
        napi_throw_range_error(env, NULL,
            "quadratic form must have three coefficients");
        return 0;
    }
    for (index = 0; index < 3; index++)
    {
        napi_value coefficient;
        if (!check_napi(env,
                napi_get_element(env, value, index, &coefficient)) ||
            !bigint_to_fmpz(env, coefficient, entries[index]))
            return 0;
    }
    return 1;
}

static napi_value qfb_to_value(napi_env env, const qfb_t form)
{
    napi_value result;
    napi_value coefficient;
    const fmpz *entries[3] = {form->a, form->b, form->c};
    uint32_t index;

    if (!check_napi(env, napi_create_array_with_length(env, 3, &result)))
        return NULL;
    for (index = 0; index < 3; index++)
    {
        coefficient = fmpz_to_bigint(env, entries[index]);
        if (coefficient == NULL ||
            !check_napi(env,
                napi_set_element(env, result, index, coefficient)))
            return NULL;
    }
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
    if (!lossless || number > UWORD_MAX)
    {
        napi_throw_range_error(
            env, NULL, "BigInt does not fit in an unsigned FLINT word");
        return 0;
    }
    *result = (ulong) number;
    return 1;
}

static int bigint_to_prime_modulus(
    napi_env env,
    napi_value value,
    ulong *result)
{
    if (!bigint_to_ulong(env, value, result))
        return 0;
    if (*result < 2 || !n_is_prime(*result))
    {
        napi_throw_range_error(env, NULL, "modulus must be prime");
        return 0;
    }
    return 1;
}

static int bigint_to_modulus(
    napi_env env,
    napi_value value,
    ulong *result)
{
    if (!bigint_to_ulong(env, value, result))
        return 0;
    if (*result < 2)
    {
        napi_throw_range_error(env, NULL, "modulus must be at least 2");
        return 0;
    }
    return 1;
}

static ulong mul_mod_word(ulong left, ulong right, ulong modulus)
{
    return (ulong) (((__uint128_t) left * right) % modulus);
}

static void elliptic_mod_add(
    fmpz_t result, const fmpz_t left, const fmpz_t right,
    const fmpz_t modulus)
{
    fmpz_add(result, left, right);
    fmpz_mod(result, result, modulus);
}

static void elliptic_mod_sub(
    fmpz_t result, const fmpz_t left, const fmpz_t right,
    const fmpz_t modulus)
{
    fmpz_sub(result, left, right);
    fmpz_mod(result, result, modulus);
}

static void elliptic_mod_mul(
    fmpz_t result, const fmpz_t left, const fmpz_t right,
    const fmpz_t modulus)
{
    fmpz_mul(result, left, right);
    fmpz_mod(result, result, modulus);
}

static void elliptic_mod_mul_ui(
    fmpz_t result, const fmpz_t value, ulong multiplier,
    const fmpz_t modulus)
{
    fmpz_mul_ui(result, value, multiplier);
    fmpz_mod(result, result, modulus);
}

static void elliptic_mod_square(
    fmpz_t result, const fmpz_t value, const fmpz_t modulus)
{
    fmpz_mul(result, value, value);
    fmpz_mod(result, result, modulus);
}

static void elliptic_jacobian_double(
    fmpz_t x, fmpz_t y, fmpz_t z,
    const fmpz_t short_a, const fmpz_t modulus,
    fmpz_t scratch[12])
{
    if (fmpz_is_zero(y) || fmpz_is_zero(z))
    {
        fmpz_zero(x);
        fmpz_one(y);
        fmpz_zero(z);
        return;
    }

    /* scratch: y2, s, z2, z4, m, new_x, y4, new_y, new_z. */
    elliptic_mod_square(scratch[0], y, modulus);
    elliptic_mod_mul(scratch[1], x, scratch[0], modulus);
    elliptic_mod_mul_ui(scratch[1], scratch[1], 4, modulus);
    elliptic_mod_square(scratch[2], z, modulus);
    elliptic_mod_square(scratch[3], scratch[2], modulus);
    elliptic_mod_square(scratch[4], x, modulus);
    elliptic_mod_mul_ui(scratch[4], scratch[4], 3, modulus);
    elliptic_mod_mul(scratch[5], short_a, scratch[3], modulus);
    elliptic_mod_add(scratch[4], scratch[4], scratch[5], modulus);
    elliptic_mod_square(scratch[5], scratch[4], modulus);
    elliptic_mod_mul_ui(scratch[6], scratch[1], 2, modulus);
    elliptic_mod_sub(scratch[5], scratch[5], scratch[6], modulus);
    elliptic_mod_square(scratch[6], scratch[0], modulus);
    elliptic_mod_mul_ui(scratch[6], scratch[6], 8, modulus);
    elliptic_mod_sub(scratch[7], scratch[1], scratch[5], modulus);
    elliptic_mod_mul(scratch[7], scratch[4], scratch[7], modulus);
    elliptic_mod_sub(scratch[7], scratch[7], scratch[6], modulus);
    elliptic_mod_mul(scratch[8], y, z, modulus);
    elliptic_mod_mul_ui(scratch[8], scratch[8], 2, modulus);
    fmpz_set(x, scratch[5]);
    fmpz_set(y, scratch[7]);
    fmpz_set(z, scratch[8]);
}

static void elliptic_jacobian_mixed_add(
    fmpz_t x, fmpz_t y, fmpz_t z,
    const fmpz_t affine_x, const fmpz_t affine_y,
    const fmpz_t short_a, const fmpz_t modulus,
    fmpz_t scratch[12])
{
    if (fmpz_is_zero(z))
    {
        fmpz_set(x, affine_x);
        fmpz_set(y, affine_y);
        fmpz_one(z);
        return;
    }

    /* scratch: z2, u, s, h, hh, i, j, r, v, new_x/y/z. */
    elliptic_mod_square(scratch[0], z, modulus);
    elliptic_mod_mul(scratch[1], affine_x, scratch[0], modulus);
    elliptic_mod_mul(scratch[2], affine_y, z, modulus);
    elliptic_mod_mul(scratch[2], scratch[2], scratch[0], modulus);
    elliptic_mod_sub(scratch[3], scratch[1], x, modulus);
    if (fmpz_is_zero(scratch[3]))
    {
        if (fmpz_equal(scratch[2], y))
            elliptic_jacobian_double(
                x, y, z, short_a, modulus, scratch);
        else
        {
            fmpz_zero(x);
            fmpz_one(y);
            fmpz_zero(z);
        }
        return;
    }
    elliptic_mod_square(scratch[4], scratch[3], modulus);
    elliptic_mod_mul_ui(scratch[5], scratch[4], 4, modulus);
    elliptic_mod_mul(scratch[6], scratch[3], scratch[5], modulus);
    elliptic_mod_sub(scratch[7], scratch[2], y, modulus);
    elliptic_mod_mul_ui(scratch[7], scratch[7], 2, modulus);
    elliptic_mod_mul(scratch[8], x, scratch[5], modulus);
    elliptic_mod_square(scratch[9], scratch[7], modulus);
    elliptic_mod_sub(scratch[9], scratch[9], scratch[6], modulus);
    elliptic_mod_mul_ui(scratch[10], scratch[8], 2, modulus);
    elliptic_mod_sub(scratch[9], scratch[9], scratch[10], modulus);
    elliptic_mod_sub(scratch[10], scratch[8], scratch[9], modulus);
    elliptic_mod_mul(scratch[10], scratch[7], scratch[10], modulus);
    elliptic_mod_mul(scratch[11], y, scratch[6], modulus);
    elliptic_mod_mul_ui(scratch[11], scratch[11], 2, modulus);
    elliptic_mod_sub(scratch[10], scratch[10], scratch[11], modulus);
    elliptic_mod_add(scratch[11], z, scratch[3], modulus);
    elliptic_mod_square(scratch[11], scratch[11], modulus);
    elliptic_mod_sub(scratch[11], scratch[11], scratch[0], modulus);
    elliptic_mod_sub(scratch[11], scratch[11], scratch[4], modulus);
    fmpz_set(x, scratch[9]);
    fmpz_set(y, scratch[10]);
    fmpz_set(z, scratch[11]);
}

static napi_value elliptic_scalar_mul_prime(
    napi_env env, napi_callback_info info)
{
    napi_value args[9];
    napi_value result = NULL;
    napi_value coordinate;
    fmpz_t a1, a2, a3, a4, a6, affine_long_x, affine_long_y;
    fmpz_t scalar, modulus, b2, b4, c4, short_a;
    fmpz_t affine_x, affine_y, x, y, z, inverse, temporary;
    fmpz_t scratch[12];
    slong index;
    slong bit;

    fmpz_init(a1); fmpz_init(a2); fmpz_init(a3); fmpz_init(a4);
    fmpz_init(a6); fmpz_init(affine_long_x); fmpz_init(affine_long_y);
    fmpz_init(scalar); fmpz_init(modulus); fmpz_init(b2); fmpz_init(b4);
    fmpz_init(c4); fmpz_init(short_a); fmpz_init(affine_x);
    fmpz_init(affine_y); fmpz_init(x); fmpz_init(y); fmpz_init(z);
    fmpz_init(inverse); fmpz_init(temporary);
    for (index = 0; index < 12; index++)
        fmpz_init(scratch[index]);

    if (!require_arguments(env, info, 9, args) ||
        !bigint_to_fmpz(env, args[0], a1) ||
        !bigint_to_fmpz(env, args[1], a2) ||
        !bigint_to_fmpz(env, args[2], a3) ||
        !bigint_to_fmpz(env, args[3], a4) ||
        !bigint_to_fmpz(env, args[4], a6) ||
        !bigint_to_fmpz(env, args[5], affine_long_x) ||
        !bigint_to_fmpz(env, args[6], affine_long_y) ||
        !bigint_to_fmpz(env, args[7], scalar) ||
        !bigint_to_fmpz(env, args[8], modulus))
        goto cleanup;
    if (fmpz_cmp_ui(modulus, 3) <= 0 || !fmpz_is_probabprime(modulus))
    {
        napi_throw_range_error(env, NULL,
            "modulus must be a prime greater than three");
        goto cleanup;
    }
    if (fmpz_sgn(scalar) < 0)
    {
        napi_throw_range_error(env, NULL,
            "scalar must be nonnegative");
        goto cleanup;
    }
    fmpz_mod(a1, a1, modulus); fmpz_mod(a2, a2, modulus);
    fmpz_mod(a3, a3, modulus); fmpz_mod(a4, a4, modulus);
    fmpz_mod(a6, a6, modulus);
    fmpz_mod(affine_long_x, affine_long_x, modulus);
    fmpz_mod(affine_long_y, affine_long_y, modulus);
    if (fmpz_is_zero(scalar))
    {
        check_napi(env, napi_create_array_with_length(env, 0, &result));
        goto cleanup;
    }

    /* b2, b4 and c4 for the move to short Weierstrass form. */
    elliptic_mod_square(b2, a1, modulus);
    elliptic_mod_mul_ui(temporary, a2, 4, modulus);
    elliptic_mod_add(b2, b2, temporary, modulus);
    elliptic_mod_mul(b4, a1, a3, modulus);
    elliptic_mod_mul_ui(temporary, a4, 2, modulus);
    elliptic_mod_add(b4, b4, temporary, modulus);
    elliptic_mod_square(c4, b2, modulus);
    elliptic_mod_mul_ui(temporary, b4, 24, modulus);
    elliptic_mod_sub(c4, c4, temporary, modulus);
    fmpz_set_ui(temporary, 48);
    if (!fmpz_invmod(inverse, temporary, modulus))
    {
        napi_throw_error(env, NULL, "48 is not invertible modulo p");
        goto cleanup;
    }
    fmpz_neg(short_a, c4);
    elliptic_mod_mul(short_a, short_a, inverse, modulus);

    fmpz_set_ui(temporary, 12);
    fmpz_invmod(inverse, temporary, modulus);
    elliptic_mod_mul(temporary, b2, inverse, modulus);
    elliptic_mod_add(affine_x, affine_long_x, temporary, modulus);
    fmpz_set_ui(temporary, 2);
    fmpz_invmod(inverse, temporary, modulus);
    elliptic_mod_mul(temporary, a1, affine_long_x, modulus);
    elliptic_mod_add(temporary, temporary, a3, modulus);
    elliptic_mod_mul(temporary, temporary, inverse, modulus);
    elliptic_mod_add(affine_y, affine_long_y, temporary, modulus);

    fmpz_set(x, affine_x);
    fmpz_set(y, affine_y);
    fmpz_one(z);
    for (bit = (slong) fmpz_bits(scalar) - 2; bit >= 0; bit--)
    {
        elliptic_jacobian_double(x, y, z, short_a, modulus, scratch);
        if (fmpz_tstbit(scalar, (ulong) bit))
            elliptic_jacobian_mixed_add(
                x, y, z, affine_x, affine_y,
                short_a, modulus, scratch);
    }
    if (fmpz_is_zero(z))
    {
        check_napi(env, napi_create_array_with_length(env, 0, &result));
        goto cleanup;
    }

    fmpz_invmod(inverse, z, modulus);
    elliptic_mod_square(temporary, inverse, modulus);
    elliptic_mod_mul(x, x, temporary, modulus);
    elliptic_mod_mul(temporary, temporary, inverse, modulus);
    elliptic_mod_mul(y, y, temporary, modulus);
    fmpz_set_ui(temporary, 12);
    fmpz_invmod(inverse, temporary, modulus);
    elliptic_mod_mul(temporary, b2, inverse, modulus);
    elliptic_mod_sub(x, x, temporary, modulus);
    fmpz_set_ui(temporary, 2);
    fmpz_invmod(inverse, temporary, modulus);
    elliptic_mod_mul(temporary, a1, x, modulus);
    elliptic_mod_add(temporary, temporary, a3, modulus);
    elliptic_mod_mul(temporary, temporary, inverse, modulus);
    elliptic_mod_sub(y, y, temporary, modulus);

    if (!check_napi(env, napi_create_array_with_length(env, 2, &result)))
    {
        result = NULL;
        goto cleanup;
    }
    coordinate = fmpz_to_bigint(env, x);
    if (coordinate == NULL ||
        !check_napi(env, napi_set_element(env, result, 0, coordinate)))
    {
        result = NULL;
        goto cleanup;
    }
    coordinate = fmpz_to_bigint(env, y);
    if (coordinate == NULL ||
        !check_napi(env, napi_set_element(env, result, 1, coordinate)))
        result = NULL;

cleanup:
    for (index = 0; index < 12; index++)
        fmpz_clear(scratch[index]);
    fmpz_clear(a1); fmpz_clear(a2); fmpz_clear(a3); fmpz_clear(a4);
    fmpz_clear(a6); fmpz_clear(affine_long_x); fmpz_clear(affine_long_y);
    fmpz_clear(scalar); fmpz_clear(modulus); fmpz_clear(b2); fmpz_clear(b4);
    fmpz_clear(c4); fmpz_clear(short_a); fmpz_clear(affine_x);
    fmpz_clear(affine_y); fmpz_clear(x); fmpz_clear(y); fmpz_clear(z);
    fmpz_clear(inverse); fmpz_clear(temporary);
    return result;
}

typedef struct
{
    fmpq_t x;
    fmpq_t y;
    int infinity;
} elliptic_rational_point;

static void elliptic_rational_point_init(elliptic_rational_point *point)
{
    fmpq_init(point->x);
    fmpq_init(point->y);
    point->infinity = 1;
}

static void elliptic_rational_point_clear(elliptic_rational_point *point)
{
    fmpq_clear(point->x);
    fmpq_clear(point->y);
}

static void elliptic_rational_point_set(
    elliptic_rational_point *result,
    const elliptic_rational_point *source)
{
    result->infinity = source->infinity;
    if (!source->infinity)
    {
        fmpq_set(result->x, source->x);
        fmpq_set(result->y, source->y);
    }
}

static void elliptic_rational_add(
    elliptic_rational_point *result,
    const elliptic_rational_point *left,
    const elliptic_rational_point *right,
    const fmpq_t a1, const fmpq_t a2, const fmpq_t a3,
    const fmpq_t a4, const fmpq_t a6,
    fmpq_t scratch[10])
{
    (void) a6;
    if (left->infinity)
    {
        elliptic_rational_point_set(result, right);
        return;
    }
    if (right->infinity)
    {
        elliptic_rational_point_set(result, left);
        return;
    }

    if (fmpq_equal(left->x, right->x))
    {
        /* Detect inverse points before the tangent calculation. */
        fmpq_add(scratch[0], left->y, right->y);
        fmpq_mul(scratch[1], a1, left->x);
        fmpq_add(scratch[0], scratch[0], scratch[1]);
        fmpq_add(scratch[0], scratch[0], a3);
        if (fmpq_is_zero(scratch[0]))
        {
            result->infinity = 1;
            return;
        }

        /* denominator = 2*y + a1*x + a3 */
        fmpq_add(scratch[0], left->y, left->y);
        fmpq_mul(scratch[1], a1, left->x);
        fmpq_add(scratch[0], scratch[0], scratch[1]);
        fmpq_add(scratch[0], scratch[0], a3);
        if (fmpq_is_zero(scratch[0]))
        {
            result->infinity = 1;
            return;
        }

        /* numerator = 3*x^2 + 2*a2*x + a4 - a1*y */
        fmpq_mul(scratch[1], left->x, left->x);
        fmpq_add(scratch[2], scratch[1], scratch[1]);
        fmpq_add(scratch[2], scratch[2], scratch[1]);
        fmpq_mul(scratch[3], a2, left->x);
        fmpq_add(scratch[3], scratch[3], scratch[3]);
        fmpq_add(scratch[2], scratch[2], scratch[3]);
        fmpq_add(scratch[2], scratch[2], a4);
        fmpq_mul(scratch[3], a1, left->y);
        fmpq_sub(scratch[2], scratch[2], scratch[3]);
        fmpq_div(scratch[4], scratch[2], scratch[0]);

    }
    else
    {
        fmpq_sub(scratch[0], right->x, left->x);
        fmpq_sub(scratch[1], right->y, left->y);
        fmpq_div(scratch[4], scratch[1], scratch[0]);
    }

    /* x3 = -x1 - x2 - a2 + slope*(slope + a1) */
    fmpq_add(scratch[6], scratch[4], a1);
    fmpq_mul(scratch[6], scratch[4], scratch[6]);
    fmpq_sub(scratch[6], scratch[6], a2);
    fmpq_sub(scratch[6], scratch[6], left->x);
    fmpq_sub(scratch[6], scratch[6], right->x);

    /* y3 = -y1 - a3 - a1*x3 + slope*(x1 - x3) */
    fmpq_sub(scratch[7], left->x, scratch[6]);
    fmpq_mul(scratch[7], scratch[4], scratch[7]);
    fmpq_sub(scratch[7], scratch[7], left->y);
    fmpq_sub(scratch[7], scratch[7], a3);
    fmpq_mul(scratch[8], a1, scratch[6]);
    fmpq_sub(scratch[7], scratch[7], scratch[8]);
    fmpq_set(result->x, scratch[6]);
    fmpq_set(result->y, scratch[7]);
    result->infinity = 0;
}

static int bigint_pair_to_fmpq(
    napi_env env, napi_value numerator, napi_value denominator,
    fmpq_t result)
{
    if (!bigint_to_fmpz(env, numerator, fmpq_numref(result)) ||
        !bigint_to_fmpz(env, denominator, fmpq_denref(result)))
        return 0;
    if (fmpz_is_zero(fmpq_denref(result)))
    {
        napi_throw_range_error(env, NULL,
            "rational denominator must be nonzero");
        return 0;
    }
    fmpq_canonicalise(result);
    return 1;
}

static napi_value elliptic_scalar_mul_rational(
    napi_env env, napi_callback_info info)
{
    napi_value args[15];
    napi_value result = NULL;
    napi_value value;
    fmpq_t coefficients[5];
    fmpq_t scratch[10];
    fmpz_t scalar;
    elliptic_rational_point input, answer, summand;
    slong index;
    slong bit;

    for (index = 0; index < 5; index++)
        fmpq_init(coefficients[index]);
    for (index = 0; index < 10; index++)
        fmpq_init(scratch[index]);
    fmpz_init(scalar);
    elliptic_rational_point_init(&input);
    elliptic_rational_point_init(&answer);
    elliptic_rational_point_init(&summand);

    if (!require_arguments(env, info, 15, args))
        goto cleanup;
    for (index = 0; index < 5; index++)
    {
        if (!bigint_pair_to_fmpq(
                env, args[2 * index], args[2 * index + 1],
                coefficients[index]))
            goto cleanup;
    }
    if (!bigint_pair_to_fmpq(env, args[10], args[11], input.x) ||
        !bigint_pair_to_fmpq(env, args[12], args[13], input.y) ||
        !bigint_to_fmpz(env, args[14], scalar))
        goto cleanup;
    if (fmpz_sgn(scalar) < 0)
    {
        napi_throw_range_error(env, NULL,
            "scalar must be nonnegative");
        goto cleanup;
    }
    input.infinity = 0;
    elliptic_rational_point_set(&summand, &input);
    for (bit = 0; bit < (slong) fmpz_bits(scalar); bit++)
    {
        if (fmpz_tstbit(scalar, (ulong) bit))
            elliptic_rational_add(
                &answer, &answer, &summand,
                coefficients[0], coefficients[1], coefficients[2],
                coefficients[3], coefficients[4], scratch);
        if (bit + 1 < (slong) fmpz_bits(scalar))
            elliptic_rational_add(
                &summand, &summand, &summand,
                coefficients[0], coefficients[1], coefficients[2],
                coefficients[3], coefficients[4], scratch);
    }
    if (answer.infinity)
    {
        check_napi(env, napi_create_array_with_length(env, 0, &result));
        goto cleanup;
    }
    if (!check_napi(env, napi_create_array_with_length(env, 4, &result)))
    {
        result = NULL;
        goto cleanup;
    }
    value = fmpz_to_bigint(env, fmpq_numref(answer.x));
    if (value == NULL ||
        !check_napi(env, napi_set_element(env, result, 0, value)))
    {
        result = NULL;
        goto cleanup;
    }
    value = fmpz_to_bigint(env, fmpq_denref(answer.x));
    if (value == NULL ||
        !check_napi(env, napi_set_element(env, result, 1, value)))
    {
        result = NULL;
        goto cleanup;
    }
    value = fmpz_to_bigint(env, fmpq_numref(answer.y));
    if (value == NULL ||
        !check_napi(env, napi_set_element(env, result, 2, value)))
    {
        result = NULL;
        goto cleanup;
    }
    value = fmpz_to_bigint(env, fmpq_denref(answer.y));
    if (value == NULL ||
        !check_napi(env, napi_set_element(env, result, 3, value)))
        result = NULL;

cleanup:
    elliptic_rational_point_clear(&input);
    elliptic_rational_point_clear(&answer);
    elliptic_rational_point_clear(&summand);
    fmpz_clear(scalar);
    for (index = 0; index < 10; index++)
        fmpq_clear(scratch[index]);
    for (index = 0; index < 5; index++)
        fmpq_clear(coefficients[index]);
    return result;
}

static slong elliptic_ap_integral(
    fmpz_t coefficients[5],
    ulong prime,
    unsigned char *quadratic_residues)
{
    ulong a1 = fmpz_fdiv_ui(coefficients[0], prime);
    ulong a2 = fmpz_fdiv_ui(coefficients[1], prime);
    ulong a3 = fmpz_fdiv_ui(coefficients[2], prime);
    ulong a4 = fmpz_fdiv_ui(coefficients[3], prime);
    ulong a6 = fmpz_fdiv_ui(coefficients[4], prime);
    ulong x, y, points = 1;

    if (prime == 2)
    {
        for (x = 0; x < prime; x++)
        {
            for (y = 0; y < prime; y++)
            {
                ulong left = (
                    mul_mod_word(y, y, prime)
                    + mul_mod_word(a1, mul_mod_word(x, y, prime), prime)
                    + mul_mod_word(a3, y, prime)
                ) % prime;
                ulong right = (
                    mul_mod_word(mul_mod_word(x, x, prime), x, prime)
                    + mul_mod_word(a2, mul_mod_word(x, x, prime), prime)
                    + mul_mod_word(a4, x, prime) + a6
                ) % prime;
                if (left == right) points++;
            }
        }
        return (slong) prime + 1 - (slong) points;
    }

    memset(quadratic_residues, 0, prime);
    for (y = 1; y < prime; y++)
        quadratic_residues[mul_mod_word(y, y, prime)] = 1;
    for (x = 0; x < prime; x++)
    {
        ulong x2 = mul_mod_word(x, x, prime);
        ulong right = (
            mul_mod_word(x2, x, prime)
            + mul_mod_word(a2, x2, prime)
            + mul_mod_word(a4, x, prime) + a6
        ) % prime;
        ulong linear = (mul_mod_word(a1, x, prime) + a3) % prime;
        ulong discriminant = (
            mul_mod_word(linear, linear, prime) + 4 * right
        ) % prime;
        if (discriminant == 0)
            points++;
        else if (quadratic_residues[discriminant])
            points += 2;
    }
    return (slong) prime + 1 - (slong) points;
}

typedef struct
{
    int64_t *ap_values;
    unsigned char *available;
    ulong bound;
    int failed;
} elliptic_smalljac_result;

#ifdef SAGEJS_HAVE_SMALLJAC
/* ffpoly deliberately uses one global finite-field context. */
static pthread_mutex_t elliptic_smalljac_mutex = PTHREAD_MUTEX_INITIALIZER;

#ifdef _WIN32
typedef uint64_t sagejs_smalljac_prime_t;
typedef int64_t sagejs_smalljac_coefficient_t;
typedef int64_t sagejs_smalljac_status_t;
#else
typedef unsigned long sagejs_smalljac_prime_t;
typedef long sagejs_smalljac_coefficient_t;
typedef long sagejs_smalljac_status_t;
#endif

static int elliptic_smalljac_callback(
    smalljac_curve_t curve,
    sagejs_smalljac_prime_t prime,
    int good,
    sagejs_smalljac_coefficient_t coefficients[],
    int count,
    void *argument)
{
    elliptic_smalljac_result *result = argument;
    (void) curve;

    if (prime > (uint64_t) result->bound || prime > (uint64_t) SIZE_MAX)
    {
        result->failed = 1;
        return 0;
    }
    if (!good || coefficients == NULL || count < 1)
        return 1;
    /* smalljac returns the T coefficient of 1 - a_p*T + p*T^2. */
    result->ap_values[(size_t) prime] = -(int64_t) coefficients[0];
    result->available[(size_t) prime] = 1;
    return 1;
}

static char *elliptic_smalljac_curve_string(fmpz_t coefficients[5])
{
    size_t length = 8;
    char *text, *cursor;

    for (int index = 0; index < 5; index++)
        length += (size_t) fmpz_sizeinbase(coefficients[index], 10) + 2;
    text = malloc(length);
    if (text == NULL)
        return NULL;

    cursor = text;
    *cursor++ = '[';
    for (int index = 0; index < 5; index++)
    {
        if (index != 0)
            *cursor++ = ',';
        fmpz_get_str(cursor, 10, coefficients[index]);
        cursor += strlen(cursor);
    }
    *cursor++ = ']';
    *cursor = '\0';
    return text;
}

static int elliptic_smalljac_ap_values(
    fmpz_t coefficients[5],
    ulong bound,
    int64_t *ap_values,
    unsigned char *available)
{
    char *curve_text;
    smalljac_curve_t curve;
    elliptic_smalljac_result result;
    sagejs_smalljac_status_t status;
    int error = 0;

    if (bound < 2)
        return 1;
    curve_text = elliptic_smalljac_curve_string(coefficients);
    if (curve_text == NULL)
        return 0;
    pthread_mutex_lock(&elliptic_smalljac_mutex);
    curve = smalljac_curve_init(curve_text, &error);
    free(curve_text);
    if (curve == NULL || error != 0)
    {
        pthread_mutex_unlock(&elliptic_smalljac_mutex);
        return 0;
    }

    result.ap_values = ap_values;
    result.available = available;
    result.bound = bound;
    result.failed = 0;
    status = smalljac_Lpolys(
        curve,
        2,
        bound,
        SMALLJAC_A1_ONLY,
        elliptic_smalljac_callback,
        &result);
    smalljac_curve_clear(curve);
    pthread_mutex_unlock(&elliptic_smalljac_mutex);
    return status >= 0 && !result.failed;
}

typedef struct
{
    ulong prime;
    int64_t value;
    int found;
} elliptic_smalljac_single_result;

static int elliptic_smalljac_single_callback(
    smalljac_curve_t curve,
    sagejs_smalljac_prime_t prime,
    int good,
    sagejs_smalljac_coefficient_t coefficients[],
    int count,
    void *argument)
{
    elliptic_smalljac_single_result *result = argument;
    (void) curve;

    if (prime != (uint64_t) result->prime || !good ||
        coefficients == NULL || count < 1)
        return 0;
    result->value = -(int64_t) coefficients[0];
    result->found = 1;
    return 1;
}

static int elliptic_smalljac_single_ap(
    fmpz_t coefficients[5], ulong prime, int64_t *value)
{
    char *curve_text;
    smalljac_curve_t curve;
    elliptic_smalljac_single_result result;
    sagejs_smalljac_status_t status;
    int error = 0;

    curve_text = elliptic_smalljac_curve_string(coefficients);
    if (curve_text == NULL)
        return 0;
    pthread_mutex_lock(&elliptic_smalljac_mutex);
    curve = smalljac_curve_init(curve_text, &error);
    free(curve_text);
    if (curve == NULL || error != 0)
    {
        pthread_mutex_unlock(&elliptic_smalljac_mutex);
        return 0;
    }

    result.prime = prime;
    result.value = 0;
    result.found = 0;
    status = smalljac_Lpolys(
        curve,
        prime,
        prime,
        SMALLJAC_A1_ONLY,
        elliptic_smalljac_single_callback,
        &result);
    smalljac_curve_clear(curve);
    pthread_mutex_unlock(&elliptic_smalljac_mutex);
    if (status < 0 || !result.found)
        return 0;
    *value = result.value;
    return 1;
}
#else
static int elliptic_smalljac_ap_values(
    fmpz_t coefficients[5],
    ulong bound,
    int64_t *ap_values,
    unsigned char *available)
{
    (void) coefficients;
    (void) bound;
    (void) ap_values;
    (void) available;
    return 0;
}

static int elliptic_smalljac_single_ap(
    fmpz_t coefficients[5], ulong prime, int64_t *value)
{
    (void) coefficients;
    (void) prime;
    (void) value;
    return 0;
}
#endif

static long online_processor_count(void)
{
#ifdef _WIN32
    DWORD count = GetActiveProcessorCount(ALL_PROCESSOR_GROUPS);
    return count == 0 ? 1 : (long) count;
#else
    return sysconf(_SC_NPROCESSORS_ONLN);
#endif
}

typedef struct
{
    fmpz_t *coefficients;
    const ulong *primes;
    size_t prime_count;
    int64_t *ap_values;
    ulong bound;
    atomic_size_t next;
} elliptic_ap_work;

static void *elliptic_ap_worker(void *argument)
{
    elliptic_ap_work *work = (elliptic_ap_work *) argument;
    unsigned char *quadratic_residues = malloc(work->bound + 1);
    size_t index;
    if (quadratic_residues == NULL)
        return (void *) 1;
    while ((index = atomic_fetch_add(&work->next, 1)) < work->prime_count)
    {
        ulong prime = work->primes[index];
        work->ap_values[prime] = elliptic_ap_integral(
            work->coefficients, prime, quadratic_residues);
    }
    free(quadratic_residues);
    return NULL;
}

static napi_value elliptic_anlist_integral(
    napi_env env, napi_callback_info info)
{
    napi_value args[7], result, array_buffer;
    fmpz_t coefficients[5], discriminant;
    ulong bound, candidate, multiple, index;
    ulong *smallest, *primes;
    unsigned char *available;
    int64_t *values, *ap_values;
    size_t prime_count = 0, prime_index = 0;
    int initialized = 0;

    if (!require_arguments(env, info, 7, args))
        return NULL;
    for (int i = 0; i < 5; i++)
    {
        fmpz_init(coefficients[i]);
        initialized++;
        if (!bigint_to_fmpz(env, args[i], coefficients[i]))
            goto fail_before_alloc;
    }
    fmpz_init(discriminant);
    initialized++;
    if (!bigint_to_fmpz(env, args[5], discriminant) ||
        !bigint_to_ulong(env, args[6], &bound))
        goto fail_before_alloc;
    if (bound >= UINT32_MAX)
    {
        napi_throw_range_error(env, NULL, "coefficient bound is too large");
        goto fail_before_alloc;
    }

    smallest = calloc(bound + 1, sizeof(*smallest));
    values = calloc(bound + 1, sizeof(*values));
    ap_values = calloc(bound + 1, sizeof(*ap_values));
    available = calloc(bound + 1, sizeof(*available));
    primes = malloc((bound + 1) * sizeof(*primes));
    if (smallest == NULL || values == NULL || ap_values == NULL ||
        available == NULL || primes == NULL)
    {
        free(smallest); free(values); free(ap_values);
        free(available); free(primes);
        napi_throw_error(env, NULL, "unable to allocate elliptic coefficients");
        goto fail_before_alloc;
    }

    if (bound >= 1) values[1] = 1;
    for (candidate = 2; candidate <= bound; candidate++)
    {
        if (smallest[candidate] == 0)
        {
            smallest[candidate] = candidate;
            if (candidate <= bound / candidate)
            {
                for (multiple = candidate * candidate;
                    multiple <= bound; multiple += candidate)
                {
                    if (smallest[multiple] == 0)
                        smallest[multiple] = candidate;
                }
            }
        }
    }
    for (candidate = 2; candidate <= bound; candidate++)
    {
        if (smallest[candidate] == candidate)
            primes[prime_count++] = candidate;
    }
    if (prime_count > 0)
    {
        size_t missing_count = 0;
        elliptic_smalljac_ap_values(
            coefficients, bound, ap_values, available);
        for (prime_index = 0; prime_index < prime_count; prime_index++)
        {
            ulong prime = primes[prime_index];
            if (!available[prime])
                primes[missing_count++] = prime;
        }
        prime_count = missing_count;
    }
    if (prime_count > 0)
    {
        long processor_count = online_processor_count();
        size_t worker_count = (
            bound < 1000 ? 1
            : processor_count < 1 ? 1
            : processor_count > 8 ? 8
            : (size_t) processor_count
        );
        pthread_t *workers = malloc(worker_count * sizeof(*workers));
        elliptic_ap_work work;
        int worker_error = 0;
        if (workers == NULL)
        {
            napi_throw_error(env, NULL, "unable to allocate elliptic workers");
            goto fail_after_alloc;
        }
        work.coefficients = coefficients;
        work.primes = primes;
        work.prime_count = prime_count;
        work.ap_values = ap_values;
        work.bound = bound;
        atomic_init(&work.next, 0);
        for (prime_index = 0; prime_index < worker_count; prime_index++)
        {
            if (pthread_create(
                    &workers[prime_index], NULL,
                    elliptic_ap_worker, &work) != 0)
            {
                worker_error = 1;
                break;
            }
        }
        for (size_t joined = 0; joined < prime_index; joined++)
        {
            void *worker_result = NULL;
            pthread_join(workers[joined], &worker_result);
            if (worker_result != NULL) worker_error = 1;
        }
        free(workers);
        if (worker_error)
        {
            napi_throw_error(env, NULL, "elliptic coefficient worker failed");
            goto fail_after_alloc;
        }
    }
    for (index = 2; index <= bound; index++)
    {
        ulong prime = smallest[index];
        ulong rest = index;
        ulong exponent = 0, power;
        int64_t previous = 1, current, prime_power_value = 1;
        while (rest % prime == 0)
        {
            rest /= prime;
            exponent++;
        }
        current = ap_values[prime];
        for (power = 1; power <= exponent; power++)
        {
            if (power == 1)
                prime_power_value = current;
            else if (fmpz_fdiv_ui(discriminant, prime) == 0)
                prime_power_value *= ap_values[prime];
            else
            {
                int64_t next = (
                    ap_values[prime] * current
                    - (int64_t) prime * previous
                );
                previous = current;
                current = next;
                prime_power_value = current;
            }
        }
        values[index] = values[rest] * prime_power_value;
    }

    void *packed_data = NULL;
    if (!check_napi(env, napi_create_arraybuffer(
            env, ((size_t) bound + 1) * sizeof(int32_t),
            &packed_data, &array_buffer)))
        goto fail_after_alloc;
    int32_t *packed_values = (int32_t *) packed_data;
    for (index = 0; index <= bound; index++)
    {
        if (values[index] < INT32_MIN || values[index] > INT32_MAX)
        {
            napi_throw_range_error(env, NULL,
                "elliptic coefficient exceeds packed signed storage");
            goto fail_after_alloc;
        }
        packed_values[index] = (int32_t) values[index];
    }
    if (!check_napi(env, napi_create_typedarray(
            env, napi_int32_array, (size_t) bound + 1, array_buffer, 0,
            &result)))
        goto fail_after_alloc;
    free(smallest); free(values); free(ap_values);
    free(available); free(primes);
    for (int i = 0; i < initialized; i++)
    {
        if (i < 5) fmpz_clear(coefficients[i]);
        else fmpz_clear(discriminant);
    }
    return result;

fail_after_alloc:
    free(smallest); free(values); free(ap_values);
    free(available); free(primes);
fail_before_alloc:
    for (int i = 0; i < initialized; i++)
    {
        if (i < 5) fmpz_clear(coefficients[i]);
        else fmpz_clear(discriminant);
    }
    return NULL;
}

static napi_value elliptic_ap_smalljac_integral(
    napi_env env, napi_callback_info info)
{
    napi_value args[6], result;
    fmpz_t coefficients[5];
    ulong prime;
    int64_t value;
    int initialized = 0;

    if (!require_arguments(env, info, 6, args))
        return NULL;
    for (int index = 0; index < 5; index++)
    {
        fmpz_init(coefficients[index]);
        initialized++;
        if (!bigint_to_fmpz(env, args[index], coefficients[index]))
            goto fail;
    }
    if (!bigint_to_prime_modulus(env, args[5], &prime))
        goto fail;
    if (!elliptic_smalljac_single_ap(coefficients, prime, &value))
    {
        unsigned char *quadratic_residues;
        if (prime == UWORD_MAX ||
            (quadratic_residues = malloc((size_t) prime + 1)) == NULL)
        {
            napi_throw_error(env, NULL,
                "unable to allocate the elliptic trace fallback");
            goto fail;
        }
        value = elliptic_ap_integral(
            coefficients, prime, quadratic_residues);
        free(quadratic_residues);
    }
    if (!check_napi(env, napi_create_int64(env, value, &result)))
        goto fail;
    for (int index = 0; index < initialized; index++)
        fmpz_clear(coefficients[index]);
    return result;

fail:
    for (int index = 0; index < initialized; index++)
        fmpz_clear(coefficients[index]);
    return NULL;
}

typedef enum
{
    SAGEJS_POLY_ZZ = 1,
    SAGEJS_POLY_QQ = 2,
    SAGEJS_POLY_NMOD = 3
} sagejs_poly_kind;

typedef struct
{
    uint64_t magic;
    sagejs_poly_kind kind;
    fmpz_poly_t integer;
    fmpq_poly_t rational;
    nmod_poly_t modular;
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
    else if (poly->kind == SAGEJS_POLY_NMOD)
        nmod_poly_clear(poly->modular);
    poly->magic = 0;
    free(poly);
}

static napi_value create_poly(
    napi_env env,
    sagejs_poly_kind kind,
    ulong modulus)
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
    else if (kind == SAGEJS_POLY_QQ)
        fmpq_poly_init(poly->rational);
    else if (kind == SAGEJS_POLY_NMOD)
        nmod_poly_init(poly->modular, modulus);
    else
    {
        free(poly);
        napi_throw_error(env, NULL, "unknown polynomial base ring");
        return NULL;
    }

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
    if (*right == NULL)
        return NULL;
    if (left->kind == SAGEJS_POLY_NMOD &&
        left->modular->mod.n != (*right)->modular->mod.n)
    {
        napi_throw_type_error(env, NULL,
            "polynomials have different finite fields");
        return NULL;
    }
    return left;
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
    result = create_poly(env, SAGEJS_POLY_ZZ, 0);
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
    result = create_poly(env, SAGEJS_POLY_QQ, 0);
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
    result = create_poly(env, SAGEJS_POLY_ZZ, 0);
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
    result = create_poly(env, SAGEJS_POLY_QQ, 0);
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
    result = create_poly(env, SAGEJS_POLY_QQ, 0);
    if (result == NULL)
        return NULL;
    target = unwrap_poly(env, result, SAGEJS_POLY_QQ);
    if (target == NULL)
        return NULL;
    fmpq_poly_set_fmpz_poly(target->rational, source->integer);
    return result;
}

static napi_value word_is_prime(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    ulong value;

    if (!require_arguments(env, info, 1, args) ||
        !bigint_to_ulong(env, args[0], &value))
        return NULL;
    if (!check_napi(env, napi_get_boolean(env, n_is_prime(value), &result)))
        return NULL;
    return result;
}

static napi_value is_prime(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    fmpz_t value;
    int prime;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    fmpz_init(value);
    if (!bigint_to_fmpz(env, args[0], value))
    {
        fmpz_clear(value);
        return NULL;
    }
    prime = fmpz_is_prime(value);
    fmpz_clear(value);
    if (!check_napi(env, napi_get_boolean(env, prime, &result)))
        return NULL;
    return result;
}

static napi_value next_prime(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    fmpz_t value;
    fmpz_t answer;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    fmpz_init(value);
    fmpz_init(answer);
    if (!bigint_to_fmpz(env, args[0], value))
    {
        fmpz_clear(value);
        fmpz_clear(answer);
        return NULL;
    }
    fmpz_nextprime(answer, value, 1);
    result = fmpz_to_bigint(env, answer);
    fmpz_clear(value);
    fmpz_clear(answer);
    return result;
}

static napi_value prime_pi_count(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    ulong value;
    uint64_t count;

    if (!require_arguments(env, info, 1, args) ||
        !bigint_to_ulong(env, args[0], &value))
        return NULL;
    if ((uint64_t) value > INT64_MAX)
    {
        napi_throw_range_error(
            env, NULL, "prime_pi requires an integer below 2^63");
        return NULL;
    }
    if (!sagejs_prime_pi((uint64_t) value, &count))
    {
        napi_throw_error(
            env, NULL, "unable to allocate prime-counting tables");
        return NULL;
    }
    if (!check_napi(env, napi_create_bigint_uint64(env, count, &result)))
        return NULL;
    return result;
}

static napi_value word_primitive_root_prime(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    ulong value;
    ulong root;

    if (!require_arguments(env, info, 1, args) ||
        !bigint_to_prime_modulus(env, args[0], &value))
        return NULL;
    root = n_primitive_root_prime(value);
    if (!check_napi(env, napi_create_bigint_uint64(env, root, &result)))
        return NULL;
    return result;
}

static napi_value nmod_poly_constant(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_poly *poly;
    fmpz_t value;
    ulong modulus;
    ulong residue;

    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_prime_modulus(env, args[1], &modulus))
        return NULL;
    fmpz_init(value);
    if (!bigint_to_fmpz(env, args[0], value))
    {
        fmpz_clear(value);
        return NULL;
    }
    residue = fmpz_fdiv_ui(value, modulus);
    fmpz_clear(value);
    result = create_poly(env, SAGEJS_POLY_NMOD, modulus);
    if (result == NULL)
        return NULL;
    poly = unwrap_poly(env, result, SAGEJS_POLY_NMOD);
    if (poly == NULL)
        return NULL;
    nmod_poly_set_coeff_ui(poly->modular, 0, residue);
    return result;
}

static napi_value nmod_poly_gen_value(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_poly *poly;
    ulong modulus;

    if (!require_arguments(env, info, 1, args) ||
        !bigint_to_prime_modulus(env, args[0], &modulus))
        return NULL;
    result = create_poly(env, SAGEJS_POLY_NMOD, modulus);
    if (result == NULL)
        return NULL;
    poly = unwrap_poly(env, result, SAGEJS_POLY_NMOD);
    if (poly == NULL)
        return NULL;
    nmod_poly_set_coeff_ui(poly->modular, 1, 1);
    return result;
}

static napi_value zz_poly_to_nmod(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_poly *source;
    sagejs_poly *target;
    fmpz_t coefficient;
    ulong modulus;
    slong index;
    slong length;

    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_prime_modulus(env, args[1], &modulus))
        return NULL;
    source = unwrap_poly(env, args[0], SAGEJS_POLY_ZZ);
    if (source == NULL)
        return NULL;
    result = create_poly(env, SAGEJS_POLY_NMOD, modulus);
    if (result == NULL)
        return NULL;
    target = unwrap_poly(env, result, SAGEJS_POLY_NMOD);
    if (target == NULL)
        return NULL;

    fmpz_init(coefficient);
    length = fmpz_poly_length(source->integer);
    for (index = 0; index < length; index++)
    {
        fmpz_poly_get_coeff_fmpz(coefficient, source->integer, index);
        nmod_poly_set_coeff_ui(
            target->modular,
            index,
            fmpz_fdiv_ui(coefficient, modulus));
    }
    fmpz_clear(coefficient);
    return result;
}

static napi_value zmod_poly_constant(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_poly *poly;
    fmpz_t value;
    ulong modulus;
    ulong residue;

    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_modulus(env, args[1], &modulus))
        return NULL;
    fmpz_init(value);
    if (!bigint_to_fmpz(env, args[0], value))
    {
        fmpz_clear(value);
        return NULL;
    }
    residue = fmpz_fdiv_ui(value, modulus);
    fmpz_clear(value);
    result = create_poly(env, SAGEJS_POLY_NMOD, modulus);
    if (result == NULL)
        return NULL;
    poly = unwrap_poly(env, result, SAGEJS_POLY_NMOD);
    if (poly == NULL)
        return NULL;
    nmod_poly_set_coeff_ui(poly->modular, 0, residue);
    return result;
}

static napi_value zmod_poly_gen_value(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_poly *poly;
    ulong modulus;

    if (!require_arguments(env, info, 1, args) ||
        !bigint_to_modulus(env, args[0], &modulus))
        return NULL;
    result = create_poly(env, SAGEJS_POLY_NMOD, modulus);
    if (result == NULL)
        return NULL;
    poly = unwrap_poly(env, result, SAGEJS_POLY_NMOD);
    if (poly == NULL)
        return NULL;
    nmod_poly_set_coeff_ui(poly->modular, 1, 1);
    return result;
}

static napi_value zz_poly_to_zmod(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_poly *source;
    sagejs_poly *target;
    fmpz_t coefficient;
    ulong modulus;
    slong index;
    slong length;

    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_modulus(env, args[1], &modulus))
        return NULL;
    source = unwrap_poly(env, args[0], SAGEJS_POLY_ZZ);
    if (source == NULL)
        return NULL;
    result = create_poly(env, SAGEJS_POLY_NMOD, modulus);
    if (result == NULL)
        return NULL;
    target = unwrap_poly(env, result, SAGEJS_POLY_NMOD);
    if (target == NULL)
        return NULL;
    fmpz_init(coefficient);
    length = fmpz_poly_length(source->integer);
    for (index = 0; index < length; index++)
    {
        fmpz_poly_get_coeff_fmpz(coefficient, source->integer, index);
        nmod_poly_set_coeff_ui(
            target->modular,
            index,
            fmpz_fdiv_ui(coefficient, modulus));
    }
    fmpz_clear(coefficient);
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
    result = create_poly(
        env,
        left->kind,
        left->kind == SAGEJS_POLY_NMOD ? left->modular->mod.n : 0);
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
    else if (left->kind == SAGEJS_POLY_QQ)
    {
        if (operation == SAGEJS_POLY_ADD)
            fmpq_poly_add(answer->rational, left->rational, right->rational);
        else if (operation == SAGEJS_POLY_SUB)
            fmpq_poly_sub(answer->rational, left->rational, right->rational);
        else
            fmpq_poly_mul(answer->rational, left->rational, right->rational);
    }
    else
    {
        if (operation == SAGEJS_POLY_ADD)
            nmod_poly_add(answer->modular, left->modular, right->modular);
        else if (operation == SAGEJS_POLY_SUB)
            nmod_poly_sub(answer->modular, left->modular, right->modular);
        else
            nmod_poly_mul(answer->modular, left->modular, right->modular);
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
    result = create_poly(
        env,
        source->kind,
        source->kind == SAGEJS_POLY_NMOD ? source->modular->mod.n : 0);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, source->kind);
    if (answer == NULL)
        return NULL;
    if (source->kind == SAGEJS_POLY_ZZ)
        fmpz_poly_neg(answer->integer, source->integer);
    else if (source->kind == SAGEJS_POLY_QQ)
        fmpq_poly_neg(answer->rational, source->rational);
    else
        nmod_poly_neg(answer->modular, source->modular);
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
    result = create_poly(
        env,
        source->kind,
        source->kind == SAGEJS_POLY_NMOD ? source->modular->mod.n : 0);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, source->kind);
    if (answer == NULL)
        return NULL;
    if (source->kind == SAGEJS_POLY_ZZ)
        fmpz_poly_pow(answer->integer, source->integer, exponent);
    else if (source->kind == SAGEJS_POLY_QQ)
        fmpq_poly_pow(answer->rational, source->rational, exponent);
    else
        nmod_poly_pow(answer->modular, source->modular, exponent);
    return result;
}

static napi_value poly_truncate(napi_env env, napi_callback_info info)
{
    napi_value args[2], result;
    sagejs_poly *source, *answer;
    ulong precision;

    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_ulong(env, args[1], &precision))
        return NULL;
    source = unwrap_poly(env, args[0], 0);
    if (source == NULL)
        return NULL;
    result = create_poly(
        env, source->kind,
        source->kind == SAGEJS_POLY_NMOD ? source->modular->mod.n : 0);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, source->kind);
    if (answer == NULL)
        return NULL;
    if (source->kind == SAGEJS_POLY_ZZ)
    {
        fmpz_poly_set(answer->integer, source->integer);
        fmpz_poly_truncate(answer->integer, (slong) precision);
    }
    else if (source->kind == SAGEJS_POLY_QQ)
    {
        fmpq_poly_set(answer->rational, source->rational);
        fmpq_poly_truncate(answer->rational, (slong) precision);
    }
    else
        nmod_poly_set_trunc(
            answer->modular, source->modular, (slong) precision);
    return result;
}

static napi_value poly_inflate(napi_env env, napi_callback_info info)
{
    napi_value args[2], result;
    sagejs_poly *source, *answer;
    ulong factor;

    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_ulong(env, args[1], &factor))
        return NULL;
    if (factor == 0)
    {
        napi_throw_range_error(
            env, NULL, "polynomial inflation factor must be positive");
        return NULL;
    }
    source = unwrap_poly(env, args[0], 0);
    if (source == NULL)
        return NULL;
    result = create_poly(
        env, source->kind,
        source->kind == SAGEJS_POLY_NMOD ? source->modular->mod.n : 0);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, source->kind);
    if (answer == NULL)
        return NULL;
    if (source->kind == SAGEJS_POLY_ZZ)
        fmpz_poly_inflate(answer->integer, source->integer, factor);
    else if (source->kind == SAGEJS_POLY_QQ)
    {
        slong index;
        slong length = fmpq_poly_length(source->rational);
        fmpq_t coefficient;

        fmpq_init(coefficient);
        for (index = 0; index < length; index++)
        {
            fmpq_poly_get_coeff_fmpq(
                coefficient, source->rational, index);
            fmpq_poly_set_coeff_fmpq(
                answer->rational,
                index * (slong) factor,
                coefficient);
        }
        fmpq_clear(coefficient);
    }
    else
        nmod_poly_inflate(
            answer->modular, source->modular, (slong) factor);
    return result;
}

static napi_value poly_mullow(napi_env env, napi_callback_info info)
{
    napi_value args[3], result;
    sagejs_poly *left, *right, *answer;
    ulong precision;

    if (!require_arguments(env, info, 3, args) ||
        !bigint_to_ulong(env, args[2], &precision))
        return NULL;
    left = unwrap_same_kind(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    result = create_poly(
        env, left->kind,
        left->kind == SAGEJS_POLY_NMOD ? left->modular->mod.n : 0);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, left->kind);
    if (answer == NULL)
        return NULL;
    if (left->kind == SAGEJS_POLY_ZZ)
        fmpz_poly_mullow(
            answer->integer, left->integer, right->integer,
            (slong) precision);
    else if (left->kind == SAGEJS_POLY_QQ)
        fmpq_poly_mullow(
            answer->rational, left->rational, right->rational,
            (slong) precision);
    else
        nmod_poly_mullow(
            answer->modular, left->modular, right->modular,
            (slong) precision);
    return result;
}

static napi_value poly_pow_trunc(napi_env env, napi_callback_info info)
{
    napi_value args[3], result;
    sagejs_poly *source, *answer;
    ulong exponent, precision;

    if (!require_arguments(env, info, 3, args) ||
        !bigint_to_ulong(env, args[1], &exponent) ||
        !bigint_to_ulong(env, args[2], &precision))
        return NULL;
    source = unwrap_poly(env, args[0], 0);
    if (source == NULL)
        return NULL;
    result = create_poly(
        env, source->kind,
        source->kind == SAGEJS_POLY_NMOD ? source->modular->mod.n : 0);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, source->kind);
    if (answer == NULL)
        return NULL;
    if (source->kind == SAGEJS_POLY_ZZ)
        fmpz_poly_pow_trunc(
            answer->integer, source->integer, exponent, (slong) precision);
    else if (source->kind == SAGEJS_POLY_QQ)
        fmpq_poly_pow_trunc(
            answer->rational, source->rational, exponent, (slong) precision);
    else
        nmod_poly_pow_trunc(
            answer->modular, source->modular, exponent, (slong) precision);
    return result;
}

static napi_value poly_shift(
    napi_env env, napi_callback_info info, int left)
{
    napi_value args[2], result;
    sagejs_poly *source, *answer;
    ulong amount;

    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_ulong(env, args[1], &amount))
        return NULL;
    source = unwrap_poly(env, args[0], 0);
    if (source == NULL)
        return NULL;
    result = create_poly(
        env, source->kind,
        source->kind == SAGEJS_POLY_NMOD ? source->modular->mod.n : 0);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, source->kind);
    if (answer == NULL)
        return NULL;
    if (source->kind == SAGEJS_POLY_ZZ)
    {
        if (left)
            fmpz_poly_shift_left(answer->integer, source->integer, amount);
        else
            fmpz_poly_shift_right(answer->integer, source->integer, amount);
    }
    else if (source->kind == SAGEJS_POLY_QQ)
    {
        if (left)
            fmpq_poly_shift_left(answer->rational, source->rational, amount);
        else
            fmpq_poly_shift_right(answer->rational, source->rational, amount);
    }
    else
    {
        if (left)
            nmod_poly_shift_left(answer->modular, source->modular, amount);
        else
            nmod_poly_shift_right(answer->modular, source->modular, amount);
    }
    return result;
}

static napi_value poly_shift_left(napi_env env, napi_callback_info info)
{
    return poly_shift(env, info, 1);
}

static napi_value poly_shift_right(napi_env env, napi_callback_info info)
{
    return poly_shift(env, info, 0);
}

static napi_value poly_valuation(napi_env env, napi_callback_info info)
{
    napi_value args[1], result;
    sagejs_poly *poly;
    slong index, length;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    poly = unwrap_poly(env, args[0], 0);
    if (poly == NULL)
        return NULL;
    if (poly->kind == SAGEJS_POLY_ZZ)
        length = fmpz_poly_length(poly->integer);
    else if (poly->kind == SAGEJS_POLY_QQ)
        length = fmpq_poly_length(poly->rational);
    else
        length = nmod_poly_length(poly->modular);
    index = 0;
    while (index < length)
    {
        int nonzero;
        if (poly->kind == SAGEJS_POLY_ZZ)
            nonzero = !fmpz_is_zero(poly->integer->coeffs + index);
        else if (poly->kind == SAGEJS_POLY_QQ)
            nonzero = !fmpz_is_zero(poly->rational->coeffs + index);
        else
            nonzero = poly->modular->coeffs[index] != 0;
        if (nonzero)
            break;
        index++;
    }
    if (index == length)
        index = -1;
    if (!check_napi(env, napi_create_int64(env, index, &result)))
        return NULL;
    return result;
}

static napi_value poly_inv_series(napi_env env, napi_callback_info info)
{
    napi_value args[2], result;
    sagejs_poly *source, *answer;
    ulong precision;
    int invertible;

    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_ulong(env, args[1], &precision))
        return NULL;
    source = unwrap_poly(env, args[0], 0);
    if (source == NULL)
        return NULL;
    if (source->kind == SAGEJS_POLY_ZZ)
        invertible =
            fmpz_poly_length(source->integer) > 0 &&
            fmpz_is_pm1(source->integer->coeffs);
    else if (source->kind == SAGEJS_POLY_QQ)
        invertible =
            fmpq_poly_length(source->rational) > 0 &&
            !fmpz_is_zero(source->rational->coeffs);
    else
        invertible =
            nmod_poly_length(source->modular) > 0 &&
            n_gcd(
                source->modular->coeffs[0],
                source->modular->mod.n) == 1;
    if (!invertible)
    {
        napi_throw_range_error(
            env, NULL, "constant coefficient is not invertible");
        return NULL;
    }
    result = create_poly(
        env, source->kind,
        source->kind == SAGEJS_POLY_NMOD ? source->modular->mod.n : 0);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, source->kind);
    if (answer == NULL)
        return NULL;
    if (source->kind == SAGEJS_POLY_ZZ)
        fmpz_poly_inv_series(
            answer->integer, source->integer, (slong) precision);
    else if (source->kind == SAGEJS_POLY_QQ)
        fmpq_poly_inv_series(
            answer->rational, source->rational, (slong) precision);
    else
        nmod_poly_inv_series(
            answer->modular, source->modular, (slong) precision);
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
    if (left->kind == SAGEJS_POLY_ZZ)
        equal = fmpz_poly_equal(left->integer, right->integer);
    else if (left->kind == SAGEJS_POLY_QQ)
        equal = fmpq_poly_equal(left->rational, right->rational);
    else
        equal = nmod_poly_equal(left->modular, right->modular);
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
    if (poly->kind == SAGEJS_POLY_ZZ)
        pretty = fmpz_poly_get_str_pretty(poly->integer, variable);
    else if (poly->kind == SAGEJS_POLY_QQ)
        pretty = fmpq_poly_get_str_pretty(poly->rational, variable);
    else
        pretty = nmod_poly_get_str_pretty(poly->modular, variable);
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

static napi_value poly_coefficients(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    napi_value coefficient;
    napi_value numerator;
    napi_value denominator;
    sagejs_poly *poly;
    slong index;
    slong length;
    fmpz_t integer;
    fmpq_t rational;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    poly = unwrap_poly(env, args[0], 0);
    if (poly == NULL)
        return NULL;
    if (poly->kind == SAGEJS_POLY_ZZ)
        length = fmpz_poly_length(poly->integer);
    else if (poly->kind == SAGEJS_POLY_QQ)
        length = fmpq_poly_length(poly->rational);
    else
        length = nmod_poly_length(poly->modular);
    if (!check_napi(env,
        napi_create_array_with_length(env, (size_t) length, &result)))
        return NULL;

    fmpz_init(integer);
    fmpq_init(rational);
    for (index = 0; index < length; index++)
    {
        if (poly->kind == SAGEJS_POLY_ZZ)
        {
            fmpz_poly_get_coeff_fmpz(integer, poly->integer, index);
            coefficient = fmpz_to_bigint(env, integer);
        }
        else if (poly->kind == SAGEJS_POLY_QQ)
        {
            fmpq_poly_get_coeff_fmpq(rational, poly->rational, index);
            numerator = fmpz_to_bigint(env, fmpq_numref(rational));
            denominator = fmpz_to_bigint(env, fmpq_denref(rational));
            if (numerator == NULL || denominator == NULL ||
                !check_napi(env, napi_create_object(env, &coefficient)) ||
                !check_napi(env, napi_set_named_property(
                    env, coefficient, "numerator", numerator)) ||
                !check_napi(env, napi_set_named_property(
                    env, coefficient, "denominator", denominator)))
                coefficient = NULL;
        }
        else
        {
            if (!check_napi(env, napi_create_bigint_uint64(
                env,
                nmod_poly_get_coeff_ui(poly->modular, index),
                &coefficient)))
                coefficient = NULL;
        }
        if (coefficient == NULL ||
            !check_napi(env, napi_set_element(
                env, result, (uint32_t) index, coefficient)))
        {
            fmpz_clear(integer);
            fmpq_clear(rational);
            return NULL;
        }
    }
    fmpz_clear(integer);
    fmpq_clear(rational);
    return result;
}

/*
 * Return the level-one Eisenstein q-expansion as an fmpq polynomial.
 *
 * Computing all divisor sums with a sieve avoids one factorization per
 * coefficient.  Keeping the loop in C also prevents coefficient construction
 * from crossing the Node-API boundary O(precision) times.
 */
static napi_value qq_eisenstein_series(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[3];
    napi_value result;
    sagejs_poly *poly;
    ulong weight;
    ulong precision;
    napi_valuetype normalization_type;
    size_t normalization_length = 0;
    char *normalization = NULL;
    enum
    {
        EISENSTEIN_LINEAR,
        EISENSTEIN_CONSTANT,
        EISENSTEIN_INTEGRAL
    } mode;
    fmpz *sums = NULL;
    fmpz_t divisor_power;
    fmpq_t bernoulli;
    fmpq_t constant;
    fmpq_t scale;
    fmpq_t coefficient;
    ulong divisor;
    ulong multiple;

    if (!require_arguments(env, info, 3, args))
        return NULL;
    if (!number_to_ulong(env, args[0], &weight) ||
        !number_to_ulong(env, args[1], &precision))
        return NULL;
    if (weight == 0 || (weight & 1) != 0)
    {
        napi_throw_range_error(
            env, NULL, "weight must be a positive even integer");
        return NULL;
    }
    if (!check_napi(
        env, napi_typeof(env, args[2], &normalization_type)))
        return NULL;
    if (normalization_type != napi_string ||
        !check_napi(env, napi_get_value_string_utf8(
            env, args[2], NULL, 0, &normalization_length)))
    {
        if (normalization_type != napi_string)
            napi_throw_type_error(
                env, NULL, "normalization must be a string");
        return NULL;
    }
    normalization = malloc(normalization_length + 1);
    if (normalization == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate normalization");
        return NULL;
    }
    if (!check_napi(env, napi_get_value_string_utf8(
        env,
        args[2],
        normalization,
        normalization_length + 1,
        &normalization_length)))
    {
        free(normalization);
        return NULL;
    }
    if (strcmp(normalization, "linear") == 0)
        mode = EISENSTEIN_LINEAR;
    else if (strcmp(normalization, "constant") == 0)
        mode = EISENSTEIN_CONSTANT;
    else if (strcmp(normalization, "integral") == 0)
        mode = EISENSTEIN_INTEGRAL;
    else
    {
        free(normalization);
        napi_throw_range_error(
            env, NULL,
            "normalization must be 'linear', 'constant', or 'integral'");
        return NULL;
    }
    free(normalization);

    result = create_poly(env, SAGEJS_POLY_QQ, 0);
    if (result == NULL)
        return NULL;
    poly = unwrap_poly(env, result, SAGEJS_POLY_QQ);
    if (poly == NULL || precision == 0)
        return poly == NULL ? NULL : result;

    fmpz_init(divisor_power);
    fmpq_init(bernoulli);
    fmpq_init(constant);
    fmpq_init(scale);
    fmpq_init(coefficient);

    arith_bernoulli_number(bernoulli, weight);
    fmpq_set(constant, bernoulli);
    fmpz_set_ui(divisor_power, weight);
    fmpz_mul_ui(divisor_power, divisor_power, 2);
    fmpq_div_fmpz(constant, constant, divisor_power);
    fmpq_neg(constant, constant);

    if (mode == EISENSTEIN_LINEAR)
    {
        fmpq_one(scale);
        fmpq_poly_set_coeff_fmpq(poly->rational, 0, constant);
    }
    else if (mode == EISENSTEIN_CONSTANT)
    {
        if (fmpq_is_zero(constant))
        {
            fmpz_clear(divisor_power);
            fmpq_clear(bernoulli);
            fmpq_clear(constant);
            fmpq_clear(scale);
            fmpq_clear(coefficient);
            napi_throw_range_error(
                env, NULL, "Eisenstein constant term is zero");
            return NULL;
        }
        fmpq_inv(scale, constant);
        fmpq_poly_set_coeff_ui(poly->rational, 0, 1);
    }
    else
    {
        fmpq_set_fmpz(scale, fmpq_denref(constant));
        fmpq_set_fmpz(coefficient, fmpq_numref(constant));
        fmpq_poly_set_coeff_fmpq(poly->rational, 0, coefficient);
    }

    if (precision > 1)
    {
        sums = _fmpz_vec_init((slong) precision);
        for (divisor = 1; divisor < precision; divisor++)
        {
            fmpz_set_ui(divisor_power, divisor);
            fmpz_pow_ui(divisor_power, divisor_power, weight - 1);
            for (
                multiple = divisor;
                multiple < precision;
                multiple += divisor)
            {
                fmpz_add(
                    sums + multiple,
                    sums + multiple,
                    divisor_power);
            }
        }
        for (multiple = 1; multiple < precision; multiple++)
        {
            fmpq_mul_fmpz(coefficient, scale, sums + multiple);
            fmpq_poly_set_coeff_fmpq(
                poly->rational, (slong) multiple, coefficient);
        }
        _fmpz_vec_clear(sums, (slong) precision);
    }

    fmpz_clear(divisor_power);
    fmpq_clear(bernoulli);
    fmpq_clear(constant);
    fmpq_clear(scale);
    fmpq_clear(coefficient);
    return result;
}

static napi_value nmod_poly_gcd_value(napi_env env, napi_callback_info info)
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
    if (left->kind != SAGEJS_POLY_NMOD)
    {
        napi_throw_type_error(
            env, NULL, "gcd currently requires finite-field polynomials");
        return NULL;
    }
    result = create_poly(env, SAGEJS_POLY_NMOD, left->modular->mod.n);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, SAGEJS_POLY_NMOD);
    if (answer == NULL)
        return NULL;
    nmod_poly_gcd(answer->modular, left->modular, right->modular);
    return result;
}

static napi_value nmod_poly_is_irreducible_value(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_poly *poly;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    poly = unwrap_poly(env, args[0], SAGEJS_POLY_NMOD);
    if (poly == NULL)
        return NULL;
    if (!check_napi(env,
        napi_get_boolean(
            env, nmod_poly_is_irreducible(poly->modular), &result)))
        return NULL;
    return result;
}

static napi_value nmod_factorization_result(
    napi_env env,
    const nmod_poly_factor_t decomposition,
    ulong unit,
    ulong modulus)
{
    napi_value result;
    napi_value factors;
    napi_value unit_value;
    slong index;

    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env,
            napi_create_bigint_uint64(env, (uint64_t) unit, &unit_value)) ||
        !check_napi(env,
            napi_set_named_property(env, result, "unit", unit_value)) ||
        !check_napi(env,
            napi_create_array_with_length(
                env, (size_t) decomposition->num, &factors)))
        return NULL;

    for (index = 0; index < decomposition->num; index++)
    {
        napi_value pair;
        napi_value polynomial;
        napi_value exponent;
        sagejs_poly *target;

        if (!check_napi(env, napi_create_array_with_length(env, 2, &pair)))
            return NULL;
        polynomial = create_poly(env, SAGEJS_POLY_NMOD, modulus);
        if (polynomial == NULL)
            return NULL;
        target = unwrap_poly(env, polynomial, SAGEJS_POLY_NMOD);
        if (target == NULL)
            return NULL;
        nmod_poly_set(target->modular, decomposition->p + index);
        if (!check_napi(env,
                napi_create_double(
                    env, (double) decomposition->exp[index], &exponent)) ||
            !check_napi(env, napi_set_element(env, pair, 0, polynomial)) ||
            !check_napi(env, napi_set_element(env, pair, 1, exponent)) ||
            !check_napi(env,
                napi_set_element(env, factors, (uint32_t) index, pair)))
            return NULL;
    }
    if (!check_napi(env,
        napi_set_named_property(env, result, "factors", factors)))
        return NULL;
    return result;
}

static napi_value nmod_poly_factor_value(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_poly *poly;
    nmod_poly_factor_t decomposition;
    ulong unit;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    poly = unwrap_poly(env, args[0], SAGEJS_POLY_NMOD);
    if (poly == NULL)
        return NULL;
    if (nmod_poly_is_zero(poly->modular))
    {
        napi_throw_range_error(env, NULL, "factorization of 0 is not defined");
        return NULL;
    }
    nmod_poly_factor_init(decomposition);
    unit = nmod_poly_factor(decomposition, poly->modular);
    result = nmod_factorization_result(
        env, decomposition, unit, poly->modular->mod.n);
    nmod_poly_factor_clear(decomposition);
    return result;
}

static napi_value fmpz_factorization_result(
    napi_env env,
    const fmpz_poly_factor_t decomposition,
    sagejs_poly_kind kind,
    const fmpz_t denominator)
{
    napi_value result;
    napi_value factors;
    napi_value unit_numerator;
    napi_value unit_denominator;
    slong index;

    unit_numerator = fmpz_to_bigint(env, &decomposition->c);
    unit_denominator = fmpz_to_bigint(env, denominator);
    if (unit_numerator == NULL || unit_denominator == NULL ||
        !check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env, napi_set_named_property(
            env, result, "unitNumerator", unit_numerator)) ||
        !check_napi(env, napi_set_named_property(
            env, result, "unitDenominator", unit_denominator)) ||
        !check_napi(env, napi_create_array_with_length(
            env, (size_t) decomposition->num, &factors)))
        return NULL;

    for (index = 0; index < decomposition->num; index++)
    {
        napi_value pair;
        napi_value polynomial;
        napi_value exponent;
        sagejs_poly *target;

        if (!check_napi(env, napi_create_array_with_length(env, 2, &pair)))
            return NULL;
        polynomial = create_poly(env, kind, 0);
        if (polynomial == NULL)
            return NULL;
        target = unwrap_poly(env, polynomial, kind);
        if (target == NULL)
            return NULL;
        if (kind == SAGEJS_POLY_ZZ)
            fmpz_poly_set(target->integer, decomposition->p + index);
        else
            fmpq_poly_set_fmpz_poly(
                target->rational, decomposition->p + index);
        if (!check_napi(env, napi_create_double(
                env, (double) decomposition->exp[index], &exponent)) ||
            !check_napi(env, napi_set_element(env, pair, 0, polynomial)) ||
            !check_napi(env, napi_set_element(env, pair, 1, exponent)) ||
            !check_napi(env, napi_set_element(
                env, factors, (uint32_t) index, pair)))
            return NULL;
    }
    if (!check_napi(env, napi_set_named_property(
        env, result, "factors", factors)))
        return NULL;
    return result;
}

static napi_value poly_factor_value(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_poly *poly;
    fmpz_poly_factor_t decomposition;
    fmpz_poly_t numerator;
    fmpz_t denominator;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    poly = unwrap_poly(env, args[0], 0);
    if (poly == NULL)
        return NULL;
    if (poly->kind == SAGEJS_POLY_NMOD)
        return nmod_poly_factor_value(env, info);
    if ((poly->kind == SAGEJS_POLY_ZZ &&
            fmpz_poly_is_zero(poly->integer)) ||
        (poly->kind == SAGEJS_POLY_QQ &&
            fmpq_poly_is_zero(poly->rational)))
    {
        napi_throw_range_error(env, NULL, "factorization of 0 is not defined");
        return NULL;
    }

    fmpz_poly_factor_init(decomposition);
    fmpz_poly_init(numerator);
    fmpz_init(denominator);
    if (poly->kind == SAGEJS_POLY_ZZ)
    {
        fmpz_poly_set(numerator, poly->integer);
        fmpz_one(denominator);
    }
    else
    {
        fmpq_poly_get_numerator(numerator, poly->rational);
        fmpq_poly_get_denominator(denominator, poly->rational);
    }
    fmpz_poly_factor(decomposition, numerator);
    result = fmpz_factorization_result(
        env, decomposition, poly->kind, denominator);
    fmpz_clear(denominator);
    fmpz_poly_clear(numerator);
    fmpz_poly_factor_clear(decomposition);
    return result;
}

static napi_value poly_divexact_value(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_poly *left;
    sagejs_poly *right;
    sagejs_poly *answer;
    int divides = 0;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_same_kind(env, args[0], args[1], &right);
    if (left == NULL)
        return NULL;
    result = create_poly(
        env,
        left->kind,
        left->kind == SAGEJS_POLY_NMOD ? left->modular->mod.n : 0);
    if (result == NULL)
        return NULL;
    answer = unwrap_poly(env, result, left->kind);
    if (answer == NULL)
        return NULL;
    if (left->kind == SAGEJS_POLY_ZZ)
        divides = fmpz_poly_divides(
            answer->integer, left->integer, right->integer);
    else if (left->kind == SAGEJS_POLY_QQ)
        divides = fmpq_poly_divides(
            answer->rational, left->rational, right->rational);
    else
        divides = nmod_poly_divides(
            answer->modular, left->modular, right->modular);
    if (!divides)
    {
        napi_throw_range_error(env, NULL, "polynomial division is not exact");
        return NULL;
    }
    return result;
}

static napi_value nmod_poly_roots_value(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_poly *poly;
    nmod_poly_factor_t roots;
    slong index;
    ulong modulus;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    poly = unwrap_poly(env, args[0], SAGEJS_POLY_NMOD);
    if (poly == NULL)
        return NULL;
    if (nmod_poly_is_zero(poly->modular))
    {
        napi_throw_range_error(
            env, NULL, "roots of the zero polynomial are not defined");
        return NULL;
    }
    modulus = poly->modular->mod.n;
    nmod_poly_factor_init(roots);
    nmod_poly_roots(roots, poly->modular, 1);
    if (!check_napi(env,
        napi_create_array_with_length(env, (size_t) roots->num, &result)))
    {
        nmod_poly_factor_clear(roots);
        return NULL;
    }
    for (index = 0; index < roots->num; index++)
    {
        napi_value pair;
        napi_value root;
        napi_value exponent;
        ulong constant = nmod_poly_get_coeff_ui(roots->p + index, 0);
        ulong root_value = constant == 0 ? 0 : modulus - constant;

        if (!check_napi(env, napi_create_array_with_length(env, 2, &pair)) ||
            !check_napi(env,
                napi_create_bigint_uint64(
                    env, (uint64_t) root_value, &root)) ||
            !check_napi(env,
                napi_create_double(
                    env, (double) roots->exp[index], &exponent)) ||
            !check_napi(env, napi_set_element(env, pair, 0, root)) ||
            !check_napi(env, napi_set_element(env, pair, 1, exponent)) ||
            !check_napi(env,
                napi_set_element(env, result, (uint32_t) index, pair)))
        {
            nmod_poly_factor_clear(roots);
            return NULL;
        }
    }
    nmod_poly_factor_clear(roots);
    return result;
}

typedef struct
{
    qqbar_srcptr value;
    slong multiplicity;
}
sagejs_exact_root;

static int compare_qqbar_values(
    qqbar_srcptr left,
    qqbar_srcptr right)
{
    double left_real = arf_get_d(
        arb_midref(acb_realref(QQBAR_ENCLOSURE(left))),
        ARF_RND_NEAR);
    double right_real = arf_get_d(
        arb_midref(acb_realref(QQBAR_ENCLOSURE(right))),
        ARF_RND_NEAR);
    double left_imag;
    double right_imag;

    if (left_real < right_real)
        return -1;
    if (left_real > right_real)
        return 1;
    left_imag = arf_get_d(
        arb_midref(acb_imagref(QQBAR_ENCLOSURE(left))),
        ARF_RND_NEAR);
    right_imag = arf_get_d(
        arb_midref(acb_imagref(QQBAR_ENCLOSURE(right))),
        ARF_RND_NEAR);
    if (left_imag < right_imag)
        return -1;
    if (left_imag > right_imag)
        return 1;
    return 0;
}

static int compare_exact_roots(
    const void *left_pointer,
    const void *right_pointer)
{
    const sagejs_exact_root *left =
        (const sagejs_exact_root *) left_pointer;
    const sagejs_exact_root *right =
        (const sagejs_exact_root *) right_pointer;

    return compare_qqbar_values(left->value, right->value);
}

static napi_value exact_poly_roots(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_poly *poly;
    fmpz_poly_t integer_poly;
    fmpz_poly_factor_t factors;
    qqbar_ptr roots;
    sagejs_exact_root *root_records;
    slong degree;
    slong distinct_degree = 0;
    slong factor_index;
    slong index;
    slong offset = 0;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    poly = unwrap_poly(env, args[0], 0);
    if (poly == NULL)
        return NULL;
    if (poly->kind != SAGEJS_POLY_ZZ &&
        poly->kind != SAGEJS_POLY_QQ)
    {
        napi_throw_type_error(env, NULL,
            "exact algebraic roots require an integer or rational polynomial");
        return NULL;
    }
    degree = poly->kind == SAGEJS_POLY_ZZ
        ? fmpz_poly_degree(poly->integer)
        : fmpq_poly_degree(poly->rational);
    if (degree < 0)
    {
        napi_throw_range_error(env, NULL,
            "roots of the zero polynomial are not defined");
        return NULL;
    }
    if (degree == 0)
    {
        if (!check_napi(env,
            napi_create_array_with_length(env, 0, &result)))
            return NULL;
        return result;
    }

    fmpz_poly_init(integer_poly);
    fmpz_poly_factor_init(factors);
    if (poly->kind == SAGEJS_POLY_ZZ)
        fmpz_poly_set(integer_poly, poly->integer);
    else
        fmpq_poly_get_numerator(integer_poly, poly->rational);
    fmpz_poly_factor_squarefree(factors, integer_poly);
    for (factor_index = 0; factor_index < factors->num; factor_index++)
        distinct_degree += fmpz_poly_degree(factors->p + factor_index);

    if (!check_napi(env,
        napi_create_array_with_length(
            env, (size_t) distinct_degree, &result)))
    {
        fmpz_poly_factor_clear(factors);
        fmpz_poly_clear(integer_poly);
        return NULL;
    }

    roots = _qqbar_vec_init(distinct_degree);
    root_records = malloc(
        (size_t) distinct_degree * sizeof(sagejs_exact_root));
    if (root_records == NULL)
    {
        _qqbar_vec_clear(roots, distinct_degree);
        fmpz_poly_factor_clear(factors);
        fmpz_poly_clear(integer_poly);
        napi_throw_error(env, NULL, "unable to allocate algebraic roots");
        return NULL;
    }
    for (factor_index = 0; factor_index < factors->num; factor_index++)
    {
        slong factor_degree =
            fmpz_poly_degree(factors->p + factor_index);

        qqbar_roots_fmpz_poly(
            roots + offset, factors->p + factor_index, 0);
        for (index = 0; index < factor_degree; index++)
        {
            root_records[offset + index].value = roots + offset + index;
            root_records[offset + index].multiplicity =
                factors->exp[factor_index];
        }
        offset += factor_degree;
    }
    qsort(
        root_records,
        (size_t) distinct_degree,
        sizeof(sagejs_exact_root),
        compare_exact_roots);
    for (index = 0; index < distinct_degree; index++)
    {
        napi_value pair;
        napi_value root = sagejs_qqbar_wrap_copy(
            env, root_records[index].value);
        napi_value multiplicity;

        if (root == NULL ||
            !check_napi(env,
                napi_create_array_with_length(env, 2, &pair)) ||
            !check_napi(env,
                napi_create_double(
                    env,
                    (double) root_records[index].multiplicity,
                    &multiplicity)) ||
            !check_napi(env, napi_set_element(env, pair, 0, root)) ||
            !check_napi(env,
                napi_set_element(env, pair, 1, multiplicity)) ||
            !check_napi(env,
                napi_set_element(env, result, (uint32_t) index, pair)))
        {
            free(root_records);
            _qqbar_vec_clear(roots, distinct_degree);
            fmpz_poly_factor_clear(factors);
            fmpz_poly_clear(integer_poly);
            return NULL;
        }
    }
    free(root_records);
    _qqbar_vec_clear(roots, distinct_degree);
    fmpz_poly_factor_clear(factors);
    fmpz_poly_clear(integer_poly);
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

static int bigint_to_negative_slong(
    napi_env env,
    napi_value value,
    slong *result)
{
    int64_t input;
    bool lossless;
    napi_valuetype type;

    if (!check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_bigint)
    {
        napi_throw_type_error(env, NULL,
            "quadratic discriminant must be a BigInt");
        return 0;
    }
    if (!check_napi(env,
        napi_get_value_bigint_int64(env, value, &input, &lossless)))
        return 0;
    if (!lossless || input >= 0 || input == INT64_MIN ||
        (input % 4 != 0 && input % 4 != 1 && input % 4 != -3))
    {
        napi_throw_range_error(env, NULL,
            "quadratic discriminant must be a negative signed word "
            "congruent to 0 or 1 modulo 4");
        return 0;
    }
    *result = (slong) input;
    return 1;
}

static int validate_qfb_input(
    napi_env env,
    qfb_t form,
    const fmpz_t discriminant)
{
    fmpz_t actual_discriminant;
    int valid;

    if (fmpz_sgn(discriminant) >= 0 ||
        (fmpz_fdiv_ui(discriminant, 4) != 0 &&
         fmpz_fdiv_ui(discriminant, 4) != 1))
    {
        napi_throw_range_error(env, NULL,
            "quadratic discriminant must be negative and congruent "
            "to 0 or 1 modulo 4");
        return 0;
    }
    fmpz_init(actual_discriminant);
    qfb_discriminant(actual_discriminant, form);
    valid = fmpz_equal(actual_discriminant, discriminant) &&
        qfb_is_primitive(form) && qfb_is_reduced(form);
    fmpz_clear(actual_discriminant);
    if (!valid)
    {
        napi_throw_range_error(env, NULL,
            "quadratic form must be primitive, reduced, and have "
            "the specified discriminant");
        return 0;
    }
    return 1;
}

static int compare_qfb_coefficients(const void *left, const void *right)
{
    const qfb *left_form = (const qfb *) left;
    const qfb *right_form = (const qfb *) right;
    int comparison = fmpz_cmp(left_form->a, right_form->a);

    if (comparison == 0)
        comparison = fmpz_cmp(left_form->b, right_form->b);
    if (comparison == 0)
        comparison = fmpz_cmp(left_form->c, right_form->c);
    return comparison;
}

static napi_value qfb_reduced_forms_value(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    napi_value form_value;
    qfb *forms = NULL;
    slong discriminant;
    slong count;
    slong index;

    if (!require_arguments(env, info, 1, args) ||
        !bigint_to_negative_slong(env, args[0], &discriminant))
        return NULL;
    count = qfb_reduced_forms(&forms, discriminant);
    if (count < 0 || (uint64_t) count > UINT32_MAX)
    {
        if (forms != NULL)
            qfb_array_clear(&forms, count);
        napi_throw_range_error(env, NULL,
            "quadratic class group is too large for a JavaScript array");
        return NULL;
    }
    qsort(forms, (size_t) count, sizeof(qfb), compare_qfb_coefficients);
    if (!check_napi(env,
        napi_create_array_with_length(env, (size_t) count, &result)))
    {
        qfb_array_clear(&forms, count);
        return NULL;
    }
    for (index = 0; index < count; index++)
    {
        form_value = qfb_to_value(env, forms + index);
        if (form_value == NULL ||
            !check_napi(env,
                napi_set_element(
                    env, result, (uint32_t) index, form_value)))
        {
            qfb_array_clear(&forms, count);
            return NULL;
        }
    }
    qfb_array_clear(&forms, count);
    return result;
}

static napi_value qfb_class_number_value(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    qfb *forms = NULL;
    slong discriminant;
    slong count;

    if (!require_arguments(env, info, 1, args) ||
        !bigint_to_negative_slong(env, args[0], &discriminant))
        return NULL;
    count = qfb_reduced_forms(&forms, discriminant);
    qfb_array_clear(&forms, count);
    if (!check_napi(env,
        napi_create_bigint_int64(env, (int64_t) count, &result)))
        return NULL;
    return result;
}

static napi_value qfb_class_group_data_value(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    napi_value class_number;
    napi_value generator;
    napi_value form_values;
    qfb *forms = NULL;
    qfb_t powered;
    fmpz_t discriminant_value;
    n_factor_t factorization;
    slong discriminant;
    slong count;
    slong form_index;
    slong generator_index = -1;
    int factor_index;

    if (!require_arguments(env, info, 1, args) ||
        !bigint_to_negative_slong(env, args[0], &discriminant))
        return NULL;
    count = qfb_reduced_forms(&forms, discriminant);
    if (count <= 0)
    {
        qfb_array_clear(&forms, count);
        napi_throw_error(env, NULL,
            "quadratic discriminant has no reduced primitive forms");
        return NULL;
    }
    qsort(forms, (size_t) count, sizeof(qfb), compare_qfb_coefficients);
    n_factor_init(&factorization);
    n_factor(&factorization, (ulong) count, 1);
    qfb_init(powered);
    fmpz_init_set_si(discriminant_value, discriminant);
    for (form_index = 0; form_index < count; form_index++)
    {
        int generates = 1;
        for (factor_index = 0;
             factor_index < factorization.num;
             factor_index++)
        {
            qfb_pow_ui(
                powered,
                forms + form_index,
                discriminant_value,
                (ulong) count / factorization.p[factor_index]);
            if (qfb_is_principal_form(powered, discriminant_value))
            {
                generates = 0;
                break;
            }
        }
        if (!generates)
            continue;
        generator_index = form_index;
        break;
    }

    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env,
            napi_create_bigint_int64(env, count, &class_number)) ||
        !check_napi(env, napi_set_named_property(
            env, result, "classNumber", class_number)))
    {
        result = NULL;
        goto cleanup_class_group_data;
    }
    if (generator_index >= 0)
    {
        generator = qfb_to_value(env, forms + generator_index);
        if (generator == NULL ||
            !check_napi(env, napi_get_null(env, &form_values)))
        {
            result = NULL;
            goto cleanup_class_group_data;
        }
    }
    else
    {
        if ((uint64_t) count > UINT32_MAX ||
            !check_napi(env, napi_get_null(env, &generator)) ||
            !check_napi(env, napi_create_array_with_length(
                env, (size_t) count, &form_values)))
        {
            if ((uint64_t) count > UINT32_MAX)
                napi_throw_range_error(env, NULL,
                    "quadratic class group is too large for a "
                    "JavaScript array");
            result = NULL;
            goto cleanup_class_group_data;
        }
        for (form_index = 0; form_index < count; form_index++)
        {
            napi_value form_value = qfb_to_value(env, forms + form_index);
            if (form_value == NULL || !check_napi(env, napi_set_element(
                env, form_values, (uint32_t) form_index, form_value)))
            {
                result = NULL;
                goto cleanup_class_group_data;
            }
        }
    }
    if (!check_napi(env, napi_set_named_property(
            env, result, "generator", generator)) ||
        !check_napi(env, napi_set_named_property(
            env, result, "forms", form_values)))
        result = NULL;

cleanup_class_group_data:
    qfb_clear(powered);
    fmpz_clear(discriminant_value);
    qfb_array_clear(&forms, count);
    return result;
}

static napi_value qfb_nucomp_value(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[3];
    napi_value result;
    qfb_t left;
    qfb_t right;
    qfb_t composed;
    fmpz_t discriminant;
    fmpz_t magnitude;
    fmpz_t root;

    if (!require_arguments(env, info, 3, args))
        return NULL;
    qfb_init(left);
    qfb_init(right);
    qfb_init(composed);
    fmpz_init(discriminant);
    fmpz_init(magnitude);
    fmpz_init(root);
    if (!bigint_to_fmpz(env, args[0], discriminant) ||
        !value_to_qfb(env, args[1], left) ||
        !value_to_qfb(env, args[2], right))
    {
        result = NULL;
        goto cleanup_nucomp;
    }
    if (!validate_qfb_input(env, left, discriminant) ||
        !validate_qfb_input(env, right, discriminant))
    {
        result = NULL;
        goto cleanup_nucomp;
    }
    fmpz_abs(magnitude, discriminant);
    fmpz_root(root, magnitude, 4);
    qfb_nucomp(composed, left, right, discriminant, root);
    qfb_reduce(composed, composed, discriminant);
    result = qfb_to_value(env, composed);

cleanup_nucomp:
    qfb_clear(left);
    qfb_clear(right);
    qfb_clear(composed);
    fmpz_clear(discriminant);
    fmpz_clear(magnitude);
    fmpz_clear(root);
    return result;
}

static napi_value qfb_pow_value(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[3];
    napi_value result;
    qfb_t form;
    qfb_t powered;
    fmpz_t discriminant;
    fmpz_t exponent;

    if (!require_arguments(env, info, 3, args))
        return NULL;
    qfb_init(form);
    qfb_init(powered);
    fmpz_init(discriminant);
    fmpz_init(exponent);
    if (!bigint_to_fmpz(env, args[0], discriminant) ||
        !value_to_qfb(env, args[1], form) ||
        !bigint_to_fmpz(env, args[2], exponent))
    {
        result = NULL;
        goto cleanup_pow;
    }
    if (!validate_qfb_input(env, form, discriminant) ||
        fmpz_sgn(exponent) < 0)
    {
        if (fmpz_sgn(exponent) < 0)
            napi_throw_range_error(env, NULL,
                "quadratic form exponent must be nonnegative");
        result = NULL;
        goto cleanup_pow;
    }
    qfb_pow(powered, form, discriminant, exponent);
    qfb_reduce(powered, powered, discriminant);
    result = qfb_to_value(env, powered);

cleanup_pow:
    qfb_clear(form);
    qfb_clear(powered);
    fmpz_clear(discriminant);
    fmpz_clear(exponent);
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

static napi_value library_version(
    napi_env env, const char *value)
{
    napi_value result;

    if (!check_napi(env,
        napi_create_string_utf8(env, value, NAPI_AUTO_LENGTH, &result)))
        return NULL;
    return result;
}

static napi_value mpfr_version_value(napi_env env, napi_callback_info info)
{
    (void) info;
    return library_version(env, mpfr_get_version());
}

static napi_value mpc_version(napi_env env, napi_callback_info info)
{
    (void) info;
    return library_version(env, mpc_get_version());
}

static napi_value gmp_version_value(napi_env env, napi_callback_info info)
{
    (void) info;
    return library_version(env, gmp_version);
}

static napi_value smalljac_version_value(
    napi_env env, napi_callback_info info)
{
    (void) info;
#ifdef SAGEJS_HAVE_SMALLJAC
    return library_version(env, SMALLJAC_VERSION_STRING);
#else
    napi_value result;
    if (!check_napi(env, napi_get_null(env, &result)))
        return NULL;
    return result;
#endif
}

static napi_value blas_enabled(napi_env env, napi_callback_info info)
{
    napi_value result;
    (void) info;

    if (!check_napi(env, napi_get_boolean(
        env,
#if FLINT_USES_BLAS
        true,
#else
        false,
#endif
        &result)))
        return NULL;
    return result;
}

static napi_value initialize(napi_env env, napi_value exports)
{
#ifdef _WIN32
    napi_value delay_load_warmup;

    /*
     * Windows addons must retain node-gyp's delay-load hook so they can bind
     * to a renamed Node SEA executable (sagejs.exe rather than node.exe).
     * clang-cl/lld does not preserve the floating argument to the very first
     * delayed napi_create_double call, so resolve that import once here and
     * discard its deliberately irrelevant value.
     */
    if (!check_napi(env,
        napi_create_double(env, 0.0, &delay_load_warmup)))
        return NULL;
#endif
    napi_property_descriptor properties[] = {
        {"identity", NULL, identity, NULL, NULL, NULL, napi_default, NULL},
        {"gcd", NULL, gcd, NULL, NULL, NULL, napi_default, NULL},
        {"factorial", NULL, factorial, NULL, NULL, NULL, napi_default, NULL},
        {"fibonacci", NULL, fibonacci, NULL, NULL, NULL, napi_default, NULL},
        {"primorial", NULL, primorial, NULL, NULL, NULL, napi_default, NULL},
        {"binomial", NULL, binomial, NULL, NULL, NULL, napi_default, NULL},
        {"factor", NULL, factor, NULL, NULL, NULL, napi_default, NULL},
        {"qfbReducedForms", NULL, qfb_reduced_forms_value,
            NULL, NULL, NULL, napi_default, NULL},
        {"qfbClassNumber", NULL, qfb_class_number_value,
            NULL, NULL, NULL, napi_default, NULL},
        {"qfbClassGroupData", NULL, qfb_class_group_data_value,
            NULL, NULL, NULL, napi_default, NULL},
        {"qfbNucomp", NULL, qfb_nucomp_value,
            NULL, NULL, NULL, napi_default, NULL},
        {"qfbPow", NULL, qfb_pow_value,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarFromRational", NULL, sagejs_qqbar_from_rational,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarI", NULL, sagejs_qqbar_i,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarRootOfUnity", NULL, sagejs_qqbar_root_of_unity,
            NULL, NULL, NULL, napi_default, NULL},
        {"cyclotomicRootCoefficients", NULL,
            sagejs_cyclotomic_root_coefficients,
            NULL, NULL, NULL, napi_default, NULL},
        {"cyclotomicElementCoefficients", NULL,
            sagejs_cyclotomic_element_coefficients,
            NULL, NULL, NULL, napi_default, NULL},
        {"cyclotomicPolyFactor", NULL,
            sagejs_cyclotomic_poly_factor,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarAdd", NULL, sagejs_qqbar_add,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarSub", NULL, sagejs_qqbar_sub,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarMul", NULL, sagejs_qqbar_mul,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarDiv", NULL, sagejs_qqbar_div,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarNeg", NULL, sagejs_qqbar_neg,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarPow", NULL, sagejs_qqbar_pow,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarPowRational", NULL, sagejs_qqbar_pow_rational,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarSqrt", NULL, sagejs_qqbar_sqrt,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarEqual", NULL, sagejs_qqbar_equal,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarCompareReal", NULL, sagejs_qqbar_compare_real,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarIsReal", NULL, sagejs_qqbar_is_real,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarIsRational", NULL, sagejs_qqbar_is_rational,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarReal", NULL, sagejs_qqbar_real,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarImag", NULL, sagejs_qqbar_imag,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarConjugate", NULL, sagejs_qqbar_conjugate,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarAbs", NULL, sagejs_qqbar_abs,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarDegree", NULL, sagejs_qqbar_degree,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarMinpolyCoefficients", NULL,
            sagejs_qqbar_minpoly_coefficients,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarToString", NULL, sagejs_qqbar_to_string,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarApprox", NULL, sagejs_qqbar_approx,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletGroup", NULL, sagejs_dirichlet_group,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletGroupClose", NULL, sagejs_dirichlet_group_close,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletGroupData", NULL, sagejs_dirichlet_group_data,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletCharacterData", NULL,
            sagejs_dirichlet_character_data,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletCharacterExponent", NULL,
            sagejs_dirichlet_character_exponent,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletCharacterExponents", NULL,
            sagejs_dirichlet_character_exponents,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletGaussSumExact", NULL,
            sagejs_dirichlet_gauss_sum_exact,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletGaussSum", NULL,
            sagejs_dirichlet_gauss_sum,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletJacobiSumExact", NULL,
            sagejs_dirichlet_jacobi_sum_exact,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletJacobiSum", NULL,
            sagejs_dirichlet_jacobi_sum,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletRootNumber", NULL,
            sagejs_dirichlet_root_number,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletLValue", NULL,
            sagejs_dirichlet_l_value,
            NULL, NULL, NULL, napi_default, NULL},
        {"dirichletBernoulli", NULL,
            sagejs_dirichlet_bernoulli,
            NULL, NULL, NULL, napi_default, NULL},
        {"p1List", NULL, sagejs_p1list, NULL, NULL, NULL,
            napi_default, NULL},
        {"p1ListLevel", NULL, sagejs_p1list_level, NULL, NULL, NULL,
            napi_default, NULL},
        {"p1ListCount", NULL, sagejs_p1list_count, NULL, NULL, NULL,
            napi_default, NULL},
        {"p1ListEntry", NULL, sagejs_p1list_entry, NULL, NULL, NULL,
            napi_default, NULL},
        {"p1ListNormalize", NULL, sagejs_p1list_normalize,
            NULL, NULL, NULL, napi_default, NULL},
        {"p1ListIndex", NULL, sagejs_p1list_index, NULL, NULL, NULL,
            napi_default, NULL},
        {"p1ListApplyI", NULL, sagejs_p1list_apply_i,
            NULL, NULL, NULL, napi_default, NULL},
        {"p1ListApplyS", NULL, sagejs_p1list_apply_s,
            NULL, NULL, NULL, napi_default, NULL},
        {"p1ListApplyR", NULL, sagejs_p1list_apply_r,
            NULL, NULL, NULL, napi_default, NULL},
        {"p1ListApplyT", NULL, sagejs_p1list_apply_t,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListManinPresentationInfo", NULL,
         sagejs_p1list_manin_presentation_info,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListHeckeMatrix", NULL, sagejs_p1list_hecke_matrix,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListDegeneracyMatrix", NULL,
         sagejs_p1list_degeneracy_matrix,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListBoundaryData", NULL, sagejs_p1list_boundary_data,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListCuspidalBasis", NULL, sagejs_p1list_cuspidal_basis,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListStarMatrix", NULL, sagejs_p1list_star_matrix,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListStarEigenspaceBasis", NULL,
         sagejs_p1list_star_eigenspace_basis,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListHigherWeightPresentation", NULL,
         sagejs_p1list_higher_weight_presentation,
         NULL, NULL, NULL, napi_default, NULL},
        {"higherWeightPresentationReduction", NULL,
         sagejs_higher_weight_presentation_reduction,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListHigherWeightHeckeMatrix", NULL,
         sagejs_p1list_higher_weight_hecke_matrix,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListHigherWeightDegeneracyMatrix", NULL,
         sagejs_p1list_higher_weight_degeneracy_matrix,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListCharacterPresentation", NULL,
         sagejs_p1list_character_presentation,
         NULL, NULL, NULL, napi_default, NULL},
        {"characterPresentationReduction", NULL,
         sagejs_character_presentation_reduction,
         NULL, NULL, NULL, napi_default, NULL},
        {"characterPresentationBoundaryData", NULL,
         sagejs_character_presentation_boundary_data,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListCharacterHeckeMatrix", NULL,
         sagejs_p1list_character_hecke_matrix,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListReducePath", NULL, sagejs_p1list_reduce_path,
         NULL, NULL, NULL, napi_default, NULL},
        {"p1ListManinRelations", NULL, sagejs_p1list_manin_relations,
         NULL, NULL, NULL, napi_default, NULL},
        {"maninRelationsInfo", NULL, sagejs_manin_relations_info,
            NULL, NULL, NULL, napi_default, NULL},
        {"maninRelationsRow", NULL, sagejs_manin_relations_row,
            NULL, NULL, NULL, napi_default, NULL},
        {"maninRelationsRank", NULL, sagejs_manin_relations_rank,
            NULL, NULL, NULL, napi_default, NULL},
        {"zzMatrix", NULL, sagejs_zz_matrix, NULL, NULL, NULL,
            napi_default, NULL},
        {"qqMatrix", NULL, sagejs_qq_matrix, NULL, NULL, NULL,
            napi_default, NULL},
        {"nmodMatrix", NULL, sagejs_nmod_matrix, NULL, NULL, NULL,
            napi_default, NULL},
        {"zmodMatrix", NULL, sagejs_zmod_matrix, NULL, NULL, NULL,
            napi_default, NULL},
        {"nmodMatrixPacked", NULL, sagejs_nmod_matrix_packed,
            NULL, NULL, NULL, napi_default, NULL},
        {"zmodMatrixPacked", NULL, sagejs_zmod_matrix_packed,
            NULL, NULL, NULL, napi_default, NULL},
        {"matrixExportPacked", NULL, sagejs_matrix_export_packed,
            NULL, NULL, NULL, napi_default, NULL},
        {"zzMatrixPacked", NULL, sagejs_zz_matrix_packed,
            NULL, NULL, NULL, napi_default, NULL},
        {"zzMatrixExportPacked", NULL, sagejs_zz_matrix_export_packed,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqMatrixPacked", NULL, sagejs_qq_matrix_packed,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqMatrixExportPacked", NULL, sagejs_qq_matrix_export_packed,
            NULL, NULL, NULL, napi_default, NULL},
        {"nmodMatrixRandom", NULL, sagejs_nmod_matrix_random,
            NULL, NULL, NULL, napi_default, NULL},
        {"zmodMatrixRandom", NULL, sagejs_zmod_matrix_random,
            NULL, NULL, NULL, napi_default, NULL},
        {"acbMatrix", NULL, sagejs_acb_matrix, NULL, NULL, NULL,
            napi_default, NULL},
        {"qqbarMatrix", NULL, sagejs_qqbar_matrix, NULL, NULL, NULL,
            napi_default, NULL},
        {"zzMatrixToQQ", NULL, sagejs_zz_matrix_to_qq, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixAdd", NULL, sagejs_matrix_add, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixSub", NULL, sagejs_matrix_sub, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixMul", NULL, sagejs_matrix_mul, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixMulBlas", NULL, sagejs_matrix_mul_blas,
            NULL, NULL, NULL, napi_default, NULL},
        {"matrixSparseLeftMul", NULL, sagejs_matrix_sparse_left_mul,
         NULL, NULL, NULL, napi_default, NULL},
        {"matrixAugment", NULL, sagejs_matrix_augment,
         NULL, NULL, NULL, napi_default, NULL},
        {"matrixStack", NULL, sagejs_matrix_stack,
         NULL, NULL, NULL, napi_default, NULL},
        {"matrixSelectRows", NULL, sagejs_matrix_select_rows,
         NULL, NULL, NULL, napi_default, NULL},
        {"matrixSelectColumns", NULL, sagejs_matrix_select_columns,
         NULL, NULL, NULL, napi_default, NULL},
        {"matrixPivots", NULL, sagejs_matrix_pivots,
         NULL, NULL, NULL, napi_default, NULL},
        {"matrixIsZero", NULL, sagejs_matrix_is_zero,
         NULL, NULL, NULL, napi_default, NULL},
        {"matrixNeg", NULL, sagejs_matrix_neg, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixScalarMul", NULL, sagejs_matrix_scalar_mul,
            NULL, NULL, NULL, napi_default, NULL},
        {"acbMatrixScalarMul", NULL, sagejs_acb_matrix_scalar_mul,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqbarMatrixScalarMul", NULL,
            sagejs_qqbar_matrix_scalar_mul,
            NULL, NULL, NULL, napi_default, NULL},
        {"matrixTranspose", NULL, sagejs_matrix_transpose,
            NULL, NULL, NULL, napi_default, NULL},
        {"matrixEqual", NULL, sagejs_matrix_equal, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixEntry", NULL, sagejs_matrix_entry, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixDet", NULL, sagejs_matrix_det, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixRank", NULL, sagejs_matrix_rank, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixRref", NULL, sagejs_matrix_rref, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixHermite", NULL, sagejs_matrix_hermite, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixHowell", NULL, sagejs_matrix_howell, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixHermiteTransform", NULL, sagejs_matrix_hermite_transform,
            NULL, NULL, NULL, napi_default, NULL},
        {"matrixSmith", NULL, sagejs_matrix_smith, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixRightKernel", NULL, sagejs_matrix_right_kernel,
            NULL, NULL, NULL, napi_default, NULL},
        {"cyclotomicMatrixRightKernel", NULL,
            sagejs_cyclotomic_matrix_right_kernel,
            NULL, NULL, NULL, napi_default, NULL},
        {"cyclotomicMatrixPolyEvaluate", NULL,
            sagejs_cyclotomic_matrix_poly_evaluate,
            NULL, NULL, NULL, napi_default, NULL},
        {"matrixCharpoly", NULL, sagejs_matrix_charpoly,
            NULL, NULL, NULL, napi_default, NULL},
        {"matrixMinpoly", NULL, sagejs_matrix_minpoly,
            NULL, NULL, NULL, napi_default, NULL},
        {"matrixSolve", NULL, sagejs_matrix_solve, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixInverse", NULL, sagejs_matrix_inverse, NULL, NULL, NULL,
            napi_default, NULL},
        {"matrixApproxEigensystem", NULL,
            sagejs_matrix_approx_eigensystem,
            NULL, NULL, NULL, napi_default, NULL},
        {"matrixExactEigenvalues", NULL,
            sagejs_matrix_exact_eigenvalues,
            NULL, NULL, NULL, napi_default, NULL},
        {"mpolyContext", NULL, sagejs_mpoly_context, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyConstant", NULL, sagejs_mpoly_constant, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyGen", NULL, sagejs_mpoly_gen, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyAdd", NULL, sagejs_mpoly_add, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolySub", NULL, sagejs_mpoly_sub, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyMul", NULL, sagejs_mpoly_mul, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyNeg", NULL, sagejs_mpoly_neg, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyPow", NULL, sagejs_mpoly_pow, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyEqual", NULL, sagejs_mpoly_equal, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyCompare", NULL, sagejs_mpoly_compare, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyDivExact", NULL, sagejs_mpoly_divexact, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyGcd", NULL, sagejs_mpoly_gcd, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyResultant", NULL, sagejs_mpoly_resultant,
            NULL, NULL, NULL, napi_default, NULL},
        {"mpolyIrreducibleFactors", NULL,
            sagejs_mpoly_irreducible_factors,
            NULL, NULL, NULL, napi_default, NULL},
        {"mpolyComposeGen", NULL, sagejs_mpoly_compose_gen,
            NULL, NULL, NULL, napi_default, NULL},
        {"mpolyToString", NULL, sagejs_mpoly_to_string, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyUnivariateCoefficients", NULL,
            sagejs_mpoly_univariate_coefficients,
            NULL, NULL, NULL, napi_default, NULL},
        {"mpolyLength", NULL, sagejs_mpoly_length, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyDegree", NULL, sagejs_mpoly_degree, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpolyTotalDegree", NULL, sagejs_mpoly_total_degree,
            NULL, NULL, NULL, napi_default, NULL},
        {"mpolyGroebner", NULL, sagejs_mpoly_groebner,
            NULL, NULL, NULL, napi_default, NULL},
        {"mpolyReduce", NULL, sagejs_mpoly_reduce,
            NULL, NULL, NULL, napi_default, NULL},
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
        {"wordIsPrime", NULL, word_is_prime, NULL, NULL, NULL,
            napi_default, NULL},
        {"isPrime", NULL, is_prime, NULL, NULL, NULL,
            napi_default, NULL},
        {"nextPrime", NULL, next_prime, NULL, NULL, NULL,
            napi_default, NULL},
        {"primePi", NULL, prime_pi_count, NULL, NULL, NULL,
            napi_default, NULL},
        {"wordPrimitiveRootPrime", NULL, word_primitive_root_prime,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqContext", NULL, sagejs_fq_context, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqContextWithModulus", NULL, sagejs_fq_context_with_modulus,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqContextModulus", NULL, sagejs_fq_context_modulus,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqFromBigInt", NULL, sagejs_fq_from_bigint, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqGen", NULL, sagejs_fq_gen, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqAdd", NULL, sagejs_fq_add, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqSub", NULL, sagejs_fq_sub, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqMul", NULL, sagejs_fq_mul, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqDiv", NULL, sagejs_fq_div, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqNeg", NULL, sagejs_fq_neg, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqPow", NULL, sagejs_fq_pow, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqEqual", NULL, sagejs_fq_equal, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqIsZero", NULL, sagejs_fq_is_zero, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqIsOne", NULL, sagejs_fq_is_one, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqToString", NULL, sagejs_fq_to_string, NULL, NULL, NULL,
            napi_default, NULL},
        {"fqPolyConstant", NULL, sagejs_fq_poly_constant,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyGen", NULL, sagejs_fq_poly_gen,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyAdd", NULL, sagejs_fq_poly_add,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolySub", NULL, sagejs_fq_poly_sub,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyMul", NULL, sagejs_fq_poly_mul,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyNeg", NULL, sagejs_fq_poly_neg,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyPow", NULL, sagejs_fq_poly_pow,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyEqual", NULL, sagejs_fq_poly_equal,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyDivExact", NULL, sagejs_fq_poly_divexact,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyGcd", NULL, sagejs_fq_poly_gcd,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyIsIrreducible", NULL, sagejs_fq_poly_is_irreducible,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyToString", NULL, sagejs_fq_poly_to_string,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyCoefficients", NULL, sagejs_fq_poly_coefficients,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyFactor", NULL, sagejs_fq_poly_factor,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqPolyRoots", NULL, sagejs_fq_poly_roots,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrix", NULL, sagejs_fq_matrix,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixAdd", NULL, sagejs_fq_matrix_add,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixSub", NULL, sagejs_fq_matrix_sub,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixMul", NULL, sagejs_fq_matrix_mul,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixNeg", NULL, sagejs_fq_matrix_neg,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixScalarMul", NULL, sagejs_fq_matrix_scalar_mul,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixTranspose", NULL, sagejs_fq_matrix_transpose,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixEqual", NULL, sagejs_fq_matrix_equal,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixEntry", NULL, sagejs_fq_matrix_entry,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixDet", NULL, sagejs_fq_matrix_det,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixRank", NULL, sagejs_fq_matrix_rank,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixRref", NULL, sagejs_fq_matrix_rref,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixRightKernel", NULL, sagejs_fq_matrix_right_kernel,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixSolve", NULL, sagejs_fq_matrix_solve,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixInverse", NULL, sagejs_fq_matrix_inverse,
            NULL, NULL, NULL, napi_default, NULL},
        {"fqMatrixCharpoly", NULL, sagejs_fq_matrix_charpoly,
            NULL, NULL, NULL, napi_default, NULL},
        {"nmodPolyConstant", NULL, nmod_poly_constant, NULL, NULL, NULL,
            napi_default, NULL},
        {"nmodPolyGen", NULL, nmod_poly_gen_value, NULL, NULL, NULL,
            napi_default, NULL},
        {"zzPolyToNmod", NULL, zz_poly_to_nmod, NULL, NULL, NULL,
            napi_default, NULL},
        {"zmodPolyConstant", NULL, zmod_poly_constant, NULL, NULL, NULL,
            napi_default, NULL},
        {"zmodPolyGen", NULL, zmod_poly_gen_value, NULL, NULL, NULL,
            napi_default, NULL},
        {"zzPolyToZmod", NULL, zz_poly_to_zmod, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyAdd", NULL, poly_add, NULL, NULL, NULL, napi_default, NULL},
        {"polySub", NULL, poly_sub, NULL, NULL, NULL, napi_default, NULL},
        {"polyMul", NULL, poly_mul, NULL, NULL, NULL, napi_default, NULL},
        {"polyNeg", NULL, poly_neg, NULL, NULL, NULL, napi_default, NULL},
        {"polyPow", NULL, poly_pow, NULL, NULL, NULL, napi_default, NULL},
        {"polyTruncate", NULL, poly_truncate, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyInflate", NULL, poly_inflate, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyMullow", NULL, poly_mullow, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyPowTrunc", NULL, poly_pow_trunc, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyShiftLeft", NULL, poly_shift_left, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyShiftRight", NULL, poly_shift_right, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyValuation", NULL, poly_valuation, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyInvSeries", NULL, poly_inv_series, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyEqual", NULL, poly_equal, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyDivExact", NULL, poly_divexact_value, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyFactor", NULL, poly_factor_value, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyToString", NULL, poly_to_string, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyCoefficients", NULL, poly_coefficients, NULL, NULL, NULL,
            napi_default, NULL},
        {"ecAnlistIntegral", NULL, elliptic_anlist_integral,
            NULL, NULL, NULL, napi_default, NULL},
        {"ecApIntegral", NULL, elliptic_ap_smalljac_integral,
            NULL, NULL, NULL, napi_default, NULL},
        {"ecScalarMulPrime", NULL, elliptic_scalar_mul_prime,
            NULL, NULL, NULL, napi_default, NULL},
        {"ecScalarMulRational", NULL, elliptic_scalar_mul_rational,
            NULL, NULL, NULL, napi_default, NULL},
        {"ecRankData", NULL, sagejs_ec_rank_data,
            NULL, NULL, NULL, napi_default, NULL},
        {"ecRootNumber", NULL, sagejs_ec_root_number,
            NULL, NULL, NULL, napi_default, NULL},
        {"ecCompletedCentralDerivatives", NULL,
            sagejs_ec_completed_central_derivatives,
            NULL, NULL, NULL, napi_default, NULL},
        {"ecLseriesValues", NULL, sagejs_ec_lseries_values,
            NULL, NULL, NULL, napi_default, NULL},
        {"ecLseriesDirectValues", NULL, sagejs_ec_lseries_direct_values,
            NULL, NULL, NULL, napi_default, NULL},
        {"qqEisensteinSeries", NULL, qq_eisenstein_series,
            NULL, NULL, NULL, napi_default, NULL},
        {"nmodPolyGcd", NULL, nmod_poly_gcd_value, NULL, NULL, NULL,
            napi_default, NULL},
        {"nmodPolyIsIrreducible", NULL, nmod_poly_is_irreducible_value,
            NULL, NULL, NULL, napi_default, NULL},
        {"nmodPolyFactor", NULL, nmod_poly_factor_value, NULL, NULL, NULL,
            napi_default, NULL},
        {"nmodPolyRoots", NULL, nmod_poly_roots_value, NULL, NULL, NULL,
            napi_default, NULL},
        {"polyExactRoots", NULL, exact_poly_roots, NULL, NULL, NULL,
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
        {"realToDouble", NULL, sagejs_real_to_double, NULL, NULL, NULL,
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
        {"complexReal", NULL, sagejs_complex_real, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexImag", NULL, sagejs_complex_imag, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexRealDouble", NULL, sagejs_complex_real_double,
            NULL, NULL, NULL, napi_default, NULL},
        {"complexImagDouble", NULL, sagejs_complex_imag_double,
            NULL, NULL, NULL, napi_default, NULL},
        {"complexEi", NULL, sagejs_complex_ei, NULL, NULL, NULL,
            napi_default, NULL},
        {"complexBesselI", NULL, sagejs_complex_bessel_i,
            NULL, NULL, NULL, napi_default, NULL},
        {"zetaZeros", NULL, sagejs_zeta_zeros, NULL, NULL, NULL,
            napi_default, NULL},
        {"nativeAbiVersion", NULL, native_abi_version, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpfrVersion", NULL, mpfr_version_value, NULL, NULL, NULL,
            napi_default, NULL},
        {"mpcVersion", NULL, mpc_version, NULL, NULL, NULL,
            napi_default, NULL},
        {"gmpVersion", NULL, gmp_version_value, NULL, NULL, NULL,
            napi_default, NULL},
        {"smalljacVersion", NULL, smalljac_version_value,
            NULL, NULL, NULL, napi_default, NULL},
        {"blasEnabled", NULL, blas_enabled, NULL, NULL, NULL,
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
