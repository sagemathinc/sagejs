#ifndef SAGEJS_ECLIB_RANK_H
#define SAGEJS_ECLIB_RANK_H

#include <node_api.h>

#ifdef __cplusplus
extern "C" {
#endif

napi_value sagejs_ec_rank_data(napi_env env, napi_callback_info info);
napi_value sagejs_ec_root_number(napi_env env, napi_callback_info info);

#ifdef __cplusplus
}
#endif

#endif
