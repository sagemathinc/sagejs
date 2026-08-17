#define _POSIX_C_SOURCE 200809L

#include <assert.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "sagejs/number_field_order_resource_ffi.h"

typedef struct
{
    const char *id;
    const char *const *coefficients;
    size_t coefficient_count;
    const char *const *primes;
    size_t prime_count;
    const char *index;
    const char *equation_discriminant;
    const char *order_discriminant;
} benchmark_case;

static const char *const motivating_coefficients[] = {
    "3", "-2", "0", "0", "0", "0", "0", "1"
};
static const char *const essential_coefficients[] = {"8", "-2", "1", "1"};
static const char *const cubic_431_coefficients[] = {"-8", "-1", "0", "1"};
static const char *const quintic_17161_coefficients[] = {
    "2", "1", "-1", "2", "-1", "1"
};
static const char *const pari_2510_coefficients[] = {
    "3136", "0", "-3136", "0", "840", "0", "-56", "0", "1"
};
static const char *const pari_1710_coefficients[] = {
    "-25772600", "0", "0", "0", "0", "-29080",
    "0", "0", "0", "0", "1"
};
static const char *const prime_2[] = {"2"};
static const char *const primes_2_7[] = {"2", "7"};
static const char *const primes_2_3_5_11[] = {"2", "3", "5", "11"};

static const benchmark_case cases[] = {
    {
        "motivating-degree-7",
        motivating_coefficients,
        sizeof(motivating_coefficients) / sizeof(*motivating_coefficients),
        NULL,
        0,
        "1",
        "-594390879",
        "-594390879",
    },
    {
        "sage-essential-discriminant",
        essential_coefficients,
        sizeof(essential_coefficients) / sizeof(*essential_coefficients),
        prime_2,
        sizeof(prime_2) / sizeof(*prime_2),
        "2",
        "-2012",
        "-503",
    },
    {
        "lmfdb-3.1.431.1",
        cubic_431_coefficients,
        sizeof(cubic_431_coefficients) / sizeof(*cubic_431_coefficients),
        prime_2,
        sizeof(prime_2) / sizeof(*prime_2),
        "2",
        "-1724",
        "-431",
    },
    {
        "lmfdb-5.1.17161.1",
        quintic_17161_coefficients,
        sizeof(quintic_17161_coefficients) / sizeof(*quintic_17161_coefficients),
        prime_2,
        sizeof(prime_2) / sizeof(*prime_2),
        "2",
        "68644",
        "17161",
    },
    {
        "pari-2510",
        pari_2510_coefficients,
        sizeof(pari_2510_coefficients) / sizeof(*pari_2510_coefficients),
        primes_2_7,
        sizeof(primes_2_7) / sizeof(*primes_2_7),
        "629407744",
        "825921976173606605653909543321600",
        "2084850211225600",
    },
    {
        "pari-1710",
        pari_1710_coefficients,
        sizeof(pari_1710_coefficients) / sizeof(*pari_1710_coefficients),
        primes_2_3_5_11,
        sizeof(primes_2_3_5_11) / sizeof(*primes_2_3_5_11),
        "2450526376423118400000",
        "3311781756887166521006926156517503038317674993136440320000000000000000000000000000",
        "551496736222216254722000000000000000000",
    },
};

static double monotonic_seconds(void)
{
    struct timespec now;
    assert(clock_gettime(CLOCK_MONOTONIC, &now) == 0);
    return (double) now.tv_sec + (double) now.tv_nsec / 1000000000.0;
}

static void initialize_polynomial(
    sagejs_fmpz_polynomial_t output, const benchmark_case *item)
{
    assert(sagejs_fmpz_polynomial_init(output, item->coefficient_count));
    fmpz_t value;
    fmpz_init(value);
    for (size_t index = 0; index < item->coefficient_count; index++)
    {
        assert(fmpz_set_str(value, item->coefficients[index], 10) == 0);
        assert(sagejs_fmpz_polynomial_set_coefficient(output, index, value));
    }
    fmpz_clear(value);
    assert(sagejs_fmpz_polynomial_seal(output));
}

static void initialize_primes(
    sagejs_fmpz_matrix_t output, const benchmark_case *item)
{
    assert(sagejs_fmpz_matrix_init(output, item->prime_count, 1));
    fmpz_t value;
    fmpz_init(value);
    for (size_t index = 0; index < item->prime_count; index++)
    {
        assert(fmpz_set_str(value, item->primes[index], 10) == 0);
        assert(sagejs_fmpz_matrix_set_entry(output, index, 0, value));
    }
    fmpz_clear(value);
}

static void assert_fmpz_string(const fmpz_t value, const char *expected)
{
    char *actual = fmpz_get_str(NULL, 10, value);
    assert(actual != NULL && strcmp(actual, expected) == 0);
    flint_free(actual);
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

static void assert_result(
    const sagejs_number_field_order_resource_t result,
    const benchmark_case *item)
{
    assert(result->status == SAGEJS_NF_ORDER_COMPLETE);
    assert(result->supplied_prime_count == item->prime_count);
    assert(result->resolved_prime_count == item->prime_count);
    size_t offset = 64;
    fmpz_t value;
    fmpz_init(value);
    read_fmpz(value, result->data, &offset); /* denominator */
    read_fmpz(value, result->data, &offset); /* index */
    assert_fmpz_string(value, item->index);
    read_fmpz(value, result->data, &offset);
    assert_fmpz_string(value, item->equation_discriminant);
    read_fmpz(value, result->data, &offset);
    assert_fmpz_string(value, item->order_discriminant);
    fmpz_clear(value);
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

static void run_case(size_t case_index, uint64_t warmups, uint64_t rounds)
{
    assert(case_index < sizeof(cases) / sizeof(*cases));
    const benchmark_case *item = cases + case_index;
    sagejs_fmpz_polynomial_t polynomial;
    sagejs_fmpz_matrix_t hints;
    initialize_polynomial(polynomial, item);
    initialize_primes(hints, item);

    for (uint64_t warmup = 0; warmup < warmups; warmup++)
    {
        sagejs_number_field_order_resource_t result;
        assert(sagejs_number_field_order_from_polynomial_resource(
            result, polynomial, hints));
        assert_result(result, item);
        sagejs_number_field_order_resource_clear(result);
    }

    size_t transferred = 0;
    const double started = monotonic_seconds();
    for (uint64_t round = 0; round < rounds; round++)
    {
        sagejs_number_field_order_resource_t result;
        assert(sagejs_number_field_order_from_polynomial_resource(
            result, polynomial, hints));
        assert_result(result, item);
        transferred += result->length;
        sagejs_number_field_order_resource_clear(result);
    }
    const double elapsed = monotonic_seconds() - started;

    sagejs_number_field_order_resource_t final_result;
    assert(sagejs_number_field_order_from_polynomial_resource(
        final_result, polynomial, hints));
    assert_result(final_result, item);
    printf("{\"schema\":\"sagejs.number-field-order-resource-kernel/v1\"," 
           "\"id\":\"%s\",\"degree\":%zu,\"primeHints\":%zu,"
           "\"warmups\":%" PRIu64 ",\"rounds\":%" PRIu64 ","
           "\"elapsedMs\":%.9f,\"meanUs\":%.9f,"
           "\"transferredBytes\":%zu,\"payloadHex\":\"",
        item->id, item->coefficient_count - 1, item->prime_count,
        warmups, rounds, elapsed * 1000.0,
        elapsed * 1000000.0 / (double) rounds, transferred);
    print_hex(final_result->data, final_result->length);
    printf("\"}\n");
    sagejs_number_field_order_resource_clear(final_result);
    sagejs_fmpz_matrix_clear(hints);
    sagejs_fmpz_polynomial_clear(polynomial);
}

static void run_profile(size_t case_index, uint64_t rounds)
{
    assert(case_index < sizeof(cases) / sizeof(*cases));
    const benchmark_case *item = cases + case_index;
    sagejs_fmpz_polynomial_t polynomial;
    sagejs_fmpz_matrix_t hints;
    initialize_polynomial(polynomial, item);
    initialize_primes(hints, item);
    double discriminant_seconds = 0.0;
    double hint_seconds = 0.0;
    double table_seconds = 0.0;
    double round2_seconds = 0.0;
    double normalize_seconds = 0.0;
    double evidence_seconds = 0.0;
    double pack_seconds = 0.0;
    double cleanup_seconds = 0.0;

    for (uint64_t round = 0; round < rounds; round++)
    {
        fmpz_t equation_discriminant, denominator, index;
        fmpz_t order_discriminant, fallback_prime;
        fmpz_init(equation_discriminant);
        fmpz_init(denominator);
        fmpz_init(index);
        fmpz_init(order_discriminant);
        fmpz_init(fallback_prime);
        double started = monotonic_seconds();
        fmpz_poly_discriminant(equation_discriminant, polynomial->value);
        discriminant_seconds += monotonic_seconds() - started;

        uint64_t *word_primes = item->prime_count == 0 ? NULL :
            (uint64_t *) malloc(item->prime_count * sizeof(uint64_t));
        assert(item->prime_count == 0 || word_primes != NULL);
        started = monotonic_seconds();
        for (size_t prime_index = 0;
             prime_index < item->prime_count;
             prime_index++)
        {
            const fmpz *prime = fmpz_mat_entry(hints->value, prime_index, 0);
            assert(fmpz_is_prime(prime));
            assert(fmpz_divisible(equation_discriminant, prime));
            assert(fmpz_cmp_ui(prime, UWORD_MAX) <= 0);
            word_primes[prime_index] = fmpz_get_ui(prime);
        }
        hint_seconds += monotonic_seconds() - started;

        fmpz_mat_t numerator;
        fmpz_mat_init(numerator, item->coefficient_count - 1,
            item->coefficient_count - 1);
        sagejs_nf_order_identity_basis(
            numerator, denominator, (slong) item->coefficient_count - 1);
        sagejs_fmpz_matrix_t multiplication;
        sagejs_fmpq_matrix_t rational_basis;
        if (item->prime_count != 0)
        {
            started = monotonic_seconds();
            assert(sagejs_nf_order_polynomial_multiplication_table(
                multiplication, polynomial));
            table_seconds += monotonic_seconds() - started;
            started = monotonic_seconds();
            assert(sagejs_number_field_order_maximal_at_primes(
                rational_basis, multiplication,
                word_primes, item->prime_count));
            round2_seconds += monotonic_seconds() - started;
            started = monotonic_seconds();
            assert(sagejs_nf_order_basis_from_fmpq(
                numerator, denominator, rational_basis));
            normalize_seconds += monotonic_seconds() - started;
        }
        started = monotonic_seconds();
        assert(sagejs_nf_order_compute_evidence(
            index, order_discriminant, equation_discriminant,
            numerator, denominator));
        evidence_seconds += monotonic_seconds() - started;
        sagejs_number_field_order_resource_t result;
        sagejs_number_field_order_resource_reset(result);
        started = monotonic_seconds();
        assert(sagejs_nf_order_pack(result, numerator, denominator,
            index, equation_discriminant, order_discriminant,
            fallback_prime, SAGEJS_NF_ORDER_COMPLETE,
            item->prime_count, item->prime_count,
            item->prime_count, 0));
        pack_seconds += monotonic_seconds() - started;
        assert_result(result, item);

        started = monotonic_seconds();
        sagejs_number_field_order_resource_clear(result);
        if (item->prime_count != 0)
        {
            sagejs_fmpq_matrix_clear(rational_basis);
            sagejs_fmpz_matrix_clear(multiplication);
        }
        fmpz_mat_clear(numerator);
        free(word_primes);
        fmpz_clear(fallback_prime);
        fmpz_clear(order_discriminant);
        fmpz_clear(index);
        fmpz_clear(denominator);
        fmpz_clear(equation_discriminant);
        cleanup_seconds += monotonic_seconds() - started;
    }
    const double scale = 1000000.0 / (double) rounds;
    printf("{\"schema\":\"sagejs.number-field-order-resource-profile/v1\"," 
           "\"id\":\"%s\",\"rounds\":%" PRIu64 ","
           "\"stageMeanUs\":{\"discriminant\":%.9f,\"hints\":%.9f,"
           "\"multiplicationTable\":%.9f,\"round2\":%.9f,"
           "\"normalizeHnf\":%.9f,\"evidence\":%.9f,"
           "\"pack\":%.9f,\"cleanup\":%.9f}}\n",
        item->id, rounds,
        discriminant_seconds * scale, hint_seconds * scale,
        table_seconds * scale, round2_seconds * scale,
        normalize_seconds * scale, evidence_seconds * scale,
        pack_seconds * scale, cleanup_seconds * scale);
    sagejs_fmpz_matrix_clear(hints);
    sagejs_fmpz_polynomial_clear(polynomial);
}

int main(int argc, char **argv)
{
    if (argc == 4 && strcmp(argv[1], "--profile") == 0)
    {
        const size_t case_index = (size_t) strtoull(argv[2], NULL, 10);
        const uint64_t rounds = (uint64_t) strtoull(argv[3], NULL, 10);
        assert(rounds > 0);
        run_profile(case_index, rounds);
        return 0;
    }
    assert(argc == 4);
    const size_t case_index = (size_t) strtoull(argv[1], NULL, 10);
    const uint64_t warmups = (uint64_t) strtoull(argv[2], NULL, 10);
    const uint64_t rounds = (uint64_t) strtoull(argv[3], NULL, 10);
    assert(rounds > 0);
    run_case(case_index, warmups, rounds);
    return 0;
}
