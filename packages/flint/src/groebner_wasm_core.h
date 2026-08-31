#ifndef SAGEJS_GROEBNER_WASM_CORE_H
#define SAGEJS_GROEBNER_WASM_CORE_H

#include <stddef.h>
#include <stdint.h>

#define SAGEJS_GROEBNER_PACKED_INPUT_MAGIC UINT32_C(0x49424753)
#define SAGEJS_GROEBNER_PACKED_OUTPUT_MAGIC UINT32_C(0x4f424753)
#define SAGEJS_GROEBNER_PACKED_VERSION UINT32_C(1)
#define SAGEJS_GROEBNER_PACKED_F4 UINT32_C(1)
#define SAGEJS_GROEBNER_PACKED_QQ UINT32_C(2)

enum
{
    SAGEJS_GROEBNER_PACKED_OK = 0,
    SAGEJS_GROEBNER_PACKED_MALFORMED = 1,
    SAGEJS_GROEBNER_PACKED_UNSUPPORTED = 2,
    SAGEJS_GROEBNER_PACKED_ENGINE_FAILURE = 3,
    SAGEJS_GROEBNER_PACKED_OUTPUT_TOO_SMALL = 4,
    SAGEJS_GROEBNER_PACKED_RESULT_LIMIT = 5
};

int sagejs_msolve_f4_packed(
    const uint8_t *input,
    size_t input_length,
    uint8_t *output,
    size_t output_capacity,
    size_t *output_length);

int sagejs_msolve_qq_packed(
    const uint8_t *input,
    size_t input_length,
    uint8_t *output,
    size_t output_capacity,
    size_t *output_length);

#endif
