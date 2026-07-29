#ifndef SAGEJS_FLOATING_H
#define SAGEJS_FLOATING_H

#include <node_api.h>

napi_value sagejs_real_from_string(napi_env env, napi_callback_info info);
napi_value sagejs_real_from_bigint(napi_env env, napi_callback_info info);
napi_value sagejs_real_from_rational(napi_env env, napi_callback_info info);
napi_value sagejs_real_round(napi_env env, napi_callback_info info);
napi_value sagejs_real_add(napi_env env, napi_callback_info info);
napi_value sagejs_real_sub(napi_env env, napi_callback_info info);
napi_value sagejs_real_mul(napi_env env, napi_callback_info info);
napi_value sagejs_real_div(napi_env env, napi_callback_info info);
napi_value sagejs_real_neg(napi_env env, napi_callback_info info);
napi_value sagejs_real_pow_int(napi_env env, napi_callback_info info);
napi_value sagejs_real_equal(napi_env env, napi_callback_info info);
napi_value sagejs_real_to_string(napi_env env, napi_callback_info info);
napi_value sagejs_real_to_double(napi_env env, napi_callback_info info);
napi_value sagejs_real_precision(napi_env env, napi_callback_info info);

napi_value sagejs_complex_from_reals(napi_env env, napi_callback_info info);
napi_value sagejs_complex_round(napi_env env, napi_callback_info info);
napi_value sagejs_complex_add(napi_env env, napi_callback_info info);
napi_value sagejs_complex_sub(napi_env env, napi_callback_info info);
napi_value sagejs_complex_mul(napi_env env, napi_callback_info info);
napi_value sagejs_complex_div(napi_env env, napi_callback_info info);
napi_value sagejs_complex_neg(napi_env env, napi_callback_info info);
napi_value sagejs_complex_pow_int(napi_env env, napi_callback_info info);
napi_value sagejs_complex_equal(napi_env env, napi_callback_info info);
napi_value sagejs_complex_to_string(napi_env env, napi_callback_info info);
napi_value sagejs_complex_precision(napi_env env, napi_callback_info info);
napi_value sagejs_complex_real(napi_env env, napi_callback_info info);
napi_value sagejs_complex_imag(napi_env env, napi_callback_info info);
napi_value sagejs_complex_real_double(napi_env env, napi_callback_info info);
napi_value sagejs_complex_imag_double(napi_env env, napi_callback_info info);
napi_value sagejs_complex_ei(napi_env env, napi_callback_info info);
napi_value sagejs_zeta_zeros(napi_env env, napi_callback_info info);

#endif
