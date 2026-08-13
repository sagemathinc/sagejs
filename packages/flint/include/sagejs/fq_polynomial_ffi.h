#ifndef SAGEJS_FQ_POLYNOMIAL_FFI_H
#define SAGEJS_FQ_POLYNOMIAL_FFI_H

#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <flint/flint.h>
#include <flint/fq_default.h>
#include <flint/fq_default_poly.h>
#include <flint/fq_nmod.h>
#include <flint/nmod_poly.h>
#include <flint/nmod_poly_factor.h>
#include <flint/ulong_extras.h>

#include "sagejs/fmpq_matrix_ffi.h"

/*
 * Host-neutral generated-resource ABI for GF(p^n) and GF(p^n)[x].
 *
 * This first production representation uses fq_default forced to fq_nmod.
 * The public ABI remains fq_default-neutral, while the checked word-coordinate
 * ingress deliberately limits this implementation to characteristics fitting
 * a FLINT ulong. Larger characteristics retain the ordinary portable path
 * until exact-integer coordinate ingress is generated.
 *
 * A context state is shared through an explicit retain count. Element and
 * polynomial resources retain it independently, so closing the public context
 * wrapper cannot invalidate a surviving dependent resource. Generated owners
 * still clear each resource exactly once and expose no foreign pointer.
 *
 * The shared reference count and FLINT values are thread-affine. Generated
 * declarations therefore mark every operation `thread_safe=False`; a host
 * must serialize calls, borrows, explicit close, and finalization for one
 * context family on its owning execution thread.
 *
 * The context wrapper is the sole external-memory accounting owner for the
 * shared context allocation; dependents report only their unique storage.
 * Explicitly closing that wrapper while dependents retain the context can
 * therefore temporarily under-report, but never double-count or free, the
 * context allocation until the last dependent closes. If measurements show
 * material GC pressure, the declaration compiler should grow one shared
 * external-memory accounting token for dependent resource families.
 */

typedef struct
{
    fq_default_ctx_t value;
    ulong characteristic;
    slong degree;
    size_t references;
} sagejs_fq_context_state;

typedef struct
{
    sagejs_fq_context_state *state;
} sagejs_fq_context_struct;

typedef sagejs_fq_context_struct sagejs_fq_context_t[1];

typedef struct
{
    fq_default_t value;
    sagejs_fq_context_state *context;
    uint64_t coordinate_scratch;
} sagejs_fq_element_struct;

typedef sagejs_fq_element_struct sagejs_fq_element_t[1];

typedef struct
{
    fq_default_poly_t value;
    sagejs_fq_context_state *context;
    uint64_t coordinate_scratch;
} sagejs_fq_polynomial_struct;

typedef sagejs_fq_polynomial_struct sagejs_fq_polynomial_t[1];

static inline int sagejs_fq_word_fits(uint64_t value)
{
    return value <= (uint64_t) UWORD_MAX;
}

static inline int sagejs_fq_size_multiply(
    size_t left, size_t right, size_t *result)
{
    if (left != 0 && right > SIZE_MAX / left)
        return 0;
    *result = left * right;
    return 1;
}

static inline int sagejs_fq_context_state_retain(
    sagejs_fq_context_state *state)
{
    if (state == NULL || state->references == SIZE_MAX)
        return 0;
    state->references++;
    return 1;
}

static inline void sagejs_fq_context_state_release(
    sagejs_fq_context_state *state)
{
    if (state == NULL || state->references == 0)
        return;
    state->references--;
    if (state->references != 0)
        return;
    fq_default_ctx_clear(state->value);
    free(state);
}

static inline int sagejs_fq_context_init(
    sagejs_fq_context_t result, const uint64_t *modulus,
    uint64_t modulus_length, uint64_t characteristic)
{
    nmod_poly_t defining;
    sagejs_fq_context_state *state;

    result->state = NULL;
    if (modulus == NULL || !sagejs_fq_word_fits(characteristic) ||
        characteristic < 2 ||
        !n_is_prime((ulong) characteristic) || modulus_length < 3 ||
        modulus_length > (uint64_t) WORD_MAX ||
        modulus[modulus_length - 1] != 1)
        return 0;
    for (uint64_t index = 0; index < modulus_length; index++)
        if (modulus[index] >= characteristic)
            return 0;

    nmod_poly_init(defining, (ulong) characteristic);
    for (uint64_t index = 0; index < modulus_length; index++)
        nmod_poly_set_coeff_ui(
            defining, (slong) index, (ulong) modulus[index]);
    if (nmod_poly_degree(defining) != (slong) modulus_length - 1 ||
        !nmod_poly_is_irreducible(defining))
    {
        nmod_poly_clear(defining);
        return 0;
    }

    state = (sagejs_fq_context_state *) calloc(1, sizeof(*state));
    if (state == NULL)
    {
        nmod_poly_clear(defining);
        return 0;
    }
    fq_default_ctx_init_modulus_nmod_type(
        state->value, defining, "a", FQ_DEFAULT_FQ_NMOD);
    nmod_poly_clear(defining);
    if (fq_default_ctx_type(state->value) != FQ_DEFAULT_FQ_NMOD)
    {
        fq_default_ctx_clear(state->value);
        free(state);
        return 0;
    }
    state->characteristic = (ulong) characteristic;
    state->degree = (slong) modulus_length - 1;
    state->references = 1;
    result->state = state;
    return 1;
}

static inline void sagejs_fq_context_clear(sagejs_fq_context_t context)
{
    sagejs_fq_context_state_release(context->state);
    context->state = NULL;
}

static inline size_t sagejs_fq_context_state_allocated_bytes(
    const sagejs_fq_context_state *state);

static inline size_t sagejs_fq_context_allocated_bytes(
    const sagejs_fq_context_t context)
{
    return sagejs_fq_context_state_allocated_bytes(context->state);
}

static inline size_t sagejs_fq_context_state_allocated_bytes(
    const sagejs_fq_context_state *state)
{
    if (state == NULL)
        return 0;
    const fq_nmod_ctx_struct *inner = FQ_DEFAULT_CTX_FQ_NMOD(state->value);
    size_t retained = sizeof(sagejs_fq_context_state);
    retained = sagejs_retained_size_add(retained,
        sagejs_retained_size_multiply(
            (size_t) inner->modulus->alloc, sizeof(ulong)));
    retained = sagejs_retained_size_add(retained,
        sagejs_retained_size_multiply(
            (size_t) inner->inv->alloc, sizeof(ulong)));
    retained = sagejs_retained_size_add(retained,
        sagejs_retained_size_multiply((size_t) inner->len, sizeof(ulong)));
    retained = sagejs_retained_size_add(retained,
        sagejs_retained_size_multiply((size_t) inner->len, sizeof(slong)));
    if (inner->var != NULL)
        retained = sagejs_retained_size_add(retained, strlen(inner->var) + 1);
    return retained;
}

static inline uint64_t sagejs_fq_context_characteristic(
    const sagejs_fq_context_t context)
{
    return context->state == NULL ? 0 : (uint64_t) context->state->characteristic;
}

static inline uint64_t sagejs_fq_context_degree(
    const sagejs_fq_context_t context)
{
    return context->state == NULL ? 0 : (uint64_t) context->state->degree;
}

static inline int sagejs_fq_coordinates_valid(
    const sagejs_fq_context_state *context,
    const uint64_t *coordinates, uint64_t length)
{
    if (context == NULL || (length != 0 && coordinates == NULL) ||
        length != (uint64_t) context->degree)
        return 0;
    for (uint64_t index = 0; index < length; index++)
        if (coordinates[index] >= (uint64_t) context->characteristic)
            return 0;
    return 1;
}

static inline void sagejs_fq_set_coordinates(
    fq_default_t result, const sagejs_fq_context_state *context,
    const uint64_t *coordinates)
{
    nmod_poly_t temporary;
    nmod_poly_init(temporary, context->characteristic);
    for (slong index = 0; index < context->degree; index++)
        nmod_poly_set_coeff_ui(
            temporary, index, (ulong) coordinates[index]);
    fq_default_set_nmod_poly(result, temporary, context->value);
    nmod_poly_clear(temporary);
}

static inline int sagejs_fq_element_init_coordinates(
    sagejs_fq_element_t result, const sagejs_fq_context_t context,
    const uint64_t *coordinates, uint64_t coordinate_length)
{
    result->context = NULL;
    if (!sagejs_fq_coordinates_valid(
            context->state, coordinates, coordinate_length))
        return 0;
    result->context = context->state;
    if (!sagejs_fq_context_state_retain(result->context))
    {
        result->context = NULL;
        return 0;
    }
    fq_default_init(result->value, result->context->value);
    sagejs_fq_set_coordinates(result->value, result->context, coordinates);
    return 1;
}

static inline void sagejs_fq_element_clear(sagejs_fq_element_t element)
{
    if (element->context == NULL)
        return;
    fq_default_clear(element->value, element->context->value);
    sagejs_fq_context_state_release(element->context);
    element->context = NULL;
}

static inline size_t sagejs_fq_element_allocated_bytes(
    const sagejs_fq_element_t element)
{
    if (element->context == NULL)
        return 0;
    const nmod_poly_struct *value =
        (const nmod_poly_struct *) element->value->fq_nmod;
    return sagejs_retained_size_add(
        sizeof(sagejs_fq_element_struct),
        sagejs_retained_size_multiply(
            (size_t) value->alloc, sizeof(ulong)));
}

static inline int sagejs_fq_element_copy(
    sagejs_fq_element_t result, const sagejs_fq_element_t source)
{
    result->context = NULL;
    if (source->context == NULL)
        return 0;
    result->context = source->context;
    if (!sagejs_fq_context_state_retain(result->context))
    {
        result->context = NULL;
        return 0;
    }
    fq_default_init(result->value, result->context->value);
    fq_default_set(result->value, source->value, result->context->value);
    return 1;
}

static inline uint64_t sagejs_fq_element_extension_degree(
    const sagejs_fq_element_t element)
{
    return element->context == NULL ? 0 : (uint64_t) element->context->degree;
}

static inline uint64_t sagejs_fq_element_coordinate_unchecked(
    const sagejs_fq_element_t element, uint64_t basis_index)
{
    if (element->context == NULL ||
        basis_index >= (uint64_t) element->context->degree)
        return 0;
    return (uint64_t) nmod_poly_get_coeff_ui(
        (const nmod_poly_struct *) element->value->fq_nmod,
        (slong) basis_index);
}

static inline const uint64_t *sagejs_fq_element_coordinate_checked(
    sagejs_fq_element_t element, uint64_t basis_index)
{
    if (element->context == NULL ||
        basis_index >= (uint64_t) element->context->degree)
        return NULL;
    element->coordinate_scratch =
        sagejs_fq_element_coordinate_unchecked(element, basis_index);
    return &element->coordinate_scratch;
}

static inline int sagejs_fq_element_equal(
    const sagejs_fq_element_t left, const sagejs_fq_element_t right)
{
    return left->context != NULL && left->context == right->context &&
        fq_default_equal(left->value, right->value, left->context->value);
}

static inline int sagejs_fq_element_binary(
    sagejs_fq_element_t result, const sagejs_fq_element_t left,
    const sagejs_fq_element_t right, int operation)
{
    result->context = NULL;
    if (left->context == NULL || left->context != right->context)
        return 0;
    result->context = left->context;
    if (!sagejs_fq_context_state_retain(result->context))
    {
        result->context = NULL;
        return 0;
    }
    fq_default_init(result->value, result->context->value);
    if (operation == 0)
        fq_default_add(
            result->value, left->value, right->value, result->context->value);
    else if (operation == 1)
        fq_default_sub(
            result->value, left->value, right->value, result->context->value);
    else
        fq_default_mul(
            result->value, left->value, right->value, result->context->value);
    return 1;
}

static inline int sagejs_fq_element_add(
    sagejs_fq_element_t result, const sagejs_fq_element_t left,
    const sagejs_fq_element_t right)
{
    return sagejs_fq_element_binary(result, left, right, 0);
}

static inline int sagejs_fq_element_sub(
    sagejs_fq_element_t result, const sagejs_fq_element_t left,
    const sagejs_fq_element_t right)
{
    return sagejs_fq_element_binary(result, left, right, 1);
}

static inline int sagejs_fq_element_mul(
    sagejs_fq_element_t result, const sagejs_fq_element_t left,
    const sagejs_fq_element_t right)
{
    return sagejs_fq_element_binary(result, left, right, 2);
}

static inline int sagejs_fq_element_neg(
    sagejs_fq_element_t result, const sagejs_fq_element_t source)
{
    result->context = NULL;
    if (source->context == NULL)
        return 0;
    result->context = source->context;
    if (!sagejs_fq_context_state_retain(result->context))
    {
        result->context = NULL;
        return 0;
    }
    fq_default_init(result->value, result->context->value);
    fq_default_neg(result->value, source->value, result->context->value);
    return 1;
}

static inline int sagejs_fq_element_inverse(
    sagejs_fq_element_t result, const sagejs_fq_element_t source)
{
    result->context = NULL;
    if (source->context == NULL ||
        fq_default_is_zero(source->value, source->context->value))
        return 0;
    result->context = source->context;
    if (!sagejs_fq_context_state_retain(result->context))
    {
        result->context = NULL;
        return 0;
    }
    fq_default_init(result->value, result->context->value);
    fq_default_inv(result->value, source->value, result->context->value);
    return 1;
}

static inline int sagejs_fq_element_pow(
    sagejs_fq_element_t result, const sagejs_fq_element_t source,
    const fmpz_t exponent)
{
    result->context = NULL;
    if (source->context == NULL ||
        (fmpz_sgn(exponent) < 0 &&
            fq_default_is_zero(source->value, source->context->value)))
        return 0;
    result->context = source->context;
    if (!sagejs_fq_context_state_retain(result->context))
    {
        result->context = NULL;
        return 0;
    }
    fq_default_init(result->value, result->context->value);
    fq_default_pow(
        result->value, source->value, exponent, result->context->value);
    return 1;
}

static inline int sagejs_fq_element_is_zero(
    const sagejs_fq_element_t source)
{
    return source->context != NULL &&
        fq_default_is_zero(source->value, source->context->value);
}

static inline int sagejs_fq_element_is_one(
    const sagejs_fq_element_t source)
{
    return source->context != NULL &&
        fq_default_is_one(source->value, source->context->value);
}

static inline void sagejs_fq_write_u64(
    unsigned char *target, uint64_t value);

static inline int sagejs_fq_element_coordinate_bytes(
    sagejs_flint_byte_region_t result,
    const sagejs_fq_element_t element)
{
    const uint64_t degree = sagejs_fq_element_extension_degree(element);
    size_t payload_bytes;
    size_t total_bytes;

    result->data = NULL;
    result->length = 0;
    if (element->context == NULL ||
        !sagejs_fq_size_multiply(
            (size_t) degree, sizeof(uint64_t), &payload_bytes) ||
        payload_bytes > SIZE_MAX - 16)
        return 0;
    total_bytes = payload_bytes + 16;
    result->data = (unsigned char *) malloc(total_bytes);
    if (result->data == NULL)
        return 0;
    result->length = total_bytes;
    memcpy(result->data, "SJFE", 4);
    result->data[4] = 1;
    result->data[5] = result->data[6] = result->data[7] = 0;
    sagejs_fq_write_u64(result->data + 8, degree);
    for (uint64_t basis = 0; basis < degree; basis++)
        sagejs_fq_write_u64(
            result->data + 16 + sizeof(uint64_t) * basis,
            sagejs_fq_element_coordinate_unchecked(element, basis));
    return 1;
}

static inline int sagejs_fq_polynomial_init_coordinates(
    sagejs_fq_polynomial_t result, const sagejs_fq_context_t context,
    const uint64_t *coordinates, uint64_t coordinate_length,
    uint64_t coefficient_count)
{
    fq_default_t coefficient;
    size_t expected;

    result->context = NULL;
    if (context->state == NULL ||
        (coordinate_length != 0 && coordinates == NULL) ||
        coordinate_length > (uint64_t) SIZE_MAX ||
        coefficient_count > (uint64_t) WORD_MAX ||
        !sagejs_fq_size_multiply(
            (size_t) coefficient_count,
            (size_t) context->state->degree, &expected) ||
        expected != (size_t) coordinate_length)
        return 0;
    for (uint64_t index = 0; index < coordinate_length; index++)
        if (coordinates[index] >= (uint64_t) context->state->characteristic)
            return 0;

    result->context = context->state;
    if (!sagejs_fq_context_state_retain(result->context))
    {
        result->context = NULL;
        return 0;
    }
    fq_default_poly_init2(
        result->value, (slong) coefficient_count, result->context->value);
    fq_default_init(coefficient, result->context->value);
    for (uint64_t index = 0; index < coefficient_count; index++)
    {
        sagejs_fq_set_coordinates(
            coefficient, result->context,
            coordinates + index * (uint64_t) result->context->degree);
        fq_default_poly_set_coeff(
            result->value, (slong) index, coefficient,
            result->context->value);
    }
    fq_default_clear(coefficient, result->context->value);
    return 1;
}

static inline void sagejs_fq_polynomial_clear(
    sagejs_fq_polynomial_t polynomial)
{
    if (polynomial->context == NULL)
        return;
    fq_default_poly_clear(polynomial->value, polynomial->context->value);
    sagejs_fq_context_state_release(polynomial->context);
    polynomial->context = NULL;
}

static inline size_t sagejs_fq_polynomial_allocated_bytes(
    const sagejs_fq_polynomial_t polynomial)
{
    if (polynomial->context == NULL)
        return 0;
    const fq_nmod_poly_struct *value = polynomial->value->fq_nmod;
    size_t retained = sagejs_retained_size_add(
        sizeof(sagejs_fq_polynomial_struct),
        sagejs_retained_size_multiply(
            (size_t) value->alloc, sizeof(fq_nmod_struct)));
    for (slong index = 0; index < value->alloc; index++)
        retained = sagejs_retained_size_add(retained,
            sagejs_retained_size_multiply(
                (size_t) value->coeffs[index].alloc, sizeof(ulong)));
    return retained;
}

static inline uint64_t sagejs_fq_polynomial_length(
    const sagejs_fq_polynomial_t polynomial)
{
    return polynomial->context == NULL ? 0 : (uint64_t)
        fq_default_poly_length(polynomial->value, polynomial->context->value);
}

static inline uint64_t sagejs_fq_polynomial_extension_degree(
    const sagejs_fq_polynomial_t polynomial)
{
    return polynomial->context == NULL ? 0 :
        (uint64_t) polynomial->context->degree;
}

static inline uint64_t sagejs_fq_polynomial_coordinate_unchecked(
    const sagejs_fq_polynomial_t polynomial, uint64_t coefficient_index,
    uint64_t basis_index)
{
    fq_default_t coefficient;
    ulong result = 0;
    if (polynomial->context == NULL ||
        coefficient_index >= sagejs_fq_polynomial_length(polynomial) ||
        basis_index >= (uint64_t) polynomial->context->degree)
        return 0;
    fq_default_init(coefficient, polynomial->context->value);
    fq_default_poly_get_coeff(
        coefficient, polynomial->value, (slong) coefficient_index,
        polynomial->context->value);
    result = nmod_poly_get_coeff_ui(
        (const nmod_poly_struct *) coefficient->fq_nmod,
        (slong) basis_index);
    fq_default_clear(coefficient, polynomial->context->value);
    return (uint64_t) result;
}

static inline const uint64_t *sagejs_fq_polynomial_coordinate_checked(
    sagejs_fq_polynomial_t polynomial,
    uint64_t coefficient_index, uint64_t basis_index)
{
    if (polynomial->context == NULL ||
        coefficient_index >= sagejs_fq_polynomial_length(polynomial) ||
        basis_index >= (uint64_t) polynomial->context->degree)
        return NULL;
    polynomial->coordinate_scratch = sagejs_fq_polynomial_coordinate_unchecked(
        polynomial, coefficient_index, basis_index);
    return &polynomial->coordinate_scratch;
}

static inline int sagejs_fq_polynomial_copy(
    sagejs_fq_polynomial_t result,
    const sagejs_fq_polynomial_t source)
{
    result->context = NULL;
    if (source->context == NULL)
        return 0;
    result->context = source->context;
    if (!sagejs_fq_context_state_retain(result->context))
    {
        result->context = NULL;
        return 0;
    }
    fq_default_poly_init(result->value, result->context->value);
    fq_default_poly_set(
        result->value, source->value, result->context->value);
    return 1;
}

static inline int sagejs_fq_polynomial_equal(
    const sagejs_fq_polynomial_t left,
    const sagejs_fq_polynomial_t right)
{
    return left->context != NULL && left->context == right->context &&
        fq_default_poly_equal(
            left->value, right->value, left->context->value);
}

static inline int sagejs_fq_polynomial_binary(
    sagejs_fq_polynomial_t result,
    const sagejs_fq_polynomial_t left,
    const sagejs_fq_polynomial_t right, int operation)
{
    result->context = NULL;
    if (left->context == NULL || left->context != right->context)
        return 0;
    result->context = left->context;
    if (!sagejs_fq_context_state_retain(result->context))
    {
        result->context = NULL;
        return 0;
    }
    fq_default_poly_init(result->value, result->context->value);
    if (operation == 0)
        fq_default_poly_add(
            result->value, left->value, right->value,
            result->context->value);
    else if (operation == 1)
        fq_default_poly_sub(
            result->value, left->value, right->value,
            result->context->value);
    else
        fq_default_poly_mul(
            result->value, left->value, right->value,
            result->context->value);
    return 1;
}

static inline int sagejs_fq_polynomial_add(
    sagejs_fq_polynomial_t result,
    const sagejs_fq_polynomial_t left,
    const sagejs_fq_polynomial_t right)
{
    return sagejs_fq_polynomial_binary(result, left, right, 0);
}

static inline int sagejs_fq_polynomial_sub(
    sagejs_fq_polynomial_t result,
    const sagejs_fq_polynomial_t left,
    const sagejs_fq_polynomial_t right)
{
    return sagejs_fq_polynomial_binary(result, left, right, 1);
}

static inline int sagejs_fq_polynomial_mul(
    sagejs_fq_polynomial_t result,
    const sagejs_fq_polynomial_t left,
    const sagejs_fq_polynomial_t right)
{
    return sagejs_fq_polynomial_binary(result, left, right, 2);
}

static inline int sagejs_fq_polynomial_neg(
    sagejs_fq_polynomial_t result,
    const sagejs_fq_polynomial_t source)
{
    result->context = NULL;
    if (source->context == NULL)
        return 0;
    result->context = source->context;
    if (!sagejs_fq_context_state_retain(result->context))
    {
        result->context = NULL;
        return 0;
    }
    fq_default_poly_init(result->value, result->context->value);
    fq_default_poly_neg(
        result->value, source->value, result->context->value);
    return 1;
}

static inline int sagejs_fq_polynomial_pow(
    sagejs_fq_polynomial_t result,
    const sagejs_fq_polynomial_t source, uint64_t exponent)
{
    result->context = NULL;
    if (source->context == NULL || exponent > (uint64_t) UWORD_MAX)
        return 0;
    result->context = source->context;
    if (!sagejs_fq_context_state_retain(result->context))
    {
        result->context = NULL;
        return 0;
    }
    fq_default_poly_init(result->value, result->context->value);
    fq_default_poly_pow(
        result->value, source->value, (ulong) exponent,
        result->context->value);
    return 1;
}

static inline void sagejs_fq_write_u64(
    unsigned char *target, uint64_t value)
{
    for (unsigned int index = 0; index < 8; index++)
        target[index] = (unsigned char) (value >> (8 * index));
}

static inline int sagejs_fq_polynomial_coordinate_bytes(
    sagejs_flint_byte_region_t result,
    const sagejs_fq_polynomial_t polynomial)
{
    const uint64_t count = sagejs_fq_polynomial_length(polynomial);
    const uint64_t degree =
        sagejs_fq_polynomial_extension_degree(polynomial);
    fq_default_t coefficient_value;
    size_t coordinate_count;
    size_t payload_bytes;
    size_t total_bytes;

    result->data = NULL;
    result->length = 0;
    if (polynomial->context == NULL ||
        !sagejs_fq_size_multiply(
            (size_t) count, (size_t) degree, &coordinate_count) ||
        !sagejs_fq_size_multiply(
            coordinate_count, sizeof(uint64_t), &payload_bytes) ||
        payload_bytes > SIZE_MAX - 24)
        return 0;
    total_bytes = payload_bytes + 24;
    result->data = (unsigned char *) malloc(total_bytes == 0 ? 1 : total_bytes);
    if (result->data == NULL)
        return 0;
    result->length = total_bytes;
    memcpy(result->data, "SJFC", 4);
    result->data[4] = 1;
    result->data[5] = result->data[6] = result->data[7] = 0;
    sagejs_fq_write_u64(result->data + 8, degree);
    sagejs_fq_write_u64(result->data + 16, count);
    fq_default_init(coefficient_value, polynomial->context->value);
    for (uint64_t coefficient = 0; coefficient < count; coefficient++)
    {
        fq_default_poly_get_coeff(
            coefficient_value, polynomial->value, (slong) coefficient,
            polynomial->context->value);
        for (uint64_t basis = 0; basis < degree; basis++)
            sagejs_fq_write_u64(
                result->data + 24 +
                    sizeof(uint64_t) * (coefficient * degree + basis),
                (uint64_t) nmod_poly_get_coeff_ui(
                    (const nmod_poly_struct *) coefficient_value->fq_nmod,
                    (slong) basis));
    }
    fq_default_clear(coefficient_value, polynomial->context->value);
    return 1;
}

#endif
