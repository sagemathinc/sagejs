#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>

#include "cminpack.h"
#include "ssq.h"

static size_t memory_bytes(void) {
    return (size_t)__builtin_wasm_memory_size(0) * (size_t)65536;
}

static int valid_doubles(uint32_t offset, size_t count) {
    if (offset == 0 || offset % _Alignof(double) != 0 ||
        count > (SIZE_MAX - (size_t)offset) / sizeof(double)) {
        return 0;
    }
    return (size_t)offset + count * sizeof(double) <= memory_bytes();
}

__attribute__((export_name("mgh_alloc")))
uint32_t mgh_alloc(uint32_t bytes) {
    if (bytes == 0 || bytes > 1024 * 1024) return 0;
    return (uint32_t)(uintptr_t)malloc((size_t)bytes);
}

__attribute__((export_name("mgh_free")))
void mgh_free(uint32_t offset) {
    free((void *)(uintptr_t)offset);
}

__attribute__((export_name("mgh_initial")))
int32_t mgh_initial(int32_t n, int32_t problem, double factor,
                    uint32_t x_offset) {
    if (n <= 0 || n > 40 || problem < 1 || problem > 18 ||
        !valid_doubles(x_offset, (size_t)n)) {
        return 0;
    }
    lmdipt(n, (double *)(uintptr_t)x_offset, problem, factor);
    return 1;
}

__attribute__((export_name("mgh_residual")))
int32_t mgh_residual(int32_t m, int32_t n, int32_t problem,
                     uint32_t x_offset, uint32_t residual_offset) {
    if (m <= 0 || m > 65 || n <= 0 || n > 40 || n > m ||
        problem < 1 || problem > 18 ||
        !valid_doubles(x_offset, (size_t)n) ||
        !valid_doubles(residual_offset, (size_t)m)) {
        return 0;
    }
    ssqfcn(m, n, (const double *)(uintptr_t)x_offset,
           (double *)(uintptr_t)residual_offset, problem);
    return 1;
}

__attribute__((export_name("mgh_jacobian")))
int32_t mgh_jacobian(int32_t m, int32_t n, int32_t problem,
                     uint32_t x_offset, uint32_t jacobian_offset) {
    size_t count = (size_t)m * (size_t)n;
    if (m <= 0 || m > 65 || n <= 0 || n > 40 || n > m ||
        problem < 1 || problem > 18 ||
        !valid_doubles(x_offset, (size_t)n) ||
        !valid_doubles(jacobian_offset, count)) {
        return 0;
    }
    ssqjac(m, n, (const double *)(uintptr_t)x_offset,
           (double *)(uintptr_t)jacobian_offset, m, problem);
    return 1;
}
