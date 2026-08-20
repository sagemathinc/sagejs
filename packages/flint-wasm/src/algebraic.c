#include <stdint.h>
#include <string.h>

#include "../../flint/src/algebraic_core.h"

#define EXPORT __attribute__((visibility("default")))
#define BUFFER_CAPACITY SAGEJS_ALGEBRAIC_MAX_PACKED_BYTES
#define ROOT_CAPACITY SAGEJS_ALGEBRAIC_MAX_DEGREE

static sagejs_algebraic_context *context = NULL;
static uint8_t input_buffer[BUFFER_CAPACITY];
static uint8_t output_buffer[BUFFER_CAPACITY];
static uint32_t root_handles[ROOT_CAPACITY];
static uint32_t root_multiplicities[ROOT_CAPACITY];
static uint32_t output_length = 0;
static uint32_t result_count = 0;
static uint32_t result_handle = 0;
static int32_t result_value = 0;
static int32_t last_status = SAGEJS_ALGEBRAIC_OK;

static int ensure_context(void)
{
    if (context != NULL)
        return 1;
    context = sagejs_algebraic_context_create();
    if (context == NULL)
    {
        last_status = SAGEJS_ALGEBRAIC_ALLOCATION_FAILED;
        return 0;
    }
    return 1;
}

EXPORT uint32_t sagejs_wasm_algebraic_input(void)
{
    return (uint32_t) (uintptr_t) input_buffer;
}

EXPORT uint32_t sagejs_wasm_algebraic_input_capacity(void)
{
    return BUFFER_CAPACITY;
}

EXPORT uint32_t sagejs_wasm_algebraic_output(void)
{
    return (uint32_t) (uintptr_t) output_buffer;
}

EXPORT uint32_t sagejs_wasm_algebraic_output_capacity(void)
{
    return BUFFER_CAPACITY;
}

EXPORT uint32_t sagejs_wasm_algebraic_output_length(void)
{
    return output_length;
}

EXPORT uint32_t sagejs_wasm_algebraic_root_handles(void)
{
    return (uint32_t) (uintptr_t) root_handles;
}

EXPORT uint32_t sagejs_wasm_algebraic_root_multiplicities(void)
{
    return (uint32_t) (uintptr_t) root_multiplicities;
}

EXPORT uint32_t sagejs_wasm_algebraic_result_count(void)
{
    return result_count;
}

EXPORT uint32_t sagejs_wasm_algebraic_result_handle(void)
{
    return result_handle;
}

EXPORT int32_t sagejs_wasm_algebraic_result_value(void)
{
    return result_value;
}

EXPORT int32_t sagejs_wasm_algebraic_last_status(void)
{
    return last_status;
}

EXPORT uint32_t sagejs_wasm_algebraic_live_count(void)
{
    return context == NULL ? 0 : sagejs_algebraic_live_count(context);
}

EXPORT int32_t sagejs_wasm_algebraic_initialize(void)
{
    return ensure_context() ? SAGEJS_ALGEBRAIC_OK : last_status;
}

EXPORT void sagejs_wasm_algebraic_clear(void)
{
    sagejs_algebraic_context_destroy(context);
    context = NULL;
    output_length = 0;
    result_count = 0;
    result_handle = 0;
    result_value = 0;
    last_status = SAGEJS_ALGEBRAIC_OK;
}

EXPORT int32_t sagejs_wasm_algebraic_close(uint32_t handle)
{
    if (!ensure_context())
        return last_status;
    last_status = sagejs_algebraic_close(context, handle);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_from_rational(uint32_t length)
{
    if (!ensure_context())
        return last_status;
    if (length > BUFFER_CAPACITY)
        return last_status = SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
    last_status = sagejs_algebraic_from_rational(
        context, input_buffer, length, &result_handle);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_i(void)
{
    if (!ensure_context())
        return last_status;
    last_status = sagejs_algebraic_i(context, &result_handle);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_root_of_unity(
    uint32_t exponent,
    uint32_t order)
{
    if (!ensure_context())
        return last_status;
    last_status = sagejs_algebraic_root_of_unity(
        context, exponent, order, &result_handle);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_unary(uint32_t operation, uint32_t source)
{
    if (!ensure_context())
        return last_status;
    last_status = sagejs_algebraic_unary(
        context, operation, source, &result_handle);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_binary(
    uint32_t operation,
    uint32_t left,
    uint32_t right)
{
    if (!ensure_context())
        return last_status;
    last_status = sagejs_algebraic_binary(
        context, operation, left, right, &result_handle);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_pow(uint32_t source, uint32_t length)
{
    if (!ensure_context())
        return last_status;
    if (length > BUFFER_CAPACITY)
        return last_status = SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
    last_status = sagejs_algebraic_pow(
        context, source, input_buffer, length, &result_handle);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_pow_rational(
    uint32_t source,
    uint32_t length)
{
    if (!ensure_context())
        return last_status;
    if (length > BUFFER_CAPACITY)
        return last_status = SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
    last_status = sagejs_algebraic_pow_rational(
        context, source, input_buffer, length, &result_handle);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_equal(uint32_t left, uint32_t right)
{
    if (!ensure_context())
        return last_status;
    last_status = sagejs_algebraic_equal(
        context, left, right, &result_value);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_compare_real(uint32_t left, uint32_t right)
{
    if (!ensure_context())
        return last_status;
    last_status = sagejs_algebraic_compare_real(
        context, left, right, &result_value);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_property(uint32_t handle, uint32_t property)
{
    if (!ensure_context())
        return last_status;
    last_status = sagejs_algebraic_property_value(
        context, handle, property, &result_value);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_polynomial_roots(uint32_t length)
{
    if (!ensure_context())
        return last_status;
    if (length > BUFFER_CAPACITY)
        return last_status = SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
    last_status = sagejs_algebraic_polynomial_roots(
        context,
        input_buffer,
        length,
        root_handles,
        root_multiplicities,
        ROOT_CAPACITY,
        &result_count);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_minpoly(uint32_t handle)
{
    if (!ensure_context())
        return last_status;
    last_status = sagejs_algebraic_minpoly(
        context,
        handle,
        output_buffer,
        BUFFER_CAPACITY,
        &output_length);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_enclosure(uint32_t handle, uint32_t precision)
{
    if (!ensure_context())
        return last_status;
    last_status = sagejs_algebraic_enclosure(
        context,
        handle,
        precision,
        output_buffer,
        BUFFER_CAPACITY,
        &output_length);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_format(uint32_t handle, uint32_t digits)
{
    if (!ensure_context())
        return last_status;
    last_status = sagejs_algebraic_format(
        context,
        handle,
        digits,
        output_buffer,
        BUFFER_CAPACITY,
        &output_length);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_serialize(uint32_t handle)
{
    if (!ensure_context())
        return last_status;
    last_status = sagejs_algebraic_serialize(
        context,
        handle,
        output_buffer,
        BUFFER_CAPACITY,
        &output_length);
    return last_status;
}

EXPORT int32_t sagejs_wasm_algebraic_deserialize(uint32_t length)
{
    if (!ensure_context())
        return last_status;
    if (length > BUFFER_CAPACITY)
        return last_status = SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
    last_status = sagejs_algebraic_deserialize(
        context, input_buffer, length, &result_handle);
    return last_status;
}
