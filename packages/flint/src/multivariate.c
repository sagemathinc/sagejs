#include <limits.h>
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <node_api.h>

#include <flint/flint.h>
#include <flint/fmpq.h>
#include <flint/fmpq_mpoly.h>
#include <flint/fmpz.h>
#include <flint/fmpz_mpoly.h>
#include <flint/nmod_mpoly.h>
#include <flint/ulong_extras.h>

#include "multivariate.h"

typedef enum
{
    SAGEJS_MPOLY_ZZ,
    SAGEJS_MPOLY_QQ,
    SAGEJS_MPOLY_NMOD
} sagejs_mpoly_kind;

typedef struct
{
    uint64_t magic;
    sagejs_mpoly_kind kind;
    slong nvars;
    size_t references;
    union
    {
        fmpz_mpoly_ctx_struct zz[1];
        fmpq_mpoly_ctx_struct qq[1];
        nmod_mpoly_ctx_struct nmod[1];
    } value;
} sagejs_mpoly_context_value;

typedef struct
{
    uint64_t magic;
    sagejs_mpoly_context_value *context;
    union
    {
        fmpz_mpoly_struct zz[1];
        fmpq_mpoly_struct qq[1];
        nmod_mpoly_struct nmod[1];
    } value;
} sagejs_mpoly_value;

#define SAGEJS_MPOLY_CONTEXT_MAGIC UINT64_C(0x534147454A4D5043)
#define SAGEJS_MPOLY_VALUE_MAGIC UINT64_C(0x534147454A4D5056)

static const napi_type_tag context_type_tag = {
    UINT64_C(0x2f18b1a119924761), UINT64_C(0xa58acdb978059918)};
static const napi_type_tag value_type_tag = {
    UINT64_C(0x7272e2f96b024e4a), UINT64_C(0xb36f48254333b922)};

static int check_napi(napi_env env, napi_status status)
{
    const napi_extended_error_info *info;
    if (status == napi_ok)
        return 1;
    napi_get_last_error_info(env, &info);
    napi_throw_error(env, NULL,
        info != NULL && info->error_message != NULL
            ? info->error_message : "Node-API call failed");
    return 0;
}

static int require_arguments(napi_env env, napi_callback_info info,
    size_t expected, napi_value *args)
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
            napi_get_value_string_utf8(env, value, result, length + 1, &length)))
    {
        free(result);
        return NULL;
    }
    return result;
}

static int value_to_slong(napi_env env, napi_value value, slong minimum,
    slong maximum, const char *message, slong *result)
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
    if (!isfinite(number) || floor(number) != number ||
        number < (double) minimum || number > (double) maximum)
    {
        napi_throw_range_error(env, NULL, message);
        return 0;
    }
    *result = (slong) number;
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

static ordering_t parse_order(napi_env env, napi_value value)
{
    char *order = value_to_string(env, value);
    ordering_t result = ORD_DEGREVLEX;
    if (order == NULL)
        return result;
    if (strcmp(order, "degrevlex") == 0)
        result = ORD_DEGREVLEX;
    else if (strcmp(order, "deglex") == 0)
        result = ORD_DEGLEX;
    else if (strcmp(order, "lex") == 0)
        result = ORD_LEX;
    else
        napi_throw_range_error(env, NULL,
            "term order must be 'degrevlex', 'deglex', or 'lex'");
    free(order);
    return result;
}

static void release_context(sagejs_mpoly_context_value *context)
{
    if (context == NULL || context->magic != SAGEJS_MPOLY_CONTEXT_MAGIC)
        return;
    if (--context->references != 0)
        return;
    if (context->kind == SAGEJS_MPOLY_ZZ)
        fmpz_mpoly_ctx_clear(context->value.zz);
    else if (context->kind == SAGEJS_MPOLY_QQ)
        fmpq_mpoly_ctx_clear(context->value.qq);
    else
        nmod_mpoly_ctx_clear(context->value.nmod);
    context->magic = 0;
    free(context);
}

static void finalize_context(napi_env env, void *data, void *hint)
{
    (void) env; (void) hint;
    release_context(data);
}

static void finalize_value(napi_env env, void *data, void *hint)
{
    sagejs_mpoly_value *poly = data;
    (void) env; (void) hint;
    if (poly == NULL || poly->magic != SAGEJS_MPOLY_VALUE_MAGIC)
        return;
    if (poly->context->kind == SAGEJS_MPOLY_ZZ)
        fmpz_mpoly_clear(poly->value.zz, poly->context->value.zz);
    else if (poly->context->kind == SAGEJS_MPOLY_QQ)
        fmpq_mpoly_clear(poly->value.qq, poly->context->value.qq);
    else
        nmod_mpoly_clear(poly->value.nmod, poly->context->value.nmod);
    release_context(poly->context);
    poly->magic = 0;
    free(poly);
}

static sagejs_mpoly_context_value *unwrap_context(
    napi_env env, napi_value object)
{
    sagejs_mpoly_context_value *context = NULL;
    bool tagged = false;
    if (!check_napi(env,
            napi_check_object_type_tag(env, object, &context_type_tag, &tagged)))
        return NULL;
    if (!tagged)
    {
        napi_throw_type_error(env, NULL,
            "expected a Sage.js FLINT multivariate context");
        return NULL;
    }
    if (!check_napi(env, napi_unwrap(env, object, (void **) &context)))
        return NULL;
    if (context == NULL || context->magic != SAGEJS_MPOLY_CONTEXT_MAGIC)
    {
        napi_throw_error(env, NULL, "invalid multivariate context");
        return NULL;
    }
    return context;
}

static sagejs_mpoly_value *unwrap_value(napi_env env, napi_value object)
{
    sagejs_mpoly_value *poly = NULL;
    bool tagged = false;
    if (!check_napi(env,
            napi_check_object_type_tag(env, object, &value_type_tag, &tagged)))
        return NULL;
    if (!tagged)
    {
        napi_throw_type_error(env, NULL,
            "expected a Sage.js FLINT multivariate polynomial");
        return NULL;
    }
    if (!check_napi(env, napi_unwrap(env, object, (void **) &poly)))
        return NULL;
    if (poly == NULL || poly->magic != SAGEJS_MPOLY_VALUE_MAGIC)
    {
        napi_throw_error(env, NULL, "invalid multivariate polynomial");
        return NULL;
    }
    return poly;
}

static sagejs_mpoly_value *unwrap_pair(napi_env env, napi_value left_value,
    napi_value right_value, sagejs_mpoly_value **right)
{
    sagejs_mpoly_value *left = unwrap_value(env, left_value);
    if (left == NULL)
        return NULL;
    *right = unwrap_value(env, right_value);
    if (*right == NULL)
        return NULL;
    if (left->context != (*right)->context)
    {
        napi_throw_type_error(env, NULL,
            "multivariate polynomials have different parents");
        return NULL;
    }
    return left;
}

static napi_value create_value(
    napi_env env, sagejs_mpoly_context_value *context)
{
    sagejs_mpoly_value *poly = calloc(1, sizeof(*poly));
    napi_value object;
    if (poly == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate polynomial");
        return NULL;
    }
    poly->magic = SAGEJS_MPOLY_VALUE_MAGIC;
    poly->context = context;
    context->references++;
    if (context->kind == SAGEJS_MPOLY_ZZ)
        fmpz_mpoly_init(poly->value.zz, context->value.zz);
    else if (context->kind == SAGEJS_MPOLY_QQ)
        fmpq_mpoly_init(poly->value.qq, context->value.qq);
    else
        nmod_mpoly_init(poly->value.nmod, context->value.nmod);
    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env, napi_type_tag_object(env, object, &value_type_tag)) ||
        !check_napi(env,
            napi_wrap(env, object, poly, finalize_value, NULL, NULL)))
    {
        finalize_value(env, poly, NULL);
        return NULL;
    }
    return object;
}

napi_value sagejs_mpoly_context(napi_env env, napi_callback_info info)
{
    napi_value args[4], object;
    char *kind;
    slong nvars;
    ordering_t order;
    fmpz_t modulus;
    sagejs_mpoly_context_value *context;
    if (!require_arguments(env, info, 4, args))
        return NULL;
    kind = value_to_string(env, args[0]);
    if (kind == NULL)
        return NULL;
    if (!value_to_slong(env, args[1], 1, WORD_MAX,
            "number of variables must be a positive integer", &nvars))
    {
        free(kind);
        return NULL;
    }
    order = parse_order(env, args[2]);
    {
        bool pending = false;
        if (!check_napi(env, napi_is_exception_pending(env, &pending)) ||
            pending)
        {
            free(kind);
            return NULL;
        }
    }
    context = calloc(1, sizeof(*context));
    if (context == NULL)
    {
        free(kind);
        napi_throw_error(env, NULL, "unable to allocate context");
        return NULL;
    }
    context->nvars = nvars;
    context->references = 1;
    if (strcmp(kind, "zz") == 0)
    {
        context->kind = SAGEJS_MPOLY_ZZ;
        fmpz_mpoly_ctx_init(context->value.zz, nvars, order);
    }
    else if (strcmp(kind, "qq") == 0)
    {
        context->kind = SAGEJS_MPOLY_QQ;
        fmpq_mpoly_ctx_init(context->value.qq, nvars, order);
    }
    else if (strcmp(kind, "nmod") == 0)
    {
        fmpz_init(modulus);
        if (!bigint_to_fmpz(env, args[3], modulus) ||
            !fmpz_abs_fits_ui(modulus) || fmpz_cmp_ui(modulus, 2) < 0)
        {
            fmpz_clear(modulus);
            free(context);
            free(kind);
            napi_throw_range_error(env, NULL,
                "modulus must be at least 2 and fit a FLINT word");
            return NULL;
        }
        context->kind = SAGEJS_MPOLY_NMOD;
        nmod_mpoly_ctx_init(
            context->value.nmod, nvars, order, fmpz_get_ui(modulus));
        fmpz_clear(modulus);
    }
    else
    {
        free(context);
        free(kind);
        napi_throw_range_error(env, NULL,
            "coefficient kind must be 'zz', 'qq', or 'nmod'");
        return NULL;
    }
    free(kind);
    context->magic = SAGEJS_MPOLY_CONTEXT_MAGIC;
    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env, napi_type_tag_object(env, object, &context_type_tag)) ||
        !check_napi(env,
            napi_wrap(env, object, context, finalize_context, NULL, NULL)))
    {
        finalize_context(env, context, NULL);
        return NULL;
    }
    return object;
}

napi_value sagejs_mpoly_constant(napi_env env, napi_callback_info info)
{
    napi_value args[3], object;
    sagejs_mpoly_context_value *context;
    sagejs_mpoly_value *poly;
    fmpz_t numerator, denominator;
    fmpq_t rational;
    ulong p, a, b;
    if (!require_arguments(env, info, 3, args) ||
        (context = unwrap_context(env, args[0])) == NULL)
        return NULL;
    fmpz_init(numerator);
    fmpz_init(denominator);
    if (!bigint_to_fmpz(env, args[1], numerator) ||
        !bigint_to_fmpz(env, args[2], denominator))
    {
        fmpz_clear(numerator); fmpz_clear(denominator);
        return NULL;
    }
    if (fmpz_is_zero(denominator))
    {
        fmpz_clear(numerator); fmpz_clear(denominator);
        napi_throw_range_error(env, NULL, "denominator must be nonzero");
        return NULL;
    }
    object = create_value(env, context);
    if (object == NULL)
    {
        fmpz_clear(numerator); fmpz_clear(denominator);
        return NULL;
    }
    poly = unwrap_value(env, object);
    if (context->kind == SAGEJS_MPOLY_ZZ)
    {
        if (!fmpz_is_one(denominator))
        {
            fmpz_clear(numerator); fmpz_clear(denominator);
            napi_throw_range_error(env, NULL,
                "integer polynomial coefficient is not integral");
            return NULL;
        }
        fmpz_mpoly_set_fmpz(poly->value.zz, numerator, context->value.zz);
    }
    else if (context->kind == SAGEJS_MPOLY_QQ)
    {
        fmpq_init(rational);
        fmpq_set_fmpz_frac(rational, numerator, denominator);
        fmpq_canonicalise(rational);
        fmpq_mpoly_set_fmpq(poly->value.qq, rational, context->value.qq);
        fmpq_clear(rational);
    }
    else
    {
        p = context->value.nmod->mod.n;
        a = fmpz_fdiv_ui(numerator, p);
        b = fmpz_fdiv_ui(denominator, p);
        if (b == 0)
        {
            fmpz_clear(numerator); fmpz_clear(denominator);
            napi_throw_range_error(env, NULL,
                "coefficient denominator is zero modulo the characteristic");
            return NULL;
        }
        nmod_mpoly_set_ui(
            poly->value.nmod, n_mulmod2_preinv(a, n_invmod(b, p),
                p, context->value.nmod->mod.ninv), context->value.nmod);
    }
    fmpz_clear(numerator); fmpz_clear(denominator);
    return object;
}

napi_value sagejs_mpoly_gen(napi_env env, napi_callback_info info)
{
    napi_value args[2], object;
    sagejs_mpoly_context_value *context;
    sagejs_mpoly_value *poly;
    slong index;
    if (!require_arguments(env, info, 2, args) ||
        (context = unwrap_context(env, args[0])) == NULL ||
        !value_to_slong(env, args[1], 0, context->nvars - 1,
            "generator index is out of range", &index))
        return NULL;
    object = create_value(env, context);
    if (object == NULL)
        return NULL;
    poly = unwrap_value(env, object);
    if (context->kind == SAGEJS_MPOLY_ZZ)
        fmpz_mpoly_gen(poly->value.zz, index, context->value.zz);
    else if (context->kind == SAGEJS_MPOLY_QQ)
        fmpq_mpoly_gen(poly->value.qq, index, context->value.qq);
    else
        nmod_mpoly_gen(poly->value.nmod, index, context->value.nmod);
    return object;
}

typedef enum { OP_ADD, OP_SUB, OP_MUL } binary_op;

static napi_value binary(napi_env env, napi_callback_info info, binary_op op)
{
    napi_value args[2], object;
    sagejs_mpoly_value *left, *right, *result;
    if (!require_arguments(env, info, 2, args) ||
        (left = unwrap_pair(env, args[0], args[1], &right)) == NULL)
        return NULL;
    object = create_value(env, left->context);
    if (object == NULL)
        return NULL;
    result = unwrap_value(env, object);
    if (left->context->kind == SAGEJS_MPOLY_ZZ)
    {
        if (op == OP_ADD) fmpz_mpoly_add(result->value.zz, left->value.zz,
            right->value.zz, left->context->value.zz);
        else if (op == OP_SUB) fmpz_mpoly_sub(result->value.zz, left->value.zz,
            right->value.zz, left->context->value.zz);
        else fmpz_mpoly_mul(result->value.zz, left->value.zz,
            right->value.zz, left->context->value.zz);
    }
    else if (left->context->kind == SAGEJS_MPOLY_QQ)
    {
        if (op == OP_ADD) fmpq_mpoly_add(result->value.qq, left->value.qq,
            right->value.qq, left->context->value.qq);
        else if (op == OP_SUB) fmpq_mpoly_sub(result->value.qq, left->value.qq,
            right->value.qq, left->context->value.qq);
        else fmpq_mpoly_mul(result->value.qq, left->value.qq,
            right->value.qq, left->context->value.qq);
    }
    else
    {
        if (op == OP_ADD) nmod_mpoly_add(result->value.nmod, left->value.nmod,
            right->value.nmod, left->context->value.nmod);
        else if (op == OP_SUB) nmod_mpoly_sub(result->value.nmod,
            left->value.nmod, right->value.nmod, left->context->value.nmod);
        else nmod_mpoly_mul(result->value.nmod, left->value.nmod,
            right->value.nmod, left->context->value.nmod);
    }
    return object;
}

napi_value sagejs_mpoly_add(napi_env e, napi_callback_info i)
{ return binary(e, i, OP_ADD); }
napi_value sagejs_mpoly_sub(napi_env e, napi_callback_info i)
{ return binary(e, i, OP_SUB); }
napi_value sagejs_mpoly_mul(napi_env e, napi_callback_info i)
{ return binary(e, i, OP_MUL); }

napi_value sagejs_mpoly_neg(napi_env env, napi_callback_info info)
{
    napi_value args[1], object;
    sagejs_mpoly_value *value, *result;
    if (!require_arguments(env, info, 1, args) ||
        (value = unwrap_value(env, args[0])) == NULL)
        return NULL;
    object = create_value(env, value->context);
    if (object == NULL)
        return NULL;
    result = unwrap_value(env, object);
    if (value->context->kind == SAGEJS_MPOLY_ZZ)
        fmpz_mpoly_neg(result->value.zz, value->value.zz,
            value->context->value.zz);
    else if (value->context->kind == SAGEJS_MPOLY_QQ)
        fmpq_mpoly_neg(result->value.qq, value->value.qq,
            value->context->value.qq);
    else
        nmod_mpoly_neg(result->value.nmod, value->value.nmod,
            value->context->value.nmod);
    return object;
}

napi_value sagejs_mpoly_pow(napi_env env, napi_callback_info info)
{
    napi_value args[2], object;
    sagejs_mpoly_value *value, *result;
    slong exponent;
    if (!require_arguments(env, info, 2, args) ||
        (value = unwrap_value(env, args[0])) == NULL ||
        !value_to_slong(env, args[1], 0, WORD_MAX,
            "exponent must be a nonnegative integer", &exponent))
        return NULL;
    object = create_value(env, value->context);
    if (object == NULL)
        return NULL;
    result = unwrap_value(env, object);
    if (value->context->kind == SAGEJS_MPOLY_ZZ)
        fmpz_mpoly_pow_ui(result->value.zz, value->value.zz,
            (ulong) exponent, value->context->value.zz);
    else if (value->context->kind == SAGEJS_MPOLY_QQ)
        fmpq_mpoly_pow_ui(result->value.qq, value->value.qq,
            (ulong) exponent, value->context->value.qq);
    else
        nmod_mpoly_pow_ui(result->value.nmod, value->value.nmod,
            (ulong) exponent, value->context->value.nmod);
    return object;
}

napi_value sagejs_mpoly_equal(napi_env env, napi_callback_info info)
{
    napi_value args[2], result;
    sagejs_mpoly_value *left, *right;
    int equal;
    if (!require_arguments(env, info, 2, args) ||
        (left = unwrap_pair(env, args[0], args[1], &right)) == NULL)
        return NULL;
    if (left->context->kind == SAGEJS_MPOLY_ZZ)
        equal = fmpz_mpoly_equal(left->value.zz, right->value.zz,
            left->context->value.zz);
    else if (left->context->kind == SAGEJS_MPOLY_QQ)
        equal = fmpq_mpoly_equal(left->value.qq, right->value.qq,
            left->context->value.qq);
    else
        equal = nmod_mpoly_equal(left->value.nmod, right->value.nmod,
            left->context->value.nmod);
    if (!check_napi(env, napi_get_boolean(env, equal != 0, &result)))
        return NULL;
    return result;
}

static napi_value divides_or_gcd(napi_env env, napi_callback_info info,
    int gcd)
{
    napi_value args[2], object;
    sagejs_mpoly_value *left, *right, *result;
    int success;
    if (!require_arguments(env, info, 2, args) ||
        (left = unwrap_pair(env, args[0], args[1], &right)) == NULL)
        return NULL;
    object = create_value(env, left->context);
    if (object == NULL)
        return NULL;
    result = unwrap_value(env, object);
    if (left->context->kind == SAGEJS_MPOLY_ZZ)
        success = gcd
            ? fmpz_mpoly_gcd(result->value.zz, left->value.zz,
                right->value.zz, left->context->value.zz)
            : fmpz_mpoly_divides(result->value.zz, left->value.zz,
                right->value.zz, left->context->value.zz);
    else if (left->context->kind == SAGEJS_MPOLY_QQ)
        success = gcd
            ? fmpq_mpoly_gcd(result->value.qq, left->value.qq,
                right->value.qq, left->context->value.qq)
            : fmpq_mpoly_divides(result->value.qq, left->value.qq,
                right->value.qq, left->context->value.qq);
    else
        success = gcd
            ? nmod_mpoly_gcd(result->value.nmod, left->value.nmod,
                right->value.nmod, left->context->value.nmod)
            : nmod_mpoly_divides(result->value.nmod, left->value.nmod,
                right->value.nmod, left->context->value.nmod);
    if (!success)
    {
        napi_throw_range_error(env, NULL, gcd
            ? "FLINT could not compute the multivariate gcd"
            : "polynomial division is not exact");
        return NULL;
    }
    return object;
}

napi_value sagejs_mpoly_divexact(napi_env e, napi_callback_info i)
{ return divides_or_gcd(e, i, 0); }
napi_value sagejs_mpoly_gcd(napi_env e, napi_callback_info i)
{ return divides_or_gcd(e, i, 1); }

napi_value sagejs_mpoly_compose_gen(
    napi_env env, napi_callback_info info)
{
    napi_value args[3], item, object;
    sagejs_mpoly_value *source, *result;
    sagejs_mpoly_context_value *target;
    bool is_array;
    uint32_t length, index;
    slong *mapping;
    if (!require_arguments(env, info, 3, args) ||
        (source = unwrap_value(env, args[0])) == NULL ||
        (target = unwrap_context(env, args[1])) == NULL ||
        !check_napi(env, napi_is_array(env, args[2], &is_array)) ||
        !is_array ||
        !check_napi(env, napi_get_array_length(env, args[2], &length)))
        return NULL;
    if (source->context->kind != target->kind ||
        source->context->nvars != target->nvars ||
        (target->kind == SAGEJS_MPOLY_NMOD &&
            source->context->value.nmod->mod.n != target->value.nmod->mod.n))
    {
        napi_throw_type_error(env, NULL,
            "incompatible multivariate polynomial contexts");
        return NULL;
    }
    if ((slong) length != source->context->nvars)
    {
        napi_throw_range_error(env, NULL,
            "generator map has the wrong length");
        return NULL;
    }
    mapping = malloc(length * sizeof(*mapping));
    if (mapping == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate generator map");
        return NULL;
    }
    for (index = 0; index < length; index++)
    {
        if (!check_napi(env,
                napi_get_element(env, args[2], index, &item)) ||
            !value_to_slong(env, item, 0, target->nvars - 1,
                "generator-map index is out of range", &mapping[index]))
        {
            free(mapping);
            return NULL;
        }
    }
    object = create_value(env, target);
    if (object == NULL)
    {
        free(mapping);
        return NULL;
    }
    result = unwrap_value(env, object);
    if (target->kind == SAGEJS_MPOLY_ZZ)
        fmpz_mpoly_compose_fmpz_mpoly_gen(
            result->value.zz, source->value.zz, mapping,
            source->context->value.zz, target->value.zz);
    else if (target->kind == SAGEJS_MPOLY_QQ)
        fmpq_mpoly_compose_fmpq_mpoly_gen(
            result->value.qq, source->value.qq, mapping,
            source->context->value.qq, target->value.qq);
    else
        nmod_mpoly_compose_nmod_mpoly_gen(
            result->value.nmod, source->value.nmod, mapping,
            source->context->value.nmod, target->value.nmod);
    free(mapping);
    return object;
}

static char **value_to_names(napi_env env, napi_value value, slong count)
{
    bool is_array;
    uint32_t length, i;
    napi_value item;
    char **names;
    if (!check_napi(env, napi_is_array(env, value, &is_array)) || !is_array ||
        !check_napi(env, napi_get_array_length(env, value, &length)))
        return NULL;
    if ((slong) length != count)
    {
        napi_throw_range_error(env, NULL,
            "variable-name array has the wrong length");
        return NULL;
    }
    names = calloc(length, sizeof(*names));
    if (names == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate variable names");
        return NULL;
    }
    for (i = 0; i < length; i++)
    {
        if (!check_napi(env, napi_get_element(env, value, i, &item)) ||
            (names[i] = value_to_string(env, item)) == NULL)
        {
            while (i > 0) free(names[--i]);
            free(names);
            return NULL;
        }
    }
    return names;
}

napi_value sagejs_mpoly_to_string(napi_env env, napi_callback_info info)
{
    napi_value args[2], result;
    sagejs_mpoly_value *poly;
    char **names, *text;
    slong i;
    if (!require_arguments(env, info, 2, args) ||
        (poly = unwrap_value(env, args[0])) == NULL ||
        (names = value_to_names(env, args[1], poly->context->nvars)) == NULL)
        return NULL;
    if (poly->context->kind == SAGEJS_MPOLY_ZZ)
        text = fmpz_mpoly_get_str_pretty(poly->value.zz,
            (const char **) names, poly->context->value.zz);
    else if (poly->context->kind == SAGEJS_MPOLY_QQ)
        text = fmpq_mpoly_get_str_pretty(poly->value.qq,
            (const char **) names, poly->context->value.qq);
    else
        text = nmod_mpoly_get_str_pretty(poly->value.nmod,
            (const char **) names, poly->context->value.nmod);
    for (i = 0; i < poly->context->nvars; i++) free(names[i]);
    free(names);
    if (text == NULL)
    {
        napi_throw_error(env, NULL, "FLINT could not format polynomial");
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

static napi_value integer_property(napi_env env, napi_callback_info info,
    int property)
{
    napi_value args[2], result;
    sagejs_mpoly_value *poly;
    slong value, variable = 0;
    if (!require_arguments(env, info, property == 1 ? 2 : 1, args) ||
        (poly = unwrap_value(env, args[0])) == NULL)
        return NULL;
    if (property == 1 &&
        !value_to_slong(env, args[1], 0, poly->context->nvars - 1,
            "variable index is out of range", &variable))
        return NULL;
    if (poly->context->kind == SAGEJS_MPOLY_ZZ)
        value = property == 0 ? fmpz_mpoly_length(poly->value.zz,
                    poly->context->value.zz)
            : property == 1 ? fmpz_mpoly_degree_si(poly->value.zz, variable,
                    poly->context->value.zz)
            : fmpz_mpoly_total_degree_si(poly->value.zz,
                    poly->context->value.zz);
    else if (poly->context->kind == SAGEJS_MPOLY_QQ)
        value = property == 0 ? fmpq_mpoly_length(poly->value.qq,
                    poly->context->value.qq)
            : property == 1 ? fmpq_mpoly_degree_si(poly->value.qq, variable,
                    poly->context->value.qq)
            : fmpq_mpoly_total_degree_si(poly->value.qq,
                    poly->context->value.qq);
    else
        value = property == 0 ? nmod_mpoly_length(poly->value.nmod,
                    poly->context->value.nmod)
            : property == 1 ? nmod_mpoly_degree_si(poly->value.nmod, variable,
                    poly->context->value.nmod)
            : nmod_mpoly_total_degree_si(poly->value.nmod,
                    poly->context->value.nmod);
    if (!check_napi(env, napi_create_int64(env, value, &result)))
        return NULL;
    return result;
}

napi_value sagejs_mpoly_length(napi_env e, napi_callback_info i)
{ return integer_property(e, i, 0); }
napi_value sagejs_mpoly_degree(napi_env e, napi_callback_info i)
{ return integer_property(e, i, 1); }
napi_value sagejs_mpoly_total_degree(napi_env e, napi_callback_info i)
{ return integer_property(e, i, 2); }
