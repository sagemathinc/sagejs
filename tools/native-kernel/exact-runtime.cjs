"use strict";

/*
 * Canonical host-independent exact-integer representation runtime.  Keeping
 * this outside the Node emitter makes kernel_core.c the primary artifact;
 * adapters consume it but never define mathematical execution.
 */
function generateExactCoreRuntime() {
  return String.raw`
static void set_mpz_uint64(mpz_t target, uint64_t value)
{
#if ULONG_MAX >= UINT64_MAX
    mpz_set_ui(target, (unsigned long) value);
#else
    mpz_import(target, 1, -1, sizeof(value), 0, 0, &value);
#endif
}

static void set_mpz_int64(mpz_t target, int64_t value)
{
    const int negative = value < 0;
    const uint64_t magnitude = negative
        ? (uint64_t) (-(value + 1)) + UINT64_C(1)
        : (uint64_t) value;
    set_mpz_uint64(target, magnitude);
    if (negative)
        mpz_neg(target, target);
}

static int mpz_to_int64(const mpz_t value, int64_t *result)
{
    const int sign = mpz_sgn(value);
    size_t count = 0;
    uint64_t magnitude = 0;
    if (sign == 0)
    {
        *result = 0;
        return 1;
    }
    mpz_export(&magnitude, &count, -1, sizeof(magnitude), 0, 0, value);
    if (count > 1)
        return 0;
    if (sign > 0)
    {
        if (magnitude > (uint64_t) INT64_MAX)
            return 0;
        *result = (int64_t) magnitude;
        return 1;
    }
    if (magnitude > (UINT64_C(1) << 63))
        return 0;
    if (magnitude == (UINT64_C(1) << 63))
        *result = INT64_MIN;
    else
        *result = -(int64_t) magnitude;
    return 1;
}

#define SAGEJS_WORD_PROMOTE 0
#define SAGEJS_WORD_OK 1
#define SAGEJS_WORD_ERROR -1

#if defined(_MSC_VER)
#define SAGEJS_WORD_INLINE static __forceinline
#elif defined(__GNUC__) || defined(__clang__)
#define SAGEJS_WORD_INLINE static inline __attribute__((always_inline))
#else
#define SAGEJS_WORD_INLINE static inline
#endif

static int sagejs_word_add_int64(int64_t left, int64_t right, int64_t *result)
{
#if defined(__GNUC__) || defined(__clang__)
    int64_t temporary;
    if (__builtin_add_overflow(left, right, &temporary))
        return 0;
    *result = temporary;
    return 1;
#else
    if ((right > 0 && left > INT64_MAX - right) ||
        (right < 0 && left < INT64_MIN - right))
        return 0;
    *result = left + right;
    return 1;
#endif
}

static int sagejs_word_sub_int64(int64_t left, int64_t right, int64_t *result)
{
#if defined(__GNUC__) || defined(__clang__)
    int64_t temporary;
    if (__builtin_sub_overflow(left, right, &temporary))
        return 0;
    *result = temporary;
    return 1;
#else
    if ((right > 0 && left < INT64_MIN + right) ||
        (right < 0 && left > INT64_MAX + right))
        return 0;
    *result = left - right;
    return 1;
#endif
}

static int sagejs_word_mul_int64(int64_t left, int64_t right, int64_t *result)
{
#if defined(__GNUC__) || defined(__clang__)
    int64_t temporary;
    if (__builtin_mul_overflow(left, right, &temporary))
        return 0;
    *result = temporary;
    return 1;
#else
    if (left == 0 || right == 0)
    {
        *result = 0;
        return 1;
    }
    if ((left == -1 && right == INT64_MIN) ||
        (right == -1 && left == INT64_MIN))
        return 0;
    if ((left > 0 && right > 0 && left > INT64_MAX / right) ||
        (left > 0 && right < 0 && right < INT64_MIN / left) ||
        (left < 0 && right > 0 && left < INT64_MIN / right) ||
        (left < 0 && right < 0 && left < INT64_MAX / right))
        return 0;
    *result = left * right;
    return 1;
#endif
}

static int sagejs_word_pow_int64(
    int64_t base, uint64_t exponent, int64_t *result)
{
    int64_t answer = 1;
    while (exponent != 0)
    {
        if ((exponent & UINT64_C(1)) != 0 &&
            !sagejs_word_mul_int64(answer, base, &answer))
            return 0;
        exponent >>= 1;
        if (exponent != 0 &&
            !sagejs_word_mul_int64(base, base, &base))
            return 0;
    }
    *result = answer;
    return 1;
}

static void sagejs_word_fdiv_int64(
    int64_t left, int64_t right, int64_t *quotient, int64_t *remainder)
{
    int64_t q = left / right;
    int64_t r = left % right;
    if (r != 0 && ((r < 0) != (right < 0)))
    {
        q -= 1;
        r += right;
    }
    if (quotient != NULL)
        *quotient = q;
    if (remainder != NULL)
        *remainder = r;
}

typedef struct
{
    int is_big;
    int big_initialized;
    int64_t small;
    mpz_t big;
} sagejs_tagged_int;

static void sagejs_tagged_init(sagejs_tagged_int *value)
{
    value->is_big = 0;
    value->big_initialized = 0;
    value->small = 0;
}

static void sagejs_tagged_clear(sagejs_tagged_int *value)
{
    if (value->big_initialized)
        mpz_clear(value->big);
    value->is_big = 0;
    value->big_initialized = 0;
    value->small = 0;
}

static void sagejs_tagged_set_small(
    sagejs_tagged_int *value, int64_t small)
{
    value->small = small;
    value->is_big = 0;
}

static void sagejs_tagged_make_big(sagejs_tagged_int *value)
{
    if (!value->big_initialized)
    {
        mpz_init(value->big);
        value->big_initialized = 1;
    }
    if (!value->is_big)
        set_mpz_int64(value->big, value->small);
    value->is_big = 1;
}

static void sagejs_tagged_copy(
    sagejs_tagged_int *target, sagejs_tagged_int *source)
{
    if (target == source)
        return;
    if (!source->is_big)
    {
        sagejs_tagged_set_small(target, source->small);
        return;
    }
    sagejs_tagged_make_big(target);
    mpz_set(target->big, source->big);
}

static int sagejs_tagged_set_decimal(
    sagejs_tagged_int *target, const char *value)
{
    sagejs_tagged_make_big(target);
    return mpz_set_str(target->big, value, 10) == 0;
}

static void sagejs_tagged_set_uint64(
    sagejs_tagged_int *target, uint64_t value)
{
    if (value <= (uint64_t) INT64_MAX)
    {
        sagejs_tagged_set_small(target, (int64_t) value);
        return;
    }
    sagejs_tagged_make_big(target);
    set_mpz_uint64(target->big, value);
}

static void sagejs_tagged_set_double(
    sagejs_tagged_int *target, double value)
{
    if (value >= -9223372036854775808.0 &&
        value < 9223372036854775808.0)
    {
        sagejs_tagged_set_small(target, (int64_t) value);
        return;
    }
    sagejs_tagged_make_big(target);
    mpz_set_d(target->big, value);
}

static int sagejs_tagged_to_int64(
    sagejs_tagged_int *value, int64_t *result)
{
    if (!value->is_big)
    {
        *result = value->small;
        return 1;
    }
    return mpz_to_int64(value->big, result);
}

static int sagejs_tagged_sgn(sagejs_tagged_int *value)
{
    if (value->is_big)
        return mpz_sgn(value->big);
    return (value->small > 0) - (value->small < 0);
}

static double sagejs_tagged_get_double(sagejs_tagged_int *value)
{
    return value->is_big ? mpz_get_d(value->big) : (double) value->small;
}

static void sagejs_tagged_add(
    sagejs_tagged_int *target,
    sagejs_tagged_int *left,
    sagejs_tagged_int *right)
{
    int64_t result;
    if (!left->is_big && !right->is_big &&
        sagejs_word_add_int64(left->small, right->small, &result))
    {
        sagejs_tagged_set_small(target, result);
        return;
    }
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    sagejs_tagged_make_big(target);
    mpz_add(target->big, left->big, right->big);
}

static void sagejs_tagged_sub(
    sagejs_tagged_int *target,
    sagejs_tagged_int *left,
    sagejs_tagged_int *right)
{
    int64_t result;
    if (!left->is_big && !right->is_big &&
        sagejs_word_sub_int64(left->small, right->small, &result))
    {
        sagejs_tagged_set_small(target, result);
        return;
    }
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    sagejs_tagged_make_big(target);
    mpz_sub(target->big, left->big, right->big);
}

static void sagejs_tagged_mul(
    sagejs_tagged_int *target,
    sagejs_tagged_int *left,
    sagejs_tagged_int *right)
{
    int64_t result;
    if (!left->is_big && !right->is_big &&
        sagejs_word_mul_int64(left->small, right->small, &result))
    {
        sagejs_tagged_set_small(target, result);
        return;
    }
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    sagejs_tagged_make_big(target);
    mpz_mul(target->big, left->big, right->big);
}

static void sagejs_tagged_neg(
    sagejs_tagged_int *target, sagejs_tagged_int *source)
{
    if (!source->is_big && source->small != INT64_MIN)
    {
        sagejs_tagged_set_small(target, -source->small);
        return;
    }
    sagejs_tagged_make_big(source);
    sagejs_tagged_make_big(target);
    mpz_neg(target->big, source->big);
}

static void sagejs_tagged_abs(
    sagejs_tagged_int *target, sagejs_tagged_int *source)
{
    if (!source->is_big && source->small != INT64_MIN)
    {
        sagejs_tagged_set_small(
            target, source->small < 0 ? -source->small : source->small);
        return;
    }
    sagejs_tagged_make_big(source);
    sagejs_tagged_make_big(target);
    mpz_abs(target->big, source->big);
}

static void sagejs_tagged_pow_ui(
    sagejs_tagged_int *target,
    sagejs_tagged_int *base,
    uint64_t exponent)
{
    int64_t result;
    if (!base->is_big &&
        sagejs_word_pow_int64(base->small, exponent, &result))
    {
        sagejs_tagged_set_small(target, result);
        return;
    }
    sagejs_tagged_make_big(base);
    sagejs_tagged_make_big(target);
    mpz_pow_ui(target->big, base->big, (unsigned long) exponent);
}

static int sagejs_tagged_cmp(
    sagejs_tagged_int *left, sagejs_tagged_int *right)
{
    if (!left->is_big && !right->is_big)
        return (left->small > right->small) - (left->small < right->small);
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    return mpz_cmp(left->big, right->big);
}

static void sagejs_tagged_floordiv(
    sagejs_tagged_int *target,
    sagejs_tagged_int *left,
    sagejs_tagged_int *right)
{
    int64_t quotient;
    if (!left->is_big && !right->is_big &&
        !(left->small == INT64_MIN && right->small == -1))
    {
        sagejs_word_fdiv_int64(left->small, right->small, &quotient, NULL);
        sagejs_tagged_set_small(target, quotient);
        return;
    }
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    sagejs_tagged_make_big(target);
    mpz_fdiv_q(target->big, left->big, right->big);
}

static void sagejs_tagged_mod(
    sagejs_tagged_int *target,
    sagejs_tagged_int *left,
    sagejs_tagged_int *right)
{
    int64_t remainder;
    if (!left->is_big && !right->is_big &&
        !(left->small == INT64_MIN && right->small == -1))
    {
        sagejs_word_fdiv_int64(left->small, right->small, NULL, &remainder);
        sagejs_tagged_set_small(target, remainder);
        return;
    }
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    sagejs_tagged_make_big(target);
    mpz_fdiv_r(target->big, left->big, right->big);
}

static void sagejs_tagged_divmod(
    sagejs_tagged_int *quotient,
    sagejs_tagged_int *remainder,
    sagejs_tagged_int *left,
    sagejs_tagged_int *right)
{
    int64_t q;
    int64_t r;
    if (!left->is_big && !right->is_big &&
        !(left->small == INT64_MIN && right->small == -1))
    {
        sagejs_word_fdiv_int64(left->small, right->small, &q, &r);
        sagejs_tagged_set_small(quotient, q);
        sagejs_tagged_set_small(remainder, r);
        return;
    }
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    sagejs_tagged_make_big(quotient);
    sagejs_tagged_make_big(remainder);
    mpz_fdiv_qr(quotient->big, remainder->big, left->big, right->big);
}

static void sagejs_tagged_add_one(sagejs_tagged_int *value)
{
    if (!value->is_big && value->small != INT64_MAX)
    {
        value->small += 1;
        return;
    }
    sagejs_tagged_make_big(value);
    mpz_add_ui(value->big, value->big, 1);
}
`;
}

/* Node-only scalar conversion helpers. */
function generateExactNodeHelpers() {
  return String.raw`
static napi_value create_bigint(napi_env env, const mpz_t value)
{
    const int sign = mpz_sgn(value) < 0;
    const size_t capacity =
        (mpz_sizeinbase(value, 2) + (sizeof(uint64_t) * 8 - 1)) /
        (sizeof(uint64_t) * 8);
    size_t count = 0;
    uint64_t inline_words[4];
    uint64_t *words = inline_words;
    napi_value result;

    if (capacity != 0)
    {
        if (capacity > sizeof(inline_words) / sizeof(inline_words[0]))
            words = (uint64_t *) malloc(capacity * sizeof(*words));
        if (words == NULL)
        {
            napi_throw_error(env, NULL, "unable to allocate BigInt limbs");
            return NULL;
        }
        mpz_export(words, &count, -1, sizeof(*words), 0, 0, value);
    }
    if (!sagejs_native_check_napi(env,
        napi_create_bigint_words(env, sign, count, words, &result)))
    {
        if (words != inline_words)
            free(words);
        return NULL;
    }
    if (words != inline_words)
        free(words);
    return result;
}

static napi_value create_tagged_bigint(
    napi_env env, sagejs_tagged_int *value)
{
    napi_value result;
    if (value->is_big)
        return create_bigint(env, value->big);
    if (!sagejs_native_check_napi(
        env, napi_create_bigint_int64(env, value->small, &result)))
        return NULL;
    return result;
}

static int get_precision(
    napi_env env, napi_value value, mpfr_prec_t *precision)
{
    int64_t result;
    if (!sagejs_native_check_napi(
        env, napi_get_value_int64(env, value, &result)))
        return 0;
    if (result < MPFR_PREC_MIN || (uint64_t) result > MPFR_PREC_MAX)
    {
        napi_throw_range_error(env, NULL, "invalid field precision");
        return 0;
    }
    *precision = (mpfr_prec_t) result;
    return 1;
}

static int get_uint64(
    napi_env env, napi_value value, uint64_t *result)
{
    napi_valuetype type;
    bool lossless;
    double number;

    if (!sagejs_native_check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type == napi_bigint)
    {
        if (!sagejs_native_check_napi(env,
            napi_get_value_bigint_uint64(env, value, result, &lossless)))
            return 0;
        if (!lossless)
        {
            napi_throw_range_error(env, NULL, "uint64 argument is too large");
            return 0;
        }
        return 1;
    }
    if (type != napi_number ||
        !sagejs_native_check_napi(
            env, napi_get_value_double(env, value, &number)))
    {
        napi_throw_type_error(env, NULL, "expected a uint64 argument");
        return 0;
    }
    if (!isfinite(number) || number < 0 ||
        number > 9007199254740991.0 || floor(number) != number)
    {
        napi_throw_range_error(env, NULL, "invalid uint64 argument");
        return 0;
    }
    *result = (uint64_t) number;
    return 1;
}

static int get_bool(napi_env env, napi_value value, int *result)
{
    napi_valuetype type;
    bool boolean;
    if (!sagejs_native_check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_boolean ||
        !sagejs_native_check_napi(
            env, napi_get_value_bool(env, value, &boolean)))
    {
        napi_throw_type_error(env, NULL, "expected a bool argument");
        return 0;
    }
    *result = boolean ? 1 : 0;
    return 1;
}

static int get_integer(napi_env env, napi_value value, mpz_t result)
{
    napi_valuetype type;
    if (!sagejs_native_check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type == napi_bigint)
    {
        int64_t small;
        bool lossless;
        if (!sagejs_native_check_napi(env,
            napi_get_value_bigint_int64(env, value, &small, &lossless)))
            return 0;
        if (lossless)
        {
            const int negative = small < 0;
            const uint64_t magnitude = negative
                ? (uint64_t) (-(small + 1)) + UINT64_C(1)
                : (uint64_t) small;
            set_mpz_uint64(result, magnitude);
            if (negative)
                mpz_neg(result, result);
            return 1;
        }
        else
        {
            int sign = 0;
            size_t count = 0;
            uint64_t inline_words[4];
            uint64_t *words = inline_words;
            if (!sagejs_native_check_napi(
                env, napi_get_value_bigint_words(
                    env, value, NULL, &count, NULL)))
                return 0;
            if (count != 0)
            {
                size_t actual = count;
                if (count > sizeof(inline_words) / sizeof(inline_words[0]))
                    words = (uint64_t *) malloc(count * sizeof(*words));
                if (words == NULL)
                {
                    napi_throw_error(env, NULL, "unable to allocate BigInt limbs");
                    return 0;
                }
                if (!sagejs_native_check_napi(env,
                    napi_get_value_bigint_words(
                        env, value, &sign, &actual, words)))
                {
                    if (words != inline_words)
                        free(words);
                    return 0;
                }
                mpz_import(result, actual, -1, sizeof(*words), 0, 0, words);
                if (words != inline_words)
                    free(words);
                if (sign)
                    mpz_neg(result, result);
            }
            return 1;
        }
    }
    if (type == napi_number)
    {
        double number;
        if (!sagejs_native_check_napi(
            env, napi_get_value_double(env, value, &number)))
            return 0;
        if (!isfinite(number) || floor(number) != number ||
            number < -9007199254740991.0 ||
            number > 9007199254740991.0)
        {
            napi_throw_range_error(env, NULL, "invalid exact integer argument");
            return 0;
        }
        mpz_set_d(result, number);
        return 1;
    }
    napi_throw_type_error(env, NULL, "expected an exact integer argument");
    return 0;
}

static int get_tagged_integer(
    napi_env env, napi_value value, sagejs_tagged_int *result)
{
    napi_valuetype type;
    if (!sagejs_native_check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type == napi_bigint)
    {
        int64_t small;
        bool lossless;
        if (!sagejs_native_check_napi(env,
            napi_get_value_bigint_int64(env, value, &small, &lossless)))
            return 0;
        if (lossless)
        {
            sagejs_tagged_set_small(result, small);
            return 1;
        }
        else
        {
            int sign = 0;
            size_t count = 0;
            uint64_t inline_words[4];
            uint64_t *words = inline_words;
            if (!sagejs_native_check_napi(
                env, napi_get_value_bigint_words(
                    env, value, NULL, &count, NULL)))
                return 0;
            if (count == 0)
            {
                sagejs_tagged_set_small(result, 0);
                return 1;
            }
            else
            {
                size_t actual = count;
                if (count > sizeof(inline_words) / sizeof(inline_words[0]))
                    words = (uint64_t *) malloc(count * sizeof(*words));
                if (words == NULL)
                {
                    napi_throw_error(env, NULL, "unable to allocate BigInt limbs");
                    return 0;
                }
                if (!sagejs_native_check_napi(env,
                    napi_get_value_bigint_words(
                        env, value, &sign, &actual, words)))
                {
                    if (words != inline_words)
                        free(words);
                    return 0;
                }
                sagejs_tagged_make_big(result);
                mpz_import(
                    result->big, actual, -1, sizeof(*words), 0, 0, words);
                if (words != inline_words)
                    free(words);
                if (sign)
                    mpz_neg(result->big, result->big);
                return 1;
            }
        }
    }
    if (type == napi_number)
    {
        double number;
        if (!sagejs_native_check_napi(
            env, napi_get_value_double(env, value, &number)))
            return 0;
        if (!isfinite(number) || floor(number) != number ||
            number < -9007199254740991.0 ||
            number > 9007199254740991.0)
        {
            napi_throw_range_error(env, NULL, "invalid exact integer argument");
            return 0;
        }
        sagejs_tagged_set_small(result, (int64_t) number);
        return 1;
    }
    napi_throw_type_error(env, NULL, "expected an exact integer argument");
    return 0;
}
`;
}

module.exports = {
  generateExactCoreRuntime,
  generateExactNodeHelpers,
};
