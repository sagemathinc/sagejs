#ifndef SAGEJS_GMP_WORD_H
#define SAGEJS_GMP_WORD_H

/*
 * GMP deliberately defines its `_ui` and `_si` interfaces in terms of C
 * `long`.  That is 64 bits on the Unix targets supported by smalljac, but only
 * 32 bits in the native Windows LLP64 ABI.  The transformed Windows sources
 * use these adapters so their historical 64-bit-word contract is preserved.
 */

#include <gmp.h>
#include <limits.h>
#include <stdint.h>

#if defined(_WIN32) || defined(__wasm__) || \
    defined(SAGEJS_GMP_FORCE_NARROW_LONG)

/* `prepare-sources.cjs` intentionally widens the dependency sources from
   `long` to `int64_t`.  Do not spell C `long` or its limit macros below:
   that same source transform is applied to this copied header.  The compiler
   ABI macro remains the source of truth for GMP's `_ui`/`_si` entry points. */
#if defined(SAGEJS_GMP_FORCE_NARROW_LONG)
#define SAGEJS_GMP_NATIVE_LONG_BYTES 4
#elif defined(__SIZEOF_LONG__)
#define SAGEJS_GMP_NATIVE_LONG_BYTES __SIZEOF_LONG__
#elif defined(_WIN32)
#define SAGEJS_GMP_NATIVE_LONG_BYTES 4
#else
#error "unable to determine the GMP C long width"
#endif

#define SAGEJS_GMP_U64_FITS_NATIVE(value) \
  (SAGEJS_GMP_NATIVE_LONG_BYTES >= 8 || (value) <= UINT32_MAX)
#define SAGEJS_GMP_I64_FITS_NATIVE(value) \
  (SAGEJS_GMP_NATIVE_LONG_BYTES >= 8 || \
   ((value) >= INT32_MIN && (value) <= INT32_MAX))

static inline void sagejs_mpz_set_u64(mpz_ptr result, uint64_t value) {
  mpz_import(result, 1, -1, sizeof(value), 0, 0, &value);
}

static inline void sagejs_mpz_set_i64(mpz_ptr result, int64_t value) {
  uint64_t magnitude = value < 0 ? (uint64_t)(-(value + 1)) + 1 : (uint64_t)value;
  sagejs_mpz_set_u64(result, magnitude);
  if (value < 0) mpz_neg(result, result);
}

static inline uint64_t sagejs_mpz_get_u64(mpz_srcptr value) {
  uint64_t result = 0;
  size_t count = 0;
  mpz_t low;
  mpz_init(low);
  mpz_abs(low, value);
  mpz_fdiv_r_2exp(low, low, 64);
  mpz_export(&result, &count, -1, sizeof(result), 0, 0, low);
  mpz_clear(low);
  return result;
}

static inline int64_t sagejs_mpz_get_i64(mpz_srcptr value) {
  uint64_t magnitude = sagejs_mpz_get_u64(value);
  if (mpz_sgn(value) >= 0) return (int64_t)magnitude;
  return -(int64_t)(magnitude - 1) - 1;
}

static inline void sagejs_mpz_init_set_u64(mpz_ptr result, uint64_t value) {
  mpz_init(result);
  sagejs_mpz_set_u64(result, value);
}

static inline int sagejs_mpz_cmp_u64(mpz_srcptr left, uint64_t right) {
  if (SAGEJS_GMP_U64_FITS_NATIVE(right)) return mpz_cmp_ui(left, right);
  mpz_t temporary;
  sagejs_mpz_init_set_u64(temporary, right);
  int result = mpz_cmp(left, temporary);
  mpz_clear(temporary);
  return result;
}

static inline int sagejs_mpz_cmpabs_u64(mpz_srcptr left, uint64_t right) {
  if (SAGEJS_GMP_U64_FITS_NATIVE(right)) return mpz_cmpabs_ui(left, right);
  mpz_t temporary;
  sagejs_mpz_init_set_u64(temporary, right);
  int result = mpz_cmpabs(left, temporary);
  mpz_clear(temporary);
  return result;
}

static inline int sagejs_mpz_cmp_i64(mpz_srcptr left, int64_t right) {
  if (SAGEJS_GMP_I64_FITS_NATIVE(right)) return mpz_cmp_si(left, right);
  mpz_t temporary;
  mpz_init(temporary);
  sagejs_mpz_set_i64(temporary, right);
  int result = mpz_cmp(left, temporary);
  mpz_clear(temporary);
  return result;
}

#define SAGEJS_MPZ_BINARY_U64(name, operation_ui, operation)                 \
  static inline void name(mpz_ptr result, mpz_srcptr left, uint64_t right) { \
    if (SAGEJS_GMP_U64_FITS_NATIVE(right)) {                                 \
      operation_ui(result, left, right);                                     \
      return;                                                                \
    }                                                                        \
    mpz_t temporary;                                                         \
    sagejs_mpz_init_set_u64(temporary, right);                               \
    operation(result, left, temporary);                                      \
    mpz_clear(temporary);                                                    \
  }

SAGEJS_MPZ_BINARY_U64(sagejs_mpz_add_u64, mpz_add_ui, mpz_add)
SAGEJS_MPZ_BINARY_U64(sagejs_mpz_sub_u64, mpz_sub_ui, mpz_sub)
SAGEJS_MPZ_BINARY_U64(sagejs_mpz_mul_u64, mpz_mul_ui, mpz_mul)
SAGEJS_MPZ_BINARY_U64(sagejs_mpz_divexact_u64, mpz_divexact_ui, mpz_divexact)

static inline void sagejs_mpz_addmul_u64(mpz_ptr result, mpz_srcptr left,
                                          uint64_t right) {
  if (SAGEJS_GMP_U64_FITS_NATIVE(right)) {
    mpz_addmul_ui(result, left, right);
    return;
  }
  mpz_t temporary;
  sagejs_mpz_init_set_u64(temporary, right);
  mpz_addmul(result, left, temporary);
  mpz_clear(temporary);
}

static inline uint64_t sagejs_mpz_fdiv_q_u64(mpz_ptr quotient,
                                              mpz_srcptr dividend,
                                              uint64_t divisor) {
  if (SAGEJS_GMP_U64_FITS_NATIVE(divisor))
    return mpz_fdiv_q_ui(quotient, dividend, divisor);
  mpz_t divisorInteger, remainder;
  sagejs_mpz_init_set_u64(divisorInteger, divisor);
  mpz_init(remainder);
  mpz_fdiv_qr(quotient, remainder, dividend, divisorInteger);
  uint64_t result = sagejs_mpz_get_u64(remainder);
  mpz_clear(remainder);
  mpz_clear(divisorInteger);
  return result;
}

static inline uint64_t sagejs_mpz_tdiv_q_u64(mpz_ptr quotient,
                                              mpz_srcptr dividend,
                                              uint64_t divisor) {
  if (SAGEJS_GMP_U64_FITS_NATIVE(divisor))
    return mpz_tdiv_q_ui(quotient, dividend, divisor);
  mpz_t divisorInteger, remainder;
  sagejs_mpz_init_set_u64(divisorInteger, divisor);
  mpz_init(remainder);
  mpz_tdiv_qr(quotient, remainder, dividend, divisorInteger);
  uint64_t result = sagejs_mpz_get_u64(remainder);
  mpz_clear(remainder);
  mpz_clear(divisorInteger);
  return result;
}

static inline uint64_t sagejs_mpz_fdiv_u64(mpz_srcptr dividend,
                                            uint64_t divisor) {
  if (SAGEJS_GMP_U64_FITS_NATIVE(divisor))
    return mpz_fdiv_ui(dividend, divisor);
  mpz_t divisorInteger, remainder;
  sagejs_mpz_init_set_u64(divisorInteger, divisor);
  mpz_init(remainder);
  mpz_fdiv_r(remainder, dividend, divisorInteger);
  uint64_t result = sagejs_mpz_get_u64(remainder);
  mpz_clear(remainder);
  mpz_clear(divisorInteger);
  return result;
}

static inline uint64_t sagejs_mpz_mod_u64(mpz_ptr remainder,
                                           mpz_srcptr dividend,
                                           uint64_t divisor) {
  if (SAGEJS_GMP_U64_FITS_NATIVE(divisor)) {
    return mpz_mod_ui(remainder, dividend, divisor);
  }
  mpz_t divisorInteger;
  sagejs_mpz_init_set_u64(divisorInteger, divisor);
  mpz_mod(remainder, dividend, divisorInteger);
  mpz_clear(divisorInteger);
  return sagejs_mpz_get_u64(remainder);
}

static inline void sagejs_mpz_pow_u64(mpz_ptr result, mpz_srcptr base,
                                       uint64_t exponent) {
  if (SAGEJS_GMP_U64_FITS_NATIVE(exponent)) {
    mpz_pow_ui(result, base, exponent);
    return;
  }
  mpz_t power;
  mpz_init_set(power, base);
  mpz_set_ui(result, 1);
  while (exponent) {
    if (exponent & 1) mpz_mul(result, result, power);
    exponent >>= 1;
    if (exponent) mpz_mul(power, power, power);
  }
  mpz_clear(power);
}

static inline void sagejs_mpz_powm_u64(mpz_ptr result, mpz_srcptr base,
                                        uint64_t exponent,
                                        mpz_srcptr modulus) {
  if (SAGEJS_GMP_U64_FITS_NATIVE(exponent)) {
    mpz_powm_ui(result, base, exponent, modulus);
    return;
  }
  mpz_t exponentInteger;
  sagejs_mpz_init_set_u64(exponentInteger, exponent);
  mpz_powm(result, base, exponentInteger, modulus);
  mpz_clear(exponentInteger);
}

static inline void sagejs_mpz_u64_pow_u64(mpz_ptr result, uint64_t base,
                                           uint64_t exponent) {
  mpz_t baseInteger;
  sagejs_mpz_init_set_u64(baseInteger, base);
  sagejs_mpz_pow_u64(result, baseInteger, exponent);
  mpz_clear(baseInteger);
}

static inline void sagejs_mpz_fac_u64(mpz_ptr result, uint64_t value) {
  if (SAGEJS_GMP_U64_FITS_NATIVE(value)) {
    mpz_fac_ui(result, value);
    return;
  }
  mpz_set_ui(result, 1);
  for (uint64_t factor = 2; factor <= value; factor += 1) {
    sagejs_mpz_mul_u64(result, result, factor);
    if (factor == value) break;
  }
}

static inline int sagejs_mpz_kronecker_u64(mpz_srcptr left, uint64_t right) {
  if (SAGEJS_GMP_U64_FITS_NATIVE(right))
    return mpz_kronecker_ui(left, right);
  mpz_t temporary;
  sagejs_mpz_init_set_u64(temporary, right);
  int result = mpz_kronecker(left, temporary);
  mpz_clear(temporary);
  return result;
}

#define SAGEJS_MPZ_BINARY_I64(name, operation_si, operation)                \
  static inline void name(mpz_ptr result, mpz_srcptr left, int64_t right) { \
    if (SAGEJS_GMP_I64_FITS_NATIVE(right)) {                                \
      operation_si(result, left, right);                                    \
      return;                                                               \
    }                                                                       \
    mpz_t temporary;                                                        \
    mpz_init(temporary);                                                    \
    sagejs_mpz_set_i64(temporary, right);                                   \
    operation(result, left, temporary);                                     \
    mpz_clear(temporary);                                                   \
  }

SAGEJS_MPZ_BINARY_I64(sagejs_mpz_mul_i64, mpz_mul_si, mpz_mul)

static inline void sagejs_mpq_set_u64(mpq_ptr result, uint64_t numerator,
                                       uint64_t denominator) {
  sagejs_mpz_set_u64(mpq_numref(result), numerator);
  sagejs_mpz_set_u64(mpq_denref(result), denominator);
  mpq_canonicalize(result);
}

#undef mpq_set_ui
#undef mpz_add_ui
#undef mpz_addmul_ui
#undef mpz_cmp_si
#undef mpz_cmp_ui
#undef mpz_cmpabs_ui
#undef mpz_divexact_ui
#undef mpz_fac_ui
#undef mpz_fdiv_q_ui
#undef mpz_fdiv_ui
#undef mpz_get_si
#undef mpz_get_ui
#undef mpz_init_set_ui
#undef mpz_kronecker_ui
#undef mpz_mod_ui
#undef mpz_mul_si
#undef mpz_mul_ui
#undef mpz_pow_ui
#undef mpz_powm_ui
#undef mpz_set_si
#undef mpz_set_ui
#undef mpz_sub_ui
#undef mpz_tdiv_q_ui
#undef mpz_ui_pow_ui

#define mpq_set_ui sagejs_mpq_set_u64
#define mpz_add_ui sagejs_mpz_add_u64
#define mpz_addmul_ui sagejs_mpz_addmul_u64
#define mpz_cmp_si sagejs_mpz_cmp_i64
#define mpz_cmp_ui sagejs_mpz_cmp_u64
#define mpz_cmpabs_ui sagejs_mpz_cmpabs_u64
#define mpz_divexact_ui sagejs_mpz_divexact_u64
#define mpz_fac_ui sagejs_mpz_fac_u64
#define mpz_fdiv_q_ui sagejs_mpz_fdiv_q_u64
#define mpz_fdiv_ui sagejs_mpz_fdiv_u64
#define mpz_get_si sagejs_mpz_get_i64
#define mpz_get_ui sagejs_mpz_get_u64
#define mpz_init_set_ui sagejs_mpz_init_set_u64
#define mpz_kronecker_ui sagejs_mpz_kronecker_u64
#define mpz_mod_ui sagejs_mpz_mod_u64
#define mpz_mul_si sagejs_mpz_mul_i64
#define mpz_mul_ui sagejs_mpz_mul_u64
#define mpz_pow_ui sagejs_mpz_pow_u64
#define mpz_powm_ui sagejs_mpz_powm_u64
#define mpz_set_si sagejs_mpz_set_i64
#define mpz_set_ui sagejs_mpz_set_u64
#define mpz_sub_ui sagejs_mpz_sub_u64
#define mpz_tdiv_q_ui sagejs_mpz_tdiv_q_u64
#define mpz_ui_pow_ui sagejs_mpz_u64_pow_u64

#undef SAGEJS_GMP_I64_FITS_NATIVE
#undef SAGEJS_GMP_U64_FITS_NATIVE
#undef SAGEJS_GMP_NATIVE_LONG_BYTES

#endif
#endif
