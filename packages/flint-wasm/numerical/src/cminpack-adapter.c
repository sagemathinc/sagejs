#include <math.h>
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>

#include "cminpack.h"

/*
 * Callback-capable LM adapter.
 *
 * This file owns only the host/solver boundary. cminpack owns the numerical
 * algorithm. The JavaScript host owns callback exceptions and cancellation;
 * they cross C as fixed negative status values so every C allocation reaches
 * deterministic cleanup before JavaScript rethrows.
 */

enum {
    P3_METHOD_LMDIF = 1,
    P3_METHOD_LMDER = 2,
    P3_CALLBACK_RESIDUAL = 1,
    P3_CALLBACK_JACOBIAN = 2,
    P3_INVALID_ARGUMENT = -2001,
    P3_ALLOCATION_FAILED = -2002,
    P3_CORRUPT_REGION = -2003,
    P3_DIMENSION_LIMIT = -2004
};

enum {
    P3_MAX_VARIABLES = 256,
    P3_MAX_RESIDUALS = 16384,
    P3_MAX_WORKSPACE_BYTES = 64 * 1024 * 1024,
    P3_MAX_TRACKED_ALLOCATIONS = 32
};

__attribute__((import_module("sagejs_p3"), import_name("evaluate")))
extern int32_t sagejs_p3_evaluate(
    uint32_t context,
    uint32_t residual_count,
    uint32_t variable_count,
    uint32_t x_offset,
    uint32_t residual_offset,
    uint32_t jacobian_offset,
    uint32_t jacobian_leading_dimension,
    uint32_t flags
);

static size_t wasm_memory_bytes(void) {
    return (size_t)__builtin_wasm_memory_size(0) * (size_t)65536;
}

static int checked_product(size_t left, size_t right, size_t *product) {
    if (left != 0 && right > SIZE_MAX / left) return 0;
    *product = left * right;
    return 1;
}

static int checked_sum(size_t left, size_t right, size_t *sum) {
    if (right > SIZE_MAX - left) return 0;
    *sum = left + right;
    return 1;
}

static int valid_region(uint32_t offset, size_t count, size_t item_size,
                        size_t alignment) {
    size_t bytes;
    size_t end;
    if (offset == 0 || offset % alignment != 0) return 0;
    if (!checked_product(count, item_size, &bytes)) return 0;
    if (!checked_sum((size_t)offset, bytes, &end)) return 0;
    return end <= wasm_memory_bytes();
}

static int regions_overlap(uint32_t left_offset, size_t left_bytes,
                           uint32_t right_offset, size_t right_bytes) {
    size_t left_end;
    size_t right_end;
    if (!checked_sum((size_t)left_offset, left_bytes, &left_end) ||
        !checked_sum((size_t)right_offset, right_bytes, &right_end)) {
        return 1;
    }
    return (size_t)left_offset < right_end && (size_t)right_offset < left_end;
}

static int workspace_size_ok(int m, int n) {
    size_t matrix;
    size_t doubles;
    size_t double_bytes;
    size_t int_bytes;
    size_t total;
    if (!checked_product((size_t)m, (size_t)n, &matrix)) return 0;
    if (!checked_sum(matrix, (size_t)m * 2, &doubles)) return 0;
    if (!checked_sum(doubles, (size_t)n * 5, &doubles)) return 0;
    if (!checked_product(doubles, sizeof(double), &double_bytes)) return 0;
    if (!checked_product((size_t)n, sizeof(int), &int_bytes)) return 0;
    if (!checked_sum(double_bytes, int_bytes, &total)) return 0;
    return total <= P3_MAX_WORKSPACE_BYTES;
}

typedef struct {
    uint32_t handle;
} callback_context;

typedef struct {
    void *pointer;
    size_t bytes;
} allocation_record;

static allocation_record allocations[P3_MAX_TRACKED_ALLOCATIONS];
static int32_t live_allocations = 0;
static size_t live_bytes = 0;
static int32_t fail_allocations_after = -1;

static int register_allocation(void *pointer, size_t bytes) {
    for (int i = 0; i < P3_MAX_TRACKED_ALLOCATIONS; ++i) {
        if (allocations[i].pointer == NULL) {
            allocations[i].pointer = pointer;
            allocations[i].bytes = bytes;
            live_allocations += 1;
            live_bytes += bytes;
            return 1;
        }
    }
    return 0;
}

static int should_fail_allocation(void) {
    if (fail_allocations_after < 0) return 0;
    if (fail_allocations_after == 0) return 1;
    fail_allocations_after -= 1;
    return 0;
}

static void *tracked_malloc(size_t bytes) {
    if (should_fail_allocation()) return NULL;
    void *pointer = malloc(bytes);
    if (pointer != NULL && !register_allocation(pointer, bytes)) {
        free(pointer);
        return NULL;
    }
    return pointer;
}

static void *tracked_calloc(size_t count, size_t bytes) {
    size_t total;
    if (!checked_product(count, bytes, &total) || should_fail_allocation()) {
        return NULL;
    }
    void *pointer = calloc(count, bytes);
    if (pointer != NULL && !register_allocation(pointer, total)) {
        free(pointer);
        return NULL;
    }
    return pointer;
}

static int tracked_free(void *pointer) {
    if (pointer == NULL) return 1;
    for (int i = 0; i < P3_MAX_TRACKED_ALLOCATIONS; ++i) {
        if (allocations[i].pointer == pointer) {
            size_t bytes = allocations[i].bytes;
            allocations[i].pointer = NULL;
            allocations[i].bytes = 0;
            live_allocations -= 1;
            live_bytes -= bytes;
            free(pointer);
            return 1;
        }
    }
    return 0;
}

static int tracked_region(uint32_t offset, size_t bytes) {
    void *pointer = (void *)(uintptr_t)offset;
    for (int i = 0; i < P3_MAX_TRACKED_ALLOCATIONS; ++i) {
        if (allocations[i].pointer == pointer && allocations[i].bytes >= bytes) {
            return 1;
        }
    }
    return 0;
}

static int residual_callback(void *opaque, int m, int n, const double *x,
                             double *fvec, int iflag) {
    callback_context *context = (callback_context *)opaque;
    return (int)sagejs_p3_evaluate(
        context->handle,
        (uint32_t)m,
        (uint32_t)n,
        (uint32_t)(uintptr_t)x,
        (uint32_t)(uintptr_t)fvec,
        0,
        0,
        P3_CALLBACK_RESIDUAL | ((iflag == 2) ? 4u : 0u)
    );
}

static int derivative_callback(void *opaque, int m, int n, const double *x,
                               double *fvec, double *fjac, int ldfjac,
                               int iflag) {
    callback_context *context = (callback_context *)opaque;
    uint32_t flags = iflag == 2 ? P3_CALLBACK_JACOBIAN : P3_CALLBACK_RESIDUAL;
    return (int)sagejs_p3_evaluate(
        context->handle,
        (uint32_t)m,
        (uint32_t)n,
        (uint32_t)(uintptr_t)x,
        (uint32_t)(uintptr_t)fvec,
        (uint32_t)(uintptr_t)fjac,
        (uint32_t)ldfjac,
        flags
    );
}

__attribute__((export_name("p3_alloc")))
uint32_t p3_alloc(uint32_t bytes) {
    if (bytes == 0 || bytes > P3_MAX_WORKSPACE_BYTES) return 0;
    return (uint32_t)(uintptr_t)tracked_malloc((size_t)bytes);
}

__attribute__((export_name("p3_free")))
int32_t p3_free(uint32_t offset) {
    return tracked_free((void *)(uintptr_t)offset);
}

__attribute__((export_name("p3_live_allocations")))
int32_t p3_live_allocations(void) {
    return live_allocations;
}

__attribute__((export_name("p3_live_bytes")))
uint32_t p3_live_bytes(void) {
    return (uint32_t)live_bytes;
}

__attribute__((export_name("p3_set_allocation_failure_after")))
int32_t p3_set_allocation_failure_after(int32_t count) {
    if (count < -1) return 0;
    fail_allocations_after = count;
    return 1;
}

__attribute__((export_name("p3_lm_solve")))
int32_t p3_lm_solve(
    uint32_t handle,
    int32_t method,
    int32_t m,
    int32_t n,
    uint32_t x_offset,
    double ftol,
    double xtol,
    double gtol,
    int32_t maxfev,
    double epsfcn,
    uint32_t diag_offset,
    uint32_t stats_offset
) {
    double *x = (double *)(uintptr_t)x_offset;
    double *caller_diag = (double *)(uintptr_t)diag_offset;
    int32_t *stats = (int32_t *)(uintptr_t)stats_offset;
    double *fvec = NULL;
    double *fjac = NULL;
    double *diag = NULL;
    double *qtf = NULL;
    double *wa1 = NULL;
    double *wa2 = NULL;
    double *wa3 = NULL;
    double *wa4 = NULL;
    int *ipvt = NULL;
    int nfev = 0;
    int njev = 0;
    int info = P3_INVALID_ARGUMENT;
    int mode = diag_offset == 0 ? 1 : 2;
    callback_context context = {handle};

    if (handle == 0 || (method != P3_METHOD_LMDIF && method != P3_METHOD_LMDER)) {
        return P3_INVALID_ARGUMENT;
    }
    if (m <= 0 || n <= 0 || m < n || maxfev <= 0 ||
        m > P3_MAX_RESIDUALS || n > P3_MAX_VARIABLES) {
        return P3_DIMENSION_LIMIT;
    }
    if (!isfinite(ftol) || !isfinite(xtol) || !isfinite(gtol) ||
        !isfinite(epsfcn) || ftol < 0.0 || xtol < 0.0 || gtol < 0.0 ||
        epsfcn < 0.0) {
        return P3_INVALID_ARGUMENT;
    }
    if (!valid_region(x_offset, (size_t)n, sizeof(double), _Alignof(double)) ||
        !valid_region(stats_offset, 4, sizeof(int32_t), _Alignof(int32_t))) {
        return P3_CORRUPT_REGION;
    }
    if (!tracked_region(x_offset, (size_t)n * sizeof(double)) ||
        !tracked_region(stats_offset, 4 * sizeof(int32_t))) {
        return P3_CORRUPT_REGION;
    }
    if (diag_offset != 0 &&
        (!valid_region(diag_offset, (size_t)n, sizeof(double), _Alignof(double)) ||
         !tracked_region(diag_offset, (size_t)n * sizeof(double)))) {
        return P3_CORRUPT_REGION;
    }
    if (regions_overlap(x_offset, (size_t)n * sizeof(double),
                        stats_offset, 4 * sizeof(int32_t)) ||
        (diag_offset != 0 &&
         (regions_overlap(x_offset, (size_t)n * sizeof(double),
                          diag_offset, (size_t)n * sizeof(double)) ||
          regions_overlap(stats_offset, 4 * sizeof(int32_t),
                          diag_offset, (size_t)n * sizeof(double))))) {
        return P3_CORRUPT_REGION;
    }
    if (!workspace_size_ok(m, n)) return P3_DIMENSION_LIMIT;
    for (int i = 0; i < n; ++i) {
        if (!isfinite(x[i])) return P3_INVALID_ARGUMENT;
        if (mode == 2 && (!isfinite(caller_diag[i]) || caller_diag[i] <= 0.0)) {
            return P3_INVALID_ARGUMENT;
        }
    }

    memset(stats, 0, 4 * sizeof(int32_t));
    fvec = (double *)tracked_calloc((size_t)m, sizeof(double));
    fjac = (double *)tracked_calloc((size_t)m * (size_t)n, sizeof(double));
    diag = (double *)tracked_calloc((size_t)n, sizeof(double));
    qtf = (double *)tracked_calloc((size_t)n, sizeof(double));
    wa1 = (double *)tracked_calloc((size_t)n, sizeof(double));
    wa2 = (double *)tracked_calloc((size_t)n, sizeof(double));
    wa3 = (double *)tracked_calloc((size_t)n, sizeof(double));
    wa4 = (double *)tracked_calloc((size_t)m, sizeof(double));
    ipvt = (int *)tracked_calloc((size_t)n, sizeof(int));
    if (fvec == NULL || fjac == NULL || diag == NULL || qtf == NULL ||
        wa1 == NULL || wa2 == NULL || wa3 == NULL || wa4 == NULL ||
        ipvt == NULL) {
        info = P3_ALLOCATION_FAILED;
        goto cleanup;
    }
    if (mode == 2) memcpy(diag, caller_diag, (size_t)n * sizeof(double));

    if (method == P3_METHOD_LMDIF) {
        info = lmdif(residual_callback, &context, m, n, x, fvec, ftol, xtol,
                     gtol, maxfev, epsfcn, diag, mode, 100.0, 0, &nfev,
                     fjac, m, ipvt, qtf, wa1, wa2, wa3, wa4);
    } else {
        info = lmder(derivative_callback, &context, m, n, x, fvec, fjac, m,
                     ftol, xtol, gtol, maxfev, diag, mode, 100.0, 0, &nfev,
                     &njev, ipvt, qtf, wa1, wa2, wa3, wa4);
    }

cleanup:
    stats[0] = info;
    stats[1] = nfev;
    stats[2] = njev;
    stats[3] = method;
    tracked_free(ipvt);
    tracked_free(wa4);
    tracked_free(wa3);
    tracked_free(wa2);
    tracked_free(wa1);
    tracked_free(qtf);
    tracked_free(diag);
    tracked_free(fjac);
    tracked_free(fvec);
    return info;
}
