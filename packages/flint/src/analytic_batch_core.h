#ifndef SAGEJS_ANALYTIC_BATCH_CORE_H
#define SAGEJS_ANALYTIC_BATCH_CORE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SAGEJS_ANALYTIC_PROTOCOL_VERSION UINT32_C(1)
#define SAGEJS_ANALYTIC_MAX_POINTS UINT32_C(100000)
#define SAGEJS_ANALYTIC_MAX_DERIVATIVE UINT32_C(4096)
#define SAGEJS_ANALYTIC_MAX_PRECISION_BITS UINT32_C(1048576)
#define SAGEJS_ANALYTIC_MAX_COMPONENT_BYTES UINT32_C(1048576)

typedef enum
{
    SAGEJS_ANALYTIC_OK = 0,
    SAGEJS_ANALYTIC_INVALID_REQUEST = 1,
    SAGEJS_ANALYTIC_INVALID_INPUT = 2,
    SAGEJS_ANALYTIC_OUTPUT_TOO_SMALL = 3,
    SAGEJS_ANALYTIC_UNSUPPORTED_WORD = 4,
    SAGEJS_ANALYTIC_ALLOCATION_FAILED = 5,
    SAGEJS_ANALYTIC_FLINT_FAILED = 6
} sagejs_analytic_status;

typedef enum
{
    SAGEJS_ANALYTIC_RIEMANN_ZETA_VALUES = 1,
    SAGEJS_ANALYTIC_RIEMANN_ZETA_JET = 2,
    SAGEJS_ANALYTIC_DIRICHLET_L_VALUES = 3,
    SAGEJS_ANALYTIC_RIEMANN_XI_VALUES = 4,
    SAGEJS_ANALYTIC_COMPLEX_GAMMA_VALUES = 5,
    SAGEJS_ANALYTIC_QUADRATIC_ZETA_VALUES = 6,
    SAGEJS_ANALYTIC_QUADRATIC_COMPLETION_VALUES = 7
} sagejs_analytic_operation;

enum
{
    SAGEJS_ANALYTIC_FLAG_DEFLATE = UINT32_C(1),
    SAGEJS_ANALYTIC_FLAG_COMPLETED = UINT32_C(2)
};

enum
{
    SAGEJS_ANALYTIC_VALUE_FINITE = UINT32_C(1),
    SAGEJS_ANALYTIC_VALUE_REAL_EXACT = UINT32_C(2),
    SAGEJS_ANALYTIC_VALUE_IMAG_EXACT = UINT32_C(4),
    SAGEJS_ANALYTIC_VALUE_CONTAINS_ZERO = UINT32_C(8)
};

/*
 * A host-neutral request. External integer widths are fixed even when FLINT's
 * word size differs (notably on wasm32). Unsupported narrowing is reported,
 * never truncated.
 *
 * Input is a sequence of little-endian u32 byte lengths followed by UTF-8
 * decimal strings. Ordinary point operations consume real/imaginary pairs.
 * QUADRATIC_COMPLETION consumes point-real, point-imaginary, raw-real,
 * raw-imaginary quadruples.
 *
 * Output is the versioned SJA1 packet documented by analytic-backend.mjs.
 * Decimal midpoint strings retain the requested arbitrary precision. Each
 * value also carries Arb relative-accuracy and enclosure flags.
 */
typedef struct
{
    uint32_t version;
    uint32_t operation;
    uint32_t point_count;
    uint32_t precision_bits;
    uint32_t derivative;
    uint32_t first_order;
    uint32_t result_count;
    uint32_t flags;
    uint64_t modulus;
    uint64_t character_index;
    int64_t discriminant;
} sagejs_analytic_request;

sagejs_analytic_status sagejs_analytic_execute(
    const sagejs_analytic_request *request,
    const uint8_t *input,
    size_t input_length,
    uint8_t *output,
    size_t output_capacity,
    size_t *output_length);

const char *sagejs_analytic_status_message(sagejs_analytic_status status);

#ifdef __cplusplus
}
#endif

#endif
