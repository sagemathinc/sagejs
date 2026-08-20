#ifndef SAGEJS_HYPERELLIPTIC_SMALLJAC_H
#define SAGEJS_HYPERELLIPTIC_SMALLJAC_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SAGEJS_SMALLJAC_LPOLY_MAX_PRIME UINT64_C(4294967295)
#define SAGEJS_SMALLJAC_G1_LPOLY_MAX_NORM UINT64_C(17592186044415)
#define SAGEJS_SMALLJAC_GROUP_MAX_PRIME UINT64_C(1073741823)
#define SAGEJS_SMALLJAC_MAX_GENUS 2
#define SAGEJS_SMALLJAC_MAX_GROUP_RANK 4

typedef enum {
    SAGEJS_SMALLJAC_STATUS_OK = 0,
    SAGEJS_SMALLJAC_STATUS_TRUNCATED = 1,
    SAGEJS_SMALLJAC_STATUS_UNAVAILABLE = -1,
    SAGEJS_SMALLJAC_STATUS_INVALID_ARGUMENT = -2,
    SAGEJS_SMALLJAC_STATUS_PARSE_ERROR = -3,
    SAGEJS_SMALLJAC_STATUS_UNSUPPORTED_CURVE = -4,
    SAGEJS_SMALLJAC_STATUS_SINGULAR_CURVE = -5,
    SAGEJS_SMALLJAC_STATUS_INVALID_INTERVAL = -6,
    SAGEJS_SMALLJAC_STATUS_ALLOCATION_FAILED = -7,
    SAGEJS_SMALLJAC_STATUS_CALLBACK_CANCELLED = -8,
    SAGEJS_SMALLJAC_STATUS_COEFFICIENT_RANGE = -9,
    SAGEJS_SMALLJAC_STATUS_INTERNAL_ERROR = -10
} sagejs_smalljac_status;

typedef enum {
    SAGEJS_SMALLJAC_ROW_GOOD = 0,
    SAGEJS_SMALLJAC_ROW_BAD_REDUCTION = 1
} sagejs_smalljac_row_status;

typedef struct {
    uint64_t prime;
    uint8_t good;
    uint8_t coefficient_count;
    int32_t status;
    int64_t coefficients[SAGEJS_SMALLJAC_MAX_GENUS];
} sagejs_smalljac_lpoly_row;

typedef struct {
    int32_t status;
    int64_t upstream_status;
    uint8_t genus;
    uint8_t truncated;
    size_t row_count;
    size_t required_rows;
    sagejs_smalljac_lpoly_row *rows;
} sagejs_smalljac_lpoly_batch;

typedef struct {
    uint64_t prime;
    uint8_t good;
    uint8_t invariant_count;
    int32_t status;
    uint64_t invariants[SAGEJS_SMALLJAC_MAX_GROUP_RANK];
} sagejs_smalljac_group_row;

typedef struct {
    int32_t status;
    int64_t upstream_status;
    uint8_t genus;
    uint8_t truncated;
    size_t row_count;
    size_t required_rows;
    sagejs_smalljac_group_row *rows;
} sagejs_smalljac_group_batch;

int sagejs_smalljac_available(void);
const char *sagejs_smalljac_backend_version(void);
const char *sagejs_smalljac_status_name(int32_t status);

/* `maximum_rows == 0` means no caller-imposed output limit.  A finite limit
 * truncates stored rows but still traverses the interval to report the exact
 * `required_rows`.  All emitted callbacks, including bad primes, are aligned
 * one-for-one with rows. */
int32_t sagejs_smalljac_lpoly_batch_compute(
    const char *curve_text,
    uint64_t start,
    uint64_t stop,
    size_t maximum_rows,
    sagejs_smalljac_lpoly_batch *result);
void sagejs_smalljac_lpoly_batch_clear(sagejs_smalljac_lpoly_batch *result);

int32_t sagejs_smalljac_group_batch_compute(
    const char *curve_text,
    uint64_t start,
    uint64_t stop,
    size_t maximum_rows,
    sagejs_smalljac_group_batch *result);
void sagejs_smalljac_group_batch_clear(sagejs_smalljac_group_batch *result);

/* smalljac/ffpoly use process-global finite-field state.  Existing elliptic
 * consumers share this lock with the hyperelliptic boundary. */
void sagejs_smalljac_lock(void);
void sagejs_smalljac_unlock(void);

#ifdef __cplusplus
}
#endif

#endif
