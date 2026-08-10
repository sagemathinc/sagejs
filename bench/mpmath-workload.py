"""Identical warmed mpmath workload for every compared Python runtime."""

import os
from time import perf_counter

from mpmath import mp


mp.dps = 80


def workload():
    total = mp.mpf("0")
    for denominator in range(1, 401):
        total += 1 / mp.mpf(denominator) ** 3
    return total + mp.sqrt(2) + mp.exp(-1) + mp.zeta(3)


# Warm module caches and interpreter/JIT hot paths before measuring computation.
# The defaults match the original benchmark used to diagnose this workload;
# environment overrides keep long profiling runs and quick smoke runs possible.
warmups = int(os.environ.get("SAGEJS_MPMATH_WARMUPS", "20"))
for _warmup in range(warmups):
    answer = workload()

# A larger value is useful when collecting a statistically meaningful CPU
# profile without maintaining a second, subtly different benchmark program.
repetitions = int(os.environ.get("SAGEJS_MPMATH_REPETITIONS", "100"))
started = perf_counter()
for _iteration in range(repetitions):
    answer = workload()
elapsed = perf_counter() - started

print("RESULT", mp.nstr(answer, 60), elapsed / repetitions)
