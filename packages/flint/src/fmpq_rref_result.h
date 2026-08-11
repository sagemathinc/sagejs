#ifndef SAGEJS_FLINT_FMPQ_RREF_RESULT_H
#define SAGEJS_FLINT_FMPQ_RREF_RESULT_H

#include <node_api.h>

napi_value sagejs_fmpq_rref_result_create(
    napi_env env, napi_callback_info info);
napi_value sagejs_fmpq_rref_result_close(
    napi_env env, napi_callback_info info);
napi_value sagejs_fmpq_rref_result_compute(
    napi_env env, napi_callback_info info);
napi_value sagejs_fmpq_rref_result_rank(
    napi_env env, napi_callback_info info);
napi_value sagejs_fmpq_rref_result_numerator_word_capacity(
    napi_env env, napi_callback_info info);
napi_value sagejs_fmpq_rref_result_denominator_word_capacity(
    napi_env env, napi_callback_info info);
napi_value sagejs_fmpq_rref_result_export(
    napi_env env, napi_callback_info info);

#endif
