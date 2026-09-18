/*
 * Generic, untimed pristine-PARI 2.17.4 flag-one producer for one exact
 * manifest-selected development field.  The JavaScript orchestrator
 * authenticates the field and prepared-input authority before invoking this
 * program.  This program accepts only decimal coefficients plus the expected
 * signature, makes one nfinit0/bnfinit0 call, and emits no timings.
 */
#include "pari.h"
#include "paripriv.h"

#include <stdio.h>
#include <stdlib.h>

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

static long decimal_long(const char *text) {
  char *end = NULL;
  long value = strtol(text, &end, 10);
  if (!text[0] || !end || *end) return -1;
  return value;
}

int main(int argc, char **argv) {
  const long precision = nbits2prec(192);
  GEN version, coefficients, polynomial, nf, bnf, cyc, logs, units;
  long degree, r1, r2, coefficient_count, index;
  long factor_base_size, retained_class_rows, log_rows, log_columns;

  if (argc < 6) return 2;
  degree = decimal_long(argv[1]);
  r1 = decimal_long(argv[2]);
  r2 = decimal_long(argv[3]);
  coefficient_count = decimal_long(argv[4]);
  if (degree < 1 || r1 < 0 || r2 < 0 || coefficient_count != degree + 1 ||
      argc != coefficient_count + 5 || r1 + 2 * r2 != degree) return 2;

  setvbuf(stdout, NULL, _IONBF, 0);
  pari_init(768000000, 1000000);
  pari_mt_nbthreads = 1;
  version = pari_version();
  if (lg(version) != 4 || !equaliu(gel(version, 1), 2) ||
      !equaliu(gel(version, 2), 17) || !equaliu(gel(version, 3), 4)) return 3;

  coefficients = cgetg(coefficient_count + 1, t_VEC);
  for (index = 1; index <= coefficient_count; index++) {
    gel(coefficients, index) = gp_read_str(argv[index + 4]);
    if (typ(gel(coefficients, index)) != t_INT) return 2;
  }
  polynomial = gtopolyrev(coefficients, 0);

  setrand(gen_1);
  nf = nfinit0(polynomial, 0, precision);
  if (!nf) return 4;
  if (nf_get_degree(nf) != degree || nf_get_r1(nf) != r1 ||
      nf_get_r2(nf) != r2) {
    pari_fprintf(stderr, "polynomial=%Ps\n", polynomial);
    fprintf(stderr, "signature mismatch: got degree=%ld r1=%ld r2=%ld\n",
            nf_get_degree(nf), nf_get_r1(nf), nf_get_r2(nf));
    return 5;
  }
  bnf = bnfinit0(nf, 1, NULL, precision);
  if (!bnf) return 6;

  cyc = bnf_get_cyc(bnf);
  logs = bnf_get_logfu(bnf);
  units = bnf_get_fu(bnf);
  factor_base_size = lg(gel(bnf, 4)) - 1;
  retained_class_rows = lg(gel(bnf, 1)) - 1;
  log_columns = lg(logs) - 1;
  log_rows = log_columns ? lg(gel(logs, 1)) - 1 : 0;
  if (log_columns != r1 + r2 - 1 || lg(units) - 1 != log_columns) return 7;

  fputs("{\"schema\":\"sagejs.pari-class-group/pristine-development-flag-one-run-v1\",", stdout);
  fputs("\"classGroup\":{\"classNumber\":", stdout);
  emit_integer(bnf_get_no(bnf));
  fputs(",\"invariantFactors\":", stdout);
  emit_integer_vector(cyc);
  printf("},\"unitGroup\":{\"rank\":\"%ld\",\"torsionOrder\":\"%ld\",\"materialization\":\"exact_units\"},",
         r1 + r2 - 1, bnf_get_tuN(bnf));
  printf("\"work\":{\"degree\":\"%ld\",\"factorBaseSize\":\"%ld\",\"retainedClassRows\":\"%ld\",\"logEmbeddingRows\":\"%ld\",\"logEmbeddingColumns\":\"%ld\",\"expandedUnitCount\":\"%ld\"},",
         degree, factor_base_size, retained_class_rows, log_rows, log_columns,
         lg(units) - 1);
  fputs("\"rng\":{\"algorithm\":\"pari-xorshift1024star-2.17.4\",\"seed\":\"1\",\"terminalState\":", stdout);
  emit_rng();
  fputs("},\"call\":{\"pariVersion\":[\"2\",\"17\",\"4\"],\"preparation\":\"nfinit0(polynomial,0,nbits2prec(192))\",\"boundary\":\"bnfinit0(prepared_nf,1,NULL,nbits2prec(192))\",\"precisionBits\":\"192\",\"timed\":false}}\n", stdout);
  pari_close();
  return 0;
}
