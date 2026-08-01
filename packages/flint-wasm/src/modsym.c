/*
 * WebAssembly adapter for the host-neutral modular-symbol core.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 */

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "modsym_core.h"
#include "p1_core.h"

typedef struct
{
    sagejs_p1list_value *list;
    sagejs_modsym_presentation presentation;
    int presentation_initialized;
} sagejs_wasm_p1_slot;

static sagejs_wasm_p1_slot *p1_slots;
static size_t p1_slots_capacity;
static uint32_t legacy_handle;

/* Matrix results are copied synchronously by JavaScript before the next call. */
static slong *matrix_result;
static size_t matrix_rows;
static size_t matrix_columns;
static sagejs_modsym_cusp *cusp_result;
static size_t cusp_count;

static uint32_t normalized_u;
static uint32_t normalized_v;
static uint32_t normalized_scalar;

static sagejs_wasm_p1_slot *p1_slot(uint32_t handle)
{
    size_t index;

    if (handle == 0)
        return NULL;
    index = (size_t) handle - 1;
    if (index >= p1_slots_capacity || p1_slots[index].list == NULL)
        return NULL;
    return p1_slots + index;
}

static int p1_ensure_presentation(sagejs_wasm_p1_slot *slot)
{
    sagejs_modsym_presentation_view view;

    if (slot == NULL)
        return 0;
    if (slot->presentation_initialized)
        return 1;
    view = p1_presentation_view(slot->list, &slot->presentation);
    if (!sagejs_modsym_presentation_build(&view, &slot->presentation))
        return 0;
    slot->presentation_initialized = 1;
    return 1;
}

static sagejs_modsym_presentation_view p1_view(
    const sagejs_wasm_p1_slot *slot)
{
    return p1_presentation_view(slot->list, &slot->presentation);
}

static void clear_matrix_result(void)
{
    free(matrix_result);
    free(cusp_result);
    matrix_result = NULL;
    matrix_rows = 0;
    matrix_columns = 0;
    cusp_result = NULL;
    cusp_count = 0;
}

__attribute__((visibility("default")))
uint32_t sagejs_p1_create(uint32_t level)
{
    sagejs_wasm_p1_slot *grown;
    sagejs_p1list_value *list;
    size_t index;
    size_t old_capacity;
    size_t new_capacity;

    if (level == 0 || level > INT32_MAX)
        return 0;
    list = p1_build(level);
    if (list == NULL)
        return 0;
    for (index = 0; index < p1_slots_capacity; index++)
        if (p1_slots[index].list == NULL)
            break;
    if (index == p1_slots_capacity)
    {
        old_capacity = p1_slots_capacity;
        if (old_capacity > SIZE_MAX / 2)
        {
            p1_free_value(list);
            return 0;
        }
        new_capacity = old_capacity == 0 ? 8 : old_capacity * 2;
        if (new_capacity > UINT32_MAX ||
            new_capacity > SIZE_MAX / sizeof(*p1_slots))
        {
            p1_free_value(list);
            return 0;
        }
        grown = (sagejs_wasm_p1_slot *) realloc(
            p1_slots, new_capacity * sizeof(*p1_slots));
        if (grown == NULL)
        {
            p1_free_value(list);
            return 0;
        }
        p1_slots = grown;
        memset(p1_slots + old_capacity, 0,
            (new_capacity - old_capacity) * sizeof(*p1_slots));
        p1_slots_capacity = new_capacity;
        index = old_capacity;
    }
    p1_slots[index].list = list;
    return (uint32_t) index + 1;
}

__attribute__((visibility("default")))
void sagejs_p1_destroy(uint32_t handle)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);

    if (slot == NULL)
        return;
    if (slot->presentation_initialized)
        sagejs_modsym_presentation_clear(&slot->presentation);
    p1_free_value(slot->list);
    memset(slot, 0, sizeof(*slot));
}

__attribute__((visibility("default")))
uint32_t sagejs_p1_level(uint32_t handle)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);
    return slot == NULL ? 0 : slot->list->level;
}

__attribute__((visibility("default")))
size_t sagejs_p1_count(uint32_t handle)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);
    return slot == NULL ? 0 : slot->list->count;
}

__attribute__((visibility("default")))
uint64_t sagejs_p1_entry(uint32_t handle, uint32_t index)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);
    sagejs_p1_pair pair;

    if (slot == NULL || (size_t) index >= slot->list->count)
        return UINT64_MAX;
    pair = slot->list->pairs[index];
    return ((uint64_t) pair.u << 32) | pair.v;
}

__attribute__((visibility("default")))
int sagejs_p1_normalize(
    uint32_t handle, int64_t u, int64_t v, uint32_t with_scalar)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);
    sagejs_p1_pair pair;
    uint32_t scalar = 0;

    if (slot == NULL)
        return 0;
    if (!p1_normalize_pair(
            slot->list->level, u, v, &pair,
            with_scalar != 0 ? &scalar : NULL))
    {
        pair.u = 0;
        pair.v = 0;
        scalar = 0;
    }
    normalized_u = pair.u;
    normalized_v = pair.v;
    normalized_scalar = scalar;
    return 1;
}

__attribute__((visibility("default")))
uint32_t sagejs_p1_normalized_u(void) { return normalized_u; }
__attribute__((visibility("default")))
uint32_t sagejs_p1_normalized_v(void) { return normalized_v; }
__attribute__((visibility("default")))
uint32_t sagejs_p1_normalized_scalar(void) { return normalized_scalar; }

__attribute__((visibility("default")))
uint32_t sagejs_p1_index(uint32_t handle, int64_t u, int64_t v)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);
    sagejs_p1_pair pair;
    size_t index;

    if (slot == NULL ||
        !p1_normalize_pair(slot->list->level, u, v, &pair, NULL))
        return UINT32_MAX;
    index = p1_index_normalized(slot->list, pair);
    if (index == SIZE_MAX || index >= UINT32_MAX)
        return UINT32_MAX;
    return (uint32_t) index;
}

__attribute__((visibility("default")))
uint32_t sagejs_p1_apply(
    uint32_t handle, uint32_t index, uint32_t action)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);
    sagejs_p1_pair pair;
    size_t answer;

    if (slot == NULL || (size_t) index >= slot->list->count || action > 3)
        return UINT32_MAX;
    pair = slot->list->pairs[index];
    if (action == 0)
        answer = p1_apply_pair(slot->list, -(int64_t) pair.u, pair.v);
    else if (action == 1)
        answer = p1_apply_pair(slot->list, -(int64_t) pair.v, pair.u);
    else if (action == 2)
        answer = p1_apply_pair(
            slot->list, pair.v, -(int64_t) pair.u - pair.v);
    else
        answer = p1_apply_pair(
            slot->list, pair.u, (int64_t) pair.u + pair.v);
    return answer == SIZE_MAX || answer > UINT32_MAX
        ? UINT32_MAX : (uint32_t) answer;
}

/* Presentation field selectors mirror p1ListManinPresentationInfo. */
__attribute__((visibility("default")))
size_t sagejs_p1_presentation_field(uint32_t handle, uint32_t field)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);
    sagejs_modsym_presentation *p;

    if (!p1_ensure_presentation(slot))
        return SIZE_MAX;
    p = &slot->presentation;
    switch (field)
    {
        case 0: return slot->list->level;
        case 1: return slot->list->count;
        case 2: return p->cusps;
        case 3: return p->interior_paths;
        case 4: return p->e1;
        case 5: return p->e2;
        case 6: return p->torsion2;
        case 7: return p->torsion3;
        case 8: return p->e1 + p->torsion2 + p->torsion3;
        case 9: return slot->list->level == 1
            ? 1 : 1 + p->torsion2 + p->torsion3;
        case 10: return p->e1;
        default: return SIZE_MAX;
    }
}

static int install_matrix(slong *entries, size_t rows, size_t columns)
{
    if (entries == NULL)
        return 0;
    matrix_result = entries;
    matrix_rows = rows;
    matrix_columns = columns;
    return 1;
}

__attribute__((visibility("default")))
int sagejs_p1_hecke_matrix(uint32_t handle, uint32_t prime)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);
    sagejs_modsym_presentation_view view;
    size_t dimension = 0;
    slong *entries;

    clear_matrix_result();
    if (!p1_ensure_presentation(slot) || prime < 2)
        return 0;
    view = p1_view(slot);
    entries = sagejs_modsym_weight2_hecke_matrix(
        &view, (ulong) prime, &dimension);
    return install_matrix(entries, dimension, dimension);
}

__attribute__((visibility("default")))
int sagejs_p1_boundary_data(uint32_t handle)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);
    sagejs_modsym_presentation_view view;
    size_t dimension = 0;
    size_t cusps = 0;
    slong *entries;

    clear_matrix_result();
    if (!p1_ensure_presentation(slot))
        return 0;
    view = p1_view(slot);
    entries = sagejs_modsym_weight2_boundary_matrix(
        &view, &dimension, &cusps, &cusp_result);
    if (!install_matrix(entries, dimension, cusps))
    {
        free(cusp_result);
        cusp_result = NULL;
        return 0;
    }
    cusp_count = cusps;
    return 1;
}

__attribute__((visibility("default")))
int sagejs_p1_cuspidal_basis(uint32_t handle)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);
    sagejs_modsym_presentation_view view;
    size_t rows = 0;
    size_t columns = 0;
    slong *entries;

    clear_matrix_result();
    if (!p1_ensure_presentation(slot))
        return 0;
    view = p1_view(slot);
    entries = sagejs_modsym_weight2_cuspidal_basis(
        &view, &rows, &columns);
    return install_matrix(entries, rows, columns);
}

__attribute__((visibility("default")))
int sagejs_p1_star_matrix(uint32_t handle)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);
    sagejs_modsym_presentation_view view;
    size_t dimension = 0;
    slong *entries;

    clear_matrix_result();
    if (!p1_ensure_presentation(slot))
        return 0;
    view = p1_view(slot);
    entries = sagejs_modsym_weight2_star_matrix(&view, &dimension);
    return install_matrix(entries, dimension, dimension);
}

__attribute__((visibility("default")))
int sagejs_p1_reduce_path(
    uint32_t handle,
    int64_t start_numerator,
    int64_t start_denominator,
    int64_t stop_numerator,
    int64_t stop_denominator)
{
    sagejs_wasm_p1_slot *slot = p1_slot(handle);
    sagejs_modsym_presentation_view view;
    size_t dimension = 0;
    slong *entries;

    clear_matrix_result();
    if (!p1_ensure_presentation(slot))
        return 0;
    view = p1_view(slot);
    entries = sagejs_modsym_weight2_reduce_path(
        &view,
        start_numerator, start_denominator,
        stop_numerator, stop_denominator,
        &dimension);
    return install_matrix(entries, dimension, 1);
}

__attribute__((visibility("default")))
uintptr_t sagejs_p1_matrix_data(void)
{
    return (uintptr_t) matrix_result;
}

__attribute__((visibility("default")))
size_t sagejs_p1_matrix_rows(void) { return matrix_rows; }
__attribute__((visibility("default")))
size_t sagejs_p1_matrix_columns(void) { return matrix_columns; }
__attribute__((visibility("default")))
size_t sagejs_p1_cusp_count(void) { return cusp_count; }

__attribute__((visibility("default")))
int64_t sagejs_p1_cusp_numerator(uint32_t index)
{
    return (size_t) index < cusp_count ? cusp_result[index].numerator : 0;
}

__attribute__((visibility("default")))
int64_t sagejs_p1_cusp_denominator(uint32_t index)
{
    return (size_t) index < cusp_count ? cusp_result[index].denominator : 0;
}

/* Compatibility API retained for modularSymbolsWeight2Info(). */
__attribute__((visibility("default")))
void sagejs_modsym_clear(void)
{
    sagejs_p1_destroy(legacy_handle);
    legacy_handle = 0;
}

__attribute__((visibility("default")))
int sagejs_modsym_weight2_init(uint32_t level)
{
    sagejs_wasm_p1_slot *slot;

    sagejs_modsym_clear();
    legacy_handle = sagejs_p1_create(level);
    slot = p1_slot(legacy_handle);
    if (slot == NULL)
        return level == 0 || level > INT32_MAX ? 1 : 2;
    if (!p1_ensure_presentation(slot))
    {
        sagejs_modsym_clear();
        return 2;
    }
    return 0;
}

__attribute__((visibility("default")))
size_t sagejs_modsym_p1_count(void)
{
    return sagejs_p1_count(legacy_handle);
}

__attribute__((visibility("default")))
size_t sagejs_modsym_dimension(void)
{
    return sagejs_p1_presentation_field(legacy_handle, 10);
}

__attribute__((visibility("default")))
size_t sagejs_modsym_farey_cusps(void)
{
    return sagejs_p1_presentation_field(legacy_handle, 2);
}

__attribute__((visibility("default")))
uint64_t sagejs_modsym_p1_checksum(void)
{
    sagejs_wasm_p1_slot *slot = p1_slot(legacy_handle);
    uint64_t checksum = UINT64_C(1469598103934665603);
    size_t index;

    if (slot == NULL)
        return 0;
    for (index = 0; index < slot->list->count; index++)
    {
        checksum ^= slot->list->pairs[index].u;
        checksum *= UINT64_C(1099511628211);
        checksum ^= slot->list->pairs[index].v;
        checksum *= UINT64_C(1099511628211);
    }
    return checksum;
}
