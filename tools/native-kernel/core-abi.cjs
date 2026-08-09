"use strict";

const HOST_ABI_VERSION = 1;

function generateStatusDeclarations() {
  return `typedef enum
{
    SAGEJS_NATIVE_OK = 0,
    SAGEJS_NATIVE_ERROR = 1,
    SAGEJS_NATIVE_TYPE_ERROR = 2,
    SAGEJS_NATIVE_RANGE_ERROR = 3
} sagejs_native_status_code;

typedef struct
{
    sagejs_native_status_code code;
    const char *message;
} sagejs_native_status;`;
}

function generateStatusRuntime() {
  return `static void sagejs_native_status_set(
    sagejs_native_status *status,
    sagejs_native_status_code code,
    const char *message)
{
    if (status != NULL && status->code == SAGEJS_NATIVE_OK)
    {
        status->code = code;
        status->message = message;
    }
}

static void sagejs_native_status_reset(sagejs_native_status *status)
{
    if (status != NULL)
    {
        status->code = SAGEJS_NATIVE_OK;
        status->message = NULL;
    }
}`;
}

function generateNodeStatusAdapter() {
  return `static void sagejs_native_throw_status(
    napi_env env, const sagejs_native_status *status)
{
    const char *message = status != NULL && status->message != NULL
        ? status->message : "native kernel failed";
    if (status != NULL && status->code == SAGEJS_NATIVE_TYPE_ERROR)
        napi_throw_type_error(env, NULL, message);
    else if (status != NULL && status->code == SAGEJS_NATIVE_RANGE_ERROR)
        napi_throw_range_error(env, NULL, message);
    else
        napi_throw_error(env, NULL, message);
}`;
}

const FORBIDDEN_HOST_APIS = Object.freeze([
  ["Node-API", /\bnapi_/],
  ["Node header", /node_api/],
  ["CPython API", /\b(?:PyObject|Py_|_Py)/],
  ["JavaScript engine API", /\b(?:JSValue|v8::)/],
]);

function auditHostCore(source, options = {}) {
  const violations = FORBIDDEN_HOST_APIS
    .filter(([_name, pattern]) => pattern.test(source))
    .map(([name]) => name);
  if (violations.length > 0) {
    throw new Error(`host-isolation audit failed: ${violations.join(", ")}`);
  }
  return {
    isolated: true,
    boundary: "packed-c-abi",
    hostAbiVersion: HOST_ABI_VERSION,
    hostCallbacks: 0,
    forbiddenApis: FORBIDDEN_HOST_APIS.map(([name]) => name),
    nativeDependencies: options.nativeDependencies || ["libc", "libm"],
    functions: options.functions || [],
    kernelKinds: options.kernelKinds || [],
  };
}

module.exports = {
  HOST_ABI_VERSION,
  auditHostCore,
  generateNodeStatusAdapter,
  generateStatusDeclarations,
  generateStatusRuntime,
};
