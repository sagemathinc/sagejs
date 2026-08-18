#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#include "smalljac.h"

static int print_lpoly(smalljac_curve_t curve, uint64_t q, int good,
                       int64_t coefficients[], int count, void *context) {
  int i;
  (void)curve;
  (void)context;
  printf("%" PRIu64 " %d", q, good);
  for (i = 0; i < count; i += 1) printf(" %" PRId64, coefficients[i]);
  putchar('\n');
  return 1;
}

int main(int argc, char *argv[]) {
  char *end = NULL;
  uint64_t start;
  uint64_t stop;
  int error = 0;
  int64_t result;
  smalljac_curve_t curve;

  if (argc != 4) {
    fprintf(stderr, "usage: %s CURVE START END\n", argv[0]);
    return 2;
  }
  errno = 0;
  start = strtoull(argv[2], &end, 10);
  if (errno || !end || *end) return 2;
  errno = 0;
  stop = strtoull(argv[3], &end, 10);
  if (errno || !end || *end) return 2;

  curve = smalljac_curve_init(argv[1], &error);
  if (!curve) {
    fprintf(stderr, "smalljac_curve_init failed: %d\n", error);
    return 1;
  }
  result = smalljac_Lpolys(curve, start, stop, 0, print_lpoly, NULL);
  smalljac_curve_clear(curve);
  if (result < 0) {
    fprintf(stderr, "smalljac_Lpolys failed: %" PRId64 "\n", result);
    return 1;
  }
  return 0;
}
