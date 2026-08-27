#include <node_api.h>
#include <stdint.h>

static napi_value add_i32(napi_env env, napi_callback_info info) {
    napi_value arguments[2];
    size_t argument_count = 2;
    int32_t left;
    int32_t right;
    napi_value result;

    if (napi_get_cb_info(env, info, &argument_count, arguments, NULL, NULL) != napi_ok ||
        argument_count != 2 ||
        napi_get_value_int32(env, arguments[0], &left) != napi_ok ||
        napi_get_value_int32(env, arguments[1], &right) != napi_ok ||
        napi_create_int32(env, (int32_t)((uint32_t)left + (uint32_t)right), &result) != napi_ok) {
        napi_throw_type_error(env, NULL, "add_i32 requires exactly two int32 values");
        return NULL;
    }
    return result;
}

NAPI_MODULE_INIT() {
    napi_property_descriptor property = {
        "add_i32", NULL, add_i32, NULL, NULL, NULL, napi_default, NULL,
    };
    if (napi_define_properties(env, exports, 1, &property) != napi_ok) {
        napi_throw_error(env, NULL, "failed to export add_i32");
        return NULL;
    }
    return exports;
}
