/* Thin wasm32 adapter for the shared packed Arb/Acb analytic core. */

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

#include "analytic_batch_core.h"

#define ANALYTIC_MAX_INPUT_CAPACITY (UINT32_C(8) * 1024 * 1024)
#define ANALYTIC_MAX_OUTPUT_CAPACITY (UINT32_C(64) * 1024 * 1024)

static uint8_t *analytic_input;
static uint8_t *analytic_output;
static uint32_t analytic_input_capacity;
static uint32_t analytic_output_capacity;
static uint32_t analytic_output_length;

uint8_t *sagejs_analytic_input(void)
{
    return analytic_input;
}

uint32_t sagejs_analytic_input_capacity(void)
{
    return analytic_input_capacity;
}

uint8_t *sagejs_analytic_output(void)
{
    return analytic_output;
}

uint32_t sagejs_analytic_output_capacity(void)
{
    return analytic_output_capacity;
}

uint32_t sagejs_analytic_output_length(void)
{
    return analytic_output_length;
}

uint32_t sagejs_analytic_max_input_capacity(void)
{
    return ANALYTIC_MAX_INPUT_CAPACITY;
}

uint32_t sagejs_analytic_max_output_capacity(void)
{
    return ANALYTIC_MAX_OUTPUT_CAPACITY;
}

/*
 * Grow only when requested. New buffers are allocated before the old ones are
 * released, so an allocation failure leaves the previous valid state intact.
 * A successful reserve invalidates earlier views; hosts must reacquire pointers.
 */
uint32_t sagejs_analytic_reserve(
    uint32_t input_capacity, uint32_t output_capacity)
{
    uint8_t *new_input = NULL;
    uint8_t *new_output = NULL;

    analytic_output_length = 0;
    if (input_capacity == 0 || output_capacity < 20 ||
        input_capacity > ANALYTIC_MAX_INPUT_CAPACITY ||
        output_capacity > ANALYTIC_MAX_OUTPUT_CAPACITY)
        return SAGEJS_ANALYTIC_INVALID_REQUEST;
    if (input_capacity <= analytic_input_capacity &&
        output_capacity <= analytic_output_capacity)
        return SAGEJS_ANALYTIC_OK;
    if (input_capacity > analytic_input_capacity)
    {
        new_input = (uint8_t *) malloc(input_capacity);
        if (new_input == NULL)
            return SAGEJS_ANALYTIC_ALLOCATION_FAILED;
    }
    if (output_capacity > analytic_output_capacity)
    {
        new_output = (uint8_t *) malloc(output_capacity);
        if (new_output == NULL)
        {
            free(new_input);
            return SAGEJS_ANALYTIC_ALLOCATION_FAILED;
        }
    }
    if (new_input != NULL)
    {
        free(analytic_input);
        analytic_input = new_input;
        analytic_input_capacity = input_capacity;
    }
    if (new_output != NULL)
    {
        free(analytic_output);
        analytic_output = new_output;
        analytic_output_capacity = output_capacity;
    }
    return SAGEJS_ANALYTIC_OK;
}

void sagejs_analytic_release(void)
{
    free(analytic_output);
    free(analytic_input);
    analytic_output = NULL;
    analytic_input = NULL;
    analytic_input_capacity = 0;
    analytic_output_capacity = 0;
    analytic_output_length = 0;
}

/*
 * The i64 parameters deliberately remain fixed-width WebAssembly i64 values;
 * JavaScript calls this export with BigInt and no precision is lost on wasm32.
 */
uint32_t sagejs_analytic_execute_request(
    uint32_t input_length,
    uint32_t operation,
    uint32_t point_count,
    uint32_t precision_bits,
    uint32_t derivative,
    uint32_t first_order,
    uint32_t result_count,
    uint32_t flags,
    uint64_t modulus,
    uint64_t character_index,
    int64_t discriminant)
{
    sagejs_analytic_request request;
    sagejs_analytic_status status;
    size_t output_length = 0;

    analytic_output_length = 0;
    if (analytic_input == NULL || analytic_output == NULL ||
        input_length > analytic_input_capacity)
        return SAGEJS_ANALYTIC_INVALID_INPUT;
    request.version = SAGEJS_ANALYTIC_PROTOCOL_VERSION;
    request.operation = operation;
    request.point_count = point_count;
    request.precision_bits = precision_bits;
    request.derivative = derivative;
    request.first_order = first_order;
    request.result_count = result_count;
    request.flags = flags;
    request.modulus = modulus;
    request.character_index = character_index;
    request.discriminant = discriminant;
    status = sagejs_analytic_execute(
        &request,
        analytic_input,
        input_length,
        analytic_output,
        analytic_output_capacity,
        &output_length);
    if (status == SAGEJS_ANALYTIC_OK)
        analytic_output_length = (uint32_t) output_length;
    return (uint32_t) status;
}
