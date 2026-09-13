#include <limits.h>
#include <stdint.h>
#include <stdlib.h>

#if !defined(__wasi__)
#include <setjmp.h>
#include <uv.h>
#define SAGEJS_MSOLVE_HAS_LONGJMP 1
#else
#define SAGEJS_MSOLVE_HAS_LONGJMP 0
#endif

#include "msolve_core.h"
#include "../vendor/msolve/src/neogb/f4.h"
#include "../vendor/msolve/src/msolve/msolve.h"

#if defined(_WIN32)
#define SAGEJS_THREAD_LOCAL __declspec(thread)
#else
#define SAGEJS_THREAD_LOCAL _Thread_local
#endif

#if SAGEJS_MSOLVE_HAS_LONGJMP
static SAGEJS_THREAD_LOCAL jmp_buf *sagejs_msolve_guard;

/* msolve's public embedding API does not promise that its modular lifting and
 * diagnostic state is safe to enter concurrently from several host threads.
 * Node worker threads share this addon, so serialize native calls at the
 * process boundary.  Separate Wasm instances have separate linear memories
 * and therefore do not share msolve state. */
static uv_once_t sagejs_msolve_mutex_once = UV_ONCE_INIT;
static uv_mutex_t sagejs_msolve_mutex;
static int sagejs_msolve_mutex_status = UV_EINVAL;

static void sagejs_msolve_mutex_initialize(void)
{
    sagejs_msolve_mutex_status = uv_mutex_init(&sagejs_msolve_mutex);
}

static int sagejs_msolve_enter(void)
{
    uv_once(&sagejs_msolve_mutex_once, sagejs_msolve_mutex_initialize);
    if (sagejs_msolve_mutex_status != 0)
        return 0;
    uv_mutex_lock(&sagejs_msolve_mutex);
    return 1;
}

static void sagejs_msolve_leave(void)
{
    uv_mutex_unlock(&sagejs_msolve_mutex);
}
#else
static int sagejs_msolve_enter(void)
{
    return 1;
}

static void sagejs_msolve_leave(void)
{
}
#endif

void sagejs_msolve_exit(int status)
{
#if SAGEJS_MSOLVE_HAS_LONGJMP
    if (sagejs_msolve_guard != NULL)
        longjmp(*sagejs_msolve_guard, status == 0 ? 1 : status);
    abort();
#else
    (void) status;
    /* A Wasm trap is contained to the current call and cannot terminate the
     * browser host process.  Valid packets are preflighted before msolve; this
     * remains the final boundary for an unexpected internal fatal path without
     * requiring nonstandard Wasm setjmp/longjmp exception support. */
    __builtin_trap();
#endif
}

static void reset_result(sagejs_msolve_f4_result *result)
{
    result->length = 0;
    result->terms = 0;
    result->lengths = NULL;
    result->exponents = NULL;
    result->coefficients = NULL;
}

static sagejs_msolve_status validate_shape(
    const int32_t *lengths, int32_t variables, int32_t generators)
{
    int32_t index;
    uint64_t terms = 0;
    if (lengths == NULL || variables < 1 ||
        variables > SAGEJS_MSOLVE_MAX_VARIABLES || generators < 1 ||
        generators > SAGEJS_MSOLVE_MAX_GENERATORS)
        return SAGEJS_MSOLVE_INVALID;
    for (index = 0; index < generators; index++)
    {
        if (lengths[index] <= 0 ||
            terms > (uint64_t) SAGEJS_MSOLVE_MAX_INPUT_TERMS -
                (uint64_t) lengths[index])
            return SAGEJS_MSOLVE_OVERFLOW;
        terms += (uint64_t) lengths[index];
    }
    if (terms > SAGEJS_MSOLVE_MAX_EXPONENT_ENTRIES / (uint64_t) variables)
        return SAGEJS_MSOLVE_OVERFLOW;
    return SAGEJS_MSOLVE_OK;
}

static int result_shape_is_bounded(
    int32_t length, int64_t terms, int32_t variables)
{
    return length >= 0 && length <= SAGEJS_MSOLVE_MAX_GENERATORS &&
        terms >= 0 && terms <= SAGEJS_MSOLVE_MAX_INPUT_TERMS &&
        (uint64_t) terms <=
            SAGEJS_MSOLVE_MAX_EXPONENT_ENTRIES / (uint64_t) variables;
}

sagejs_msolve_status sagejs_msolve_f4(
    sagejs_msolve_f4_result *result,
    const int32_t *lengths,
    const int32_t *exponents,
    const int32_t *coefficients,
    uint32_t characteristic,
    int32_t variables,
    int32_t generators)
{
    sagejs_msolve_status shape;
#if SAGEJS_MSOLVE_HAS_LONGJMP
    jmp_buf guard;
    int trapped;
#endif

    if (result == NULL)
        return SAGEJS_MSOLVE_INVALID;
    reset_result(result);
    if (exponents == NULL || coefficients == NULL || characteristic < 2 ||
        characteristic >= (UINT32_C(1) << 31))
        return SAGEJS_MSOLVE_INVALID;
    shape = validate_shape(lengths, variables, generators);
    if (shape != SAGEJS_MSOLVE_OK)
        return shape;
#if SAGEJS_MSOLVE_HAS_LONGJMP
    if (sagejs_msolve_guard != NULL)
        return SAGEJS_MSOLVE_BUSY;
#endif
    if (!sagejs_msolve_enter())
        return SAGEJS_MSOLVE_INTERNAL;
#if SAGEJS_MSOLVE_HAS_LONGJMP
    sagejs_msolve_guard = &guard;
    trapped = setjmp(guard);
    if (trapped != 0)
    {
        /* Preflight rejects all user-controlled error paths.  This trap is a
         * final host-process boundary for an unexpected upstream failure.
         * Output pointers are initialized so any published allocation can be
         * released; unpublished upstream work remains quarantined to this
         * failed invocation and the backend is not retried by the caller. */
        sagejs_msolve_guard = NULL;
        if (result->lengths != NULL || result->exponents != NULL ||
            result->coefficients != NULL)
            sagejs_msolve_f4_result_clear(result, characteristic);
        reset_result(result);
        sagejs_msolve_leave();
        return SAGEJS_MSOLVE_INTERNAL;
    }
#endif

    result->terms = export_f4(
        malloc,
        &result->length,
        &result->lengths,
        &result->exponents,
        (void **) &result->coefficients,
        lengths,
        exponents,
        coefficients,
        characteristic,
        0,  /* degree reverse lexicographic */
        0,  /* no elimination block */
        variables,
        generators,
        17, /* initial hash table is 2^17 */
        1,  /* scalar deterministic baseline */
        0,  /* all available pairs */
        0,  /* do not reset hash table */
        2,  /* exact sparse linear algebra */
        1,  /* reduced basis */
        0,  /* no PBM diagnostics */
        0); /* silent */
#if SAGEJS_MSOLVE_HAS_LONGJMP
    sagejs_msolve_guard = NULL;
#endif
    if (!result_shape_is_bounded(
            result->length, result->terms, variables) ||
        (result->length > 0 &&
         (result->lengths == NULL || result->exponents == NULL ||
          result->coefficients == NULL)))
    {
        sagejs_msolve_f4_result_clear(result, characteristic);
        sagejs_msolve_leave();
        return SAGEJS_MSOLVE_INTERNAL;
    }
    sagejs_msolve_leave();
    return SAGEJS_MSOLVE_OK;
}

void sagejs_msolve_f4_result_clear(
    sagejs_msolve_f4_result *result, uint32_t characteristic)
{
    void *coefficients;
    if (result == NULL)
        return;
    coefficients = result->coefficients;
    free_f4_julia_result_data(
        free,
        &result->lengths,
        &result->exponents,
        &coefficients,
        result->length,
        characteristic);
    reset_result(result);
}

static void reset_qq_result(sagejs_msolve_qq_result *result)
{
    result->length = 0;
    result->terms = 0;
    result->lengths = NULL;
    result->exponents = NULL;
    result->coefficients = NULL;
}

sagejs_msolve_status sagejs_msolve_qq(
    sagejs_msolve_qq_result *result,
    const int32_t *lengths,
    const int32_t *exponents,
    const void *coefficients,
    int32_t variables,
    int32_t generators)
{
    sagejs_msolve_status shape;
#if SAGEJS_MSOLVE_HAS_LONGJMP
    jmp_buf guard;
    int trapped;
#endif

    if (result == NULL)
        return SAGEJS_MSOLVE_INVALID;
    reset_qq_result(result);
    if (exponents == NULL || coefficients == NULL)
        return SAGEJS_MSOLVE_INVALID;
    shape = validate_shape(lengths, variables, generators);
    if (shape != SAGEJS_MSOLVE_OK)
        return shape;
#if SAGEJS_MSOLVE_HAS_LONGJMP
    if (sagejs_msolve_guard != NULL)
        return SAGEJS_MSOLVE_BUSY;
#endif
    if (!sagejs_msolve_enter())
        return SAGEJS_MSOLVE_INTERNAL;
#if SAGEJS_MSOLVE_HAS_LONGJMP
    sagejs_msolve_guard = &guard;
    trapped = setjmp(guard);
    if (trapped != 0)
    {
        sagejs_msolve_guard = NULL;
        if (result->lengths != NULL || result->exponents != NULL ||
            result->coefficients != NULL)
            sagejs_msolve_qq_result_clear(result);
        reset_qq_result(result);
        sagejs_msolve_leave();
        return SAGEJS_MSOLVE_INTERNAL;
    }
#endif
    result->terms = export_groebner_qq(
        malloc,
        &result->length,
        &result->lengths,
        &result->exponents,
        &result->coefficients,
        lengths,
        exponents,
        coefficients,
        0,  /* rational coefficients */
        0,  /* degree reverse lexicographic */
        0,  /* no elimination block */
        variables,
        generators,
        17, /* initial hash table is 2^17 */
        1,  /* scalar deterministic baseline */
        0,  /* all available pairs */
        0,  /* do not reset hash table */
        2,  /* exact sparse linear algebra */
        2,  /* export the complete basis */
        1,  /* reduced basis */
        0,  /* no PBM diagnostics */
        0,  /* do not truncate lifting */
        0); /* silent */
#if SAGEJS_MSOLVE_HAS_LONGJMP
    sagejs_msolve_guard = NULL;
#endif
    if (!result_shape_is_bounded(
            result->length, result->terms, variables) ||
        (result->length > 0 &&
         (result->lengths == NULL || result->exponents == NULL ||
          result->coefficients == NULL)))
    {
        sagejs_msolve_qq_result_clear(result);
        sagejs_msolve_leave();
        return SAGEJS_MSOLVE_INTERNAL;
    }
    sagejs_msolve_leave();
    return SAGEJS_MSOLVE_OK;
}

void sagejs_msolve_qq_result_clear(sagejs_msolve_qq_result *result)
{
    int64_t term, terms = 0;
    mpz_t *coefficients;
    if (result == NULL)
        return;
    if (result->lengths != NULL)
        for (term = 0; term < result->length; term++)
            terms += result->lengths[term];
    coefficients = (mpz_t *) result->coefficients;
    if (coefficients != NULL)
    {
        for (term = 0; term < terms; term++)
            mpz_clear(coefficients[term]);
        free(coefficients);
    }
    free(result->lengths);
    free(result->exponents);
    reset_qq_result(result);
}
