#include <stddef.h>
#include <stdint.h>

/*
 * Feasibility-only target for a checked dense integral over a prime field.
 *
 * The JavaScript evidence harness authenticates and normalizes the complete
 * input, copies it into linear memory, calls this isolated transform, and
 * materializes a fresh host output only after success.  This file is not a
 * production implementation and is never selected by a source/function name.
 * A production target would have to lower and verify the original Python.
 */

#define EXPORT(name) __attribute__((export_name(name)))

__attribute__((import_module("sagejs"), import_name("check_interrupt")))
extern void sagejs_check_interrupt(void);

static uint32_t pow_mod_u32(
    uint32_t base,
    uint32_t exponent,
    uint32_t modulus
) {
    uint64_t result = 1;
    uint64_t power = base % modulus;
    while (exponent != 0U) {
        if ((exponent & 1U) != 0U) {
            result = (result * power) % modulus;
        }
        exponent >>= 1U;
        if (exponent != 0U) {
            power = (power * power) % modulus;
        }
    }
    return (uint32_t)result;
}

/*
 * Return the normalized output length, or a negative status.  The host has
 * already authenticated that `prime` is prime and that every input is a
 * canonical residue.  Rechecking range and capacities here keeps malformed
 * direct calls from reading or writing outside the reviewed region.
 */
EXPORT("checked_prime_integral_u32")
int32_t checked_prime_integral_u32(
    const uint32_t *coefficients,
    uint32_t length,
    uint32_t *output,
    uint32_t output_capacity,
    uint32_t prime
) {
    if (prime < 3U || (prime & 1U) == 0U) {
        return -1;
    }
    if (length == 0U) {
        return 0;
    }
    if (length == UINT32_MAX || output_capacity < length + 1U) {
        return -2;
    }
    output[0] = 0U;
    for (uint32_t index = 0; index < length; index++) {
        if (((index + 1U) & 255U) == 0U) {
            sagejs_check_interrupt();
        }
        uint32_t coefficient = coefficients[index];
        if (coefficient >= prime) {
            return -3;
        }
        if (coefficient == 0U) {
            output[index + 1U] = 0U;
            continue;
        }
        uint32_t denominator = (index + 1U) % prime;
        if (denominator == 0U) {
            return -4;
        }
        uint32_t inverse = pow_mod_u32(denominator, prime - 2U, prime);
        output[index + 1U] =
            (uint32_t)(((uint64_t)coefficient * inverse) % prime);
    }
    uint32_t result_length = length + 1U;
    while (result_length != 0U && output[result_length - 1U] == 0U) {
        result_length--;
    }
    return (int32_t)result_length;
}
