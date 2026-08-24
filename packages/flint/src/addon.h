#ifndef SAGEJS_FLINT_ADDON_H
#define SAGEJS_FLINT_ADDON_H

#include <node_api.h>

#include <sagejs/hyperelliptic/rforest.h>
#include <sagejs/hyperelliptic/smalljac.h>

#include "hyperelliptic/genus3_jacobian_addon.h"
#include "hyperelliptic/period_quadrature.h"

napi_value sagejs_smalljac_lpoly_batch_value(
    napi_env env, napi_callback_info info);
napi_value sagejs_smalljac_group_batch_value(
    napi_env env, napi_callback_info info);
napi_value sagejs_smalljac_capabilities_value(
    napi_env env, napi_callback_info info);
napi_value sagejs_rforest_hasse_witt_batch_value(
    napi_env env, napi_callback_info info);
napi_value sagejs_rforest_capabilities_value(
    napi_env env, napi_callback_info info);

#endif
