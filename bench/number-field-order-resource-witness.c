#define _POSIX_C_SOURCE 200809L

#include <assert.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static void nf_profile_begin(const char *phase);
static void nf_profile_end(const char *phase);
static void nf_profile_iteration(long radical_dimension, long nullity);
static void nf_profile_equations(long total_rows, long retained_rows);

#define SAGEJS_NF_ORDER_PROFILE_BEGIN(phase) nf_profile_begin(phase)
#define SAGEJS_NF_ORDER_PROFILE_END(phase) nf_profile_end(phase)
#define SAGEJS_NF_ORDER_PROFILE_ITERATION(radical_dimension, nullity) \
    nf_profile_iteration(radical_dimension, nullity)
#define SAGEJS_NF_ORDER_PROFILE_EQUATIONS(total_rows, retained_rows) \
    nf_profile_equations(total_rows, retained_rows)
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
static const char *const vector429_coefficients[] = {
    "464167528830919430707812939827867130195290216481",
    "0",
    "-17664834640659843760086846517563699616091492848896",
    "0",
    "112835081178121597247315790519267337889550215700672",
    "0",
    "-293678194586629498753778041508197163621948960832960",
    "0",
    "377528109863340174709450199038785141413258084463900",
    "0",
    "-257022322568849250028056718999196809455429653200128",
    "0",
    "98647323369477358239247622147334076753681287255648",
    "0",
    "-23439111687336557701224954796394993807990875876416",
    "0",
    "3726806815195567658159272381046654302782322548810",
    "0",
    "-420671474677100937747713465131110877388775747840",
    "0",
    "35234824323208949432122287222843195049195649184",
    "0",
    "-2263985500383570937855397654604966209249105664",
    "0",
    "114452317987845573283355038818157554058821648",
    "0",
    "-4641329002870144811569747153738728312276480",
    "0",
    "153256282053016072956650306840248729289280",
    "0",
    "-4168270688350510971203431806915951526848",
    "0",
    "94205009985586665787286958769846028883",
    "0",
    "-1780798310985522419497792899399649536",
    "0",
    "28286761991498448324281307379182240",
    "0",
    "-378647131200860936657636244230400",
    "0",
    "4276794417515300890531785084048",
    "0",
    "-40745795222319658376664019968",
    "0",
    "326768343229764821604655296",
    "0",
    "-2197264040603188502904000",
    "0",
    "12312194148189466704810",
    "0",
    "-56979500534544010752",
    "0",
    "215057090579702112",
    "0",
    "-650301043097664",
    "0",
    "1535600481660",
    "0",
    "-2724744960",
    "0",
    "3413088",
    "0",
    "-2688",
    "0",
    "1",
};
static const char *const vector010_coefficients[] = {
    "87782430961", "0", "73445288000", "0", "1769278869776", "0",
    "2940754348320", "0", "3788371498452", "0", "3275906117440", "0",
    "1764753386480", "0", "613283590880", "0", "143402547926", "0",
    "23223642560", "0", "2645190320", "0", "212540000", "0",
    "11928052", "0", "455360", "0", "11216", "0", "160", "0", "1",
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
    {
        "pari-round4-vector-429-p2",
        vector429_coefficients,
        sizeof(vector429_coefficients) / sizeof(*vector429_coefficients),
        prime_2,
        sizeof(prime_2) / sizeof(*prime_2),
        "8749002899132047697490008908470485461412677723572849745703082425639811996797503692894052708092215296",
        NULL,
        NULL,
    },
    {
        "pari-round4-vector-010-p2",
        vector010_coefficients,
        sizeof(vector010_coefficients) / sizeof(*vector010_coefficients),
        prime_2,
        sizeof(prime_2) / sizeof(*prime_2),
        "6739986666787659948666753771754907668409286105635143120275902562304",
        NULL,
        NULL,
    },
};

static double monotonic_seconds(void)
{
    struct timespec now;
    assert(clock_gettime(CLOCK_MONOTONIC, &now) == 0);
    return (double) now.tv_sec + (double) now.tv_nsec / 1000000000.0;
}

typedef struct
{
    const char *name;
    double seconds;
    uint64_t allocation_calls;
    uint64_t free_calls;
    uint64_t requested_bytes;
} profile_phase;

static profile_phase profile_phases[] = {
    {"setup", 0.0, 0, 0, 0},
    {"modular-table", 0.0, 0, 0, 0},
    {"radical", 0.0, 0, 0, 0},
    {"multiplier", 0.0, 0, 0, 0},
    {"basis-prepare", 0.0, 0, 0, 0},
    {"basis-transform", 0.0, 0, 0, 0},
    {"basis-output", 0.0, 0, 0, 0},
    {"publish", 0.0, 0, 0, 0},
    {"cleanup", 0.0, 0, 0, 0},
};
static slong profile_current = -1;
static double profile_started = 0.0;
static uint64_t profile_iterations = 0;
static uint64_t profile_enlargements = 0;
static uint64_t profile_radical_dimension_sum = 0;
static uint64_t profile_nullity_sum = 0;
static uint64_t profile_equation_rows = 0;
static uint64_t profile_retained_equation_rows = 0;

static void *(*profile_original_alloc)(size_t) = NULL;
static void *(*profile_original_calloc)(size_t, size_t) = NULL;
static void *(*profile_original_realloc)(void *, size_t) = NULL;
static void (*profile_original_free)(void *) = NULL;
static void *(*profile_original_aligned_alloc)(size_t, size_t) = NULL;
static void (*profile_original_aligned_free)(void *) = NULL;

static slong nf_profile_phase_index(const char *name)
{
    const slong count = (slong) (sizeof(profile_phases) / sizeof(*profile_phases));
    for (slong index = 0; index < count; index++)
        if (strcmp(profile_phases[index].name, name) == 0)
            return index;
    assert(!"unknown Round-2 profile phase");
    return -1;
}

static void nf_profile_begin(const char *phase)
{
    assert(profile_current == -1);
    profile_current = nf_profile_phase_index(phase);
    profile_started = monotonic_seconds();
}

static void nf_profile_end(const char *phase)
{
    const slong index = nf_profile_phase_index(phase);
    assert(index == profile_current);
    profile_phases[index].seconds += monotonic_seconds() - profile_started;
    profile_current = -1;
}

static void nf_profile_iteration(long radical_dimension, long nullity)
{
    profile_iterations++;
    profile_radical_dimension_sum += (uint64_t) radical_dimension;
    if (nullity > 0)
    {
        profile_enlargements++;
        profile_nullity_sum += (uint64_t) nullity;
    }
}

static void nf_profile_equations(long total_rows, long retained_rows)
{
    profile_equation_rows += (uint64_t) total_rows;
    profile_retained_equation_rows += (uint64_t) retained_rows;
}

static void nf_profile_allocation(size_t bytes)
{
    if (profile_current >= 0)
    {
        profile_phases[profile_current].allocation_calls++;
        profile_phases[profile_current].requested_bytes += (uint64_t) bytes;
    }
}

static void *nf_profile_alloc(size_t bytes)
{
    nf_profile_allocation(bytes);
    return profile_original_alloc(bytes);
}

static void *nf_profile_calloc(size_t count, size_t bytes)
{
    assert(bytes == 0 || count <= SIZE_MAX / bytes);
    nf_profile_allocation(count * bytes);
    return profile_original_calloc(count, bytes);
}

static void *nf_profile_realloc(void *pointer, size_t bytes)
{
    nf_profile_allocation(bytes);
    return profile_original_realloc(pointer, bytes);
}

static void nf_profile_free(void *pointer)
{
    if (profile_current >= 0)
        profile_phases[profile_current].free_calls++;
    profile_original_free(pointer);
}

static void *nf_profile_aligned_alloc(size_t alignment, size_t bytes)
{
    nf_profile_allocation(bytes);
    return profile_original_aligned_alloc(alignment, bytes);
}

static void nf_profile_aligned_free(void *pointer)
{
    if (profile_current >= 0)
        profile_phases[profile_current].free_calls++;
    profile_original_aligned_free(pointer);
}

static void nf_profile_install_allocator(void)
{
    __flint_get_all_memory_functions(
        &profile_original_alloc, &profile_original_calloc,
        &profile_original_realloc, &profile_original_free,
        &profile_original_aligned_alloc, &profile_original_aligned_free);
    __flint_set_all_memory_functions(
        nf_profile_alloc, nf_profile_calloc, nf_profile_realloc,
        nf_profile_free, nf_profile_aligned_alloc,
        nf_profile_aligned_free);
}

static void nf_profile_restore_allocator(void)
{
    __flint_set_all_memory_functions(
        profile_original_alloc, profile_original_calloc,
        profile_original_realloc, profile_original_free,
        profile_original_aligned_alloc, profile_original_aligned_free);
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
    if (item->equation_discriminant != NULL)
        assert_fmpz_string(value, item->equation_discriminant);
    read_fmpz(value, result->data, &offset);
    if (item->order_discriminant != NULL)
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

static void run_payload(size_t case_index)
{
    assert(case_index < sizeof(cases) / sizeof(*cases));
    const benchmark_case *item = cases + case_index;
    sagejs_fmpz_polynomial_t polynomial;
    sagejs_fmpz_matrix_t hints;
    initialize_polynomial(polynomial, item);
    initialize_primes(hints, item);
    sagejs_number_field_order_resource_t result;
    assert(sagejs_number_field_order_from_polynomial_resource(
        result, polynomial, hints));
    assert_result(result, item);
    print_hex(result->data, result->length);
    putchar('\n');
    sagejs_number_field_order_resource_clear(result);
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
    for (size_t phase = 0;
         phase < sizeof(profile_phases) / sizeof(*profile_phases); phase++)
    {
        profile_phases[phase].seconds = 0.0;
        profile_phases[phase].allocation_calls = 0;
        profile_phases[phase].free_calls = 0;
        profile_phases[phase].requested_bytes = 0;
    }
    profile_iterations = 0;
    profile_enlargements = 0;
    profile_radical_dimension_sum = 0;
    profile_nullity_sum = 0;
    profile_equation_rows = 0;
    profile_retained_equation_rows = 0;
    nf_profile_install_allocator();

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
    nf_profile_restore_allocator();
    const double scale = 1000000.0 / (double) rounds;
    printf("{\"schema\":\"sagejs.number-field-order-resource-profile/v1\"," 
           "\"id\":\"%s\",\"rounds\":%" PRIu64 ","
           "\"stageMeanUs\":{\"discriminant\":%.9f,\"hints\":%.9f,"
           "\"multiplicationTable\":%.9f,\"round2\":%.9f,"
           "\"normalizeHnf\":%.9f,\"evidence\":%.9f,"
           "\"pack\":%.9f,\"cleanup\":%.9f},"
           "\"round2Detail\":{\"phases\":{",
        item->id, rounds,
        discriminant_seconds * scale, hint_seconds * scale,
        table_seconds * scale, round2_seconds * scale,
        normalize_seconds * scale, evidence_seconds * scale,
        pack_seconds * scale, cleanup_seconds * scale);
    for (size_t phase = 0;
         phase < sizeof(profile_phases) / sizeof(*profile_phases); phase++)
    {
        if (phase != 0) putchar(',');
        printf("\"%s\":{\"meanUs\":%.9f,\"allocationsPerRound\":%.9f,"
               "\"freesPerRound\":%.9f,\"requestedBytesPerRound\":%.9f}",
            profile_phases[phase].name,
            profile_phases[phase].seconds * scale,
            (double) profile_phases[phase].allocation_calls / (double) rounds,
            (double) profile_phases[phase].free_calls / (double) rounds,
            (double) profile_phases[phase].requested_bytes / (double) rounds);
    }
    const double iterations = (double) profile_iterations;
    const double enlargements = (double) profile_enlargements;
    printf("}},\"iterationSummary\":{\"iterationsPerRound\":%.9f,"
           "\"enlargementsPerRound\":%.9f,"
           "\"meanRadicalDimension\":%.9f,"
           "\"meanPositiveNullity\":%.9f,"
           "\"equationRowsPerRound\":%.9f,"
           "\"retainedEquationRowsPerRound\":%.9f}}\n",
        iterations / (double) rounds,
        enlargements / (double) rounds,
        iterations == 0.0 ? 0.0 :
            (double) profile_radical_dimension_sum / iterations,
        enlargements == 0.0 ? 0.0 :
            (double) profile_nullity_sum / enlargements,
        (double) profile_equation_rows / (double) rounds,
        (double) profile_retained_equation_rows / (double) rounds);
    sagejs_fmpz_matrix_clear(hints);
    sagejs_fmpz_polynomial_clear(polynomial);
}

static uint64_t randomized_state;

static uint64_t randomized_word(void)
{
    randomized_state = randomized_state * UINT64_C(6364136223846793005) +
        UINT64_C(1442695040888963407);
    return randomized_state;
}

static void run_randomized(uint64_t seed, uint64_t count)
{
    static const ulong candidate_primes[] = {2, 3, 5, 7, 11};
    randomized_state = seed;
    uint64_t emitted = 0;
    for (uint64_t attempt = 0; emitted < count && attempt < count * 1000; attempt++)
    {
        const slong degree = 2 + (slong) (randomized_word() % 5);
        sagejs_fmpz_polynomial_t polynomial;
        assert(sagejs_fmpz_polynomial_init(polynomial, (uint64_t) degree + 1));
        fmpz_t coefficient, discriminant;
        fmpz_init(coefficient);
        fmpz_init(discriminant);
        for (slong index = 0; index < degree; index++)
        {
            slong value = (slong) (randomized_word() % 19) - 9;
            if (index == 0 && value == 0) value = 1;
            fmpz_set_si(coefficient, value);
            assert(sagejs_fmpz_polynomial_set_coefficient(
                polynomial, (uint64_t) index, coefficient));
        }
        fmpz_one(coefficient);
        assert(sagejs_fmpz_polynomial_set_coefficient(
            polynomial, (uint64_t) degree, coefficient));
        assert(sagejs_fmpz_polynomial_seal(polynomial));
        fmpz_poly_discriminant(discriminant, polynomial->value);
        ulong primes[sizeof(candidate_primes) / sizeof(*candidate_primes)];
        size_t prime_count = 0;
        if (!fmpz_is_zero(discriminant))
            for (size_t index = 0;
                 index < sizeof(candidate_primes) / sizeof(*candidate_primes);
                 index++)
                if (fmpz_divisible_ui(discriminant, candidate_primes[index]))
                    primes[prime_count++] = candidate_primes[index];
        if (prime_count != 0)
        {
            sagejs_fmpz_matrix_t hints;
            assert(sagejs_fmpz_matrix_init(hints, prime_count, 1));
            for (size_t index = 0; index < prime_count; index++)
            {
                fmpz_set_ui(coefficient, primes[index]);
                assert(sagejs_fmpz_matrix_set_entry(
                    hints, (uint64_t) index, 0, coefficient));
            }
            sagejs_number_field_order_resource_t result;
            assert(sagejs_number_field_order_from_polynomial_resource(
                result, polynomial, hints));
            printf("%" PRIu64 ":", emitted);
            print_hex(result->data, result->length);
            putchar('\n');
            sagejs_number_field_order_resource_clear(result);
            sagejs_fmpz_matrix_clear(hints);
            emitted++;
        }
        fmpz_clear(discriminant);
        fmpz_clear(coefficient);
        sagejs_fmpz_polynomial_clear(polynomial);
    }
    assert(emitted == count);
}

static void check_power_two_remainders(void)
{
    static const char *const values[] = {
        "0",
        "1",
        "-1",
        "18446744073709551616",
        "-18446744073709551616",
        "340282366920938463463374607431768211507",
        "-340282366920938463463374607431768211507",
    };
    fmpz_t value;
    fmpz_init(value);
    for (size_t index = 0; index < sizeof(values) / sizeof(*values); index++)
    {
        assert(fmpz_set_str(value, values[index], 10) == 0);
        for (ulong exponent = 1; exponent <= 32; exponent++)
        {
            const ulong modulus = UWORD(1) << exponent;
            assert(sagejs_nf_fmpz_fdiv_ui(value, modulus) ==
                fmpz_fdiv_ui(value, modulus));
        }
    }
    fmpz_clear(value);
    puts("power-two remainders: exact");
}

int main(int argc, char **argv)
{
    if (argc == 3 && strcmp(argv[1], "--payload") == 0)
    {
        run_payload((size_t) strtoull(argv[2], NULL, 10));
        return 0;
    }
    if (argc == 2 && strcmp(argv[1], "--check-power-two-remainders") == 0)
    {
        check_power_two_remainders();
        return 0;
    }
    if (argc == 4 && strcmp(argv[1], "--randomized") == 0)
    {
        const uint64_t seed = (uint64_t) strtoull(argv[2], NULL, 10);
        const uint64_t count = (uint64_t) strtoull(argv[3], NULL, 10);
        assert(count > 0);
        run_randomized(seed, count);
        return 0;
    }
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
