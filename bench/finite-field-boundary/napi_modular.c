#include <node_api.h>
#include <stddef.h>
#include <stdint.h>

static int read_u32(napi_env env, napi_value value, uint32_t *result) {
    return napi_get_value_uint32(env, value, result) == napi_ok;
}

static uint32_t add_mod(uint32_t left, uint32_t right, uint32_t modulus) {
    return (uint32_t)(((uint64_t)left + (uint64_t)right) % modulus);
}

static uint32_t mul_mod(uint32_t left, uint32_t right, uint32_t modulus) {
    return (uint32_t)(((uint64_t)left * (uint64_t)right) % modulus);
}

static uint32_t mul_add_mod(
    uint32_t value,
    uint32_t multiplier,
    uint32_t increment,
    uint32_t modulus
) {
    return (uint32_t)(
        ((uint64_t)value * (uint64_t)multiplier + (uint64_t)increment) % modulus
    );
}

static napi_value return_u32(napi_env env, uint32_t value) {
    napi_value result;
    if (napi_create_uint32(env, value, &result) != napi_ok) return NULL;
    return result;
}

static napi_value add_mod_u32(napi_env env, napi_callback_info info) {
    napi_value arguments[3];
    size_t count = 3;
    uint32_t left, right, modulus;
    if (napi_get_cb_info(env, info, &count, arguments, NULL, NULL) != napi_ok ||
        count != 3 || !read_u32(env, arguments[0], &left) ||
        !read_u32(env, arguments[1], &right) ||
        !read_u32(env, arguments[2], &modulus) || modulus < 2) {
        napi_throw_type_error(env, NULL, "add_mod_u32 requires three uint32 values and modulus >= 2");
        return NULL;
    }
    return return_u32(env, add_mod(left, right, modulus));
}

static napi_value mul_mod_u32(napi_env env, napi_callback_info info) {
    napi_value arguments[3];
    size_t count = 3;
    uint32_t left, right, modulus;
    if (napi_get_cb_info(env, info, &count, arguments, NULL, NULL) != napi_ok ||
        count != 3 || !read_u32(env, arguments[0], &left) ||
        !read_u32(env, arguments[1], &right) ||
        !read_u32(env, arguments[2], &modulus) || modulus < 2) {
        napi_throw_type_error(env, NULL, "mul_mod_u32 requires three uint32 values and modulus >= 2");
        return NULL;
    }
    return return_u32(env, mul_mod(left, right, modulus));
}

static napi_value mul_add_mod_u32(napi_env env, napi_callback_info info) {
    napi_value arguments[4];
    size_t count = 4;
    uint32_t value, multiplier, increment, modulus;
    if (napi_get_cb_info(env, info, &count, arguments, NULL, NULL) != napi_ok ||
        count != 4 || !read_u32(env, arguments[0], &value) ||
        !read_u32(env, arguments[1], &multiplier) ||
        !read_u32(env, arguments[2], &increment) ||
        !read_u32(env, arguments[3], &modulus) || modulus < 2) {
        napi_throw_type_error(env, NULL, "mul_add_mod_u32 requires four uint32 values and modulus >= 2");
        return NULL;
    }
    return return_u32(env, mul_add_mod(value, multiplier, increment, modulus));
}

static napi_value chain_mod_u32(napi_env env, napi_callback_info info) {
    napi_value arguments[5];
    size_t argument_count = 5;
    uint32_t value, multiplier, increment, modulus, count;
    if (napi_get_cb_info(env, info, &argument_count, arguments, NULL, NULL) != napi_ok ||
        argument_count != 5 || !read_u32(env, arguments[0], &value) ||
        !read_u32(env, arguments[1], &multiplier) ||
        !read_u32(env, arguments[2], &increment) ||
        !read_u32(env, arguments[3], &modulus) ||
        !read_u32(env, arguments[4], &count) || modulus < 2) {
        napi_throw_type_error(env, NULL, "chain_mod_u32 requires five uint32 values and modulus >= 2");
        return NULL;
    }
    for (uint32_t index = 0; index < count; index++) {
        value = mul_add_mod(value, multiplier, increment, modulus);
    }
    return return_u32(env, value);
}

static napi_value vector_mul_add_mod_u32(napi_env env, napi_callback_info info) {
    napi_value arguments[4];
    size_t argument_count = 4;
    napi_typedarray_type type;
    size_t length;
    void *data;
    napi_value array_buffer;
    size_t byte_offset;
    uint32_t multiplier, increment, modulus;
    if (napi_get_cb_info(env, info, &argument_count, arguments, NULL, NULL) != napi_ok ||
        argument_count != 4 ||
        napi_get_typedarray_info(
            env, arguments[0], &type, &length, &data, &array_buffer, &byte_offset
        ) != napi_ok ||
        type != napi_uint32_array || !read_u32(env, arguments[1], &multiplier) ||
        !read_u32(env, arguments[2], &increment) ||
        !read_u32(env, arguments[3], &modulus) || modulus < 2) {
        napi_throw_type_error(
            env, NULL,
            "vector_mul_add_mod_u32 requires Uint32Array, multiplier, increment, and modulus"
        );
        return NULL;
    }
    uint32_t *values = (uint32_t *)data;
    uint32_t checksum = 0;
    for (size_t index = 0; index < length; index++) {
        values[index] = mul_add_mod(values[index], multiplier, increment, modulus);
        checksum ^= values[index];
    }
    return return_u32(env, checksum);
}

NAPI_MODULE_INIT() {
    napi_property_descriptor properties[] = {
        {"add_mod_u32", NULL, add_mod_u32, NULL, NULL, NULL, napi_default, NULL},
        {"mul_mod_u32", NULL, mul_mod_u32, NULL, NULL, NULL, napi_default, NULL},
        {"mul_add_mod_u32", NULL, mul_add_mod_u32, NULL, NULL, NULL, napi_default, NULL},
        {"chain_mod_u32", NULL, chain_mod_u32, NULL, NULL, NULL, napi_default, NULL},
        {"vector_mul_add_mod_u32", NULL, vector_mul_add_mod_u32, NULL, NULL, NULL, napi_default, NULL},
    };
    if (napi_define_properties(
        env, exports, sizeof(properties) / sizeof(properties[0]), properties
    ) != napi_ok) {
        napi_throw_error(env, NULL, "failed to export modular benchmark functions");
        return NULL;
    }
    return exports;
}
