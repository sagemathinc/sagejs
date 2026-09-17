/*
 * Benchmark-only driver for the instrumented PARI 2.17.4 derivative.
 *
 * Keep the authority serializer byte-for-byte shared with the pristine PARI
 * adapter.  Only bnfinit0 is interposed, and only to bracket its complete
 * prepared-nf kernel with an external monotonic clock and the derivative's
 * exclusive stage clock.
 */

#include "pari.h"

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifdef SAGEJS_PRISTINE_CONTROL
static void sagejs_buchall_stage_clock_reset(int enabled) { (void)enabled; }
static void sagejs_buchall_stage_clock_finish(void) {}
static uint64_t sagejs_buchall_stage_clock_total(int stage)
{ (void)stage; return 0; }
static uint64_t sagejs_buchall_stage_clock_visits(int stage)
{ (void)stage; return 0; }
static int sagejs_buchall_stage_clock_monotonic(void) { return 1; }
static int sagejs_buchall_stage_clock_segments_complete(void) { return 1; }
static uint64_t sagejs_buchall_stage_clock_segment_count(void) { return 0; }
static int sagejs_buchall_stage_clock_segment_stage(uint64_t index)
{ (void)index; return -1; }
static uint64_t sagejs_buchall_stage_clock_segment_nanoseconds(uint64_t index)
{ (void)index; return 0; }
#else
extern void sagejs_buchall_stage_clock_reset(int enabled);
extern void sagejs_buchall_stage_clock_finish(void);
extern uint64_t sagejs_buchall_stage_clock_total(int stage);
extern uint64_t sagejs_buchall_stage_clock_visits(int stage);
extern int sagejs_buchall_stage_clock_monotonic(void);
extern int sagejs_buchall_stage_clock_segments_complete(void);
extern uint64_t sagejs_buchall_stage_clock_segment_count(void);
extern int sagejs_buchall_stage_clock_segment_stage(uint64_t index);
extern uint64_t sagejs_buchall_stage_clock_segment_nanoseconds(uint64_t index);
#endif

static int sagejs_clock_enabled;
static uint64_t sagejs_kernel_nanoseconds;

static uint64_t
sagejs_nanoseconds(struct timespec value)
{
  return (uint64_t)value.tv_sec * UINT64_C(1000000000)
       + (uint64_t)value.tv_nsec;
}

static GEN sagejs_timed_bnfinit0(GEN, long, GEN, long);

/* Reuse the exact authority output implementation. */
#define bnfinit0 sagejs_timed_bnfinit0
#define main sagejs_pristine_adapter_main_not_used
#include "../pari_h1_outcome_c_adapter.c"
#undef main
#undef bnfinit0

static GEN
sagejs_timed_bnfinit0(GEN nf, long flag, GEN data, long prec)
{
  struct timespec begin, end;
  GEN result;
  clock_gettime(CLOCK_MONOTONIC, &begin);
  sagejs_buchall_stage_clock_reset(sagejs_clock_enabled);
  result = bnfinit0(nf, flag, data, prec);
  sagejs_buchall_stage_clock_finish();
  clock_gettime(CLOCK_MONOTONIC, &end);
  sagejs_kernel_nanoseconds = sagejs_nanoseconds(end) - sagejs_nanoseconds(begin);
  return result;
}

static void
sagejs_emit_timing(int enabled)
{
  static const char *stage_names[] = {
    "relation-retry",
    "sparse-hnf-snf-transform",
    "unit-regulator",
    "honesty-generators-final",
    "unattributed-remainder"
  };
  uint64_t total = 0;
  uint64_t segment, segment_count;
  int stage;
  for (stage = 0; stage < 5; stage++)
    total += sagejs_buchall_stage_clock_total(stage);
  printf("{\"schema\":\"sagejs.pari-class-group/pari-stage-clock-sample-v2\","
         "\"clockEnabled\":%s,\"kernelNanoseconds\":\"%" PRIu64 "\","
         "\"inclusiveRootNanoseconds\":\"%" PRIu64 "\","
         "\"monotonic\":%s,\"stageTotalsNanoseconds\":{"
         "\"relation-retry\":\"%" PRIu64 "\","
         "\"sparse-hnf-snf-transform\":\"%" PRIu64 "\","
         "\"unit-regulator\":\"%" PRIu64 "\","
         "\"honesty-generators-final\":\"%" PRIu64 "\","
         "\"unattributed-remainder\":\"%" PRIu64 "\"},"
         "\"stageVisits\":{"
         "\"relation-retry\":\"%" PRIu64 "\","
         "\"sparse-hnf-snf-transform\":\"%" PRIu64 "\","
         "\"unit-regulator\":\"%" PRIu64 "\","
         "\"honesty-generators-final\":\"%" PRIu64 "\","
         "\"unattributed-remainder\":\"%" PRIu64 "\"},"
         "\"orderedSegmentsComplete\":%s,\"orderedSegments\":[",
         enabled ? "true" : "false", sagejs_kernel_nanoseconds, total,
         sagejs_buchall_stage_clock_monotonic() ? "true" : "false",
         sagejs_buchall_stage_clock_total(0),
         sagejs_buchall_stage_clock_total(1),
         sagejs_buchall_stage_clock_total(2),
         sagejs_buchall_stage_clock_total(3),
         sagejs_buchall_stage_clock_total(4),
         sagejs_buchall_stage_clock_visits(0),
         sagejs_buchall_stage_clock_visits(1),
         sagejs_buchall_stage_clock_visits(2),
         sagejs_buchall_stage_clock_visits(3),
         sagejs_buchall_stage_clock_visits(4),
         sagejs_buchall_stage_clock_segments_complete() ? "true" : "false");
  segment_count = enabled ? sagejs_buchall_stage_clock_segment_count() : 0;
  for (segment = 0; segment < segment_count; segment++)
  {
    stage = sagejs_buchall_stage_clock_segment_stage(segment);
    if (segment) putchar(',');
    printf("{\"stage\":\"%s\",\"nanoseconds\":\"%" PRIu64 "\"}",
           stage >= 0 && stage < 5 ? stage_names[stage] : "invalid",
           sagejs_buchall_stage_clock_segment_nanoseconds(segment));
  }
  printf("]}\n");
  fflush(stdout);
}

int
main(void)
{
  char command[4096];
  GEN polynomial, nf, version;
  pari_sp prepared_stack;

  setvbuf(stdout, NULL, _IONBF, 0);
  pari_init(768000000, 1000000);
  polynomial = gp_read_str("x^3-20018*x+20034");
  nf = nfinit0(polynomial, 0, nbits2prec(192));
  if (!nf) return 2;
  version = pari_version();
  if (lg(version) != 4 || !equaliu(gel(version, 1), 2) ||
      !equaliu(gel(version, 2), 17) || !equaliu(gel(version, 3), 4)) return 5;
  prepared_stack = avma;
  printf("READY {\"schema\":1,\"fieldId\":\"%s\","
         "\"pariVersion\":[\"2\",\"17\",\"4\"],"
         "\"precisionBits\":\"192\",\"stageClockSchema\":2}\n", FIELD_ID);

  while (fgets(command, sizeof(command), stdin))
  {
    size_t length = strlen(command);
    char *seed;
    while (length && (command[length - 1] == '\n' || command[length - 1] == '\r'))
      command[--length] = '\0';
    if (!strcmp(command, "CLOSE")) break;
    if (!strncmp(command, "RUN ACTIVE ", 11))
    {
      sagejs_clock_enabled = 1;
      seed = command + 11;
    }
    else if (!strncmp(command, "RUN INACTIVE ", 13))
    {
      sagejs_clock_enabled = 0;
      seed = command + 13;
    }
    else return 3;
    if (!*seed) return 4;
    avma = prepared_stack;
    emit_run(nf, seed);
    sagejs_emit_timing(sagejs_clock_enabled);
    avma = prepared_stack;
  }
  pari_close();
  return 0;
}
