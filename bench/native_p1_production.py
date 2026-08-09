"""Benchmark the public higher-weight P1 Hecke route against its FLINT oracle.

The presentation and packed inputs are intentionally cached for both paths.
Each timed production call discards only the resulting Hecke matrix, so the
measurement includes the isolated typed kernel, exact output materialization,
and public Matrix construction without measuring presentation construction.
"""

import os
import statistics
import time

from sagejs.kernels.p1 import heilbronn_higher_weight_hecke_fill
from sagejs.native import is_compiled


level = int(os.environ.get('SAGEJS_NATIVE_P1_LEVEL', '11'))
weight = int(os.environ.get('SAGEJS_NATIVE_P1_ACTION_WEIGHT', '4'))
sign = int(os.environ.get('SAGEJS_NATIVE_P1_SIGN', '0'))
prime = int(os.environ.get('SAGEJS_NATIVE_P1_PRESENTATION_PRIME', '101'))
repetitions = int(
    os.environ.get('SAGEJS_NATIVE_P1_PRODUCTION_REPETITIONS', '20'))
samples = int(os.environ.get('SAGEJS_NATIVE_P1_PRODUCTION_SAMPLES', '7'))

line = P1List(level)
presentation = line.higher_weight_presentation(weight, sign)
typed = line.higher_weight_hecke_matrix(weight, sign, prime)
oracle = line._higher_weight_hecke_matrix_flint(
    weight, sign, prime, presentation)
if typed != oracle:
    raise AssertionError('production typed P1 result differs from FLINT')

production_samples = []
flint_samples = []
for _sample in range(samples):
    start = time.perf_counter_ns()
    for _repetition in range(repetitions):
        line._higher_weight_hecke_cache.clear()
        typed = line.higher_weight_hecke_matrix(weight, sign, prime)
    production_samples.append(
        (time.perf_counter_ns() - start) / repetitions)

    start = time.perf_counter_ns()
    for _repetition in range(repetitions):
        oracle = line._higher_weight_hecke_matrix_flint(
            weight, sign, prime, presentation)
    flint_samples.append(
        (time.perf_counter_ns() - start) / repetitions)

production = int(statistics.median(production_samples))
flint = int(statistics.median(flint_samples))
print(
    'PRODUCTION|'
    + str(level) + '|'
    + str(weight) + '|'
    + str(sign) + '|'
    + str(prime) + '|'
    + str(is_compiled(heilbronn_higher_weight_hecke_fill)) + '|'
    + str(typed == oracle) + '|'
    + str(production) + '|'
    + str(flint) + '|'
    + str(samples) + '|'
    + str(repetitions))
