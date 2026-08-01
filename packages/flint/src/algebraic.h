#ifndef SAGEJS_ALGEBRAIC_H
#define SAGEJS_ALGEBRAIC_H

#include <node_api.h>
#include <flint/qqbar.h>

qqbar_srcptr sagejs_qqbar_unwrap(napi_env env, napi_value object);
napi_value sagejs_qqbar_wrap_copy(napi_env env, const qqbar_t value);

napi_value sagejs_qqbar_from_rational(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_i(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_root_of_unity(
    napi_env env, napi_callback_info info);
napi_value sagejs_cyclotomic_root_coefficients(
    napi_env env, napi_callback_info info);
napi_value sagejs_cyclotomic_element_coefficients(
    napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_add(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_sub(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_mul(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_div(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_neg(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_pow(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_pow_rational(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_sqrt(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_equal(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_compare_real(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_is_real(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_is_rational(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_real(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_imag(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_conjugate(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_abs(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_degree(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_minpoly_coefficients(
    napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_to_string(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_approx(napi_env env, napi_callback_info info);

#endif
