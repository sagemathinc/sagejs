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
`;

module.exports = {
  FMPZ_EXACT_RUNTIME_C_SOURCE,
};
