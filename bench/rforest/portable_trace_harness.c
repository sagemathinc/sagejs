// Portable form of upstream rforest's elliptic trace-sum smoke test.
// It exercises the public rforest/mproduct ABI without sys/time.h.

#include <assert.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#include <gmp.h>

#include "rforest.h"

static long centered_lift(long value, long p) {
  return value > p / 2 ? value - p : (value < -p / 2 ? value + p : value);
}
int main(int argc, char **argv) {
  mpz_t *A, *V, *M, *moduli;
  mpz_t product, work, discriminant;
  long a, b, i, n, bound, *endpoints;
  int rows = 1, dimension = 3, degree = 1, kappa;

  if (argc != 5) {
    fprintf(stderr, "usage: %s a b bound kappa\n", argv[0]);
    return 2;
  }
  a = strtol(argv[1], 0, 10);
  b = strtol(argv[2], 0, 10);
  bound = strtol(argv[3], 0, 10);
  kappa = (int)strtol(argv[4], 0, 10);
  if (!b || bound < 17) return 2;

  mpz_init(discriminant);
  mpz_init(work);
  mpz_set_si(work, b);
  mpz_mul_si(work, work, b);
  mpz_mul_ui(work, work, 27);
  mpz_set_si(discriminant, a);
  mpz_mul_si(discriminant, discriminant, a);
  mpz_mul_si(discriminant, discriminant, a);
  mpz_mul_2exp(discriminant, discriminant, 2);
  mpz_add(discriminant, discriminant, work);
  if (!mpz_sgn(discriminant)) return 2;

  long capacity = (long)ceil(1.25506 * bound / log((double)bound)) + 1;
  moduli = malloc((size_t)capacity * sizeof(*moduli));
  mpz_init_set_ui(moduli[0], 17);
  for (n = 1; n < capacity; n++) {
    mpz_init(moduli[n]);
    mpz_nextprime(moduli[n], moduli[n - 1]);
    if (mpz_cmp_ui(moduli[n], (unsigned long)bound) > 0) {
      mpz_clear(moduli[n]);
      break;
    }
  }
  assert(n < capacity);
  mpz_init2(product, (mp_bitcnt_t)bound);
  mproduct(product, moduli, n);

  V = malloc((size_t)(rows * dimension) * sizeof(*V));
  for (i = 0; i < rows * dimension; i++) mpz_init(V[i]);
  mpz_set_ui(V[dimension - 1], 1);
  A = malloc((size_t)(n * rows * dimension) * sizeof(*A));
  for (i = 0; i < n * rows * dimension; i++) mpz_init(A[i]);
  M = malloc((size_t)((degree + 1) * dimension * dimension) * sizeof(*M));
  for (i = 0; i < (degree + 1) * dimension * dimension; i++) mpz_init(M[i]);
  mpz_set_ui(M[4], 3);
  mpz_set_si(M[5], -2);
  mpz_set_si(M[7], 2 * b);
  mpz_set_si(M[15], 2 * b);
  mpz_set_si(M[16], a);
  mpz_set_si(M[17], -2 * a);

  endpoints = malloc((size_t)n * sizeof(*endpoints));
  for (i = 0; i < n; i++) endpoints[i] = (long)mpz_get_ui(moduli[i]);
  rforest(A, V, rows, M, degree, dimension, moduli, 1, endpoints, n, product,
          kappa);

  long sum = 0;
  mpz_set_si(work, b);
  for (i = 0; i < n; i++) {
    long p = (long)mpz_get_ui(moduli[i]);
    if (!mpz_divisible_ui_p(discriminant, (unsigned long)p)) {
      long residue = -(long)mpz_kronecker_ui(work, (unsigned long)p) *
                     (long)mpz_get_ui(A[3 * i + 2]);
      sum += centered_lift(residue, p);
    }
  }
  printf("primes=%ld trace_sum=%ld\n", n, sum);
  if (bound == 100000 && sum != 11664) return 1;

  free(endpoints);
  for (i = 0; i < (degree + 1) * dimension * dimension; i++) mpz_clear(M[i]);
  for (i = 0; i < rows * dimension; i++) mpz_clear(V[i]);
  for (i = 0; i < n * rows * dimension; i++) mpz_clear(A[i]);
  for (i = 0; i < n; i++) mpz_clear(moduli[i]);
  mpz_clear(work);
  mpz_clear(product);
  mpz_clear(discriminant);
  free(M);
  free(V);
  free(A);
  free(moduli);
  return 0;
}
