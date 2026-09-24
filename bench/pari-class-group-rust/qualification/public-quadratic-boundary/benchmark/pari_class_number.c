// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

// Qualification-only timing control for PARI 2.17.4 qfbclassno(D,0).
// The frozen panel has |D| < 10^7, below PARI's documented unconditional
// |D| < 2*10^10 range for this Shanks implementation.

#define _POSIX_C_SOURCE 200809L
#include "pari.h"
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

static uint64_t monotonic_nanoseconds(void)
{
    struct timespec clock_value;
    if (clock_gettime(CLOCK_MONOTONIC, &clock_value) != 0)
        abort();
    return (uint64_t)clock_value.tv_sec * UINT64_C(1000000000)
        + (uint64_t)clock_value.tv_nsec;
}

int main(int argc, char **argv)
{
    char *end = NULL;
    long discriminant;
    unsigned long repetitions;
    unsigned long index;
    long answer = 0;
    GEN d;
    pari_sp checkpoint;
    uint64_t start;
    uint64_t elapsed;

    if (argc != 3)
    {
        fputs("usage: pari-class-number DISCRIMINANT REPETITIONS\n", stderr);
        return 2;
    }
    discriminant = strtol(argv[1], &end, 10);
    if (*end != '\0' || discriminant >= 0 || discriminant <= -10000000)
    {
        fputs("expected a frozen-panel negative discriminant\n", stderr);
        return 2;
    }
    repetitions = strtoul(argv[2], &end, 10);
    if (*end != '\0' || repetitions == 0 || repetitions > 1000000)
    {
        fputs("expected 1..1000000 repetitions\n", stderr);
        return 2;
    }

    pari_init(64000000, 1000000);
    d = stoi(discriminant);
    checkpoint = avma;
    start = monotonic_nanoseconds();
    for (index = 0; index < repetitions; ++index)
    {
        long current = itos(qfbclassno0(d, 0));
        if (index != 0 && current != answer)
        {
            fputs("PARI repeated class-number calls disagreed\n", stderr);
            pari_close();
            return 1;
        }
        answer = current;
        avma = checkpoint;
    }
    elapsed = monotonic_nanoseconds() - start;
    printf("{\"schema\":\"sagejs.public-quadratic/pari-class-number-sample-v1\","
           "\"boundaryLabel\":\"pari-2.17.4-qfbclassno0-flag-zero-v1\","
           "\"discriminant\":%ld,\"classNumber\":%ld,"
           "\"kernelNanoseconds\":%" PRIu64 ",\"computations\":%lu}\n",
           discriminant, answer, elapsed, repetitions);
    pari_close();
    return 0;
}
