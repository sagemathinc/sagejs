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
    assert(sagejs_native_gmp_checkpoint_begin(&checkpoint, 1U << 20));
    mpz_init2(value, 8192);
    assert(sagejs_native_gmp_pointer_is_checkpoint_owned(mpz_limbs_read(value)));
    mpz_set_ui(value, seed + 1);
    for (unsigned index = 0; index < 1000; index += 1)
        mpz_mul_2exp(value, value, 1);
    mpz_clear(value);
    assert(checkpoint.spill_allocations == 0);
    assert(checkpoint.high_water > 0);
    assert(sagejs_native_gmp_checkpoint_end(&checkpoint));
    return NULL;
}

int main(void)
{
    sagejs_native_gmp_checkpoint outer = {0};
    sagejs_native_gmp_checkpoint nested = {0};
    sagejs_native_gmp_checkpoint tiny = {0};
    mpz_t persistent, left, right, output, nested_value, spill;
    sagejs_native_gmp_checkpoint_stats completed = {0};
    pthread_t first_thread, second_thread;

    mp_set_memory_functions(
        upstream_allocate, upstream_reallocate, upstream_free);
    assert(sagejs_native_gmp_allocator_install());
    mpz_init2(persistent, 128);
    mpz_set_ui(persistent, 3);
    assert(!sagejs_native_gmp_pointer_is_checkpoint_owned(
        mpz_limbs_read(persistent)));

    assert(sagejs_native_gmp_checkpoint_begin(&outer, 1U << 20));
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
    assert(outer.spill_allocations == 0);

    mpz_mul_2exp(persistent, persistent, 4096);
    assert(!sagejs_native_gmp_pointer_is_checkpoint_owned(
        mpz_limbs_read(persistent)));

    sagejs_native_gmp_checkpoint_suspend();
    mpz_init(output);
    mpz_set(output, left);
    assert(!sagejs_native_gmp_pointer_is_checkpoint_owned(mpz_limbs_read(output)));
    assert(sagejs_native_gmp_checkpoint_resume());

    assert(sagejs_native_gmp_checkpoint_begin(&nested, 1U << 16));
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
    assert(completed.high_water > 0);
    assert(completed.spill_allocations == 0);
    assert(mpz_sgn(output) != 0);

    assert(sagejs_native_gmp_checkpoint_begin(&tiny, 64));
    mpz_init2(spill, 4096);
    assert(tiny.spill_allocations == 1);
    assert(!sagejs_native_gmp_pointer_is_checkpoint_owned(mpz_limbs_read(spill)));
    mpz_clear(spill);
    assert(sagejs_native_gmp_checkpoint_end(&tiny));

    assert(pthread_create(&first_thread, NULL, thread_witness,
        (void *) (uintptr_t) 11) == 0);
    assert(pthread_create(&second_thread, NULL, thread_witness,
        (void *) (uintptr_t) 29) == 0);
    assert(pthread_join(first_thread, NULL) == 0);
    assert(pthread_join(second_thread, NULL) == 0);

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
