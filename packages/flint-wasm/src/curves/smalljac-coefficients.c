/*
 * Packed wasm32 adapter for smalljac elliptic-curve coefficient generation.
 *
 * The mature smalljac/ffpoly implementation owns point counting. This file
 * only validates copied host input, records prime traces, and materializes the
 * ordinary integer Euler recurrence expected by `EllipticCurve.anlist()`.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 */

#include "smalljac-coefficients.h"

#include <limits.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <gmp.h>
#include <smalljac.h>

#define SAGEJS_WASM_SMALLJAC_MAX_CURVE_TEXT (64U * 1024U)
#define SAGEJS_WASM_SMALLJAC_MAX_ANLIST_BOUND 5000000U
#define SAGEJS_WASM_SMALLJAC_MAX_DIRECT_PRIME 5000000U

typedef struct
{
    char *curve_text;
    int32_t *output;
    uint32_t curve_text_bytes;
    uint32_t output_words;
    uint64_t bound_or_prime;
    uint32_t mode;
    int initialized;
} sagejs_wasm_smalljac_state;

typedef struct
{
    int64_t *ap_values;
    uint8_t *available;
    uint8_t *bad_reduction;
    uint64_t minimum_prime;
    uint64_t maximum_prime;
    int failed;
} sagejs_wasm_smalljac_callback_state;

static sagejs_wasm_smalljac_state state;

void sagejs_wasm_smalljac_clear(void)
{
    free(state.output);
    free(state.curve_text);
    memset(&state, 0, sizeof(state));
}

int32_t sagejs_wasm_smalljac_begin(
    uint32_t curve_text_bytes,
    uint64_t bound_or_prime,
    uint32_t mode)
{
    size_t output_words;

    sagejs_wasm_smalljac_clear();
    if (curve_text_bytes < 7U ||
        curve_text_bytes > SAGEJS_WASM_SMALLJAC_MAX_CURVE_TEXT ||
        (mode != SAGEJS_WASM_SMALLJAC_MODE_ANLIST &&
            mode != SAGEJS_WASM_SMALLJAC_MODE_AP) ||
        (mode == SAGEJS_WASM_SMALLJAC_MODE_AP && bound_or_prime < 2U))
        return SAGEJS_WASM_SMALLJAC_INVALID_INPUT;
    if (mode == SAGEJS_WASM_SMALLJAC_MODE_ANLIST &&
        bound_or_prime > SAGEJS_WASM_SMALLJAC_MAX_ANLIST_BOUND)
        return SAGEJS_WASM_SMALLJAC_RESOURCE_LIMIT;

    output_words = mode == SAGEJS_WASM_SMALLJAC_MODE_ANLIST
        ? (size_t) bound_or_prime + 1U
        : 1U;
    if (output_words > SIZE_MAX / sizeof(*state.output))
        return SAGEJS_WASM_SMALLJAC_RESOURCE_LIMIT;
    state.curve_text = malloc((size_t) curve_text_bytes + 1U);
    state.output = calloc(output_words, sizeof(*state.output));
    if (state.curve_text == NULL || state.output == NULL)
    {
        sagejs_wasm_smalljac_clear();
        return SAGEJS_WASM_SMALLJAC_ALLOCATION_FAILED;
    }
    state.curve_text_bytes = curve_text_bytes;
    state.output_words = (uint32_t) output_words;
    state.bound_or_prime = bound_or_prime;
    state.mode = mode;
    state.initialized = 1;
    return SAGEJS_WASM_SMALLJAC_OK;
}

uintptr_t sagejs_wasm_smalljac_curve_text(void)
{
    return (uintptr_t) state.curve_text;
}

uintptr_t sagejs_wasm_smalljac_output(void)
{
    return (uintptr_t) state.output;
}

uint32_t sagejs_wasm_smalljac_output_words(void)
{
    return state.output_words;
}

static int parse_weierstrass_coefficients(mpz_t output[5], const char *input)
{
    const char *cursor = input;
    int index;

    if (*cursor++ != '[')
        return 0;
    for (index = 0; index < 5; index++)
    {
        const char *begin;
        size_t length;
        char *text;
        while (*cursor == ' ' || *cursor == '\t' || *cursor == '\n')
            cursor++;
        begin = cursor;
        if (*cursor == '-' || *cursor == '+')
            cursor++;
        while (*cursor >= '0' && *cursor <= '9')
            cursor++;
        length = (size_t) (cursor - begin);
        if (length == 0U ||
            ((begin[0] == '-' || begin[0] == '+') && length == 1U))
            return 0;
        text = malloc(length + 1U);
        if (text == NULL)
            return -1;
        memcpy(text, begin, length);
        text[length] = '\0';
        if (mpz_set_str(output[index], text, 10) != 0)
        {
            free(text);
            return 0;
        }
        free(text);
        while (*cursor == ' ' || *cursor == '\t' || *cursor == '\n')
            cursor++;
        if (index < 4)
        {
            if (*cursor++ != ',')
                return 0;
        }
        else if (*cursor++ != ']')
            return 0;
    }
    while (*cursor == ' ' || *cursor == '\t' || *cursor == '\n')
        cursor++;
    return *cursor == '\0';
}

static uint64_t multiply_mod(uint64_t left, uint64_t right, uint64_t prime)
{
    return (uint64_t) (((__uint128_t) left * (__uint128_t) right) % prime);
}

/* Exact exceptional-prime fallback, not the normal coefficient algorithm.
   For odd p this enumerates x in F_p and uses a residue table, so it costs
   O(p) time and O(p) bytes.  smalljac_Lpolys supplies a_p at every supported
   good-reduction prime; this routine is used only when its callback reports
   no coefficient (normally a bad-reduction prime).  The p=2 double loop is
   constant-sized. */
static int64_t direct_ap(mpz_t coefficients[5], uint64_t prime)
{
    uint64_t reduced[5];
    uint64_t x;
    uint64_t y;
    uint64_t points = 1U;
    uint8_t *quadratic_residues;
    int index;

    for (index = 0; index < 5; index++)
        reduced[index] = mpz_fdiv_ui(coefficients[index], prime);
    if (prime == 2U)
    {
        for (x = 0; x < prime; x++)
        {
            for (y = 0; y < prime; y++)
            {
                uint64_t left = (
                    multiply_mod(y, y, prime) +
                    multiply_mod(reduced[0], multiply_mod(x, y, prime), prime) +
                    multiply_mod(reduced[2], y, prime)) % prime;
                uint64_t x_squared = multiply_mod(x, x, prime);
                uint64_t right = (
                    multiply_mod(x_squared, x, prime) +
                    multiply_mod(reduced[1], x_squared, prime) +
                    multiply_mod(reduced[3], x, prime) + reduced[4]) % prime;
                if (left == right)
                    points++;
            }
        }
        return (int64_t) prime + 1 - (int64_t) points;
    }
    if (prime > SIZE_MAX - 1U)
        return INT64_MIN;
    quadratic_residues = calloc((size_t) prime, sizeof(*quadratic_residues));
    if (quadratic_residues == NULL)
        return INT64_MIN;
    for (y = 1; y < prime; y++)
        quadratic_residues[multiply_mod(y, y, prime)] = 1U;
    for (x = 0; x < prime; x++)
    {
        uint64_t x_squared = multiply_mod(x, x, prime);
        uint64_t right = (
            multiply_mod(x_squared, x, prime) +
            multiply_mod(reduced[1], x_squared, prime) +
            multiply_mod(reduced[3], x, prime) + reduced[4]) % prime;
        uint64_t linear = (
            multiply_mod(reduced[0], x, prime) + reduced[2]) % prime;
        uint64_t discriminant = (
            multiply_mod(linear, linear, prime) + 4U * right) % prime;
        if (discriminant == 0U)
            points++;
        else if (quadratic_residues[discriminant])
            points += 2U;
    }
    free(quadratic_residues);
    return (int64_t) prime + 1 - (int64_t) points;
}

static int coefficient_callback(
    smalljac_curve_t curve,
    uint64_t prime,
    int good,
    int64_t coefficients[],
    int count,
    void *argument)
{
    sagejs_wasm_smalljac_callback_state *context = argument;
    size_t index;
    (void) curve;

    if (prime < context->minimum_prime || prime > context->maximum_prime ||
        prime - context->minimum_prime > SIZE_MAX)
    {
        context->failed = 1;
        return 0;
    }
    index = (size_t) (prime - context->minimum_prime);
    if (!good)
    {
        /* smalljac reports the exceptional prime but deliberately supplies no
           good-reduction L-polynomial.  Mark it for direct exact treatment and
           for the multiplicative bad-prime Euler recurrence below. */
        context->bad_reduction[index] = 1U;
        return 1;
    }
    if (coefficients == NULL || count < 1)
    {
        context->failed = 1;
        return 0;
    }
    context->ap_values[index] = -coefficients[0];
    context->available[index] = 1U;
    return 1;
}

static int32_t compute_coefficients(mpz_t coefficients[5])
{
    const uint32_t bound = (uint32_t) state.bound_or_prime;
    uint32_t *smallest = NULL;
    int64_t *ap_values = NULL;
    uint8_t *available = NULL;
    uint8_t *bad_reduction = NULL;
    smalljac_curve_t curve = NULL;
    sagejs_wasm_smalljac_callback_state context;
    int error = 0;
    int64_t status;
    uint32_t candidate;
    int32_t result = SAGEJS_WASM_SMALLJAC_OK;

    smallest = calloc((size_t) bound + 1U, sizeof(*smallest));
    ap_values = calloc((size_t) bound + 1U, sizeof(*ap_values));
    available = calloc((size_t) bound + 1U, sizeof(*available));
    bad_reduction = calloc((size_t) bound + 1U, sizeof(*bad_reduction));
    if (smallest == NULL || ap_values == NULL || available == NULL ||
        bad_reduction == NULL)
    {
        result = SAGEJS_WASM_SMALLJAC_ALLOCATION_FAILED;
        goto done;
    }
    if (bound >= 1U)
        state.output[1] = 1;
    for (candidate = 2U; candidate <= bound; candidate++)
    {
        if (smallest[candidate] == 0U)
        {
            uint32_t multiple;
            smallest[candidate] = candidate;
            if (candidate > bound / candidate)
                continue;
            for (multiple = candidate * candidate;
                multiple <= bound; multiple += candidate)
                if (smallest[multiple] == 0U)
                    smallest[multiple] = candidate;
        }
    }

    curve = smalljac_curve_init(state.curve_text, &error);
    if (curve == NULL || error != 0)
    {
        result = SAGEJS_WASM_SMALLJAC_PARSE_FAILED;
        goto done;
    }
    memset(&context, 0, sizeof(context));
    context.ap_values = ap_values;
    context.available = available;
    context.bad_reduction = bad_reduction;
    context.minimum_prime = 0U;
    context.maximum_prime = bound;
    /* Re-enter at each prime.  Besides making interruption points bounded,
       this resets smalljac's per-interval BSGS search state; retaining that
       state across thousands of moduli is not portable on wasm32. */
    for (candidate = 2U; candidate <= bound; candidate++)
    {
        if (smallest[candidate] != candidate)
            continue;
        status = smalljac_Lpolys(
            curve, candidate, candidate, SMALLJAC_A1_ONLY,
            coefficient_callback, &context);
        if (status < 0 || context.failed)
        {
            result = SAGEJS_WASM_SMALLJAC_UPSTREAM_FAILED;
            goto done;
        }
    }
    /* Only callback entries without a smalljac a_p reach direct_ap.  In the
       ordinary case this loop does work only at the finitely many primes of
       bad reduction, not at every prime up to bound. */
    for (candidate = 2U; candidate <= bound; candidate++)
    {
        if (smallest[candidate] == candidate && !available[candidate])
        {
            ap_values[candidate] = direct_ap(coefficients, candidate);
            if (ap_values[candidate] == INT64_MIN)
            {
                result = SAGEJS_WASM_SMALLJAC_ALLOCATION_FAILED;
                goto done;
            }
        }
    }
    for (candidate = 2U; candidate <= bound; candidate++)
    {
        uint32_t prime = smallest[candidate];
        uint32_t rest = candidate;
        uint32_t exponent = 0U;
        uint32_t power;
        int64_t previous = 1;
        int64_t current = ap_values[prime];
        int64_t prime_power_value = 1;
        int64_t value;
        while (rest % prime == 0U)
        {
            rest /= prime;
            exponent++;
        }
        for (power = 1U; power <= exponent; power++)
        {
            if (power == 1U)
                prime_power_value = current;
            else if (bad_reduction[prime])
                prime_power_value *= ap_values[prime];
            else
            {
                int64_t next = ap_values[prime] * current -
                    (int64_t) prime * previous;
                previous = current;
                current = next;
                prime_power_value = current;
            }
        }
        value = (int64_t) state.output[rest] * prime_power_value;
        if (value < INT32_MIN || value > INT32_MAX)
        {
            result = SAGEJS_WASM_SMALLJAC_COEFFICIENT_RANGE;
            goto done;
        }
        state.output[candidate] = (int32_t) value;
    }

done:
    if (curve != NULL)
        smalljac_curve_clear(curve);
    free(bad_reduction);
    free(available);
    free(ap_values);
    free(smallest);
    return result;
}

static int32_t compute_single_ap(mpz_t coefficients[5])
{
    const uint64_t prime = state.bound_or_prime;
    int64_t ap_values[1] = {0};
    uint8_t available[1] = {0};
    uint8_t bad_reduction[1] = {0};
    smalljac_curve_t curve;
    sagejs_wasm_smalljac_callback_state context;
    int error = 0;
    int64_t status;
    int64_t value;

    curve = smalljac_curve_init(state.curve_text, &error);
    if (curve == NULL || error != 0)
        return SAGEJS_WASM_SMALLJAC_PARSE_FAILED;
    memset(&context, 0, sizeof(context));
    context.ap_values = ap_values;
    context.available = available;
    context.bad_reduction = bad_reduction;
    context.minimum_prime = prime;
    context.maximum_prime = prime;
    status = smalljac_Lpolys(
        curve, prime, prime, SMALLJAC_A1_ONLY, coefficient_callback, &context);
    smalljac_curve_clear(curve);
    if (status < 0 || context.failed)
        return SAGEJS_WASM_SMALLJAC_UPSTREAM_FAILED;
    if (!available[0] && prime > SAGEJS_WASM_SMALLJAC_MAX_DIRECT_PRIME)
        return SAGEJS_WASM_SMALLJAC_RESOURCE_LIMIT;
    value = available[0] ? ap_values[0] : direct_ap(coefficients, prime);
    if (value == INT64_MIN)
        return SAGEJS_WASM_SMALLJAC_ALLOCATION_FAILED;
    if (value < INT32_MIN || value > INT32_MAX)
        return SAGEJS_WASM_SMALLJAC_COEFFICIENT_RANGE;
    state.output[0] = (int32_t) value;
    return SAGEJS_WASM_SMALLJAC_OK;
}

int32_t sagejs_wasm_smalljac_compute(void)
{
    mpz_t coefficients[5];
    int parsed;
    int index;
    int32_t result;

    if (!state.initialized || state.curve_text == NULL || state.output == NULL)
        return SAGEJS_WASM_SMALLJAC_INVALID_INPUT;
    state.curve_text[state.curve_text_bytes] = '\0';
    for (index = 0; index < 5; index++)
        mpz_init(coefficients[index]);
    parsed = parse_weierstrass_coefficients(coefficients, state.curve_text);
    if (parsed <= 0)
        result = parsed < 0
            ? SAGEJS_WASM_SMALLJAC_ALLOCATION_FAILED
            : SAGEJS_WASM_SMALLJAC_PARSE_FAILED;
    else if (state.mode == SAGEJS_WASM_SMALLJAC_MODE_ANLIST)
        result = compute_coefficients(coefficients);
    else
        result = compute_single_ap(coefficients);
    for (index = 0; index < 5; index++)
        mpz_clear(coefficients[index]);
    return result;
}
