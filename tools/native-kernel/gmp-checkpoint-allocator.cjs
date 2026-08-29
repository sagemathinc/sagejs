"use strict";

const GMP_CHECKPOINT_ALLOCATOR_C_SOURCE = String.raw`
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <gmp.h>

#if defined(_MSC_VER)
#define SAGEJS_NATIVE_THREAD_LOCAL __declspec(thread)
#define SAGEJS_NATIVE_ALIGNOF(type) __alignof(type)
#else
#define SAGEJS_NATIVE_THREAD_LOCAL _Thread_local
#define SAGEJS_NATIVE_ALIGNOF(type) _Alignof(type)
#endif

typedef union
{
    max_align_t alignment;
    struct
    {
        size_t requested;
        size_t span;
    } value;
} sagejs_native_gmp_arena_header;

typedef struct sagejs_native_gmp_checkpoint
{
    unsigned char *storage;
    size_t capacity;
    size_t used;
    size_t high_water;
    uint64_t allocation_calls;
    uint64_t reallocation_calls;
    uint64_t free_calls;
    uint64_t requested_bytes;
    uint64_t spill_allocations;
    int open;
    struct sagejs_native_gmp_checkpoint *previous;
} sagejs_native_gmp_checkpoint;

typedef struct
{
    size_t capacity;
    size_t high_water;
    uint64_t allocation_calls;
    uint64_t reallocation_calls;
    uint64_t free_calls;
    uint64_t requested_bytes;
    uint64_t spill_allocations;
} sagejs_native_gmp_checkpoint_stats;

#ifdef SAGEJS_NATIVE_GMP_ALLOCATOR_EXTERNAL
int sagejs_native_gmp_allocator_install(void);
int sagejs_native_gmp_checkpoint_begin(
    sagejs_native_gmp_checkpoint *checkpoint, size_t capacity);
int sagejs_native_gmp_checkpoint_end(
    sagejs_native_gmp_checkpoint *checkpoint);
void sagejs_native_gmp_checkpoint_suspend(void);
int sagejs_native_gmp_checkpoint_resume(void);
int sagejs_native_gmp_pointer_is_checkpoint_owned(const void *pointer);
int sagejs_native_gmp_last_checkpoint_stats(
    sagejs_native_gmp_checkpoint_stats *result);
#else

#ifndef SAGEJS_NATIVE_GMP_ALLOCATOR_API
#define SAGEJS_NATIVE_GMP_ALLOCATOR_API static
#endif

static SAGEJS_NATIVE_THREAD_LOCAL sagejs_native_gmp_checkpoint
    *sagejs_native_gmp_active_checkpoint = NULL;
static SAGEJS_NATIVE_THREAD_LOCAL unsigned
    sagejs_native_gmp_checkpoint_suspended = 0;
static SAGEJS_NATIVE_THREAD_LOCAL sagejs_native_gmp_checkpoint_stats
    sagejs_native_gmp_completed_checkpoint = {0};
static SAGEJS_NATIVE_THREAD_LOCAL int
    sagejs_native_gmp_has_completed_checkpoint = 0;
static int sagejs_native_gmp_allocator_installed = 0;
static void *(*sagejs_native_gmp_upstream_allocate)(size_t) = NULL;
static void *(*sagejs_native_gmp_upstream_reallocate)(
    void *, size_t, size_t) = NULL;
static void (*sagejs_native_gmp_upstream_free)(void *, size_t) = NULL;

static size_t sagejs_native_gmp_align(size_t value)
{
    const size_t alignment = SAGEJS_NATIVE_ALIGNOF(max_align_t);
    const size_t remainder = value % alignment;
    if (remainder == 0)
        return value;
    if (value > SIZE_MAX - (alignment - remainder))
        return SIZE_MAX;
    return value + alignment - remainder;
}

static sagejs_native_gmp_checkpoint *sagejs_native_gmp_owner(
    const void *pointer)
{
    const uintptr_t address = (uintptr_t) pointer;
    sagejs_native_gmp_checkpoint *checkpoint =
        sagejs_native_gmp_active_checkpoint;
    while (checkpoint != NULL)
    {
        const uintptr_t start = (uintptr_t) checkpoint->storage;
        if (address > start && address < start + checkpoint->capacity)
            return checkpoint;
        checkpoint = checkpoint->previous;
    }
    return NULL;
}

static void *sagejs_native_gmp_checkpoint_allocate(
    sagejs_native_gmp_checkpoint *checkpoint, size_t requested)
{
    const size_t payload = requested == 0 ? 1 : requested;
    const size_t raw = sizeof(sagejs_native_gmp_arena_header) + payload;
    const size_t span = sagejs_native_gmp_align(raw);
    sagejs_native_gmp_arena_header *header;
    if (span == SIZE_MAX || checkpoint->used > checkpoint->capacity ||
        span > checkpoint->capacity - checkpoint->used)
        return NULL;
    header = (sagejs_native_gmp_arena_header *)
        (checkpoint->storage + checkpoint->used);
    header->value.requested = requested;
    header->value.span = span;
    checkpoint->used += span;
    if (checkpoint->used > checkpoint->high_water)
        checkpoint->high_water = checkpoint->used;
    checkpoint->allocation_calls += 1;
    checkpoint->requested_bytes += (uint64_t) requested;
    return (void *) (header + 1);
}

static void *sagejs_native_gmp_malloc(size_t requested)
{
    void *result;
    if (sagejs_native_gmp_active_checkpoint != NULL &&
        sagejs_native_gmp_checkpoint_suspended == 0)
    {
        result = sagejs_native_gmp_checkpoint_allocate(
            sagejs_native_gmp_active_checkpoint, requested);
        if (result != NULL)
            return result;
        sagejs_native_gmp_active_checkpoint->spill_allocations += 1;
    }
    result = sagejs_native_gmp_upstream_allocate(requested == 0 ? 1 : requested);
    if (result == NULL)
        abort();
    return result;
}

static void *sagejs_native_gmp_realloc(
    void *pointer, size_t old_size, size_t requested)
{
    sagejs_native_gmp_checkpoint *checkpoint =
        sagejs_native_gmp_owner(pointer);
    sagejs_native_gmp_arena_header *header;
    size_t payload;
    size_t raw;
    size_t span;
    size_t offset;
    void *result;
    (void) old_size;
    if (checkpoint == NULL)
    {
        result = sagejs_native_gmp_upstream_reallocate(
            pointer, old_size, requested == 0 ? 1 : requested);
        if (result == NULL)
            abort();
        return result;
    }
    header = ((sagejs_native_gmp_arena_header *) pointer) - 1;
    payload = requested == 0 ? 1 : requested;
    raw = sizeof(*header) + payload;
    span = sagejs_native_gmp_align(raw);
    offset = (size_t) ((unsigned char *) header - checkpoint->storage);
    checkpoint->reallocation_calls += 1;
    checkpoint->requested_bytes += (uint64_t) requested;
    if (span != SIZE_MAX && offset + header->value.span == checkpoint->used &&
        span <= checkpoint->capacity - offset)
    {
        checkpoint->used = offset + span;
        if (checkpoint->used > checkpoint->high_water)
            checkpoint->high_water = checkpoint->used;
        header->value.requested = requested;
        header->value.span = span;
        return pointer;
    }
    result = sagejs_native_gmp_checkpoint_allocate(checkpoint, requested);
    if (result == NULL)
    {
        checkpoint->spill_allocations += 1;
        result = sagejs_native_gmp_upstream_allocate(payload);
        if (result == NULL)
            abort();
    }
    memcpy(result, pointer,
        header->value.requested < requested
            ? header->value.requested : requested);
    return result;
}

static void sagejs_native_gmp_free(void *pointer, size_t old_size)
{
    sagejs_native_gmp_checkpoint *checkpoint =
        sagejs_native_gmp_owner(pointer);
    (void) old_size;
    if (checkpoint == NULL)
    {
        sagejs_native_gmp_upstream_free(pointer, old_size);
        return;
    }
    checkpoint->free_calls += 1;
}

SAGEJS_NATIVE_GMP_ALLOCATOR_API int sagejs_native_gmp_allocator_install(void)
{
    if (sagejs_native_gmp_allocator_installed)
        return 1;
    mp_get_memory_functions(
        &sagejs_native_gmp_upstream_allocate,
        &sagejs_native_gmp_upstream_reallocate,
        &sagejs_native_gmp_upstream_free);
    if (sagejs_native_gmp_upstream_allocate == NULL ||
        sagejs_native_gmp_upstream_reallocate == NULL ||
        sagejs_native_gmp_upstream_free == NULL)
        return 0;
    mp_set_memory_functions(
        sagejs_native_gmp_malloc,
        sagejs_native_gmp_realloc,
        sagejs_native_gmp_free);
    sagejs_native_gmp_allocator_installed = 1;
    return 1;
}

SAGEJS_NATIVE_GMP_ALLOCATOR_API int sagejs_native_gmp_checkpoint_begin(
    sagejs_native_gmp_checkpoint *checkpoint, size_t capacity)
{
    if (checkpoint == NULL || checkpoint->open ||
        sagejs_native_gmp_checkpoint_suspended != 0)
        return 0;
    memset(checkpoint, 0, sizeof(*checkpoint));
    checkpoint->storage = (unsigned char *)
        sagejs_native_gmp_upstream_allocate(capacity == 0 ? 1 : capacity);
    if (checkpoint->storage == NULL)
        return 0;
    checkpoint->capacity = capacity;
    checkpoint->previous = sagejs_native_gmp_active_checkpoint;
    checkpoint->open = 1;
    sagejs_native_gmp_active_checkpoint = checkpoint;
    return 1;
}

SAGEJS_NATIVE_GMP_ALLOCATOR_API int sagejs_native_gmp_checkpoint_end(
    sagejs_native_gmp_checkpoint *checkpoint)
{
    if (checkpoint == NULL || !checkpoint->open ||
        sagejs_native_gmp_active_checkpoint != checkpoint ||
        sagejs_native_gmp_checkpoint_suspended != 0)
        return 0;
    sagejs_native_gmp_completed_checkpoint.capacity = checkpoint->capacity;
    sagejs_native_gmp_completed_checkpoint.high_water = checkpoint->high_water;
    sagejs_native_gmp_completed_checkpoint.allocation_calls =
        checkpoint->allocation_calls;
    sagejs_native_gmp_completed_checkpoint.reallocation_calls =
        checkpoint->reallocation_calls;
    sagejs_native_gmp_completed_checkpoint.free_calls = checkpoint->free_calls;
    sagejs_native_gmp_completed_checkpoint.requested_bytes =
        checkpoint->requested_bytes;
    sagejs_native_gmp_completed_checkpoint.spill_allocations =
        checkpoint->spill_allocations;
    sagejs_native_gmp_has_completed_checkpoint = 1;
    sagejs_native_gmp_active_checkpoint = checkpoint->previous;
    sagejs_native_gmp_upstream_free(
        checkpoint->storage, checkpoint->capacity == 0 ? 1 : checkpoint->capacity);
    checkpoint->storage = NULL;
    checkpoint->used = 0;
    checkpoint->open = 0;
    checkpoint->previous = NULL;
    return 1;
}

SAGEJS_NATIVE_GMP_ALLOCATOR_API void sagejs_native_gmp_checkpoint_suspend(void)
{
    if (sagejs_native_gmp_active_checkpoint != NULL)
        sagejs_native_gmp_checkpoint_suspended += 1;
}

SAGEJS_NATIVE_GMP_ALLOCATOR_API int sagejs_native_gmp_checkpoint_resume(void)
{
    if (sagejs_native_gmp_checkpoint_suspended == 0)
        return 0;
    sagejs_native_gmp_checkpoint_suspended -= 1;
    return 1;
}

SAGEJS_NATIVE_GMP_ALLOCATOR_API int
sagejs_native_gmp_pointer_is_checkpoint_owned(const void *pointer)
{
    return sagejs_native_gmp_owner(pointer) != NULL;
}

SAGEJS_NATIVE_GMP_ALLOCATOR_API int sagejs_native_gmp_last_checkpoint_stats(
    sagejs_native_gmp_checkpoint_stats *result)
{
    if (result == NULL || !sagejs_native_gmp_has_completed_checkpoint)
        return 0;
    *result = sagejs_native_gmp_completed_checkpoint;
    return 1;
}

#endif
`;

module.exports = { GMP_CHECKPOINT_ALLOCATOR_C_SOURCE };
