"""The dominant harmonic-cubic loop from the 80-digit mpmath benchmark."""

import os
from time import perf_counter

from mpmath import mp


mp.dps = 80


def harmonic_cubic(terms):
    total = mp.mpf('0')
    for denominator in range(1, terms + 1):
        total += 1 / mp.mpf(denominator) ** 3
    return total


terms = int(os.environ.get('SAGEJS_MPMATH_AOT_TERMS', '400'))
warmups = int(os.environ.get('SAGEJS_MPMATH_AOT_WARMUPS', '10'))
repetitions = int(os.environ.get('SAGEJS_MPMATH_AOT_REPETITIONS', '100'))

for _warmup in range(warmups):
    answer = harmonic_cubic(terms)

started = perf_counter()
for _iteration in range(repetitions):
    answer = harmonic_cubic(terms)
elapsed = perf_counter() - started

print('RESULT', mp.nstr(answer, 60), elapsed / repetitions)
