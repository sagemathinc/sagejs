/*
 * Sage-compatible P^1(Z/NZ) representatives and indexing.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 *
 * This translation unit deliberately has no Node-API dependency.  Native
 * Node and WebAssembly adapters share the same count-first, allocate-once
 * data structure and normalization semantics.
 */

#include <stdint.h>
#include <stdlib.h>

#include "p1_core.h"

#define SAGEJS_P1_MAGIC UINT64_C(0x534147454A535031)

uint32_t p1_gcd(uint32_t left, uint32_t right)
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

uint32_t p1_reduce_signed(int64_t value, uint32_t modulus)
{
    int64_t result = value % (int64_t) modulus;
    if (result < 0)
        result += modulus;
    return (uint32_t) result;
}

int p1_normalize_pair(
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
        if (scalar != NULL)
            *scalar = 1;
        return 1;
    }
    u = p1_reduce_signed(input_u, level);
    v = p1_reduce_signed(input_v, level);
    if (u == 0)
    {
        answer->u = 0;
        answer->v = p1_gcd(v, level) == 1 ? 1 : 0;
        if (scalar != NULL)
            *scalar = v;
        return answer->v != 0;
    }

    gcd_value = p1_xgcd(u, level, &bezout);
    if (p1_gcd(gcd_value, v) != 1)
    {
        answer->u = 0;
        answer->v = 0;
        if (scalar != NULL)
            *scalar = 0;
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

    if (left->u < right->u)
        return -1;
    if (left->u > right->u)
        return 1;
    if (left->v < right->v)
        return -1;
    if (left->v > right->v)
        return 1;
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

size_t p1_index_normalized(
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

size_t p1_apply_pair(
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

sagejs_modsym_presentation_view p1_presentation_view(
    const sagejs_p1list_value *list,
    const sagejs_modsym_presentation *presentation)
{
    return (sagejs_modsym_presentation_view) {
        list->level,
        list->count,
        presentation,
        list,
        p1_modsym_coset_index
    };
}

void p1_free_value(sagejs_p1list_value *list)
{
    if (list == NULL)
        return;
    free(list->pairs);
    free(list->hash_slots);
    list->magic = 0;
    free(list);
}

sagejs_p1list_value *p1_build(uint32_t level)
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
