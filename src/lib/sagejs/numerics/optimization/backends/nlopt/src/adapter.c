#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "neldermead.h"
#include "nlopt-util.h"

/* This file adapts packed host callbacks and bounded storage only. */

enum {
    SAGEJS_NLOPT_NELDER_MEAD = 1,
    SAGEJS_NLOPT_OBJECTIVE = 1,
    SAGEJS_NLOPT_INEQUALITY = 2,
    SAGEJS_NLOPT_EQUALITY = 3,
    SAGEJS_NLOPT_INVALID_ARGUMENT = -2001,
    SAGEJS_NLOPT_ALLOCATION_FAILED = -2002,
    SAGEJS_NLOPT_CORRUPT_REGION = -2003,
    SAGEJS_NLOPT_DIMENSION_LIMIT = -2004
};

enum {
    SAGEJS_NLOPT_MAX_VARIABLES = 128,
    SAGEJS_NLOPT_MAX_CONSTRAINTS = 512,
    SAGEJS_NLOPT_MAX_WORKSPACE_BYTES = 64 * 1024 * 1024,
    SAGEJS_NLOPT_MAX_TRACKED_ALLOCATIONS = 256
};

__attribute__((import_module("sagejs_numerical_nlopt"), import_name("evaluate")))
extern int32_t sagejs_nlopt_evaluate(
    uint32_t context,
    uint32_t kind,
    uint32_t value_count,
    uint32_t variable_count,
    uint32_t x_offset,
    uint32_t value_offset,
    uint32_t derivative_offset,
    uint32_t derivative_rows
);

typedef struct {
    void *pointer;
    size_t bytes;
} tracked_allocation;

static tracked_allocation allocations[SAGEJS_NLOPT_MAX_TRACKED_ALLOCATIONS];
static int32_t live_allocations = 0;
static uint64_t live_bytes = 0;
static int32_t allocation_attempts = 0;
static int32_t allocation_failure_after = -1;

static int should_fail_allocation(void) {
    int32_t attempt = allocation_attempts++;
    return allocation_failure_after >= 0 && attempt >= allocation_failure_after;
}

static int track_pointer(void *pointer, size_t bytes) {
    if (pointer == NULL) return 0;
    for (size_t i = 0; i < SAGEJS_NLOPT_MAX_TRACKED_ALLOCATIONS; ++i) {
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

static tracked_allocation *find_pointer(void *pointer) {
    if (pointer == NULL) return NULL;
    for (size_t i = 0; i < SAGEJS_NLOPT_MAX_TRACKED_ALLOCATIONS; ++i) {
        if (allocations[i].pointer == pointer) return &allocations[i];
    }
    return NULL;
}

void *sagejs_nlopt_heap_malloc(size_t bytes) {
    if (bytes == 0 || bytes > SAGEJS_NLOPT_MAX_WORKSPACE_BYTES ||
        should_fail_allocation()) return NULL;
    void *pointer = malloc(bytes);
    if (!track_pointer(pointer, bytes)) {
        free(pointer);
        return NULL;
    }
    return pointer;
}

void *sagejs_nlopt_heap_calloc(size_t count, size_t bytes) {
    if (count != 0 && bytes > SIZE_MAX / count) return NULL;
    size_t total = count * bytes;
    if (total == 0 || total > SAGEJS_NLOPT_MAX_WORKSPACE_BYTES ||
        should_fail_allocation()) return NULL;
    void *pointer = calloc(count, bytes);
    if (!track_pointer(pointer, total)) {
        free(pointer);
        return NULL;
    }
    return pointer;
}

void *sagejs_nlopt_heap_realloc(void *pointer, size_t bytes) {
    if (pointer == NULL) return sagejs_nlopt_heap_malloc(bytes);
    tracked_allocation *entry = find_pointer(pointer);
    if (entry == NULL || bytes == 0 || bytes > SAGEJS_NLOPT_MAX_WORKSPACE_BYTES ||
        should_fail_allocation()) return NULL;
    size_t previous = entry->bytes;
    void *replacement = realloc(pointer, bytes);
    if (replacement == NULL) return NULL;
    entry->pointer = replacement;
    entry->bytes = bytes;
    live_bytes -= previous;
    live_bytes += bytes;
    return replacement;
}

void sagejs_nlopt_heap_free(void *pointer) {
    if (pointer == NULL) return;
    tracked_allocation *entry = find_pointer(pointer);
    if (entry == NULL) return;
    live_allocations -= 1;
    live_bytes -= entry->bytes;
    entry->pointer = NULL;
    entry->bytes = 0;
    free(pointer);
}

/* Stop-time is enforced by the host callback using a monotonic clock. */
double nlopt_seconds(void) { return 0.0; }

/* The reactor never enables NLopt's text output. Keep dormant upstream
 * formatting paths host-I/O-free so the final artifact has one import. */
int sagejs_nlopt_fprintf(FILE *stream, const char *format, ...) {
    (void)stream;
    (void)format;
    return 0;
}

int sagejs_nlopt_vsnprintf(char *buffer, size_t size, const char *format,
                           va_list arguments) {
    (void)format;
    (void)arguments;
    if (size > 0) buffer[0] = '\0';
    return 0;
}

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
        !checked_sum((size_t)right_offset, right_bytes, &right_end)) return 1;
    return (size_t)left_offset < right_end && (size_t)right_offset < left_end;
}

static int valid_allocation(uint32_t offset, size_t count, size_t item_size,
                            size_t alignment) {
    size_t bytes;
    tracked_allocation *entry;
    if (!valid_region(offset, count, item_size, alignment) ||
        !checked_product(count, item_size, &bytes)) return 0;
    entry = find_pointer((void *)(uintptr_t)offset);
    return entry != NULL && entry->bytes >= bytes;
}

static int regions_are_pairwise_disjoint(const uint32_t *offsets,
                                         const size_t *bytes, size_t count) {
    for (size_t left = 0; left < count; ++left) {
        if (bytes[left] == 0) continue;
        for (size_t right = left + 1; right < count; ++right) {
            if (bytes[right] != 0 &&
                regions_overlap(offsets[left], bytes[left],
                                offsets[right], bytes[right])) return 0;
        }
    }
    return 1;
}

static int workspace_size_ok(size_t n) {
    size_t doubles;
    size_t bytes;
    if (!checked_sum(n, 1, &doubles) ||
        !checked_product(doubles, doubles, &doubles) ||
        !checked_sum(doubles, 2 * n, &doubles)) return 0;
    if (!checked_product(doubles, sizeof(double), &bytes)) return 0;
    return bytes <= SAGEJS_NLOPT_MAX_WORKSPACE_BYTES;
}

typedef struct {
    uint32_t handle;
    uint32_t n;
    uint32_t inequalities;
    uint32_t equalities;
    int *force_stop;
    int32_t failure;
    int32_t objective_callbacks;
    int32_t inequality_callbacks;
    int32_t equality_callbacks;
    int32_t gradient_callbacks;
    int32_t jacobian_callbacks;
} callback_context;

static double objective_callback(unsigned n, const double *x, double *gradient,
                                 void *opaque) {
    callback_context *context = (callback_context *)opaque;
    double value = HUGE_VAL;
    int32_t status = sagejs_nlopt_evaluate(
        context->handle, SAGEJS_NLOPT_OBJECTIVE, 1, n,
        (uint32_t)(uintptr_t)x, (uint32_t)(uintptr_t)&value,
        (uint32_t)(uintptr_t)gradient, gradient == NULL ? 0 : 1);
    context->objective_callbacks += 1;
    if (gradient != NULL) context->gradient_callbacks += 1;
    if (status != 0 || !isfinite(value)) {
        context->failure = status != 0 ? status : -1005;
        *context->force_stop = context->failure;
        return HUGE_VAL;
    }
    return value;
}

__attribute__((export_name("sagejs_nlopt_alloc")))
uint32_t sagejs_nlopt_alloc(uint32_t bytes) {
    return (uint32_t)(uintptr_t)sagejs_nlopt_heap_malloc((size_t)bytes);
}

__attribute__((export_name("sagejs_nlopt_free")))
int32_t sagejs_nlopt_free_export(uint32_t offset) {
    void *pointer = (void *)(uintptr_t)offset;
    if (find_pointer(pointer) == NULL) return 0;
    sagejs_nlopt_heap_free(pointer);
    return 1;
}

__attribute__((export_name("sagejs_nlopt_live_allocations")))
int32_t sagejs_nlopt_live_allocations(void) { return live_allocations; }

__attribute__((export_name("sagejs_nlopt_live_bytes")))
uint64_t sagejs_nlopt_live_bytes(void) { return live_bytes; }

__attribute__((export_name("sagejs_nlopt_set_allocation_failure_after")))
int32_t sagejs_nlopt_set_allocation_failure_after(int32_t after) {
    if (after < -1) return 0;
    allocation_failure_after = after;
    allocation_attempts = 0;
    return 1;
}

__attribute__((export_name("sagejs_nlopt_probe_callback")))
int32_t sagejs_nlopt_probe_callback(
    uint32_t handle,
    uint32_t kind,
    uint32_t value_count,
    uint32_t variable_count,
    uint32_t x_offset,
    uint32_t value_offset,
    uint32_t derivative_offset
) {
    size_t x_bytes;
    size_t value_bytes;
    size_t derivative_count;
    size_t derivative_bytes;
    if (handle == 0 || variable_count == 0 ||
        variable_count > SAGEJS_NLOPT_MAX_VARIABLES ||
        value_count == 0 || value_count > SAGEJS_NLOPT_MAX_CONSTRAINTS ||
        (kind != SAGEJS_NLOPT_OBJECTIVE &&
         kind != SAGEJS_NLOPT_INEQUALITY && kind != SAGEJS_NLOPT_EQUALITY) ||
        (kind == SAGEJS_NLOPT_OBJECTIVE && value_count != 1))
        return SAGEJS_NLOPT_INVALID_ARGUMENT;
    if (!checked_product((size_t)variable_count, sizeof(double), &x_bytes) ||
        !checked_product((size_t)value_count, sizeof(double), &value_bytes) ||
        !checked_product((size_t)value_count, (size_t)variable_count,
                         &derivative_count) ||
        !checked_product(derivative_count, sizeof(double), &derivative_bytes))
        return SAGEJS_NLOPT_DIMENSION_LIMIT;
    if (!valid_allocation(x_offset, variable_count, sizeof(double),
                          _Alignof(double)) ||
        !valid_allocation(value_offset, value_count, sizeof(double),
                          _Alignof(double)) ||
        !valid_allocation(derivative_offset, derivative_count, sizeof(double),
                          _Alignof(double)) ||
        regions_overlap(x_offset, x_bytes, value_offset, value_bytes) ||
        regions_overlap(x_offset, x_bytes, derivative_offset, derivative_bytes) ||
        regions_overlap(value_offset, value_bytes, derivative_offset,
                        derivative_bytes))
        return SAGEJS_NLOPT_CORRUPT_REGION;
    return sagejs_nlopt_evaluate(
        handle, kind, value_count, variable_count, x_offset, value_offset,
        derivative_offset, value_count);
}

__attribute__((export_name("sagejs_nlopt_solve")))
int32_t sagejs_nlopt_solve(
    uint32_t handle,
    int32_t method,
    int32_t n,
    int32_t inequality_count,
    int32_t equality_count,
    uint32_t x_offset,
    uint32_t lower_offset,
    uint32_t upper_offset,
    uint32_t step_offset,
    uint32_t inequality_tolerance_offset,
    uint32_t equality_tolerance_offset,
    double ftol_relative,
    double ftol_absolute,
    double xtol_relative,
    uint32_t xtol_absolute_offset,
    int32_t maximum_evaluations,
    uint32_t minimum_offset,
    uint32_t stats_offset
) {
    size_t vector_bytes;
    size_t inequality_tolerance_bytes;
    size_t equality_tolerance_bytes;
    double *x = (double *)(uintptr_t)x_offset;
    const double *lower = (const double *)(uintptr_t)lower_offset;
    const double *upper = (const double *)(uintptr_t)upper_offset;
    const double *step = (const double *)(uintptr_t)step_offset;
    const double *xtol_absolute = (const double *)(uintptr_t)xtol_absolute_offset;
    double *minimum = (double *)(uintptr_t)minimum_offset;
    int32_t *stats = (int32_t *)(uintptr_t)stats_offset;
    int nevals = 0;
    int force_stop = 0;
    char *stop_message = NULL;
    nlopt_result result = NLOPT_INVALID_ARGS;
    callback_context context;
    nlopt_stopping stop;

    if (handle == 0 || method != SAGEJS_NLOPT_NELDER_MEAD)
        return SAGEJS_NLOPT_INVALID_ARGUMENT;
    if (n <= 0 || n > SAGEJS_NLOPT_MAX_VARIABLES || inequality_count < 0 ||
        equality_count < 0 ||
        inequality_count + equality_count > SAGEJS_NLOPT_MAX_CONSTRAINTS ||
        maximum_evaluations <= 0)
        return SAGEJS_NLOPT_DIMENSION_LIMIT;
    if (inequality_count != 0 || equality_count != 0)
        return SAGEJS_NLOPT_INVALID_ARGUMENT;
    if (!isfinite(ftol_relative) || ftol_relative < 0.0 ||
        !isfinite(ftol_absolute) || ftol_absolute < 0.0 ||
        !isfinite(xtol_relative) || xtol_relative < 0.0)
        return SAGEJS_NLOPT_INVALID_ARGUMENT;
    if (!workspace_size_ok((size_t)n))
        return SAGEJS_NLOPT_DIMENSION_LIMIT;
    if (!checked_product((size_t)n, sizeof(double), &vector_bytes) ||
        !checked_product((size_t)inequality_count, sizeof(double),
                         &inequality_tolerance_bytes) ||
        !checked_product((size_t)equality_count, sizeof(double),
                         &equality_tolerance_bytes))
        return SAGEJS_NLOPT_DIMENSION_LIMIT;
    if (!valid_allocation(x_offset, (size_t)n, sizeof(double),
                          _Alignof(double)) ||
        !valid_allocation(lower_offset, (size_t)n, sizeof(double),
                          _Alignof(double)) ||
        !valid_allocation(upper_offset, (size_t)n, sizeof(double),
                          _Alignof(double)) ||
        !valid_allocation(step_offset, (size_t)n, sizeof(double),
                          _Alignof(double)) ||
        !valid_allocation(xtol_absolute_offset, (size_t)n, sizeof(double),
                          _Alignof(double)) ||
        !valid_allocation(minimum_offset, 1, sizeof(double),
                          _Alignof(double)) ||
        !valid_allocation(stats_offset, 8, sizeof(int32_t),
                          _Alignof(int32_t)))
        return SAGEJS_NLOPT_CORRUPT_REGION;
    if ((inequality_count > 0 &&
         !valid_allocation(inequality_tolerance_offset,
                           (size_t)inequality_count, sizeof(double),
                           _Alignof(double))) ||
        (equality_count > 0 &&
         !valid_allocation(equality_tolerance_offset, (size_t)equality_count,
                           sizeof(double), _Alignof(double))))
        return SAGEJS_NLOPT_CORRUPT_REGION;
    {
        const uint32_t offsets[] = {
            x_offset, lower_offset, upper_offset, step_offset,
            xtol_absolute_offset, inequality_tolerance_offset,
            equality_tolerance_offset, minimum_offset, stats_offset
        };
        const size_t bytes[] = {
            vector_bytes, vector_bytes, vector_bytes, vector_bytes,
            vector_bytes, inequality_tolerance_bytes,
            equality_tolerance_bytes, sizeof(double), 8 * sizeof(int32_t)
        };
        if (!regions_are_pairwise_disjoint(
                offsets, bytes, sizeof(offsets) / sizeof(offsets[0])))
            return SAGEJS_NLOPT_CORRUPT_REGION;
    }
    for (int32_t i = 0; i < n; ++i) {
        if (!isfinite(x[i]) || isnan(lower[i]) || isnan(upper[i]) ||
            lower[i] > upper[i] || x[i] < lower[i] || x[i] > upper[i] ||
            !isfinite(step[i]) || step[i] <= 0.0 ||
            !isfinite(xtol_absolute[i]) || xtol_absolute[i] < 0.0)
            return SAGEJS_NLOPT_INVALID_ARGUMENT;
    }
    for (int32_t i = 0; i < inequality_count; ++i) {
        double tolerance = ((const double *)(uintptr_t)
            inequality_tolerance_offset)[i];
        if (!isfinite(tolerance) || tolerance < 0.0)
            return SAGEJS_NLOPT_INVALID_ARGUMENT;
    }
    for (int32_t i = 0; i < equality_count; ++i) {
        double tolerance = ((const double *)(uintptr_t)
            equality_tolerance_offset)[i];
        if (!isfinite(tolerance) || tolerance < 0.0)
            return SAGEJS_NLOPT_INVALID_ARGUMENT;
    }

    memset(stats, 0, 8 * sizeof(int32_t));
    *minimum = HUGE_VAL;
    context = (callback_context){
        handle, (uint32_t)n, (uint32_t)inequality_count,
        (uint32_t)equality_count, &force_stop, 0, 0, 0, 0, 0, 0
    };
    stop = (nlopt_stopping){
        (unsigned)n, -HUGE_VAL, ftol_relative, ftol_absolute, xtol_relative,
        xtol_absolute, NULL, &nevals, maximum_evaluations, 0.0, 0.0,
        &force_stop, &stop_message
    };

    result = nldrmd_minimize(n, objective_callback, &context, lower, upper,
                             x, minimum, step, &stop);

    stats[0] = (int32_t)result;
    stats[1] = (int32_t)nevals;
    stats[2] = context.objective_callbacks;
    stats[3] = context.inequality_callbacks;
    stats[4] = context.equality_callbacks;
    stats[5] = context.gradient_callbacks;
    stats[6] = context.jacobian_callbacks;
    stats[7] = context.failure;
    sagejs_nlopt_heap_free(stop_message);
    return context.failure != 0 ? context.failure : (int32_t)result;
}
