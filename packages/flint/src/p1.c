#include <limits.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <node_api.h>

#include <flint/fmpq.h>
#include <flint/fmpq_vec.h>
#include <flint/fmpz.h>
#include <flint/gr.h>
#include <flint/gr_mat.h>
#include <flint/nmod_mat.h>
#include <flint/qqbar.h>
#include <flint/ulong_extras.h>

#include "dirichlet.h"
#include "matrix.h"
#include "modsym_core.h"
#include "p1.h"
#include "sparse_rational.h"

/*
 * Sage-compatible P^1(Z/NZ) representatives and weight-2 Manin relations.
 *
 * The representative conventions follow SageMath's GPL-licensed P1List;
 * the count-first, allocate-once layout is informed by William Stein's
 * later JSage/Zig implementation.  See bench/MODULAR-SYMBOLS.md for exact
 * source revisions, mathematical conventions, and comparative benchmarks.
 * The higher-weight triple presentation follows Stein's published modular
 * symbols chapter and was cross-checked against his Sage and Magma sources.
 */

#define SAGEJS_P1_MAGIC UINT64_C(0x534147454A535031)
#define SAGEJS_MANIN_MAGIC UINT64_C(0x534147454A534D52)
#define SAGEJS_CHARACTER_PRESENTATION_MAGIC \
    UINT64_C(0x534147454A534350)
#define SAGEJS_MANIN_MAX_DENSE_CELLS UINT64_C(20000000)

typedef struct
{
    uint32_t u;
    uint32_t v;
} sagejs_p1_pair;

typedef struct
{
    uint64_t magic;
    uint32_t level;
    size_t count;
    sagejs_p1_pair *pairs;
    size_t hash_capacity;
    size_t *hash_slots;
} sagejs_p1list_value;

typedef struct
{
    uint64_t magic;
    uint32_t level;
    ulong modulus;
    size_t generators;
    size_t rows;
    size_t s_relations;
    size_t r_relations;
    size_t nonzero;
    size_t *row_offsets;
    size_t *columns;
    ulong *values;
} sagejs_manin_relations_value;

typedef sagejs_modsym_presentation sagejs_manin_presentation_info;

typedef struct
{
    size_t generators;
    size_t two_term_generators;
    size_t dimension;
    size_t *basis_generators;
    fmpq_mat_t reduction;
    int reduction_initialized;
} sagejs_higher_weight_presentation;

typedef struct
{
    uint64_t magic;
    uint32_t level;
    uint32_t weight;
    int sign;
    ulong character_index;
    size_t generators;
    size_t two_term_generators;
    size_t dimension;
    size_t *basis_generators;
    gr_ctx_t context;
    gr_mat_t reduction;
    int context_initialized;
    int reduction_initialized;
} sagejs_character_presentation;

static const napi_type_tag sagejs_p1_type_tag = {
    UINT64_C(0x690d50401f624373),
    UINT64_C(0x9fb35c93be831979)
};

static const napi_type_tag sagejs_manin_type_tag = {
    UINT64_C(0xc843bcb4b18e4427),
    UINT64_C(0xa1df45b7e3ca6860)
};

static const napi_type_tag sagejs_character_presentation_type_tag = {
    UINT64_C(0xf5254b1250af43a7),
    UINT64_C(0xb13bd0e1384fbca9)
};

static int p1_check_napi(napi_env env, napi_status status)
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

static int p1_arguments(
    napi_env env,
    napi_callback_info info,
    size_t expected,
    napi_value *arguments)
{
    size_t count = expected;

    if (!p1_check_napi(env,
        napi_get_cb_info(env, info, &count, arguments, NULL, NULL)))
        return 0;
    if (count != expected)
    {
        napi_throw_type_error(env, NULL, "wrong number of arguments");
        return 0;
    }
    return 1;
}

static int p1_safe_integer(
    napi_env env, napi_value value, int64_t *result)
{
    napi_valuetype type;
    double number;

    if (!p1_check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_number ||
        !p1_check_napi(env, napi_get_value_double(env, value, &number)))
    {
        if (type != napi_number)
            napi_throw_type_error(env, NULL, "expected an integer Number");
        return 0;
    }
    if (!isfinite(number) || floor(number) != number ||
        number < -9007199254740991.0 || number > 9007199254740991.0)
    {
        napi_throw_range_error(env, NULL, "expected a safe integer");
        return 0;
    }
    *result = (int64_t) number;
    return 1;
}

static int p1_size_index(
    napi_env env, napi_value value, size_t bound, size_t *result)
{
    int64_t index;

    if (!p1_safe_integer(env, value, &index))
        return 0;
    if (index < 0 || (uint64_t) index >= bound)
    {
        napi_throw_range_error(env, NULL, "P1List index out of range");
        return 0;
    }
    *result = (size_t) index;
    return 1;
}

static int p1_bigint_to_ulong(
    napi_env env, napi_value value, ulong *result)
{
    napi_valuetype type;
    int sign = 0;
    size_t count = 1;
    uint64_t word = 0;

    if (!p1_check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_bigint)
    {
        napi_throw_type_error(env, NULL, "expected a BigInt modulus");
        return 0;
    }
    if (!p1_check_napi(env,
        napi_get_value_bigint_words(env, value, &sign, &count, &word)))
        return 0;
    if (sign || count > 1)
    {
        napi_throw_range_error(env, NULL, "modulus does not fit in a word");
        return 0;
    }
    *result = (ulong) word;
    return 1;
}

static uint32_t p1_gcd(uint32_t left, uint32_t right)
{
    while (right != 0)
    {
        uint32_t remainder = left % right;
        left = right;
        right = remainder;
    }
    return left;
}

static uint32_t p1_xgcd(
    uint32_t left, uint32_t right, int64_t *left_coefficient)
{
    int64_t old_r = left, r = right;
    int64_t old_s = 1, s = 0;

    while (r != 0)
    {
        int64_t quotient = old_r / r;
        int64_t next_r = old_r - quotient * r;
        int64_t next_s = old_s - quotient * s;
        old_r = r;
        r = next_r;
        old_s = s;
        s = next_s;
    }
    *left_coefficient = old_s;
    return (uint32_t) old_r;
}

static uint32_t p1_reduce_signed(int64_t value, uint32_t modulus)
{
    int64_t result = value % (int64_t) modulus;
    if (result < 0)
        result += modulus;
    return (uint32_t) result;
}

static int p1_normalize_pair(
    uint32_t level,
    int64_t input_u,
    int64_t input_v,
    sagejs_p1_pair *answer,
    uint32_t *scalar)
{
    uint32_t u, v, gcd_value, d, min_v, min_t;
    uint64_t v_step;
    int64_t bezout;
    uint32_t scale;

    if (level == 1)
    {
        answer->u = 0;
        answer->v = 0;
        if (scalar != NULL) *scalar = 1;
        return 1;
    }
    u = p1_reduce_signed(input_u, level);
    v = p1_reduce_signed(input_v, level);
    if (u == 0)
    {
        answer->u = 0;
        answer->v = p1_gcd(v, level) == 1 ? 1 : 0;
        if (scalar != NULL) *scalar = v;
        return answer->v != 0;
    }

    gcd_value = p1_xgcd(u, level, &bezout);
    if (p1_gcd(gcd_value, v) != 1)
    {
        answer->u = 0;
        answer->v = 0;
        if (scalar != NULL) *scalar = 0;
        return 0;
    }
    scale = p1_reduce_signed(bezout, level);
    if (gcd_value != 1)
    {
        d = level / gcd_value;
        while (p1_gcd(scale, level) != 1)
            scale = (scale + d) % level;
    }

    u = gcd_value;
    v = (uint32_t) (((uint64_t) scale * v) % level);
    min_v = v;
    min_t = 1;
    if (gcd_value != 1)
    {
        uint32_t quotient = level / gcd_value;
        uint32_t t = 1;
        v_step = ((uint64_t) v * quotient) % level;
        for (uint32_t k = 2; k <= gcd_value; k++)
        {
            v = (uint32_t) ((v + v_step) % level);
            t = (t + quotient) % level;
            if (v < min_v && p1_gcd(t, level) == 1)
            {
                min_v = v;
                min_t = t;
            }
        }
    }
    answer->u = u;
    answer->v = min_v;
    if (scalar != NULL)
    {
        uint32_t product =
            (uint32_t) (((uint64_t) scale * min_t) % level);
        uint32_t inverse_gcd = p1_xgcd(product, level, &bezout);
        if (inverse_gcd != 1)
            return 0;
        *scalar = p1_reduce_signed(bezout, level);
    }
    return 1;
}

static size_t p1_projective_count(uint32_t level)
{
    uint32_t remaining = level;
    __uint128_t count = level;

    if (level == 1)
        return 1;
    for (uint32_t prime = 2;
         (uint64_t) prime * prime <= remaining;
         prime += prime == 2 ? 1 : 2)
    {
        if (remaining % prime != 0)
            continue;
        count = count / prime * (prime + 1);
        while (remaining % prime == 0)
            remaining /= prime;
    }
    if (remaining > 1)
        count = count / remaining * (remaining + 1);
    if (count > SIZE_MAX)
        return 0;
    return (size_t) count;
}

static int p1_pair_compare(const void *left_pointer, const void *right_pointer)
{
    const sagejs_p1_pair *left = left_pointer;
    const sagejs_p1_pair *right = right_pointer;

    if (left->u < right->u) return -1;
    if (left->u > right->u) return 1;
    if (left->v < right->v) return -1;
    if (left->v > right->v) return 1;
    return 0;
}

static uint64_t p1_pair_hash(uint32_t u, uint32_t v)
{
    uint64_t value = ((uint64_t) u << 32) | v;
    value ^= value >> 30;
    value *= UINT64_C(0xbf58476d1ce4e5b9);
    value ^= value >> 27;
    value *= UINT64_C(0x94d049bb133111eb);
    return value ^ (value >> 31);
}

static size_t p1_index_normalized(
    const sagejs_p1list_value *list, sagejs_p1_pair pair)
{
    size_t slot;

    if (list->level == 1)
        return 0;
    if (pair.u == 1)
        return (size_t) pair.v + 1;
    if (pair.u == 0)
        return pair.v == 1 ? 0 : SIZE_MAX;
    slot = (size_t) p1_pair_hash(pair.u, pair.v)
        & (list->hash_capacity - 1);
    while (list->hash_slots[slot] != SIZE_MAX)
    {
        size_t index = list->hash_slots[slot];
        if (list->pairs[index].u == pair.u &&
            list->pairs[index].v == pair.v)
            return index;
        slot = (slot + 1) & (list->hash_capacity - 1);
    }
    return SIZE_MAX;
}

static size_t p1_apply_pair(
    const sagejs_p1list_value *list, int64_t u, int64_t v)
{
    sagejs_p1_pair normalized;
    if (!p1_normalize_pair(list->level, u, v, &normalized, NULL))
        return SIZE_MAX;
    return p1_index_normalized(list, normalized);
}

static size_t p1_modsym_coset_index(
    const void *context, int64_t u, int64_t v)
{
    return p1_apply_pair(context, u, v);
}

static sagejs_modsym_presentation_view p1_presentation_view(
    const sagejs_p1list_value *list,
    const sagejs_manin_presentation_info *presentation)
{
    return (sagejs_modsym_presentation_view) {
        list->level,
        list->count,
        presentation,
        list,
        p1_modsym_coset_index
    };
}

static int p1_manin_presentation_build(
    const sagejs_p1list_value *list,
    sagejs_manin_presentation_info *result)
{
    sagejs_modsym_presentation_view view =
        p1_presentation_view(list, result);
    return sagejs_modsym_presentation_build(&view, result);
}

static void p1_manin_presentation_clear(
    sagejs_manin_presentation_info *presentation)
{
    sagejs_modsym_presentation_clear(presentation);
}

static void p1_free_value(sagejs_p1list_value *list)
{
    if (list == NULL)
        return;
    free(list->pairs);
    free(list->hash_slots);
    list->magic = 0;
    free(list);
}

static void p1_finalize(napi_env env, void *data, void *hint)
{
    sagejs_p1list_value *list = data;
    (void) env;
    (void) hint;
    if (list != NULL && list->magic == SAGEJS_P1_MAGIC)
        p1_free_value(list);
}

static sagejs_p1list_value *p1_build(uint32_t level)
{
    sagejs_p1list_value *list = calloc(1, sizeof(*list));
    size_t position = 0;

    if (list == NULL)
        return NULL;
    list->magic = SAGEJS_P1_MAGIC;
    list->level = level;
    list->count = p1_projective_count(level);
    if (list->count == 0 ||
        list->count > SIZE_MAX / sizeof(*list->pairs))
        goto fail;
    list->pairs = malloc(list->count * sizeof(*list->pairs));
    if (list->pairs == NULL)
        goto fail;

    if (level == 1)
    {
        list->pairs[position++] = (sagejs_p1_pair) {0, 0};
    }
    else
    {
        uint32_t maximum;
        list->pairs[position++] = (sagejs_p1_pair) {0, 1};
        for (uint32_t v = 0; v < level; v++)
            list->pairs[position++] = (sagejs_p1_pair) {1, v};
        maximum = level % 2 != 0
            ? (level % 3 != 0 ? level / 5 : level / 3)
            : level / 2;
        for (uint32_t c = 2; c <= maximum; c++)
        {
            uint32_t h, common;
            if (level % c != 0)
                continue;
            h = level / c;
            common = p1_gcd(c, h);
            for (uint32_t d = 1; d <= h; d++)
            {
                uint64_t d1;
                sagejs_p1_pair normalized;
                if (p1_gcd(d, common) != 1)
                    continue;
                d1 = d;
                while (p1_gcd((uint32_t) d1, c) != 1)
                    d1 += h;
                if (!p1_normalize_pair(
                    level, c, (int64_t) d1, &normalized, NULL))
                    goto fail;
                if (position >= list->count)
                    goto fail;
                list->pairs[position++] = normalized;
            }
        }
    }
    if (position != list->count)
        goto fail;
    qsort(list->pairs, list->count, sizeof(*list->pairs), p1_pair_compare);

    list->hash_capacity = 1;
    while (list->hash_capacity < list->count * 2)
    {
        if (list->hash_capacity > SIZE_MAX / 2)
            goto fail;
        list->hash_capacity *= 2;
    }
    list->hash_slots = malloc(
        list->hash_capacity * sizeof(*list->hash_slots));
    if (list->hash_slots == NULL)
        goto fail;
    for (size_t index = 0; index < list->hash_capacity; index++)
        list->hash_slots[index] = SIZE_MAX;
    for (size_t index = 0; index < list->count; index++)
    {
        size_t slot = (size_t) p1_pair_hash(
            list->pairs[index].u, list->pairs[index].v)
            & (list->hash_capacity - 1);
        while (list->hash_slots[slot] != SIZE_MAX)
            slot = (slot + 1) & (list->hash_capacity - 1);
        list->hash_slots[slot] = index;
    }
    return list;

fail:
    p1_free_value(list);
    return NULL;
}

static sagejs_p1list_value *p1_unwrap(napi_env env, napi_value object)
{
    bool tagged = false;
    sagejs_p1list_value *list = NULL;

    if (!p1_check_napi(env,
        napi_check_object_type_tag(env, object, &sagejs_p1_type_tag, &tagged)))
        return NULL;
    if (!tagged || !p1_check_napi(env, napi_unwrap(env, object, (void **) &list)) ||
        list == NULL || list->magic != SAGEJS_P1_MAGIC)
    {
        napi_throw_type_error(env, NULL, "invalid native P1List");
        return NULL;
    }
    return list;
}

static napi_value p1_pair_value(
    napi_env env, sagejs_p1_pair pair, int include_scalar, uint32_t scalar)
{
    napi_value result, value;
    size_t length = include_scalar ? 3 : 2;

    if (!p1_check_napi(env, napi_create_array_with_length(env, length, &result)))
        return NULL;
    if (!p1_check_napi(env, napi_create_uint32(env, pair.u, &value)) ||
        !p1_check_napi(env, napi_set_element(env, result, 0, value)) ||
        !p1_check_napi(env, napi_create_uint32(env, pair.v, &value)) ||
        !p1_check_napi(env, napi_set_element(env, result, 1, value)))
        return NULL;
    if (include_scalar &&
        (!p1_check_napi(env, napi_create_uint32(env, scalar, &value)) ||
         !p1_check_napi(env, napi_set_element(env, result, 2, value))))
        return NULL;
    return result;
}

napi_value sagejs_p1list(napi_env env, napi_callback_info info)
{
    napi_value arguments[1], object;
    int64_t level_value;
    sagejs_p1list_value *list;

    if (!p1_arguments(env, info, 1, arguments) ||
        !p1_safe_integer(env, arguments[0], &level_value))
        return NULL;
    if (level_value <= 0 || level_value > INT32_MAX)
    {
        napi_throw_range_error(env, NULL,
            "P1List level must be between 1 and 2147483647");
        return NULL;
    }
    list = p1_build((uint32_t) level_value);
    if (list == NULL)
    {
        napi_throw_error(env, NULL, "unable to construct the native P1List");
        return NULL;
    }
    if (!p1_check_napi(env, napi_create_object(env, &object)) ||
        !p1_check_napi(env,
            napi_type_tag_object(env, object, &sagejs_p1_type_tag)) ||
        !p1_check_napi(env,
            napi_wrap(env, object, list, p1_finalize, NULL, NULL)))
    {
        p1_free_value(list);
        return NULL;
    }
    return object;
}

napi_value sagejs_p1list_level(napi_env env, napi_callback_info info)
{
    napi_value arguments[1], result;
    sagejs_p1list_value *list;
    if (!p1_arguments(env, info, 1, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL)
        return NULL;
    if (!p1_check_napi(env, napi_create_uint32(env, list->level, &result)))
        return NULL;
    return result;
}

napi_value sagejs_p1list_count(napi_env env, napi_callback_info info)
{
    napi_value arguments[1], result;
    sagejs_p1list_value *list;
    if (!p1_arguments(env, info, 1, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL)
        return NULL;
    if (!p1_check_napi(env,
        napi_create_double(env, (double) list->count, &result)))
        return NULL;
    return result;
}

napi_value sagejs_p1list_entry(napi_env env, napi_callback_info info)
{
    napi_value arguments[2];
    sagejs_p1list_value *list;
    size_t index;
    if (!p1_arguments(env, info, 2, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL ||
        !p1_size_index(env, arguments[1], list->count, &index))
        return NULL;
    return p1_pair_value(env, list->pairs[index], 0, 0);
}

napi_value sagejs_p1list_normalize(napi_env env, napi_callback_info info)
{
    napi_value arguments[4];
    sagejs_p1list_value *list;
    sagejs_p1_pair pair;
    int64_t u, v, with_scalar;
    uint32_t scalar = 0;

    if (!p1_arguments(env, info, 4, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL ||
        !p1_safe_integer(env, arguments[1], &u) ||
        !p1_safe_integer(env, arguments[2], &v) ||
        !p1_safe_integer(env, arguments[3], &with_scalar))
        return NULL;
    if (!p1_normalize_pair(
        list->level, u, v, &pair, with_scalar != 0 ? &scalar : NULL))
    {
        pair.u = 0;
        pair.v = 0;
        scalar = 0;
    }
    return p1_pair_value(env, pair, with_scalar != 0, scalar);
}

napi_value sagejs_p1list_index(napi_env env, napi_callback_info info)
{
    napi_value arguments[3], result;
    sagejs_p1list_value *list;
    sagejs_p1_pair pair;
    int64_t u, v, answer = -1;
    size_t index;

    if (!p1_arguments(env, info, 3, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL ||
        !p1_safe_integer(env, arguments[1], &u) ||
        !p1_safe_integer(env, arguments[2], &v))
        return NULL;
    if (p1_normalize_pair(list->level, u, v, &pair, NULL) &&
        (index = p1_index_normalized(list, pair)) != SIZE_MAX)
        answer = (int64_t) index;
    if (!p1_check_napi(env, napi_create_int64(env, answer, &result)))
        return NULL;
    return result;
}

static napi_value p1_action_value(
    napi_env env,
    napi_callback_info info,
    int action)
{
    napi_value arguments[2], result;
    sagejs_p1list_value *list;
    size_t index, answer;

    if (!p1_arguments(env, info, 2, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL ||
        !p1_size_index(env, arguments[1], list->count, &index))
        return NULL;
    if (action == 0)
        answer = p1_apply_pair(
            list, -(int64_t) list->pairs[index].u,
            list->pairs[index].v);
    else if (action == 1)
        answer = p1_apply_pair(
            list, -(int64_t) list->pairs[index].v,
            list->pairs[index].u);
    else if (action == 2)
        answer = p1_apply_pair(
            list, list->pairs[index].v,
            -(int64_t) list->pairs[index].u - list->pairs[index].v);
    else
        answer = p1_apply_pair(
            list, list->pairs[index].u,
            (int64_t) list->pairs[index].u + list->pairs[index].v);
    if (answer == SIZE_MAX ||
        !p1_check_napi(env, napi_create_double(env, (double) answer, &result)))
        return NULL;
    return result;
}

napi_value sagejs_p1list_apply_i(napi_env env, napi_callback_info info)
{
    return p1_action_value(env, info, 0);
}

napi_value sagejs_p1list_apply_s(napi_env env, napi_callback_info info)
{
    return p1_action_value(env, info, 1);
}

napi_value sagejs_p1list_apply_r(napi_env env, napi_callback_info info)
{
    return p1_action_value(env, info, 2);
}

napi_value sagejs_p1list_apply_t(napi_env env, napi_callback_info info)
{
    return p1_action_value(env, info, 3);
}

static void manin_free_value(sagejs_manin_relations_value *relations)
{
    if (relations == NULL)
        return;
    free(relations->row_offsets);
    free(relations->columns);
    free(relations->values);
    relations->magic = 0;
    free(relations);
}

static void manin_finalize(napi_env env, void *data, void *hint)
{
    sagejs_manin_relations_value *relations = data;
    (void) env;
    (void) hint;
    if (relations != NULL && relations->magic == SAGEJS_MANIN_MAGIC)
        manin_free_value(relations);
}

static void manin_append_row(
    sagejs_manin_relations_value *relations,
    size_t row,
    const size_t *input_columns,
    size_t length)
{
    size_t columns[3];
    ulong values[3];
    size_t distinct = 0;

    for (size_t index = 0; index < length; index++)
    {
        size_t position;
        for (position = 0; position < distinct; position++)
            if (columns[position] == input_columns[index])
                break;
        if (position == distinct)
        {
            columns[distinct] = input_columns[index];
            values[distinct] = 1;
            distinct++;
        }
        else
        {
            values[position]++;
        }
    }
    relations->row_offsets[row] = relations->nonzero;
    for (size_t position = 0; position < distinct; position++)
    {
        ulong value = values[position] % relations->modulus;
        if (value == 0)
            continue;
        relations->columns[relations->nonzero] = columns[position];
        relations->values[relations->nonzero] = value;
        relations->nonzero++;
    }
}

static sagejs_manin_relations_value *manin_build(
    const sagejs_p1list_value *list, ulong modulus)
{
    sagejs_manin_relations_value *relations = calloc(1, sizeof(*relations));
    size_t *action_s = NULL, *action_r = NULL;
    size_t row = 0, capacity;

    if (relations == NULL)
        return NULL;
    relations->magic = SAGEJS_MANIN_MAGIC;
    relations->level = list->level;
    relations->modulus = modulus;
    relations->generators = list->count;
    action_s = malloc(list->count * sizeof(*action_s));
    action_r = malloc(list->count * sizeof(*action_r));
    if (action_s == NULL || action_r == NULL)
        goto fail;
    for (size_t index = 0; index < list->count; index++)
    {
        int64_t u = list->pairs[index].u;
        int64_t v = list->pairs[index].v;
        action_s[index] = p1_apply_pair(list, -v, u);
        action_r[index] = p1_apply_pair(list, v, -u - v);
        if (action_s[index] == SIZE_MAX || action_r[index] == SIZE_MAX)
            goto fail;
    }
    for (size_t index = 0; index < list->count; index++)
    {
        if (action_s[index] >= index)
            relations->s_relations++;
        size_t r = action_r[index];
        size_t rr = action_r[r];
        if (index <= r && index <= rr)
            relations->r_relations++;
    }
    relations->rows = relations->s_relations + relations->r_relations;
    capacity = 2 * relations->s_relations + 3 * relations->r_relations;
    relations->row_offsets = malloc(
        (relations->rows + 1) * sizeof(*relations->row_offsets));
    relations->columns = malloc(capacity * sizeof(*relations->columns));
    relations->values = malloc(capacity * sizeof(*relations->values));
    if (relations->row_offsets == NULL || relations->columns == NULL ||
        relations->values == NULL)
        goto fail;

    for (size_t index = 0; index < list->count; index++)
    {
        size_t columns[2] = {index, action_s[index]};
        if (columns[1] < index)
            continue;
        manin_append_row(relations, row++, columns, 2);
    }
    for (size_t index = 0; index < list->count; index++)
    {
        size_t r = action_r[index];
        size_t rr = action_r[r];
        size_t columns[3] = {index, r, rr};
        if (index > r || index > rr)
            continue;
        manin_append_row(relations, row++, columns, 3);
    }
    relations->row_offsets[row] = relations->nonzero;
    if (row != relations->rows)
        goto fail;
    free(action_s);
    free(action_r);
    return relations;

fail:
    free(action_s);
    free(action_r);
    manin_free_value(relations);
    return NULL;
}

static sagejs_manin_relations_value *manin_unwrap(
    napi_env env, napi_value object)
{
    bool tagged = false;
    sagejs_manin_relations_value *relations = NULL;

    if (!p1_check_napi(env,
        napi_check_object_type_tag(
            env, object, &sagejs_manin_type_tag, &tagged)))
        return NULL;
    if (!tagged || !p1_check_napi(env,
        napi_unwrap(env, object, (void **) &relations)) ||
        relations == NULL || relations->magic != SAGEJS_MANIN_MAGIC)
    {
        napi_throw_type_error(env, NULL, "invalid native Manin relations");
        return NULL;
    }
    return relations;
}

napi_value sagejs_p1list_manin_relations(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[2], object;
    sagejs_p1list_value *list;
    sagejs_manin_relations_value *relations;
    ulong modulus;

    if (!p1_arguments(env, info, 2, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL ||
        !p1_bigint_to_ulong(env, arguments[1], &modulus))
        return NULL;
    if (modulus < 2 || !n_is_prime(modulus))
    {
        napi_throw_range_error(env, NULL,
            "Manin relation modulus must be prime");
        return NULL;
    }
    relations = manin_build(list, modulus);
    if (relations == NULL)
    {
        napi_throw_error(env, NULL, "unable to construct Manin relations");
        return NULL;
    }
    if (!p1_check_napi(env, napi_create_object(env, &object)) ||
        !p1_check_napi(env,
            napi_type_tag_object(env, object, &sagejs_manin_type_tag)) ||
        !p1_check_napi(env,
            napi_wrap(env, object, relations, manin_finalize, NULL, NULL)))
    {
        manin_free_value(relations);
        return NULL;
    }
    return object;
}

static int manin_set_number_property(
    napi_env env, napi_value object, const char *name, double number)
{
    napi_value value;
    return p1_check_napi(env, napi_create_double(env, number, &value)) &&
        p1_check_napi(env, napi_set_named_property(env, object, name, value));
}

napi_value sagejs_p1list_manin_presentation_info(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[1], result;
    sagejs_p1list_value *list;
    sagejs_manin_presentation_info presentation;
    size_t generators, relations;

    if (!p1_arguments(env, info, 1, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL)
        return NULL;
    if (!p1_manin_presentation_build(list, &presentation))
    {
        napi_throw_error(env, NULL,
            "unable to construct minimal Manin presentation");
        return NULL;
    }
    generators = presentation.e1 + presentation.torsion2
        + presentation.torsion3;
    relations = list->level == 1
        ? 1
        : 1 + presentation.torsion2 + presentation.torsion3;
    if (!p1_check_napi(env, napi_create_object(env, &result)) ||
        !manin_set_number_property(
            env, result, "level", list->level) ||
        !manin_set_number_property(
            env, result, "projectiveCosets", list->count) ||
        !manin_set_number_property(
            env, result, "cusps", presentation.cusps) ||
        !manin_set_number_property(
            env, result, "interiorPaths", presentation.interior_paths) ||
        !manin_set_number_property(
            env, result, "e1", presentation.e1) ||
        !manin_set_number_property(
            env, result, "e2", presentation.e2) ||
        !manin_set_number_property(
            env, result, "torsion2", presentation.torsion2) ||
        !manin_set_number_property(
            env, result, "torsion3", presentation.torsion3) ||
        !manin_set_number_property(
            env, result, "generators", generators) ||
        !manin_set_number_property(
            env, result, "relations", relations) ||
        !manin_set_number_property(
            env, result, "dimension", presentation.e1))
    {
        p1_manin_presentation_clear(&presentation);
        return NULL;
    }
    p1_manin_presentation_clear(&presentation);
    return result;
}

napi_value sagejs_p1list_hecke_matrix(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[2], result;
    sagejs_p1list_value *list;
    sagejs_manin_presentation_info presentation;
    sagejs_modsym_presentation_view view;
    slong *entries;
    ulong prime;
    size_t dimension;

    if (!p1_arguments(env, info, 2, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL ||
        !p1_bigint_to_ulong(env, arguments[1], &prime))
        return NULL;
    if (prime < 2 || prime > INT32_MAX || !n_is_prime(prime))
    {
        napi_throw_range_error(env, NULL,
            "weight-2 Hecke index must be a prime fitting in 31 bits");
        return NULL;
    }
    if (!p1_manin_presentation_build(list, &presentation))
    {
        napi_throw_error(env, NULL,
            "unable to construct minimal Manin presentation");
        return NULL;
    }
    view = p1_presentation_view(list, &presentation);
    entries = sagejs_modsym_weight2_hecke_matrix(
        &view, prime, &dimension);
    p1_manin_presentation_clear(&presentation);
    if (entries == NULL || dimension > (size_t) WORD_MAX)
    {
        free(entries);
        napi_throw_error(env, NULL,
            "unable to construct exact weight-2 Hecke matrix");
        return NULL;
    }
    result = sagejs_zz_matrix_from_slong_entries(
        env, (slong) dimension, (slong) dimension, entries);
    free(entries);
    return result;
}

static napi_value p1_cusp_array(
    napi_env env,
    const sagejs_modsym_cusp *cusps,
    size_t count)
{
    napi_value result;

    if (count > UINT32_MAX || !p1_check_napi(
            env, napi_create_array_with_length(env, count, &result)))
        return NULL;
    for (size_t index = 0; index < count; index++)
    {
        napi_value pair, numerator, denominator;
        if (!p1_check_napi(env, napi_create_array_with_length(env, 2, &pair)) ||
            !p1_check_napi(env, napi_create_bigint_int64(
                env, cusps[index].numerator, &numerator)) ||
            !p1_check_napi(env, napi_create_bigint_int64(
                env, cusps[index].denominator, &denominator)) ||
            !p1_check_napi(env, napi_set_element(env, pair, 0, numerator)) ||
            !p1_check_napi(env, napi_set_element(env, pair, 1, denominator)) ||
            !p1_check_napi(env, napi_set_element(
                env, result, (uint32_t) index, pair)))
            return NULL;
    }
    return result;
}

napi_value sagejs_p1list_boundary_data(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[1], result = NULL, matrix = NULL, cusps_value = NULL;
    sagejs_p1list_value *list;
    sagejs_manin_presentation_info presentation;
    sagejs_modsym_presentation_view view;
    sagejs_modsym_cusp *cusp_representatives = NULL;
    slong *entries = NULL;
    size_t dimension, cusps;

    if (!p1_arguments(env, info, 1, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL)
        return NULL;
    if (!p1_manin_presentation_build(list, &presentation))
    {
        napi_throw_error(env, NULL,
            "unable to construct minimal Manin presentation");
        return NULL;
    }
    view = p1_presentation_view(list, &presentation);
    entries = sagejs_modsym_weight2_boundary_matrix(
        &view, &dimension, &cusps, &cusp_representatives);
    p1_manin_presentation_clear(&presentation);
    if (entries == NULL || dimension > (size_t) WORD_MAX ||
        cusps > (size_t) WORD_MAX)
    {
        napi_throw_error(env, NULL,
            "unable to construct exact weight-2 boundary map");
        goto done;
    }
    matrix = sagejs_zz_matrix_from_slong_entries(
        env, (slong) dimension, (slong) cusps, entries);
    cusps_value = p1_cusp_array(
        env, cusp_representatives, cusps);
    if (matrix == NULL || cusps_value == NULL ||
        !p1_check_napi(env, napi_create_object(env, &result)) ||
        !p1_check_napi(env, napi_set_named_property(
            env, result, "matrix", matrix)) ||
        !p1_check_napi(env, napi_set_named_property(
            env, result, "cusps", cusps_value)))
        result = NULL;

done:
    free(entries);
    free(cusp_representatives);
    return result;
}

napi_value sagejs_p1list_cuspidal_basis(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[1], result;
    sagejs_p1list_value *list;
    sagejs_manin_presentation_info presentation;
    sagejs_modsym_presentation_view view;
    slong *entries;
    size_t rows, columns;

    if (!p1_arguments(env, info, 1, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL)
        return NULL;
    if (!p1_manin_presentation_build(list, &presentation))
    {
        napi_throw_error(env, NULL,
            "unable to construct minimal Manin presentation");
        return NULL;
    }
    view = p1_presentation_view(list, &presentation);
    entries = sagejs_modsym_weight2_cuspidal_basis(
        &view, &rows, &columns);
    p1_manin_presentation_clear(&presentation);
    if (entries == NULL || rows > (size_t) WORD_MAX ||
        columns > (size_t) WORD_MAX)
    {
        free(entries);
        napi_throw_error(env, NULL,
            "unable to construct exact cuspidal cycle basis");
        return NULL;
    }
    result = sagejs_zz_matrix_from_slong_entries(
        env, (slong) rows, (slong) columns, entries);
    free(entries);
    return result;
}

napi_value sagejs_p1list_star_matrix(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[1], result;
    sagejs_p1list_value *list;
    sagejs_manin_presentation_info presentation;
    sagejs_modsym_presentation_view view;
    slong *entries;
    size_t dimension;

    if (!p1_arguments(env, info, 1, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL)
        return NULL;
    if (!p1_manin_presentation_build(list, &presentation))
    {
        napi_throw_error(env, NULL,
            "unable to construct minimal Manin presentation");
        return NULL;
    }
    view = p1_presentation_view(list, &presentation);
    entries = sagejs_modsym_weight2_star_matrix(&view, &dimension);
    p1_manin_presentation_clear(&presentation);
    if (entries == NULL || dimension > (size_t) WORD_MAX)
    {
        free(entries);
        napi_throw_error(env, NULL,
            "unable to construct exact weight-2 star involution");
        return NULL;
    }
    result = sagejs_zz_matrix_from_slong_entries(
        env, (slong) dimension, (slong) dimension, entries);
    free(entries);
    return result;
}

typedef struct
{
    size_t length;
    size_t capacity;
    size_t *columns;
    slong *values;
} p1_sparse_row;

static int p1_star_projector_entry(
    const slong *entries,
    size_t dimension,
    size_t source,
    size_t column,
    slong sign,
    slong *result)
{
    __int128 value = (source == column ? 1 : 0) +
        (__int128) sign * entries[column * dimension + source];
    if (value < LONG_MIN || value > LONG_MAX)
        return 0;
    *result = (slong) value;
    return 1;
}

static void p1_sparse_row_clear(p1_sparse_row *row)
{
    free(row->columns);
    free(row->values);
    memset(row, 0, sizeof(*row));
}

static int p1_sparse_row_reserve(p1_sparse_row *row, size_t capacity)
{
    size_t next;
    size_t *columns;
    slong *values;

    if (capacity <= row->capacity)
        return 1;
    next = row->capacity == 0 ? 4 : row->capacity;
    while (next < capacity)
    {
        if (next > SIZE_MAX / 2)
            return 0;
        next *= 2;
    }
    columns = malloc(next * sizeof(*columns));
    values = malloc(next * sizeof(*values));
    if (columns == NULL || values == NULL)
    {
        free(columns);
        free(values);
        return 0;
    }
    if (row->length != 0)
    {
        memcpy(columns, row->columns, row->length * sizeof(*columns));
        memcpy(values, row->values, row->length * sizeof(*values));
    }
    free(row->columns);
    free(row->values);
    row->columns = columns;
    row->values = values;
    row->capacity = next;
    return 1;
}

static slong p1_sparse_row_entry(
    const p1_sparse_row *row, size_t column)
{
    size_t left = 0, right = row->length;
    while (left < right)
    {
        size_t middle = left + (right - left) / 2;
        if (row->columns[middle] < column)
            left = middle + 1;
        else
            right = middle;
    }
    return left < row->length && row->columns[left] == column
        ? row->values[left] : 0;
}

static ulong p1_sparse_abs_slong(slong value)
{
    return value < 0
        ? (ulong) (-(value + 1)) + 1
        : (ulong) value;
}

/* Divide a nonzero integer row by the positive gcd of its coefficients. */
static void p1_sparse_row_make_primitive(p1_sparse_row *row)
{
    ulong common = 0;
    for (size_t item = 0; item < row->length; item++)
    {
        common = n_gcd(common, p1_sparse_abs_slong(row->values[item]));
        if (common == 1)
            break;
    }
    if (common > 1)
        for (size_t item = 0; item < row->length; item++)
            row->values[item] /= (slong) common;
}

/* Replace left by left - coefficient * right using fixed-size workspaces. */
static int p1_sparse_row_axpy(
    p1_sparse_row *left,
    const p1_sparse_row *right,
    slong coefficient,
    size_t *workspace_columns,
    slong *workspace_values,
    size_t workspace_capacity)
{
    size_t i = 0, j = 0, used = 0;

    while (i < left->length || j < right->length)
    {
        size_t column;
        __int128 value;
        if (j == right->length ||
            (i < left->length && left->columns[i] < right->columns[j]))
        {
            column = left->columns[i];
            value = left->values[i++];
        }
        else if (i == left->length || right->columns[j] < left->columns[i])
        {
            column = right->columns[j];
            value = -(__int128) coefficient * right->values[j++];
        }
        else
        {
            column = left->columns[i];
            value = (__int128) left->values[i++] -
                (__int128) coefficient * right->values[j++];
        }
        if (value < LONG_MIN || value > LONG_MAX)
            return 0;
        if (value != 0)
        {
            if (used >= workspace_capacity)
                return 0;
            workspace_columns[used] = column;
            workspace_values[used++] = (slong) value;
        }
    }
    if (!p1_sparse_row_reserve(left, used))
        return -1;
    if (used != 0)
    {
        memcpy(left->columns, workspace_columns,
            used * sizeof(*workspace_columns));
        memcpy(left->values, workspace_values,
            used * sizeof(*workspace_values));
    }
    left->length = used;
    return 1;
}

static int p1_sparse_row_compare(const void *left, const void *right)
{
    const p1_sparse_row *a = left;
    const p1_sparse_row *b = right;
    size_t ca = a->length == 0 ? SIZE_MAX : a->columns[0];
    size_t cb = b->length == 0 ? SIZE_MAX : b->columns[0];
    return ca < cb ? -1 : ca > cb;
}

/*
 * Compute RREF(rowspace(I + sign * star^T)) without destroying sparsity.
 *
 * The star involution has only O(dimension) nonzero entries in the native
 * E1 basis.  Dense modular rank selection followed by dense rational RREF
 * made signed spaces cubic in their ambient dimension.  Here exact sparse
 * elimination is first attempted in machine integers. Presentations whose
 * primitive rows still have nonunit pivots fall through to the sparse exact
 * rational implementation below.
 */
static int p1_sparse_star_eigenspace(
    fmpq_mat_t basis,
    slong *rank_out,
    const slong *entries,
    size_t dimension,
    slong sign)
{
    p1_sparse_row *pivots = NULL;
    p1_sparse_row working = {0};
    size_t *pivot_by_column = NULL, *workspace_columns = NULL;
    slong *workspace_values = NULL;
    size_t rank = 0;
    int status = 0;

    if (dimension > (size_t) WORD_MAX)
        return 0;
    pivots = calloc(dimension == 0 ? 1 : dimension, sizeof(*pivots));
    pivot_by_column = malloc(
        (dimension == 0 ? 1 : dimension) * sizeof(*pivot_by_column));
    workspace_columns = malloc(
        (dimension == 0 ? 1 : dimension) * sizeof(*workspace_columns));
    workspace_values = malloc(
        (dimension == 0 ? 1 : dimension) * sizeof(*workspace_values));
    if (pivots == NULL || pivot_by_column == NULL ||
        workspace_columns == NULL || workspace_values == NULL)
    {
        status = -1;
        goto done;
    }
    for (size_t column = 0; column < dimension; column++)
        pivot_by_column[column] = SIZE_MAX;

    for (size_t source = 0; source < dimension; source++)
    {
        size_t count = 0;
        working.length = 0;
        for (size_t column = 0; column < dimension; column++)
        {
            slong value;
            if (!p1_star_projector_entry(
                    entries, dimension, source, column, sign, &value))
                goto done;
            count += value != 0;
        }
        if (!p1_sparse_row_reserve(&working, count))
        {
            status = -1;
            goto done;
        }
        for (size_t column = 0; column < dimension; column++)
        {
            slong value;
            if (!p1_star_projector_entry(
                    entries, dimension, source, column, sign, &value))
                goto done;
            if (value != 0)
            {
                working.columns[working.length] = column;
                working.values[working.length++] = value;
            }
        }
        while (working.length != 0)
        {
            size_t pivot_column = working.columns[0];
            size_t pivot = pivot_by_column[pivot_column];
            if (pivot == SIZE_MAX)
            {
                p1_sparse_row_make_primitive(&working);
                if (working.values[0] == -1)
                {
                    for (size_t item = 0; item < working.length; item++)
                    {
                        if (working.values[item] == WORD_MIN)
                            goto done;
                        working.values[item] = -working.values[item];
                    }
                }
                else if (working.values[0] != 1)
                {
                    goto done;
                }
                pivots[rank] = working;
                memset(&working, 0, sizeof(working));
                pivot_by_column[pivot_column] = rank++;
                break;
            }
            {
                int reduced = p1_sparse_row_axpy(
                    &working, &pivots[pivot], working.values[0],
                    workspace_columns, workspace_values, dimension);
                if (reduced <= 0)
                {
                    status = reduced;
                    goto done;
                }
            }
        }
    }

    qsort(pivots, rank, sizeof(*pivots), p1_sparse_row_compare);
    for (size_t cursor = rank; cursor > 0; cursor--)
    {
        size_t row = cursor - 1;
        size_t pivot_column = pivots[row].columns[0];
        for (size_t earlier = 0; earlier < row; earlier++)
        {
            slong coefficient = p1_sparse_row_entry(
                &pivots[earlier], pivot_column);
            if (coefficient != 0)
            {
                int reduced = p1_sparse_row_axpy(
                    &pivots[earlier], &pivots[row], coefficient,
                    workspace_columns, workspace_values, dimension);
                if (reduced <= 0)
                {
                    status = reduced;
                    goto done;
                }
            }
        }
    }

    fmpq_mat_init(basis, (slong) rank, (slong) dimension);
    for (size_t row = 0; row < rank; row++)
        for (size_t item = 0; item < pivots[row].length; item++)
            fmpq_set_si(fmpq_mat_entry(
                basis, (slong) row, (slong) pivots[row].columns[item]),
                pivots[row].values[item], 1);
    *rank_out = (slong) rank;
    status = 1;

done:
    p1_sparse_row_clear(&working);
    if (pivots != NULL)
        for (size_t row = 0; row < dimension; row++)
            p1_sparse_row_clear(&pivots[row]);
    free(pivots);
    free(pivot_by_column);
    free(workspace_columns);
    free(workspace_values);
    return status;
}

typedef struct
{
    size_t length;
    size_t capacity;
    size_t *columns;
    fmpq *values;
} p1_sparse_qrow;

static void p1_sparse_qrow_clear(p1_sparse_qrow *row)
{
    free(row->columns);
    if (row->values != NULL)
        _fmpq_vec_clear(row->values, (slong) row->capacity);
    memset(row, 0, sizeof(*row));
}

static int p1_sparse_qrow_reserve(p1_sparse_qrow *row, size_t capacity)
{
    size_t next;
    size_t *columns;
    fmpq *values;

    if (capacity <= row->capacity)
        return 1;
    next = row->capacity == 0 ? 4 : row->capacity;
    while (next < capacity)
    {
        if (next > SIZE_MAX / 2 || next > (size_t) WORD_MAX / 2)
            return 0;
        next *= 2;
    }
    columns = malloc(next * sizeof(*columns));
    values = _fmpq_vec_init((slong) next);
    if (columns == NULL || values == NULL)
    {
        free(columns);
        if (values != NULL)
            _fmpq_vec_clear(values, (slong) next);
        return 0;
    }
    for (size_t item = 0; item < row->length; item++)
    {
        columns[item] = row->columns[item];
        fmpq_set(values + item, row->values + item);
    }
    free(row->columns);
    if (row->values != NULL)
        _fmpq_vec_clear(row->values, (slong) row->capacity);
    row->columns = columns;
    row->values = values;
    row->capacity = next;
    return 1;
}

static const fmpq *p1_sparse_qrow_entry(
    const p1_sparse_qrow *row, size_t column)
{
    size_t left = 0, right = row->length;
    while (left < right)
    {
        size_t middle = left + (right - left) / 2;
        if (row->columns[middle] < column)
            left = middle + 1;
        else
            right = middle;
    }
    return left < row->length && row->columns[left] == column
        ? row->values + left : NULL;
}

static int p1_sparse_qrow_axpy(
    p1_sparse_qrow *left,
    const p1_sparse_qrow *right,
    const fmpq_t coefficient,
    size_t *workspace_columns,
    fmpq *workspace_values,
    size_t workspace_capacity)
{
    size_t i = 0, j = 0, used = 0;

    while (i < left->length || j < right->length)
    {
        size_t column;
        if (used >= workspace_capacity)
            return 0;
        if (j == right->length ||
            (i < left->length && left->columns[i] < right->columns[j]))
        {
            column = left->columns[i];
            fmpq_set(workspace_values + used, left->values + i++);
        }
        else if (i == left->length || right->columns[j] < left->columns[i])
        {
            column = right->columns[j];
            fmpq_mul(workspace_values + used,
                coefficient, right->values + j++);
            fmpq_neg(workspace_values + used, workspace_values + used);
        }
        else
        {
            column = left->columns[i];
            fmpq_set(workspace_values + used, left->values + i++);
            fmpq_submul(workspace_values + used,
                coefficient, right->values + j++);
        }
        if (!fmpq_is_zero(workspace_values + used))
            workspace_columns[used++] = column;
    }
    if (!p1_sparse_qrow_reserve(left, used))
        return 0;
    for (size_t item = 0; item < used; item++)
    {
        left->columns[item] = workspace_columns[item];
        fmpq_set(left->values + item, workspace_values + item);
    }
    left->length = used;
    return 1;
}

static int p1_sparse_qrow_compare(const void *left, const void *right)
{
    const p1_sparse_qrow *a = left;
    const p1_sparse_qrow *b = right;
    size_t ca = a->length == 0 ? SIZE_MAX : a->columns[0];
    size_t cb = b->length == 0 ? SIZE_MAX : b->columns[0];
    return ca < cb ? -1 : ca > cb;
}

/* Fully general sparse rational fallback for nonunit integer pivots. */
static int p1_sparse_rational_star_eigenspace(
    fmpq_mat_t basis,
    slong *rank_out,
    const slong *entries,
    size_t dimension,
    slong sign)
{
    p1_sparse_qrow *pivots = NULL;
    p1_sparse_qrow working = {0};
    size_t *pivot_by_column = NULL, *workspace_columns = NULL;
    fmpq *workspace_values = NULL;
    fmpq_t coefficient;
    size_t rank = 0;
    int status = 0;

    if (dimension > (size_t) WORD_MAX)
        return 0;
    fmpq_init(coefficient);
    pivots = calloc(dimension == 0 ? 1 : dimension, sizeof(*pivots));
    pivot_by_column = malloc(
        (dimension == 0 ? 1 : dimension) * sizeof(*pivot_by_column));
    workspace_columns = malloc(
        (dimension == 0 ? 1 : dimension) * sizeof(*workspace_columns));
    workspace_values = _fmpq_vec_init(
        (slong) (dimension == 0 ? 1 : dimension));
    if (pivots == NULL || pivot_by_column == NULL ||
        workspace_columns == NULL || workspace_values == NULL)
        goto done;
    for (size_t column = 0; column < dimension; column++)
        pivot_by_column[column] = SIZE_MAX;

    for (size_t source = 0; source < dimension; source++)
    {
        size_t count = 0;
        working.length = 0;
        for (size_t column = 0; column < dimension; column++)
        {
            slong value;
            if (!p1_star_projector_entry(
                    entries, dimension, source, column, sign, &value))
                goto done;
            count += value != 0;
        }
        if (!p1_sparse_qrow_reserve(&working, count))
            goto done;
        for (size_t column = 0; column < dimension; column++)
        {
            slong value;
            if (!p1_star_projector_entry(
                    entries, dimension, source, column, sign, &value))
                goto done;
            if (value != 0)
            {
                working.columns[working.length] = column;
                fmpq_set_si(working.values + working.length++, value, 1);
            }
        }
        while (working.length != 0)
        {
            size_t pivot_column = working.columns[0];
            size_t pivot = pivot_by_column[pivot_column];
            if (pivot == SIZE_MAX)
            {
                fmpq_set(coefficient, working.values);
                for (size_t item = 0; item < working.length; item++)
                    fmpq_div(working.values + item,
                        working.values + item, coefficient);
                pivots[rank] = working;
                memset(&working, 0, sizeof(working));
                pivot_by_column[pivot_column] = rank++;
                break;
            }
            fmpq_set(coefficient, working.values);
            if (!p1_sparse_qrow_axpy(
                    &working, &pivots[pivot], coefficient,
                    workspace_columns, workspace_values, dimension))
                goto done;
        }
    }

    qsort(pivots, rank, sizeof(*pivots), p1_sparse_qrow_compare);
    for (size_t cursor = rank; cursor > 0; cursor--)
    {
        size_t row = cursor - 1;
        size_t pivot_column = pivots[row].columns[0];
        for (size_t earlier = 0; earlier < row; earlier++)
        {
            const fmpq *entry = p1_sparse_qrow_entry(
                &pivots[earlier], pivot_column);
            if (entry != NULL)
            {
                fmpq_set(coefficient, entry);
                if (!p1_sparse_qrow_axpy(
                        &pivots[earlier], &pivots[row], coefficient,
                        workspace_columns, workspace_values, dimension))
                    goto done;
            }
        }
    }

    fmpq_mat_init(basis, (slong) rank, (slong) dimension);
    for (size_t row = 0; row < rank; row++)
        for (size_t item = 0; item < pivots[row].length; item++)
            fmpq_set(fmpq_mat_entry(
                basis, (slong) row, (slong) pivots[row].columns[item]),
                pivots[row].values + item);
    *rank_out = (slong) rank;
    status = 1;

done:
    fmpq_clear(coefficient);
    p1_sparse_qrow_clear(&working);
    if (pivots != NULL)
        for (size_t row = 0; row < dimension; row++)
            p1_sparse_qrow_clear(&pivots[row]);
    free(pivots);
    free(pivot_by_column);
    free(workspace_columns);
    if (workspace_values != NULL)
        _fmpq_vec_clear(workspace_values,
            (slong) (dimension == 0 ? 1 : dimension));
    return status;
}

napi_value sagejs_p1list_star_eigenspace_basis(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[2], result = NULL, matrix = NULL;
    sagejs_p1list_value *list;
    sagejs_manin_presentation_info presentation;
    sagejs_modsym_presentation_view view;
    slong *entries = NULL;
    int64_t sign_value;
    size_t dimension;
    slong rank = 0;
    fmpq_mat_t basis;
    int basis_initialized = 0;
    int sparse_status;

    if (!p1_arguments(env, info, 2, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL ||
        !p1_safe_integer(env, arguments[1], &sign_value))
        return NULL;
    if (sign_value != -1 && sign_value != 1)
    {
        napi_throw_range_error(env, NULL,
            "star eigenspace sign must be -1 or 1");
        return NULL;
    }
    if (!p1_manin_presentation_build(list, &presentation))
    {
        napi_throw_error(env, NULL,
            "unable to construct minimal Manin presentation");
        return NULL;
    }
    view = p1_presentation_view(list, &presentation);
    entries = sagejs_modsym_weight2_star_matrix(&view, &dimension);
    p1_manin_presentation_clear(&presentation);
    if (entries == NULL || dimension > (size_t) WORD_MAX)
    {
        napi_throw_error(env, NULL,
            "unable to construct native star eigenspace");
        goto done;
    }
    sparse_status = p1_sparse_star_eigenspace(
        basis, &rank, entries, dimension, (slong) sign_value);
    if (sparse_status < 0)
    {
        napi_throw_error(env, NULL,
            "unable to allocate sparse star eigenspace workspace");
        goto done;
    }
    if (sparse_status > 0)
    {
        basis_initialized = 1;
        goto wrap;
    }
    sparse_status = p1_sparse_rational_star_eigenspace(
        basis, &rank, entries, dimension, (slong) sign_value);
    if (sparse_status <= 0)
    {
        napi_throw_error(env, NULL,
            "unable to construct sparse rational star eigenspace");
        goto done;
    }
    basis_initialized = 1;
wrap:
    matrix = sagejs_qq_matrix_from_fmpq_mat(env, basis);
    if (matrix != NULL &&
        p1_check_napi(env, napi_create_object(env, &result)) &&
        p1_check_napi(env, napi_set_named_property(
            env, result, "matrix", matrix)) &&
        manin_set_number_property(
            env, result, "dimension", (double) rank))
    {
        /* The result is complete. */
    }
    else
    {
        result = NULL;
    }

done:
    if (basis_initialized)
        fmpq_mat_clear(basis);
    free(entries);
    return result;
}

/*
 * General weight Gamma0 Manin symbols.
 *
 * A generator is (i, u, v), representing X^i Y^(weight-2-i) and a
 * projective coset.  S and (when requested) the star relation are monomial,
 * so a signed union/find removes them before any matrix is allocated.  The
 * remaining T relation is then reduced exactly over QQ.  This is the same
 * two-stage presentation used by Sage and by William Stein's original Magma
 * implementation, with the expensive arithmetic delegated to FLINT.
 */
typedef struct
{
    size_t *parent;
    signed char *coefficient;
    unsigned char *killed;
    size_t count;
} p1_signed_union_find;

static size_t p1_signed_find(p1_signed_union_find *sets, size_t value)
{
    size_t parent = sets->parent[value];
    if (parent != value)
    {
        size_t root = p1_signed_find(sets, parent);
        sets->coefficient[value] *= sets->coefficient[parent];
        sets->parent[value] = root;
    }
    return sets->parent[value];
}

/* Impose left + relation_coefficient * right = 0. */
static void p1_signed_union(
    p1_signed_union_find *sets,
    size_t left,
    size_t right,
    int relation_coefficient)
{
    size_t left_root = p1_signed_find(sets, left);
    size_t right_root = p1_signed_find(sets, right);
    int left_scale = sets->coefficient[left];
    int right_scale = sets->coefficient[right];
    int root_scale = -relation_coefficient * right_scale * left_scale;

    if (left_root == right_root)
    {
        if (left_scale + relation_coefficient * right_scale != 0)
            sets->killed[left_root] = 1;
        return;
    }
    sets->parent[left_root] = right_root;
    sets->coefficient[left_root] = (signed char) root_scale;
    sets->killed[right_root] |= sets->killed[left_root];
}

static void p1_higher_weight_clear(
    sagejs_higher_weight_presentation *presentation)
{
    free(presentation->basis_generators);
    if (presentation->reduction_initialized)
        fmpq_mat_clear(presentation->reduction);
    memset(presentation, 0, sizeof(*presentation));
}

static int p1_relation_add_fmpz(
    fmpq_mat_t relations,
    size_t row,
    size_t original,
    const fmpz_t coefficient,
    p1_signed_union_find *sets,
    const size_t *root_column)
{
    size_t root = p1_signed_find(sets, original);
    fmpz_t scaled;

    if (sets->killed[root])
        return 1;
    if (root_column[root] == SIZE_MAX)
        return 0;
    fmpz_init(scaled);
    fmpz_set(scaled, coefficient);
    if (sets->coefficient[original] < 0)
        fmpz_neg(scaled, scaled);
    fmpq_add_fmpz(
        fmpq_mat_entry(relations, (slong) row,
            (slong) root_column[root]),
        fmpq_mat_entry(relations, (slong) row,
            (slong) root_column[root]),
        scaled);
    fmpz_clear(scaled);
    return 1;
}

static int p1_relation_add_si(
    fmpq_mat_t relations,
    size_t row,
    size_t original,
    int coefficient,
    p1_signed_union_find *sets,
    const size_t *root_column)
{
    fmpz_t value;
    int status;
    fmpz_init_set_si(value, coefficient);
    status = p1_relation_add_fmpz(
        relations, row, original, value, sets, root_column);
    fmpz_clear(value);
    return status;
}

static int p1_higher_weight_build(
    const sagejs_p1list_value *list,
    uint32_t weight,
    int sign,
    sagejs_higher_weight_presentation *answer)
{
    size_t cosets = list->count;
    size_t generators, free_count = 0, rank, dimension;
    size_t *root_column = NULL, *column_root = NULL, *pivot_row = NULL;
    size_t *free_column = NULL;
    p1_signed_union_find sets = {0};
    fmpq_mat_t relations, reduced;
    int relations_initialized = 0, reduced_initialized = 0;
    slong rank_slong = 0;
    fmpz_t binomial;
    int status = 0;

    memset(answer, 0, sizeof(*answer));
    if (weight < 2 || (sign != -1 && sign != 0 && sign != 1) ||
        cosets == 0 || (size_t) (weight - 1) > SIZE_MAX / cosets)
        return 0;
    generators = (size_t) (weight - 1) * cosets;
    if (generators > (size_t) WORD_MAX)
        return 0;
    sets.count = generators;
    sets.parent = malloc(generators * sizeof(*sets.parent));
    sets.coefficient = malloc(generators * sizeof(*sets.coefficient));
    sets.killed = calloc(generators, sizeof(*sets.killed));
    root_column = malloc(generators * sizeof(*root_column));
    column_root = malloc(generators * sizeof(*column_root));
    if (sets.parent == NULL || sets.coefficient == NULL ||
        sets.killed == NULL || root_column == NULL || column_root == NULL)
        goto done;
    for (size_t generator = 0; generator < generators; generator++)
    {
        sets.parent[generator] = generator;
        sets.coefficient[generator] = 1;
        root_column[generator] = SIZE_MAX;
    }

    /* x + xS = 0, where S(i,u,v)=(-1)^i(w-i,v,-u). */
    for (uint32_t i = 0; i + 2 <= weight; i++)
        for (size_t coset = 0; coset < cosets; coset++)
        {
            sagejs_p1_pair pair = list->pairs[coset];
            size_t image_coset = p1_apply_pair(
                list, pair.v, -(int64_t) pair.u);
            size_t source = (size_t) i * cosets + coset;
            size_t image = (size_t) (weight - 2 - i) * cosets
                + image_coset;
            if (image_coset >= cosets)
                goto done;
            p1_signed_union(
                &sets, source, image, (i & 1U) ? -1 : 1);
        }

    /* x - sign*xI = 0, I(i,u,v)=(-1)^i(i,-u,v). */
    if (sign != 0)
        for (uint32_t i = 0; i + 2 <= weight; i++)
            for (size_t coset = 0; coset < cosets; coset++)
            {
                sagejs_p1_pair pair = list->pairs[coset];
                size_t image_coset = p1_apply_pair(
                    list, -(int64_t) pair.u, pair.v);
                size_t source = (size_t) i * cosets + coset;
                size_t image = (size_t) i * cosets + image_coset;
                int image_coefficient = (i & 1U) ? -1 : 1;
                if (image_coset >= cosets)
                    goto done;
                p1_signed_union(
                    &sets, source, image, -sign * image_coefficient);
            }

    for (size_t generator = 0; generator < generators; generator++)
    {
        size_t root = p1_signed_find(&sets, generator);
        if (!sets.killed[root] && root_column[root] == SIZE_MAX)
        {
            root_column[root] = free_count;
            column_root[free_count++] = root;
        }
    }
    if (free_count > (size_t) WORD_MAX ||
        (free_count != 0 && generators >
            SAGEJS_MANIN_MAX_DENSE_CELLS / free_count))
        goto done;
    fmpq_mat_init(relations, (slong) generators, (slong) free_count);
    relations_initialized = 1;
    fmpz_init(binomial);

    /* x + xT + xT^2 = 0 using Sage/Magma's historical T convention. */
    for (uint32_t i = 0; i + 2 <= weight; i++)
        for (size_t coset = 0; coset < cosets; coset++)
        {
            size_t row = (size_t) i * cosets + coset;
            sagejs_p1_pair pair = list->pairs[coset];
            size_t t_coset = p1_apply_pair(
                list, pair.v,
                -(int64_t) pair.u - (int64_t) pair.v);
            size_t tt_coset = p1_apply_pair(
                list,
                -(int64_t) pair.u - (int64_t) pair.v,
                pair.u);
            uint32_t a = weight - 2 - i;
            if (t_coset >= cosets || tt_coset >= cosets ||
                !p1_relation_add_si(
                    relations, row, row, 1, &sets, root_column))
                goto relation_done;
            for (uint32_t j = 0; j <= a; j++)
            {
                fmpz_bin_uiui(binomial, a, j);
                if (((weight - 2 + j) & 1U) != 0)
                    fmpz_neg(binomial, binomial);
                if (!p1_relation_add_fmpz(
                        relations, row,
                        (size_t) j * cosets + t_coset,
                        binomial, &sets, root_column))
                    goto relation_done;
            }
            for (uint32_t j = 0; j <= i; j++)
            {
                fmpz_bin_uiui(binomial, i, j);
                if (((weight - 2 - i + j) & 1U) != 0)
                    fmpz_neg(binomial, binomial);
                if (!p1_relation_add_fmpz(
                        relations, row,
                        (size_t) (weight - 2 - i + j) * cosets
                            + tt_coset,
                        binomial, &sets, root_column))
                    goto relation_done;
            }
        }
    fmpz_clear(binomial);

    fmpq_mat_init(reduced, (slong) generators, (slong) free_count);
    reduced_initialized = 1;
    if (sagejs_fmpq_mat_prefers_sparse_rref(relations))
    {
        if (!sagejs_fmpq_mat_rref_sparse(
                reduced, &rank_slong, relations))
            goto done;
    }
    else
    {
        rank_slong = fmpq_mat_rref(reduced, relations);
    }
    if (rank_slong < 0 || (size_t) rank_slong > free_count)
        goto done;
    rank = (size_t) rank_slong;
    dimension = free_count - rank;
    pivot_row = malloc(
        (free_count == 0 ? 1 : free_count) * sizeof(*pivot_row));
    free_column = malloc(
        (dimension == 0 ? 1 : dimension) * sizeof(*free_column));
    answer->basis_generators = malloc(
        (dimension == 0 ? 1 : dimension)
            * sizeof(*answer->basis_generators));
    if (pivot_row == NULL || free_column == NULL ||
        answer->basis_generators == NULL)
        goto done;
    for (size_t column = 0; column < free_count; column++)
        pivot_row[column] = SIZE_MAX;
    {
        size_t pivot_column = 0;
        for (size_t row = 0; row < rank; row++)
        {
            while (pivot_column < free_count && fmpq_is_zero(
                fmpq_mat_entry(reduced, (slong) row,
                    (slong) pivot_column)))
                pivot_column++;
            if (pivot_column >= free_count)
                goto done;
            pivot_row[pivot_column] = row;
            pivot_column++;
        }
    }
    {
        size_t next = 0;
        for (size_t column = 0; column < free_count; column++)
            if (pivot_row[column] == SIZE_MAX)
            {
                free_column[next] = column;
                answer->basis_generators[next] = column_root[column];
                next++;
            }
        if (next != dimension)
            goto done;
    }
    if (dimension != 0 && generators >
        SAGEJS_MANIN_MAX_DENSE_CELLS / dimension)
        goto done;
    fmpq_mat_init(
        answer->reduction, (slong) generators, (slong) dimension);
    answer->reduction_initialized = 1;
    for (size_t original = 0; original < generators; original++)
    {
        size_t root = p1_signed_find(&sets, original);
        size_t column;
        int scale = sets.coefficient[original];
        if (sets.killed[root])
            continue;
        column = root_column[root];
        if (pivot_row[column] == SIZE_MAX)
        {
            size_t target = 0;
            while (target < dimension && free_column[target] != column)
                target++;
            if (target == dimension)
                goto done;
            fmpq_set_si(
                fmpq_mat_entry(answer->reduction,
                    (slong) original, (slong) target), scale, 1);
        }
        else
        {
            size_t row = pivot_row[column];
            for (size_t target = 0; target < dimension; target++)
            {
                fmpq_neg(
                    fmpq_mat_entry(answer->reduction,
                        (slong) original, (slong) target),
                    fmpq_mat_entry(reduced, (slong) row,
                        (slong) free_column[target]));
                if (scale < 0)
                    fmpq_neg(
                        fmpq_mat_entry(answer->reduction,
                            (slong) original, (slong) target),
                        fmpq_mat_entry(answer->reduction,
                            (slong) original, (slong) target));
            }
        }
    }
    answer->generators = generators;
    answer->two_term_generators = free_count;
    answer->dimension = dimension;
    status = 1;
    goto done;

relation_done:
    fmpz_clear(binomial);
done:
    if (relations_initialized)
        fmpq_mat_clear(relations);
    if (reduced_initialized)
        fmpq_mat_clear(reduced);
    free(sets.parent);
    free(sets.coefficient);
    free(sets.killed);
    free(root_column);
    free(column_root);
    free(pivot_row);
    free(free_column);
    if (!status)
        p1_higher_weight_clear(answer);
    return status;
}

typedef struct
{
    size_t *parent;
    ulong *exponent;
    unsigned char *killed;
    size_t count;
    ulong root_order;
} p1_root_union_find;

static ulong p1_add_exponents(ulong left, ulong right, ulong modulus)
{
    return (ulong) (((__uint128_t) left + right) % modulus);
}

static ulong p1_sub_exponents(ulong left, ulong right, ulong modulus)
{
    return left >= right ? left - right : modulus - (right - left);
}

static size_t p1_root_find(p1_root_union_find *sets, size_t value)
{
    size_t parent = sets->parent[value];
    if (parent != value)
    {
        size_t root = p1_root_find(sets, parent);
        sets->exponent[value] = p1_add_exponents(
            sets->exponent[value], sets->exponent[parent],
            sets->root_order);
        sets->parent[value] = root;
    }
    return sets->parent[value];
}

/* Impose left + zeta^relation_exponent * right = 0. */
static void p1_root_union(
    p1_root_union_find *sets,
    size_t left,
    size_t right,
    ulong relation_exponent)
{
    size_t left_root = p1_root_find(sets, left);
    size_t right_root = p1_root_find(sets, right);
    ulong left_scale = sets->exponent[left];
    ulong right_scale = sets->exponent[right];
    ulong expected_left = p1_add_exponents(
        sets->root_order / 2,
        p1_add_exponents(
            relation_exponent, right_scale, sets->root_order),
        sets->root_order);

    if (left_root == right_root)
    {
        if (left_scale != expected_left)
            sets->killed[left_root] = 1;
        return;
    }
    sets->parent[left_root] = right_root;
    sets->exponent[left_root] = p1_sub_exponents(
        expected_left, left_scale, sets->root_order);
    sets->killed[right_root] |= sets->killed[left_root];
}

static ulong p1_character_root_order(
    const dirichlet_group_struct *group)
{
    ulong exponent = group->expo;
    return (exponent & 1UL) == 0 ? exponent : 2 * exponent;
}

static ulong p1_character_exponent(
    const dirichlet_group_struct *group,
    const dirichlet_char_t character,
    ulong residue,
    ulong root_order)
{
    ulong exponent = dirichlet_chi(group, character, residue % group->q);
    if (exponent == DIRICHLET_CHI_NULL)
        return ULONG_MAX;
    return (ulong) (((__uint128_t) exponent * root_order) / group->expo);
}

static qqbar_ptr p1_gr_entry(
    gr_mat_t matrix, slong row, slong col, gr_ctx_t context)
{
    return (qqbar_ptr) gr_mat_entry_ptr(matrix, row, col, context);
}

static qqbar_srcptr p1_gr_entry_src(
    const gr_mat_t matrix, slong row, slong col,
    const gr_ctx_t context)
{
    return (qqbar_srcptr) gr_mat_entry_ptr(
        (gr_mat_struct *) matrix, row, col, (gr_ctx_struct *) context);
}

static void p1_character_presentation_clear(
    sagejs_character_presentation *presentation)
{
    free(presentation->basis_generators);
    if (presentation->reduction_initialized)
        gr_mat_clear(presentation->reduction, presentation->context);
    if (presentation->context_initialized)
        gr_ctx_clear(presentation->context);
    memset(presentation, 0, sizeof(*presentation));
}

static void p1_character_presentation_free(
    sagejs_character_presentation *presentation)
{
    if (presentation == NULL)
        return;
    p1_character_presentation_clear(presentation);
    free(presentation);
}

static void p1_character_presentation_finalize(
    napi_env env, void *data, void *hint)
{
    sagejs_character_presentation *presentation = data;
    (void) env;
    (void) hint;
    if (presentation != NULL &&
        presentation->magic == SAGEJS_CHARACTER_PRESENTATION_MAGIC)
        p1_character_presentation_free(presentation);
}

static sagejs_character_presentation *p1_character_presentation_unwrap(
    napi_env env, napi_value object)
{
    bool tagged = false;
    sagejs_character_presentation *presentation = NULL;

    if (!p1_check_napi(env, napi_check_object_type_tag(
            env, object, &sagejs_character_presentation_type_tag,
            &tagged)))
        return NULL;
    if (!tagged || !p1_check_napi(env, napi_unwrap(
            env, object, (void **) &presentation)) ||
        presentation == NULL ||
        presentation->magic != SAGEJS_CHARACTER_PRESENTATION_MAGIC)
    {
        napi_throw_type_error(
            env, NULL, "expected a retained character presentation");
        return NULL;
    }
    return presentation;
}

static int p1_character_relation_add(
    gr_mat_t relations,
    size_t row,
    size_t original,
    const fmpz_t integer_coefficient,
    ulong value_exponent,
    p1_root_union_find *sets,
    const size_t *root_column,
    gr_ctx_t context)
{
    size_t root = p1_root_find(sets, original);
    qqbar_t root_value, coefficient;
    ulong exponent;

    if (sets->killed[root])
        return 1;
    if (root_column[root] == SIZE_MAX)
        return 0;
    exponent = p1_add_exponents(
        value_exponent, sets->exponent[original], sets->root_order);
    qqbar_init(root_value);
    qqbar_init(coefficient);
    qqbar_root_of_unity(root_value, (slong) exponent, sets->root_order);
    qqbar_mul_fmpz(coefficient, root_value, integer_coefficient);
    qqbar_add(
        p1_gr_entry(relations, (slong) row,
            (slong) root_column[root], context),
        p1_gr_entry(relations, (slong) row,
            (slong) root_column[root], context),
        coefficient);
    qqbar_clear(coefficient);
    qqbar_clear(root_value);
    return 1;
}

static int p1_character_build(
    const sagejs_p1list_value *list,
    uint32_t weight,
    int sign,
    const dirichlet_group_struct *group,
    const dirichlet_char_t character,
    sagejs_character_presentation *answer)
{
    size_t cosets = list->count;
    size_t generators, free_count = 0, rank, dimension;
    size_t *root_column = NULL, *column_root = NULL, *pivot_row = NULL;
    size_t *free_column = NULL;
    p1_root_union_find sets = {0};
    gr_mat_t relations, reduced;
    int relations_initialized = 0, reduced_initialized = 0;
    fmpq_mat_t rational_relations, rational_reduced;
    int rational_relations_initialized = 0;
    int rational_reduced_initialized = 0;
    int character_is_real;
    slong rank_slong = 0;
    fmpz_t binomial, one;
    qqbar_t root_value, temporary;
    int scalar_values_initialized = 0;
    int status = 0;

    memset(answer, 0, sizeof(*answer));
    if (weight < 2 || (sign != -1 && sign != 0 && sign != 1) ||
        group == NULL || group->q != list->level || cosets == 0 ||
        (size_t) (weight - 1) > SIZE_MAX / cosets)
        return 0;
    generators = (size_t) (weight - 1) * cosets;
    character_is_real = dirichlet_char_is_real(group, character);
    if (generators > (size_t) WORD_MAX)
        return 0;
    sets.count = generators;
    sets.root_order = p1_character_root_order(group);
    sets.parent = malloc(generators * sizeof(*sets.parent));
    sets.exponent = malloc(generators * sizeof(*sets.exponent));
    sets.killed = calloc(generators, sizeof(*sets.killed));
    root_column = malloc(generators * sizeof(*root_column));
    column_root = malloc(generators * sizeof(*column_root));
    if (sets.parent == NULL || sets.exponent == NULL ||
        sets.killed == NULL || root_column == NULL || column_root == NULL)
        goto done;
    for (size_t generator = 0; generator < generators; generator++)
    {
        sets.parent[generator] = generator;
        sets.exponent[generator] = 0;
        root_column[generator] = SIZE_MAX;
    }

    /* x + xS = 0, including the character normalization scalar. */
    for (uint32_t i = 0; i + 2 <= weight; i++)
        for (size_t coset = 0; coset < cosets; coset++)
        {
            sagejs_p1_pair pair = list->pairs[coset], normalized;
            uint32_t scalar;
            size_t source = (size_t) i * cosets + coset;
            size_t image_coset, image;
            ulong exponent;
            if (!p1_normalize_pair(
                    list->level, pair.v, -(int64_t) pair.u,
                    &normalized, &scalar))
                goto done;
            image_coset = p1_index_normalized(list, normalized);
            if (image_coset >= cosets)
                goto done;
            image = (size_t) (weight - 2 - i) * cosets + image_coset;
            exponent = p1_character_exponent(
                group, character, scalar, sets.root_order);
            if (exponent == ULONG_MAX)
                goto done;
            if (i & 1U)
                exponent = p1_add_exponents(
                    exponent, sets.root_order / 2, sets.root_order);
            p1_root_union(&sets, source, image, exponent);
        }

    /* x - sign*xI = 0, again retaining the character scalar. */
    if (sign != 0)
        for (uint32_t i = 0; i + 2 <= weight; i++)
            for (size_t coset = 0; coset < cosets; coset++)
            {
                sagejs_p1_pair pair = list->pairs[coset], normalized;
                uint32_t scalar;
                size_t source = (size_t) i * cosets + coset;
                size_t image_coset, image;
                ulong exponent;
                if (!p1_normalize_pair(
                        list->level, -(int64_t) pair.u, pair.v,
                        &normalized, &scalar))
                    goto done;
                image_coset = p1_index_normalized(list, normalized);
                if (image_coset >= cosets)
                    goto done;
                image = (size_t) i * cosets + image_coset;
                exponent = p1_character_exponent(
                    group, character, scalar, sets.root_order);
                if (exponent == ULONG_MAX)
                    goto done;
                if (((i & 1U) != 0) != (sign > 0))
                    exponent = p1_add_exponents(
                        exponent, sets.root_order / 2,
                        sets.root_order);
                p1_root_union(&sets, source, image, exponent);
            }

    for (size_t generator = 0; generator < generators; generator++)
    {
        size_t root = p1_root_find(&sets, generator);
        if (!sets.killed[root] && root_column[root] == SIZE_MAX)
        {
            root_column[root] = free_count;
            column_root[free_count++] = root;
        }
    }
    if (free_count > (size_t) WORD_MAX ||
        (free_count != 0 && generators >
            SAGEJS_MANIN_MAX_DENSE_CELLS / free_count))
        goto done;
    gr_ctx_init_complex_qqbar(answer->context);
    answer->context_initialized = 1;
    gr_mat_init(relations, (slong) generators, (slong) free_count,
        answer->context);
    relations_initialized = 1;
    fmpz_init(binomial);
    fmpz_init_set_ui(one, 1);

    /* x + xT + xT^2 = 0. */
    for (uint32_t i = 0; i + 2 <= weight; i++)
        for (size_t coset = 0; coset < cosets; coset++)
        {
            size_t row = (size_t) i * cosets + coset;
            sagejs_p1_pair pair = list->pairs[coset], normalized;
            size_t t_coset, tt_coset;
            uint32_t t_scalar, tt_scalar;
            ulong t_exponent, tt_exponent;
            uint32_t a = weight - 2 - i;
            if (!p1_normalize_pair(
                    list->level, pair.v,
                    -(int64_t) pair.u - (int64_t) pair.v,
                    &normalized, &t_scalar))
                goto relation_done;
            t_coset = p1_index_normalized(list, normalized);
            if (!p1_normalize_pair(
                    list->level,
                    -(int64_t) pair.u - (int64_t) pair.v, pair.u,
                    &normalized, &tt_scalar))
                goto relation_done;
            tt_coset = p1_index_normalized(list, normalized);
            t_exponent = p1_character_exponent(
                group, character, t_scalar, sets.root_order);
            tt_exponent = p1_character_exponent(
                group, character, tt_scalar, sets.root_order);
            if (t_coset >= cosets || tt_coset >= cosets ||
                t_exponent == ULONG_MAX || tt_exponent == ULONG_MAX ||
                !p1_character_relation_add(
                    relations, row, row, one, 0,
                    &sets, root_column, answer->context))
                goto relation_done;
            for (uint32_t j = 0; j <= a; j++)
            {
                fmpz_bin_uiui(binomial, a, j);
                if (((weight - 2 + j) & 1U) != 0)
                    fmpz_neg(binomial, binomial);
                if (!p1_character_relation_add(
                        relations, row,
                        (size_t) j * cosets + t_coset,
                        binomial, t_exponent,
                        &sets, root_column, answer->context))
                    goto relation_done;
            }
            for (uint32_t j = 0; j <= i; j++)
            {
                fmpz_bin_uiui(binomial, i, j);
                if (((weight - 2 - i + j) & 1U) != 0)
                    fmpz_neg(binomial, binomial);
                if (!p1_character_relation_add(
                        relations, row,
                        (size_t) (weight - 2 - i + j) * cosets
                            + tt_coset,
                        binomial, tt_exponent,
                        &sets, root_column, answer->context))
                    goto relation_done;
            }
        }
    fmpz_clear(one);
    fmpz_clear(binomial);

    if (character_is_real)
    {
        fmpq_mat_init(rational_relations,
            (slong) generators, (slong) free_count);
        rational_relations_initialized = 1;
        for (size_t row = 0; row < generators; row++)
            for (size_t column = 0; column < free_count; column++)
            {
                qqbar_srcptr value = p1_gr_entry_src(
                    relations, (slong) row, (slong) column,
                    answer->context);
                if (!qqbar_is_rational(value))
                    goto done;
                qqbar_get_fmpq(
                    fmpq_mat_entry(rational_relations,
                        (slong) row, (slong) column), value);
            }
        fmpq_mat_init(rational_reduced,
            (slong) generators, (slong) free_count);
        rational_reduced_initialized = 1;
        if (sagejs_fmpq_mat_prefers_sparse_rref(rational_relations))
        {
            if (!sagejs_fmpq_mat_rref_sparse(
                    rational_reduced, &rank_slong,
                    rational_relations))
                goto done;
        }
        else
        {
            rank_slong = fmpq_mat_rref(
                rational_reduced, rational_relations);
        }
    }
    else
    {
        gr_mat_init(reduced, (slong) generators, (slong) free_count,
            answer->context);
        reduced_initialized = 1;
        if (!sagejs_qqbar_gr_mat_rref_sparse(
                reduced, &rank_slong, relations,
                answer->context))
            goto done;
    }
    if (rank_slong < 0 || (size_t) rank_slong > free_count)
        goto done;
    rank = (size_t) rank_slong;
    dimension = free_count - rank;
    pivot_row = malloc(
        (free_count == 0 ? 1 : free_count) * sizeof(*pivot_row));
    free_column = malloc(
        (dimension == 0 ? 1 : dimension) * sizeof(*free_column));
    answer->basis_generators = malloc(
        (dimension == 0 ? 1 : dimension)
            * sizeof(*answer->basis_generators));
    if (pivot_row == NULL || free_column == NULL ||
        answer->basis_generators == NULL)
        goto done;
    for (size_t column = 0; column < free_count; column++)
        pivot_row[column] = SIZE_MAX;
    {
        size_t pivot_column = 0;
        for (size_t row = 0; row < rank; row++)
        {
            while (pivot_column < free_count &&
                (character_is_real
                    ? fmpq_is_zero(fmpq_mat_entry(
                        rational_reduced, (slong) row,
                        (slong) pivot_column))
                    : qqbar_is_zero(p1_gr_entry_src(
                        reduced, (slong) row,
                        (slong) pivot_column, answer->context))))
                pivot_column++;
            if (pivot_column >= free_count)
                goto done;
            pivot_row[pivot_column] = row;
            pivot_column++;
        }
    }
    {
        size_t next = 0;
        for (size_t column = 0; column < free_count; column++)
            if (pivot_row[column] == SIZE_MAX)
            {
                free_column[next] = column;
                answer->basis_generators[next] = column_root[column];
                next++;
            }
        if (next != dimension)
            goto done;
    }
    if (dimension != 0 && generators >
        SAGEJS_MANIN_MAX_DENSE_CELLS / dimension)
        goto done;
    gr_mat_init(answer->reduction, (slong) generators, (slong) dimension,
        answer->context);
    answer->reduction_initialized = 1;
    qqbar_init(root_value);
    qqbar_init(temporary);
    scalar_values_initialized = 1;
    for (size_t original = 0; original < generators; original++)
    {
        size_t root = p1_root_find(&sets, original);
        size_t column;
        if (sets.killed[root])
            continue;
        column = root_column[root];
        qqbar_root_of_unity(
            root_value, (slong) sets.exponent[original], sets.root_order);
        if (pivot_row[column] == SIZE_MAX)
        {
            size_t target = 0;
            while (target < dimension && free_column[target] != column)
                target++;
            if (target == dimension)
                goto done;
            qqbar_set(p1_gr_entry(answer->reduction,
                (slong) original, (slong) target, answer->context),
                root_value);
        }
        else
        {
            size_t row = pivot_row[column];
            for (size_t target = 0; target < dimension; target++)
            {
                if (character_is_real)
                {
                    qqbar_set_fmpq(
                        temporary,
                        fmpq_mat_entry(rational_reduced,
                            (slong) row,
                            (slong) free_column[target]));
                    qqbar_mul(
                        temporary, temporary, root_value);
                }
                else
                {
                    qqbar_mul(
                        temporary,
                        p1_gr_entry_src(reduced, (slong) row,
                            (slong) free_column[target],
                            answer->context),
                        root_value);
                }
                qqbar_neg(p1_gr_entry(answer->reduction,
                    (slong) original, (slong) target, answer->context),
                    temporary);
            }
        }
    }
    answer->generators = generators;
    answer->two_term_generators = free_count;
    answer->dimension = dimension;
    status = 1;
    goto done;

relation_done:
    fmpz_clear(one);
    fmpz_clear(binomial);
done:
    if (scalar_values_initialized)
    {
        qqbar_clear(temporary);
        qqbar_clear(root_value);
    }
    if (relations_initialized)
        gr_mat_clear(relations, answer->context);
    if (reduced_initialized)
        gr_mat_clear(reduced, answer->context);
    if (rational_relations_initialized)
        fmpq_mat_clear(rational_relations);
    if (rational_reduced_initialized)
        fmpq_mat_clear(rational_reduced);
    free(sets.parent);
    free(sets.exponent);
    free(sets.killed);
    free(root_column);
    free(column_root);
    free(pivot_row);
    free(free_column);
    if (!status)
        p1_character_presentation_clear(answer);
    return status;
}

static int p1_napi_set_size(
    napi_env env, napi_value object, const char *name, size_t value)
{
    napi_value number;
    return value <= (size_t) INT64_MAX &&
        p1_check_napi(env, napi_create_int64(env, (int64_t) value, &number)) &&
        p1_check_napi(env, napi_set_named_property(env, object, name, number));
}

napi_value sagejs_p1list_higher_weight_presentation(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[3], result = NULL, reduction = NULL, generators;
    sagejs_p1list_value *list;
    sagejs_higher_weight_presentation presentation = {0};
    int64_t weight_value, sign_value;

    if (!p1_arguments(env, info, 3, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL ||
        !p1_safe_integer(env, arguments[1], &weight_value) ||
        !p1_safe_integer(env, arguments[2], &sign_value))
        return NULL;
    if (weight_value < 2 || weight_value > UINT32_MAX ||
        (sign_value != -1 && sign_value != 0 && sign_value != 1))
    {
        napi_throw_range_error(env, NULL,
            "higher-weight presentation requires weight >= 2 and sign -1, 0, or 1");
        return NULL;
    }
    if (!p1_higher_weight_build(
            list, (uint32_t) weight_value, (int) sign_value,
            &presentation))
    {
        napi_throw_error(env, NULL,
            "unable to construct exact higher-weight Manin presentation");
        return NULL;
    }
    reduction = sagejs_qq_matrix_from_fmpq_mat(
        env, presentation.reduction);
    if (presentation.dimension > UINT32_MAX || reduction == NULL ||
        !p1_check_napi(env, napi_create_array_with_length(
            env, presentation.dimension, &generators)))
        goto done;
    for (size_t index = 0; index < presentation.dimension; index++)
    {
        napi_value value;
        if (!p1_check_napi(env, napi_create_int64(
                env, (int64_t) presentation.basis_generators[index],
                &value)) ||
            !p1_check_napi(env, napi_set_element(
                env, generators, (uint32_t) index, value)))
            goto done;
    }
    if (!p1_check_napi(env, napi_create_object(env, &result)) ||
        !p1_napi_set_size(env, result, "generators", presentation.generators) ||
        !p1_napi_set_size(env, result, "twoTermGenerators",
            presentation.two_term_generators) ||
        !p1_napi_set_size(env, result, "dimension", presentation.dimension) ||
        !p1_check_napi(env, napi_set_named_property(
            env, result, "basisGenerators", generators)) ||
        !p1_check_napi(env, napi_set_named_property(
            env, result, "reduction", reduction)))
        result = NULL;

done:
    p1_higher_weight_clear(&presentation);
    return result;
}

napi_value sagejs_p1list_character_presentation(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[5], result = NULL, reduction = NULL, generators;
    sagejs_p1list_value *list;
    sagejs_character_presentation *presentation = NULL;
    const dirichlet_group_struct *group = NULL;
    dirichlet_char_t character;
    int character_initialized = 0;
    int64_t weight_value, sign_value;
    ulong character_index;

    presentation = calloc(1, sizeof(*presentation));
    if (presentation == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate character presentation");
        return NULL;
    }
    if (!p1_arguments(env, info, 5, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL ||
        !p1_safe_integer(env, arguments[1], &weight_value) ||
        !p1_safe_integer(env, arguments[2], &sign_value) ||
        !p1_bigint_to_ulong(env, arguments[4], &character_index) ||
        !sagejs_dirichlet_character_init_native(
            env, arguments[3], arguments[4], &group, character))
        goto done;
    character_initialized = 1;
    if (weight_value < 2 || weight_value > UINT32_MAX ||
        (sign_value != -1 && sign_value != 0 && sign_value != 1) ||
        group->q != list->level)
    {
        napi_throw_range_error(env, NULL,
            "character presentation requires matching level, weight >= 2, and sign -1, 0, or 1");
        goto done;
    }
    if (!p1_character_build(
            list, (uint32_t) weight_value, (int) sign_value,
            group, character, presentation))
    {
        napi_throw_error(env, NULL,
            "unable to construct exact character Manin presentation");
        goto done;
    }
    presentation->magic = SAGEJS_CHARACTER_PRESENTATION_MAGIC;
    presentation->level = list->level;
    presentation->weight = (uint32_t) weight_value;
    presentation->sign = (int) sign_value;
    presentation->character_index = character_index;
    reduction = dirichlet_char_is_real(group, character)
        ? sagejs_qq_matrix_from_qqbar_gr_mat(
            env, presentation->reduction, presentation->context)
        : sagejs_qqbar_matrix_from_gr_mat(
            env, presentation->reduction, presentation->context);
    if (presentation->dimension > UINT32_MAX || reduction == NULL ||
        !p1_check_napi(env, napi_create_array_with_length(
            env, presentation->dimension, &generators)))
        goto done;
    for (size_t index = 0; index < presentation->dimension; index++)
    {
        napi_value value;
        if (!p1_check_napi(env, napi_create_int64(
                env, (int64_t) presentation->basis_generators[index],
                &value)) ||
            !p1_check_napi(env, napi_set_element(
                env, generators, (uint32_t) index, value)))
            goto done;
    }
    if (!p1_check_napi(env, napi_create_object(env, &result)) ||
        !p1_napi_set_size(env, result, "generators", presentation->generators) ||
        !p1_napi_set_size(env, result, "twoTermGenerators",
            presentation->two_term_generators) ||
        !p1_napi_set_size(env, result, "dimension", presentation->dimension) ||
        !p1_check_napi(env, napi_set_named_property(
            env, result, "basisGenerators", generators)) ||
        !p1_check_napi(env, napi_set_named_property(
            env, result, "reduction", reduction)) ||
        !p1_check_napi(env, napi_type_tag_object(
            env, result, &sagejs_character_presentation_type_tag)) ||
        !p1_check_napi(env, napi_wrap(
            env, result, presentation,
            p1_character_presentation_finalize, NULL, NULL)))
        result = NULL;
    else
        presentation = NULL;

done:
    p1_character_presentation_free(presentation);
    if (character_initialized)
        dirichlet_char_clear(character);
    return result;
}

static void p1_monomial_matrix_coefficient(
    fmpz_t result,
    uint32_t i,
    uint32_t weight_degree,
    uint32_t target,
    int64_t a,
    int64_t b,
    int64_t c,
    int64_t d)
{
    fmpz_t left_binomial, right_binomial, term, power;
    uint32_t right_degree = weight_degree - i;
    fmpz_zero(result);
    fmpz_init(left_binomial);
    fmpz_init(right_binomial);
    fmpz_init(term);
    fmpz_init(power);
    for (uint32_t left_x = 0; left_x <= i; left_x++)
    {
        uint32_t right_x;
        if (target < left_x)
            continue;
        right_x = target - left_x;
        if (right_x > right_degree)
            continue;
        fmpz_bin_uiui(left_binomial, i, left_x);
        fmpz_bin_uiui(right_binomial, right_degree, right_x);
        fmpz_mul(term, left_binomial, right_binomial);
        fmpz_set_si(power, a);
        fmpz_pow_ui(power, power, left_x);
        fmpz_mul(term, term, power);
        fmpz_set_si(power, b);
        fmpz_pow_ui(power, power, i - left_x);
        fmpz_mul(term, term, power);
        fmpz_set_si(power, c);
        fmpz_pow_ui(power, power, right_x);
        fmpz_mul(term, term, power);
        fmpz_set_si(power, d);
        fmpz_pow_ui(power, power, right_degree - right_x);
        fmpz_mul(term, term, power);
        fmpz_add(result, result, term);
    }
    fmpz_clear(left_binomial);
    fmpz_clear(right_binomial);
    fmpz_clear(term);
    fmpz_clear(power);
}

typedef struct
{
    int64_t a, b, c, d;
} p1_matrix_four;

static int64_t p1_round_quotient(int64_t numerator, int64_t denominator)
{
    uint64_t absolute_numerator = numerator < 0
        ? (uint64_t) (-numerator) : (uint64_t) numerator;
    uint64_t absolute_denominator = denominator < 0
        ? (uint64_t) (-denominator) : (uint64_t) denominator;
    uint64_t quotient = (
        absolute_numerator + absolute_denominator / 2)
        / absolute_denominator;
    return (numerator < 0) == (denominator < 0)
        ? (int64_t) quotient : -(int64_t) quotient;
}

/* Cremona's continued-fraction Heilbronn representatives for T_p. */
static int p1_heilbronn_cremona(
    ulong prime, p1_matrix_four **matrices_out, size_t *count_out)
{
    p1_matrix_four *matrices = NULL;
    size_t count = 1, position = 0;

    if (matrices_out == NULL || count_out == NULL ||
        prime < 2 || prime > INT32_MAX || !n_is_prime(prime))
        return 0;
    if (prime == 2)
        count = 4;
    else
    {
        int64_t half = (int64_t) prime / 2;
        for (int64_t r = -half; r <= half; r++)
        {
            int64_t a = -(int64_t) prime, b = r;
            count++;
            while (b != 0)
            {
                int64_t q = p1_round_quotient(a, b);
                int64_t c = a - b * q;
                a = -b;
                b = c;
                count++;
            }
        }
    }
    if (count > SIZE_MAX / sizeof(*matrices))
        return 0;
    matrices = malloc(count * sizeof(*matrices));
    if (matrices == NULL)
        return 0;
    matrices[position++] = (p1_matrix_four) {1, 0, 0, (int64_t) prime};
    if (prime == 2)
    {
        matrices[position++] = (p1_matrix_four) {2, 0, 0, 1};
        matrices[position++] = (p1_matrix_four) {2, 1, 0, 1};
        matrices[position++] = (p1_matrix_four) {1, 0, 1, 2};
    }
    else
    {
        int64_t half = (int64_t) prime / 2;
        for (int64_t r = -half; r <= half; r++)
        {
            int64_t x1 = (int64_t) prime, x2 = -r;
            int64_t y1 = 0, y2 = 1;
            int64_t a = -(int64_t) prime, b = r;
            matrices[position++] = (p1_matrix_four) {x1, x2, y1, y2};
            while (b != 0)
            {
                int64_t q = p1_round_quotient(a, b);
                int64_t c = a - b * q;
                int64_t x3, y3;
                a = -b;
                b = c;
                x3 = q * x2 - x1;
                x1 = x2;
                x2 = x3;
                y3 = q * y2 - y1;
                y1 = y2;
                y2 = y3;
                matrices[position++] = (p1_matrix_four) {x1, x2, y1, y2};
            }
        }
    }
    if (position != count)
    {
        free(matrices);
        return 0;
    }
    *matrices_out = matrices;
    *count_out = count;
    return 1;
}

napi_value sagejs_p1list_higher_weight_hecke_matrix(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[4], result = NULL;
    sagejs_p1list_value *list;
    sagejs_higher_weight_presentation presentation = {0};
    int64_t weight_value, sign_value, prime_value;
    fmpq_mat_t matrix;
    int matrix_initialized = 0;
    fmpz_t coefficient;
    fmpq_t scaled;
    p1_matrix_four *heilbronn = NULL;
    size_t heilbronn_count = 0;

    if (!p1_arguments(env, info, 4, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL ||
        !p1_safe_integer(env, arguments[1], &weight_value) ||
        !p1_safe_integer(env, arguments[2], &sign_value) ||
        !p1_safe_integer(env, arguments[3], &prime_value))
        return NULL;
    if (weight_value < 2 || weight_value > UINT32_MAX ||
        (sign_value != -1 && sign_value != 0 && sign_value != 1) ||
        prime_value < 2 || prime_value > INT32_MAX ||
        !n_is_prime((ulong) prime_value))
    {
        napi_throw_range_error(env, NULL,
            "higher-weight native Hecke requires a 31-bit prime and sign -1, 0, or 1");
        return NULL;
    }
    if (!p1_higher_weight_build(
            list, (uint32_t) weight_value, (int) sign_value,
            &presentation))
    {
        napi_throw_error(env, NULL,
            "unable to construct higher-weight Hecke presentation");
        return NULL;
    }
    if (!p1_heilbronn_cremona(
            (ulong) prime_value, &heilbronn, &heilbronn_count))
    {
        p1_higher_weight_clear(&presentation);
        napi_throw_error(env, NULL,
            "unable to construct Cremona-Heilbronn representatives");
        return NULL;
    }
    fmpq_mat_init(matrix, (slong) presentation.dimension,
        (slong) presentation.dimension);
    matrix_initialized = 1;
    fmpz_init(coefficient);
    fmpq_init(scaled);
    for (size_t source = 0; source < presentation.dimension; source++)
    {
        size_t generator = presentation.basis_generators[source];
        uint32_t i = (uint32_t) (generator / list->count);
        sagejs_p1_pair pair = list->pairs[generator % list->count];
        for (size_t h = 0; h < heilbronn_count; h++)
        {
            int64_t a = heilbronn[h].a;
            int64_t b = heilbronn[h].b;
            int64_t c = heilbronn[h].c;
            int64_t d = heilbronn[h].d;
            __int128 image_u = (__int128) pair.u * a
                + (__int128) pair.v * c;
            __int128 image_v = (__int128) pair.u * b
                + (__int128) pair.v * d;
            size_t image_coset = p1_apply_pair(
                list,
                (int64_t) (image_u % list->level),
                (int64_t) (image_v % list->level));
            /* At a bad prime, non-primitive images represent zero. */
            if (image_coset >= list->count)
                continue;
            for (uint32_t target_degree = 0;
                target_degree + 2 <= (uint32_t) weight_value;
                target_degree++)
            {
                size_t image_generator =
                    (size_t) target_degree * list->count + image_coset;
                p1_monomial_matrix_coefficient(
                    coefficient, i, (uint32_t) weight_value - 2,
                    target_degree, a, b, c, d);
                if (fmpz_is_zero(coefficient))
                    continue;
                for (size_t target = 0;
                    target < presentation.dimension; target++)
                {
                    fmpq_mul_fmpz(
                        scaled,
                        fmpq_mat_entry(presentation.reduction,
                            (slong) image_generator, (slong) target),
                        coefficient);
                    fmpq_add(
                        fmpq_mat_entry(matrix,
                            (slong) source, (slong) target),
                        fmpq_mat_entry(matrix,
                            (slong) source, (slong) target),
                        scaled);
                }
            }
        }
    }
    result = sagejs_qq_matrix_from_fmpq_mat(env, matrix);

    fmpq_clear(scaled);
    fmpz_clear(coefficient);
    if (matrix_initialized)
        fmpq_mat_clear(matrix);
    free(heilbronn);
    p1_higher_weight_clear(&presentation);
    return result;
}

napi_value sagejs_p1list_character_hecke_matrix(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[7], result = NULL;
    size_t argument_count = 7;
    sagejs_p1list_value *list;
    sagejs_character_presentation local_presentation = {0};
    sagejs_character_presentation *presentation = &local_presentation;
    int retained_presentation = 0;
    const dirichlet_group_struct *group = NULL;
    dirichlet_char_t character;
    int character_initialized = 0;
    int64_t weight_value, sign_value, prime_value;
    ulong character_index;
    gr_mat_t matrix;
    int matrix_initialized = 0;
    fmpz_t integer_coefficient;
    qqbar_t root_value, scaled, term;
    int scalars_initialized = 0;
    p1_matrix_four *heilbronn = NULL;
    size_t heilbronn_count = 0;
    ulong root_order;

    if (!p1_check_napi(env, napi_get_cb_info(
            env, info, &argument_count, arguments, NULL, NULL)) ||
        (argument_count != 6 && argument_count != 7))
    {
        napi_throw_type_error(env, NULL, "wrong number of arguments");
        return NULL;
    }
    if (
        (list = p1_unwrap(env, arguments[0])) == NULL ||
        !p1_safe_integer(env, arguments[1], &weight_value) ||
        !p1_safe_integer(env, arguments[2], &sign_value) ||
        !p1_safe_integer(env, arguments[3], &prime_value) ||
        !p1_bigint_to_ulong(env, arguments[5], &character_index) ||
        !sagejs_dirichlet_character_init_native(
            env, arguments[4], arguments[5], &group, character))
        return NULL;
    character_initialized = 1;
    if (weight_value < 2 || weight_value > UINT32_MAX ||
        (sign_value != -1 && sign_value != 0 && sign_value != 1) ||
        prime_value < 2 || prime_value > INT32_MAX ||
        !n_is_prime((ulong) prime_value) || group->q != list->level)
    {
        napi_throw_range_error(env, NULL,
            "character Hecke requires matching level, a 31-bit prime, and sign -1, 0, or 1");
        goto done;
    }
    if (argument_count == 7)
    {
        sagejs_character_presentation *retained =
            p1_character_presentation_unwrap(
            env, arguments[6]);
        if (retained == NULL)
            goto done;
        presentation = retained;
        retained_presentation = 1;
        if (presentation->level != list->level ||
            presentation->weight != (uint32_t) weight_value ||
            presentation->sign != (int) sign_value ||
            presentation->character_index != character_index)
        {
            napi_throw_range_error(env, NULL,
                "retained character presentation does not match level, weight, sign, and character");
            goto done;
        }
    }
    else if (!p1_character_build(
            list, (uint32_t) weight_value, (int) sign_value,
            group, character, presentation))
    {
        napi_throw_error(env, NULL,
            "unable to construct character Hecke presentation");
        goto done;
    }
    if (!p1_heilbronn_cremona(
            (ulong) prime_value, &heilbronn, &heilbronn_count))
    {
        napi_throw_error(env, NULL,
            "unable to construct Cremona-Heilbronn representatives");
        goto done;
    }
    gr_mat_init(matrix, (slong) presentation->dimension,
        (slong) presentation->dimension, presentation->context);
    matrix_initialized = 1;
    fmpz_init(integer_coefficient);
    qqbar_init(root_value);
    qqbar_init(scaled);
    qqbar_init(term);
    scalars_initialized = 1;
    root_order = p1_character_root_order(group);
    for (size_t source = 0; source < presentation->dimension; source++)
    {
        size_t generator = presentation->basis_generators[source];
        uint32_t i = (uint32_t) (generator / list->count);
        sagejs_p1_pair pair = list->pairs[generator % list->count];
        for (size_t h = 0; h < heilbronn_count; h++)
        {
            int64_t a = heilbronn[h].a;
            int64_t b = heilbronn[h].b;
            int64_t c = heilbronn[h].c;
            int64_t d = heilbronn[h].d;
            __int128 image_u = (__int128) pair.u * a
                + (__int128) pair.v * c;
            __int128 image_v = (__int128) pair.u * b
                + (__int128) pair.v * d;
            sagejs_p1_pair normalized;
            uint32_t scalar;
            size_t image_coset;
            ulong value_exponent;
            if (!p1_normalize_pair(
                    list->level,
                    (int64_t) (image_u % list->level),
                    (int64_t) (image_v % list->level),
                    &normalized, &scalar))
                continue;
            image_coset = p1_index_normalized(list, normalized);
            if (image_coset >= list->count)
                continue;
            value_exponent = p1_character_exponent(
                group, character, scalar, root_order);
            if (value_exponent == ULONG_MAX)
                continue;
            qqbar_root_of_unity(
                root_value, (slong) value_exponent, root_order);
            for (uint32_t target_degree = 0;
                target_degree + 2 <= (uint32_t) weight_value;
                target_degree++)
            {
                size_t image_generator =
                    (size_t) target_degree * list->count + image_coset;
                p1_monomial_matrix_coefficient(
                    integer_coefficient, i,
                    (uint32_t) weight_value - 2,
                    target_degree, a, b, c, d);
                if (fmpz_is_zero(integer_coefficient))
                    continue;
                qqbar_mul_fmpz(scaled, root_value, integer_coefficient);
                for (size_t target = 0;
                    target < presentation->dimension; target++)
                {
                    qqbar_mul(
                        term, scaled,
                        p1_gr_entry_src(presentation->reduction,
                            (slong) image_generator, (slong) target,
                            presentation->context));
                    qqbar_add(
                        p1_gr_entry(matrix, (slong) source,
                            (slong) target, presentation->context),
                        p1_gr_entry(matrix, (slong) source,
                            (slong) target, presentation->context),
                        term);
                }
            }
        }
    }
    result = dirichlet_char_is_real(group, character)
        ? sagejs_qq_matrix_from_qqbar_gr_mat(
            env, matrix, presentation->context)
        : sagejs_qqbar_matrix_from_gr_mat(
            env, matrix, presentation->context);

done:
    if (scalars_initialized)
    {
        qqbar_clear(term);
        qqbar_clear(scaled);
        qqbar_clear(root_value);
        fmpz_clear(integer_coefficient);
    }
    if (matrix_initialized)
        gr_mat_clear(matrix, presentation->context);
    free(heilbronn);
    if (!retained_presentation)
        p1_character_presentation_clear(presentation);
    if (character_initialized)
        dirichlet_char_clear(character);
    return result;
}

napi_value sagejs_p1list_reduce_path(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[5], result;
    sagejs_p1list_value *list;
    sagejs_manin_presentation_info presentation;
    sagejs_modsym_presentation_view view;
    int64_t start_numerator, start_denominator;
    int64_t stop_numerator, stop_denominator;
    slong *entries;
    size_t dimension;

    if (!p1_arguments(env, info, 5, arguments) ||
        (list = p1_unwrap(env, arguments[0])) == NULL ||
        !p1_safe_integer(env, arguments[1], &start_numerator) ||
        !p1_safe_integer(env, arguments[2], &start_denominator) ||
        !p1_safe_integer(env, arguments[3], &stop_numerator) ||
        !p1_safe_integer(env, arguments[4], &stop_denominator))
        return NULL;
    if (!p1_manin_presentation_build(list, &presentation))
    {
        napi_throw_error(env, NULL,
            "unable to construct minimal Manin presentation");
        return NULL;
    }
    view = p1_presentation_view(list, &presentation);
    entries = sagejs_modsym_weight2_reduce_path(
        &view,
        start_numerator, start_denominator,
        stop_numerator, stop_denominator,
        &dimension);
    p1_manin_presentation_clear(&presentation);
    if (entries == NULL || dimension > (size_t) WORD_MAX)
    {
        free(entries);
        napi_throw_error(env, NULL,
            "unable to reduce exact weight-2 modular-symbol path");
        return NULL;
    }
    result = sagejs_zz_matrix_from_slong_entries(
        env, (slong) dimension, 1, entries);
    free(entries);
    return result;
}

napi_value sagejs_manin_relations_info(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[1], result, checksum_value;
    sagejs_manin_relations_value *relations;
    uint64_t checksum = UINT64_C(1469598103934665603);
    char checksum_text[17];

    if (!p1_arguments(env, info, 1, arguments) ||
        (relations = manin_unwrap(env, arguments[0])) == NULL ||
        !p1_check_napi(env, napi_create_object(env, &result)))
        return NULL;
    for (size_t row = 0; row < relations->rows; row++)
    {
        checksum ^= row;
        checksum *= UINT64_C(1099511628211);
        for (size_t position = relations->row_offsets[row];
             position < relations->row_offsets[row + 1]; position++)
        {
            checksum ^= relations->columns[position];
            checksum *= UINT64_C(1099511628211);
            checksum ^= relations->values[position];
            checksum *= UINT64_C(1099511628211);
        }
    }
    snprintf(checksum_text, sizeof(checksum_text), "%016llx",
        (unsigned long long) checksum);
    if (!manin_set_number_property(
            env, result, "level", relations->level) ||
        !manin_set_number_property(
            env, result, "modulus", (double) relations->modulus) ||
        !manin_set_number_property(
            env, result, "generators", (double) relations->generators) ||
        !manin_set_number_property(
            env, result, "rows", (double) relations->rows) ||
        !manin_set_number_property(
            env, result, "nonzero", (double) relations->nonzero) ||
        !manin_set_number_property(
            env, result, "sRelations", (double) relations->s_relations) ||
        !manin_set_number_property(
            env, result, "rRelations", (double) relations->r_relations) ||
        !p1_check_napi(env,
            napi_create_string_utf8(
                env, checksum_text, NAPI_AUTO_LENGTH, &checksum_value)) ||
        !p1_check_napi(env,
            napi_set_named_property(env, result, "checksum", checksum_value)))
        return NULL;
    return result;
}

napi_value sagejs_manin_relations_row(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[2], result, value;
    sagejs_manin_relations_value *relations;
    size_t row, start, stop;

    if (!p1_arguments(env, info, 2, arguments) ||
        (relations = manin_unwrap(env, arguments[0])) == NULL ||
        !p1_size_index(env, arguments[1], relations->rows, &row))
        return NULL;
    start = relations->row_offsets[row];
    stop = relations->row_offsets[row + 1];
    if (!p1_check_napi(env,
        napi_create_array_with_length(env, 2 * (stop - start), &result)))
        return NULL;
    for (size_t position = start; position < stop; position++)
    {
        uint32_t output = (uint32_t) (2 * (position - start));
        if (!p1_check_napi(env,
                napi_create_double(
                    env, (double) relations->columns[position], &value)) ||
            !p1_check_napi(env,
                napi_set_element(env, result, output, value)) ||
            !p1_check_napi(env,
                napi_create_bigint_uint64(
                    env, relations->values[position], &value)) ||
            !p1_check_napi(env,
                napi_set_element(env, result, output + 1, value)))
            return NULL;
    }
    return result;
}

napi_value sagejs_manin_relations_rank(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[1], result;
    sagejs_manin_relations_value *relations;
    nmod_mat_t matrix;
    slong rank;
    __uint128_t cells;

    if (!p1_arguments(env, info, 1, arguments) ||
        (relations = manin_unwrap(env, arguments[0])) == NULL)
        return NULL;
    cells = (__uint128_t) relations->rows * relations->generators;
    if (cells > SAGEJS_MANIN_MAX_DENSE_CELLS)
    {
        napi_throw_range_error(env, NULL,
            "relation matrix is too large for the initial dense rank backend");
        return NULL;
    }
    nmod_mat_init(
        matrix, (slong) relations->rows,
        (slong) relations->generators, relations->modulus);
    for (size_t row = 0; row < relations->rows; row++)
        for (size_t position = relations->row_offsets[row];
             position < relations->row_offsets[row + 1]; position++)
            nmod_mat_entry(matrix, row, relations->columns[position]) =
                relations->values[position];
    rank = nmod_mat_rank(matrix);
    nmod_mat_clear(matrix);
    if (!p1_check_napi(env, napi_create_int64(env, rank, &result)))
        return NULL;
    return result;
}
