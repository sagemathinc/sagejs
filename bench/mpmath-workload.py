"""Identical warmed mpmath workload for every compared Python runtime."""

from time import perf_counter

from mpmath import mp


mp.dps = 80


def workload():
    total = mp.mpf('0')
    for denominator in range(1, 401):
        total += 1 / mp.mpf(denominator) ** 3
    return total + mp.sqrt(2) + mp.exp(-1) + mp.zeta(3)


# Warm module caches and interpreter/JIT hot paths before measuring computation.
for _warmup in range(2):
    answer = workload()

repetitions = 5
started = perf_counter()
for _iteration in range(repetitions):
    answer = workload()
elapsed = perf_counter() - started

print('RESULT', mp.nstr(answer, 60), elapsed / repetitions)
