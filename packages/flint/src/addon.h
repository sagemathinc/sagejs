#ifndef SAGEJS_FLINT_ADDON_H
#define SAGEJS_FLINT_ADDON_H

#include <node_api.h>

#include <sagejs/hyperelliptic/rforest.h>
#include <sagejs/hyperelliptic/smalljac.h>

/* Stable Node adapter names and the numeric statuses they return are declared
 * here so standalone/native tests do not infer the contract from addon.c. */
#define SAGEJS_SMALLJAC_LPOLY_EXPORT "smalljacLpolyBatch"
#define SAGEJS_SMALLJAC_GROUP_EXPORT "smalljacGroupBatch"
#define SAGEJS_SMALLJAC_CAPABILITIES_EXPORT "smalljacCapabilities"
#define SAGEJS_RFOREST_BATCH_EXPORT "rforestHasseWittBatch"
#define SAGEJS_RFOREST_CAPABILITIES_EXPORT "rforestCapabilities"

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
