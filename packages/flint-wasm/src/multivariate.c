#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

#include "multivariate_wasm_core.h"

#if defined(__wasm__)
#define EXPORT __attribute__((visibility("default")))
#else
#define EXPORT
#endif

static uint8_t *sagejs_mpoly_input_bytes;
static uint8_t *sagejs_mpoly_output_bytes;
static size_t sagejs_mpoly_output_size;

static int sagejs_mpoly_reserve(void)
{
    if (sagejs_mpoly_input_bytes == NULL)
        sagejs_mpoly_input_bytes = malloc(SAGEJS_MPOLY_MAX_INPUT_BYTES);
    if (sagejs_mpoly_output_bytes == NULL)
        sagejs_mpoly_output_bytes = malloc(SAGEJS_MPOLY_MAX_OUTPUT_BYTES);
    return sagejs_mpoly_input_bytes != NULL && sagejs_mpoly_output_bytes != NULL;
}

EXPORT uint8_t *sagejs_wasm_mpoly_input(void)
{
    if (!sagejs_mpoly_reserve())
        return NULL;
    return sagejs_mpoly_input_bytes;
}

EXPORT size_t sagejs_wasm_mpoly_input_capacity(void)
{
    return SAGEJS_MPOLY_MAX_INPUT_BYTES;
}

EXPORT uint8_t *sagejs_wasm_mpoly_output(void)
{
    if (!sagejs_mpoly_reserve())
        return NULL;
    return sagejs_mpoly_output_bytes;
}

EXPORT size_t sagejs_wasm_mpoly_output_capacity(void)
{
    return SAGEJS_MPOLY_MAX_OUTPUT_BYTES;
}

EXPORT size_t sagejs_wasm_mpoly_output_length(void)
{
    return sagejs_mpoly_output_size;
}

EXPORT int sagejs_wasm_mpoly_resultant(size_t input_length)
{
    sagejs_mpoly_output_size = 0;
    if (input_length > SAGEJS_MPOLY_MAX_INPUT_BYTES)
        return SAGEJS_MPOLY_PACKED_UNSUPPORTED;
    if (!sagejs_mpoly_reserve())
        return SAGEJS_MPOLY_PACKED_RESULT_LIMIT;
    return sagejs_fmpz_mpoly_resultant_packed(
        sagejs_mpoly_input_bytes,
        input_length,
        sagejs_mpoly_output_bytes,
        SAGEJS_MPOLY_MAX_OUTPUT_BYTES,
        &sagejs_mpoly_output_size);
}
