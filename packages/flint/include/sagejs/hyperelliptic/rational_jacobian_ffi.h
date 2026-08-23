#ifndef SAGEJS_HYPERELLIPTIC_RATIONAL_JACOBIAN_FFI_H
#define SAGEJS_HYPERELLIPTIC_RATIONAL_JACOBIAN_FFI_H

#include <stdint.h>
#include <stdlib.h>

#include <flint/flint.h>
#include <flint/fmpq_poly.h>
#include <flint/fmpz.h>

#include "sagejs/exact_polynomial_ffi.h"

/*
 * Mutable FLINT scratch for source-transparent rational Cantor arithmetic.
 *
 * The native compiler deliberately forbids creating owned resources in a
 * loop.  This owner allocates a bounded array of ordinary fmpq_poly values
 * once; the mathematical Python kernel then names slots and calls only these
 * representation primitives.  No Jacobian formula is implemented here.
 */

typedef struct
{
    fmpq_poly_struct *slots;
    slong slot_count;
} sagejs_fmpq_polynomial_workspace_struct;

typedef sagejs_fmpq_polynomial_workspace_struct
    sagejs_fmpq_polynomial_workspace_t[1];

/*
 * One immutable Mumford `(u,v)` pair copied out of mutable workspace slots.
 *
 * Keeping both polynomials under one owner prevents callers from transplanting
 * independently borrowed components.  This is an exact representation
 * primitive only: the source-transparent Python kernel remains responsible
 * for every Cantor formula and for proving that the copied slots are reduced.
 */

typedef struct
{
    sagejs_fmpq_polynomial_struct u;
    sagejs_fmpq_polynomial_struct v;
} sagejs_fmpq_polynomial_pair_struct;

typedef sagejs_fmpq_polynomial_pair_struct
    sagejs_fmpq_polynomial_pair_t[1];

static inline void sagejs_fmpq_polynomial_pair_clear(
    sagejs_fmpq_polynomial_pair_t pair)
{
    sagejs_fmpq_polynomial_clear(&pair->u);
    sagejs_fmpq_polynomial_clear(&pair->v);
}

static inline size_t sagejs_fmpq_polynomial_pair_allocated_bytes(
    const sagejs_fmpq_polynomial_pair_t pair)
{
    return sagejs_retained_size_add(
        pair->u.retained_bytes, pair->v.retained_bytes);
}

static inline int sagejs_fmpq_polynomial_workspace_valid_slot(
    const sagejs_fmpq_polynomial_workspace_t workspace, uint64_t slot)
{
    return workspace->slots != NULL &&
        slot < (uint64_t) workspace->slot_count;
}

static inline int sagejs_fmpq_polynomial_workspace_init(
    sagejs_fmpq_polynomial_workspace_t workspace, uint64_t slot_count)
{
    if (slot_count == 0 || slot_count > 128 ||
        slot_count > (uint64_t) SIZE_MAX / sizeof(fmpq_poly_struct))
        return 0;
    workspace->slots = (fmpq_poly_struct *) flint_malloc(
        (size_t) slot_count * sizeof(fmpq_poly_struct));
    if (workspace->slots == NULL)
        return 0;
    workspace->slot_count = (slong) slot_count;
    for (slong index = 0; index < workspace->slot_count; index++)
        fmpq_poly_init(workspace->slots + index);
    return 1;
}

static inline void sagejs_fmpq_polynomial_workspace_clear(
    sagejs_fmpq_polynomial_workspace_t workspace)
{
    if (workspace->slots != NULL)
    {
        for (slong index = 0; index < workspace->slot_count; index++)
            fmpq_poly_clear(workspace->slots + index);
        flint_free(workspace->slots);
    }
    workspace->slots = NULL;
    workspace->slot_count = 0;
}

static inline size_t sagejs_fmpq_polynomial_workspace_allocated_bytes(
    const sagejs_fmpq_polynomial_workspace_t workspace)
{
    size_t retained = sizeof(*workspace);
    retained = sagejs_retained_size_add(retained,
        sagejs_retained_size_multiply((size_t) workspace->slot_count,
            sizeof(fmpq_poly_struct)));
    for (slong slot = 0; slot < workspace->slot_count; slot++)
    {
        const fmpq_poly_struct *value = workspace->slots + slot;
        retained = sagejs_retained_size_add(retained,
            sagejs_retained_size_multiply((size_t) value->alloc,
                sizeof(fmpz)));
        for (slong index = 0; index < value->alloc; index++)
            retained = sagejs_retained_size_add(retained,
                sagejs_fmpz_retained_bytes(value->coeffs + index));
        retained = sagejs_retained_size_add(retained,
            sagejs_fmpz_retained_bytes(value->den));
    }
    return retained;
}

static inline int sagejs_fmpq_polynomial_workspace_load(
    sagejs_fmpq_polynomial_workspace_t workspace, uint64_t output,
    const sagejs_fmpq_polynomial_t source)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, output) ||
        !source->sealed)
        return 0;
    fmpq_poly_set(workspace->slots + (slong) output, source->value);
    return 1;
}

static inline int sagejs_fmpq_polynomial_workspace_copy_pair_out(
    sagejs_fmpq_polynomial_pair_t result,
    const sagejs_fmpq_polynomial_workspace_t workspace,
    uint64_t u_slot, uint64_t v_slot)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, u_slot) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, v_slot))
        return 0;
    fmpq_poly_init(result->u.value);
    fmpq_poly_set(result->u.value, workspace->slots + (slong) u_slot);
    sagejs_fmpq_polynomial_finish_result(&result->u);
    fmpq_poly_init(result->v.value);
    fmpq_poly_set(result->v.value, workspace->slots + (slong) v_slot);
    sagejs_fmpq_polynomial_finish_result(&result->v);
    return 1;
}

static inline int sagejs_fmpq_polynomial_workspace_load_pair(
    sagejs_fmpq_polynomial_workspace_t workspace,
    uint64_t u_output, uint64_t v_output,
    const sagejs_fmpq_polynomial_pair_t source)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, u_output) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, v_output) ||
        u_output == v_output || !source->u.sealed || !source->v.sealed)
        return 0;
    fmpq_poly_set(workspace->slots + (slong) u_output, source->u.value);
    fmpq_poly_set(workspace->slots + (slong) v_output, source->v.value);
    return 1;
}

static inline int sagejs_fmpq_polynomial_workspace_zero(
    sagejs_fmpq_polynomial_workspace_t workspace, uint64_t output)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, output))
        return 0;
    fmpq_poly_zero(workspace->slots + (slong) output);
    return 1;
}

static inline int sagejs_fmpq_polynomial_workspace_one(
    sagejs_fmpq_polynomial_workspace_t workspace, uint64_t output)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, output))
        return 0;
    fmpq_poly_one(workspace->slots + (slong) output);
    return 1;
}

static inline int sagejs_fmpq_polynomial_workspace_copy(
    sagejs_fmpq_polynomial_workspace_t workspace, uint64_t output,
    uint64_t source)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, output) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, source))
        return 0;
    fmpq_poly_set(workspace->slots + (slong) output,
        workspace->slots + (slong) source);
    return 1;
}

static inline int sagejs_fmpq_polynomial_workspace_swap(
    sagejs_fmpq_polynomial_workspace_t workspace, uint64_t left,
    uint64_t right)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, left) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, right))
        return 0;
    fmpq_poly_swap(workspace->slots + (slong) left,
        workspace->slots + (slong) right);
    return 1;
}

#define SAGEJS_FMPQ_WORKSPACE_BINARY(name, operation)                    \
static inline int name(                                                  \
    sagejs_fmpq_polynomial_workspace_t workspace, uint64_t output,       \
    uint64_t left, uint64_t right)                                       \
{                                                                        \
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, output) || \
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, left) || \
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, right))  \
        return 0;                                                        \
    operation(workspace->slots + (slong) output,                         \
        workspace->slots + (slong) left,                                \
        workspace->slots + (slong) right);                              \
    return 1;                                                            \
}

SAGEJS_FMPQ_WORKSPACE_BINARY(
    sagejs_fmpq_polynomial_workspace_add, fmpq_poly_add)
SAGEJS_FMPQ_WORKSPACE_BINARY(
    sagejs_fmpq_polynomial_workspace_sub, fmpq_poly_sub)
SAGEJS_FMPQ_WORKSPACE_BINARY(
    sagejs_fmpq_polynomial_workspace_mul, fmpq_poly_mul)

#undef SAGEJS_FMPQ_WORKSPACE_BINARY

static inline int sagejs_fmpq_polynomial_workspace_neg(
    sagejs_fmpq_polynomial_workspace_t workspace, uint64_t output,
    uint64_t source)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, output) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, source))
        return 0;
    fmpq_poly_neg(workspace->slots + (slong) output,
        workspace->slots + (slong) source);
    return 1;
}

static inline int sagejs_fmpq_polynomial_workspace_divexact(
    sagejs_fmpq_polynomial_workspace_t workspace, uint64_t output,
    uint64_t dividend, uint64_t divisor)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, output) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, dividend) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, divisor) ||
        fmpq_poly_is_zero(workspace->slots + (slong) divisor))
        return 0;
    return fmpq_poly_divides(workspace->slots + (slong) output,
        workspace->slots + (slong) dividend,
        workspace->slots + (slong) divisor);
}

static inline int sagejs_fmpq_polynomial_workspace_rem(
    sagejs_fmpq_polynomial_workspace_t workspace, uint64_t output,
    uint64_t dividend, uint64_t divisor)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, output) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, dividend) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, divisor) ||
        fmpq_poly_is_zero(workspace->slots + (slong) divisor))
        return 0;
    fmpq_poly_rem(workspace->slots + (slong) output,
        workspace->slots + (slong) dividend,
        workspace->slots + (slong) divisor);
    return 1;
}

static inline int sagejs_fmpq_polynomial_workspace_xgcd(
    sagejs_fmpq_polynomial_workspace_t workspace,
    uint64_t gcd, uint64_t left_coefficient, uint64_t right_coefficient,
    uint64_t left, uint64_t right)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, gcd) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(
            workspace, left_coefficient) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(
            workspace, right_coefficient) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, left) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, right) ||
        gcd == left_coefficient || gcd == right_coefficient ||
        left_coefficient == right_coefficient || gcd == left || gcd == right ||
        left_coefficient == left || left_coefficient == right ||
        right_coefficient == left || right_coefficient == right)
        return 0;
    fmpq_poly_xgcd(workspace->slots + (slong) gcd,
        workspace->slots + (slong) left_coefficient,
        workspace->slots + (slong) right_coefficient,
        workspace->slots + (slong) left,
        workspace->slots + (slong) right);
    return 1;
}

static inline int sagejs_fmpq_polynomial_workspace_monic(
    sagejs_fmpq_polynomial_workspace_t workspace, uint64_t output,
    uint64_t source)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, output) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, source) ||
        fmpq_poly_is_zero(workspace->slots + (slong) source))
        return 0;
    fmpq_poly_make_monic(workspace->slots + (slong) output,
        workspace->slots + (slong) source);
    return 1;
}

static inline uint64_t sagejs_fmpq_polynomial_workspace_length(
    const sagejs_fmpq_polynomial_workspace_t workspace, uint64_t slot)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, slot))
        return UINT64_MAX;
    return (uint64_t) fmpq_poly_length(workspace->slots + (slong) slot);
}

static inline uint64_t sagejs_fmpq_polynomial_workspace_equal(
    const sagejs_fmpq_polynomial_workspace_t workspace,
    uint64_t left, uint64_t right)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, left) ||
        !sagejs_fmpq_polynomial_workspace_valid_slot(workspace, right))
        return 0;
    return (uint64_t) fmpq_poly_equal(
        workspace->slots + (slong) left,
        workspace->slots + (slong) right);
}

static inline uint64_t sagejs_fmpq_polynomial_workspace_is_zero(
    const sagejs_fmpq_polynomial_workspace_t workspace, uint64_t slot)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, slot))
        return 0;
    return (uint64_t) fmpq_poly_is_zero(
        workspace->slots + (slong) slot);
}

static inline uint64_t sagejs_fmpq_polynomial_workspace_is_one(
    const sagejs_fmpq_polynomial_workspace_t workspace, uint64_t slot)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, slot))
        return 0;
    return (uint64_t) fmpq_poly_is_one(
        workspace->slots + (slong) slot);
}

static inline int sagejs_fmpq_polynomial_workspace_coefficient_numerator(
    fmpz_t result,
    const sagejs_fmpq_polynomial_workspace_t workspace,
    uint64_t slot, uint64_t index)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, slot) ||
        index >= (uint64_t) fmpq_poly_length(
            workspace->slots + (slong) slot))
        return 0;
    const fmpq_poly_struct *value = workspace->slots + (slong) slot;
    fmpz_t divisor;
    fmpz_init(divisor);
    fmpz_gcd(divisor, fmpq_poly_numref(value) + (slong) index,
        fmpq_poly_denref(value));
    fmpz_divexact(result,
        fmpq_poly_numref(value) + (slong) index, divisor);
    fmpz_clear(divisor);
    return 1;
}

static inline int sagejs_fmpq_polynomial_workspace_coefficient_denominator(
    fmpz_t result,
    const sagejs_fmpq_polynomial_workspace_t workspace,
    uint64_t slot, uint64_t index)
{
    if (!sagejs_fmpq_polynomial_workspace_valid_slot(workspace, slot) ||
        index >= (uint64_t) fmpq_poly_length(
            workspace->slots + (slong) slot))
        return 0;
    const fmpq_poly_struct *value = workspace->slots + (slong) slot;
    fmpz_t divisor;
    fmpz_init(divisor);
    fmpz_gcd(divisor, fmpq_poly_numref(value) + (slong) index,
        fmpq_poly_denref(value));
    fmpz_divexact(result, fmpq_poly_denref(value), divisor);
    fmpz_clear(divisor);
    return 1;
}

#endif
