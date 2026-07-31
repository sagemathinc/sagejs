#ifndef SAGEJS_P1_H
#define SAGEJS_P1_H

#include <node_api.h>

napi_value sagejs_p1list(napi_env env, napi_callback_info info);
napi_value sagejs_p1list_level(napi_env env, napi_callback_info info);
napi_value sagejs_p1list_count(napi_env env, napi_callback_info info);
napi_value sagejs_p1list_entry(napi_env env, napi_callback_info info);
napi_value sagejs_p1list_normalize(napi_env env, napi_callback_info info);
napi_value sagejs_p1list_index(napi_env env, napi_callback_info info);
napi_value sagejs_p1list_apply_i(napi_env env, napi_callback_info info);
napi_value sagejs_p1list_apply_s(napi_env env, napi_callback_info info);
napi_value sagejs_p1list_apply_r(napi_env env, napi_callback_info info);
napi_value sagejs_p1list_apply_t(napi_env env, napi_callback_info info);
napi_value sagejs_p1list_manin_relations(
    napi_env env, napi_callback_info info);
napi_value sagejs_manin_relations_info(
    napi_env env, napi_callback_info info);
napi_value sagejs_manin_relations_row(
    napi_env env, napi_callback_info info);
napi_value sagejs_manin_relations_rank(
    napi_env env, napi_callback_info info);

#endif
