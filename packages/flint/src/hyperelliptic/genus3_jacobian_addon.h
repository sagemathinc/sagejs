#ifndef SAGEJS_GENUS3_JACOBIAN_ADDON_H
#define SAGEJS_GENUS3_JACOBIAN_ADDON_H

#include <node_api.h>

napi_value sagejs_g3j_search_progression_value(
    napi_env env, napi_callback_info info);
napi_value sagejs_g3j_scalar_multiply_value(
    napi_env env, napi_callback_info info);
napi_value sagejs_g3j_sum_value(
    napi_env env, napi_callback_info info);
napi_value sagejs_g3j_capabilities_value(
    napi_env env, napi_callback_info info);

#endif
