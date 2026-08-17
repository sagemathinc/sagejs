#include <assert.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "sagejs/number_field_order_resource_ffi.h"

static uint64_t read_u64(const unsigned char *data)
{
    uint64_t value = 0;
    for (size_t byte = 0; byte < 8; byte++)
        value |= (uint64_t) data[byte] << (8 * byte);
    return value;
}

static void read_fmpz(fmpz_t value, const unsigned char *data, size_t *offset)
{
    uint32_t header = 0;
    for (size_t byte = 0; byte < 4; byte++)
        header |= (uint32_t) data[(*offset)++] << (8 * byte);
    const int negative = (header & UINT32_C(0x80000000)) != 0;
    const size_t bytes = (size_t) (header & UINT32_C(0x7fffffff));
    const size_t words_count = (bytes + sizeof(ulong) - 1) / sizeof(ulong);
    ulong *words = words_count == 0 ? NULL :
        (ulong *) calloc(words_count, sizeof(ulong));
    assert(words_count == 0 || words != NULL);
    for (size_t byte = 0; byte < bytes; byte++)
        words[byte / sizeof(ulong)] |=
            (ulong) data[(*offset)++] << (8 * (byte % sizeof(ulong)));
    fmpz_set_ui_array(value, words, (slong) words_count);
    if (negative)
        fmpz_neg(value, value);
    free(words);
}

static void polynomial(
    sagejs_fmpz_polynomial_t output, const char *const *coefficients,
    size_t count)
{
    assert(sagejs_fmpz_polynomial_init(output, (uint64_t) count));
    fmpz_t coefficient;
    fmpz_init(coefficient);
    for (size_t index = 0; index < count; index++)
    {
        assert(fmpz_set_str(coefficient, coefficients[index], 10) == 0);
        assert(sagejs_fmpz_polynomial_set_coefficient(
            output, (uint64_t) index, coefficient));
    }
    fmpz_clear(coefficient);
    assert(sagejs_fmpz_polynomial_seal(output));
}

static void prime_matrix(
    sagejs_fmpz_matrix_t output, const char *const *primes, size_t count)
{
    assert(sagejs_fmpz_matrix_init(output, (uint64_t) count, 1));
    fmpz_t prime;
    fmpz_init(prime);
    for (size_t index = 0; index < count; index++)
    {
        assert(fmpz_set_str(prime, primes[index], 10) == 0);
        assert(sagejs_fmpz_matrix_set_entry(output, index, 0, prime));
    }
    fmpz_clear(prime);
}

static void assert_integer(const fmpz_t value, const char *expected)
{
    char *actual = fmpz_get_str(NULL, 10, value);
    assert(strcmp(actual, expected) == 0);
    flint_free(actual);
}

static void assert_quadratic_result(
    const sagejs_number_field_order_resource_t order,
    uint64_t status, const char *denominator, const char *index,
    const char *equation_discriminant, const char *order_discriminant,
    const char *fallback_prime,
    const char *n00, const char *n01, const char *n10, const char *n11)
{
    assert(order->length >= 64);
    assert(memcmp(order->data, "SJNFO\1\0\0", 8) == 0);
    assert(read_u64(order->data + 8) == 2);
    assert(read_u64(order->data + 16) == status);
    assert(read_u64(order->data + 56) == 9);
    const char *expected[] = {
        denominator, index, equation_discriminant, order_discriminant,
        fallback_prime, n00, n01, n10, n11
    };
    size_t offset = 64;
    fmpz_t value;
    fmpz_init(value);
    for (size_t entry = 0; entry < 9; entry++)
    {
        read_fmpz(value, order->data, &offset);
        assert_integer(value, expected[entry]);
    }
    fmpz_clear(value);
    assert(offset == order->length);
}

static void assert_cubic_index_two(
    const sagejs_number_field_order_resource_t order)
{
    assert(memcmp(order->data, "SJNFO\1\0\0", 8) == 0);
    assert(read_u64(order->data + 8) == 3);
    assert(read_u64(order->data + 16) == SAGEJS_NF_ORDER_COMPLETE);
    assert(read_u64(order->data + 56) == 14);
    const char *expected[] = {
        "2", "2", "-2012", "-503", "0",
        "2", "0", "0", "0", "1", "1", "0", "0", "2"
    };
    size_t offset = 64;
    fmpz_t value;
    fmpz_init(value);
    for (size_t entry = 0; entry < 14; entry++)
    {
        read_fmpz(value, order->data, &offset);
        assert_integer(value, expected[entry]);
    }
    fmpz_clear(value);
    assert(offset == order->length);
}

static void print_hex(const unsigned char *data, size_t length)
{
    static const char digits[] = "0123456789abcdef";
    for (size_t index = 0; index < length; index++)
    {
        putchar(digits[data[index] >> 4]);
        putchar(digits[data[index] & 15]);
    }
}

static void run_correctness(void)
{
    const char *sqrt5_coefficients[] = {"-5", "0", "1"};
    const char *gaussian_coefficients[] = {"1", "0", "1"};
    const char *cubic_coefficients[] = {"8", "-2", "1", "1"};
    const char *prime2[] = {"2"};
    sagejs_fmpz_polynomial_t sqrt5, gaussian, cubic;
    sagejs_fmpz_matrix_t hints2;
    polynomial(sqrt5, sqrt5_coefficients, 3);
    polynomial(gaussian, gaussian_coefficients, 3);
    polynomial(cubic, cubic_coefficients, 4);
    prime_matrix(hints2, prime2, 1);

    sagejs_number_field_order_resource_t maximal, already_maximal;
    assert(sagejs_number_field_order_from_polynomial_resource(
        maximal, sqrt5, hints2));
    assert(maximal->status == SAGEJS_NF_ORDER_COMPLETE);
    assert(maximal->supplied_prime_count == 1);
    assert(maximal->resolved_prime_count == 1);
    assert(maximal->native_prime_count == 1);
    assert(maximal->unramified_prime_count == 0);
    assert(maximal->retained_bytes ==
        sizeof(sagejs_number_field_order_resource_struct) + maximal->length);
    /* Canonical HNF rows span <1, (1 + x)/2>. */
    assert_quadratic_result(maximal, SAGEJS_NF_ORDER_COMPLETE,
        "2", "2", "20", "5", "0", "1", "1", "0", "2");

    assert(sagejs_number_field_order_from_polynomial_resource(
        already_maximal, gaussian, hints2));
    assert(already_maximal->native_prime_count == 1);
    assert_quadratic_result(already_maximal, SAGEJS_NF_ORDER_COMPLETE,
        "1", "1", "-4", "-4", "0", "1", "0", "0", "1");

    sagejs_number_field_order_resource_t cubic_maximal;
    assert(sagejs_number_field_order_from_polynomial_resource(
        cubic_maximal, cubic, hints2));
    assert_cubic_index_two(cubic_maximal);

    /* Arbitrary-size hints are never narrowed.  This prime is unramified and
       is certified from the exact discriminant without entering nmod. */
    const char *large_unramified[] = {"170141183460469231731687303715884105727"};
    sagejs_fmpz_matrix_t large_unramified_hints;
    prime_matrix(large_unramified_hints, large_unramified, 1);
    sagejs_number_field_order_resource_t large_resolved;
    assert(sagejs_number_field_order_from_polynomial_resource(
        large_resolved, sqrt5, large_unramified_hints));
    assert(large_resolved->status == SAGEJS_NF_ORDER_COMPLETE);
    assert(large_resolved->native_prime_count == 0);
    assert(large_resolved->unramified_prime_count == 1);
    assert(large_resolved->resolved_prime_count == 1);
    assert_quadratic_result(large_resolved, SAGEJS_NF_ORDER_COMPLETE,
        "1", "1", "20", "20", "0", "1", "0", "0", "1");

    /* A ramified arbitrary-size prime yields a precise fallback result and an
       equation-order basis which central orchestration must not accept as
       maximal.  The complete prime survives in the compact transfer. */
    const char *large_prime = "170141183460469231731687303715884105727";
    fmpz_t p;
    fmpz_init(p);
    assert(fmpz_set_str(p, large_prime, 10) == 0);
    char *positive_prime = fmpz_get_str(NULL, 10, p);
    size_t negative_length = strlen(positive_prime) + 2;
    char *constant = (char *) malloc(negative_length);
    assert(constant != NULL);
    constant[0] = '-';
    strcpy(constant + 1, positive_prime);
    /* x^3 - p is irreducible by Eisenstein, with discriminant -27*p^2. */
    const char *large_coefficients[] = {constant, "0", "0", "1"};
    sagejs_fmpz_polynomial_t ramified;
    polynomial(ramified, large_coefficients, 4);
    sagejs_fmpz_matrix_t large_ramified_hints;
    prime_matrix(large_ramified_hints, large_unramified, 1);
    sagejs_number_field_order_resource_t fallback;
    assert(sagejs_number_field_order_from_polynomial_resource(
        fallback, ramified, large_ramified_hints));
    assert(fallback->status == SAGEJS_NF_ORDER_FALLBACK_ARBITRARY_PRIME);
    assert(fallback->resolved_prime_count == 0);
    assert(fallback->native_prime_count == 0);
    size_t offset = 64;
    fmpz_t decoded;
    fmpz_init(decoded);
    for (size_t entry = 0; entry < 4; entry++)
        read_fmpz(decoded, fallback->data, &offset);
    read_fmpz(decoded, fallback->data, &offset);
    assert(fmpz_equal(decoded, p));
    fmpz_clear(decoded);

    /* Composite hints and inseparable inputs fail before publishing an owner. */
    const char *composite15[] = {"15"};
    sagejs_fmpz_matrix_t invalid_hints;
    prime_matrix(invalid_hints, composite15, 1);
    sagejs_number_field_order_resource_t rejected;
    assert(!sagejs_number_field_order_from_polynomial_resource(
        rejected, sqrt5, invalid_hints));
    assert(rejected->data == NULL);
    const char *repeated_coefficients[] = {"0", "0", "1"};
    sagejs_fmpz_polynomial_t repeated;
    polynomial(repeated, repeated_coefficients, 3);
    assert(!sagejs_number_field_order_from_polynomial_resource(
        rejected, repeated, hints2));

    /* Stress independent construct/transfer/close schedules for sanitizers. */
    for (size_t iteration = 0; iteration < 1024; iteration++)
    {
        sagejs_number_field_order_resource_t temporary;
        assert(sagejs_number_field_order_from_polynomial_resource(
            temporary, sqrt5, hints2));
        assert(temporary->data != NULL && temporary->length != 0);
        sagejs_number_field_order_resource_clear(temporary);
        assert(temporary->data == NULL);
    }

    printf("{\"schema\":\"sagejs.number-field-order-resource/v1\","
           "\"sqrt5\":\"");
    print_hex(maximal->data, maximal->length);
    printf("\",\"gaussian\":\"");
    print_hex(already_maximal->data, already_maximal->length);
    printf("\",\"cubicIndexTwo\":\"");
    print_hex(cubic_maximal->data, cubic_maximal->length);
    printf("\",\"largeUnramified\":\"");
    print_hex(large_resolved->data, large_resolved->length);
    printf("\",\"largeFallbackStatus\":%u,\"stressRounds\":1024}\n",
        fallback->status);

    sagejs_number_field_order_resource_clear(fallback);
    sagejs_fmpz_matrix_clear(large_ramified_hints);
    sagejs_fmpz_polynomial_clear(ramified);
    free(constant);
    flint_free(positive_prime);
    fmpz_clear(p);
    sagejs_fmpz_polynomial_clear(repeated);
    sagejs_fmpz_matrix_clear(invalid_hints);
    sagejs_number_field_order_resource_clear(large_resolved);
    sagejs_fmpz_matrix_clear(large_unramified_hints);
    sagejs_number_field_order_resource_clear(already_maximal);
    sagejs_number_field_order_resource_clear(maximal);
    sagejs_fmpz_matrix_clear(hints2);
    sagejs_number_field_order_resource_clear(cubic_maximal);
    sagejs_fmpz_polynomial_clear(cubic);
    sagejs_fmpz_polynomial_clear(gaussian);
    sagejs_fmpz_polynomial_clear(sqrt5);
}

static double monotonic_seconds(void)
{
    struct timespec now;
    assert(timespec_get(&now, TIME_UTC) == TIME_UTC);
    return (double) now.tv_sec + (double) now.tv_nsec / 1000000000.0;
}

static void run_benchmark(uint64_t rounds)
{
    const char *coefficients[] = {"3", "-2", "0", "0", "0", "0", "0", "1"};
    const char *primes[] = {"2", "3", "5", "7", "11"};
    sagejs_fmpz_polynomial_t polynomial_value;
    sagejs_fmpz_matrix_t hints;
    polynomial(polynomial_value, coefficients, 8);
    prime_matrix(hints, primes, 5);
    for (size_t warmup = 0; warmup < 8; warmup++)
    {
        sagejs_number_field_order_resource_t result;
        assert(sagejs_number_field_order_from_polynomial_resource(
            result, polynomial_value, hints));
        sagejs_number_field_order_resource_clear(result);
    }
    const double started = monotonic_seconds();
    size_t transferred = 0;
    for (uint64_t round = 0; round < rounds; round++)
    {
        sagejs_number_field_order_resource_t result;
        assert(sagejs_number_field_order_from_polynomial_resource(
            result, polynomial_value, hints));
        assert(result->status == SAGEJS_NF_ORDER_COMPLETE);
        transferred += result->length;
        sagejs_number_field_order_resource_clear(result);
    }
    const double elapsed = monotonic_seconds() - started;
    printf("{\"schema\":\"sagejs.number-field-order-resource-bench/v1\","
           "\"degree\":7,\"primeHints\":5,\"rounds\":%" PRIu64
           ",\"elapsedMs\":%.6f,\"meanUs\":%.6f,"
           "\"transferredBytes\":%zu}\n",
        rounds, elapsed * 1000.0, elapsed * 1000000.0 / (double) rounds,
        transferred);
    sagejs_fmpz_matrix_clear(hints);
    sagejs_fmpz_polynomial_clear(polynomial_value);
}

int main(int argc, char **argv)
{
    if (argc == 3 && strcmp(argv[1], "--benchmark") == 0)
    {
        const uint64_t rounds = (uint64_t) strtoull(argv[2], NULL, 10);
        assert(rounds > 0);
        run_benchmark(rounds);
        return 0;
    }
    assert(argc == 1);
    run_correctness();
    return 0;
}
