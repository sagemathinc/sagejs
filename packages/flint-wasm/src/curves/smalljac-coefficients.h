#ifndef SAGEJS_WASM_SMALLJAC_COEFFICIENTS_H
#define SAGEJS_WASM_SMALLJAC_COEFFICIENTS_H

#include <stdint.h>

#define SAGEJS_WASM_SMALLJAC_MODE_ANLIST 0U
#define SAGEJS_WASM_SMALLJAC_MODE_AP 1U

#define SAGEJS_WASM_SMALLJAC_OK 0
#define SAGEJS_WASM_SMALLJAC_INVALID_INPUT -1
#define SAGEJS_WASM_SMALLJAC_RESOURCE_LIMIT -2
#define SAGEJS_WASM_SMALLJAC_ALLOCATION_FAILED -3
#define SAGEJS_WASM_SMALLJAC_PARSE_FAILED -4
#define SAGEJS_WASM_SMALLJAC_UPSTREAM_FAILED -5
#define SAGEJS_WASM_SMALLJAC_COEFFICIENT_RANGE -6

/* The genus-2 boundary deliberately mirrors the desktop smalljac adapter's
   statuses.  Keep these values stable: ordinary Python validates them through
   `smalljacCapabilities()` before it accepts the accelerator. */
#define SAGEJS_WASM_SMALLJAC_LPOLY_OK 0
#define SAGEJS_WASM_SMALLJAC_LPOLY_TRUNCATED 1
#define SAGEJS_WASM_SMALLJAC_LPOLY_UNAVAILABLE -1
#define SAGEJS_WASM_SMALLJAC_LPOLY_INVALID_ARGUMENT -2
#define SAGEJS_WASM_SMALLJAC_LPOLY_PARSE_ERROR -3
#define SAGEJS_WASM_SMALLJAC_LPOLY_UNSUPPORTED_CURVE -4
#define SAGEJS_WASM_SMALLJAC_LPOLY_SINGULAR_CURVE -5
#define SAGEJS_WASM_SMALLJAC_LPOLY_INVALID_INTERVAL -6
#define SAGEJS_WASM_SMALLJAC_LPOLY_ALLOCATION_FAILED -7
#define SAGEJS_WASM_SMALLJAC_LPOLY_CALLBACK_CANCELLED -8
#define SAGEJS_WASM_SMALLJAC_LPOLY_COEFFICIENT_RANGE -9
#define SAGEJS_WASM_SMALLJAC_LPOLY_INTERNAL_ERROR -10

#define SAGEJS_WASM_SMALLJAC_ROW_GOOD 0
#define SAGEJS_WASM_SMALLJAC_ROW_BAD_REDUCTION 1

int32_t sagejs_wasm_smalljac_begin(
    uint32_t curve_text_bytes,
    uint64_t bound_or_prime,
    uint32_t mode);
uintptr_t sagejs_wasm_smalljac_curve_text(void);
uintptr_t sagejs_wasm_smalljac_output(void);
uint32_t sagejs_wasm_smalljac_output_words(void);
int32_t sagejs_wasm_smalljac_compute(void);
void sagejs_wasm_smalljac_clear(void);

/* Bounded packed genus-2 local L-polynomial traversal.  An omitted host row
   limit is represented by `maximum_rows == 0`; the adapter still bounds the
   integer interval to at most 131071 values, matching one public Python
   chunk.  The callback emits the first two coefficients of

       det(1 - T*Frob_p)

   and the host reconstructs the reciprocal degree-four polynomial. */
int32_t sagejs_wasm_smalljac_lpoly_begin(
    uint32_t curve_text_bytes,
    uint64_t start,
    uint64_t stop,
    uint32_t maximum_rows);
uintptr_t sagejs_wasm_smalljac_lpoly_curve_text(void);
uintptr_t sagejs_wasm_smalljac_lpoly_primes(void);
uintptr_t sagejs_wasm_smalljac_lpoly_good(void);
uintptr_t sagejs_wasm_smalljac_lpoly_coefficient_counts(void);
uintptr_t sagejs_wasm_smalljac_lpoly_coefficients(void);
uintptr_t sagejs_wasm_smalljac_lpoly_row_status(void);
uint32_t sagejs_wasm_smalljac_lpoly_row_count(void);
uint32_t sagejs_wasm_smalljac_lpoly_required_rows(void);
uint32_t sagejs_wasm_smalljac_lpoly_genus(void);
uint32_t sagejs_wasm_smalljac_lpoly_truncated(void);
int64_t sagejs_wasm_smalljac_lpoly_upstream_status(void);
uintptr_t sagejs_wasm_smalljac_lpoly_backend_version(void);
uint32_t sagejs_wasm_smalljac_lpoly_backend_version_bytes(void);
int32_t sagejs_wasm_smalljac_lpoly_compute(void);
void sagejs_wasm_smalljac_lpoly_clear(void);

#endif
