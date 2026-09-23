/*
 * Benchmark-only pristine PARI 2.17.4 prepared-nf adapter for development
 * rows 0, 1, 3 and 4.  ROW_INDEX is fixed at compilation.  nfinit and all
 * JSON inspection are outside the CLOCK_MONOTONIC bnfinit0(nf,0) interval.
 */
#include "pari.h"
#include "paripriv.h"

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/resource.h>
#include <time.h>

#ifndef ROW_INDEX
#define ROW_INDEX 0
#endif

typedef struct {
  long row;
  const char *field_id;
  const char *polynomial;
  const char *polynomial_ascending_json;
  const char *expected_class_number;
  const char *expected_invariants_json;
  long expected_rank;
} row_spec;

static const row_spec ROWS[] = {
  {0, "pari-2.17.4:x^3-20018*x+20034", "x^3-20018*x+20034",
   "[\"20034\",\"-20018\",\"0\",\"1\"]", "1", "[]", 2},
  {1, "generated-sha256-dec56e7e41f5f60071249da2e66871ed837a3c6e65d821c328e7b4c57adaff3f",
   "x^3-20010*x+20018",
   "[\"20018\",\"-20010\",\"0\",\"1\"]", "3", "[\"3\"]", 2},
  {3, "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9",
   "x^3-20000000022*x+20000000042",
   "[\"20000000042\",\"-20000000022\",\"0\",\"1\"]", "6", "[\"6\"]", 2},
  {4, "generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9",
   "x^3-20000000010*x+20000000018",
   "[\"20000000018\",\"-20000000010\",\"0\",\"1\"]", "2", "[\"2\"]", 2}
};

static uint64_t ns(struct timespec t) {
  return (uint64_t)t.tv_sec * UINT64_C(1000000000) + (uint64_t)t.tv_nsec;
}

static const row_spec *spec(void) {
  size_t i;
  for (i = 0; i < sizeof(ROWS) / sizeof(ROWS[0]); ++i)
    if (ROWS[i].row == ROW_INDEX) return &ROWS[i];
  return NULL;
}

static void emit_integer(GEN x) { pari_printf("\"%Ps\"", x); }

/* PARI stores elementary divisors in source order.  The frozen rows here are
 * cyclic (or trivial), so filtering 1's is also their canonical invariant
 * factor projection. */
static void emit_nontrivial_invariants(GEN cyc) {
  long i;
  int first = 1;
  putchar('[');
  for (i = 1; i < lg(cyc); ++i) if (!is_pm1(gel(cyc, i))) {
    if (!first) putchar(',');
    first = 0;
    emit_integer(gel(cyc, i));
  }
  putchar(']');
}

static void emit_real_triplet(GEN x) {
  long exponent;
  GEN mantissa;
  if (typ(x) == t_COMPLEX) x = gel(x, 1);
  if (typ(x) == t_INT) { pari_printf("[\"%Ps\",\"-1\",\"0\"]", x); return; }
  if (!signe(x)) { fputs("[\"0\",\"-1\",\"0\"]", stdout); return; }
  mantissa = mantissa_real(x, &exponent);
  pari_printf("[\"%Ps\",\"%ld\",\"%ld\"]", mantissa, bit_prec(x), exponent);
}

static void emit_run(GEN nf, const row_spec *row, const char *seed) {
  struct timespec begin, end;
  struct rusage usage;
  GEN bnf, cyc, logs, torsion, fu;
  long rank, log_rows, log_columns;
  uint64_t elapsed;

  setrand(gp_read_str(seed));
  clock_gettime(CLOCK_MONOTONIC, &begin);
  bnf = bnfinit0(nf, 0, NULL, nbits2prec(192));
  clock_gettime(CLOCK_MONOTONIC, &end);
  if (!bnf) pari_err(e_MISC, "phase6 bnfinit0 failed");
  elapsed = ns(end) - ns(begin);
  cyc = bnf_get_cyc(bnf);
  logs = bnf_get_logfu(bnf);
  torsion = algtobasis(nf, bnf_get_tuU(bnf));
  fu = bnf_get_fu_nocheck(bnf);
  rank = nf_get_r1(nf) + nf_get_r2(nf) - 1;
  log_columns = lg(logs) - 1;
  log_rows = log_columns ? lg(gel(logs, 1)) - 1 : 0;
  getrusage(RUSAGE_SELF, &usage);

  printf("{\"schema\":\"sagejs.pari-class-group/row%ld-phase6-pari-sample-v1\","
         "\"kernelNanoseconds\":\"%" PRIu64 "\",\"projection\":{", row->row, elapsed);
  printf("\"schema\":\"sagejs.pari-class-group/row%ld-phase6-common-projection-v1\",", row->row);
  printf("\"field\":{\"id\":\"%s\",\"polynomialAscending\":%s},",
         row->field_id, row->polynomial_ascending_json);
  fputs("\"classGroup\":{\"classNumber\":", stdout); emit_integer(bnf_get_no(bnf));
  fputs(",\"invariantFactors\":", stdout); emit_nontrivial_invariants(cyc);
  printf("},\"unitGroup\":{\"rank\":\"%ld\",\"regulatorPresent\":true,"
         "\"torsionOrder\":\"%ld\"},", rank, bnf_get_tuN(bnf));
  printf("\"work\":{\"degree\":\"%ld\",\"logRows\":\"%ld\","
         "\"logColumns\":\"%ld\"},\"completionMode\":"
         "\"flag-zero-class-and-unit-result\"},", nf_get_degree(nf), log_rows, log_columns);
  fputs("\"detail\":{\"regulatorTriplet\":", stdout); emit_real_triplet(bnf_get_reg(bnf));
  printf(",\"flagZeroStatus\":\"%s\"",
         typ(fu) == t_MAT && lg(fu) == 1 ? "not_given(LARGE)" : "materialized");
  fputs(",\"torsionGeneratorPowerBasis\":[", stdout);
  for (long i = 1; i < lg(torsion); ++i) {
    if (i > 1) putchar(','); emit_integer(gel(torsion, i));
  }
  printf("],\"expectedClassNumber\":\"%s\",\"expectedInvariants\":%s},"
         "\"processMaxRssKiB\":\"%ld\"}\n",
         row->expected_class_number, row->expected_invariants_json, usage.ru_maxrss);
  fflush(stdout);
}

int main(void) {
  char command[4096];
  struct timespec begin, end;
  GEN nf, version;
  pari_sp prepared_stack;
  uint64_t preparation;
  const row_spec *row = spec();
  if (!row) return 7;
  setvbuf(stdout, NULL, _IONBF, 0);
  pari_init(1200000000, 1000000);
  pari_mt_nbthreads = 1;
  clock_gettime(CLOCK_MONOTONIC, &begin);
  nf = nfinit0(gp_read_str(row->polynomial), 0, nbits2prec(192));
  clock_gettime(CLOCK_MONOTONIC, &end);
  if (!nf) return 2;
  preparation = ns(end) - ns(begin);
  version = pari_version();
  if (lg(version) != 4 || !equaliu(gel(version, 1), 2) ||
      !equaliu(gel(version, 2), 17) || !equaliu(gel(version, 3), 4)) return 5;
  prepared_stack = avma;
  printf("READY {\"schema\":1,\"row\":%ld,\"fieldId\":\"%s\","
         "\"pariVersion\":[\"2\",\"17\",\"4\"],\"precisionBits\":\"192\","
         "\"preparationNanoseconds\":\"%" PRIu64 "\"}\n",
         row->row, row->field_id, preparation);
  while (fgets(command, sizeof(command), stdin)) {
    size_t length = strlen(command);
    char *seed;
    while (length && (command[length-1] == '\n' || command[length-1] == '\r'))
      command[--length] = '\0';
    if (!strcmp(command, "CLOSE")) break;
    if (strncmp(command, "RUN ", 4)) return 3;
    seed = command + 4; if (!*seed) return 4;
    avma = prepared_stack; emit_run(nf, row, seed); avma = prepared_stack;
  }
  pari_close();
  return 0;
}
