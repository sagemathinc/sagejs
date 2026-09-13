"use strict";

const FMPZ_EXACT_RUNTIME_C_SOURCE = String.raw`
/* FLINT fmpz resident storage for unbounded exact arena vectors.
 *
 * A zero-initialized fmpz is an inline zero word.  Entries promote through
 * FLINT only when their values leave the inline range; there is deliberately
 * no per-entry mpz_t object and no mpz_init loop here.
 */
typedef struct
{
    fmpz *entries;
    fmpz arithmetic_scratch;
    uint64_t *payload_charges;
    size_t length;
    size_t initialized;
    int arithmetic_scratch_initialized;
    sagejs_native_exact_budget *budget;
    const char *memory_error_message;
    uint64_t charged_bytes;
} sagejs_native_fmpz_vector;

/* Convert one nonnegative fmpz to an exact uint64 without constructing an
 * mpz_t or asking FLINT to allocate.  fmpz_get_uiui exposes at most two
 * FLINT limbs.  On 64-bit FLINT the low limb contains the entire result; on
 * 32-bit FLINT the two limbs are composed explicitly. */
static int sagejs_fmpz_to_uint64_checked(
    const fmpz_t value,
    uint64_t *result)
{
    ulong high = 0;
    ulong low = 0;
    if (fmpz_sgn(value) < 0 || fmpz_bits(value) > 64)
        return 0;
    fmpz_get_uiui(&high, &low, value);
#if FLINT_BITS == 64
    if (high != 0)
        return 0;
    *result = (uint64_t) low;
#else
    *result = ((uint64_t) high << 32) | (uint64_t) low;
#endif
    return 1;
}

/* Add two reduced residues without overflowing uint64_t. */
static uint64_t sagejs_uint64_addmod(
    uint64_t left,
    uint64_t right,
    uint64_t modulus)
{
    const uint64_t gap = modulus - right;
    return left >= gap ? left - gap : left + right;
}

/* Return Python's floor remainder by a nonzero uint64 modulus without an
 * fmpz/mpz conversion or temporary exact allocation.  This is the portable
 * path when a uint64 modulus does not fit one FLINT ulong.  fmpz_tstbit uses
 * infinite two's-complement bits for negative inputs; scanning low to high
 * lets invert-plus-carry recover the magnitude while accumulating powers of
 * two modulo the divisor. */
static uint64_t sagejs_fmpz_fdiv_uint64(
    const fmpz_t value,
    uint64_t modulus)
{
    const flint_bitcnt_t bits = fmpz_bits(value);
    const int negative = fmpz_sgn(value) < 0;
    int carry = negative;
    uint64_t residue = 0;
    uint64_t place = 1;
    flint_bitcnt_t bit;
    if (modulus <= 1 || bits == 0)
        return 0;
    for (bit = 0; bit < bits; bit += 1)
    {
        int digit = fmpz_tstbit(value, (ulong) bit);
        if (negative)
        {
            digit = !digit;
            if (carry)
            {
                if (digit)
                    digit = 0;
                else
                {
                    digit = 1;
                    carry = 0;
                }
            }
        }
        if (digit)
            residue = sagejs_uint64_addmod(residue, place, modulus);
        if (bit + 1 < bits)
            place = sagejs_uint64_addmod(place, place, modulus);
    }
    if (negative && residue != 0)
        return modulus - residue;
    return residue;
}

static int sagejs_native_fmpz_vector_index(
    const sagejs_native_fmpz_vector *vector,
    const fmpz_t index,
    size_t *position)
{
    uint64_t exact;
    if (!sagejs_fmpz_to_uint64_checked(index, &exact) ||
        exact > (uint64_t) SIZE_MAX || exact >= (uint64_t) vector->length)
        return 0;
    *position = (size_t) exact;
    return 1;
}

/* UInt64Buffer follows Python sequence indexing.  Positive indices use the
 * same allocation-free conversion as checked_uint64.  For a negative index,
 * fmpz_get_signed_uiui provides its two's-complement words, so its magnitude
 * is available without allocating an fmpz temporary. */
static int sagejs_fmpz_signed_buffer_index(
    size_t length,
    const fmpz_t index,
    size_t *position)
{
    uint64_t exact;
    if (fmpz_sgn(index) >= 0)
    {
        if (!sagejs_fmpz_to_uint64_checked(index, &exact) ||
            exact > (uint64_t) SIZE_MAX || exact >= (uint64_t) length)
            return 0;
        *position = (size_t) exact;
        return 1;
    }
    if (fmpz_bits(index) > 64)
        return 0;
    {
        ulong high = 0;
        ulong low = 0;
        fmpz_get_signed_uiui(&high, &low, index);
#if FLINT_BITS == 64
        exact = (uint64_t) (-(uint64_t) low);
#else
        {
            const uint64_t signed_words =
                ((uint64_t) high << 32) | (uint64_t) low;
            exact = -signed_words;
        }
#endif
    }
    if (exact == 0 || exact > (uint64_t) length)
        return 0;
    *position = length - (size_t) exact;
    return 1;
}

static uint64_t sagejs_fmpz_payload_charge(const fmpz_t value)
{
    const flint_bitcnt_t bits = fmpz_bits(value);
    if (bits > (flint_bitcnt_t) (UINT64_MAX - UINT64_C(7)))
        return UINT64_MAX;
    return (uint64_t) ((bits + 7) / 8);
}

static void sagejs_native_fmpz_vector_clear(
    sagejs_native_fmpz_vector *vector)
{
    if (vector == NULL)
        return;
    while (vector->initialized > 0)
    {
        vector->initialized -= 1;
        fmpz_clear(vector->entries + vector->initialized);
    }
    if (vector->arithmetic_scratch_initialized)
        fmpz_clear(&vector->arithmetic_scratch);
    free(vector->entries);
    free(vector->payload_charges);
    sagejs_native_exact_budget_release(vector->budget, vector->charged_bytes);
    vector->entries = NULL;
    vector->payload_charges = NULL;
    vector->length = 0;
    vector->arithmetic_scratch_initialized = 0;
    vector->budget = NULL;
    vector->memory_error_message = NULL;
    vector->charged_bytes = 0;
}

static int sagejs_native_fmpz_vector_init_in_budget(
    sagejs_native_status *status,
    sagejs_native_fmpz_vector *vector,
    uint64_t capacity,
    sagejs_native_exact_budget *budget,
    const char *memory_error_message)
{
    uint64_t base_charge;
    size_t index;
    if (capacity > (uint64_t) SIZE_MAX ||
        capacity > (uint64_t) (SIZE_MAX / sizeof(fmpz)) ||
        capacity > UINT64_MAX / SAGEJS_NATIVE_INTEGER_VECTOR_ENTRY_CHARGE)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "NativeIntegerVector capacity is too large");
        return 0;
    }
    base_charge = capacity * SAGEJS_NATIVE_INTEGER_VECTOR_ENTRY_CHARGE;
    if (!sagejs_native_exact_budget_replace(
            status, budget, 0, base_charge, memory_error_message))
        return 0;
    vector->length = (size_t) capacity;
    vector->budget = budget;
    vector->memory_error_message = memory_error_message;
    vector->charged_bytes = base_charge;
    if (capacity == 0)
        return 1;
    vector->entries = (fmpz *) calloc((size_t) capacity, sizeof(fmpz));
    vector->payload_charges = (uint64_t *) calloc(
        (size_t) capacity, sizeof(uint64_t));
    if (vector->entries == NULL || vector->payload_charges == NULL)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
            "NativeIntegerVector allocation failed");
        sagejs_native_fmpz_vector_clear(vector);
        return 0;
    }
    for (index = 0; index < (size_t) capacity; index += 1)
    {
        fmpz_init(vector->entries + index);
        vector->initialized += 1;
    }
    fmpz_init(&vector->arithmetic_scratch);
    vector->arithmetic_scratch_initialized = 1;
    return 1;
}

static int sagejs_native_fmpz_vector_reserve_payload(
    sagejs_native_status *status,
    sagejs_native_fmpz_vector *vector,
    size_t position,
    uint64_t payload)
{
    const uint64_t old_payload = vector->payload_charges[position];
    const uint64_t retained = vector->charged_bytes - old_payload;
    if (!sagejs_native_exact_budget_replace(
            status, vector->budget, old_payload, payload,
            vector->memory_error_message))
        return 0;
    vector->charged_bytes = retained + payload;
    vector->payload_charges[position] = payload;
    return 1;
}

static int sagejs_native_fmpz_vector_set(
    sagejs_native_status *status,
    sagejs_native_fmpz_vector *vector,
    size_t position,
    const fmpz_t value)
{
    if (!sagejs_native_fmpz_vector_reserve_payload(
            status, vector, position, sagejs_fmpz_payload_charge(value)))
        return 0;
    fmpz_set(vector->entries + position, value);
    return 1;
}

static int sagejs_native_fmpz_vector_addmul(
    sagejs_native_status *status,
    sagejs_native_fmpz_vector *vector,
    size_t position,
    const fmpz_t left,
    const fmpz_t right,
    int subtract)
{
    fmpz_set(&vector->arithmetic_scratch, vector->entries + position);
    if (subtract)
        fmpz_submul(&vector->arithmetic_scratch, left, right);
    else
        fmpz_addmul(&vector->arithmetic_scratch, left, right);
    if (!sagejs_native_fmpz_vector_reserve_payload(
            status, vector, position,
            sagejs_fmpz_payload_charge(&vector->arithmetic_scratch)))
        return 0;
    fmpz_swap(vector->entries + position, &vector->arithmetic_scratch);
    return 1;
}

static int sagejs_native_fmpz_vector_get_at(
    sagejs_native_status *status,
    sagejs_native_fmpz_vector *vector,
    const fmpz_t index,
    fmpz_t result)
{
    size_t position;
    if (!sagejs_native_fmpz_vector_index(vector, index, &position))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "NativeIntegerVector index out of range");
        return 0;
    }
    fmpz_set(result, vector->entries + position);
    return 1;
}

static int sagejs_native_fmpz_vector_borrow_at(
    sagejs_native_status *status,
    sagejs_native_fmpz_vector *vector,
    const fmpz_t index,
    const fmpz **result)
{
    size_t position;
    if (!sagejs_native_fmpz_vector_index(vector, index, &position))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "NativeIntegerVector index out of range");
        return 0;
    }
    *result = vector->entries + position;
    return 1;
}

static int sagejs_native_fmpz_vector_set_at(
    sagejs_native_status *status,
    sagejs_native_fmpz_vector *vector,
    const fmpz_t index,
    const fmpz_t value)
{
    size_t position;
    if (!sagejs_native_fmpz_vector_index(vector, index, &position))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "NativeIntegerVector index out of range");
        return 0;
    }
    return sagejs_native_fmpz_vector_set(status, vector, position, value);
}

static int sagejs_native_fmpz_vector_addmul_at(
    sagejs_native_status *status,
    sagejs_native_fmpz_vector *vector,
    const fmpz_t index,
    const fmpz_t left,
    const fmpz_t right,
    int subtract)
{
    size_t position;
    if (!sagejs_native_fmpz_vector_index(vector, index, &position))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "NativeIntegerVector index out of range");
        return 0;
    }
    return sagejs_native_fmpz_vector_addmul(
        status, vector, position, left, right, subtract);
}

static int sagejs_native_fmpz_vector_swap_at(
    sagejs_native_status *status,
    sagejs_native_fmpz_vector *vector,
    const fmpz_t left,
    const fmpz_t right)
{
    size_t left_position;
    size_t right_position;
    uint64_t charge;
    if (!sagejs_native_fmpz_vector_index(vector, left, &left_position) ||
        !sagejs_native_fmpz_vector_index(vector, right, &right_position))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "NativeIntegerVector index out of range");
        return 0;
    }
    fmpz_swap(vector->entries + left_position,
        vector->entries + right_position);
    charge = vector->payload_charges[left_position];
    vector->payload_charges[left_position] =
        vector->payload_charges[right_position];
    vector->payload_charges[right_position] = charge;
    return 1;
}
`;

module.exports = {
  FMPZ_EXACT_RUNTIME_C_SOURCE,
};
