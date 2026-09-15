// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const {
  GMP_CHECKPOINT_ALLOCATOR_C_SOURCE,
} = require("../tools/native-kernel/gmp-checkpoint-allocator.cjs");

assert.match(GMP_CHECKPOINT_ALLOCATOR_C_SOURCE, /__declspec\(thread\)/);
assert.match(GMP_CHECKPOINT_ALLOCATOR_C_SOURCE, /__alignof\(type\)/);

const root = resolve(__dirname, "..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);

const harness = String.raw`
#include <assert.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <gmp.h>

static uint64_t upstream_allocations = 0;
static uint64_t upstream_reallocations = 0;
static uint64_t upstream_frees = 0;

static void *upstream_allocate(size_t size)
{
    upstream_allocations += 1;
    return malloc(size == 0 ? 1 : size);
}

static void *upstream_reallocate(void *pointer, size_t old_size, size_t size)
{
    (void) old_size;
    upstream_reallocations += 1;
    return realloc(pointer, size == 0 ? 1 : size);
}

static void upstream_free(void *pointer, size_t size)
{
    (void) size;
    upstream_frees += 1;
    free(pointer);
}

static void *thread_witness(void *argument)
{
    sagejs_native_gmp_checkpoint checkpoint = {0};
    mpz_t value;
    const unsigned long seed = (unsigned long) (uintptr_t) argument;
    assert(sagejs_native_gmp_checkpoint_begin(&checkpoint, 1U << 20, 1));
    mpz_init2(value, 8192);
    assert(sagejs_native_gmp_pointer_is_checkpoint_owned(mpz_limbs_read(value)));
    mpz_set_ui(value, seed + 1);
    for (unsigned index = 0; index < 1000; index += 1)
        mpz_mul_2exp(value, value, 1);
    mpz_clear(value);
    assert(checkpoint.soft_limit_exhaustions == 0);
    assert(checkpoint.upstream_allocations == 0);
    assert(checkpoint.high_water > 0);
    assert(sagejs_native_gmp_checkpoint_end(&checkpoint));
    return NULL;
}

static void reuse_witness(void)
{
    sagejs_native_gmp_checkpoint owner = {0}, child = {0};
    size_t alignment = SAGEJS_NATIVE_ALIGNOF(max_align_t);
    assert(sagejs_native_gmp_checkpoint_begin(&owner, 1U << 20, 0));
    /* All payload sizes around every physical class, including zero and the
       non-binned boundary. Reuse never touches a live neighbor. */
    for (size_t size = 0; size <= 520; ++size)
    {
        unsigned char *p = sagejs_native_gmp_malloc(size);
        unsigned char *neighbor = sagejs_native_gmp_malloc(19);
        sagejs_native_gmp_arena_header *h = ((sagejs_native_gmp_arena_header *) p) - 1;
        const size_t span = h->value.span;
        const size_t used = owner.used, high = owner.high_water;
        const uint64_t allocations = owner.allocation_calls;
        const uint64_t requested = owner.requested_bytes;
        assert((uintptr_t) p % alignment == 0);
        memset(neighbor, 0x5a, 19);
        sagejs_native_gmp_free(p, size);
        unsigned char *q = sagejs_native_gmp_malloc(size);
        if (span <= SAGEJS_NATIVE_GMP_SMALL_SPAN_LIMIT)
        {
            assert(q == p && owner.used == used && owner.high_water == high);
        }
        else
            assert(q != p && owner.used > used);
        assert(owner.allocation_calls == allocations + 1);
        assert(owner.requested_bytes == requested + size);
        for (size_t j = 0; j < 19; ++j) assert(neighbor[j] == 0x5a);
        sagejs_native_gmp_free(q, size);
        sagejs_native_gmp_free(neighbor, 19);
    }
    /* Shrink/regrow a non-last block without moving or rewinding the bump. */
    unsigned char *p = sagejs_native_gmp_malloc(100);
    unsigned char *blocker = sagejs_native_gmp_malloc(7);
    memset(p, 0x36, 100);
    const size_t used = owner.used;
    assert(sagejs_native_gmp_realloc(p, 100, 1) == p && owner.used == used);
    unsigned char *temporary_neighbor = sagejs_native_gmp_malloc(19);
    sagejs_native_gmp_free(temporary_neighbor, 19);
    const size_t after_neighbor = owner.used;
    assert(sagejs_native_gmp_realloc(p, 1, 100) == p && owner.used == after_neighbor);
    assert(p[0] == 0x36);
    /* Parent ownership is retained even when another checkpoint is active. */
    assert(sagejs_native_gmp_checkpoint_begin(&child, 4096, 0));
    unsigned char *local = sagejs_native_gmp_malloc(100);
    const uint64_t frees = owner.free_calls;
    unsigned char *grown = sagejs_native_gmp_realloc(p, 100, 200);
    assert(grown != p && sagejs_native_gmp_owner(grown) == &owner);
    assert(grown[0] == 0x36 && owner.free_calls == frees);
    unsigned char *reused = sagejs_native_gmp_checkpoint_allocate(&owner, 100);
    assert(reused == p);
    sagejs_native_gmp_free(reused, 100);
    assert(owner.free_calls == frees + 1);
    assert(sagejs_native_gmp_checkpoint_allocate(&owner, 100) == p);
    sagejs_native_gmp_free(local, 100);
    assert(sagejs_native_gmp_malloc(100) == local);
    assert(sagejs_native_gmp_checkpoint_end(&child));
    assert(grown[0] == 0x36);
    sagejs_native_gmp_free(p, 100);
    sagejs_native_gmp_free(grown, 200);
    sagejs_native_gmp_free(blocker, 7);
    assert(sagejs_native_gmp_checkpoint_allocate(&owner, SIZE_MAX) == NULL);
    assert(sagejs_native_gmp_checkpoint_allocate(&owner,
        SIZE_MAX - sizeof(sagejs_native_gmp_arena_header) + 1) == NULL);
    assert(sagejs_native_gmp_checkpoint_end(&owner));
    for (size_t i = 0; i < SAGEJS_NATIVE_GMP_SMALL_BIN_COUNT; ++i)
        assert(owner.small_bins[i] == NULL);

    /* Moving fallback copies before making the old arena span reusable. */
    assert(sagejs_native_gmp_checkpoint_begin(&owner, 256, 0));
    p = sagejs_native_gmp_malloc(16);
    memset(p, 0x73, 16);
    blocker = sagejs_native_gmp_malloc(16);
    const uint64_t fallback_frees = owner.free_calls;
    grown = sagejs_native_gmp_realloc(p, 16, 4096);
    assert(!sagejs_native_gmp_pointer_is_checkpoint_owned(grown));
    for (size_t i = 0; i < 16; ++i) assert(grown[i] == 0x73);
    assert(owner.upstream_allocations == 1 && owner.free_calls == fallback_frees);
    assert(sagejs_native_gmp_malloc(16) == p);
    assert(owner.upstream_allocations == 1); /* exhaustion remains sticky */
    sagejs_native_gmp_free(grown, 4096);
    sagejs_native_gmp_free(p, 16);
    sagejs_native_gmp_free(blocker, 16);
    assert(sagejs_native_gmp_checkpoint_end(&owner));

    /* Repeated tiny lifetime cycles have bounded physical high water. */
    assert(sagejs_native_gmp_checkpoint_begin(&owner, 128, 0));
    p = sagejs_native_gmp_malloc(0);
    const size_t one_span = owner.used;
    assert(sagejs_native_gmp_realloc(p, 0, 0) == p);
    sagejs_native_gmp_free(p, 0);
    for (size_t i = 0; i < 10000; ++i)
    {
        assert(sagejs_native_gmp_malloc(0) == p);
        sagejs_native_gmp_free(p, 0);
    }
    assert(owner.used == one_span && owner.high_water == one_span);
    assert(owner.upstream_allocations == 0 && owner.soft_limit_exhaustions == 0);
    assert(sagejs_native_gmp_checkpoint_end(&owner));

    assert(sagejs_native_gmp_checkpoint_begin(&owner, 1, 1));
    p = sagejs_native_gmp_malloc(16);
    assert(owner.soft_limit_exhaustions == 1);
    sagejs_native_gmp_free(p, 16);
    assert(sagejs_native_gmp_malloc(16) == p);
    assert(owner.soft_limit_exhaustions == 2);
    assert(sagejs_native_gmp_realloc(p, 16, 0) == p);
    assert(owner.soft_limit_exhaustions == 2);
    sagejs_native_gmp_free(p, 0);
    assert(sagejs_native_gmp_checkpoint_end(&owner));
    sagejs_native_gmp_checkpoint_stats stats = {0};
    assert(sagejs_native_gmp_last_checkpoint_stats(&stats));
    assert(stats.soft_limit_exhaustions == 2);
}

int main(void)
{
    sagejs_native_gmp_checkpoint outer = {0};
    sagejs_native_gmp_checkpoint nested = {0};
    sagejs_native_gmp_checkpoint tiny = {0};
    sagejs_native_gmp_checkpoint virtual_only = {0};
    mpz_t persistent, left, right, output, nested_value, spill;
    sagejs_native_gmp_checkpoint_stats completed = {0};
    unsigned recommended_shift = 0;
    pthread_t first_thread, second_thread;

    mp_set_memory_functions(
        upstream_allocate, upstream_reallocate, upstream_free);
    assert(sagejs_native_gmp_allocator_install());
    mpz_init2(persistent, 128);
    mpz_set_ui(persistent, 3);
    assert(!sagejs_native_gmp_pointer_is_checkpoint_owned(
        mpz_limbs_read(persistent)));

    assert(sagejs_native_gmp_checkpoint_begin(&outer, 1U << 20, 1));
    mpz_init2(left, 65536);
    mpz_init2(right, 65536);
    assert(sagejs_native_gmp_pointer_is_checkpoint_owned(mpz_limbs_read(left)));
    assert(sagejs_native_gmp_pointer_is_checkpoint_owned(mpz_limbs_read(right)));
    mpz_set_ui(left, 5);
    mpz_set_ui(right, 7);
    for (unsigned index = 0; index < 500; index += 1)
    {
        mpz_addmul(left, right, right);
        mpz_fdiv_r_2exp(left, left, 4096);
        mpz_submul(right, left, persistent);
        mpz_fdiv_r_2exp(right, right, 4096);
    }
    assert(outer.soft_limit_exhaustions == 0);
    assert(outer.upstream_allocations == 0);

    mpz_mul_2exp(persistent, persistent, 4096);
    assert(!sagejs_native_gmp_pointer_is_checkpoint_owned(
        mpz_limbs_read(persistent)));

    sagejs_native_gmp_checkpoint_suspend();
    mpz_init(output);
    mpz_set(output, left);
    assert(!sagejs_native_gmp_pointer_is_checkpoint_owned(mpz_limbs_read(output)));
    assert(sagejs_native_gmp_checkpoint_resume());

    assert(sagejs_native_gmp_checkpoint_begin(&nested, 1U << 16, 1));
    mpz_init2(nested_value, 4096);
    assert(sagejs_native_gmp_pointer_is_checkpoint_owned(
        mpz_limbs_read(nested_value)));
    assert(sagejs_native_gmp_pointer_is_checkpoint_owned(mpz_limbs_read(left)));
    mpz_clear(nested_value);
    assert(sagejs_native_gmp_checkpoint_end(&nested));

    mpz_clear(right);
    mpz_clear(left);
    assert(outer.allocation_calls > 0);
    assert(outer.high_water <= outer.capacity);
    assert(sagejs_native_gmp_checkpoint_end(&outer));
    assert(sagejs_native_gmp_last_checkpoint_stats(&completed));
    assert(completed.capacity == (1U << 20));
    assert(completed.reservation_size == (size_t) (256U << 20));
    assert(completed.activated > 0);
    assert(completed.activated < completed.reservation_size);
#if defined(_WIN32)
    assert(completed.storage_kind ==
        SAGEJS_NATIVE_GMP_STORAGE_WINDOWS_VIRTUAL);
#elif defined(__wasi__)
    assert(completed.storage_kind == SAGEJS_NATIVE_GMP_STORAGE_UPSTREAM);
#else
    assert(completed.storage_kind ==
        SAGEJS_NATIVE_GMP_STORAGE_POSIX_VIRTUAL);
#endif
    assert(completed.high_water > 0);
    assert(completed.soft_limit_exhaustions == 0);
    assert(completed.upstream_allocations == 0);
    assert(mpz_sgn(output) != 0);

    assert(sagejs_native_gmp_checkpoint_begin(&tiny, 64, 1));
    mpz_init2(spill, 4096);
    assert(tiny.soft_limit_exhaustions == 1);
    assert(tiny.upstream_allocations == 0);
    assert(sagejs_native_gmp_pointer_is_checkpoint_owned(mpz_limbs_read(spill)));
    mpz_clear(spill);
    assert(sagejs_native_gmp_checkpoint_end(&tiny));
    assert(sagejs_native_gmp_recommended_retry_shift(
        0, SAGEJS_NATIVE_GMP_MAX_RETRY_SHIFT, &recommended_shift));
    assert(recommended_shift > 0);
    assert(((size_t) 64 << recommended_shift) >= tiny.high_water);

    if (sizeof(size_t) >= 8)
    {
        const size_t large_reservation = (size_t) 64U << 30;
        /* Test envelope saturation without requiring 64 GiB of address space.
           The earlier live checkpoint exercises real virtual reservation. */
        assert(sagejs_native_gmp_reservation_size(
            large_reservation, large_reservation) == large_reservation);
    }

    assert(sagejs_native_gmp_set_retry_shift(3));
    assert(sagejs_native_gmp_checkpoint_begin(&virtual_only, 1024, 1));
    assert(virtual_only.capacity == 8192);
    assert(virtual_only.retry_shift == 3);
    assert(sagejs_native_gmp_checkpoint_end(&virtual_only));
    assert(sagejs_native_gmp_checkpoint_begin(&virtual_only, 1024, 0));
    assert(virtual_only.capacity == 8192);
    assert(virtual_only.reservation_size == 8192);
    assert(virtual_only.retry_shift == 3);
    assert(sagejs_native_gmp_checkpoint_end(&virtual_only));
    assert(sagejs_native_gmp_set_retry_shift(0));

    /* Nonretryable scopes reserve declared capacity, not a 256x envelope. */
    assert(sagejs_native_gmp_checkpoint_begin(
        &virtual_only, (size_t) 128U << 20, 0));
    assert(virtual_only.capacity == (size_t) 128U << 20);
    assert(virtual_only.reservation_size == virtual_only.capacity);
    assert(sagejs_native_gmp_checkpoint_end(&virtual_only));
    assert(!sagejs_native_gmp_checkpoint_begin(&virtual_only, 1024, -1));
    assert(!sagejs_native_gmp_checkpoint_begin(&virtual_only, 1024, 2));
    assert(!virtual_only.open && virtual_only.storage == NULL);

    /* Exact capacity still uses the established safe upstream fallback.
       Callers must reject the failed region; external writes are not undone. */
    assert(sagejs_native_gmp_checkpoint_begin(&tiny, 64, 0));
    mpz_init2(spill, 4096);
    assert(tiny.upstream_allocations == 1);
    assert(!sagejs_native_gmp_pointer_is_checkpoint_owned(mpz_limbs_read(spill)));
    mpz_clear(spill);
    assert(sagejs_native_gmp_checkpoint_end(&tiny));
    assert(sagejs_native_gmp_last_checkpoint_stats(&completed));
    assert(completed.reservation_size == 64 && completed.upstream_allocations == 1);

    assert(pthread_create(&first_thread, NULL, thread_witness,
        (void *) (uintptr_t) 11) == 0);
    assert(pthread_create(&second_thread, NULL, thread_witness,
        (void *) (uintptr_t) 29) == 0);
    assert(pthread_join(first_thread, NULL) == 0);
    assert(pthread_join(second_thread, NULL) == 0);
    reuse_witness();

    mpz_clear(output);
    mpz_clear(persistent);
    assert(upstream_allocations > 0);
    assert(upstream_reallocations > 0);
    assert(upstream_frees > 0);
    puts("gmp checkpoint allocator passed");
    return 0;
}
`;

test("GMP checkpoint allocation is scoped, nested, and thread-local", {
  skip: process.platform === "win32"
    ? "the pthread harness is Unix-only; runtime code has an MSVC TLS path"
    : false,
}, () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-gmp-checkpoint-"));
  try {
    const source = join(temporary, "checkpoint.c");
    const executable = join(temporary, "checkpoint");
    writeFileSync(
      source,
      `${GMP_CHECKPOINT_ALLOCATOR_C_SOURCE}\n${harness}`,
    );
    const compile = spawnSync(process.env.CC || "cc", [
      "-std=c11",
      "-O3",
      "-Wall",
      "-Wextra",
      "-Werror",
      `-I${join(prefix, "include")}`,
      source,
      join(prefix, "lib", "libgmp.a"),
      "-pthread",
      "-o",
      executable,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(
      compile.status,
      0,
      `checkpoint compile failed:\n${compile.stdout}${compile.stderr}`,
    );
    const run = spawnSync(executable, [], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(
      run.status,
      0,
      `checkpoint run failed: ${run.error?.message || ""}\n` +
        `${run.stdout}${run.stderr}`,
    );
    assert.equal(run.stdout.trim(), "gmp checkpoint allocator passed");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
