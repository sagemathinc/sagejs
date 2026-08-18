#define _POSIX_C_SOURCE 200809L

#include <assert.h>
#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>

#if defined(SAGEJS_NF_ORDER_TEST_PTHREAD_FALLBACK)
#include <pthread.h>
static int sagejs_test_pthread_create_failure(
    pthread_t *thread, void *(*entry)(void *), void *argument)
{
    (void) thread;
    (void) entry;
    (void) argument;
    return EAGAIN;
}
#define SAGEJS_NF_ORDER_INDEPENDENT_PTHREAD_CREATE(thread, entry, argument) \
    sagejs_test_pthread_create_failure((thread), (entry), (argument))
#endif

#include "sagejs/number_field_analysis_resource_ffi.h"

#if !defined(SAGEJS_NF_ORDER_TERMINAL_PROOF_EXPECT_FAILURE)
static uint64_t hash_word(uint64_t hash, uint64_t value)
{
    for (size_t byte = 0; byte < 8; byte++)
    {
        hash ^= (value >> (8 * byte)) & UINT64_C(255);
        hash *= UINT64_C(1099511628211);
    }
    return hash;
}

static uint64_t hash_fmpz(uint64_t hash, const fmpz_t value)
{
    const ulong modulus = UWORD(18446744073709551557);
    hash = hash_word(hash, fmpz_fdiv_ui(value, modulus));
    return hash_word(hash, fmpz_sgn(value) < 0 ? 1 : 0);
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
#endif

static void initialize_sparse_polynomial(
    sagejs_fmpz_polynomial_t polynomial, slong degree,
    slong linear, slong constant)
{
    assert(sagejs_fmpz_polynomial_init(
        polynomial, (uint64_t) degree + 1));
    fmpz_set_si(polynomial->value->coeffs, constant);
    fmpz_set_si(polynomial->value->coeffs + 1, linear);
    fmpz_one(polynomial->value->coeffs + degree);
    _fmpz_poly_set_length(polynomial->value, degree + 1);
    assert(sagejs_fmpz_polynomial_seal(polynomial));
}

static uint64_t check_independent_terminal_proofs(void)
{
    sagejs_fmpz_polynomial_t polynomial;
    sagejs_fmpz_matrix_t table;
    initialize_sparse_polynomial(polynomial, 65, 1, 1);
    assert(sagejs_nf_order_polynomial_multiplication_table(table, polynomial));
    const uint64_t primes[] = {101, 103};
    sagejs_nf_order_terminal_proof proofs[2] = {{0}, {0}};
    sagejs_fmpq_matrix_t order;
    const int success =
        sagejs_number_field_order_maximal_at_primes_with_terminal_proofs(
            order, table, primes, 2, proofs);
#if defined(SAGEJS_NF_ORDER_TERMINAL_PROOF_EXPECT_FAILURE)
    assert(!success);
    for (size_t proof = 0; proof < 2; proof++)
        sagejs_nf_order_terminal_proof_clear(proofs + proof);
    sagejs_fmpz_matrix_clear(table);
    sagejs_fmpz_polynomial_clear(polynomial);
    return UINT64_C(0);
#else
    assert(success);
    uint64_t hash = UINT64_C(1469598103934665603);
    for (size_t proof_index = 0; proof_index < 2; proof_index++)
    {
        const sagejs_nf_order_terminal_proof *proof = proofs + proof_index;
        assert(proof->initialized && proof->prime == primes[proof_index]);
        assert(proof->radical_dimension >= 0 &&
            proof->radical_dimension <= 65);
        hash = hash_word(hash, proof->prime);
        hash = hash_fmpz(hash, proof->local_denominator);
        hash = hash_word(hash, (uint64_t) proof->radical_dimension);
        for (slong row = 0; row < 65; row++)
        {
            assert(proof->selectors[row] >= 0 && proof->selectors[row] < 65 * 65);
            hash = hash_word(hash, (uint64_t) proof->selectors[row]);
            for (slong column = 0; column < 65; column++)
            {
                hash = hash_fmpz(hash,
                    fmpz_mat_entry(proof->local_numerator, row, column));
                hash = hash_word(hash,
                    nmod_mat_entry(proof->minor, row, column));
            }
        }
        for (slong row = 0; row < proof->radical_dimension; row++)
            for (slong column = 0; column < 65; column++)
                hash = hash_word(hash,
                    nmod_mat_entry(proof->radical, row, column));
        sagejs_nf_order_terminal_proof_clear(proofs + proof_index);
    }
    sagejs_fmpq_matrix_clear(order);
    sagejs_fmpz_matrix_clear(table);
    sagejs_fmpz_polynomial_clear(polynomial);
    return hash;
#endif
}

#if !defined(SAGEJS_NF_ORDER_TERMINAL_PROOF_EXPECT_FAILURE)
static uint64_t check_carried_resource(size_t *length_result)
{
    sagejs_fmpz_polynomial_t polynomial;
    sagejs_fmpz_matrix_t hints;
    initialize_sparse_polynomial(polynomial, 2, 0, -5);
    assert(sagejs_fmpz_matrix_init(hints, UINT64_C(1), UINT64_C(1)));
    fmpz_set_ui(fmpz_mat_entry(hints->value, 0, 0), UWORD(2));
    sagejs_fmpz_matrix_recompute_allocated_bytes(hints);
    sagejs_number_field_analysis_resource_t carried;
    assert(sagejs_number_field_order_with_round2_proof_resource(
        carried, polynomial, hints));
    assert(carried->length > 72 && memcmp(carried->data, "SJNFQ\1\0\0", 8) == 0);
    assert(sagejs_nf_analysis_read_u64(carried->data, 8) == UINT64_C(2));
    assert(sagejs_nf_analysis_read_u64(carried->data, 16) == UINT64_C(1));
    assert(sagejs_nf_analysis_read_u64(carried->data, 24) == UINT64_C(1));
    *length_result = carried->length;
    const uint64_t hash = hash_bytes(
        UINT64_C(1469598103934665603), carried->data, carried->length);
    sagejs_number_field_analysis_resource_clear(carried);
    sagejs_fmpz_matrix_clear(hints);
    sagejs_fmpz_polynomial_clear(polynomial);
    return hash;
}
#endif

int main(void)
{
#if defined(SAGEJS_NF_ORDER_TERMINAL_PROOF_EXPECT_FAILURE)
    (void) check_independent_terminal_proofs();
    puts("{\"failure_injection\":true}");
#else
    const uint64_t terminal_hash = check_independent_terminal_proofs();
    size_t carried_length = 0;
    const uint64_t carried_hash = check_carried_resource(&carried_length);
    printf("{\"failure_injection\":false,\"terminal_hash\":\"%016" PRIx64
           "\",\"carried_hash\":\"%016" PRIx64
           "\",\"carried_length\":%zu}\n",
        terminal_hash, carried_hash, carried_length);
#endif
    flint_cleanup_master();
    return 0;
}
