#ifndef SAGEJS_ALGEBRAIC_CORE_H
#define SAGEJS_ALGEBRAIC_CORE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SAGEJS_ALGEBRAIC_MAX_VALUES UINT32_C(4095)
#define SAGEJS_ALGEBRAIC_MAX_DEGREE UINT32_C(256)
#define SAGEJS_ALGEBRAIC_MAX_PACKED_BYTES UINT32_C(1048576)
#define SAGEJS_ALGEBRAIC_MAX_MATRICES UINT32_C(255)
#define SAGEJS_ALGEBRAIC_MAX_MATRIX_DIMENSION UINT32_C(128)
#define SAGEJS_ALGEBRAIC_MAX_MATRIX_ENTRIES UINT32_C(4096)

enum sagejs_algebraic_status
{
    SAGEJS_ALGEBRAIC_OK = 0,
    SAGEJS_ALGEBRAIC_INVALID_ARGUMENT = 1,
    SAGEJS_ALGEBRAIC_INVALID_HANDLE = 2,
    SAGEJS_ALGEBRAIC_RESOURCE_LIMIT = 3,
    SAGEJS_ALGEBRAIC_DIVISION_BY_ZERO = 4,
    SAGEJS_ALGEBRAIC_NOT_REAL = 5,
    SAGEJS_ALGEBRAIC_BUFFER_TOO_SMALL = 6,
    SAGEJS_ALGEBRAIC_ALLOCATION_FAILED = 7,
    SAGEJS_ALGEBRAIC_MALFORMED_ENCODING = 8
};

enum sagejs_algebraic_unary_operation
{
    SAGEJS_ALGEBRAIC_NEG = 1,
    SAGEJS_ALGEBRAIC_SQRT = 2,
    SAGEJS_ALGEBRAIC_REAL = 3,
    SAGEJS_ALGEBRAIC_IMAG = 4,
    SAGEJS_ALGEBRAIC_CONJUGATE = 5,
    SAGEJS_ALGEBRAIC_ABS = 6
};

enum sagejs_algebraic_binary_operation
{
    SAGEJS_ALGEBRAIC_ADD = 1,
    SAGEJS_ALGEBRAIC_SUB = 2,
    SAGEJS_ALGEBRAIC_MUL = 3,
    SAGEJS_ALGEBRAIC_DIV = 4
};

enum sagejs_algebraic_property
{
    SAGEJS_ALGEBRAIC_IS_REAL = 1,
    SAGEJS_ALGEBRAIC_IS_RATIONAL = 2,
    SAGEJS_ALGEBRAIC_DEGREE = 3
};

enum sagejs_algebraic_matrix_binary_operation
{
    SAGEJS_ALGEBRAIC_MATRIX_ADD = 1,
    SAGEJS_ALGEBRAIC_MATRIX_SUB = 2,
    SAGEJS_ALGEBRAIC_MATRIX_MUL = 3
};

enum sagejs_algebraic_matrix_unary_operation
{
    SAGEJS_ALGEBRAIC_MATRIX_NEG = 1,
    SAGEJS_ALGEBRAIC_MATRIX_TRANSPOSE = 2,
    SAGEJS_ALGEBRAIC_MATRIX_RREF = 3,
    SAGEJS_ALGEBRAIC_MATRIX_INVERSE = 4
};

typedef struct sagejs_algebraic_context sagejs_algebraic_context;

sagejs_algebraic_context *sagejs_algebraic_context_create(void);
void sagejs_algebraic_context_destroy(sagejs_algebraic_context *context);
uint32_t sagejs_algebraic_live_count(const sagejs_algebraic_context *context);

int sagejs_algebraic_close(
    sagejs_algebraic_context *context,
    uint32_t handle);

int sagejs_algebraic_from_rational(
    sagejs_algebraic_context *context,
    const uint8_t *packed,
    uint32_t packed_length,
    uint32_t *handle);

int sagejs_algebraic_i(
    sagejs_algebraic_context *context,
    uint32_t *handle);

int sagejs_algebraic_root_of_unity(
    sagejs_algebraic_context *context,
    uint32_t exponent,
    uint32_t order,
    uint32_t *handle);

int sagejs_algebraic_unary(
    sagejs_algebraic_context *context,
    uint32_t operation,
    uint32_t source,
    uint32_t *handle);

int sagejs_algebraic_binary(
    sagejs_algebraic_context *context,
    uint32_t operation,
    uint32_t left,
    uint32_t right,
    uint32_t *handle);

int sagejs_algebraic_pow(
    sagejs_algebraic_context *context,
    uint32_t source,
    const uint8_t *packed_exponent,
    uint32_t packed_length,
    uint32_t *handle);

int sagejs_algebraic_pow_rational(
    sagejs_algebraic_context *context,
    uint32_t source,
    const uint8_t *packed_exponent,
    uint32_t packed_length,
    uint32_t *handle);

int sagejs_algebraic_equal(
    sagejs_algebraic_context *context,
    uint32_t left,
    uint32_t right,
    int32_t *equal);

int sagejs_algebraic_compare_real(
    sagejs_algebraic_context *context,
    uint32_t left,
    uint32_t right,
    int32_t *comparison);

int sagejs_algebraic_property_value(
    sagejs_algebraic_context *context,
    uint32_t handle,
    uint32_t property,
    int32_t *value);

int sagejs_algebraic_polynomial_roots(
    sagejs_algebraic_context *context,
    const uint8_t *packed_coefficients,
    uint32_t packed_length,
    uint32_t *handles,
    uint32_t *multiplicities,
    uint32_t capacity,
    uint32_t *count);

int sagejs_algebraic_minpoly(
    sagejs_algebraic_context *context,
    uint32_t handle,
    uint8_t *output,
    uint32_t capacity,
    uint32_t *output_length);

int sagejs_algebraic_enclosure(
    sagejs_algebraic_context *context,
    uint32_t handle,
    uint32_t precision,
    uint8_t *output,
    uint32_t capacity,
    uint32_t *output_length);

int sagejs_algebraic_format(
    sagejs_algebraic_context *context,
    uint32_t handle,
    uint32_t digits,
    uint8_t *output,
    uint32_t capacity,
    uint32_t *output_length);

int sagejs_algebraic_serialize(
    sagejs_algebraic_context *context,
    uint32_t handle,
    uint8_t *output,
    uint32_t capacity,
    uint32_t *output_length);

int sagejs_algebraic_deserialize(
    sagejs_algebraic_context *context,
    const uint8_t *input,
    uint32_t input_length,
    uint32_t *handle);

/*
 * Bounded dense matrix resources live in the same ownership domain as the
 * qqbar handles used to construct them.  No foreign pointer or FLINT object
 * layout crosses this ABI; matrix entries and results are generation-tagged
 * handles owned by `context`.
 */
uint32_t sagejs_algebraic_matrix_live_count(
    const sagejs_algebraic_context *context);

int sagejs_algebraic_matrix_create(
    sagejs_algebraic_context *context,
    uint32_t rows,
    uint32_t columns,
    const uint32_t *entry_handles,
    uint32_t entry_count,
    int real_only,
    uint32_t *matrix_handle);

int sagejs_algebraic_matrix_close(
    sagejs_algebraic_context *context,
    uint32_t matrix_handle);

int sagejs_algebraic_matrix_binary(
    sagejs_algebraic_context *context,
    uint32_t operation,
    uint32_t left,
    uint32_t right,
    uint32_t *matrix_handle);

int sagejs_algebraic_matrix_unary(
    sagejs_algebraic_context *context,
    uint32_t operation,
    uint32_t source,
    uint32_t *matrix_handle);

int sagejs_algebraic_matrix_scalar_mul(
    sagejs_algebraic_context *context,
    uint32_t source,
    uint32_t scalar,
    uint32_t *matrix_handle);

int sagejs_algebraic_matrix_entry(
    sagejs_algebraic_context *context,
    uint32_t source,
    uint32_t row,
    uint32_t column,
    uint32_t *value_handle);

int sagejs_algebraic_matrix_det(
    sagejs_algebraic_context *context,
    uint32_t source,
    uint32_t *value_handle);

int sagejs_algebraic_matrix_rank(
    sagejs_algebraic_context *context,
    uint32_t source,
    int32_t *rank);

int sagejs_algebraic_matrix_equal(
    sagejs_algebraic_context *context,
    uint32_t left,
    uint32_t right,
    int32_t *equal);

int sagejs_algebraic_matrix_charpoly(
    sagejs_algebraic_context *context,
    uint32_t source,
    uint32_t *coefficient_handles,
    uint32_t capacity,
    uint32_t *count);

#ifdef __cplusplus
}
#endif

#endif
