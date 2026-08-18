#include <errno.h>
#include <stdio.h>
#include <stdlib.h>

#include "smalljac.h"

static int print_lpoly(smalljac_curve_t curve, unsigned long q, int good,
                       long coefficients[], int count, void *context) {
  int i;
  (void)curve;
  (void)context;
  printf("%lu %d", q, good);
  for (i = 0; i < count; i += 1) printf(" %ld", coefficients[i]);
  putchar('\n');
  return 1;
}

int main(int argc, char *argv[]) {
  char *end = NULL;
  unsigned long start;
  unsigned long stop;
  int error = 0;
  long result;
  smalljac_curve_t curve;

  if (argc != 4) {
    fprintf(stderr, "usage: %s CURVE START END\n", argv[0]);
    return 2;
  }
  errno = 0;
  start = strtoul(argv[2], &end, 10);
  if (errno || !end || *end) return 2;
  errno = 0;
  stop = strtoul(argv[3], &end, 10);
  if (errno || !end || *end) return 2;

  curve = smalljac_curve_init(argv[1], &error);
  if (!curve) {
    fprintf(stderr, "smalljac_curve_init failed: %d\n", error);
    return 1;
  }
  result = smalljac_Lpolys(curve, start, stop, 0, print_lpoly, NULL);
  smalljac_curve_clear(curve);
  if (result < 0) {
    fprintf(stderr, "smalljac_Lpolys failed: %ld\n", result);
    return 1;
  }
  return 0;
}
