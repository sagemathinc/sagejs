#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>

#include "sagejs_ffpoly_word.h"

static uint64_t state = UINT64_C(0x9e3779b97f4a7c15);

static uint64_t next_word(void) {
  state ^= state >> 12;
  state ^= state << 25;
  state ^= state >> 27;
  return state * UINT64_C(0x2545f4914f6cdd1d);
}

#if defined(_MSC_VER) || !defined(__SIZEOF_INT128__) || __SIZEOF_INT128__ != 16
static sagejs_ffpoly_u128 reference_divide(uint64_t high, uint64_t low,
                                           uint64_t divisor) {
  sagejs_ffpoly_u128 result = {high, 0};
  for (int bit = 63; bit >= 0; bit -= 1) {
    uint64_t carry = result.hi >> 63;
    result.hi = (result.hi << 1) | ((low >> bit) & UINT64_C(1));
    if (carry || result.hi >= divisor) {
      result.hi -= divisor;
      result.lo |= UINT64_C(1) << bit;
    }
  }
  return result;
}

int main(void) {
  uint64_t high = 0, low = 0, quotient = 0;
  _asm_mult_1_1(high, low, UINT64_C(0xffffffffffffffff), UINT64_C(2));
  if (high != UINT64_C(1) || low != UINT64_C(0xfffffffffffffffe)) return 1;
  high = UINT64_C(0xffffffffffffffff);
  low = UINT64_C(0xffffffffffffffff);
  _asm_addto_2_2(high, low, UINT64_C(0), UINT64_C(1));
  if (high != 0 || low != 0) return 2;
  _asm_subfrom_2_2(high, low, UINT64_C(0), UINT64_C(1));
  if (high != UINT64_C(0xffffffffffffffff) ||
      low != UINT64_C(0xffffffffffffffff))
    return 3;
  high = UINT64_C(0x123456789abcdef0);
  low = UINT64_C(0xfedcba9876543210);
  _asm_div_q_q(quotient, high, low, UINT64_C(0xf123456789abcdef));
  if (quotient != UINT64_C(0x13539261fdbc34c7) ||
      high != UINT64_C(0x703884e61d6e9147))
    return 4;
  if (sagejs_ffpoly_highbit64(UINT64_C(0x8000000000001000)) != 63 ||
      sagejs_ffpoly_lowbit64(UINT64_C(0x8000000000001000)) != 12)
    return 5;
  for (unsigned iteration = 0; iteration < 100000; iteration += 1) {
    uint64_t divisor = next_word() | 1;
    uint64_t dividendHigh = next_word() % divisor;
    uint64_t dividendLow = next_word();
    sagejs_ffpoly_u128 expected =
        reference_divide(dividendHigh, dividendLow, divisor);
    high = dividendHigh;
    low = dividendLow;
    _asm_div_q_q(quotient, high, low, divisor);
    if (quotient != expected.lo || high != expected.hi) return 6;
  }
  return 0;
}
#else
typedef __uint128_t native_u128;

static int fail(const char *operation, unsigned iteration) {
  fprintf(stderr, "%s failed at iteration %u\n", operation, iteration);
  return 1;
}

int main(void) {
  unsigned i;
  for (i = 0; i < 1000000; i += 1) {
    uint64_t x = next_word();
    uint64_t y = next_word();
    uint64_t zhi = next_word();
    uint64_t zlo = next_word();
    uint64_t xhi = next_word();
    uint64_t xlo = next_word();
    uint64_t high;
    uint64_t low;
    native_u128 expected;

    _asm_mult_1_1(high, low, x, y);
    expected = (native_u128)x * y;
    if (high != (uint64_t)(expected >> 64) || low != (uint64_t)expected)
      return fail("multiply", i);

    high = zhi;
    low = zlo;
    _asm_addto_2_2(high, low, xhi, xlo);
    expected = (((native_u128)zhi << 64) | zlo) +
               (((native_u128)xhi << 64) | xlo);
    if (high != (uint64_t)(expected >> 64) || low != (uint64_t)expected)
      return fail("add", i);

    high = zhi;
    low = zlo;
    _asm_subfrom_2_2(high, low, xhi, xlo);
    expected = (((native_u128)zhi << 64) | zlo) -
               (((native_u128)xhi << 64) | xlo);
    if (high != (uint64_t)(expected >> 64) || low != (uint64_t)expected)
      return fail("subtract", i);

    if (y != 0 && xhi < y) {
      high = xhi;
      low = xlo;
      _asm_div_q_q(x, high, low, y);
      expected = ((native_u128)xhi << 64) | xlo;
      if (x != (uint64_t)(expected / y) || high != (uint64_t)(expected % y))
        return fail("divide", i);
    }
  }
  return 0;
}
#endif
