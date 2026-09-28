"""Measure explicit-separator `str.split` without including process startup.

Run with CPython and `sagejs --python`. Each result is the median of five
warmed 20,000-call batches in milliseconds; lower is better.
"""

from time import perf_counter


def measure(name, maxsplit):
    text = "1.0.3"
    for _ in range(3):
        text.split(".", maxsplit)
    samples = []
    for _ in range(5):
        total = 0
        started = perf_counter()
        for _ in range(20_000):
            total += len(text.split(".", maxsplit))
        samples.append((perf_counter() - started) * 1000)
    print(name, round(sorted(samples)[2], 3), total)


measure("unlimited", -1)
measure("one", 1)
measure("zero", 0)
