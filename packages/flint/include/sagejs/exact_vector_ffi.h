#ifndef SAGEJS_EXACT_VECTOR_FFI_H
#define SAGEJS_EXACT_VECTOR_FFI_H

#include <stdint.h>

#include <flint/fmpq_vec.h>
#include <flint/fmpz_vec.h>

#include "sagejs/fmpq_matrix_ffi.h"
#include "sagejs/fmpz_matrix_ffi.h"

/*
 * Host-neutral owned resources for exact vectors.
 *
 * FLINT has a resizable public fmpz_vec_t, but its rational-vector interface
 * is a raw pointer plus an external length.  A one-column fmpz_mat/fmpq_mat is
 * therefore the smallest uniform ownership contract for both exact domains:
 * the mature matrix types own every variable-size entry and already provide
 * portable initialization, cleanup, retained-memory accounting, canonical
 * byte streams, and structural arithmetic.  The generated resource tags keep
 * vectors distinct from matrices at every host boundary.
 *
 * This wrapper is deliberately representation-only.  It introduces no
 * algorithm-specific Node-API and no public Sage.js Vector integration.
 */

typedef struct
{
    sagejs_fmpz_matrix_t storage;
} sagejs_fmpz_vector_struct;

typedef sagejs_fmpz_vector_struct sagejs_fmpz_vector_t[1];

typedef struct
{
    sagejs_fmpq_matrix_t storage;
} sagejs_fmpq_vector_struct;

typedef sagejs_fmpq_vector_struct sagejs_fmpq_vector_t[1];

static inline size_t sagejs_fmpz_vector_allocated_bytes(
    const sagejs_fmpz_vector_t vector)
{
    return sagejs_fmpz_matrix_allocated_bytes(vector->storage);
}

static inline size_t sagejs_fmpq_vector_allocated_bytes(
    const sagejs_fmpq_vector_t vector)
{
    return sagejs_fmpq_matrix_allocated_bytes(vector->storage);
}

static inline void sagejs_fmpz_vector_clear(sagejs_fmpz_vector_t vector)
{
    sagejs_fmpz_matrix_clear(vector->storage);
}

static inline void sagejs_fmpq_vector_clear(sagejs_fmpq_vector_t vector)
{
    sagejs_fmpq_matrix_clear(vector->storage);
}

static inline int sagejs_fmpz_vector_from_byte_region(
    sagejs_fmpz_vector_t result,
    const sagejs_flint_byte_region_t source, uint64_t length)
{
    return sagejs_fmpz_matrix_deserialize_entry_stream(
        result->storage, source->data, source->length, length, 1);
}

static inline int sagejs_fmpq_vector_from_byte_region(
    sagejs_fmpq_vector_t result,
    const sagejs_flint_byte_region_t source, uint64_t length)
{
    return sagejs_fmpq_matrix_deserialize(
        result->storage, source, length, 1);
}

static inline uint64_t sagejs_fmpz_vector_length(
    const sagejs_fmpz_vector_t vector)
{
    return sagejs_fmpz_matrix_nrows(vector->storage);
}

static inline uint64_t sagejs_fmpq_vector_length(
    const sagejs_fmpq_vector_t vector)
{
    return sagejs_fmpq_matrix_nrows(vector->storage);
}

static inline int sagejs_fmpz_vector_entry(
    fmpz_t result, const sagejs_fmpz_vector_t vector, uint64_t index)
{
    return sagejs_fmpz_matrix_entry(result, vector->storage, index, 0);
}

static inline int sagejs_fmpq_vector_entry_numerator(
    fmpz_t result, const sagejs_fmpq_vector_t vector, uint64_t index)
{
    return sagejs_fmpq_matrix_entry_numerator(
        result, vector->storage, index, 0);
}

static inline int sagejs_fmpq_vector_entry_denominator(
    fmpz_t result, const sagejs_fmpq_vector_t vector, uint64_t index)
{
    return sagejs_fmpq_matrix_entry_denominator(
        result, vector->storage, index, 0);
}

static inline int sagejs_fmpz_vector_set_entry(
    sagejs_fmpz_vector_t vector, uint64_t index, const fmpz_t entry)
{
    return sagejs_fmpz_matrix_set_entry(
        vector->storage, index, 0, entry);
}

static inline int sagejs_fmpq_vector_set_entry(
    sagejs_fmpq_vector_t vector, uint64_t index,
    const fmpz_t numerator, const fmpz_t denominator)
{
    return sagejs_fmpq_matrix_set_entry(
        vector->storage, index, 0, numerator, denominator);
}

static inline int sagejs_fmpz_vector_init_set(
    sagejs_fmpz_vector_t result, const sagejs_fmpz_vector_t source)
{
    return sagejs_fmpz_matrix_init_set(result->storage, source->storage);
}

static inline int sagejs_fmpq_vector_init_set(
    sagejs_fmpq_vector_t result, const sagejs_fmpq_vector_t source)
{
    return sagejs_fmpq_matrix_init_set(result->storage, source->storage);
}

static inline int sagejs_fmpz_vector_serialize(
    sagejs_flint_byte_region_t result,
    const sagejs_fmpz_vector_t source)
{
    const uint64_t length = sagejs_fmpz_vector_length(source);
    return sagejs_fmpz_matrix_serialize_sequence(
        result, source->storage, 0, 1, length);
}

static inline int sagejs_fmpq_vector_serialize(
    sagejs_flint_byte_region_t result,
    const sagejs_fmpq_vector_t source)
{
    const uint64_t length = sagejs_fmpq_vector_length(source);
    return sagejs_fmpq_matrix_serialize_sequence(
        result, source->storage, 0, 1, length);
}

static inline int sagejs_fmpz_vector_equal(
    const sagejs_fmpz_vector_t left,
    const sagejs_fmpz_vector_t right)
{
    return sagejs_fmpz_matrix_equal(left->storage, right->storage);
}

static inline int sagejs_fmpq_vector_equal(
    const sagejs_fmpq_vector_t left,
    const sagejs_fmpq_vector_t right)
{
    return sagejs_fmpq_matrix_equal(left->storage, right->storage);
}

static inline int sagejs_fmpz_vector_add(
    sagejs_fmpz_vector_t result, const sagejs_fmpz_vector_t left,
    const sagejs_fmpz_vector_t right)
{
    return sagejs_fmpz_matrix_add(
        result->storage, left->storage, right->storage);
}

static inline int sagejs_fmpq_vector_add(
    sagejs_fmpq_vector_t result, const sagejs_fmpq_vector_t left,
    const sagejs_fmpq_vector_t right)
{
    return sagejs_fmpq_matrix_add(
        result->storage, left->storage, right->storage);
}

static inline int sagejs_fmpz_vector_sub(
    sagejs_fmpz_vector_t result, const sagejs_fmpz_vector_t left,
    const sagejs_fmpz_vector_t right)
{
    return sagejs_fmpz_matrix_sub(
        result->storage, left->storage, right->storage);
}

static inline int sagejs_fmpq_vector_sub(
    sagejs_fmpq_vector_t result, const sagejs_fmpq_vector_t left,
    const sagejs_fmpq_vector_t right)
{
    return sagejs_fmpq_matrix_sub(
        result->storage, left->storage, right->storage);
}

static inline int sagejs_fmpz_vector_scalar_mul(
    sagejs_fmpz_vector_t result, const sagejs_fmpz_vector_t source,
    const fmpz_t scalar)
{
    return sagejs_fmpz_matrix_scalar_mul(
        result->storage, source->storage, scalar);
}

static inline int sagejs_fmpq_vector_scalar_mul(
    sagejs_fmpq_vector_t result, const sagejs_fmpq_vector_t source,
    const fmpz_t numerator, const fmpz_t denominator)
{
    return sagejs_fmpq_matrix_scalar_mul(
        result->storage, source->storage, numerator, denominator);
}

static inline int sagejs_fmpz_vector_dot(
    fmpz_t result, const sagejs_fmpz_vector_t left,
    const sagejs_fmpz_vector_t right)
{
    const slong length = fmpz_mat_nrows(left->storage->value);
    if (length != fmpz_mat_nrows(right->storage->value))
        return 0;
    fmpz_zero(result);
    if (length != 0)
        _fmpz_vec_dot(result,
            fmpz_mat_entry(left->storage->value, 0, 0),
            fmpz_mat_entry(right->storage->value, 0, 0), length);
    return 1;
}

static inline int sagejs_fmpq_vector_dot(
    sagejs_fmpq_value_t result, const sagejs_fmpq_vector_t left,
    const sagejs_fmpq_vector_t right)
{
    const slong length = fmpq_mat_nrows(left->storage->value);
    if (length != fmpq_mat_nrows(right->storage->value))
        return 0;
    fmpq_init(result);
    fmpq_zero(result);
    if (length != 0)
        _fmpq_vec_dot(result,
            fmpq_mat_entry(left->storage->value, 0, 0),
            fmpq_mat_entry(right->storage->value, 0, 0), length);
    return 1;
}

/* Return a maximal perfect-power decomposition as two owned exact integers.
 * FLINT does not promise that one extraction returns a primitive root, so
 * iterate until its mature primitive reports that the current root is not a
 * power.  The ordinary Python policy independently checks the identity and
 * terminal primitiveness before accepting this as decomposition evidence. */
static inline int sagejs_fmpz_perfect_power_data(
    sagejs_fmpz_vector_t result, const fmpz_t number)
{
    fmpz_t current, root, exponent;
    int power = 0;
    int valid = 0;
    const int sign = fmpz_sgn(number);
    if (!sagejs_fmpz_matrix_init(result->storage, 2, 1))
        return 0;
    fmpz_init_set(current, number);
    fmpz_init(root);
    fmpz_init_set_ui(exponent, 1);
    if (!fmpz_is_zero(current) && !fmpz_is_pm1(current))
    {
        while ((power = fmpz_is_perfect_power(root, current)) != 0)
        {
            if (power < 2 || fmpz_cmpabs(root, current) >= 0)
                goto cleanup;
            fmpz_set(current, root);
            fmpz_mul_ui(exponent, exponent, (ulong) power);
        }
    }
    if (sign > 0)
        fmpz_abs(current, current);
    if (sign < 0 && (fmpz_sgn(current) >= 0 || !fmpz_is_odd(exponent)))
        goto cleanup;
    if (!sagejs_fmpz_vector_set_entry(result, 0, current) ||
        !sagejs_fmpz_vector_set_entry(result, 1, exponent))
        goto cleanup;
    valid = 1;
cleanup:
    fmpz_clear(exponent);
    fmpz_clear(root);
    fmpz_clear(current);
    if (!valid)
        sagejs_fmpz_vector_clear(result);
    return valid;
}

static inline int sagejs_fmpz_probabprime_result(
    fmpz_t result, const fmpz_t number)
{
    fmpz_set_si(result, fmpz_is_probabprime(number));
    return 1;
}

#endif
