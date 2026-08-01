#ifndef SAGEJS_P1_CORE_H
#define SAGEJS_P1_CORE_H

/* Copyright (C) 2026 Sage.js contributors; GPL-3.0-only. */

#include <stddef.h>
#include <stdint.h>

#include "modsym_core.h"

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

uint32_t p1_gcd(uint32_t left, uint32_t right);
uint32_t p1_reduce_signed(int64_t value, uint32_t modulus);

int p1_normalize_pair(
    uint32_t level,
    int64_t input_u,
    int64_t input_v,
    sagejs_p1_pair *answer,
    uint32_t *scalar);

size_t p1_index_normalized(
    const sagejs_p1list_value *list,
    sagejs_p1_pair pair);

size_t p1_apply_pair(
    const sagejs_p1list_value *list,
    int64_t u,
    int64_t v);

sagejs_modsym_presentation_view p1_presentation_view(
    const sagejs_p1list_value *list,
    const sagejs_modsym_presentation *presentation);

sagejs_p1list_value *p1_build(uint32_t level);
void p1_free_value(sagejs_p1list_value *list);

#endif
