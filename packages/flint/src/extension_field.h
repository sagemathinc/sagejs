#ifndef SAGEJS_EXTENSION_FIELD_H
#define SAGEJS_EXTENSION_FIELD_H

#include <node_api.h>

napi_value sagejs_fq_context(napi_env env, napi_callback_info info);
napi_value sagejs_fq_context_modulus(napi_env env, napi_callback_info info);
napi_value sagejs_fq_from_bigint(napi_env env, napi_callback_info info);
napi_value sagejs_fq_gen(napi_env env, napi_callback_info info);
napi_value sagejs_fq_add(napi_env env, napi_callback_info info);
napi_value sagejs_fq_sub(napi_env env, napi_callback_info info);
napi_value sagejs_fq_mul(napi_env env, napi_callback_info info);
napi_value sagejs_fq_div(napi_env env, napi_callback_info info);
napi_value sagejs_fq_neg(napi_env env, napi_callback_info info);
napi_value sagejs_fq_pow(napi_env env, napi_callback_info info);
napi_value sagejs_fq_equal(napi_env env, napi_callback_info info);
napi_value sagejs_fq_is_zero(napi_env env, napi_callback_info info);
napi_value sagejs_fq_is_one(napi_env env, napi_callback_info info);
napi_value sagejs_fq_to_string(napi_env env, napi_callback_info info);

#endif
