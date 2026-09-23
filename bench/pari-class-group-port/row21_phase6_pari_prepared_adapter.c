/*
 * Benchmark-only pristine PARI 2.17.4 prepared adapter for development row 21.
 *
 * nfinit0 is complete before READY. Each RUN restores the prepared PARI stack,
 * installs the requested RNG seed, and clocks exactly bnfinit0(nf, 0). Result
 * inspection, RNG capture and serialization occur after the clock stops.
 */
#include "pari.h"
#include "paripriv.h"

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/resource.h>
#include <time.h>

static const char *FIELD_ID = "5.3.1009349859375.3";

static uint64_t
nanoseconds(struct timespec value)
{
  return (uint64_t)value.tv_sec * UINT64_C(1000000000)
       + (uint64_t)value.tv_nsec;
}

static void
emit_integer(GEN value)
{
  pari_printf("\"%Ps\"", value);
}

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

static void
emit_rng(const char *seed)
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

static void
emit_run(GEN nf, const char *seed)
{
  struct timespec begin, end;
  struct rusage usage;
  GEN bnf, cyc, replay_cyc, replay_class_number;
  long bnfinit0_call_count = 0;
  long index, rank, replay_generators, replay_rank, replay_unit_log_columns;
  long replay_torsion;
  uint64_t elapsed;

  setrand(gp_read_str(seed));
  clock_gettime(CLOCK_MONOTONIC, &begin);
  ++bnfinit0_call_count;
  bnf = bnfinit0(nf, 0, NULL, nbits2prec(192));
  clock_gettime(CLOCK_MONOTONIC, &end);
  if (!bnf) pari_err(e_MISC, "row-21 bnfinit flag zero failed");
  elapsed = nanoseconds(end) - nanoseconds(begin);
  if (!signe(bnf_get_reg(bnf)))
    pari_err(e_MISC, "row-21 bnfinit returned a zero regulator");

  cyc = bnf_get_cyc(bnf);
  rank = nf_get_r1(nf) + nf_get_r2(nf) - 1;
  if (bnfinit0_call_count != 1)
    pari_err(e_MISC, "row-21 bnfinit call count changed");
  getrusage(RUSAGE_SELF, &usage);
  printf("{\"schema\":\"sagejs.pari-class-group/row21-pari-prepared-sample-v2\","
         "\"kernelNanoseconds\":\"%" PRIu64 "\",\"projection\":{", elapsed);
  printf("\"schema\":\"sagejs.pari-class-group/row21-phase6-common-group-structure-projection-v2\","
         "\"scope\":\"exact-abstract-class-and-unit-structure\","
         "\"field\":{\"id\":\"%s\",\"polynomialAscending\":["
         "\"36\",\"930\",\"-305\",\"-90\",\"0\",\"1\"]},", FIELD_ID);
  fputs("\"classGroup\":{\"classNumber\":", stdout);
  emit_integer(bnf_get_no(bnf));
  fputs(",\"invariantFactors\":", stdout);
  emit_canonical_invariants(cyc);
  printf(",\"generatorCount\":\"%ld\"},"
         "\"unitGroup\":{\"rank\":\"%ld\",\"torsionOrder\":\"%ld\"},"
         "\"regulatorEvidence\":\"nonzero-only-not-equal-value\","
         "\"completionMode\":\"flag-zero-class-and-unit-result\"},",
         lg(bnf_get_gen(bnf)) - 1, rank, bnf_get_tuN(bnf));

  /* Re-read and recompute replay facts independently of projection emission. */
  replay_cyc = bnf_get_cyc(bnf);
  replay_class_number = gen_1;
  for (index = 1; index < lg(replay_cyc); ++index)
    replay_class_number = mulii(replay_class_number, gel(replay_cyc, index));
  replay_generators = lg(bnf_get_gen(bnf)) - 1;
  replay_rank = nf_get_r1(bnf_get_nf(bnf)) + nf_get_r2(bnf_get_nf(bnf)) - 1;
  replay_unit_log_columns = lg(bnf_get_logfu(bnf)) - 1;
  replay_torsion = bnf_get_tuN(bnf);
  if (!equalii(replay_class_number, bnf_get_no(bnf)) ||
      replay_unit_log_columns != replay_rank || !signe(bnf_get_reg(bnf)))
    pari_err(e_MISC, "row-21 independent replay failed");
  printf("\"replay\":{"
         "\"schema\":\"sagejs.pari-class-group/row21-phase6-common-group-structure-replay-v1\","
         "\"scope\":\"exact-abstract-class-and-unit-structure\","
         "\"fieldId\":\"%s\",\"classNumber\":", FIELD_ID);
  emit_integer(replay_class_number);
  fputs(",\"invariantFactors\":", stdout);
  emit_canonical_invariants(replay_cyc);
  printf(",\"generatorCount\":\"%ld\",\"unitRank\":\"%ld\","
         "\"torsionOrder\":\"%ld\",\"regulatorNonzero\":true},"
         "\"observedCounters\":{\"classGenerators\":\"%ld\","
         "\"classNumber\":", replay_generators, replay_rank, replay_torsion,
         replay_generators);
  emit_integer(replay_class_number);
  printf(",\"degree\":\"%ld\",\"exactFundamentalUnits\":\"%ld\","
         "\"unitRank\":\"%ld\"},"
         "\"resourceCounters\":{\"bnfinit0CallCount\":\"%ld\","
         "\"mathematicalCalls\":\"%ld\"},\"rng\":",
         nf_get_degree(nf), replay_unit_log_columns, replay_rank,
         bnfinit0_call_count, bnfinit0_call_count);
  emit_rng(seed);
  printf(",\"processMaxRssKiB\":\"%ld\"}\n", usage.ru_maxrss);
  fflush(stdout);
}

int
main(void)
{
  char command[4096];
  struct timespec begin, end;
  GEN nf, version;
  pari_sp prepared_stack;
  uint64_t preparation;

  setvbuf(stdout, NULL, _IONBF, 0);
  pari_init(1200000000, 1000000);
  pari_mt_nbthreads = 1;
  clock_gettime(CLOCK_MONOTONIC, &begin);
  nf = nfinit0(gp_read_str("x^5-90*x^3-305*x^2+930*x+36"),
               0, nbits2prec(192));
  clock_gettime(CLOCK_MONOTONIC, &end);
  if (!nf) return 2;
  preparation = nanoseconds(end) - nanoseconds(begin);
  version = pari_version();
  if (lg(version) != 4 || !equaliu(gel(version, 1), 2) ||
      !equaliu(gel(version, 2), 17) || !equaliu(gel(version, 3), 4)) return 5;
  if (!equalii(nf_get_disc(nf), gp_read_str("-1009349859375"))) return 6;
  if (nf_get_r1(nf) != 3 || nf_get_r2(nf) != 1) return 7;
  prepared_stack = avma;
  printf("READY {\"schema\":1,\"fieldId\":\"%s\","
         "\"pariVersion\":[\"2\",\"17\",\"4\"],"
         "\"precisionBits\":\"192\",\"degree\":\"5\","
         "\"signature\":[\"3\",\"1\"],"
         "\"discriminant\":\"-1009349859375\","
         "\"preparationNanoseconds\":\"%" PRIu64 "\"}\n",
         FIELD_ID, preparation);

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
