/*
 * WebAssembly storage adapter for the shared number-field zeta residue core.
 *
 * This file owns buffers only.  Factorization and validation live in
 * packages/flint/src/number_field_zeta_core.c, which is also used by the
 * native Node adapter.  One combined uint32 input buffer and one combined
 * uint16 output buffer make the host crossing independent of FLINT layouts.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 */

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

#include "number_field_zeta_core.h"

static uint32_t *nf_zeta_input;
static uint16_t *nf_zeta_output;
static uint32_t nf_zeta_degree;
static uint32_t nf_zeta_prime_count;
static size_t nf_zeta_input_word_count;
static size_t nf_zeta_output_word_count;

__attribute__((visibility("default")))
void sagejs_nf_zeta_residue_clear(void)
{
    free(nf_zeta_input);
    free(nf_zeta_output);
    nf_zeta_input = NULL;
    nf_zeta_output = NULL;
    nf_zeta_degree = 0;
    nf_zeta_prime_count = 0;
    nf_zeta_input_word_count = 0;
    nf_zeta_output_word_count = 0;
}

__attribute__((visibility("default")))
int32_t sagejs_nf_zeta_residue_begin(uint32_t degree, uint32_t prime_count)
{
    size_t coefficient_cells;
    size_t factor_cells;

    sagejs_nf_zeta_residue_clear();
    if (degree < 1 || degree > SAGEJS_NF_FACTOR_MAX_DEGREE)
        return SAGEJS_NF_FACTOR_UNSUPPORTED_DEGREE;
    if (prime_count > SAGEJS_NF_FACTOR_MAX_PRIMES)
        return SAGEJS_NF_FACTOR_TOO_MANY_PRIMES;
    if (prime_count == 0)
    {
        nf_zeta_degree = degree;
        return SAGEJS_NF_FACTOR_OK;
    }
    if ((size_t) prime_count > SIZE_MAX / ((size_t) degree + 1U))
        return SAGEJS_NF_FACTOR_SIZE_OVERFLOW;
    coefficient_cells = (size_t) prime_count * ((size_t) degree + 1U);
    factor_cells = (size_t) prime_count * (size_t) degree;
    if (coefficient_cells > SIZE_MAX - (size_t) prime_count ||
        factor_cells > (SIZE_MAX - (size_t) prime_count) / 2U)
        return SAGEJS_NF_FACTOR_SIZE_OVERFLOW;
    nf_zeta_input_word_count = (size_t) prime_count + coefficient_cells;
    nf_zeta_output_word_count = (size_t) prime_count + 2U * factor_cells;
    if (nf_zeta_input_word_count > SIZE_MAX / sizeof(*nf_zeta_input) ||
        nf_zeta_output_word_count > SIZE_MAX / sizeof(*nf_zeta_output))
    {
        sagejs_nf_zeta_residue_clear();
        return SAGEJS_NF_FACTOR_SIZE_OVERFLOW;
    }
    nf_zeta_input = calloc(nf_zeta_input_word_count,
        sizeof(*nf_zeta_input));
    nf_zeta_output = calloc(nf_zeta_output_word_count,
        sizeof(*nf_zeta_output));
    if (nf_zeta_input == NULL || nf_zeta_output == NULL)
    {
        sagejs_nf_zeta_residue_clear();
        return SAGEJS_NF_FACTOR_ALLOCATION_FAILED;
    }
    nf_zeta_degree = degree;
    nf_zeta_prime_count = prime_count;
    return SAGEJS_NF_FACTOR_OK;
}

__attribute__((visibility("default")))
uintptr_t sagejs_nf_zeta_residue_input(void)
{
    return (uintptr_t) nf_zeta_input;
}

__attribute__((visibility("default")))
uint32_t sagejs_nf_zeta_residue_input_words(void)
{
    return (uint32_t) nf_zeta_input_word_count;
}

__attribute__((visibility("default")))
uintptr_t sagejs_nf_zeta_residue_output(void)
{
    return (uintptr_t) nf_zeta_output;
}

__attribute__((visibility("default")))
uint32_t sagejs_nf_zeta_residue_output_words(void)
{
    return (uint32_t) nf_zeta_output_word_count;
}

__attribute__((visibility("default")))
int32_t sagejs_nf_zeta_residue_compute(void)
{
    size_t factor_cells;

    if (nf_zeta_prime_count == 0)
        return nf_zeta_degree == 0
            ? SAGEJS_NF_FACTOR_INVALID_ARGUMENT
            : SAGEJS_NF_FACTOR_OK;
    if (nf_zeta_input == NULL || nf_zeta_output == NULL)
        return SAGEJS_NF_FACTOR_INVALID_ARGUMENT;
    factor_cells = (size_t) nf_zeta_prime_count * (size_t) nf_zeta_degree;
    return sagejs_nf_factor_degrees_residue_batch(
        nf_zeta_output,
        nf_zeta_output + nf_zeta_prime_count,
        nf_zeta_output + nf_zeta_prime_count + factor_cells,
        nf_zeta_input + nf_zeta_prime_count,
        nf_zeta_input,
        nf_zeta_degree,
        nf_zeta_prime_count);
}
