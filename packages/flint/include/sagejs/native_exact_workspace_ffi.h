#ifndef SAGEJS_NATIVE_EXACT_WORKSPACE_FFI_H
#define SAGEJS_NATIVE_EXACT_WORKSPACE_FFI_H

#include <limits.h>
#include <stdint.h>
#include <stdlib.h>

#include <flint/fmpz.h>
#include <gmp.h>

/*
 * Reusable exact workspace for source-transparent native kernels.
 *
 * The public owner and each synchronous borrow are tiny handles around one
 * reference-counted allocation.  The owner allocates every resident integer
 * and all arithmetic scratch once.  A borrow authenticates the generation
 * and the 128-bit specification identity before exposing mutable operations.
 * Closing the owner invalidates outstanding borrows, while their references
 * keep the allocation alive until deterministic lexical cleanup.
 */

typedef struct
{
    mpz_t *values;
    mpz_t left;
    mpz_t right;
    mpz_t product;
    mpz_t result;
    uint64_t capacity;
    uint64_t maximum_bits;
    uint64_t memory_limit;
    uint64_t specification_high;
    uint64_t specification_low;
    uint64_t generation;
    uint64_t references;
    int owner_open;
    int borrowed;
    int scratch_initialized;
} sagejs_native_exact_workspace_state;

typedef struct
{
    sagejs_native_exact_workspace_state *state;
} sagejs_native_exact_workspace_struct;

typedef sagejs_native_exact_workspace_struct sagejs_native_exact_workspace_t[1];

typedef struct
{
    sagejs_native_exact_workspace_state *state;
    uint64_t generation;
    int initialized;
} sagejs_native_exact_workspace_borrow_struct;

typedef sagejs_native_exact_workspace_borrow_struct
    sagejs_native_exact_workspace_borrow_t[1];

static inline size_t sagejs_native_exact_workspace_saturating_add(
    size_t left, size_t right)
{
    return right > SIZE_MAX - left ? SIZE_MAX : left + right;
}

static inline size_t sagejs_native_exact_workspace_saturating_multiply(
    size_t left, size_t right)
{
    return left != 0 && right > SIZE_MAX / left ? SIZE_MAX : left * right;
}

static inline size_t sagejs_native_exact_workspace_mpz_bytes(const mpz_t value)
{
    const mp_size_t allocated = value[0]._mp_alloc;
    return allocated <= 0 ? 0 : sagejs_native_exact_workspace_saturating_multiply(
        (size_t) allocated, sizeof(mp_limb_t));
}

static inline size_t sagejs_native_exact_workspace_state_bytes(
    const sagejs_native_exact_workspace_state *state)
{
    if (state == NULL)
        return 0;
    size_t retained = sizeof(*state);
    retained = sagejs_native_exact_workspace_saturating_add(
        retained,
        sagejs_native_exact_workspace_saturating_multiply(
            (size_t) state->capacity, sizeof(mpz_t)));
    for (uint64_t index = 0; index < state->capacity; index++)
        retained = sagejs_native_exact_workspace_saturating_add(
            retained,
            sagejs_native_exact_workspace_mpz_bytes(state->values[index]));
    if (state->scratch_initialized)
    {
        retained = sagejs_native_exact_workspace_saturating_add(
            retained, sagejs_native_exact_workspace_mpz_bytes(state->left));
        retained = sagejs_native_exact_workspace_saturating_add(
            retained, sagejs_native_exact_workspace_mpz_bytes(state->right));
        retained = sagejs_native_exact_workspace_saturating_add(
            retained, sagejs_native_exact_workspace_mpz_bytes(state->product));
        retained = sagejs_native_exact_workspace_saturating_add(
            retained, sagejs_native_exact_workspace_mpz_bytes(state->result));
    }
    return retained;
}

static inline void sagejs_native_exact_workspace_state_release(
    sagejs_native_exact_workspace_state *state)
{
    if (state == NULL || state->references == 0)
        return;
    state->references--;
    if (state->references != 0)
        return;
    for (uint64_t index = 0; index < state->capacity; index++)
        mpz_clear(state->values[index]);
    free(state->values);
    if (state->scratch_initialized)
    {
        mpz_clear(state->result);
        mpz_clear(state->product);
        mpz_clear(state->right);
        mpz_clear(state->left);
    }
    free(state);
}

static inline void sagejs_native_exact_workspace_clear(
    sagejs_native_exact_workspace_t workspace)
{
    sagejs_native_exact_workspace_state *state = workspace->state;
    workspace->state = NULL;
    if (state == NULL)
        return;
    state->owner_open = 0;
    sagejs_native_exact_workspace_state_release(state);
}

static inline size_t sagejs_native_exact_workspace_allocated_bytes(
    const sagejs_native_exact_workspace_t workspace)
{
    return sagejs_native_exact_workspace_state_bytes(workspace->state);
}

static inline int sagejs_native_exact_workspace_init(
    sagejs_native_exact_workspace_t workspace,
    uint64_t capacity,
    uint64_t maximum_bits,
    uint64_t memory_limit,
    uint64_t specification_high,
    uint64_t specification_low)
{
    workspace->state = NULL;
    if (capacity == 0 || capacity > (uint64_t) SIZE_MAX / sizeof(mpz_t) ||
        maximum_bits == 0 ||
        maximum_bits > (uint64_t) ULONG_MAX - 65 ||
        maximum_bits > (UINT64_MAX - 65) / 2 ||
        memory_limit == 0)
        return 0;
    const uint64_t scratch_bits = maximum_bits * 2 + 65;
    if (scratch_bits < maximum_bits || scratch_bits > (uint64_t) ULONG_MAX)
        return 0;
    const size_t resident_limbs =
        (size_t) ((maximum_bits + GMP_NUMB_BITS) / GMP_NUMB_BITS);
    const size_t scratch_limbs =
        (size_t) ((scratch_bits + GMP_NUMB_BITS - 1) / GMP_NUMB_BITS);
    size_t minimum_bytes = sizeof(sagejs_native_exact_workspace_state);
    minimum_bytes = sagejs_native_exact_workspace_saturating_add(
        minimum_bytes,
        sagejs_native_exact_workspace_saturating_multiply(
            (size_t) capacity, sizeof(mpz_t)));
    minimum_bytes = sagejs_native_exact_workspace_saturating_add(
        minimum_bytes,
        sagejs_native_exact_workspace_saturating_multiply(
            sagejs_native_exact_workspace_saturating_add(
                (size_t) capacity, 2),
            sagejs_native_exact_workspace_saturating_multiply(
                resident_limbs, sizeof(mp_limb_t))));
    minimum_bytes = sagejs_native_exact_workspace_saturating_add(
        minimum_bytes,
        sagejs_native_exact_workspace_saturating_multiply(
            2,
            sagejs_native_exact_workspace_saturating_multiply(
                scratch_limbs, sizeof(mp_limb_t))));
    if (minimum_bytes == SIZE_MAX ||
        (uint64_t) minimum_bytes > memory_limit)
        return 0;
    sagejs_native_exact_workspace_state *state =
        (sagejs_native_exact_workspace_state *) calloc(1, sizeof(*state));
    if (state == NULL)
        return 0;
    state->values = (mpz_t *) malloc((size_t) capacity * sizeof(mpz_t));
    if (state->values == NULL)
    {
        free(state);
        return 0;
    }
    state->capacity = capacity;
    state->maximum_bits = maximum_bits;
    state->memory_limit = memory_limit;
    state->specification_high = specification_high;
    state->specification_low = specification_low;
    state->generation = 1;
    state->references = 1;
    state->owner_open = 1;
    for (uint64_t index = 0; index < capacity; index++)
        mpz_init2(state->values[index], (mp_bitcnt_t) maximum_bits + 1);
    mpz_init2(state->left, (mp_bitcnt_t) maximum_bits + 1);
    mpz_init2(state->right, (mp_bitcnt_t) maximum_bits + 1);
    mpz_init2(state->product, (mp_bitcnt_t) scratch_bits);
    mpz_init2(state->result, (mp_bitcnt_t) scratch_bits);
    state->scratch_initialized = 1;
    if (sagejs_native_exact_workspace_state_bytes(state) > (size_t) memory_limit)
    {
        sagejs_native_exact_workspace_state_release(state);
        return 0;
    }
    workspace->state = state;
    return 1;
}

static inline uint64_t sagejs_native_exact_workspace_capacity(
    const sagejs_native_exact_workspace_t workspace)
{
    return workspace->state == NULL ? 0 : workspace->state->capacity;
}

static inline uint64_t sagejs_native_exact_workspace_maximum_bits(
    const sagejs_native_exact_workspace_t workspace)
{
    return workspace->state == NULL ? 0 : workspace->state->maximum_bits;
}

static inline uint64_t sagejs_native_exact_workspace_generation(
    const sagejs_native_exact_workspace_t workspace)
{
    return workspace->state == NULL ? 0 : workspace->state->generation;
}

static inline uint64_t sagejs_native_exact_workspace_specification_high(
    const sagejs_native_exact_workspace_t workspace)
{
    return workspace->state == NULL ? 0 : workspace->state->specification_high;
}

static inline uint64_t sagejs_native_exact_workspace_specification_low(
    const sagejs_native_exact_workspace_t workspace)
{
    return workspace->state == NULL ? 0 : workspace->state->specification_low;
}

static inline int sagejs_native_exact_workspace_authenticate(
    const sagejs_native_exact_workspace_state *state,
    uint64_t expected_generation,
    uint64_t specification_high,
    uint64_t specification_low)
{
    return state != NULL && state->owner_open &&
        state->generation == expected_generation &&
        state->specification_high == specification_high &&
        state->specification_low == specification_low;
}

static inline int sagejs_native_exact_workspace_reset(
    sagejs_native_exact_workspace_t workspace,
    uint64_t expected_generation,
    uint64_t specification_high,
    uint64_t specification_low)
{
    sagejs_native_exact_workspace_state *state = workspace->state;
    if (!sagejs_native_exact_workspace_authenticate(
            state, expected_generation, specification_high, specification_low) ||
        state->borrowed || state->generation == UINT64_MAX)
        return 0;
    for (uint64_t index = 0; index < state->capacity; index++)
        mpz_set_ui(state->values[index], 0);
    mpz_set_ui(state->left, 0);
    mpz_set_ui(state->right, 0);
    mpz_set_ui(state->product, 0);
    mpz_set_ui(state->result, 0);
    state->generation++;
    return 1;
}

static inline void sagejs_native_exact_workspace_borrow_clear(
    sagejs_native_exact_workspace_borrow_t borrow)
{
    sagejs_native_exact_workspace_state *state = borrow->state;
    if (!borrow->initialized || state == NULL)
    {
        borrow->state = NULL;
        borrow->initialized = 0;
        return;
    }
    if (state->borrowed && state->generation == borrow->generation)
        state->borrowed = 0;
    borrow->state = NULL;
    borrow->initialized = 0;
    sagejs_native_exact_workspace_state_release(state);
}

static inline size_t sagejs_native_exact_workspace_borrow_allocated_bytes(
    const sagejs_native_exact_workspace_borrow_t borrow)
{
    return borrow->initialized ? sizeof(*borrow) : 0;
}

static inline int sagejs_native_exact_workspace_borrow_init(
    sagejs_native_exact_workspace_borrow_t borrow,
    sagejs_native_exact_workspace_t workspace,
    uint64_t expected_generation,
    uint64_t specification_high,
    uint64_t specification_low)
{
    borrow->state = NULL;
    borrow->generation = 0;
    borrow->initialized = 0;
    sagejs_native_exact_workspace_state *state = workspace->state;
    if (!sagejs_native_exact_workspace_authenticate(
            state, expected_generation, specification_high, specification_low) ||
        state->borrowed || state->references == UINT64_MAX)
        return 0;
    state->borrowed = 1;
    state->references++;
    borrow->state = state;
    borrow->generation = state->generation;
    borrow->initialized = 1;
    return 1;
}

static inline int sagejs_native_exact_workspace_borrow_valid(
    const sagejs_native_exact_workspace_borrow_t borrow)
{
    return borrow->initialized && borrow->state != NULL &&
        borrow->state->owner_open && borrow->state->borrowed &&
        borrow->state->generation == borrow->generation;
}

static inline uint64_t sagejs_native_exact_workspace_borrow_length(
    const sagejs_native_exact_workspace_borrow_t borrow)
{
    return sagejs_native_exact_workspace_borrow_valid(borrow)
        ? borrow->state->capacity : 0;
}

static inline uint64_t sagejs_native_exact_workspace_borrow_generation(
    const sagejs_native_exact_workspace_borrow_t borrow)
{
    return sagejs_native_exact_workspace_borrow_valid(borrow)
        ? borrow->generation : 0;
}

static inline uint64_t sagejs_native_exact_workspace_mpz_bits(const mpz_t value)
{
    return mpz_sgn(value) == 0 ? 0 : (uint64_t) mpz_sizeinbase(value, 2);
}

static inline int sagejs_native_exact_workspace_borrow_set(
    sagejs_native_exact_workspace_borrow_t borrow,
    uint64_t index,
    const fmpz_t value)
{
    if (!sagejs_native_exact_workspace_borrow_valid(borrow) ||
        index >= borrow->state->capacity ||
        (uint64_t) fmpz_bits(value) > borrow->state->maximum_bits)
        return 0;
    fmpz_get_mpz(borrow->state->left, value);
    mpz_set(borrow->state->values[index], borrow->state->left);
    return 1;
}

/* Exact-native compiler ABI. Dynamic FFI deliberately retains fmpz_t. */
static inline int sagejs_native_exact_workspace_borrow_set_mpz(
    sagejs_native_exact_workspace_borrow_t borrow,
    uint64_t index,
    const mpz_t value)
{
    if (!sagejs_native_exact_workspace_borrow_valid(borrow) ||
        index >= borrow->state->capacity ||
        sagejs_native_exact_workspace_mpz_bits(value) >
            borrow->state->maximum_bits)
        return 0;
    mpz_set(borrow->state->values[index], value);
    return 1;
}

static inline int sagejs_native_exact_workspace_borrow_entry(
    fmpz_t result,
    const sagejs_native_exact_workspace_borrow_t borrow,
    uint64_t index)
{
    if (!sagejs_native_exact_workspace_borrow_valid(borrow) ||
        index >= borrow->state->capacity)
        return 0;
    fmpz_set_mpz(result, borrow->state->values[index]);
    return 1;
}

static inline int sagejs_native_exact_workspace_borrow_entry_mpz(
    mpz_t result,
    const sagejs_native_exact_workspace_borrow_t borrow,
    uint64_t index)
{
    if (!sagejs_native_exact_workspace_borrow_valid(borrow) ||
        index >= borrow->state->capacity)
        return 0;
    mpz_set(result, borrow->state->values[index]);
    return 1;
}

static inline int sagejs_native_exact_workspace_borrow_addmul_signed_mpz(
    sagejs_native_exact_workspace_borrow_t borrow,
    uint64_t index,
    const mpz_t left,
    const mpz_t right,
    int subtract)
{
    if (!sagejs_native_exact_workspace_borrow_valid(borrow) ||
        index >= borrow->state->capacity ||
        sagejs_native_exact_workspace_mpz_bits(left) >
            borrow->state->maximum_bits ||
        sagejs_native_exact_workspace_mpz_bits(right) >
            borrow->state->maximum_bits)
        return 0;
    mpz_mul(borrow->state->product, left, right);
    if (subtract)
        mpz_sub(
            borrow->state->result,
            borrow->state->values[index],
            borrow->state->product);
    else
        mpz_add(
            borrow->state->result,
            borrow->state->values[index],
            borrow->state->product);
    if (sagejs_native_exact_workspace_mpz_bits(borrow->state->result) >
        borrow->state->maximum_bits)
        return 0;
    mpz_set(borrow->state->values[index], borrow->state->result);
    return 1;
}

static inline int sagejs_native_exact_workspace_borrow_addmul_mpz(
    sagejs_native_exact_workspace_borrow_t borrow,
    uint64_t index,
    const mpz_t left,
    const mpz_t right)
{
    return sagejs_native_exact_workspace_borrow_addmul_signed_mpz(
        borrow, index, left, right, 0);
}

static inline int sagejs_native_exact_workspace_borrow_submul_mpz(
    sagejs_native_exact_workspace_borrow_t borrow,
    uint64_t index,
    const mpz_t left,
    const mpz_t right)
{
    return sagejs_native_exact_workspace_borrow_addmul_signed_mpz(
        borrow, index, left, right, 1);
}

static inline int sagejs_native_exact_workspace_borrow_addmul_signed(
    sagejs_native_exact_workspace_borrow_t borrow,
    uint64_t index,
    const fmpz_t left,
    const fmpz_t right,
    int subtract)
{
    if (!sagejs_native_exact_workspace_borrow_valid(borrow) ||
        index >= borrow->state->capacity ||
        (uint64_t) fmpz_bits(left) > borrow->state->maximum_bits ||
        (uint64_t) fmpz_bits(right) > borrow->state->maximum_bits)
        return 0;
    fmpz_get_mpz(borrow->state->left, left);
    fmpz_get_mpz(borrow->state->right, right);
    mpz_mul(
        borrow->state->product, borrow->state->left, borrow->state->right);
    if (subtract)
        mpz_sub(
            borrow->state->result,
            borrow->state->values[index],
            borrow->state->product);
    else
        mpz_add(
            borrow->state->result,
            borrow->state->values[index],
            borrow->state->product);
    if (sagejs_native_exact_workspace_mpz_bits(borrow->state->result) >
        borrow->state->maximum_bits)
        return 0;
    mpz_set(borrow->state->values[index], borrow->state->result);
    return 1;
}

static inline int sagejs_native_exact_workspace_borrow_addmul(
    sagejs_native_exact_workspace_borrow_t borrow,
    uint64_t index,
    const fmpz_t left,
    const fmpz_t right)
{
    return sagejs_native_exact_workspace_borrow_addmul_signed(
        borrow, index, left, right, 0);
}

static inline int sagejs_native_exact_workspace_borrow_submul(
    sagejs_native_exact_workspace_borrow_t borrow,
    uint64_t index,
    const fmpz_t left,
    const fmpz_t right)
{
    return sagejs_native_exact_workspace_borrow_addmul_signed(
        borrow, index, left, right, 1);
}

static inline int sagejs_native_exact_workspace_borrow_swap(
    sagejs_native_exact_workspace_borrow_t borrow,
    uint64_t left,
    uint64_t right)
{
    if (!sagejs_native_exact_workspace_borrow_valid(borrow) ||
        left >= borrow->state->capacity || right >= borrow->state->capacity)
        return 0;
    mpz_swap(borrow->state->values[left], borrow->state->values[right]);
    return 1;
}

#endif
