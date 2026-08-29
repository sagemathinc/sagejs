"use strict";

const GMP_CHECKPOINT_ALLOCATOR_C_SOURCE = String.raw`
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <gmp.h>

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#elif !defined(__wasi__)
#include <sys/mman.h>
#include <unistd.h>
#endif

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
    size_t reservation_size;
    size_t activated;
    size_t page_size;
    size_t used;
    size_t high_water;
    uint64_t allocation_calls;
    uint64_t reallocation_calls;
    uint64_t free_calls;
    uint64_t requested_bytes;
    uint64_t spill_allocations;
    uint32_t storage_kind;
    unsigned retry_shift;
    int open;
    struct sagejs_native_gmp_checkpoint *previous;
} sagejs_native_gmp_checkpoint;

typedef struct
{
    size_t capacity;
    size_t reservation_size;
    size_t activated;
    size_t high_water;
    uint64_t allocation_calls;
    uint64_t reallocation_calls;
    uint64_t free_calls;
    uint64_t requested_bytes;
    uint64_t spill_allocations;
    uint32_t storage_kind;
    unsigned retry_shift;
} sagejs_native_gmp_checkpoint_stats;

enum
{
    SAGEJS_NATIVE_GMP_STORAGE_UPSTREAM = 0,
    SAGEJS_NATIVE_GMP_STORAGE_POSIX_VIRTUAL = 1,
    SAGEJS_NATIVE_GMP_STORAGE_WINDOWS_VIRTUAL = 2
};

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
int sagejs_native_gmp_set_retry_shift(unsigned shift);
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
static SAGEJS_NATIVE_THREAD_LOCAL unsigned
    sagejs_native_gmp_retry_shift = 0;
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

static size_t sagejs_native_gmp_page_size(void)
{
#if defined(_WIN32)
    SYSTEM_INFO information;
    GetSystemInfo(&information);
    return information.dwPageSize == 0
        ? (size_t) 4096 : (size_t) information.dwPageSize;
#elif defined(__wasi__)
    return (size_t) 65536;
#else
    const long page_size = sysconf(_SC_PAGESIZE);
    return page_size <= 0 ? (size_t) 4096 : (size_t) page_size;
#endif
}

static int sagejs_native_gmp_checkpoint_reserve(
    sagejs_native_gmp_checkpoint *checkpoint, size_t capacity)
{
    const size_t reservation_size = capacity == 0 ? 1 : capacity;
    checkpoint->capacity = capacity;
    checkpoint->reservation_size = reservation_size;
    checkpoint->page_size = sagejs_native_gmp_page_size();
#if defined(_WIN32)
    checkpoint->storage = (unsigned char *) VirtualAlloc(
        NULL, reservation_size, MEM_RESERVE, PAGE_NOACCESS);
    checkpoint->storage_kind = SAGEJS_NATIVE_GMP_STORAGE_WINDOWS_VIRTUAL;
#elif defined(__wasi__)
    checkpoint->storage = (unsigned char *)
        sagejs_native_gmp_upstream_allocate(reservation_size);
    checkpoint->activated = reservation_size;
    checkpoint->storage_kind = SAGEJS_NATIVE_GMP_STORAGE_UPSTREAM;
#else
    checkpoint->storage = (unsigned char *) mmap(
        NULL, reservation_size, PROT_NONE,
        MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (checkpoint->storage == (unsigned char *) MAP_FAILED)
        checkpoint->storage = NULL;
    checkpoint->storage_kind = SAGEJS_NATIVE_GMP_STORAGE_POSIX_VIRTUAL;
#endif
    return checkpoint->storage != NULL;
}

static int sagejs_native_gmp_checkpoint_activate(
    sagejs_native_gmp_checkpoint *checkpoint, size_t required)
{
    size_t target;
    size_t growth;
    if (required <= checkpoint->activated)
        return 1;
    if (required > checkpoint->capacity)
        return 0;
    growth = checkpoint->activated == 0
        ? checkpoint->page_size : checkpoint->activated;
    if (growth > checkpoint->capacity - checkpoint->activated)
        target = checkpoint->capacity;
    else
        target = checkpoint->activated + growth;
    if (target < required)
        target = required;
    if (target < checkpoint->capacity)
    {
        const size_t remainder = target % checkpoint->page_size;
        if (remainder != 0 &&
            checkpoint->page_size - remainder <= checkpoint->capacity - target)
            target += checkpoint->page_size - remainder;
    }
#if defined(_WIN32)
    if (VirtualAlloc(
            checkpoint->storage + checkpoint->activated,
            target - checkpoint->activated,
            MEM_COMMIT, PAGE_READWRITE) == NULL)
        return 0;
#elif defined(__wasi__)
    (void) checkpoint;
#else
    if (mprotect(
            checkpoint->storage + checkpoint->activated,
            target - checkpoint->activated,
            PROT_READ | PROT_WRITE) != 0)
        return 0;
#endif
    checkpoint->activated = target;
    return 1;
}

static void sagejs_native_gmp_checkpoint_release(
    sagejs_native_gmp_checkpoint *checkpoint)
{
    if (checkpoint->storage == NULL)
        return;
#if defined(_WIN32)
    (void) VirtualFree(checkpoint->storage, 0, MEM_RELEASE);
#elif defined(__wasi__)
    sagejs_native_gmp_upstream_free(
        checkpoint->storage, checkpoint->reservation_size);
#else
    (void) munmap(checkpoint->storage, checkpoint->reservation_size);
#endif
    checkpoint->storage = NULL;
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
        span > checkpoint->capacity - checkpoint->used ||
        !sagejs_native_gmp_checkpoint_activate(
            checkpoint, checkpoint->used + span))
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
        span <= checkpoint->capacity - offset &&
        sagejs_native_gmp_checkpoint_activate(checkpoint, offset + span))
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
    size_t effective_capacity = capacity;
    if (checkpoint == NULL || checkpoint->open ||
        sagejs_native_gmp_checkpoint_suspended != 0)
        return 0;
    if (sagejs_native_gmp_retry_shift >= sizeof(size_t) * 8 ||
        capacity > (SIZE_MAX >> sagejs_native_gmp_retry_shift))
        return 0;
    effective_capacity <<= sagejs_native_gmp_retry_shift;
    memset(checkpoint, 0, sizeof(*checkpoint));
    checkpoint->retry_shift = sagejs_native_gmp_retry_shift;
    if (!sagejs_native_gmp_checkpoint_reserve(
            checkpoint, effective_capacity))
        return 0;
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
    sagejs_native_gmp_completed_checkpoint.reservation_size =
        checkpoint->reservation_size;
    sagejs_native_gmp_completed_checkpoint.activated = checkpoint->activated;
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
    sagejs_native_gmp_completed_checkpoint.storage_kind =
        checkpoint->storage_kind;
    sagejs_native_gmp_completed_checkpoint.retry_shift =
        checkpoint->retry_shift;
    sagejs_native_gmp_has_completed_checkpoint = 1;
    sagejs_native_gmp_active_checkpoint = checkpoint->previous;
    sagejs_native_gmp_checkpoint_release(checkpoint);
    checkpoint->reservation_size = 0;
    checkpoint->activated = 0;
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

SAGEJS_NATIVE_GMP_ALLOCATOR_API int sagejs_native_gmp_set_retry_shift(
    unsigned shift)
{
    if (sagejs_native_gmp_active_checkpoint != NULL ||
        sagejs_native_gmp_checkpoint_suspended != 0)
        return 0;
    sagejs_native_gmp_retry_shift = shift;
    return 1;
}

#endif
`;

module.exports = { GMP_CHECKPOINT_ALLOCATOR_C_SOURCE };
