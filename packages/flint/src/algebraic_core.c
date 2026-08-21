#include "algebraic_core.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

#include <flint/acb.h>
#include <flint/arb.h>
#include <flint/fmpq.h>
#include <flint/fmpz.h>
#include <flint/fmpz_poly.h>
#include <flint/fmpz_poly_factor.h>
#include <flint/gr.h>
#include <flint/gr_mat.h>
#include <flint/gr_poly.h>
#include <flint/qqbar.h>

#define HANDLE_INDEX_BITS UINT32_C(12)
#define HANDLE_INDEX_MASK UINT32_C(0x0fff)
#define HANDLE_GENERATION_MASK UINT32_C(0x000fffff)
#define SERIALIZATION_MAGIC UINT32_C(0x52414251)
#define SERIALIZATION_VERSION UINT32_C(1)
#define MATRIX_HANDLE_INDEX_BITS UINT32_C(8)
#define MATRIX_HANDLE_INDEX_MASK UINT32_C(0x00ff)
#define MATRIX_HANDLE_GENERATION_MASK UINT32_C(0x00ffffff)

typedef struct
{
    uint32_t generation;
    int active;
    qqbar_t value;
} sagejs_algebraic_slot;

typedef struct
{
    uint32_t generation;
    int active;
    int real_only;
    gr_mat_t value;
} sagejs_algebraic_matrix_slot;

struct sagejs_algebraic_context
{
    sagejs_algebraic_slot slots[SAGEJS_ALGEBRAIC_MAX_VALUES];
    uint32_t live_count;
    sagejs_algebraic_matrix_slot matrices[SAGEJS_ALGEBRAIC_MAX_MATRICES];
    uint32_t matrix_live_count;
    gr_ctx_t real_context;
    gr_ctx_t complex_context;
};

typedef struct
{
    qqbar_srcptr value;
    uint32_t multiplicity;
} root_record;

static uint32_t read_u32(const uint8_t *source)
{
    return (uint32_t) source[0] |
        ((uint32_t) source[1] << 8) |
        ((uint32_t) source[2] << 16) |
        ((uint32_t) source[3] << 24);
}

static void write_u32(uint8_t *target, uint32_t value)
{
    target[0] = (uint8_t) value;
    target[1] = (uint8_t) (value >> 8);
    target[2] = (uint8_t) (value >> 16);
    target[3] = (uint8_t) (value >> 24);
}

static int unpack_integer(
    fmpz_t value,
    const uint8_t *source,
    uint32_t length,
    uint32_t *offset)
{
    uint32_t sign;
    uint32_t byte_count;
    uint32_t index;

    if (*offset > length || length - *offset < 8)
        return SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    sign = read_u32(source + *offset);
    byte_count = read_u32(source + *offset + 4);
    *offset += 8;
    if (sign > 1 || byte_count > length - *offset)
        return SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    if (byte_count != 0 && source[*offset + byte_count - 1] == 0)
        return SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    if (byte_count == 0 && sign != 0)
        return SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    fmpz_zero(value);
    for (index = byte_count; index > 0; index--)
    {
        fmpz_mul_2exp(value, value, 8);
        fmpz_add_ui(value, value, source[*offset + index - 1]);
    }
    if (sign != 0)
        fmpz_neg(value, value);
    *offset += byte_count;
    return SAGEJS_ALGEBRAIC_OK;
}

static uint32_t packed_integer_size(const fmpz_t value)
{
    flint_bitcnt_t bits = fmpz_bits(value);
    uint64_t bytes = ((uint64_t) bits + 7) / 8;

    if (bytes > UINT32_MAX - 8)
        return 0;
    return (uint32_t) bytes + 8;
}

static int pack_integer(
    uint8_t *target,
    uint32_t capacity,
    uint32_t *offset,
    const fmpz_t value)
{
    uint32_t size = packed_integer_size(value);
    uint32_t byte_count;
    uint32_t index;
    fmpz_t magnitude;

    if (size == 0 || *offset > capacity || size > capacity - *offset)
        return SAGEJS_ALGEBRAIC_BUFFER_TOO_SMALL;
    byte_count = size - 8;
    write_u32(target + *offset, fmpz_sgn(value) < 0 ? 1 : 0);
    write_u32(target + *offset + 4, byte_count);
    fmpz_init(magnitude);
    fmpz_abs(magnitude, value);
    for (index = 0; index < byte_count; index++)
    {
        target[*offset + 8 + index] = (uint8_t) (fmpz_get_ui(magnitude) & 255);
        fmpz_tdiv_q_2exp(magnitude, magnitude, 8);
    }
    fmpz_clear(magnitude);
    *offset += size;
    return SAGEJS_ALGEBRAIC_OK;
}

static int unpack_polynomial(
    fmpz_poly_t polynomial,
    const uint8_t *source,
    uint32_t length)
{
    uint32_t count;
    uint32_t offset = 4;
    uint32_t index;
    fmpz_t coefficient;
    int status;

    if (source == NULL || length < 4 ||
        length > SAGEJS_ALGEBRAIC_MAX_PACKED_BYTES)
        return SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    count = read_u32(source);
    if (count == 0 || count > SAGEJS_ALGEBRAIC_MAX_DEGREE + 1)
        return SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
    fmpz_init(coefficient);
    for (index = 0; index < count; index++)
    {
        status = unpack_integer(coefficient, source, length, &offset);
        if (status != SAGEJS_ALGEBRAIC_OK)
        {
            fmpz_clear(coefficient);
            return status;
        }
        fmpz_poly_set_coeff_fmpz(polynomial, (slong) index, coefficient);
    }
    fmpz_clear(coefficient);
    if (offset != length)
        return SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    return SAGEJS_ALGEBRAIC_OK;
}

static int pack_polynomial(
    uint8_t *target,
    uint32_t capacity,
    uint32_t *output_length,
    const fmpz_poly_t polynomial)
{
    slong length = fmpz_poly_length(polynomial);
    uint32_t offset = 4;
    slong index;
    int status;

    if (length < 0 || (uint64_t) length > SAGEJS_ALGEBRAIC_MAX_DEGREE + 1 ||
        capacity < 4)
        return SAGEJS_ALGEBRAIC_BUFFER_TOO_SMALL;
    write_u32(target, (uint32_t) length);
    for (index = 0; index < length; index++)
    {
        status = pack_integer(
            target,
            capacity,
            &offset,
            fmpz_poly_get_coeff_ptr(polynomial, index));
        if (status != SAGEJS_ALGEBRAIC_OK)
            return status;
    }
    *output_length = offset;
    return SAGEJS_ALGEBRAIC_OK;
}

static int compare_values(qqbar_srcptr left, qqbar_srcptr right)
{
    int comparison = qqbar_cmp_re(left, right);
    return comparison == 0 ? qqbar_cmp_im(left, right) : comparison;
}

static int compare_records(const void *left_pointer, const void *right_pointer)
{
    const root_record *left = (const root_record *) left_pointer;
    const root_record *right = (const root_record *) right_pointer;
    return compare_values(left->value, right->value);
}

static uint32_t make_handle(uint32_t index, uint32_t generation)
{
    return (generation << HANDLE_INDEX_BITS) | (index + 1);
}

static sagejs_algebraic_slot *lookup(
    sagejs_algebraic_context *context,
    uint32_t handle)
{
    uint32_t encoded_index;
    uint32_t index;
    uint32_t generation;
    sagejs_algebraic_slot *slot;

    if (context == NULL)
        return NULL;
    encoded_index = handle & HANDLE_INDEX_MASK;
    generation = handle >> HANDLE_INDEX_BITS;
    if (encoded_index == 0 || generation == 0)
        return NULL;
    index = encoded_index - 1;
    if (index >= SAGEJS_ALGEBRAIC_MAX_VALUES)
        return NULL;
    slot = context->slots + index;
    if (!slot->active || slot->generation != generation)
        return NULL;
    return slot;
}

static int store_value(
    sagejs_algebraic_context *context,
    qqbar_srcptr value,
    uint32_t *handle)
{
    uint32_t index;
    sagejs_algebraic_slot *slot;

    if (context == NULL || value == NULL || handle == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    for (index = 0; index < SAGEJS_ALGEBRAIC_MAX_VALUES; index++)
    {
        slot = context->slots + index;
        if (!slot->active)
        {
            slot->generation = (slot->generation + 1) & HANDLE_GENERATION_MASK;
            if (slot->generation == 0)
                slot->generation = 1;
            qqbar_init(slot->value);
            qqbar_set(slot->value, value);
            slot->active = 1;
            context->live_count++;
            *handle = make_handle(index, slot->generation);
            return SAGEJS_ALGEBRAIC_OK;
        }
    }
    return SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
}

static gr_ctx_struct *matrix_context(
    sagejs_algebraic_context *context,
    int real_only)
{
    return real_only ? context->real_context : context->complex_context;
}

static uint32_t make_matrix_handle(uint32_t index, uint32_t generation)
{
    return (generation << MATRIX_HANDLE_INDEX_BITS) | (index + 1);
}

static sagejs_algebraic_matrix_slot *lookup_matrix(
    sagejs_algebraic_context *context,
    uint32_t handle)
{
    uint32_t encoded_index;
    uint32_t index;
    uint32_t generation;
    sagejs_algebraic_matrix_slot *slot;

    if (context == NULL)
        return NULL;
    encoded_index = handle & MATRIX_HANDLE_INDEX_MASK;
    generation = handle >> MATRIX_HANDLE_INDEX_BITS;
    if (encoded_index == 0 || generation == 0)
        return NULL;
    index = encoded_index - 1;
    if (index >= SAGEJS_ALGEBRAIC_MAX_MATRICES)
        return NULL;
    slot = context->matrices + index;
    if (!slot->active || slot->generation != generation)
        return NULL;
    return slot;
}

static int valid_matrix_shape(uint32_t rows, uint32_t columns)
{
    return rows <= SAGEJS_ALGEBRAIC_MAX_MATRIX_DIMENSION &&
        columns <= SAGEJS_ALGEBRAIC_MAX_MATRIX_DIMENSION &&
        (uint64_t) rows * columns <= SAGEJS_ALGEBRAIC_MAX_MATRIX_ENTRIES;
}

static int reserve_matrix(
    sagejs_algebraic_context *context,
    uint32_t rows,
    uint32_t columns,
    int real_only,
    sagejs_algebraic_matrix_slot **result_slot,
    uint32_t *result_handle)
{
    uint32_t index;
    sagejs_algebraic_matrix_slot *slot;

    if (context == NULL || result_slot == NULL || result_handle == NULL ||
        !valid_matrix_shape(rows, columns))
        return SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
    for (index = 0; index < SAGEJS_ALGEBRAIC_MAX_MATRICES; index++)
    {
        slot = context->matrices + index;
        if (!slot->active)
        {
            slot->generation =
                (slot->generation + 1) & MATRIX_HANDLE_GENERATION_MASK;
            if (slot->generation == 0)
                slot->generation = 1;
            slot->real_only = real_only != 0;
            gr_mat_init(
                slot->value,
                (slong) rows,
                (slong) columns,
                matrix_context(context, slot->real_only));
            slot->active = 1;
            context->matrix_live_count++;
            *result_slot = slot;
            *result_handle = make_matrix_handle(index, slot->generation);
            return SAGEJS_ALGEBRAIC_OK;
        }
    }
    return SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
}

sagejs_algebraic_context *sagejs_algebraic_context_create(void)
{
    sagejs_algebraic_context *context =
        (sagejs_algebraic_context *) calloc(1, sizeof(sagejs_algebraic_context));
    if (context != NULL)
    {
        gr_ctx_init_real_qqbar(context->real_context);
        gr_ctx_init_complex_qqbar(context->complex_context);
    }
    return context;
}

void sagejs_algebraic_context_destroy(sagejs_algebraic_context *context)
{
    uint32_t index;
    if (context == NULL)
        return;
    for (index = 0; index < SAGEJS_ALGEBRAIC_MAX_VALUES; index++)
    {
        if (context->slots[index].active)
            qqbar_clear(context->slots[index].value);
    }
    for (index = 0; index < SAGEJS_ALGEBRAIC_MAX_MATRICES; index++)
    {
        sagejs_algebraic_matrix_slot *slot = context->matrices + index;
        if (slot->active)
            gr_mat_clear(slot->value, matrix_context(context, slot->real_only));
    }
    gr_ctx_clear(context->complex_context);
    gr_ctx_clear(context->real_context);
    free(context);
}

uint32_t sagejs_algebraic_live_count(const sagejs_algebraic_context *context)
{
    return context == NULL ? 0 : context->live_count;
}

int sagejs_algebraic_close(sagejs_algebraic_context *context, uint32_t handle)
{
    sagejs_algebraic_slot *slot = lookup(context, handle);
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    qqbar_clear(slot->value);
    slot->active = 0;
    context->live_count--;
    return SAGEJS_ALGEBRAIC_OK;
}

int sagejs_algebraic_from_rational(
    sagejs_algebraic_context *context,
    const uint8_t *packed,
    uint32_t packed_length,
    uint32_t *handle)
{
    uint32_t offset = 4;
    fmpz_t numerator;
    fmpz_t denominator;
    fmpq_t rational;
    qqbar_t value;
    int status;

    if (packed == NULL || packed_length < 4 || read_u32(packed) != 2)
        return SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    fmpz_init(numerator);
    fmpz_init(denominator);
    fmpq_init(rational);
    qqbar_init(value);
    status = unpack_integer(numerator, packed, packed_length, &offset);
    if (status == SAGEJS_ALGEBRAIC_OK)
        status = unpack_integer(denominator, packed, packed_length, &offset);
    if (status == SAGEJS_ALGEBRAIC_OK && offset != packed_length)
        status = SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    if (status == SAGEJS_ALGEBRAIC_OK && fmpz_is_zero(denominator))
        status = SAGEJS_ALGEBRAIC_DIVISION_BY_ZERO;
    if (status == SAGEJS_ALGEBRAIC_OK)
    {
        fmpq_set_fmpz_frac(rational, numerator, denominator);
        qqbar_set_fmpq(value, rational);
        status = store_value(context, value, handle);
    }
    qqbar_clear(value);
    fmpq_clear(rational);
    fmpz_clear(denominator);
    fmpz_clear(numerator);
    return status;
}

int sagejs_algebraic_i(sagejs_algebraic_context *context, uint32_t *handle)
{
    qqbar_t value;
    int status;
    qqbar_init(value);
    qqbar_i(value);
    status = store_value(context, value, handle);
    qqbar_clear(value);
    return status;
}

int sagejs_algebraic_root_of_unity(
    sagejs_algebraic_context *context,
    uint32_t exponent,
    uint32_t order,
    uint32_t *handle)
{
    qqbar_t value;
    int status;
    if (order == 0)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    qqbar_init(value);
    qqbar_root_of_unity(value, (slong) (exponent % order), (ulong) order);
    status = store_value(context, value, handle);
    qqbar_clear(value);
    return status;
}

int sagejs_algebraic_unary(
    sagejs_algebraic_context *context,
    uint32_t operation,
    uint32_t source,
    uint32_t *handle)
{
    sagejs_algebraic_slot *slot = lookup(context, source);
    qqbar_t result;
    int status;
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    qqbar_init(result);
    switch (operation)
    {
        case SAGEJS_ALGEBRAIC_NEG: qqbar_neg(result, slot->value); break;
        case SAGEJS_ALGEBRAIC_SQRT: qqbar_sqrt(result, slot->value); break;
        case SAGEJS_ALGEBRAIC_REAL: qqbar_re(result, slot->value); break;
        case SAGEJS_ALGEBRAIC_IMAG: qqbar_im(result, slot->value); break;
        case SAGEJS_ALGEBRAIC_CONJUGATE: qqbar_conj(result, slot->value); break;
        case SAGEJS_ALGEBRAIC_ABS: qqbar_abs(result, slot->value); break;
        default:
            qqbar_clear(result);
            return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    }
    status = store_value(context, result, handle);
    qqbar_clear(result);
    return status;
}

int sagejs_algebraic_binary(
    sagejs_algebraic_context *context,
    uint32_t operation,
    uint32_t left,
    uint32_t right,
    uint32_t *handle)
{
    sagejs_algebraic_slot *left_slot = lookup(context, left);
    sagejs_algebraic_slot *right_slot = lookup(context, right);
    qqbar_t result;
    int status;
    if (left_slot == NULL || right_slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (operation == SAGEJS_ALGEBRAIC_DIV && qqbar_is_zero(right_slot->value))
        return SAGEJS_ALGEBRAIC_DIVISION_BY_ZERO;
    qqbar_init(result);
    switch (operation)
    {
        case SAGEJS_ALGEBRAIC_ADD:
            qqbar_add(result, left_slot->value, right_slot->value);
            break;
        case SAGEJS_ALGEBRAIC_SUB:
            qqbar_sub(result, left_slot->value, right_slot->value);
            break;
        case SAGEJS_ALGEBRAIC_MUL:
            qqbar_mul(result, left_slot->value, right_slot->value);
            break;
        case SAGEJS_ALGEBRAIC_DIV:
            qqbar_div(result, left_slot->value, right_slot->value);
            break;
        default:
            qqbar_clear(result);
            return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    }
    status = store_value(context, result, handle);
    qqbar_clear(result);
    return status;
}

int sagejs_algebraic_pow(
    sagejs_algebraic_context *context,
    uint32_t source,
    const uint8_t *packed_exponent,
    uint32_t packed_length,
    uint32_t *handle)
{
    sagejs_algebraic_slot *slot = lookup(context, source);
    uint32_t offset = 4;
    fmpz_t exponent;
    qqbar_t result;
    int status;
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (packed_exponent == NULL || packed_length < 4 ||
        read_u32(packed_exponent) != 1)
        return SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    fmpz_init(exponent);
    qqbar_init(result);
    status = unpack_integer(exponent, packed_exponent, packed_length, &offset);
    if (status == SAGEJS_ALGEBRAIC_OK && offset != packed_length)
        status = SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    if (status == SAGEJS_ALGEBRAIC_OK && qqbar_is_zero(slot->value) &&
        fmpz_sgn(exponent) < 0)
        status = SAGEJS_ALGEBRAIC_DIVISION_BY_ZERO;
    if (status == SAGEJS_ALGEBRAIC_OK)
    {
        qqbar_pow_fmpz(result, slot->value, exponent);
        status = store_value(context, result, handle);
    }
    qqbar_clear(result);
    fmpz_clear(exponent);
    return status;
}

int sagejs_algebraic_pow_rational(
    sagejs_algebraic_context *context,
    uint32_t source,
    const uint8_t *packed_exponent,
    uint32_t packed_length,
    uint32_t *handle)
{
    sagejs_algebraic_slot *slot = lookup(context, source);
    uint32_t offset = 4;
    fmpz_t numerator;
    fmpz_t denominator;
    fmpq_t exponent;
    qqbar_t result;
    int status;
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (packed_exponent == NULL || packed_length < 4 ||
        read_u32(packed_exponent) != 2)
        return SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    fmpz_init(numerator);
    fmpz_init(denominator);
    fmpq_init(exponent);
    qqbar_init(result);
    status = unpack_integer(numerator, packed_exponent, packed_length, &offset);
    if (status == SAGEJS_ALGEBRAIC_OK)
        status = unpack_integer(denominator, packed_exponent, packed_length, &offset);
    if (status == SAGEJS_ALGEBRAIC_OK && offset != packed_length)
        status = SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    if (status == SAGEJS_ALGEBRAIC_OK && fmpz_is_zero(denominator))
        status = SAGEJS_ALGEBRAIC_DIVISION_BY_ZERO;
    if (status == SAGEJS_ALGEBRAIC_OK)
    {
        fmpq_set_fmpz_frac(exponent, numerator, denominator);
        if (qqbar_is_zero(slot->value) && fmpq_sgn(exponent) < 0)
            status = SAGEJS_ALGEBRAIC_DIVISION_BY_ZERO;
        else
        {
            qqbar_pow_fmpq(result, slot->value, exponent);
            status = store_value(context, result, handle);
        }
    }
    qqbar_clear(result);
    fmpq_clear(exponent);
    fmpz_clear(denominator);
    fmpz_clear(numerator);
    return status;
}

int sagejs_algebraic_equal(
    sagejs_algebraic_context *context,
    uint32_t left,
    uint32_t right,
    int32_t *equal)
{
    sagejs_algebraic_slot *left_slot = lookup(context, left);
    sagejs_algebraic_slot *right_slot = lookup(context, right);
    if (left_slot == NULL || right_slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (equal == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    *equal = qqbar_equal(left_slot->value, right_slot->value) ? 1 : 0;
    return SAGEJS_ALGEBRAIC_OK;
}

int sagejs_algebraic_compare_real(
    sagejs_algebraic_context *context,
    uint32_t left,
    uint32_t right,
    int32_t *comparison)
{
    sagejs_algebraic_slot *left_slot = lookup(context, left);
    sagejs_algebraic_slot *right_slot = lookup(context, right);
    if (left_slot == NULL || right_slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (!qqbar_is_real(left_slot->value) || !qqbar_is_real(right_slot->value))
        return SAGEJS_ALGEBRAIC_NOT_REAL;
    if (comparison == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    *comparison = qqbar_cmp_re(left_slot->value, right_slot->value);
    return SAGEJS_ALGEBRAIC_OK;
}

int sagejs_algebraic_property_value(
    sagejs_algebraic_context *context,
    uint32_t handle,
    uint32_t property,
    int32_t *value)
{
    sagejs_algebraic_slot *slot = lookup(context, handle);
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (value == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    switch (property)
    {
        case SAGEJS_ALGEBRAIC_IS_REAL:
            *value = qqbar_is_real(slot->value) ? 1 : 0;
            break;
        case SAGEJS_ALGEBRAIC_IS_RATIONAL:
            *value = qqbar_is_rational(slot->value) ? 1 : 0;
            break;
        case SAGEJS_ALGEBRAIC_DEGREE:
            *value = (int32_t) qqbar_degree(slot->value);
            break;
        default:
            return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    }
    return SAGEJS_ALGEBRAIC_OK;
}

int sagejs_algebraic_polynomial_roots(
    sagejs_algebraic_context *context,
    const uint8_t *packed_coefficients,
    uint32_t packed_length,
    uint32_t *handles,
    uint32_t *multiplicities,
    uint32_t capacity,
    uint32_t *count)
{
    fmpz_poly_t polynomial;
    fmpz_poly_factor_t factors;
    qqbar_ptr roots = NULL;
    root_record *records = NULL;
    slong distinct_degree = 0;
    slong offset = 0;
    slong factor_index;
    slong index;
    uint32_t stored = 0;
    int status;

    if (context == NULL || handles == NULL || multiplicities == NULL || count == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    fmpz_poly_init(polynomial);
    fmpz_poly_factor_init(factors);
    status = unpack_polynomial(polynomial, packed_coefficients, packed_length);
    if (status != SAGEJS_ALGEBRAIC_OK)
        goto cleanup;
    if (fmpz_poly_is_zero(polynomial))
    {
        status = SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
        goto cleanup;
    }
    if (fmpz_poly_degree(polynomial) == 0)
    {
        *count = 0;
        status = SAGEJS_ALGEBRAIC_OK;
        goto cleanup;
    }
    fmpz_poly_factor_squarefree(factors, polynomial);
    for (factor_index = 0; factor_index < factors->num; factor_index++)
        distinct_degree += fmpz_poly_degree(factors->p + factor_index);
    if (distinct_degree < 0 || (uint64_t) distinct_degree > capacity ||
        (uint64_t) distinct_degree > SAGEJS_ALGEBRAIC_MAX_DEGREE ||
        context->live_count + (uint32_t) distinct_degree > SAGEJS_ALGEBRAIC_MAX_VALUES)
    {
        status = SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
        goto cleanup;
    }
    roots = _qqbar_vec_init(distinct_degree);
    records = (root_record *) malloc((size_t) distinct_degree * sizeof(root_record));
    if (records == NULL)
    {
        status = SAGEJS_ALGEBRAIC_ALLOCATION_FAILED;
        goto cleanup;
    }
    for (factor_index = 0; factor_index < factors->num; factor_index++)
    {
        slong factor_degree = fmpz_poly_degree(factors->p + factor_index);
        qqbar_roots_fmpz_poly(roots + offset, factors->p + factor_index, 0);
        for (index = 0; index < factor_degree; index++)
        {
            records[offset + index].value = roots + offset + index;
            records[offset + index].multiplicity =
                (uint32_t) factors->exp[factor_index];
        }
        offset += factor_degree;
    }
    qsort(records, (size_t) distinct_degree, sizeof(root_record), compare_records);
    for (index = 0; index < distinct_degree; index++)
    {
        status = store_value(context, records[index].value, handles + index);
        if (status != SAGEJS_ALGEBRAIC_OK)
            goto cleanup_stored;
        multiplicities[index] = records[index].multiplicity;
        stored++;
    }
    *count = (uint32_t) distinct_degree;
    status = SAGEJS_ALGEBRAIC_OK;
    goto cleanup;

cleanup_stored:
    while (stored > 0)
    {
        stored--;
        sagejs_algebraic_close(context, handles[stored]);
    }
cleanup:
    free(records);
    if (roots != NULL)
        _qqbar_vec_clear(roots, distinct_degree);
    fmpz_poly_factor_clear(factors);
    fmpz_poly_clear(polynomial);
    return status;
}

int sagejs_algebraic_minpoly(
    sagejs_algebraic_context *context,
    uint32_t handle,
    uint8_t *output,
    uint32_t capacity,
    uint32_t *output_length)
{
    sagejs_algebraic_slot *slot = lookup(context, handle);
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (output == NULL || output_length == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    return pack_polynomial(
        output,
        capacity,
        output_length,
        QQBAR_POLY(slot->value));
}

int sagejs_algebraic_enclosure(
    sagejs_algebraic_context *context,
    uint32_t handle,
    uint32_t precision,
    uint8_t *output,
    uint32_t capacity,
    uint32_t *output_length)
{
    sagejs_algebraic_slot *slot = lookup(context, handle);
    acb_t enclosure;
    fmpz_t values[6];
    uint32_t offset = 4;
    int index;
    int status = SAGEJS_ALGEBRAIC_OK;
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (output == NULL || output_length == NULL || precision < 2 ||
        precision > UINT32_C(1000000) || capacity < 4)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    acb_init(enclosure);
    for (index = 0; index < 6; index++)
        fmpz_init(values[index]);
    qqbar_get_acb(enclosure, slot->value, (slong) precision);
    arb_get_interval_fmpz_2exp(values[0], values[1], values[2], acb_realref(enclosure));
    arb_get_interval_fmpz_2exp(values[3], values[4], values[5], acb_imagref(enclosure));
    write_u32(output, 6);
    for (index = 0; index < 6 && status == SAGEJS_ALGEBRAIC_OK; index++)
        status = pack_integer(output, capacity, &offset, values[index]);
    if (status == SAGEJS_ALGEBRAIC_OK)
        *output_length = offset;
    for (index = 0; index < 6; index++)
        fmpz_clear(values[index]);
    acb_clear(enclosure);
    return status;
}

int sagejs_algebraic_format(
    sagejs_algebraic_context *context,
    uint32_t handle,
    uint32_t digits,
    uint8_t *output,
    uint32_t capacity,
    uint32_t *output_length)
{
    sagejs_algebraic_slot *slot = lookup(context, handle);
    qqbar_srcptr value;
    slong display_digits;
    char *text = NULL;
    size_t length;
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (output == NULL || output_length == NULL || digits == 0 || digits > 1000000)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    value = slot->value;
    display_digits = (slong) digits;
    if (qqbar_is_rational(value))
    {
        fmpq_t rational;
        fmpq_init(rational);
        qqbar_get_fmpq(rational, value);
        text = fmpq_get_str(NULL, 10, rational);
        fmpq_clear(rational);
    }
    else
    {
        /* Preserve the native backend's exact Gaussian-rational display. */
        if (qqbar_degree(value) <= 2)
        {
            qqbar_t real_part;
            qqbar_t imag_part;
            qqbar_init(real_part);
            qqbar_init(imag_part);
            qqbar_re_im(real_part, imag_part, value);
            if (qqbar_is_rational(real_part) && qqbar_is_rational(imag_part))
            {
                fmpq_t real_rational;
                fmpq_t real_absolute;
                fmpq_t imag_rational;
                fmpq_t imag_absolute;
                char *real_text;
                char *imag_text;
                const char *imag_coefficient;
                const char *sign;
                size_t size;
                fmpq_init(real_rational);
                fmpq_init(real_absolute);
                fmpq_init(imag_rational);
                fmpq_init(imag_absolute);
                qqbar_get_fmpq(real_rational, real_part);
                qqbar_get_fmpq(imag_rational, imag_part);
                fmpq_abs(real_absolute, real_rational);
                fmpq_abs(imag_absolute, imag_rational);
                real_text = fmpq_get_str(NULL, 10, real_absolute);
                imag_text = fmpq_get_str(NULL, 10, imag_absolute);
                imag_coefficient = fmpq_is_one(imag_absolute) ? "" : imag_text;
                sign = fmpq_sgn(imag_rational) < 0 ? "-" : "";
                size = strlen(real_text) + strlen(imag_text) + 8;
                text = (char *) flint_malloc(size);
                if (fmpq_is_zero(real_rational))
                    flint_sprintf(
                        text, "%s%s%sI", sign, imag_coefficient,
                        *imag_coefficient == '\0' ? "" : "*");
                else
                    flint_sprintf(
                        text, "%s%s%sI %s %s", sign, imag_coefficient,
                        *imag_coefficient == '\0' ? "" : "*",
                        fmpq_sgn(real_rational) < 0 ? "-" : "+", real_text);
                flint_free(real_text);
                flint_free(imag_text);
                fmpq_clear(real_rational);
                fmpq_clear(real_absolute);
                fmpq_clear(imag_rational);
                fmpq_clear(imag_absolute);
            }
            qqbar_clear(real_part);
            qqbar_clear(imag_part);
        }
        if (text == NULL)
        {
            acb_t approximation;
            arb_t imag_absolute;
            char *real_text;
            char *imag_text;
            int real_sign = qqbar_sgn_re(value);
            int imag_sign = qqbar_sgn_im(value);
            slong precision = (slong) ceil(
                (double) display_digits * 3.321928094887363) + 16;
            size_t size;
            acb_init(approximation);
            arb_init(imag_absolute);
            qqbar_get_acb(approximation, value, precision);
            arb_abs(imag_absolute, acb_imagref(approximation));
            real_text = arb_get_str(
                acb_realref(approximation), display_digits, ARB_STR_NO_RADIUS);
            imag_text = arb_get_str(
                imag_absolute, display_digits, ARB_STR_NO_RADIUS);
            if (imag_sign == 0)
            {
                text = real_text;
                real_text = NULL;
            }
            else
            {
                size = strlen(real_text) + strlen(imag_text) + 8;
                text = (char *) flint_malloc(size);
                if (real_sign == 0)
                    flint_sprintf(
                        text, "%s%s*I", imag_sign < 0 ? "-" : "", imag_text);
                else
                    flint_sprintf(
                        text, "%s %s %s*I", real_text,
                        imag_sign < 0 ? "-" : "+", imag_text);
            }
            flint_free(real_text);
            flint_free(imag_text);
            arb_clear(imag_absolute);
            acb_clear(approximation);
        }
    }
    if (text == NULL)
        return SAGEJS_ALGEBRAIC_ALLOCATION_FAILED;
    length = strlen(text);
    if (length > capacity)
    {
        flint_free(text);
        return SAGEJS_ALGEBRAIC_BUFFER_TOO_SMALL;
    }
    memcpy(output, text, length);
    *output_length = (uint32_t) length;
    flint_free(text);
    return SAGEJS_ALGEBRAIC_OK;
}

static int sorted_minpoly_roots(
    qqbar_ptr *roots_pointer,
    root_record **records_pointer,
    const fmpz_poly_t polynomial)
{
    slong degree = fmpz_poly_degree(polynomial);
    slong index;
    qqbar_ptr roots;
    root_record *records;
    if (degree <= 0 || (uint64_t) degree > SAGEJS_ALGEBRAIC_MAX_DEGREE)
        return SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
    roots = _qqbar_vec_init(degree);
    records = (root_record *) malloc((size_t) degree * sizeof(root_record));
    if (records == NULL)
    {
        _qqbar_vec_clear(roots, degree);
        return SAGEJS_ALGEBRAIC_ALLOCATION_FAILED;
    }
    qqbar_roots_fmpz_poly(roots, polynomial, 0);
    for (index = 0; index < degree; index++)
    {
        records[index].value = roots + index;
        records[index].multiplicity = 1;
    }
    qsort(records, (size_t) degree, sizeof(root_record), compare_records);
    *roots_pointer = roots;
    *records_pointer = records;
    return SAGEJS_ALGEBRAIC_OK;
}

int sagejs_algebraic_serialize(
    sagejs_algebraic_context *context,
    uint32_t handle,
    uint8_t *output,
    uint32_t capacity,
    uint32_t *output_length)
{
    sagejs_algebraic_slot *slot = lookup(context, handle);
    qqbar_ptr roots = NULL;
    root_record *records = NULL;
    slong degree;
    slong index;
    uint32_t polynomial_length;
    int status;
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (output == NULL || output_length == NULL || capacity < 16)
        return SAGEJS_ALGEBRAIC_BUFFER_TOO_SMALL;
    degree = qqbar_degree(slot->value);
    status = sorted_minpoly_roots(&roots, &records, QQBAR_POLY(slot->value));
    if (status != SAGEJS_ALGEBRAIC_OK)
        return status;
    for (index = 0; index < degree; index++)
        if (compare_values(records[index].value, slot->value) == 0)
            break;
    if (index == degree)
    {
        status = SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
        goto cleanup;
    }
    status = pack_polynomial(
        output + 16,
        capacity - 16,
        &polynomial_length,
        QQBAR_POLY(slot->value));
    if (status == SAGEJS_ALGEBRAIC_OK)
    {
        write_u32(output, SERIALIZATION_MAGIC);
        write_u32(output + 4, SERIALIZATION_VERSION);
        write_u32(output + 8, (uint32_t) index);
        write_u32(output + 12, polynomial_length);
        *output_length = 16 + polynomial_length;
    }
cleanup:
    free(records);
    _qqbar_vec_clear(roots, degree);
    return status;
}

int sagejs_algebraic_deserialize(
    sagejs_algebraic_context *context,
    const uint8_t *input,
    uint32_t input_length,
    uint32_t *handle)
{
    fmpz_poly_t polynomial;
    qqbar_ptr roots = NULL;
    root_record *records = NULL;
    uint32_t index;
    uint32_t polynomial_length;
    slong degree;
    int status;
    if (input == NULL || handle == NULL || input_length < 16 ||
        read_u32(input) != SERIALIZATION_MAGIC ||
        read_u32(input + 4) != SERIALIZATION_VERSION)
        return SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    index = read_u32(input + 8);
    polynomial_length = read_u32(input + 12);
    if (polynomial_length != input_length - 16)
        return SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    fmpz_poly_init(polynomial);
    status = unpack_polynomial(polynomial, input + 16, polynomial_length);
    degree = fmpz_poly_degree(polynomial);
    if (status == SAGEJS_ALGEBRAIC_OK &&
        (degree <= 0 || (uint64_t) index >= (uint64_t) degree))
        status = SAGEJS_ALGEBRAIC_MALFORMED_ENCODING;
    if (status == SAGEJS_ALGEBRAIC_OK)
        status = sorted_minpoly_roots(&roots, &records, polynomial);
    if (status == SAGEJS_ALGEBRAIC_OK)
        status = store_value(context, records[index].value, handle);
    free(records);
    if (roots != NULL)
        _qqbar_vec_clear(roots, degree);
    fmpz_poly_clear(polynomial);
    return status;
}

uint32_t sagejs_algebraic_matrix_live_count(
    const sagejs_algebraic_context *context)
{
    return context == NULL ? 0 : context->matrix_live_count;
}

int sagejs_algebraic_matrix_create(
    sagejs_algebraic_context *context,
    uint32_t rows,
    uint32_t columns,
    const uint32_t *entry_handles,
    uint32_t entry_count,
    int real_only,
    uint32_t *matrix_handle)
{
    sagejs_algebraic_matrix_slot *matrix_slot;
    gr_ctx_struct *gr_context;
    uint32_t index;
    int status;

    if (entry_handles == NULL || matrix_handle == NULL ||
        (uint64_t) rows * columns != entry_count)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    if (!valid_matrix_shape(rows, columns))
        return SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
    for (index = 0; index < entry_count; index++)
    {
        sagejs_algebraic_slot *entry = lookup(context, entry_handles[index]);
        if (entry == NULL)
            return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
        if (real_only && !qqbar_is_real(entry->value))
            return SAGEJS_ALGEBRAIC_NOT_REAL;
    }
    status = reserve_matrix(
        context, rows, columns, real_only, &matrix_slot, matrix_handle);
    if (status != SAGEJS_ALGEBRAIC_OK)
        return status;
    gr_context = matrix_context(context, matrix_slot->real_only);
    for (index = 0; index < entry_count; index++)
    {
        sagejs_algebraic_slot *entry = lookup(context, entry_handles[index]);
        qqbar_set(
            (qqbar_ptr) gr_mat_entry_ptr(
                matrix_slot->value,
                (slong) (index / columns),
                (slong) (index % columns),
                gr_context),
            entry->value);
    }
    return SAGEJS_ALGEBRAIC_OK;
}

int sagejs_algebraic_matrix_close(
    sagejs_algebraic_context *context,
    uint32_t matrix_handle)
{
    sagejs_algebraic_matrix_slot *slot = lookup_matrix(context, matrix_handle);
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    gr_mat_clear(slot->value, matrix_context(context, slot->real_only));
    slot->active = 0;
    context->matrix_live_count--;
    return SAGEJS_ALGEBRAIC_OK;
}

int sagejs_algebraic_matrix_binary(
    sagejs_algebraic_context *context,
    uint32_t operation,
    uint32_t left,
    uint32_t right,
    uint32_t *matrix_handle)
{
    sagejs_algebraic_matrix_slot *left_slot = lookup_matrix(context, left);
    sagejs_algebraic_matrix_slot *right_slot = lookup_matrix(context, right);
    sagejs_algebraic_matrix_slot *result_slot;
    gr_ctx_struct *gr_context;
    uint32_t rows;
    uint32_t columns;
    int gr_status;
    int status;

    if (left_slot == NULL || right_slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (left_slot->real_only != right_slot->real_only)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    rows = (uint32_t) left_slot->value->r;
    if (operation == SAGEJS_ALGEBRAIC_MATRIX_MUL)
    {
        if (left_slot->value->c != right_slot->value->r)
            return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
        columns = (uint32_t) right_slot->value->c;
    }
    else
    {
        if (left_slot->value->r != right_slot->value->r ||
            left_slot->value->c != right_slot->value->c)
            return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
        columns = (uint32_t) left_slot->value->c;
    }
    status = reserve_matrix(
        context, rows, columns, left_slot->real_only,
        &result_slot, matrix_handle);
    if (status != SAGEJS_ALGEBRAIC_OK)
        return status;
    gr_context = matrix_context(context, left_slot->real_only);
    switch (operation)
    {
        case SAGEJS_ALGEBRAIC_MATRIX_ADD:
            gr_status = gr_mat_add(
                result_slot->value, left_slot->value, right_slot->value,
                gr_context);
            break;
        case SAGEJS_ALGEBRAIC_MATRIX_SUB:
            gr_status = gr_mat_sub(
                result_slot->value, left_slot->value, right_slot->value,
                gr_context);
            break;
        case SAGEJS_ALGEBRAIC_MATRIX_MUL:
            gr_status = gr_mat_mul(
                result_slot->value, left_slot->value, right_slot->value,
                gr_context);
            break;
        default:
            gr_status = GR_UNABLE;
            break;
    }
    if (gr_status != GR_SUCCESS)
    {
        sagejs_algebraic_matrix_close(context, *matrix_handle);
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    }
    return SAGEJS_ALGEBRAIC_OK;
}

int sagejs_algebraic_matrix_unary(
    sagejs_algebraic_context *context,
    uint32_t operation,
    uint32_t source,
    uint32_t *matrix_handle)
{
    sagejs_algebraic_matrix_slot *source_slot = lookup_matrix(context, source);
    sagejs_algebraic_matrix_slot *result_slot;
    gr_ctx_struct *gr_context;
    uint32_t rows;
    uint32_t columns;
    slong rank;
    int gr_status;
    int status;

    if (source_slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    rows = (uint32_t) source_slot->value->r;
    columns = (uint32_t) source_slot->value->c;
    if (operation == SAGEJS_ALGEBRAIC_MATRIX_TRANSPOSE)
    {
        uint32_t temporary = rows;
        rows = columns;
        columns = temporary;
    }
    if (operation == SAGEJS_ALGEBRAIC_MATRIX_INVERSE && rows != columns)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    status = reserve_matrix(
        context, rows, columns, source_slot->real_only,
        &result_slot, matrix_handle);
    if (status != SAGEJS_ALGEBRAIC_OK)
        return status;
    gr_context = matrix_context(context, source_slot->real_only);
    switch (operation)
    {
        case SAGEJS_ALGEBRAIC_MATRIX_NEG:
            gr_status = gr_mat_neg(result_slot->value, source_slot->value, gr_context);
            break;
        case SAGEJS_ALGEBRAIC_MATRIX_TRANSPOSE:
            gr_status = gr_mat_transpose(
                result_slot->value, source_slot->value, gr_context);
            break;
        case SAGEJS_ALGEBRAIC_MATRIX_RREF:
            gr_status = gr_mat_rref(
                &rank, result_slot->value, source_slot->value, gr_context);
            break;
        case SAGEJS_ALGEBRAIC_MATRIX_INVERSE:
            gr_status = gr_mat_inv(
                result_slot->value, source_slot->value, gr_context);
            break;
        default:
            gr_status = GR_UNABLE;
            break;
    }
    if (gr_status != GR_SUCCESS)
    {
        sagejs_algebraic_matrix_close(context, *matrix_handle);
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    }
    return SAGEJS_ALGEBRAIC_OK;
}

int sagejs_algebraic_matrix_scalar_mul(
    sagejs_algebraic_context *context,
    uint32_t source,
    uint32_t scalar,
    uint32_t *matrix_handle)
{
    sagejs_algebraic_matrix_slot *source_slot = lookup_matrix(context, source);
    sagejs_algebraic_slot *scalar_slot = lookup(context, scalar);
    sagejs_algebraic_matrix_slot *result_slot;
    gr_ctx_struct *gr_context;
    int status;

    if (source_slot == NULL || scalar_slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (source_slot->real_only && !qqbar_is_real(scalar_slot->value))
        return SAGEJS_ALGEBRAIC_NOT_REAL;
    status = reserve_matrix(
        context,
        (uint32_t) source_slot->value->r,
        (uint32_t) source_slot->value->c,
        source_slot->real_only,
        &result_slot,
        matrix_handle);
    if (status != SAGEJS_ALGEBRAIC_OK)
        return status;
    gr_context = matrix_context(context, source_slot->real_only);
    if (gr_mat_mul_scalar(
        result_slot->value,
        source_slot->value,
        scalar_slot->value,
        gr_context) != GR_SUCCESS)
    {
        sagejs_algebraic_matrix_close(context, *matrix_handle);
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    }
    return SAGEJS_ALGEBRAIC_OK;
}

int sagejs_algebraic_matrix_entry(
    sagejs_algebraic_context *context,
    uint32_t source,
    uint32_t row,
    uint32_t column,
    uint32_t *value_handle)
{
    sagejs_algebraic_matrix_slot *slot = lookup_matrix(context, source);
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (row >= (uint32_t) slot->value->r || column >= (uint32_t) slot->value->c)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    return store_value(
        context,
        (qqbar_srcptr) gr_mat_entry_srcptr(
            slot->value,
            (slong) row,
            (slong) column,
            matrix_context(context, slot->real_only)),
        value_handle);
}

int sagejs_algebraic_matrix_det(
    sagejs_algebraic_context *context,
    uint32_t source,
    uint32_t *value_handle)
{
    sagejs_algebraic_matrix_slot *slot = lookup_matrix(context, source);
    qqbar_t value;
    int status;
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (slot->value->r != slot->value->c)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    qqbar_init(value);
    if (gr_mat_det(
        value, slot->value, matrix_context(context, slot->real_only)) != GR_SUCCESS)
        status = SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    else
        status = store_value(context, value, value_handle);
    qqbar_clear(value);
    return status;
}

int sagejs_algebraic_matrix_rank(
    sagejs_algebraic_context *context,
    uint32_t source,
    int32_t *rank)
{
    sagejs_algebraic_matrix_slot *slot = lookup_matrix(context, source);
    slong result;
    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (rank == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    if (gr_mat_rank(
        &result, slot->value, matrix_context(context, slot->real_only)) != GR_SUCCESS)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    *rank = (int32_t) result;
    return SAGEJS_ALGEBRAIC_OK;
}

int sagejs_algebraic_matrix_equal(
    sagejs_algebraic_context *context,
    uint32_t left,
    uint32_t right,
    int32_t *equal)
{
    sagejs_algebraic_matrix_slot *left_slot = lookup_matrix(context, left);
    sagejs_algebraic_matrix_slot *right_slot = lookup_matrix(context, right);
    truth_t result;
    if (left_slot == NULL || right_slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (equal == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    if (left_slot->real_only != right_slot->real_only ||
        left_slot->value->r != right_slot->value->r ||
        left_slot->value->c != right_slot->value->c)
    {
        *equal = 0;
        return SAGEJS_ALGEBRAIC_OK;
    }
    result = gr_mat_equal(
        left_slot->value,
        right_slot->value,
        matrix_context(context, left_slot->real_only));
    if (result == T_UNKNOWN)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    *equal = result == T_TRUE ? 1 : 0;
    return SAGEJS_ALGEBRAIC_OK;
}

int sagejs_algebraic_matrix_charpoly(
    sagejs_algebraic_context *context,
    uint32_t source,
    uint32_t *coefficient_handles,
    uint32_t capacity,
    uint32_t *count)
{
    sagejs_algebraic_matrix_slot *slot = lookup_matrix(context, source);
    gr_ctx_struct *gr_context;
    gr_poly_t polynomial;
    slong length;
    uint32_t stored = 0;
    int status = SAGEJS_ALGEBRAIC_OK;

    if (slot == NULL)
        return SAGEJS_ALGEBRAIC_INVALID_HANDLE;
    if (coefficient_handles == NULL || count == NULL ||
        slot->value->r != slot->value->c)
        return SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
    if ((uint64_t) slot->value->r + 1 > capacity)
        return SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
    gr_context = matrix_context(context, slot->real_only);
    gr_poly_init(polynomial, gr_context);
    if (gr_mat_charpoly(polynomial, slot->value, gr_context) != GR_SUCCESS)
    {
        status = SAGEJS_ALGEBRAIC_INVALID_ARGUMENT;
        goto cleanup;
    }
    length = gr_poly_length(polynomial, gr_context);
    if (length < 0 || (uint64_t) length > capacity ||
        context->live_count + (uint32_t) length > SAGEJS_ALGEBRAIC_MAX_VALUES)
    {
        status = SAGEJS_ALGEBRAIC_RESOURCE_LIMIT;
        goto cleanup;
    }
    for (stored = 0; stored < (uint32_t) length; stored++)
    {
        status = store_value(
            context,
            (qqbar_srcptr) gr_poly_coeff_srcptr(
                polynomial, (slong) stored, gr_context),
            coefficient_handles + stored);
        if (status != SAGEJS_ALGEBRAIC_OK)
            goto cleanup_stored;
    }
    *count = (uint32_t) length;
    goto cleanup;

cleanup_stored:
    while (stored > 0)
    {
        stored--;
        sagejs_algebraic_close(context, coefficient_handles[stored]);
    }
cleanup:
    gr_poly_clear(polynomial, gr_context);
    return status;
}
