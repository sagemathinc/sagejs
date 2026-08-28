#include <stddef.h>
#include <stdint.h>

/*
 * Feasibility target for a bounded modular character scan.
 *
 * This is deliberately not a production mathematical implementation.  The
 * checked-in JavaScript harness authenticates and canonicalizes the source
 * phase's inputs, copies one complete coefficient vector into linear memory,
 * calls this isolated feasibility target, and transactionally publishes the
 * result only after this function returns.  A future compiler target must
 * lower the reviewed Python source and independently verify the same proof
 * obligations; it must not select this function by source or function name.
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
    while (exponent != 0) {
        if ((exponent & 1U) != 0) {
            result = (result * power) % modulus;
        }
        exponent >>= 1;
        if (exponent != 0) {
            power = (power * power) % modulus;
        }
    }
    return (uint32_t)result;
}

/*
 * Return sum_x chi(f(x)) for an odd authenticated prime.  Coefficients are
 * dense, little-endian, canonical residues.  The host bounds prime to
 * INT32_MAX, so both the u64 products and the signed character sum are exact.
 */
EXPORT("bounded_modular_character_sum_u32")
int32_t bounded_modular_character_sum_u32(
    const uint32_t *coefficients,
    uint32_t length,
    uint32_t prime
) {
    int32_t character_sum = 0;
    for (uint32_t x_value = 0; x_value < prime; x_value++) {
        if (((x_value + 1U) & 255U) == 0U) {
            sagejs_check_interrupt();
        }
        uint64_t evaluation = 0;
        for (uint32_t offset = 0; offset < length; offset++) {
            uint32_t index = length - offset - 1U;
            evaluation =
                (evaluation * x_value + coefficients[index]) % prime;
        }
        if (evaluation == 0) {
            continue;
        }
        uint32_t character = pow_mod_u32(
            (uint32_t)evaluation,
            (prime - 1U) / 2U,
            prime
        );
        character_sum += character == 1U ? 1 : -1;
    }
    return character_sum;
}
