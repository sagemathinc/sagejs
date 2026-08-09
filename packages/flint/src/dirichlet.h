#ifndef SAGEJS_DIRICHLET_H
#define SAGEJS_DIRICHLET_H

#include <node_api.h>
#include <flint/dirichlet.h>

int sagejs_dirichlet_character_init_native(
    napi_env env,
    napi_value group_value,
    napi_value index_value,
    const dirichlet_group_struct **group,
    dirichlet_char_t character);

napi_value sagejs_dirichlet_group(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_group_close(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_group_data(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_character_data(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_character_exponent(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_character_exponents(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_gauss_sum_exact(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_gauss_sum(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_jacobi_sum_exact(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_jacobi_sum(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_root_number(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_l_value(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_bernoulli(
    napi_env env, napi_callback_info info);

#endif
