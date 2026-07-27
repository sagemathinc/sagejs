#ifndef SAGEJS_NATIVE_H
#define SAGEJS_NATIVE_H

/*
 * Shared native element ABI for Sage.js native addons and generated kernels.
 *
 * ABI version 1 intentionally exposes only opaque MPFR/MPC storage ownership,
 * Node-API wrapping, and checked unwrapping. Mathematical parents and
 * coercions remain in the Sage.js runtime.
 */

#include <stdint.h>
#include <stdlib.h>

#include <node_api.h>
#include <mpc.h>
#include <mpfr.h>

#define SAGEJS_NATIVE_ABI_VERSION 1
#define SAGEJS_REAL_MAGIC UINT64_C(0x534147454A535252)
#define SAGEJS_COMPLEX_MAGIC UINT64_C(0x534147454A534343)

typedef struct
{
    uint64_t magic;
    mpfr_t value;
} sagejs_real;

typedef struct
{
    uint64_t magic;
    mpc_t value;
} sagejs_complex;

static const napi_type_tag sagejs_real_type_tag = {
    UINT64_C(0xa4b095178be44412),
    UINT64_C(0xb77dd488e7a725e1)
};

static const napi_type_tag sagejs_complex_type_tag = {
    UINT64_C(0xbde856381fd245b2),
    UINT64_C(0x889323467057a9cf)
};

static inline int sagejs_native_check_napi(
    napi_env env, napi_status status)
{
    const napi_extended_error_info *info;

    if (status == napi_ok)
        return 1;
    napi_get_last_error_info(env, &info);
    napi_throw_error(env, NULL,
        info != NULL && info->error_message != NULL
            ? info->error_message
            : "Node-API call failed");
    return 0;
}

static inline void sagejs_native_finalize_real(
    napi_env env, void *data, void *hint)
{
    sagejs_real *real = (sagejs_real *) data;
    (void) env;
    (void) hint;

    if (real != NULL && real->magic == SAGEJS_REAL_MAGIC)
    {
        mpfr_clear(real->value);
        real->magic = 0;
        free(real);
    }
}

static inline void sagejs_native_finalize_complex(
    napi_env env, void *data, void *hint)
{
    sagejs_complex *complex = (sagejs_complex *) data;
    (void) env;
    (void) hint;

    if (complex != NULL && complex->magic == SAGEJS_COMPLEX_MAGIC)
    {
        mpc_clear(complex->value);
        complex->magic = 0;
        free(complex);
    }
}

static inline sagejs_real *sagejs_native_new_real(
    napi_env env, mpfr_prec_t precision)
{
    sagejs_real *real = (sagejs_real *) malloc(sizeof(*real));

    if (real == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate an MPFR value");
        return NULL;
    }
    real->magic = SAGEJS_REAL_MAGIC;
    mpfr_init2(real->value, precision);
    return real;
}

static inline sagejs_complex *sagejs_native_new_complex(
    napi_env env, mpfr_prec_t precision)
{
    sagejs_complex *complex = (sagejs_complex *) malloc(sizeof(*complex));

    if (complex == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate an MPC value");
        return NULL;
    }
    complex->magic = SAGEJS_COMPLEX_MAGIC;
    mpc_init2(complex->value, precision);
    return complex;
}

static inline napi_value sagejs_native_wrap_real(
    napi_env env, sagejs_real *real)
{
    napi_value object;

    if (!sagejs_native_check_napi(env, napi_create_object(env, &object)))
    {
        sagejs_native_finalize_real(env, real, NULL);
        return NULL;
    }
    if (!sagejs_native_check_napi(env,
        napi_wrap(env, object, real, sagejs_native_finalize_real,
            NULL, NULL)))
    {
        sagejs_native_finalize_real(env, real, NULL);
        return NULL;
    }
    if (!sagejs_native_check_napi(
        env, napi_type_tag_object(env, object, &sagejs_real_type_tag)))
        return NULL;
    return object;
}

static inline napi_value sagejs_native_wrap_complex(
    napi_env env, sagejs_complex *complex)
{
    napi_value object;

    if (!sagejs_native_check_napi(env, napi_create_object(env, &object)))
    {
        sagejs_native_finalize_complex(env, complex, NULL);
        return NULL;
    }
    if (!sagejs_native_check_napi(env,
        napi_wrap(env, object, complex, sagejs_native_finalize_complex,
            NULL, NULL)))
    {
        sagejs_native_finalize_complex(env, complex, NULL);
        return NULL;
    }
    if (!sagejs_native_check_napi(
        env, napi_type_tag_object(env, object, &sagejs_complex_type_tag)))
        return NULL;
    return object;
}

static inline sagejs_real *sagejs_native_unwrap_real(
    napi_env env, napi_value object)
{
    bool tagged = false;
    sagejs_real *real = NULL;

    if (!sagejs_native_check_napi(env,
        napi_check_object_type_tag(
            env, object, &sagejs_real_type_tag, &tagged)))
        return NULL;
    if (!tagged ||
        !sagejs_native_check_napi(
            env, napi_unwrap(env, object, (void **) &real)) ||
        real == NULL || real->magic != SAGEJS_REAL_MAGIC)
    {
        napi_throw_type_error(env, NULL, "expected a Sage.js MPFR real");
        return NULL;
    }
    return real;
}

static inline sagejs_complex *sagejs_native_unwrap_complex(
    napi_env env, napi_value object)
{
    bool tagged = false;
    sagejs_complex *complex = NULL;

    if (!sagejs_native_check_napi(env,
        napi_check_object_type_tag(
            env, object, &sagejs_complex_type_tag, &tagged)))
        return NULL;
    if (!tagged ||
        !sagejs_native_check_napi(
            env, napi_unwrap(env, object, (void **) &complex)) ||
        complex == NULL || complex->magic != SAGEJS_COMPLEX_MAGIC)
    {
        napi_throw_type_error(env, NULL, "expected a Sage.js MPC complex");
        return NULL;
    }
    return complex;
}

#endif
