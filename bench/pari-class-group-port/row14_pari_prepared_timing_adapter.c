/*
 * Benchmark-only pristine PARI 2.17.4 adapter for development-panel row 14.
 *
 * The process constructs nfinit once, before READY.  Every RUN restores the
 * prepared stack, resets PARI's RNG, and times exactly bnfinit0(nf, 0).  Result
 * inspection and JSON serialization happen after the clock stops.
 */
#include "pari.h"
#include "paripriv.h"

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/resource.h>
#include <time.h>

#ifndef SAGEJS_AUTHORITY_FIELD_ID
#define SAGEJS_AUTHORITY_FIELD_ID \
  "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413"
#endif
#ifndef SAGEJS_AUTHORITY_SAMPLE_SCHEMA
#define SAGEJS_AUTHORITY_SAMPLE_SCHEMA \
  "sagejs.pari-class-group/row14-pari-prepared-sample-v1"
#endif
#ifndef SAGEJS_AUTHORITY_POLYNOMIAL_ASCENDING_JSON
#define SAGEJS_AUTHORITY_POLYNOMIAL_ASCENDING_JSON \
  "[\"-200000002\",\"-200000002\",\"0\",\"0\",\"1\"]"
#endif

static const char *FIELD_ID = SAGEJS_AUTHORITY_FIELD_ID;

static uint64_t
nanoseconds(struct timespec value)
{
  return (uint64_t)value.tv_sec * UINT64_C(1000000000)
       + (uint64_t)value.tv_nsec;
}

static uint64_t
rusage_nanoseconds(struct rusage value)
{
  return ((uint64_t)value.ru_utime.tv_sec +
          (uint64_t)value.ru_stime.tv_sec) * UINT64_C(1000000000)
       + ((uint64_t)value.ru_utime.tv_usec +
          (uint64_t)value.ru_stime.tv_usec) * UINT64_C(1000);
}

static void
emit_integer(GEN value)
{
  pari_printf("\"%Ps\"", value);
}

static void
emit_integer_vector(GEN value)
{
  long index;
  putchar('[');
  for (index = 1; index < lg(value); index++)
  {
    if (index > 1) putchar(',');
    emit_integer(gel(value, index));
  }
  putchar(']');
}

static void
emit_integer_matrix(GEN value)
{
  long column, row, columns = lg(value) - 1;
  long rows = columns ? lg(gel(value, 1)) - 1 : 0;
  putchar('[');
  for (row = 1; row <= rows; row++)
  {
    if (row > 1) putchar(',');
    putchar('[');
    for (column = 1; column <= columns; column++)
    {
      if (column > 1) putchar(',');
      emit_integer(gcoeff(value, row, column));
    }
    putchar(']');
  }
  putchar(']');
}

static void
emit_ideal_vector(GEN value)
{
  long index;
  putchar('[');
  for (index = 1; index < lg(value); index++)
  {
    if (index > 1) putchar(',');
    emit_integer_matrix(gel(value, index));
  }
  putchar(']');
}

static void
emit_real_triplet(GEN value)
{
  long exponent;
  GEN mantissa;
  if (typ(value) == t_COMPLEX) value = gel(value, 1);
  if (typ(value) == t_INT)
  {
    pari_printf("[\"%Ps\",\"-1\",\"0\"]", value);
    return;
  }
  if (!signe(value))
  {
    fputs("[\"0\",\"-1\",\"0\"]", stdout);
    return;
  }
  mantissa = mantissa_real(value, &exponent);
  pari_printf("[\"%Ps\",\"%ld\",\"%ld\"]", mantissa,
              bit_prec(value), exponent);
}

static void
emit_real_matrix(GEN value)
{
  long column, row;
  int first = 1;
  putchar('[');
  for (column = 1; column < lg(value); column++)
    for (row = 1; row < lg(gel(value, column)); row++)
    {
      if (!first) putchar(',');
      first = 0;
      emit_real_triplet(gcoeff(value, row, column));
    }
  putchar(']');
}

static void
emit_rng(const char *seed)
{
  GEN state = getrand();
  int index;
  printf("{\"algorithm\":\"pari-xorshift1024star-2.17.4\","
         "\"seed\":\"%s\",\"terminalState\":[", seed);
  for (index = 0; index < 66; index++)
  {
    ulong word = *int_W(state, index);
    if (index == 65) word &= 63;
    printf("%s\"%lu\"", index ? "," : "", word);
  }
  fputs("]}", stdout);
}

static void
emit_run(GEN nf, const char *seed)
{
  struct timespec begin, end;
  struct rusage usage, usage_begin;
  GEN bnf, cyc, generators, logs, torsion_basis, fu;
  long degree, rank, factor_base_size, log_rows, log_columns;
  uint64_t elapsed, cpu_elapsed;

  setrand(gp_read_str(seed));
  getrusage(RUSAGE_SELF, &usage_begin);
  clock_gettime(CLOCK_MONOTONIC, &begin);
  bnf = bnfinit0(nf, 0, NULL, nbits2prec(192));
  clock_gettime(CLOCK_MONOTONIC, &end);
  getrusage(RUSAGE_SELF, &usage);
  if (!bnf) pari_err(e_MISC, "row-14 bnfinit flag zero failed");
  elapsed = nanoseconds(end) - nanoseconds(begin);
  cpu_elapsed = rusage_nanoseconds(usage) - rusage_nanoseconds(usage_begin);

  degree = nf_get_degree(nf);
  rank = nf_get_r1(nf) + nf_get_r2(nf) - 1;
  cyc = bnf_get_cyc(bnf);
  generators = bnf_get_gen(bnf);
  logs = bnf_get_logfu(bnf);
  torsion_basis = algtobasis(nf, bnf_get_tuU(bnf));
  fu = bnf_get_fu_nocheck(bnf);
  factor_base_size = lg(gel(bnf, 5)) - 1;
  log_columns = lg(logs) - 1;
  log_rows = log_columns ? lg(gel(logs, 1)) - 1 : 0;
  printf("{\"schema\":\"%s\","
         "\"kernelNanoseconds\":\"%" PRIu64 "\","
         "\"cpuNanoseconds\":\"%" PRIu64 "\",\"result\":{",
         SAGEJS_AUTHORITY_SAMPLE_SCHEMA, elapsed, cpu_elapsed);
  printf("\"field\":{\"id\":\"%s\",\"polynomialAscending\":%s},",
         FIELD_ID, SAGEJS_AUTHORITY_POLYNOMIAL_ASCENDING_JSON);
  fputs("\"classGroup\":{\"classNumber\":", stdout);
  emit_integer(bnf_get_no(bnf));
  fputs(",\"invariantFactorsSourceOrder\":", stdout);
  emit_integer_vector(cyc);
  fputs(",\"generatorIdealHnfs\":", stdout);
  emit_ideal_vector(generators);
  printf("},\"unitGroup\":{\"rank\":\"%ld\","
         "\"logEmbeddingShape\":[\"%ld\",\"%ld\"],"
         "\"logEmbeddingColumnMajor\":", rank, log_rows, log_columns);
  emit_real_matrix(logs);
  fputs(",\"regulatorTriplet\":", stdout);
  emit_real_triplet(bnf_get_reg(bnf));
  printf(",\"torsionOrder\":\"%ld\",\"torsionGeneratorPowerBasis\":",
         bnf_get_tuN(bnf));
  emit_integer_vector(torsion_basis);
  printf(",\"flagZeroFundamentalUnits\":{\"pariType\":\"%ld\","
         "\"logicalLength\":\"%ld\",\"status\":\"%s\"}},",
         typ(fu), lg(fu) - 1,
         typ(fu) == t_MAT && lg(fu) == 1 ? "not_given(LARGE)" : "materialized");
  fputs("\"terminal\":{\"status\":\"pari-flag-zero-complete\","
        "\"correspondenceAssumed\":true,\"publicCertified\":false}},",
        stdout);
  printf("\"work\":{\"degree\":\"%ld\",\"factorBaseSize\":\"%ld\","
         "\"classHnfColumns\":\"%ld\",\"logEmbeddingRows\":\"%ld\","
         "\"logEmbeddingColumns\":\"%ld\"},\"rng\":",
         degree, factor_base_size, lg(gel(bnf, 1)) - 1,
         log_rows, log_columns);
  emit_rng(seed);
  printf(",\"processMaxRssKiB\":\"%ld\"}\n", usage.ru_maxrss);
  fflush(stdout);
}

int
main(void)
{
  char command[4096];
  struct timespec begin, end;
  GEN polynomial, nf, version;
  pari_sp prepared_stack;
  uint64_t preparation_nanoseconds;

  setvbuf(stdout, NULL, _IONBF, 0);
  /* Match the single resident Sage.js worker and avoid reserving PARI's
   * default pool of worker stacks for a deliberately single-threaded kernel. */
  pari_init(1200000000, 1000000);
  pari_mt_nbthreads = 1;
  polynomial = gp_read_str("x^4-200000002*x-200000002");
  clock_gettime(CLOCK_MONOTONIC, &begin);
  nf = nfinit0(polynomial, 0, nbits2prec(192));
  clock_gettime(CLOCK_MONOTONIC, &end);
  if (!nf) return 2;
  preparation_nanoseconds = nanoseconds(end) - nanoseconds(begin);
  version = pari_version();
  if (lg(version) != 4 || !equaliu(gel(version, 1), 2) ||
      !equaliu(gel(version, 2), 17) || !equaliu(gel(version, 3), 4)) return 5;
  if (!equalii(nf_get_disc(nf),
      gp_read_str("-43200003776000087360000787200002480"))) return 6;
  prepared_stack = avma;
  printf("READY {\"schema\":1,\"fieldId\":\"%s\","
         "\"pariVersion\":[\"2\",\"17\",\"4\"],"
         "\"precisionBits\":\"192\",\"degree\":\"4\","
         "\"signature\":[\"2\",\"1\"],"
         "\"discriminant\":\"-43200003776000087360000787200002480\","
         "\"preparationNanoseconds\":\"%" PRIu64 "\"}\n",
         FIELD_ID, preparation_nanoseconds);

  while (fgets(command, sizeof(command), stdin))
  {
    size_t length = strlen(command);
    char *seed;
    while (length && (command[length - 1] == '\n' || command[length - 1] == '\r'))
      command[--length] = '\0';
    if (!strcmp(command, "CLOSE")) break;
    if (strncmp(command, "RUN ", 4)) return 3;
    seed = command + 4;
    if (!*seed) return 4;
    avma = prepared_stack;
    emit_run(nf, seed);
    avma = prepared_stack;
  }
  pari_close();
  return 0;
}
