#ifndef SAGEJS_HYPERELLIPTIC_RFOREST_H
#define SAGEJS_HYPERELLIPTIC_RFOREST_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SAGEJS_RFOREST_VERSION \
    "rforest 3103d396c67cb1685131b1f11e84975cca335bdf"
#define SAGEJS_RFOREST_MAX_GENUS 3
#define SAGEJS_RFOREST_MAX_DEGREE 8
#define SAGEJS_RFOREST_MAX_PRIME UINT64_C(2147483647)
#define SAGEJS_RFOREST_DIRECT_MAX_PRIME UINT64_C(100000)

typedef enum {
    SAGEJS_RFOREST_STATUS_OK = 0,
    SAGEJS_RFOREST_STATUS_TRUNCATED = 1,
    SAGEJS_RFOREST_STATUS_UNAVAILABLE = -1,
    SAGEJS_RFOREST_STATUS_INVALID_ARGUMENT = -2,
    SAGEJS_RFOREST_STATUS_UNSUPPORTED_MODEL = -3,
    SAGEJS_RFOREST_STATUS_INVALID_INTERVAL = -4,
    SAGEJS_RFOREST_STATUS_ALLOCATION_FAILED = -5,
    SAGEJS_RFOREST_STATUS_INTERNAL_ERROR = -6
} sagejs_rforest_status;

typedef enum {
    SAGEJS_RFOREST_ROW_FOREST = 0,
    SAGEJS_RFOREST_ROW_DIRECT = 1,
    SAGEJS_RFOREST_ROW_BAD_REDUCTION = 2,
    SAGEJS_RFOREST_ROW_UNSUPPORTED_CHARACTERISTIC = 3,
    SAGEJS_RFOREST_ROW_RESOURCE_LIMIT = 4
} sagejs_rforest_row_status;

typedef struct {
    uint64_t prime;
    uint8_t good;
    uint8_t coefficient_count;
    int32_t status;
    uint64_t coefficients[SAGEJS_RFOREST_MAX_GENUS];
} sagejs_rforest_row;

typedef struct {
    int32_t status;
    uint8_t genus;
    uint8_t truncated;
    size_t row_count;
    size_t required_rows;
    sagejs_rforest_row *rows;
} sagejs_rforest_batch;

int sagejs_rforest_available(void);
const char *sagejs_rforest_backend_version(void);
const char *sagejs_rforest_status_name(int32_t status);

/* `coefficients` are ascending integral coefficients of F in y^2=F(x).
 * The supported degrees are 2*g+1 and 2*g+2 for g=2,3.  All public integer
 * widths are fixed; the private upstream long/GMP ABI is never exposed. */
int32_t sagejs_rforest_hasse_witt_batch_compute(
    const int64_t *coefficients,
    size_t coefficient_count,
    uint8_t genus,
    uint64_t start,
    uint64_t stop,
    size_t maximum_rows,
    sagejs_rforest_batch *result);
void sagejs_rforest_batch_clear(sagejs_rforest_batch *result);

#ifdef __cplusplus
}
#endif

#endif
