/*
 * Benchmark-only pristine PARI 2.17.4 prepared adapter for development row 23.
 *
 * nfinit is constructed once before READY.  Each RUN restores the prepared
 * stack, installs the requested deterministic RNG seed, and times exactly
 * bnfinit0(nf, 0).  Projection and serialization are outside the clock.
 */
#include "pari.h"
#include "paripriv.h"

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/resource.h>
#include <time.h>

static const char *FIELD_ID = "5.5.1002836007889.1";

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
  struct rusage usage;
  GEN bnf, cyc;
  long rank;
  uint64_t elapsed;

  setrand(gp_read_str(seed));
  clock_gettime(CLOCK_MONOTONIC, &begin);
  bnf = bnfinit0(nf, 0, NULL, nbits2prec(192));
  clock_gettime(CLOCK_MONOTONIC, &end);
  if (!bnf) pari_err(e_MISC, "row-23 bnfinit flag zero failed");
  elapsed = nanoseconds(end) - nanoseconds(begin);
  if (!signe(bnf_get_reg(bnf)))
    pari_err(e_MISC, "row-23 bnfinit returned a zero regulator");

  cyc = bnf_get_cyc(bnf);
  rank = nf_get_r1(nf) + nf_get_r2(nf) - 1;
  getrusage(RUSAGE_SELF, &usage);

  printf("{\"schema\":\"sagejs.pari-class-group/row23-pari-prepared-sample-v1\"," 
         "\"kernelNanoseconds\":\"%" PRIu64 "\",\"projection\":{", elapsed);
  printf("\"schema\":\"sagejs.pari-class-group/row23-phase6-common-projection-v1\"," 
         "\"field\":{\"id\":\"%s\",\"polynomialAscending\":["
         "\"341\",\"-970\",\"772\",\"-141\",\"-2\",\"1\"]},",
         FIELD_ID);
  fputs("\"classGroup\":{\"classNumber\":", stdout);
  emit_integer(bnf_get_no(bnf));
  fputs(",\"invariantFactors\":", stdout);
  emit_integer_vector(cyc);
  printf("},\"unitGroup\":{\"rank\":\"%ld\","
         "\"regulatorPresent\":true,\"torsionOrder\":\"%ld\"},"
         "\"completionMode\":\"flag-zero-class-and-unit-result\"},"
         "\"rng\":", rank, bnf_get_tuN(bnf));
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
  pari_init(1200000000, 1000000);
  pari_mt_nbthreads = 1;
  polynomial = gp_read_str("x^5-2*x^4-141*x^3+772*x^2-970*x+341");
  clock_gettime(CLOCK_MONOTONIC, &begin);
  nf = nfinit0(polynomial, 0, nbits2prec(192));
  clock_gettime(CLOCK_MONOTONIC, &end);
  if (!nf) return 2;
  preparation_nanoseconds = nanoseconds(end) - nanoseconds(begin);
  version = pari_version();
  if (lg(version) != 4 || !equaliu(gel(version, 1), 2) ||
      !equaliu(gel(version, 2), 17) || !equaliu(gel(version, 3), 4)) return 5;
  if (!equalii(nf_get_disc(nf), gp_read_str("1002836007889"))) return 6;
  if (nf_get_r1(nf) != 5 || nf_get_r2(nf) != 0) return 7;
  prepared_stack = avma;
  printf("READY {\"schema\":1,\"fieldId\":\"%s\","
         "\"pariVersion\":[\"2\",\"17\",\"4\"],"
         "\"precisionBits\":\"192\",\"degree\":\"5\","
         "\"signature\":[\"5\",\"0\"],"
         "\"discriminant\":\"1002836007889\","
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
