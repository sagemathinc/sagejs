#ifndef SAGEJS_NATIVE_H
#define SAGEJS_NATIVE_H

/*
 * Shared native element ABI for Sage.js native addons and generated kernels.
 *
 * ABI version 2 exposes opaque MPFR/MPC ownership plus the shared dense matrix
 * layout needed for zero-copy prime-field kernels. Mathematical parents and
 * coercions remain in the Sage.js runtime.
 */

#include <limits.h>
#include <stdint.h>
#include <stdlib.h>

#if defined(_MSC_VER)
#include <intrin.h>
#endif

#include <node_api.h>
#include <mpc.h>
#include <mpfr.h>

#include <flint/acb_mat.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpz_mat.h>
#include <flint/gr_mat.h>
#include <flint/nmod.h>
#include <flint/nmod_mat.h>

#define SAGEJS_NATIVE_ABI_VERSION 2
#define SAGEJS_REAL_MAGIC UINT64_C(0x534147454A535252)
#define SAGEJS_COMPLEX_MAGIC UINT64_C(0x534147454A534343)
#define SAGEJS_MATRIX_MAGIC UINT64_C(0x534147454A534D41)

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

typedef enum
{
    SAGEJS_MATRIX_ZZ = 1,
    SAGEJS_MATRIX_QQ = 2,
    SAGEJS_MATRIX_NMOD = 3,
    SAGEJS_MATRIX_ZMOD = 4,
    SAGEJS_MATRIX_ACB = 5,
    SAGEJS_MATRIX_QQBAR = 6
} sagejs_matrix_kind;

/*
 * Matrix storage is shared with generated kernels so a kernel can borrow an
 * immutable input nmod_mat and return a freshly owned matrix without copying
 * through JavaScript.  Only SAGEJS_MATRIX_NMOD construction is part of the
 * generated-kernel ABI; the remaining fields preserve the common layout used
 * by the full FLINT addon.
 */
typedef struct
{
    uint64_t magic;
    sagejs_matrix_kind kind;
    fmpz_mat_t integer;
    fmpq_mat_t rational;
    nmod_mat_t modular;
    acb_mat_t approximate;
    gr_mat_t algebraic;
    gr_ctx_t algebraic_context;
    int algebraic_real;
    ulong cyclotomic_order;
    size_t cyclotomic_degree;
    fmpq *cyclotomic_coordinates;
    slong precision;
} sagejs_matrix;

static const napi_type_tag sagejs_real_type_tag = {
    UINT64_C(0xa4b095178be44412),
    UINT64_C(0xb77dd488e7a725e1)
};

static const napi_type_tag sagejs_complex_type_tag = {
    UINT64_C(0xbde856381fd245b2),
    UINT64_C(0x889323467057a9cf)
};

static const napi_type_tag sagejs_matrix_type_tag = {
    UINT64_C(0x198a2dc27f5a47cc),
    UINT64_C(0x98fb02f0ce7f6dc6)
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
    node_api_basic_env env, void *data, void *hint)
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
    node_api_basic_env env, void *data, void *hint)
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

static inline sagejs_matrix *sagejs_native_unwrap_prime_matrix(
    napi_env env, napi_value object)
{
    bool tagged = false;
    sagejs_matrix *matrix = NULL;

    if (!sagejs_native_check_napi(env,
        napi_check_object_type_tag(
            env, object, &sagejs_matrix_type_tag, &tagged)))
        return NULL;
    if (!tagged ||
        !sagejs_native_check_napi(
            env, napi_unwrap(env, object, (void **) &matrix)) ||
        matrix == NULL || matrix->magic != SAGEJS_MATRIX_MAGIC ||
        matrix->kind != SAGEJS_MATRIX_NMOD)
    {
        napi_throw_type_error(env, NULL,
            "expected a dense matrix over a prime field");
        return NULL;
    }
    return matrix;
}

static inline void sagejs_native_finalize_prime_matrix(
    node_api_basic_env env, void *data, void *hint)
{
    sagejs_matrix *matrix = (sagejs_matrix *) data;
    (void) env;
    (void) hint;
    if (matrix != NULL && matrix->magic == SAGEJS_MATRIX_MAGIC &&
        matrix->kind == SAGEJS_MATRIX_NMOD)
    {
        free(matrix->modular->entries);
        matrix->modular->entries = NULL;
        matrix->magic = 0;
        free(matrix);
    }
}

static inline unsigned int sagejs_native_word_clz(ulong value)
{
#if FLINT_BITS == 64
#if defined(_MSC_VER)
    unsigned long index;
    _BitScanReverse64(&index, (unsigned __int64) value);
    return 63U - (unsigned int) index;
#else
    return (unsigned int) __builtin_clzl(value);
#endif
#else
#if defined(_MSC_VER)
    unsigned long index;
    _BitScanReverse(&index, (unsigned long) value);
    return 31U - (unsigned int) index;
#else
    return (unsigned int) __builtin_clzl(value);
#endif
#endif
}

static inline ulong sagejs_native_preinverse_prenorm(ulong divisor)
{
#if FLINT_BITS == 64
#if defined(_MSC_VER)
    unsigned __int64 remainder;
    return (ulong) _udiv128(
        (unsigned __int64) ~divisor,
        UINT64_MAX,
        (unsigned __int64) divisor,
        &remainder);
#else
    const __uint128_t numerator =
        ((__uint128_t) ~divisor << 64) | (__uint128_t) UINT64_MAX;
    return (ulong) (numerator / divisor);
#endif
#else
    const uint64_t numerator =
        ((uint64_t) ~divisor << 32) | (uint64_t) UINT32_MAX;
    return (ulong) (numerator / divisor);
#endif
}

static inline void sagejs_native_init_nmod(nmod_t *modulus, ulong value)
{
    modulus->n = value;
    modulus->norm = sagejs_native_word_clz(value);
    modulus->ninv = sagejs_native_preinverse_prenorm(
        value << modulus->norm);
}

static inline sagejs_matrix *sagejs_native_new_prime_matrix(
    napi_env env, slong rows, slong columns, ulong modulus)
{
    sagejs_matrix *matrix;
    size_t count;
    if (rows < 0 || columns < 0 || modulus < 2)
    {
        napi_throw_range_error(env, NULL,
            "invalid dense prime-field matrix dimensions or modulus");
        return NULL;
    }
    if ((size_t) columns != 0 &&
        (size_t) rows > SIZE_MAX / (size_t) columns)
    {
        napi_throw_range_error(env, NULL,
            "dense prime-field matrix dimensions overflow");
        return NULL;
    }
    count = (size_t) rows * (size_t) columns;
    if (count > SIZE_MAX / sizeof(ulong))
    {
        napi_throw_range_error(env, NULL,
            "dense prime-field matrix dimensions overflow");
        return NULL;
    }
    matrix = (sagejs_matrix *) calloc(1, sizeof(*matrix));
    if (matrix == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate a dense prime-field matrix");
        return NULL;
    }
    matrix->magic = SAGEJS_MATRIX_MAGIC;
    matrix->kind = SAGEJS_MATRIX_NMOD;
    matrix->modular->r = rows;
    matrix->modular->c = columns;
    matrix->modular->stride = columns;
    sagejs_native_init_nmod(&matrix->modular->mod, modulus);
    if (count != 0)
    {
        matrix->modular->entries =
            (ulong *) calloc(count, sizeof(ulong));
        if (matrix->modular->entries == NULL)
        {
            matrix->magic = 0;
            free(matrix);
            napi_throw_error(env, NULL,
                "unable to allocate dense prime-field matrix entries");
            return NULL;
        }
    }
    return matrix;
}

static inline napi_value sagejs_native_wrap_prime_matrix(
    napi_env env, sagejs_matrix *matrix)
{
    napi_value object;
    if (!sagejs_native_check_napi(env,
            napi_create_object(env, &object)) ||
        !sagejs_native_check_napi(env,
            napi_type_tag_object(env, object, &sagejs_matrix_type_tag)) ||
        !sagejs_native_check_napi(env,
            napi_wrap(env, object, matrix,
                sagejs_native_finalize_prime_matrix, NULL, NULL)))
    {
        sagejs_native_finalize_prime_matrix(env, matrix, NULL);
        return NULL;
    }
    return object;
}

#endif
