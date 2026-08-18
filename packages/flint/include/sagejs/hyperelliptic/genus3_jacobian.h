#ifndef SAGEJS_HYPERELLIPTIC_GENUS3_JACOBIAN_H
#define SAGEJS_HYPERELLIPTIC_GENUS3_JACOBIAN_H

#include <stddef.h>
#include <stdint.h>
#include <stdatomic.h>

#ifdef __cplusplus
extern "C" {
#endif

/* The rforest backend is defined for p < 2^31.  The genus-three Weil bound
 * then puts every relevant Jacobian order below 2^96.  Sixteen bytes leave a
 * deliberate margin while keeping the public ABI independent of C word size. */
#define SAGEJS_G3J_MAX_PRIME UINT64_C(2147483647)
#define SAGEJS_G3J_INTEGER_BYTES 16
#define SAGEJS_G3J_MAX_FACTORS 32

typedef enum {
    SAGEJS_G3J_OK = 0,
    SAGEJS_G3J_NOT_FOUND = 1,
    SAGEJS_G3J_RESOURCE_LIMIT = 2,
    SAGEJS_G3J_CANCELLED = 3,
    SAGEJS_G3J_INVALID_ARGUMENT = -1,
    SAGEJS_G3J_INVALID_MODEL = -2,
    SAGEJS_G3J_INVALID_DIVISOR = -3,
    SAGEJS_G3J_ALLOCATION_FAILED = -4,
    SAGEJS_G3J_INTERNAL_ERROR = -5
} sagejs_g3j_status;

/* Unsigned, canonical, big-endian.  length=0 represents zero. */
typedef struct {
    uint8_t length;
    uint8_t bytes[SAGEJS_G3J_INTEGER_BYTES];
} sagejs_g3j_integer;

/* Ascending coefficients over F_p.  u is monic and u_degree is 0..3;
 * coefficients above the declared degrees must be zero. */
typedef struct {
    uint8_t u_degree;
    uint64_t u[4];
    uint64_t v[3];
} sagejs_g3j_divisor;

typedef struct {
    uint64_t group_operations;
    uint64_t scalar_bits;
    uint64_t baby_steps;
    uint64_t giant_steps;
    uint64_t hash_collisions;
    uint64_t candidates_tested;
} sagejs_g3j_diagnostics;

typedef struct {
    int32_t status;
    sagejs_g3j_integer annihilating_multiple;
    sagejs_g3j_integer element_order;
    uint8_t factor_count;
    sagejs_g3j_integer factor_primes[SAGEJS_G3J_MAX_FACTORS];
    uint8_t factor_exponents[SAGEJS_G3J_MAX_FACTORS];
    sagejs_g3j_diagnostics diagnostics;
} sagejs_g3j_certificate;

/* Validate a reduced Mumford divisor on y^2+h(x)y=f(x). */
int32_t sagejs_g3j_validate(
    uint64_t prime,
    const uint64_t f[8],
    const uint64_t h[4],
    const sagejs_g3j_divisor *divisor);

/* Compute scalar*divisor.  Scalar is arbitrary precision within the explicit
 * rforest-domain bound.  Every Cantor composition/squaring consumes one unit
 * of max_group_operations. */
int32_t sagejs_g3j_scalar_multiply(
    uint64_t prime,
    const uint64_t f[8],
    const uint64_t h[4],
    const sagejs_g3j_divisor *divisor,
    const sagejs_g3j_integer *scalar,
    uint64_t max_group_operations,
    const _Atomic uint32_t *cancel,
    sagejs_g3j_divisor *result,
    sagejs_g3j_diagnostics *diagnostics);

/* Test explicit candidate orders.  outcomes[i] is 1 when candidates[i]
 * annihilates every supplied divisor, 0 when a checked divisor disproves it,
 * and 2 when the global resource/cancellation boundary leaves it untested. */
int32_t sagejs_g3j_filter_orders(
    uint64_t prime,
    const uint64_t f[8],
    const uint64_t h[4],
    const sagejs_g3j_divisor *divisors,
    uint64_t divisor_count,
    const sagejs_g3j_integer *candidates,
    uint64_t candidate_count,
    uint64_t max_group_operations,
    const _Atomic uint32_t *cancel,
    uint8_t *outcomes,
    sagejs_g3j_diagnostics *diagnostics);

/* Find k in [0,count) for which (base+k*stride)*divisor=0 using bounded BSGS.
 * On success, completely factor and strip that multiple to the exact order of
 * divisor.  The certificate is independently recheckable: e*D=0, each listed
 * q is prime, product(q^a)=e, and (e/q)*D!=0 for every q|e. */
int32_t sagejs_g3j_search_progression(
    uint64_t prime,
    const uint64_t f[8],
    const uint64_t h[4],
    const sagejs_g3j_divisor *divisor,
    const sagejs_g3j_integer *base,
    const sagejs_g3j_integer *stride,
    uint64_t count,
    uint64_t max_baby_steps,
    uint64_t max_group_operations,
    const _Atomic uint32_t *cancel,
    sagejs_g3j_certificate *certificate);

const char *sagejs_g3j_status_name(int32_t status);

#ifdef __cplusplus
}
#endif

#endif
