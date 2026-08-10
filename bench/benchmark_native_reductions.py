"""Warm whole-call benchmark for Compiled Python v20 exact reductions."""

from __future__ import annotations

import os
from time import perf_counter

from native_reductions import sum_gcd_loop, sum_gcd_reduction
from sagejs.native import execution_mode


terms = int(os.environ.get('SAGEJS_NATIVE_REDUCTION_TERMS', '1000000'))
warmup = int(os.environ.get('SAGEJS_NATIVE_REDUCTION_WARMUP', '2'))
repeat = int(os.environ.get('SAGEJS_NATIVE_REDUCTION_REPEAT', '5'))

print('mode', execution_mode(sum_gcd_reduction, terms))
print('terms', terms)

for label, function in (
    ('natural_sum', sum_gcd_reduction),
    ('manual_loop', sum_gcd_loop),
):
    for _index in range(warmup):
        answer = function(terms)

    samples = []
    for _index in range(repeat):
        start = perf_counter()
        answer = function(terms)
        samples.append(perf_counter() - start)

    samples.sort()
    print(label + '_result', answer)
    print(label + '_median_seconds', samples[len(samples) // 2])
    print(label + '_minimum_seconds', samples[0])
