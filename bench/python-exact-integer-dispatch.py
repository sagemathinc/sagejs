"""Exercise exact integer division and remainder runtime dispatch."""

from time import perf_counter


def report(name, answer, elapsed):
    print(name, answer, elapsed)


started = perf_counter()
small_floor = 0
for index in range(1, 1_000_001):
    small_floor += index // 97
report('small-floordiv', small_floor, perf_counter() - started)


started = perf_counter()
small_mod = 0
for index in range(1, 1_000_001):
    small_mod += index % 97
report('small-modulo', small_mod, perf_counter() - started)


big_numerator = 123456789012345678901234567890
big_denominator = -1000000007

started = perf_counter()
big_floor = 0
for _index in range(250_000):
    big_floor = big_numerator // big_denominator
report('big-floordiv', big_floor, perf_counter() - started)


started = perf_counter()
big_mod = 0
for _index in range(250_000):
    big_mod = big_numerator % big_denominator
report('big-modulo', big_mod, perf_counter() - started)
