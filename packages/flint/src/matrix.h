#ifndef SAGEJS_MATRIX_H
#define SAGEJS_MATRIX_H

#include <node_api.h>

napi_value sagejs_zz_matrix(napi_env env, napi_callback_info info);
napi_value sagejs_qq_matrix(napi_env env, napi_callback_info info);
napi_value sagejs_zz_matrix_to_qq(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_add(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_sub(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_mul(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_neg(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_scalar_mul(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_transpose(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_equal(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_entry(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_det(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_rank(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_solve(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_inverse(napi_env env, napi_callback_info info);

#endif
