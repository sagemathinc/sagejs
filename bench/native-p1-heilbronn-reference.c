/*
 * Standalone benchmark oracle copied from the corresponding static helpers in
 * packages/flint/src/p1.c.  This file is not linked into Sage.js; it makes the
 * handwritten-C comparison reproducible without timing Node-API or Hecke
 * assembly around the algorithm under study.
 */

#define _POSIX_C_SOURCE 200809L

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct
{
    int64_t count, sum_a, sum_b, sum_c, sum_d, ordered_moment;
} p1_digest;

typedef struct
{
    int64_t a, b, c, d;
} p1_matrix_four;

static int64_t p1_round_quotient(int64_t numerator, int64_t denominator)
{
    uint64_t absolute_numerator = numerator < 0
        ? (uint64_t) (-numerator) : (uint64_t) numerator;
    uint64_t absolute_denominator = denominator < 0
        ? (uint64_t) (-denominator) : (uint64_t) denominator;
    uint64_t quotient = (
        absolute_numerator + absolute_denominator / 2)
        / absolute_denominator;
    return (numerator < 0) == (denominator < 0)
        ? (int64_t) quotient : -(int64_t) quotient;
}

static void p1_digest_append(
    p1_digest *digest, int64_t a, int64_t b, int64_t c, int64_t d)
{
    digest->count++;
    digest->sum_a += a;
    digest->sum_b += b;
    digest->sum_c += c;
    digest->sum_d += d;
    digest->ordered_moment += digest->count * (a + 3*b + 5*c + 7*d);
}

static p1_digest p1_heilbronn_cremona_digest(uint64_t prime)
{
    p1_digest digest = {1, 1, 0, 0, (int64_t) prime, (int64_t) prime};
    if (prime == 2)
    {
        p1_digest_append(&digest, 2, 0, 0, 1);
        p1_digest_append(&digest, 2, 1, 0, 1);
        p1_digest_append(&digest, 1, 0, 1, 2);
        return digest;
    }

    int64_t half = (int64_t) prime / 2;
    for (int64_t r = -half; r <= half; r++)
    {
        int64_t x1 = (int64_t) prime, x2 = -r;
        int64_t y1 = 0, y2 = 1;
        int64_t a = -(int64_t) prime, b = r;
        p1_digest_append(&digest, x1, x2, y1, y2);
        while (b != 0)
        {
            int64_t q = p1_round_quotient(a, b);
            int64_t remainder = a - b * q;
            int64_t x3, y3;
            a = -b;
            b = remainder;
            x3 = q * x2 - x1;
            x1 = x2;
            x2 = x3;
            y3 = q * y2 - y1;
            y1 = y2;
            y2 = y3;
            p1_digest_append(&digest, x1, x2, y1, y2);
        }
    }
    return digest;
}

static p1_matrix_four *p1_heilbronn_cremona_fill(
    uint64_t prime, size_t *count_out)
{
    const p1_digest digest = p1_heilbronn_cremona_digest(prime);
    const size_t count = (size_t) digest.count;
    p1_matrix_four *matrices = malloc(count * sizeof(*matrices));
    size_t position = 0;
    if (matrices == NULL)
        return NULL;
    matrices[position++] = (p1_matrix_four) {1, 0, 0, (int64_t) prime};
    if (prime == 2)
    {
        matrices[position++] = (p1_matrix_four) {2, 0, 0, 1};
        matrices[position++] = (p1_matrix_four) {2, 1, 0, 1};
        matrices[position++] = (p1_matrix_four) {1, 0, 1, 2};
    }
    else
    {
        const int64_t half = (int64_t) prime / 2;
        for (int64_t r = -half; r <= half; r++)
        {
            int64_t x1 = (int64_t) prime, x2 = -r;
            int64_t y1 = 0, y2 = 1;
            int64_t a = -(int64_t) prime, b = r;
            matrices[position++] = (p1_matrix_four) {x1, x2, y1, y2};
            while (b != 0)
            {
                const int64_t q = p1_round_quotient(a, b);
                const int64_t remainder = a - b * q;
                int64_t x3, y3;
                a = -b;
                b = remainder;
                x3 = q * x2 - x1;
                x1 = x2;
                x2 = x3;
                y3 = q * y2 - y1;
                y1 = y2;
                y2 = y3;
                matrices[position++] =
                    (p1_matrix_four) {x1, x2, y1, y2};
            }
        }
    }
    if (position != count)
    {
        free(matrices);
        return NULL;
    }
    *count_out = count;
    return matrices;
}

static int64_t p1_integer_power(int64_t base, uint32_t exponent)
{
    int64_t result = 1;
    for (uint32_t index = 0; index < exponent; index++)
        result *= base;
    return result;
}

static int64_t p1_binomial(uint32_t top, uint32_t bottom)
{
    int64_t result = 1;
    if (bottom > top)
        return 0;
    if (bottom > top - bottom)
        bottom = top - bottom;
    for (uint32_t step = 1; step <= bottom; step++)
        result = result * (int64_t) (top - bottom + step) / (int64_t) step;
    return result;
}

static int64_t p1_monomial_matrix_coefficient(
    uint32_t source_degree,
    uint32_t weight_degree,
    uint32_t target_degree,
    p1_matrix_four matrix)
{
    const uint32_t right_degree = weight_degree - source_degree;
    int64_t result = 0;
    for (uint32_t left_x = 0; left_x <= source_degree; left_x++)
    {
        uint32_t right_x;
        int64_t term;
        if (target_degree < left_x)
            continue;
        right_x = target_degree - left_x;
        if (right_x > right_degree)
            continue;
        term = p1_binomial(source_degree, left_x) *
            p1_binomial(right_degree, right_x);
        term *= p1_integer_power(matrix.a, left_x);
        term *= p1_integer_power(matrix.b, source_degree - left_x);
        term *= p1_integer_power(matrix.c, right_x);
        term *= p1_integer_power(matrix.d, right_degree - right_x);
        result += term;
    }
    return result;
}

static size_t p1_higher_weight_action_fill(
    const p1_matrix_four *matrices,
    size_t matrix_count,
    uint32_t weight,
    int64_t *output)
{
    const uint32_t width = weight - 1;
    const uint32_t degree = weight - 2;
    size_t position = 0;
    for (size_t matrix = 0; matrix < matrix_count; matrix++)
        for (uint32_t source = 0; source < width; source++)
            for (uint32_t target = 0; target < width; target++)
                output[position++] = p1_monomial_matrix_coefficient(
                    source, degree, target, matrices[matrix]);
    return position;
}

static p1_digest p1_action_digest(const int64_t *values, size_t length)
{
    p1_digest digest = {0};
    for (size_t index = 0; index < length; index++)
    {
        const int64_t value = values[index];
        digest.count++;
        digest.sum_a += value;
        digest.sum_b += (int64_t) ((index % 3) + 1) * value;
        digest.sum_c += (int64_t) ((index % 5) + 1) * value;
        digest.sum_d += (int64_t) ((index % 7) + 1) * value;
        digest.ordered_moment += (int64_t) (index + 1) * value;
    }
    return digest;
}

static p1_digest p1_heilbronn_merel_digest(uint64_t index)
{
    p1_digest digest = {0};
    const int64_t n = (int64_t) index;
    for (int64_t a = 1; a <= n; a++)
    {
        int64_t quotient = n / a;
        if (quotient * a == n)
        {
            int64_t d = quotient;
            for (int64_t b = 0; b < a; b++)
                p1_digest_append(&digest, a, b, 0, d);
            for (int64_t c = 1; c < d; c++)
                p1_digest_append(&digest, a, 0, c, d);
        }
        for (int64_t d = quotient + 1; d <= n; d++)
        {
            int64_t bc = a * d - n;
            for (int64_t c = bc / a + 1; c < d; c++)
                if (bc % c == 0)
                    p1_digest_append(&digest, a, bc / c, c, d);
        }
    }
    return digest;
}

static uint64_t elapsed_nanoseconds(
    const struct timespec *start, const struct timespec *stop)
{
    return (uint64_t) (stop->tv_sec - start->tv_sec) * UINT64_C(1000000000) +
        (uint64_t) (stop->tv_nsec - start->tv_nsec);
}

int main(int argc, char **argv)
{
    const int action = argc == 5 && strcmp(argv[1], "action") == 0;
    const int merel = argc == 4 && strcmp(argv[1], "merel") == 0;
    if (argc != 3 && !merel && !action)
    {
        fprintf(stderr,
            "usage: %s [merel] INDEX REPETITIONS | action PRIME WEIGHT REPETITIONS\n",
            argv[0]);
        return 2;
    }
    const int offset = merel || action ? 1 : 0;
    uint64_t prime = strtoull(argv[1 + offset], NULL, 10);
    const uint32_t weight = action
        ? (uint32_t) strtoul(argv[3], NULL, 10) : 0;
    uint64_t repetitions = strtoull(argv[action ? 4 : 2 + offset], NULL, 10);
    if (prime < (uint64_t) (merel ? 1 : 2) ||
        prime > INT32_MAX || repetitions == 0 || (action && weight < 2))
        return 2;

    volatile uint64_t benchmark_prime = prime;
    volatile int64_t benchmark_sink = 0;
    p1_digest result = {0};
    p1_matrix_four *matrices = NULL;
    int64_t *action_output = NULL;
    size_t matrix_count = 0, action_length = 0;
    if (action)
    {
        matrices = p1_heilbronn_cremona_fill(prime, &matrix_count);
        action_length = matrix_count * (size_t) (weight - 1) *
            (size_t) (weight - 1);
        action_output = malloc(action_length * sizeof(*action_output));
        if (matrices == NULL || action_output == NULL)
            return 2;
    }
    for (int warmup = 0; warmup < 3; warmup++)
        if (action)
            p1_higher_weight_action_fill(
                matrices, matrix_count, weight, action_output);
        else
            result = merel
                ? p1_heilbronn_merel_digest(benchmark_prime)
                : p1_heilbronn_cremona_digest(benchmark_prime);
    struct timespec start, stop;
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (uint64_t iteration = 0; iteration < repetitions; iteration++)
    {
        if (action)
        {
            benchmark_sink ^= (int64_t) p1_higher_weight_action_fill(
                matrices, matrix_count, weight, action_output);
        }
        else
        {
            result = merel
                ? p1_heilbronn_merel_digest(benchmark_prime)
                : p1_heilbronn_cremona_digest(benchmark_prime);
            benchmark_sink ^= result.ordered_moment;
        }
    }
    clock_gettime(CLOCK_MONOTONIC, &stop);
    if (action)
        result = p1_action_digest(action_output, action_length);

    printf(
        "RESULT|%" PRId64 "|%" PRId64 "|%" PRId64 "|%" PRId64
        "|%" PRId64 "|%" PRId64 "|%.3f\n",
        result.count, result.sum_a, result.sum_b, result.sum_c,
        result.sum_d, result.ordered_moment,
        (double) elapsed_nanoseconds(&start, &stop) / (double) repetitions);
    free(action_output);
    free(matrices);
    return benchmark_sink == INT64_MIN;
}
