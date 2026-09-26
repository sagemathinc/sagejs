"""Short and polymorphic `map` workloads for CPython/Sage.js comparison.

Run with `python -B bench/python-map-iterator.py` and
`node bin/sagejs-source.cjs --python bench/python-map-iterator.py`.
"""

from time import perf_counter


def measure(label, operation, expected, repetitions=10000):
    for _ in range(200):
        assert operation() == expected
    samples = []
    for _ in range(5):
        start = perf_counter()
        for _ in range(repetitions):
            result = operation()
        samples.append((perf_counter() - start) * 1000)
        assert result == expected
    print(label, round(sorted(samples)[2], 3), "ms")


numbers = (1, 2, 3)
texts = ("1", "2", "3")
measure("short-list-map", lambda: list(map(int, texts)), [1, 2, 3])
measure("short-list-comprehension", lambda: [int(value) for value in texts], [1, 2, 3])
measure(
    "two-iterable-map",
    lambda: list(map(lambda a, b: a + b, numbers, numbers)),
    [2, 4, 6],
)
measure(
    "polymorphic-input-map",
    lambda: [list(map(int, source)) for source in (numbers, list(numbers), texts)],
    [[1, 2, 3]] * 3,
    repetitions=3333,
)
