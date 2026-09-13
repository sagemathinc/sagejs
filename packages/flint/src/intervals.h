#ifndef SAGEJS_INTERVALS_H
#define SAGEJS_INTERVALS_H

#include <node_api.h>

napi_value sagejs_real_interval_from_rational(
    napi_env env, napi_callback_info info);
napi_value sagejs_real_interval_from_bounds(
    napi_env env, napi_callback_info info);
napi_value sagejs_real_interval_round(napi_env env, napi_callback_info info);
napi_value sagejs_real_interval_binary(napi_env env, napi_callback_info info);
napi_value sagejs_real_interval_unary(napi_env env, napi_callback_info info);
napi_value sagejs_real_interval_pow_int(napi_env env, napi_callback_info info);
napi_value sagejs_real_interval_relation(napi_env env, napi_callback_info info);
napi_value sagejs_real_interval_part(napi_env env, napi_callback_info info);
napi_value sagejs_real_interval_to_string(napi_env env, napi_callback_info info);
napi_value sagejs_real_interval_precision(napi_env env, napi_callback_info info);

napi_value sagejs_complex_interval_from_parts(
    napi_env env, napi_callback_info info);
napi_value sagejs_complex_interval_round(napi_env env, napi_callback_info info);
napi_value sagejs_complex_interval_binary(napi_env env, napi_callback_info info);
napi_value sagejs_complex_interval_unary(napi_env env, napi_callback_info info);
napi_value sagejs_complex_interval_pow_int(
    napi_env env, napi_callback_info info);
napi_value sagejs_complex_interval_relation(
    napi_env env, napi_callback_info info);
napi_value sagejs_complex_interval_part(napi_env env, napi_callback_info info);
napi_value sagejs_complex_interval_to_string(
    napi_env env, napi_callback_info info);
napi_value sagejs_complex_interval_precision(
    napi_env env, napi_callback_info info);

#endif
