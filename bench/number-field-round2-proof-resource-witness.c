#define _POSIX_C_SOURCE 200809L

#include <assert.h>
#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>

#if defined(SAGEJS_NF_ANALYSIS_PROOF_TEST_PTHREAD_FALLBACK)
#include <pthread.h>
static int sagejs_test_pthread_create_failure(
    pthread_t *thread, void *(*entry)(void *), void *argument)
{
    (void) thread;
    (void) entry;
    (void) argument;
    return EAGAIN;
}
#define SAGEJS_NF_ANALYSIS_PROOF_PTHREAD_CREATE(thread, entry, argument) \
    sagejs_test_pthread_create_failure((thread), (entry), (argument))
#endif

#include "sagejs/number_field_analysis_resource_ffi.h"

static void initialize_polynomial(
    sagejs_fmpz_polynomial_t polynomial, ulong constant)
{
    assert(sagejs_fmpz_polynomial_init(polynomial, UINT64_C(4)));
    fmpz_t value;
    fmpz_init(value);
    fmpz_neg_ui(value, constant);
    assert(sagejs_fmpz_polynomial_set_coefficient(
        polynomial, UINT64_C(0), value));
    fmpz_zero(value);
    assert(sagejs_fmpz_polynomial_set_coefficient(
        polynomial, UINT64_C(1), value));
    assert(sagejs_fmpz_polynomial_set_coefficient(
        polynomial, UINT64_C(2), value));
    fmpz_one(value);
    assert(sagejs_fmpz_polynomial_set_coefficient(
        polynomial, UINT64_C(3), value));
    fmpz_clear(value);
    assert(sagejs_fmpz_polynomial_seal(polynomial));
}

static slong initialize_primes(sagejs_fmpz_matrix_t hints, ulong constant)
{
    ulong values[16];
    slong count = 0;
    ulong remaining = 3 * constant;
    for (ulong prime = 2; prime <= remaining / prime; prime++)
        if (remaining % prime == 0)
        {
            values[count++] = prime;
            do remaining /= prime; while (remaining % prime == 0);
        }
    if (remaining > 1) values[count++] = remaining;
    assert(count >= 2);
    assert(sagejs_fmpz_matrix_init(hints, (uint64_t) count, UINT64_C(1)));
    for (slong row = 0; row < count; row++)
        fmpz_set_ui(fmpz_mat_entry(hints->value, row, 0), values[row]);
    sagejs_fmpz_matrix_recompute_allocated_bytes(hints);
    return count;
}

static uint64_t hash_bytes(
    uint64_t hash, const unsigned char *data, size_t length)
{
    for (size_t index = 0; index < length; index++)
    {
        hash ^= (uint64_t) data[index];
        hash *= UINT64_C(1099511628211);
    }
    return hash;
}

int main(void)
{
    static const ulong constants[] = {
        2, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 19
    };
    uint64_t hash = UINT64_C(1469598103934665603);
    size_t total_length = 0;
    size_t completed = 0;
    for (size_t case_index = 0;
         case_index < sizeof(constants) / sizeof(*constants); case_index++)
    {
        const ulong constant = constants[case_index];
        sagejs_fmpz_polynomial_t polynomial;
        sagejs_fmpz_matrix_t hints;
        initialize_polynomial(polynomial, constant);
        const slong prime_count = initialize_primes(hints, constant);
        sagejs_number_field_order_resource_t order;
        assert(sagejs_number_field_order_from_polynomial_resource(
            order, polynomial, hints));
        assert(order->status == SAGEJS_NF_ORDER_COMPLETE);
        assert(order->native_prime_count == (uint64_t) prime_count);
        sagejs_number_field_analysis_resource_t proof;
#if defined(SAGEJS_NF_ANALYSIS_PROOF_EXPECT_FAILURE)
        assert(!sagejs_number_field_round2_proof_resource(
            proof, polynomial, order, hints));
        assert(proof->data == NULL && proof->length == 0);
#else
        assert(sagejs_number_field_round2_proof_resource(
            proof, polynomial, order, hints));
        assert(proof->length > 48);
        hash = hash_bytes(hash, proof->data, proof->length);
        total_length += proof->length;
        completed++;
        sagejs_number_field_analysis_resource_clear(proof);
#endif
        sagejs_number_field_order_resource_clear(order);
        sagejs_fmpz_matrix_clear(hints);
        sagejs_fmpz_polynomial_clear(polynomial);
    }
#if defined(SAGEJS_NF_ANALYSIS_PROOF_EXPECT_FAILURE)
    puts("{\"failure_injection\":true}");
#else
    printf("{\"failure_injection\":false,\"completed\":%zu,"
           "\"total_length\":%zu,\"hash\":\"%016" PRIx64 "\"}\n",
        completed, total_length, hash);
#endif
    return 0;
}
