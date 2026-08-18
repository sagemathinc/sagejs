#ifndef SAGEJS_FFPOLY_WORD_H
#define SAGEJS_FFPOLY_WORD_H

/*
 * Portable 64-bit word primitives for ffpoly 1.2.7.
 *
 * ffpoly's upstream asm.h spells these operations as GNU x86-64 inline
 * assembly.  Keep that implementation as the default on x86-64, but provide
 * the same exact modulo-2^64 semantics for arm64 and forced-portable builds.
 * The smalljac dependency build copies this header beside asm.h before
 * applying the portability patch.
 */

#include <stdint.h>
#include <stdlib.h>

typedef struct {
  uint64_t hi;
  uint64_t lo;
} sagejs_ffpoly_u128;

typedef struct {
  uint64_t word2;
  uint64_t word1;
  uint64_t word0;
} sagejs_ffpoly_u192;

static inline int64_t sagejs_ffpoly_atol64(const char *text) {
  return (int64_t)strtoll(text, NULL, 10);
}

static inline uint64_t sagejs_ffpoly_random64(void) {
  uint64_t result = 0;
  unsigned bits = 0;
  while (bits < 64) {
    result = (result << 15) ^ (uint64_t)(rand() & 0x7fff);
    bits += 15;
  }
  return result;
}

#if defined(_MSC_VER) && defined(_M_X64)
#include <intrin.h>

static __forceinline sagejs_ffpoly_u128 sagejs_ffpoly_mul64(uint64_t x,
                                                            uint64_t y) {
  sagejs_ffpoly_u128 result;
  result.lo = _umul128(x, y, &result.hi);
  return result;
}

static __forceinline sagejs_ffpoly_u128 sagejs_ffpoly_div128by64(
    uint64_t hi, uint64_t lo, uint64_t divisor) {
  const uint64_t base = UINT64_C(1) << 32;
  const uint64_t mask = base - 1;
  uint64_t normalizedHi, normalizedLo, divisorHi, divisorLo;
  uint64_t quotientHi, quotientLo, remainderHat, partial;
  unsigned shift;
  unsigned long divisorHighBit;
  sagejs_ffpoly_u128 result;

  /* clang-cl does not expose MSVC's _udiv128.  Divide in base 2^32 using
     Knuth's normalized two-digit algorithm instead of a 64-step restoring
     loop.  As with x86 divq, callers must provide hi < divisor. */
  _BitScanReverse64(&divisorHighBit, divisor);
  shift = 63U - (unsigned)divisorHighBit;
  divisor <<= shift;
  normalizedHi = shift ? (hi << shift) | (lo >> (64 - shift)) : hi;
  normalizedLo = lo << shift;
  divisorHi = divisor >> 32;
  divisorLo = divisor & mask;

  quotientHi = normalizedHi / divisorHi;
  remainderHat = normalizedHi - quotientHi * divisorHi;
  while (quotientHi >= base ||
         quotientHi * divisorLo > base * remainderHat + (normalizedLo >> 32)) {
    quotientHi -= 1;
    remainderHat += divisorHi;
    if (remainderHat >= base) break;
  }

  partial = normalizedHi * base + (normalizedLo >> 32) - quotientHi * divisor;
  quotientLo = partial / divisorHi;
  remainderHat = partial - quotientLo * divisorHi;
  while (quotientLo >= base ||
         quotientLo * divisorLo > base * remainderHat + (normalizedLo & mask)) {
    quotientLo -= 1;
    remainderHat += divisorHi;
    if (remainderHat >= base) break;
  }

  result.lo = quotientHi * base + quotientLo;
  result.hi = (partial * base + (normalizedLo & mask) - quotientLo * divisor) >>
              shift;
  return result;
}

static __forceinline sagejs_ffpoly_u128 sagejs_ffpoly_add128(
    uint64_t zhi, uint64_t zlo, uint64_t xhi, uint64_t xlo) {
  sagejs_ffpoly_u128 result;
  unsigned char carry = _addcarry_u64(0, zlo, xlo, &result.lo);
  (void)_addcarry_u64(carry, zhi, xhi, &result.hi);
  return result;
}

static __forceinline sagejs_ffpoly_u128 sagejs_ffpoly_sub128(
    uint64_t zhi, uint64_t zlo, uint64_t xhi, uint64_t xlo) {
  sagejs_ffpoly_u128 result;
  unsigned char borrow = _subborrow_u64(0, zlo, xlo, &result.lo);
  (void)_subborrow_u64(borrow, zhi, xhi, &result.hi);
  return result;
}

static __forceinline unsigned sagejs_ffpoly_highbit64(uint64_t value) {
  unsigned long index;
  _BitScanReverse64(&index, value);
  return (unsigned)index;
}

static __forceinline unsigned sagejs_ffpoly_lowbit64(uint64_t value) {
  unsigned long index;
  _BitScanForward64(&index, value);
  return (unsigned)index;
}

#else

#if !defined(__SIZEOF_INT128__) || __SIZEOF_INT128__ != 16
#error "portable ffpoly requires native unsigned 128-bit integer arithmetic"
#endif

typedef __uint128_t sagejs_ffpoly_native_u128;

static inline sagejs_ffpoly_u128 sagejs_ffpoly_mul64(uint64_t x, uint64_t y) {
  sagejs_ffpoly_native_u128 product =
      (sagejs_ffpoly_native_u128)x * (sagejs_ffpoly_native_u128)y;
  sagejs_ffpoly_u128 result = {(uint64_t)(product >> 64),
                               (uint64_t)product};
  return result;
}

static inline sagejs_ffpoly_u128 sagejs_ffpoly_div128by64(
    uint64_t hi, uint64_t lo, uint64_t divisor) {
  sagejs_ffpoly_native_u128 dividend =
      ((sagejs_ffpoly_native_u128)hi << 64) | lo;
  sagejs_ffpoly_u128 result = {(uint64_t)(dividend % divisor),
                               (uint64_t)(dividend / divisor)};
  return result;
}

static inline sagejs_ffpoly_u128 sagejs_ffpoly_add128(
    uint64_t zhi, uint64_t zlo, uint64_t xhi, uint64_t xlo) {
  sagejs_ffpoly_native_u128 sum =
      (((sagejs_ffpoly_native_u128)zhi << 64) | zlo) +
      (((sagejs_ffpoly_native_u128)xhi << 64) | xlo);
  sagejs_ffpoly_u128 result = {(uint64_t)(sum >> 64), (uint64_t)sum};
  return result;
}

static inline sagejs_ffpoly_u128 sagejs_ffpoly_sub128(
    uint64_t zhi, uint64_t zlo, uint64_t xhi, uint64_t xlo) {
  sagejs_ffpoly_native_u128 difference =
      (((sagejs_ffpoly_native_u128)zhi << 64) | zlo) -
      (((sagejs_ffpoly_native_u128)xhi << 64) | xlo);
  sagejs_ffpoly_u128 result = {(uint64_t)(difference >> 64),
                               (uint64_t)difference};
  return result;
}

static inline unsigned sagejs_ffpoly_highbit64(uint64_t value) {
  return (unsigned)(63 - __builtin_clzll(value));
}

static inline unsigned sagejs_ffpoly_lowbit64(uint64_t value) {
  return (unsigned)__builtin_ctzll(value);
}

#endif

static inline sagejs_ffpoly_u192 sagejs_ffpoly_add192(
    uint64_t z2, uint64_t z1, uint64_t z0, uint64_t x2, uint64_t x1,
    uint64_t x0) {
  sagejs_ffpoly_u128 low = sagejs_ffpoly_add128(z1, z0, x1, x0);
  uint64_t carry = low.hi < z1 || (low.hi == z1 && low.lo < z0);
  sagejs_ffpoly_u192 result = {z2 + x2 + carry, low.hi, low.lo};
  return result;
}

#define _asm_div_q_q(q, r, x, y)                                             \
  do {                                                                        \
    sagejs_ffpoly_u128 _sagejs_result = sagejs_ffpoly_div128by64(             \
        (uint64_t)(r), (uint64_t)(x), (uint64_t)(y));                         \
    (q) = _sagejs_result.lo;                                                   \
    (r) = _sagejs_result.hi;                                                   \
  } while (0)

#define _asm_mult_1_1(z1, z0, x0, y0)                                        \
  do {                                                                        \
    sagejs_ffpoly_u128 _sagejs_result =                                       \
        sagejs_ffpoly_mul64((uint64_t)(x0), (uint64_t)(y0));                  \
    (z0) = _sagejs_result.lo;                                                  \
    (z1) = _sagejs_result.hi;                                                  \
  } while (0)

#define _asm_mult_2_2_1(z1, z0, x1, x0, y0)                                  \
  do {                                                                        \
    sagejs_ffpoly_u128 _sagejs_result =                                       \
        sagejs_ffpoly_mul64((uint64_t)(x0), (uint64_t)(y0));                  \
    (z0) = _sagejs_result.lo;                                                  \
    (z1) = _sagejs_result.hi + (uint64_t)(y0) * (uint64_t)(x1);               \
  } while (0)

#define _asm_addto_2_2(z1, z0, x1, x0)                                       \
  do {                                                                        \
    sagejs_ffpoly_u128 _sagejs_result = sagejs_ffpoly_add128(                 \
        (uint64_t)(z1), (uint64_t)(z0), (uint64_t)(x1), (uint64_t)(x0));      \
    (z0) = _sagejs_result.lo;                                                  \
    (z1) = _sagejs_result.hi;                                                  \
  } while (0)

#define _asm_addto_2_1(z1, z0, x0) _asm_addto_2_2(z1, z0, 0, x0)

#define _asm_addto_3_3(z2, z1, z0, x2, x1, x0)                               \
  do {                                                                        \
    sagejs_ffpoly_u192 _sagejs_result = sagejs_ffpoly_add192(                 \
        (uint64_t)(z2), (uint64_t)(z1), (uint64_t)(z0), (uint64_t)(x2),       \
        (uint64_t)(x1), (uint64_t)(x0));                                      \
    (z0) = _sagejs_result.word0;                                               \
    (z1) = _sagejs_result.word1;                                               \
    (z2) = _sagejs_result.word2;                                               \
  } while (0)

#define _asm_addto_3_2(z2, z1, z0, x1, x0)                                   \
  _asm_addto_3_3(z2, z1, z0, 0, x1, x0)

#define _asm_subfrom_2_2(z1, z0, x1, x0)                                     \
  do {                                                                        \
    sagejs_ffpoly_u128 _sagejs_result = sagejs_ffpoly_sub128(                 \
        (uint64_t)(z1), (uint64_t)(z0), (uint64_t)(x1), (uint64_t)(x0));      \
    (z0) = _sagejs_result.lo;                                                  \
    (z1) = _sagejs_result.hi;                                                  \
  } while (0)

#define _asm_inc_2(z1, z0) _asm_addto_2_1(z1, z0, 1)

#endif
