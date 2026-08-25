#include <cstdint>

template <std::uint32_t Multiplier>
constexpr std::uint32_t combine(std::uint32_t left, std::uint32_t right) {
    return left * Multiplier + right;
}

extern "C" __attribute__((export_name("sagejs_compiler_cxx_probe")))
std::uint32_t sagejs_compiler_cxx_probe(std::uint32_t left, std::uint32_t right) {
    return combine<37u>(left, right);
}
