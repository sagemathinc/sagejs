#define _POSIX_C_SOURCE 200809L

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#include <gmp.h>

static double seconds(void)
{
    struct timespec now;
    if (clock_gettime(CLOCK_MONOTONIC, &now) != 0)
        abort();
    return (double) now.tv_sec + (double) now.tv_nsec / 1000000000.0;
}

static int compare_double(const void *left, const void *right)
{
    const double a = *(const double *) left;
    const double b = *(const double *) right;
    return (a > b) - (a < b);
}

int main(int argc, char **argv)
{
    const unsigned long repetitions = argc > 1
        ? strtoul(argv[1], NULL, 10) : 100000;
    const size_t samples = argc > 2
        ? (size_t) strtoul(argv[2], NULL, 10) : 9;
    const size_t warmups = argc > 3
        ? (size_t) strtoul(argv[3], NULL, 10) : 3;
    double *timings;
    mpz_t accumulator;
    mpz_t seed;
    mpz_t left;
    mpz_t right;
    size_t sample;

    if (samples == 0 || samples > 1000)
        return 2;
    timings = (double *) calloc(samples, sizeof(*timings));
    if (timings == NULL)
        return 3;
    mpz_inits(accumulator, seed, left, right, NULL);
    mpz_set_ui(seed, 1);
    mpz_mul_2exp(seed, seed, 300);
    mpz_neg(seed, seed);
    mpz_set_ui(left, 1);
    mpz_mul_2exp(left, left, 257);
    mpz_add_ui(left, left, 17);
    mpz_set_ui(right, 1);
    mpz_mul_2exp(right, right, 199);
    mpz_neg(right, right);
    mpz_add_ui(right, right, 3);

    for (sample = 0; sample < warmups + samples; sample += 1)
    {
        unsigned long iteration;
        const double start = seconds();
        mpz_t workspace;
        mpz_init_set(workspace, seed);
        for (iteration = 0; iteration < repetitions; iteration += 1)
            mpz_addmul(workspace, left, right);
        mpz_set(accumulator, workspace);
        mpz_clear(workspace);
        if (sample >= warmups)
            timings[sample - warmups] = seconds() - start;
    }
    qsort(timings, samples, sizeof(*timings), compare_double);
    printf("{\"medianSeconds\":%.17g,\"result\":\"", timings[samples / 2]);
    mpz_out_str(stdout, 10, accumulator);
    printf("\"}\n");

    mpz_clears(accumulator, seed, left, right, NULL);
    free(timings);
    return 0;
}
