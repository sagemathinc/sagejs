/*
 * Benchmark-only PARI 2.17.4 foreign-library adapter for the authentic h=1
 * Outcome-C boundary.  This is not a Sage.js mathematical implementation.
 *
 * The process prepares nfinit once, prints READY, and then accepts RUN lines.
 * Each RUN resets PARI's stack and RNG, executes bnfinit(nf, 0), emits the
 * complete standardized result/work/RNG record, and restores the prepared nf.
 */
#include "pari.h"
#include "paripriv.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *FIELD_ID = "pari-2.17.4:x^3-20018*x+20034";

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

static void emit_real_triplet(GEN value) {
  long exponent;
  GEN mantissa;
  if (typ(value) == t_COMPLEX) value = gel(value, 1);
  if (typ(value) == t_INT) {
    pari_printf("[\"%Ps\",\"-1\",\"0\"]", value);
    return;
  }
  if (!signe(value)) {
    fputs("[\"0\",\"-1\",\"0\"]", stdout);
    return;
  }
  mantissa = mantissa_real(value, &exponent);
  pari_printf("[\"%Ps\",\"%ld\",\"%ld\"]", mantissa, bit_prec(value), exponent);
}

static void emit_real_matrix(GEN value) {
  long column, row;
  int first = 1;
  putchar('[');
  for (column = 1; column < lg(value); column++) {
    for (row = 1; row < lg(gel(value, column)); row++) {
      if (!first) putchar(',');
      first = 0;
      emit_real_triplet(gcoeff(value, row, column));
    }
  }
  putchar(']');
}

static void emit_rng(const char *seed) {
  GEN state = getrand();
  int index;
  printf("{\"algorithm\":\"pari-xorshift1024star-2.17.4\",\"seed\":\"%s\",\"terminalState\":[", seed);
  for (index = 0; index < 66; index++) {
    ulong word = *int_W(state, index);
    if (index == 65) word &= 63;
    printf("%s\"%lu\"", index ? "," : "", word);
  }
  fputs("]}", stdout);
}

static void emit_run(GEN nf, const char *seed) {
  long rank = nf_get_r1(nf) + nf_get_r2(nf) - 1;
  long degree = nf_get_degree(nf);
  long factor_base_size, log_rows, log_columns;
  GEN bnf, cyc, logs, torsion_basis;

  setrand(gp_read_str(seed));
  bnf = bnfinit0(nf, 0, NULL, nbits2prec(192));
  if (!bnf) pari_err(e_MISC, "bnfinit flag zero failed");
  cyc = bnf_get_cyc(bnf);
  logs = bnf_get_logfu(bnf);
  torsion_basis = algtobasis(nf, bnf_get_tuU(bnf));
  factor_base_size = lg(gel(bnf, 4)) - 1;
  log_columns = lg(logs) - 1;
  log_rows = log_columns ? lg(gel(logs, 1)) - 1 : 0;

  printf("{\"result\":{");
  printf("\"schema\":\"sagejs.pari-class-group/h1-correspondence-result-v1\",");
  printf("\"field\":{\"id\":\"%s\",\"polynomialAscending\":[\"20034\",\"-20018\",\"0\",\"1\"]},", FIELD_ID);
  fputs("\"classGroup\":{\"classNumber\":", stdout);
  emit_integer(bnf_get_no(bnf));
  fputs(",\"invariantFactors\":", stdout);
  emit_integer_vector(cyc);
  fputs(",\"generatorIdeals\":[]},", stdout);
  printf("\"unitGroupCorrespondence\":{\"rank\":\"%ld\",", rank);
  printf("\"logEmbeddingShape\":[\"%ld\",\"%ld\"],\"logEmbeddingColumnMajor\":", log_rows, log_columns);
  emit_real_matrix(logs);
  fputs(",\"regulatorTriplet\":", stdout);
  emit_real_triplet(bnf_get_reg(bnf));
  printf(",\"torsionOrder\":\"%ld\",\"torsionGeneratorPowerBasis\":", bnf_get_tuN(bnf));
  emit_integer_vector(torsion_basis);
  fputs(",\"expandedFundamentalUnits\":null},", stdout);
  fputs("\"assumptions\":{\"scope\":\"internal-PARI-correspondence-only\",\"pariCorrespondenceAssumed\":true,\"independentUnitIndexOne\":false},", stdout);
  fputs("\"terminal\":{\"status\":\"pari-correspondence-complete-internal-h1\",\"correspondenceComplete\":true,\"publicComplete\":false}}", stdout);

  printf(",\"work\":{\"schema\":\"sagejs.pari-class-group/h1-source-work-v1\",\"degree\":\"%ld\",", degree);
  printf("\"factorBaseSize\":\"%ld\",\"retainedClassRows\":\"%ld\",", factor_base_size, lg(gel(bnf, 1)) - 1);
  printf("\"logEmbeddingRows\":\"%ld\",\"logEmbeddingColumns\":\"%ld\"}", log_rows, log_columns);
  fputs(",\"rng\":", stdout);
  emit_rng(seed);
  fputs("}\n", stdout);
  fflush(stdout);
}

int main(void) {
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
  printf("READY {\"schema\":1,\"fieldId\":\"%s\",\"pariVersion\":[\"2\",\"17\",\"4\"],\"precisionBits\":\"192\"}\n", FIELD_ID);

  while (fgets(command, sizeof(command), stdin)) {
    size_t length = strlen(command);
    char *seed;
    while (length && (command[length - 1] == '\n' || command[length - 1] == '\r')) {
      command[--length] = '\0';
    }
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
