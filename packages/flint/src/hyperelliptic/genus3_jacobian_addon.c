#include <limits.h>
#include <stdint.h>
#include <string.h>

#include <node_api.h>

#include <sagejs/hyperelliptic/genus3_jacobian.h>

#include "genus3_jacobian_addon.h"

static int check_napi(napi_env env, napi_status status)
{
    const napi_extended_error_info *info;
    if (status == napi_ok)
        return 1;
    napi_get_last_error_info(env, &info);
    napi_throw_error(
        env, NULL,
        info != NULL && info->error_message != NULL
            ? info->error_message
            : "Node-API call failed");
    return 0;
}

static int bigint_to_uint64(napi_env env, napi_value value, uint64_t *output)
{
    bool lossless;
    if (!check_napi(
            env, napi_get_value_bigint_uint64(env, value, output, &lossless)))
        return 0;
    if (!lossless)
    {
        napi_throw_range_error(env, NULL, "BigInt does not fit uint64");
        return 0;
    }
    return 1;
}

static int bigint_to_integer(
    napi_env env,
    napi_value value,
    sagejs_g3j_integer *output)
{
    uint64_t words[2] = {0, 0};
    size_t count = 0;
    int sign = 0;
    memset(output, 0, sizeof(*output));
    if (!check_napi(
            env,
            napi_get_value_bigint_words(env, value, NULL, &count, NULL)))
        return 0;
    if (sign || count > 2)
    {
        napi_throw_range_error(
            env, NULL,
            "integer must be nonnegative and fit the 128-bit genus-3 "
            "Jacobian domain");
        return 0;
    }
    if (count == 0)
        return 1;
    if (!check_napi(
            env,
            napi_get_value_bigint_words(env, value, &sign, &count, words)))
        return 0;
    for (size_t index = 0; index < count; index += 1)
    {
        uint64_t word = words[count - index - 1];
        for (size_t byte = 0; byte < 8; byte += 1)
            output->bytes[8 * index + byte] =
                (uint8_t) (word >> (56 - 8 * byte));
    }
    output->length = (uint8_t) (8 * count);
    while (output->length > 0 && output->bytes[0] == 0)
    {
        memmove(
            output->bytes, output->bytes + 1,
            SAGEJS_G3J_INTEGER_BYTES - 1);
        output->bytes[SAGEJS_G3J_INTEGER_BYTES - 1] = 0;
        output->length -= 1;
    }
    return 1;
}

static napi_value integer_to_bigint(
    napi_env env,
    const sagejs_g3j_integer *input)
{
    uint64_t words[2] = {0, 0};
    size_t count = (input->length + 7) / 8;
    size_t first = input->length % 8;
    size_t position = 0;
    napi_value result;
    if (first == 0 && input->length != 0)
        first = 8;
    for (size_t word_index = count; word_index > 0; word_index -= 1)
    {
        size_t width = position == 0 ? first : 8;
        uint64_t word = 0;
        for (size_t byte = 0; byte < width; byte += 1)
            word = (word << 8) | input->bytes[position++];
        words[word_index - 1] = word;
    }
    if (!check_napi(
            env, napi_create_bigint_words(env, 0, count, words, &result)))
        return NULL;
    return result;
}

static int typed_u64(
    napi_env env,
    napi_value value,
    size_t expected,
    const uint64_t **data)
{
    bool is_array;
    napi_typedarray_type type;
    size_t length;
    napi_value buffer;
    size_t offset;
    if (!check_napi(env, napi_is_typedarray(env, value, &is_array)))
        return 0;
    if (!is_array || !check_napi(
            env,
            napi_get_typedarray_info(
                env, value, &type, &length, (void **) data, &buffer, &offset)))
        return 0;
    if (type != napi_biguint64_array || length != expected)
    {
        napi_throw_type_error(env, NULL, "invalid packed BigUint64Array length");
        return 0;
    }
    return 1;
}

static int set_property(
    napi_env env,
    napi_value object,
    const char *name,
    napi_value value)
{
    return value != NULL && check_napi(
        env, napi_set_named_property(env, object, name, value));
}

static int set_uint64(
    napi_env env,
    napi_value object,
    const char *name,
    uint64_t number)
{
    napi_value value;
    return check_napi(env, napi_create_bigint_uint64(env, number, &value)) &&
        set_property(env, object, name, value);
}

static int set_int32(
    napi_env env,
    napi_value object,
    const char *name,
    int32_t number)
{
    napi_value value;
    return check_napi(env, napi_create_int32(env, number, &value)) &&
        set_property(env, object, name, value);
}

napi_value sagejs_g3j_capabilities_value(
    napi_env env, napi_callback_info info)
{
    napi_value result, statuses, value;
    (void) info;
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env, napi_get_boolean(env, true, &value)) ||
        !set_property(env, result, "available", value) ||
        !set_uint64(env, result, "primeUpperBound", SAGEJS_G3J_MAX_PRIME) ||
        !set_int32(env, result, "integerBytes", SAGEJS_G3J_INTEGER_BYTES) ||
        !check_napi(
            env, napi_create_string_utf8(
                env, "odd-degree-generalized", NAPI_AUTO_LENGTH, &value)) ||
        !set_property(env, result, "model", value) ||
        !check_napi(env, napi_create_object(env, &statuses)) ||
        !set_int32(env, statuses, "OK", SAGEJS_G3J_OK) ||
        !set_int32(env, statuses, "NOT_FOUND", SAGEJS_G3J_NOT_FOUND) ||
        !set_int32(
            env, statuses, "RESOURCE_LIMIT", SAGEJS_G3J_RESOURCE_LIMIT) ||
        !set_int32(env, statuses, "CANCELLED", SAGEJS_G3J_CANCELLED) ||
        !set_int32(
            env, statuses, "INVALID_ARGUMENT",
            SAGEJS_G3J_INVALID_ARGUMENT) ||
        !set_int32(env, statuses, "INVALID_MODEL", SAGEJS_G3J_INVALID_MODEL) ||
        !set_int32(
            env, statuses, "INVALID_DIVISOR",
            SAGEJS_G3J_INVALID_DIVISOR) ||
        !set_int32(
            env, statuses, "ALLOCATION_FAILED",
            SAGEJS_G3J_ALLOCATION_FAILED) ||
        !set_int32(
            env, statuses, "INTERNAL_ERROR", SAGEJS_G3J_INTERNAL_ERROR) ||
        !set_property(env, result, "statuses", statuses))
        return NULL;
    return result;
}

napi_value sagejs_g3j_search_progression_value(
    napi_env env, napi_callback_info info)
{
    napi_value args[10];
    size_t argc = 10;
    const uint64_t *f, *h, *packed;
    uint64_t prime, count, max_babies, max_operations;
    sagejs_g3j_divisor divisor;
    sagejs_g3j_integer base, stride;
    sagejs_g3j_certificate certificate;
    const _Atomic uint32_t *cancel = NULL;
    napi_value result, diagnostics, factors, value;
    int32_t status;
    if (!check_napi(
            env, napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc != 10)
    {
        napi_throw_type_error(env, NULL, "expected 10 arguments");
        return NULL;
    }
    if (!bigint_to_uint64(env, args[0], &prime) ||
        !typed_u64(env, args[1], 8, &f) ||
        !typed_u64(env, args[2], 4, &h) ||
        !typed_u64(env, args[3], 8, &packed) ||
        !bigint_to_integer(env, args[4], &base) ||
        !bigint_to_integer(env, args[5], &stride) ||
        !bigint_to_uint64(env, args[6], &count) ||
        !bigint_to_uint64(env, args[7], &max_babies) ||
        !bigint_to_uint64(env, args[8], &max_operations))
        return NULL;
    if (packed[0] > 3)
    {
        napi_throw_range_error(env, NULL, "packed divisor degree exceeds 3");
        return NULL;
    }
    memset(&divisor, 0, sizeof(divisor));
    divisor.u_degree = (uint8_t) packed[0];
    memcpy(divisor.u, packed + 1, 4 * sizeof(uint64_t));
    memcpy(divisor.v, packed + 5, 3 * sizeof(uint64_t));
    {
        napi_valuetype cancel_type;
        if (!check_napi(env, napi_typeof(env, args[9], &cancel_type)))
            return NULL;
        if (cancel_type != napi_undefined && cancel_type != napi_null)
        {
            bool is_array;
            napi_typedarray_type type;
            size_t length, offset;
            napi_value buffer;
            if (!check_napi(env, napi_is_typedarray(env, args[9], &is_array)) ||
                !is_array || !check_napi(
                    env, napi_get_typedarray_info(
                        env, args[9], &type, &length, (void **) &cancel,
                        &buffer, &offset)) ||
                type != napi_uint32_array || length < 1)
            {
                napi_throw_type_error(
                    env, NULL, "cancel must be a Uint32Array or undefined");
                return NULL;
            }
        }
    }

    status = sagejs_g3j_search_progression(
        prime, f, h, &divisor, &base, &stride, count, max_babies,
        max_operations, cancel, &certificate);
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env, napi_create_int32(env, status, &value)) ||
        !set_property(env, result, "status", value) ||
        !check_napi(
            env,
            napi_create_string_utf8(
                env, sagejs_g3j_status_name(status), NAPI_AUTO_LENGTH,
                &value)) ||
        !set_property(env, result, "statusName", value) ||
        !set_property(
            env, result, "annihilatingMultiple",
            integer_to_bigint(env, &certificate.annihilating_multiple)) ||
        !set_property(
            env, result, "elementOrder",
            integer_to_bigint(env, &certificate.element_order)) ||
        !check_napi(
            env, napi_create_array_with_length(
                env, certificate.factor_count, &factors)))
        return NULL;
    for (uint8_t index = 0; index < certificate.factor_count; index += 1)
    {
        napi_value factor, exponent;
        if (!check_napi(env, napi_create_array_with_length(env, 2, &factor)) ||
            !check_napi(
                env, napi_set_element(
                    env, factor, 0,
                    integer_to_bigint(env, certificate.factor_primes + index))) ||
            !check_napi(
                env, napi_create_uint32(
                    env, certificate.factor_exponents[index], &exponent)) ||
            !check_napi(env, napi_set_element(env, factor, 1, exponent)) ||
            !check_napi(env, napi_set_element(env, factors, index, factor)))
            return NULL;
    }
    if (!set_property(env, result, "factorization", factors) ||
        !check_napi(env, napi_create_object(env, &diagnostics)) ||
        !set_uint64(
            env, diagnostics, "groupOperations",
            certificate.diagnostics.group_operations) ||
        !set_uint64(
            env, diagnostics, "scalarBits",
            certificate.diagnostics.scalar_bits) ||
        !set_uint64(
            env, diagnostics, "babySteps",
            certificate.diagnostics.baby_steps) ||
        !set_uint64(
            env, diagnostics, "giantSteps",
            certificate.diagnostics.giant_steps) ||
        !set_uint64(
            env, diagnostics, "hashCollisions",
            certificate.diagnostics.hash_collisions) ||
        !set_property(env, result, "diagnostics", diagnostics))
        return NULL;
    return result;
}
