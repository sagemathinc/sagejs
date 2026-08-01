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
napi_value sagejs_p1list_manin_presentation_info(
    napi_env env, napi_callback_info info);
napi_value sagejs_p1list_hecke_matrix(
    napi_env env, napi_callback_info info);
napi_value sagejs_p1list_boundary_data(
    napi_env env, napi_callback_info info);
napi_value sagejs_p1list_cuspidal_basis(
    napi_env env, napi_callback_info info);
napi_value sagejs_p1list_star_matrix(
    napi_env env, napi_callback_info info);
napi_value sagejs_p1list_star_eigenspace_basis(
    napi_env env, napi_callback_info info);
napi_value sagejs_p1list_higher_weight_presentation(
    napi_env env, napi_callback_info info);
napi_value sagejs_p1list_higher_weight_hecke_matrix(
    napi_env env, napi_callback_info info);
napi_value sagejs_p1list_character_presentation(
    napi_env env, napi_callback_info info);
napi_value sagejs_p1list_character_hecke_matrix(
    napi_env env, napi_callback_info info);
napi_value sagejs_p1list_reduce_path(
    napi_env env, napi_callback_info info);
napi_value sagejs_p1list_manin_relations(
    napi_env env, napi_callback_info info);
napi_value sagejs_manin_relations_info(
    napi_env env, napi_callback_info info);
napi_value sagejs_manin_relations_row(
    napi_env env, napi_callback_info info);
napi_value sagejs_manin_relations_rank(
    napi_env env, napi_callback_info info);

#endif
