/*
 * Minimal WebAssembly adapter for the host-neutral modular-symbol core.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 */

#include <stddef.h>
#include <stdint.h>

#include "modsym_core.h"
#include "p1_core.h"

static sagejs_p1list_value *active_list;
static sagejs_modsym_presentation active_presentation;
static int active_presentation_initialized;

__attribute__((visibility("default")))
void sagejs_modsym_clear(void)
{
    if (active_presentation_initialized)
    {
        sagejs_modsym_presentation_clear(&active_presentation);
        active_presentation_initialized = 0;
    }
    p1_free_value(active_list);
    active_list = NULL;
}

/* Return zero on success, one for an invalid level, and two on failure. */
__attribute__((visibility("default")))
int sagejs_modsym_weight2_init(uint32_t level)
{
    sagejs_modsym_presentation_view view;

    sagejs_modsym_clear();
    if (level == 0 || level > INT32_MAX)
        return 1;
    active_list = p1_build(level);
    if (active_list == NULL)
        return 2;
    view = p1_presentation_view(active_list, &active_presentation);
    if (!sagejs_modsym_presentation_build(
            &view, &active_presentation))
    {
        sagejs_modsym_clear();
        return 2;
    }
    active_presentation_initialized = 1;
    return 0;
}

__attribute__((visibility("default")))
size_t sagejs_modsym_p1_count(void)
{
    return active_list == NULL ? 0 : active_list->count;
}

__attribute__((visibility("default")))
size_t sagejs_modsym_dimension(void)
{
    return active_presentation_initialized ? active_presentation.e1 : 0;
}

__attribute__((visibility("default")))
size_t sagejs_modsym_farey_cusps(void)
{
    return active_presentation_initialized
        ? active_presentation.cusps : 0;
}

__attribute__((visibility("default")))
uint64_t sagejs_modsym_p1_checksum(void)
{
    uint64_t checksum = UINT64_C(1469598103934665603);

    if (active_list == NULL)
        return 0;
    for (size_t index = 0; index < active_list->count; index++)
    {
        checksum ^= active_list->pairs[index].u;
        checksum *= UINT64_C(1099511628211);
        checksum ^= active_list->pairs[index].v;
        checksum *= UINT64_C(1099511628211);
    }
    return checksum;
}
