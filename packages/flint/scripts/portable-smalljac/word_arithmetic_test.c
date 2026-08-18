#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>

#include "sagejs_ffpoly_word.h"

#if defined(_MSC_VER) || !defined(__SIZEOF_INT128__) || __SIZEOF_INT128__ != 16
int main(void) {
  /* clang-cl compilation validates the intrinsic implementation. Full exact
     runtime comparison is performed by the smalljac trace harness. */
  uint64_t high = 0, low = 0;
  _asm_mult_1_1(high, low, UINT64_C(0xffffffffffffffff), UINT64_C(2));
  return high == UINT64_C(1) && low == UINT64_C(0xfffffffffffffffe) ? 0 : 1;
}
#else
typedef __uint128_t native_u128;

static uint64_t state = UINT64_C(0x9e3779b97f4a7c15);

static uint64_t next_word(void) {
  state ^= state >> 12;
  state ^= state << 25;
  state ^= state >> 27;
  return state * UINT64_C(0x2545f4914f6cdd1d);
}

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
