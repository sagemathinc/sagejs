#ifndef SAGEJS_MSOLVE_CORE_H
#define SAGEJS_MSOLVE_CORE_H

#include <stdint.h>

/* These are adapter limits, not mathematical limits of msolve.  They bound
 * allocations before entering upstream code and are shared by native and
 * Wasm callers.  Larger workloads must use a separately reviewed worker
 * envelope rather than silently removing the host-process guardrail. */
#define SAGEJS_MSOLVE_MAX_VARIABLES INT32_C(4096)
#define SAGEJS_MSOLVE_MAX_GENERATORS INT32_C(262144)
#define SAGEJS_MSOLVE_MAX_INPUT_TERMS INT32_C(1048576)
#define SAGEJS_MSOLVE_MAX_EXPONENT_ENTRIES UINT64_C(16777216)

typedef enum
{
    SAGEJS_MSOLVE_OK = 0,
    SAGEJS_MSOLVE_INVALID = 1,
    SAGEJS_MSOLVE_INTERNAL = 2,
    SAGEJS_MSOLVE_OVERFLOW = 3,
    SAGEJS_MSOLVE_BUSY = 4
} sagejs_msolve_status;

typedef struct
{
    int32_t length;
    int64_t terms;
    int32_t *lengths;
    int32_t *exponents;
    int32_t *coefficients;
} sagejs_msolve_f4_result;

typedef struct
{
    int32_t length;
    int64_t terms;
    int32_t *lengths;
    int32_t *exponents;
    void *coefficients;
} sagejs_msolve_qq_result;

sagejs_msolve_status sagejs_msolve_f4(
    sagejs_msolve_f4_result *result,
    const int32_t *lengths,
    const int32_t *exponents,
    const int32_t *coefficients,
    uint32_t characteristic,
    int32_t variables,
    int32_t generators);

void sagejs_msolve_f4_result_clear(
    sagejs_msolve_f4_result *result, uint32_t characteristic);

sagejs_msolve_status sagejs_msolve_qq(
    sagejs_msolve_qq_result *result,
    const int32_t *lengths,
    const int32_t *exponents,
    const void *coefficients,
    int32_t variables,
    int32_t generators);

void sagejs_msolve_qq_result_clear(sagejs_msolve_qq_result *result);

#endif
