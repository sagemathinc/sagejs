#ifndef SAGEJS_HYPERELLIPTIC_PERIOD_QUADRATURE_H
#define SAGEJS_HYPERELLIPTIC_PERIOD_QUADRATURE_H

#include <node_api.h>

#ifdef __cplusplus
extern "C" {
#endif

napi_value sagejs_hyperelliptic_period_edge_batch_arb(
    napi_env env, napi_callback_info info);
napi_value sagejs_hyperelliptic_abel_jacobi_batch_arb(
    napi_env env, napi_callback_info info);
napi_value sagejs_hyperelliptic_real_period_arb(
    napi_env env, napi_callback_info info);

#ifdef __cplusplus
}
#endif

#endif
