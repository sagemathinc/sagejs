/*
 * Reusable pristine PARI 2.17.4 prepared-nf timing helper.
 *
 * The JavaScript wrapper admits only reviewed frozen field specifications and
 * passes one specification on argv.  nfinit is complete before READY.  Each
 * RUN restores the prepared PARI stack, resets the RNG, and clocks exactly
 * bnfinit0(nf, 0); inspection and JSON output are outside that interval.
 */
#include "pari.h"
#include "paripriv.h"

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <time.h>

static uint64_t nanoseconds(struct timespec value)
{
  return (uint64_t)value.tv_sec * UINT64_C(1000000000)
       + (uint64_t)value.tv_nsec;
}

static void emit_integer(GEN value) { pari_printf("\"%Ps\"", value); }

/* PARI returns elementary divisors in source order.  Reverse the nontrivial
 * entries to publish canonical invariant factors d_1 | ... | d_r. */
static void emit_canonical_invariants(GEN value)
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

static void emit_rng(const char *seed)
{
  GEN state = getrand();
  int index;
  printf("{\"algorithm\":\"pari-xorshift1024star-2.17.4\","
         "\"seed\":\"%s\",\"terminalState\":[", seed);
  for (index = 0; index < 66; ++index)
  {
    ulong word = *int_W(state, index);
    if (index == 65) word &= 63;
    printf("%s\"%lu\"", index ? "," : "", word);
  }
  fputs("]}", stdout);
}

static void emit_run(GEN nf, long row, const char *field_id,
                     const char *polynomial_json, const char *seed)
{
  struct timespec begin, end;
  struct rusage usage;
  GEN bnf, cyc, generators, logs, fu;
  long rank, log_rows, log_columns;
  uint64_t elapsed;

  setrand(gp_read_str(seed));
  clock_gettime(CLOCK_MONOTONIC, &begin);
  bnf = bnfinit0(nf, 0, NULL, nbits2prec(192));
  clock_gettime(CLOCK_MONOTONIC, &end);
  if (!bnf) pari_err(e_MISC, "generic Phase-6 bnfinit0 failed");
  elapsed = nanoseconds(end) - nanoseconds(begin);

  cyc = bnf_get_cyc(bnf);
  generators = bnf_get_gen(bnf);
  logs = bnf_get_logfu(bnf);
  fu = bnf_get_fu_nocheck(bnf);
  rank = nf_get_r1(nf) + nf_get_r2(nf) - 1;
  log_columns = lg(logs) - 1;
  log_rows = log_columns ? lg(gel(logs, 1)) - 1 : 0;
  getrusage(RUSAGE_SELF, &usage);

  printf("{\"schema\":\"sagejs.pari-class-group/generic-phase6-pari-prepared-sample-v1\","
         "\"row\":%ld,\"kernelNanoseconds\":\"%" PRIu64 "\","
         "\"projection\":{\"schema\":\"sagejs.pari-class-group/row%ld-phase6-neutral-exact-projection-v1\","
         "\"field\":{\"id\":\"%s\",\"polynomialAscending\":%s},"
         "\"classGroup\":{\"classNumber\":", row, elapsed, row,
         field_id, polynomial_json);
  emit_integer(bnf_get_no(bnf));
  fputs(",\"invariantFactors\":", stdout);
  emit_canonical_invariants(cyc);
  printf(",\"generatorCount\":\"%ld\"},"
         "\"unitGroup\":{\"rank\":\"%ld\",\"regulatorPresent\":%s,"
         "\"torsionOrder\":\"%ld\"},"
         "\"completionMode\":\"flag-zero-class-and-unit-result\"},"
         "\"detail\":{\"degree\":\"%ld\",\"signature\":[\"%ld\",\"%ld\"],"
         "\"discriminant\":", lg(generators) - 1, rank,
         signe(bnf_get_reg(bnf)) ? "true" : "false", bnf_get_tuN(bnf),
         nf_get_degree(nf), nf_get_r1(nf), nf_get_r2(nf));
  emit_integer(nf_get_disc(nf));
  printf(",\"factorBaseSize\":\"%ld\",\"logRows\":\"%ld\","
         "\"logColumns\":\"%ld\",\"flagZeroFundamentalUnits\":{"
         "\"pariType\":\"%ld\",\"logicalLength\":\"%ld\","
         "\"status\":\"%s\"}},\"rng\":",
         lg(gel(bnf, 5)) - 1, log_rows, log_columns, typ(fu), lg(fu) - 1,
         typ(fu) == t_MAT && lg(fu) == 1 ? "not_given(LARGE)" : "materialized");
  emit_rng(seed);
  printf(",\"processMaxRssKiB\":\"%ld\"}\n", usage.ru_maxrss);
  fflush(stdout);
}

int main(int argc, char **argv)
{
  char command[4096];
  struct timespec begin, end;
  GEN nf, version;
  pari_sp prepared_stack;
  uint64_t preparation;
  long row;

  if (argc != 7) return 7;
  row = strtol(argv[1], NULL, 10);
  setvbuf(stdout, NULL, _IONBF, 0);
  pari_init(1200000000, 1000000);
  pari_mt_nbthreads = 1;
  clock_gettime(CLOCK_MONOTONIC, &begin);
  nf = nfinit0(gp_read_str(argv[3]), 0, nbits2prec(192));
  clock_gettime(CLOCK_MONOTONIC, &end);
  if (!nf) return 2;
  preparation = nanoseconds(end) - nanoseconds(begin);
  version = pari_version();
  if (lg(version) != 4 || !equaliu(gel(version, 1), 2) ||
      !equaliu(gel(version, 2), 17) || !equaliu(gel(version, 3), 4)) return 5;
  if (!equalii(nf_get_disc(nf), gp_read_str(argv[5]))) return 6;
  if (nf_get_degree(nf) != strtol(argv[6], NULL, 10)) return 8;
  prepared_stack = avma;
  printf("READY {\"schema\":1,\"row\":%ld,\"fieldId\":\"%s\","
         "\"pariVersion\":[\"2\",\"17\",\"4\"],\"precisionBits\":\"192\","
         "\"degree\":\"%ld\",\"signature\":[\"%ld\",\"%ld\"],"
         "\"discriminant\":", row, argv[2], nf_get_degree(nf),
         nf_get_r1(nf), nf_get_r2(nf));
  emit_integer(nf_get_disc(nf));
  printf(",\"preparationNanoseconds\":\"%" PRIu64 "\"}\n", preparation);

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
    emit_run(nf, row, argv[2], argv[4], seed);
    avma = prepared_stack;
  }
  pari_close();
  return 0;
}
