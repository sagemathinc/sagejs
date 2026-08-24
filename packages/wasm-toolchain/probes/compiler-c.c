#include <stdint.h>

__attribute__((export_name("sagejs_compiler_c_probe")))
uint32_t sagejs_compiler_c_probe(uint32_t left, uint32_t right) {
    return left * 31u + right;
}
