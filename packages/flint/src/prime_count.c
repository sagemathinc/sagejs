#include "prime_count.h"

#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

/*
 * Lehmer's combinatorial prime-counting algorithm.  Unlike enumerating every
 * prime up to x, it only sieves through sqrt(x).  The small phi table avoids
 * repeating the dense bottom of the partial-sieve recursion.
 */
#define SAGEJS_PHI_X 10000U
#define SAGEJS_PHI_S 100U

typedef struct
{
    uint64_t sieve_limit;
    uint32_t prime_count;
    uint32_t phi_rows;
    uint32_t *pi;
    uint32_t *primes;
    uint32_t *phi;
} sagejs_prime_pi_context;

static uint64_t sagejs_isqrt(uint64_t x)
{
    uint64_t root = (uint64_t) sqrt((double) x);

    while (root + 1 <= x / (root + 1))
        root++;
    while (root != 0 && root > x / root)
        root--;
    return root;
}

static uint64_t sagejs_icbrt(uint64_t x)
{
    uint64_t root = (uint64_t) cbrt((double) x);

    while (root + 1 <= x / (root + 1) / (root + 1))
        root++;
    while (root != 0 && root > x / root / root)
        root--;
    return root;
}

static uint64_t sagejs_phi(
    const sagejs_prime_pi_context *context,
    uint64_t x,
    uint32_t count)
{
    if (x == 0 || count == 0)
        return x;
    if (count < context->phi_rows && x < SAGEJS_PHI_X)
        return context->phi[(size_t) count * SAGEJS_PHI_X + (size_t) x];
    if (x < context->sieve_limit && count >= context->pi[(size_t) x])
        return 1;
    return sagejs_phi(context, x, count - 1)
        - sagejs_phi(
            context,
            x / context->primes[count - 1],
            count - 1);
}

static uint64_t sagejs_lehmer_pi(
    const sagejs_prime_pi_context *context,
    uint64_t x)
{
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t i;
    uint64_t sum;

    if (x < context->sieve_limit)
        return context->pi[(size_t) x];

    a = (uint32_t) sagejs_lehmer_pi(
        context, sagejs_isqrt(sagejs_isqrt(x)));
    b = (uint32_t) sagejs_lehmer_pi(context, sagejs_isqrt(x));
    c = (uint32_t) sagejs_lehmer_pi(context, sagejs_icbrt(x));
    sum = sagejs_phi(context, x, a)
        + ((uint64_t) (b + a - 2) * (uint64_t) (b - a + 1)) / 2;

    for (i = a; i < b; i++)
    {
        uint64_t reduced = x / context->primes[i];

        sum -= sagejs_lehmer_pi(context, reduced);
        if (i < c)
        {
            uint32_t j;
            uint32_t limit = (uint32_t) sagejs_lehmer_pi(
                context, sagejs_isqrt(reduced));

            for (j = i; j < limit; j++)
                sum -= sagejs_lehmer_pi(
                    context, reduced / context->primes[j]) - j;
        }
    }
    return sum;
}

static void sagejs_prime_pi_clear(sagejs_prime_pi_context *context)
{
    free(context->pi);
    free(context->primes);
    free(context->phi);
}

int sagejs_prime_pi(uint64_t x, uint64_t *result)
{
    sagejs_prime_pi_context context = {0};
    uint8_t *composite;
    uint64_t index;
    size_t prime_capacity;
    size_t phi_entries;

    if (x < 2)
    {
        *result = 0;
        return 1;
    }

    context.sieve_limit = sagejs_isqrt(x) + 1;
    /* Keep tiny direct calls out of the small-x corner of Lehmer's formula. */
    if (x < 1000)
        context.sieve_limit = x + 1;
    if (context.sieve_limit > SIZE_MAX / sizeof(uint32_t))
        return 0;

    prime_capacity = (size_t) (context.sieve_limit / 2 + 1);
    composite = calloc((size_t) context.sieve_limit, sizeof(uint8_t));
    context.pi = calloc((size_t) context.sieve_limit, sizeof(uint32_t));
    context.primes = malloc(prime_capacity * sizeof(uint32_t));
    if (composite == NULL || context.pi == NULL || context.primes == NULL)
    {
        free(composite);
        sagejs_prime_pi_clear(&context);
        return 0;
    }

    for (index = 2; index < context.sieve_limit; index++)
    {
        if (!composite[(size_t) index])
        {
            uint64_t multiple;

            context.primes[context.prime_count++] = (uint32_t) index;
            if (index <= (context.sieve_limit - 1) / index)
            {
                for (multiple = index * index;
                     multiple < context.sieve_limit;
                     multiple += index)
                    composite[(size_t) multiple] = 1;
            }
        }
        context.pi[(size_t) index] = context.prime_count;
    }
    free(composite);

    context.phi_rows = context.prime_count + 1;
    if (context.phi_rows > SAGEJS_PHI_S)
        context.phi_rows = SAGEJS_PHI_S;
    phi_entries = (size_t) context.phi_rows * SAGEJS_PHI_X;
    context.phi = malloc(phi_entries * sizeof(uint32_t));
    if (context.phi == NULL)
    {
        sagejs_prime_pi_clear(&context);
        return 0;
    }

    for (index = 0; index < SAGEJS_PHI_X; index++)
        context.phi[index] = (uint32_t) index;
    for (index = 1; index < context.phi_rows; index++)
    {
        size_t value;
        size_t row = (size_t) index * SAGEJS_PHI_X;
        size_t previous = (size_t) (index - 1) * SAGEJS_PHI_X;
        uint32_t prime = context.primes[index - 1];

        for (value = 0; value < SAGEJS_PHI_X; value++)
            context.phi[row + value] = context.phi[previous + value]
                - context.phi[previous + value / prime];
    }

    *result = sagejs_lehmer_pi(&context, x);
    sagejs_prime_pi_clear(&context);
    return 1;
}
