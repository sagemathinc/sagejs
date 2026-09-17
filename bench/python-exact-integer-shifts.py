"""Exercise exact integer shift runtime dispatch."""

from time import perf_counter


def report(name, answer, elapsed):
    print(name, answer, elapsed)


started = perf_counter()
small_left = 0
for _index in range(1_000_000):
    small_left = 12345 << 3
report("small-left-shift", small_left, perf_counter() - started)


started = perf_counter()
small_right = 0
for _index in range(1_000_000):
    small_right = 12345 >> 3
report("small-right-shift", small_right, perf_counter() - started)


wide = -(2**80)
started = perf_counter()
wide_left = 0
for _index in range(250_000):
    wide_left = wide << 11
report("wide-left-shift", wide_left, perf_counter() - started)


started = perf_counter()
wide_right = 0
for _index in range(250_000):
    wide_right = wide >> 17
report("wide-right-shift", wide_right, perf_counter() - started)
