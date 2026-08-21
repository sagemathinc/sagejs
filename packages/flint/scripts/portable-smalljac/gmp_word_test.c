#include <stdint.h>

#define SAGEJS_GMP_FORCE_NARROW_LONG 1
#include "sagejs_gmp_word.h"

int main(void) {
  const uint64_t left = UINT64_C(0x1ffffffff);
  const uint64_t right = UINT64_C(0x200000003);
  mpz_t a, b, expected;
  mpq_t rational;

  mpz_init(a);
  mpz_init(b);
  mpz_init(expected);
  mpz_set_ui(a, left);
  if (mpz_get_ui(a) != left || mpz_cmp_ui(a, left) != 0) return 1;

  mpz_add_ui(b, a, right);
  if (mpz_get_ui(b) != UINT64_C(0x400000002)) return 2;
  mpz_mul_ui(b, a, right);
  mpz_set_str(expected, "73786976312018075645", 10);
  if (mpz_cmp(b, expected) != 0) return 3;
  mpz_divexact_ui(b, b, right);
  if (mpz_cmp_ui(b, left) != 0) return 4;

  mpz_set_str(a, "79228162514264337593543950335", 10);
  if (mpz_fdiv_ui(a, right) != UINT64_C(0x3ffffffc)) return 5;
  mpz_fdiv_q_ui(b, a, right);
  if (mpz_get_ui(b) != UINT64_C(0x7fffffff40000001)) return 6;

  mpz_set_si(a, INT64_MIN);
  if (mpz_get_si(a) != INT64_MIN || mpz_cmp_si(a, INT64_MIN) != 0) return 7;
  mpz_set_ui(a, 2);
  mpz_set_ui(expected, 17);
  mpz_powm_ui(b, a, UINT64_C(0x100000001), expected);
  if (mpz_cmp_ui(b, 2) != 0) return 8;

  mpq_init(rational);
  mpq_set_ui(rational, UINT64_C(0x200000002), UINT64_C(0x100000001));
  if (mpz_cmp_ui(mpq_numref(rational), 2) != 0 ||
      mpz_cmp_ui(mpq_denref(rational), 1) != 0)
    return 9;

  mpq_clear(rational);
  mpz_clear(expected);
  mpz_clear(b);
  mpz_clear(a);
  return 0;
}
