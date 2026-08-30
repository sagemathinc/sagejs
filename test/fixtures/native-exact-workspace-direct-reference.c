#include "kernel_core.h"

#include <sagejs/native_exact_workspace_ffi.h>

static void sagejs_direct_set_uint64(mpz_t result, uint64_t value)
{
#if ULONG_MAX >= UINT64_MAX
    mpz_set_ui(result, (unsigned long) value);
#else
    mpz_set_ui(result, (unsigned long) (value >> 32));
    mpz_mul_2exp(result, result, 32);
    mpz_add_ui(result, result, (unsigned long) (value & UINT64_C(0xffffffff)));
#endif
}

/*
 * Compact reviewed C reference for C6 code-quality comparison.  It implements
 * the same authenticated borrow, checkpoint, exact updates, transactional
 * publication, and reverse cleanup as the generated Python witness.
 */
int sagejs_direct_accumulate_relation_workspace(
    sagejs_native_status *status,
    mpz_t output_first,
    mpz_t output_second,
    uint64_t *output_generation,
    sagejs_native_exact_workspace_t workspace,
    uint64_t expected_generation,
    uint64_t specification_high,
    uint64_t specification_low,
    const mpz_t first,
    const mpz_t second,
    uint64_t rounds,
    uint64_t arena_memory_limit,
    uint64_t temporary_limit)
{
    sagejs_native_exact_arena arena = {0};
    sagejs_native_exact_workspace_borrow_t borrow;
    mpz_t index_value, result_first, result_second;
    int arena_initialized = 0;
    int borrow_initialized = 0;
    int success = 0;
    uint64_t index;

    mpz_inits(index_value, result_first, result_second, NULL);
    if (!sagejs_native_exact_arena_init(
            status, &arena, arena_memory_limit, temporary_limit))
        goto cleanup;
    arena_initialized = 1;
    if (!sagejs_native_exact_workspace_borrow_init(
            borrow, workspace, expected_generation,
            specification_high, specification_low))
        goto cleanup;
    borrow_initialized = 1;
    if (arena.temporary_limit > (uint64_t) SIZE_MAX ||
        !sagejs_native_gmp_checkpoint_begin(
            &arena.checkpoint, (size_t) arena.temporary_limit))
        goto cleanup;
    if (!sagejs_native_exact_workspace_borrow_set_mpz(borrow, 0, first) ||
        !sagejs_native_exact_workspace_borrow_set_mpz(borrow, 1, second))
        goto cleanup;
    for (index = 0; index < rounds; index++)
    {
        sagejs_direct_set_uint64(index_value, index);
        if (!sagejs_native_exact_workspace_borrow_addmul_mpz(
                borrow, 0, second, index_value) ||
            !sagejs_native_exact_workspace_borrow_submul_mpz(
                borrow, 1, first, index_value))
            goto cleanup;
    }
    if (!sagejs_native_exact_workspace_borrow_swap(borrow, 0, 1) ||
        !sagejs_native_exact_workspace_borrow_entry_mpz(
            result_first, borrow, 0) ||
        !sagejs_native_exact_workspace_borrow_entry_mpz(
            result_second, borrow, 1) ||
        arena.checkpoint.soft_limit_exhaustions != 0 ||
        arena.checkpoint.upstream_allocations != 0)
        goto cleanup;
    sagejs_native_gmp_checkpoint_suspend();
    mpz_set(output_first, result_first);
    mpz_set(output_second, result_second);
    *output_generation =
        sagejs_native_exact_workspace_borrow_generation(borrow);
    if (!sagejs_native_gmp_checkpoint_resume())
        goto cleanup;
    success = 1;

cleanup:
    if (borrow_initialized)
        sagejs_native_exact_workspace_borrow_clear(borrow);
    mpz_clears(result_second, result_first, index_value, NULL);
    if (arena_initialized)
        sagejs_native_exact_arena_clear(&arena);
    return success;
}
