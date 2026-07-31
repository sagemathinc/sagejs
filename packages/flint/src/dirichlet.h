#ifndef SAGEJS_DIRICHLET_H
#define SAGEJS_DIRICHLET_H

#include <node_api.h>

napi_value sagejs_dirichlet_group(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_group_data(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_character_data(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_character_exponent(
    napi_env env, napi_callback_info info);
napi_value sagejs_dirichlet_character_exponents(
    napi_env env, napi_callback_info info);

#endif
