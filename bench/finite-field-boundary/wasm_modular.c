#include <stddef.h>
#include <stdint.h>

#define EXPORT(name) __attribute__((export_name(name)))

EXPORT("add_mod_u32")
uint32_t wasm_add_mod_u32(uint32_t left, uint32_t right, uint32_t modulus) {
    return (uint32_t)(((uint64_t)left + (uint64_t)right) % modulus);
}

EXPORT("mul_mod_u32")
uint32_t wasm_mul_mod_u32(uint32_t left, uint32_t right, uint32_t modulus) {
    return (uint32_t)(((uint64_t)left * (uint64_t)right) % modulus);
}

EXPORT("mul_add_mod_u32")
uint32_t wasm_mul_add_mod_u32(
    uint32_t value,
    uint32_t multiplier,
    uint32_t increment,
    uint32_t modulus
) {
    return (uint32_t)(
        ((uint64_t)value * (uint64_t)multiplier + (uint64_t)increment) % modulus
    );
}

EXPORT("chain_mod_u32")
uint32_t wasm_chain_mod_u32(
    uint32_t value,
    uint32_t multiplier,
    uint32_t increment,
    uint32_t modulus,
    uint32_t count
) {
    for (uint32_t index = 0; index < count; index++) {
        value = wasm_mul_add_mod_u32(value, multiplier, increment, modulus);
    }
    return value;
}

EXPORT("vector_mul_add_mod_u32")
uint32_t wasm_vector_mul_add_mod_u32(
    uint32_t *values,
    uint32_t length,
    uint32_t multiplier,
    uint32_t increment,
    uint32_t modulus
) {
    uint32_t checksum = 0;
    for (uint32_t index = 0; index < length; index++) {
        values[index] = wasm_mul_add_mod_u32(
            values[index], multiplier, increment, modulus
        );
        checksum ^= values[index];
    }
    return checksum;
}
