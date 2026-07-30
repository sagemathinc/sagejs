#ifndef SAGEJS_MULTIVARIATE_H
#define SAGEJS_MULTIVARIATE_H

#include <node_api.h>

napi_value sagejs_mpoly_context(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_constant(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_gen(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_add(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_sub(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_mul(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_neg(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_pow(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_equal(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_divexact(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_gcd(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_compose_gen(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_to_string(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_length(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_degree(napi_env env, napi_callback_info info);
napi_value sagejs_mpoly_total_degree(napi_env env, napi_callback_info info);

#endif
