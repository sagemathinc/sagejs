#ifndef SAGEJS_WASM_ELLIPTIC_LSERIES_ADAPTER_H
#define SAGEJS_WASM_ELLIPTIC_LSERIES_ADAPTER_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum
{
    SAGEJS_WASM_EC_OUTPUT_DECIMAL_BALLS = 0,
    SAGEJS_WASM_EC_OUTPUT_PLAN = 1,
    SAGEJS_WASM_EC_OUTPUT_PLOT = 2
};

enum
{
    SAGEJS_WASM_EC_ADAPTER_OK = 0,
    SAGEJS_WASM_EC_ADAPTER_INVALID_INPUT = -1,
    SAGEJS_WASM_EC_ADAPTER_RESOURCE_LIMIT = -2,
    SAGEJS_WASM_EC_ADAPTER_ALLOCATION_FAILED = -3,
    SAGEJS_WASM_EC_ADAPTER_PARSE_FAILED = -4
};

/*
 * One bounded, process-local request. The browser kernel owns a separate Wasm
 * instance, so a singleton avoids exporting allocator semantics. Inputs are
 * copied into linear memory once: exact signed coefficients, conductor text,
 * and all real/imaginary decimal components with a shared offset table.
 */
int32_t sagejs_wasm_ec_lseries_begin(
    uint32_t coefficient_count,
    uint32_t point_count,
    uint32_t point_text_bytes,
    uint32_t conductor_text_bytes,
    uint32_t target_bits,
    uint32_t refinement_bits,
    uint32_t work_precision_bits,
    uint32_t output_mode);

void sagejs_wasm_ec_lseries_clear(void);

uintptr_t sagejs_wasm_ec_lseries_coefficients(void);
uintptr_t sagejs_wasm_ec_lseries_point_text(void);
uintptr_t sagejs_wasm_ec_lseries_point_offsets(void);
uintptr_t sagejs_wasm_ec_lseries_conductor_text(void);

int32_t sagejs_wasm_ec_lseries_compute(int32_t root_number);

/* Decimal mode: offset_count is field_count*point_count+1. Field order is
 * fine completed ball and accuracy, fine raw ball and accuracy, the five
 * analytic error fields, followed by coarse completed/raw balls and their
 * accuracies when refinement is enabled.
 * Every scalar is an `arf_get_str` decimal, preserving the requested Acb
 * precision rather than silently reducing ordinary values to binary64. */
uintptr_t sagejs_wasm_ec_lseries_decimal_bytes(void);
uint32_t sagejs_wasm_ec_lseries_decimal_byte_count(void);
uintptr_t sagejs_wasm_ec_lseries_decimal_offsets(void);
uint32_t sagejs_wasm_ec_lseries_decimal_offset_count(void);
uint32_t sagejs_wasm_ec_lseries_decimal_field_count(void);

/* Plot mode: five binary64 values per point: fine re/im, coarse re/im, and a
 * conservative displayed analytic error. Binary64 is explicit and confined
 * to the low-precision plotting path. Larger plots tile requests above this
 * ABI; one tile is capped at 10,000 points. */
uintptr_t sagejs_wasm_ec_lseries_plot_values(void);
uint32_t sagejs_wasm_ec_lseries_plot_value_count(void);
uint32_t sagejs_wasm_ec_lseries_plot_stride(void);

/* Stable indexed diagnostics, all integral except entries 8--10, which are
 * exposed by the separate double accessor. */
int64_t sagejs_wasm_ec_lseries_diagnostic(uint32_t index);
double sagejs_wasm_ec_lseries_diagnostic_double(uint32_t index);

#ifdef __cplusplus
}
#endif

#endif
