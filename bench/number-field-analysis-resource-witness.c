#define _POSIX_C_SOURCE 200809L

#include <assert.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#include "sagejs/number_field_analysis_resource_ffi.h"

typedef struct
{
    const char *id;
    const char *const *coefficients;
    size_t coefficient_count;
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

#define BENCHMARK_CASE(id_value, coefficients_value) \
    { id_value, coefficients_value, \
      sizeof(coefficients_value) / sizeof(*(coefficients_value)) }

static const benchmark_case benchmark_cases[] = {
    BENCHMARK_CASE("motivating-degree-7", motivating_coefficients),
    BENCHMARK_CASE("sage-essential-discriminant", essential_coefficients),
    BENCHMARK_CASE("lmfdb-3.1.431.1", cubic_431_coefficients),
    BENCHMARK_CASE("lmfdb-5.1.17161.1", quintic_17161_coefficients),
    BENCHMARK_CASE("pari-2510", pari_2510_coefficients),
    BENCHMARK_CASE("pari-1710", pari_1710_coefficients),
};

static double monotonic_seconds(void)
{
    struct timespec now;
    assert(clock_gettime(CLOCK_MONOTONIC, &now) == 0);
    return (double) now.tv_sec + (double) now.tv_nsec / 1000000000.0;
}

static void initialize_polynomial(
    sagejs_fmpz_polynomial_t polynomial,
    const char *const *coefficients, size_t count)
{
    assert(sagejs_fmpz_polynomial_init(polynomial, (uint64_t) count));
    fmpz_t value;
    fmpz_init(value);
    for (size_t index = 0; index < count; index++)
    {
        assert(fmpz_set_str(value, coefficients[index], 10) == 0);
        assert(sagejs_fmpz_polynomial_set_coefficient(
            polynomial, (uint64_t) index, value));
    }
    fmpz_clear(value);
    assert(sagejs_fmpz_polynomial_seal(polynomial));
}

static void analyze(
    sagejs_number_field_analysis_resource_t result,
    const char *const *coefficients, size_t count,
    const char *scale_string, uint64_t trial_bound)
{
    sagejs_fmpz_polynomial_t polynomial;
    initialize_polynomial(polynomial, coefficients, count);
    fmpz_t scale;
    fmpz_init(scale);
    assert(fmpz_set_str(scale, scale_string, 10) == 0);
    assert(sagejs_number_field_analyze_resource(
        result, polynomial, scale, trial_bound));
    fmpz_clear(scale);
    sagejs_fmpz_polynomial_clear(polynomial);
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

static void print_result(
    const char *name, const sagejs_number_field_analysis_resource_t result,
    int final)
{
    printf("\"%s\":\"", name);
    print_hex(result->data, result->length);
    printf(final ? "\"" : "\",");
}

static void run_benchmark(size_t case_index, uint64_t warmups, uint64_t rounds)
{
    assert(case_index < sizeof(benchmark_cases) / sizeof(*benchmark_cases));
    assert(rounds > 0);
    const benchmark_case *item = benchmark_cases + case_index;
    sagejs_fmpz_polynomial_t polynomial;
    initialize_polynomial(
        polynomial, item->coefficients, item->coefficient_count);
    fmpz_t scale;
    fmpz_init(scale);
    fmpz_one(scale);
    for (uint64_t warmup = 0; warmup < warmups; warmup++)
    {
        sagejs_number_field_analysis_resource_t result;
        assert(sagejs_number_field_analyze_resource(
            result, polynomial, scale, UINT64_C(1000)));
        sagejs_number_field_analysis_resource_clear(result);
    }
    size_t transferred = 0;
    const double started = monotonic_seconds();
    for (uint64_t round = 0; round < rounds; round++)
    {
        sagejs_number_field_analysis_resource_t result;
        assert(sagejs_number_field_analyze_resource(
            result, polynomial, scale, UINT64_C(1000)));
        transferred += result->length;
        sagejs_number_field_analysis_resource_clear(result);
    }
    const double elapsed = monotonic_seconds() - started;
    sagejs_number_field_analysis_resource_t final_result;
    assert(sagejs_number_field_analyze_resource(
        final_result, polynomial, scale, UINT64_C(1000)));
    printf("{\"schema\":\"sagejs.number-field-analysis-resource-kernel/v1\"," 
           "\"id\":\"%s\",\"degree\":%zu,\"warmups\":%" PRIu64 ","
           "\"rounds\":%" PRIu64 ",\"elapsedMs\":%.9f,"
           "\"meanUs\":%.9f,\"transferredBytes\":%zu,\"payloadHex\":\"",
        item->id, item->coefficient_count - 1, warmups, rounds,
        elapsed * 1000.0, elapsed * 1000000.0 / (double) rounds,
        transferred);
    print_hex(final_result->data, final_result->length);
    printf("\"}\n");
    sagejs_number_field_analysis_resource_clear(final_result);
    fmpz_clear(scale);
    sagejs_fmpz_polynomial_clear(polynomial);
}

int main(int argc, char **argv)
{
    if (argc == 4)
    {
        run_benchmark((size_t) strtoull(argv[1], NULL, 10),
            (uint64_t) strtoull(argv[2], NULL, 10),
            (uint64_t) strtoull(argv[3], NULL, 10));
        return 0;
    }
    static const char *const sqrt5[] = {"-5", "0", "1"};
    static const char *const cubic[] = {"-8", "-2", "-1", "1"};
    static const char *const unresolved[] = {"-1022117", "0", "1"};
    static const char *const arbitrary[] = {
        "-18446744073709551629", "0", "1"
    };

    sagejs_number_field_analysis_resource_t sqrt5_result;
    sagejs_number_field_analysis_resource_t cubic_result;
    sagejs_number_field_analysis_resource_t unresolved_result;
    sagejs_number_field_analysis_resource_t arbitrary_result;
    analyze(sqrt5_result, sqrt5, 3, "3", UINT64_C(1000));
    analyze(cubic_result, cubic, 4, "1", UINT64_C(1000));
    analyze(unresolved_result, unresolved, 3, "1", UINT64_C(1000));
    analyze(arbitrary_result, arbitrary, 3, "1", UINT64_C(1000));

    assert(sqrt5_result->length > 80);
    assert(cubic_result->length > 80);
    assert(unresolved_result->length > 80);
    assert(arbitrary_result->length > 80);

    /* Deterministic close/reconstruct stress; sanitizers authenticate cleanup. */
    for (size_t round = 0; round < 1024; round++)
    {
        sagejs_number_field_analysis_resource_t resource;
        analyze(resource, sqrt5, 3, "1", UINT64_C(1000));
        assert(resource->length == sqrt5_result->length);
        sagejs_number_field_analysis_resource_clear(resource);
    }

    printf("{\"schema\":\"sagejs.number-field-analysis-resource/v1\",");
    print_result("sqrt5", sqrt5_result, 0);
    print_result("cubic", cubic_result, 0);
    print_result("unresolved", unresolved_result, 0);
    print_result("arbitrary", arbitrary_result, 1);
    printf("}\n");

    sagejs_number_field_analysis_resource_clear(arbitrary_result);
    sagejs_number_field_analysis_resource_clear(unresolved_result);
    sagejs_number_field_analysis_resource_clear(cubic_result);
    sagejs_number_field_analysis_resource_clear(sqrt5_result);
    return 0;
}
