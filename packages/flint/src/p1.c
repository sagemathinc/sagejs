#include <limits.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <node_api.h>

#include <flint/nmod_mat.h>
#include <flint/ulong_extras.h>

#include "p1.h"

/*
 * Sage-compatible P^1(Z/NZ) representatives and weight-2 Manin relations.
 *
 * The representative conventions follow SageMath's GPL-licensed P1List;
 * the count-first, allocate-once layout is informed by William Stein's
 * later JSage/Zig implementation.  See bench/MODULAR-SYMBOLS.md for exact
 * source revisions, mathematical conventions, and comparative benchmarks.
 */

#define SAGEJS_P1_MAGIC UINT64_C(0x534147454A535031)
#define SAGEJS_MANIN_MAGIC UINT64_C(0x534147454A534D52)
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

typedef struct
{
    int64_t numerator;
    int64_t denominator;
    size_t next;
    unsigned char edge_type;
} sagejs_farey_cusp;

typedef struct
{
    size_t cusps;
    size_t interior_paths;
    size_t e1;
    size_t e2;
    size_t torsion2;
    size_t torsion3;
} sagejs_manin_presentation_info;

enum
{
    SAGEJS_FAREY_EDGE_CLOSED,
    SAGEJS_FAREY_EDGE_PENDING,
    SAGEJS_FAREY_EDGE_TORSION3
};

static const napi_type_tag sagejs_p1_type_tag = {
    UINT64_C(0x690d50401f624373),
    UINT64_C(0x9fb35c93be831979)
};

static const napi_type_tag sagejs_manin_type_tag = {
    UINT64_C(0xc843bcb4b18e4427),
    UINT64_C(0xa1df45b7e3ca6860)
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

static int p1_farey_mark(
    const sagejs_p1list_value *list,
    unsigned char *visited,
    int64_t u,
    int64_t v)
{
    size_t index = p1_apply_pair(list, u, v);
    if (index == SIZE_MAX)
        return 0;
    visited[index] = 1;
    return 1;
}

static int p1_farey_torsion3(
    uint32_t level, int64_t left, int64_t right)
{
    uint64_t a = p1_reduce_signed(left, level);
    uint64_t b = p1_reduce_signed(right, level);
    __uint128_t value = (__uint128_t) a * a
        + (__uint128_t) b * b + (__uint128_t) a * b;
    return (uint32_t) (value % level) == 0;
}

static size_t p1_path_index(
    const sagejs_p1list_value *list,
    const sagejs_farey_cusp *start,
    const sagejs_farey_cusp *stop)
{
    __int128 determinant = (__int128) start->numerator * stop->denominator
        - (__int128) stop->numerator * start->denominator;
    int64_t c = start->denominator;
    if (determinant < 0)
        c = -c;
    return p1_apply_pair(list, c, stop->denominator);
}

static int p1_insert_boundary_path(
    const sagejs_p1list_value *list,
    const sagejs_farey_cusp *start,
    const sagejs_farey_cusp *stop,
    size_t *standard_e1,
    sagejs_manin_presentation_info *result)
{
    size_t reverse = p1_path_index(list, stop, start);
    if (reverse == SIZE_MAX)
        return 0;
    if (standard_e1[reverse] != 0)
    {
        result->e2++;
    }
    else
    {
        size_t forward = p1_path_index(list, start, stop);
        if (forward == SIZE_MAX)
            return 0;
        result->e1++;
        standard_e1[forward] = result->e1;
    }
    return 1;
}

/*
 * Construct the Pollack--Stevens well-formed fundamental domain used by
 * PARI's msinit.  The algorithm is adapted from PARI/GP modsym.c, copyright
 * (C) 2011 The PARI Group, GPL-2.0-or-later, development revision
 * 0f5a08ee7e (2026-07-31).  This implementation is intentionally built from
 * arrays and indices: the maximum storage is known from #P1(Z/NZ), so no cusp
 * or edge node is individually allocated.  At weight 2 the number of E1
 * boundary paths is the dimension of the full Gamma0(N) modular-symbol space
 * in characteristic different from 2 and 3.
 */
static int p1_manin_presentation_build(
    const sagejs_p1list_value *list,
    sagejs_manin_presentation_info *result)
{
    sagejs_farey_cusp *nodes = NULL;
    unsigned char *visited = NULL;
    size_t *order = NULL, *standard_e1 = NULL;
    size_t used = 2;
    const size_t none = SIZE_MAX;
    sagejs_farey_cusp infinity = {1, 0, SIZE_MAX, 0};

    memset(result, 0, sizeof(*result));
    if (list->level == 1)
    {
        result->cusps = 2;
        return 1;
    }
    nodes = calloc(list->count, sizeof(*nodes));
    visited = calloc(list->count, sizeof(*visited));
    order = malloc(list->count * sizeof(*order));
    standard_e1 = calloc(list->count, sizeof(*standard_e1));
    if (nodes == NULL || visited == NULL || order == NULL ||
        standard_e1 == NULL)
        goto fail;

    nodes[0] = (sagejs_farey_cusp) {
        0, 1, 1, SAGEJS_FAREY_EDGE_CLOSED};
    nodes[1] = (sagejs_farey_cusp) {
        1, 1, none, SAGEJS_FAREY_EDGE_PENDING};
    if (!p1_farey_mark(list, visited, 0, 1) ||
        !p1_farey_mark(list, visited, 1, -1) ||
        !p1_farey_mark(list, visited, -1, 0))
        goto fail;

    for (;;)
    {
        int done = 1;
        size_t current = 0;
        while (current != none && nodes[current].next != none)
        {
            size_t right = nodes[current].next;
            int64_t b1, b2;
            size_t position;

            if (nodes[right].edge_type != SAGEJS_FAREY_EDGE_PENDING)
            {
                current = right;
                continue;
            }
            b1 = nodes[right].denominator;
            b2 = nodes[current].denominator;
            position = p1_apply_pair(list, b1, b2);
            if (position == SIZE_MAX)
                goto fail;
            if (visited[position])
            {
                nodes[right].edge_type = SAGEJS_FAREY_EDGE_CLOSED;
            }
            else
            {
                int64_t denominator, numerator;
                visited[position] = 1;
                if (!p1_farey_mark(list, visited, -(b1 + b2), b1) ||
                    !p1_farey_mark(list, visited, b2, -(b1 + b2)))
                    goto fail;
                if (p1_farey_torsion3(list->level, b1, b2))
                {
                    nodes[right].edge_type =
                        SAGEJS_FAREY_EDGE_TORSION3;
                }
                else
                {
                    if (used >= list->count ||
                        __builtin_add_overflow(
                            nodes[current].numerator,
                            nodes[right].numerator,
                            &numerator) ||
                        __builtin_add_overflow(
                            nodes[current].denominator,
                            nodes[right].denominator,
                            &denominator))
                        goto fail;
                    nodes[used] = (sagejs_farey_cusp) {
                        numerator,
                        denominator,
                        right,
                        SAGEJS_FAREY_EDGE_PENDING
                    };
                    nodes[current].next = used++;
                    done = 0;
                }
            }
            /* Match PARI's traversal: new adjacent edges wait for a new pass. */
            current = right;
        }
        if (done)
            break;
    }

    result->cusps = 0;
    for (size_t current = 0; current != none; current = nodes[current].next)
        order[result->cusps++] = current;
    if (result->cusps != used)
        goto fail;
    for (size_t index = 1; index < result->cusps; index++)
        if (nodes[order[index]].edge_type == SAGEJS_FAREY_EDGE_TORSION3)
            result->torsion3++;

    if (!p1_insert_boundary_path(
            list, &infinity, &nodes[order[0]], standard_e1, result) ||
        !p1_insert_boundary_path(
            list, &nodes[order[result->cusps - 1]], &infinity,
            standard_e1, result))
        goto fail;
    for (size_t left = 0; left + 1 < result->cusps; left++)
    {
        const sagejs_farey_cusp *c1 = &nodes[order[left]];
        for (size_t right = left + 1; right < result->cusps; right++)
        {
            const sagejs_farey_cusp *c2 = &nodes[order[right]];
            __int128 determinant = (__int128) c1->numerator * c2->denominator
                - (__int128) c1->denominator * c2->numerator;
            if (determinant != 1 && determinant != -1)
                continue;
            if (right == left + 1)
            {
                size_t forward, reverse;
                if (c2->edge_type == SAGEJS_FAREY_EDGE_TORSION3)
                    continue;
                forward = p1_path_index(list, c1, c2);
                reverse = p1_path_index(list, c2, c1);
                if (forward == SIZE_MAX || reverse == SIZE_MAX)
                    goto fail;
                if (forward == reverse)
                    result->torsion2++;
                else if (!p1_insert_boundary_path(
                    list, c1, c2, standard_e1, result))
                    goto fail;
            }
            else
            {
                result->interior_paths += 2;
            }
        }
    }

    free(nodes);
    free(visited);
    free(order);
    free(standard_e1);
    return 1;

fail:
    free(nodes);
    free(visited);
    free(order);
    free(standard_e1);
    return 0;
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
        return NULL;
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
