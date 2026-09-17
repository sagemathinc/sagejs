/*
 * Untimed pristine-PARI 2.17.4 authority producer for compact panel row 20.
 * This benchmark-only foreign-library adapter makes exactly one flag-one
 * bnfinit0 call. It deliberately emits no timings and no fundamental-unit
 * coordinates: the compact contract matches only representation-neutral
 * class/unit facts, bounded work shape, RNG state, and call provenance.
 */
#include "pari.h"
#include "paripriv.h"

#include <stdio.h>

static void emit_integer(GEN value) { pari_printf("\"%Ps\"", value); }

static void emit_integer_vector(GEN value) {
  long index;
  putchar('[');
  for (index = 1; index < lg(value); index++) {
    if (index > 1) putchar(',');
    emit_integer(gel(value, index));
  }
  putchar(']');
}

static void emit_rng(void) {
  GEN state = getrand();
  long index;
  putchar('[');
  for (index = 0; index < 66; index++) {
    ulong word = *int_W(state, index);
    if (index == 65) word &= 63;
    printf("%s\"%lu\"", index ? "," : "", word);
  }
  putchar(']');
}

int main(void) {
  const long precision = nbits2prec(192);
  GEN version, nf, bnf, cyc, logs, units;
  long factor_base_size, retained_class_rows, log_rows, log_columns;

  setvbuf(stdout, NULL, _IONBF, 0);
  pari_init(768000000, 1000000);
  /* Keep PARI's pristine arithmetic single-threaded inside the 4 GiB cap. */
  pari_mt_nbthreads = 1;
  version = pari_version();
  if (lg(version) != 4 || !equaliu(gel(version, 1), 2) ||
      !equaliu(gel(version, 2), 17) || !equaliu(gel(version, 3), 4)) return 2;

  setrand(gen_1);
  nf = nfinit0(gp_read_str("x^5-5*x-12"), 0, precision);
  if (!nf) return 3;
  bnf = bnfinit0(nf, 1, NULL, precision);
  if (!bnf) return 4;

  cyc = bnf_get_cyc(bnf);
  logs = bnf_get_logfu(bnf);
  units = bnf_get_fu(bnf);
  factor_base_size = lg(gel(bnf, 4)) - 1;
  retained_class_rows = lg(gel(bnf, 1)) - 1;
  log_columns = lg(logs) - 1;
  log_rows = log_columns ? lg(gel(logs, 1)) - 1 : 0;
  if (nf_get_degree(nf) != 5 || nf_get_r1(nf) != 1 || nf_get_r2(nf) != 2 ||
      log_columns != 2 || lg(units) - 1 != 2) return 5;

  fputs("{\"schema\":\"sagejs.pari-class-group/pristine-row20-flag-one-run-v1\",", stdout);
  fputs("\"output\":{\"schema\":\"sagejs.pari-class-group/compact-flag-one-common-output-v1\",", stdout);
  fputs("\"field\":{\"id\":\"5.1.1000000.1\",\"definingPolynomialAscending\":[\"-12\",\"-5\",\"0\",\"0\",\"0\",\"1\"]},", stdout);
  fputs("\"classGroup\":{\"classNumber\":", stdout);
  emit_integer(bnf_get_no(bnf));
  fputs(",\"invariantFactors\":", stdout);
  emit_integer_vector(cyc);
  printf("},\"unitGroup\":{\"rank\":\"%ld\",\"torsionOrder\":\"%ld\",\"materialization\":\"exact_units\"}},",
         nf_get_r1(nf) + nf_get_r2(nf) - 1, bnf_get_tuN(bnf));
  printf("\"work\":{\"schema\":\"sagejs.pari-class-group/pristine-row20-flag-one-work-v1\",\"degree\":\"5\",\"factorBaseSize\":\"%ld\",\"retainedClassRows\":\"%ld\",\"logEmbeddingRows\":\"%ld\",\"logEmbeddingColumns\":\"%ld\",\"expandedUnitCount\":\"%ld\"},",
         factor_base_size, retained_class_rows, log_rows, log_columns, lg(units) - 1);
  fputs("\"rng\":{\"algorithm\":\"pari-xorshift1024star-2.17.4\",\"seed\":\"1\",\"terminalState\":", stdout);
  emit_rng();
  fputs("},\"call\":{\"pariVersion\":[\"2\",\"17\",\"4\"],\"preparation\":\"nfinit0(polynomial,0,nbits2prec(192))\",\"boundary\":\"bnfinit0(prepared_nf,1,NULL,nbits2prec(192))\",\"precisionBits\":\"192\",\"timed\":false}}\n", stdout);
  pari_close();
  return 0;
}
