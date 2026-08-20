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

int32_t sagejs_wasm_smalljac_begin(
    uint32_t curve_text_bytes,
    uint64_t bound_or_prime,
    uint32_t mode);
uintptr_t sagejs_wasm_smalljac_curve_text(void);
uintptr_t sagejs_wasm_smalljac_output(void);
uint32_t sagejs_wasm_smalljac_output_words(void);
int32_t sagejs_wasm_smalljac_compute(void);
void sagejs_wasm_smalljac_clear(void);

#endif
