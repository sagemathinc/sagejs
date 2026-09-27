"""Compare ordinary and slotted instance construction and field operations.

Run with CPython and with `sagejs --python`. Report median milliseconds for
five warmed batches of 20,000 iterations; these are not startup timings.
"""

from time import perf_counter


class Plain:
    def __init__(self, x, y):
        self.x = x
        self.y = y


class Slotted:
    __slots__ = ("x", "y")

    def __init__(self, x, y):
        self.x = x
        self.y = y


def construct(cls, count):
    total = 0
    for index in range(count):
        value = cls(index, index + 1)
        total += value.x + value.y
    return total


def fields(cls, count):
    value = cls(2, 3)
    total = 0
    for _ in range(count):
        total += value.x + value.y
        value.x = 2
        value.y = 3
    return total


for name, function in (("construct", construct), ("fields", fields)):
    for cls in (Plain, Slotted):
        assert function(cls, 100) == function(cls, 100)
        samples = []
        for _ in range(5):
            started = perf_counter()
            answer = function(cls, 20_000)
            samples.append((perf_counter() - started) * 1000)
        samples.sort()
        print(name, cls.__name__, round(samples[2], 3), answer)
