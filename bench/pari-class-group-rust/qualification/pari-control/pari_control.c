#define _POSIX_C_SOURCE 200809L

/*
 * Qualification-only pristine PARI 2.17.4 control adapter.
 *
 * This executable is never a Sage.js product dependency. It exposes three
 * explicitly named timing boundaries and emits the same mathematical result
 * for each. The coarse stages are calls into unmodified libpari, not inferred
 * or sampled profiler buckets.
 */
#include "pari.h"
#include "paripriv.h"

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

enum boundary_kind {
  ALGORITHM_STAGE,
  PREPARED_FIELD,
  PUBLIC_CALL
};

static uint64_t
nanoseconds(struct timespec value)
{
  return (uint64_t)value.tv_sec * UINT64_C(1000000000)
       + (uint64_t)value.tv_nsec;
}

static uint64_t
elapsed(struct timespec begin, struct timespec end)
{
  return nanoseconds(end) - nanoseconds(begin);
}

static void
emit_integer(GEN value)
{
  pari_printf("\"%Ps\"", value);
}

/* PARI's elementary divisors are largest first. Publish canonical invariant
 * factors d_1 | ... | d_r and omit trivial factors. */
static void
emit_canonical_invariants(GEN value)
{
  long index;
  int first = 1;
  putchar('[');
  for (index = lg(value) - 1; index >= 1; --index)
  {
    if (is_pm1(gel(value, index))) continue;
    if (!first) putchar(',');
    first = 0;
    emit_integer(gel(value, index));
  }
  putchar(']');
}

static enum boundary_kind
parse_boundary(const char *value)
{
  if (!strcmp(value, "algorithm-stage")) return ALGORITHM_STAGE;
  if (!strcmp(value, "prepared-field")) return PREPARED_FIELD;
  if (!strcmp(value, "public-call")) return PUBLIC_CALL;
  fprintf(stderr, "unsupported boundary: %s\n", value);
  exit(2);
}

static const char *
boundary_label(enum boundary_kind boundary)
{
  switch (boundary)
  {
    case ALGORITHM_STAGE:
      return "algorithm-stage/pari-bnfinit0-flag-zero-v1";
    case PREPARED_FIELD:
      return "prepared-field/pari-bnfinit0-flag-zero-v1";
    case PUBLIC_CALL:
      return "public-call/pari-nfinit0-plus-bnfinit0-flag-zero-v1";
  }
  return "invalid";
}

int
main(int argc, char **argv)
{
  const long precision = nbits2prec(192);
  enum boundary_kind boundary;
  struct timespec public_begin, nf_begin, nf_end, bnf_begin, bnf_end;
  struct timespec projection_begin, projection_end;
  uint64_t nf_ns, bnf_ns, projection_ns, boundary_ns;
  GEN version, polynomial, nf, bnf, cyc;
  long degree, r1, r2, factor_base_size;

  if (argc != 5)
  {
    fputs("usage: pari-control BOUNDARY POLYNOMIAL FIELD_ID SEED\n", stderr);
    return 2;
  }
  boundary = parse_boundary(argv[1]);
  setvbuf(stdout, NULL, _IONBF, 0);
  pari_init(1200000000, 1000000);
  pari_mt_nbthreads = 1;
  version = pari_version();
  if (lg(version) != 4 || !equaliu(gel(version, 1), 2) ||
      !equaliu(gel(version, 2), 17) || !equaliu(gel(version, 3), 4))
  {
    fputs("linked PARI is not exactly 2.17.4\n", stderr);
    return 3;
  }
  setrand(gp_read_str(argv[4]));
  polynomial = gp_read_str(argv[2]);
  if (!polynomial || typ(polynomial) != t_POL)
  {
    fputs("input did not parse as a polynomial\n", stderr);
    return 4;
  }

  clock_gettime(CLOCK_MONOTONIC, &public_begin);
  clock_gettime(CLOCK_MONOTONIC, &nf_begin);
  nf = nfinit0(polynomial, 0, precision);
  clock_gettime(CLOCK_MONOTONIC, &nf_end);
  if (!nf)
  {
    fputs("nfinit0 failed\n", stderr);
    return 5;
  }
  clock_gettime(CLOCK_MONOTONIC, &bnf_begin);
  bnf = bnfinit0(nf, 0, NULL, precision);
  clock_gettime(CLOCK_MONOTONIC, &bnf_end);
  if (!bnf)
  {
    fputs("bnfinit0 failed\n", stderr);
    return 6;
  }
  nf_ns = elapsed(nf_begin, nf_end);
  bnf_ns = elapsed(bnf_begin, bnf_end);
  boundary_ns = boundary == PUBLIC_CALL ? elapsed(public_begin, bnf_end) : bnf_ns;

  clock_gettime(CLOCK_MONOTONIC, &projection_begin);
  cyc = bnf_get_cyc(bnf);
  degree = nf_get_degree(nf);
  r1 = nf_get_r1(nf);
  r2 = nf_get_r2(nf);
  factor_base_size = lg(gel(bnf, 5)) - 1;
  (void)bnf_get_no(bnf);
  (void)bnf_get_reg(bnf);
  clock_gettime(CLOCK_MONOTONIC, &projection_end);
  projection_ns = elapsed(projection_begin, projection_end);

  printf("{\"schema\":\"sagejs.rust-class-group/pari-control-sample-v1\","
         "\"fieldId\":\"%s\",\"boundaryKind\":\"%s\","
         "\"boundaryLabel\":\"%s\",\"precisionBits\":\"192\","
         "\"threads\":1,\"kernelNanoseconds\":\"%" PRIu64 "\","
         "\"stageTimingsNanoseconds\":{"
         "\"nfinit0-polynomial-to-prepared-field\":\"%" PRIu64 "\","
         "\"bnfinit0-prepared-field-to-complete-bnf\":\"%" PRIu64 "\","
         "\"complete-bnf-to-exact-projection\":\"%" PRIu64 "\"},"
         "\"stageDefinitions\":{"
         "\"nfinit0-polynomial-to-prepared-field\":\"exact nfinit0(polynomial,0,nbits2prec(192)) call\","
         "\"bnfinit0-prepared-field-to-complete-bnf\":\"exact bnfinit0(nf,0,NULL,nbits2prec(192)) call; includes PARI class group, unit and regulator work\","
         "\"complete-bnf-to-exact-projection\":\"exact getter interval; excluded from every kernel boundary\"},"
         "\"result\":{\"classNumber\":",
         argv[3], argv[1], boundary_label(boundary), boundary_ns,
         nf_ns, bnf_ns, projection_ns);
  emit_integer(bnf_get_no(bnf));
  fputs(",\"invariantFactors\":", stdout);
  emit_canonical_invariants(cyc);
  printf("},\"detail\":{\"degree\":\"%ld\",\"signature\":[\"%ld\",\"%ld\"],"
         "\"discriminant\":", degree, r1, r2);
  emit_integer(nf_get_disc(nf));
  printf(",\"factorBaseSize\":\"%ld\",\"unitRank\":\"%ld\","
         "\"regulatorPresent\":%s},"
         "\"call\":{\"pariVersion\":[\"2\",\"17\",\"4\"],"
         "\"seed\":\"%s\",\"preparationIncluded\":%s,"
         "\"resultProjectionIncluded\":false,"
         "\"noPariInProductPath\":true}}\n",
         factor_base_size, r1 + r2 - 1,
         signe(bnf_get_reg(bnf)) ? "true" : "false", argv[4],
         boundary == PUBLIC_CALL ? "true" : "false");
  pari_close();
  return 0;
}
