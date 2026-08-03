#ifndef SAGEJS_PRIME_COUNT_H
#define SAGEJS_PRIME_COUNT_H

#include <stdint.h>

/* Return 1 on success and 0 if a working table cannot be allocated. */
int sagejs_prime_pi(uint64_t x, uint64_t *result);

#endif
