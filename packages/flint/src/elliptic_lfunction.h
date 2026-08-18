#ifndef SAGEJS_ELLIPTIC_LFUNCTION_H
#define SAGEJS_ELLIPTIC_LFUNCTION_H

#include <node_api.h>

#ifdef __cplusplus
extern "C" {
#endif

napi_value sagejs_ec_completed_central_derivatives(
    napi_env env, napi_callback_info info);

#ifdef __cplusplus
}
#endif

#endif
