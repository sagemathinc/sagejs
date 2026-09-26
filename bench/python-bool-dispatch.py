"""Compare Python truth-value paths under CPython and `sagejs --python`."""

from time import perf_counter


COUNT = 200_000


class Truthy:
    def __bool__(self):
        return True


for label, value in (
    ("boolean", True),
    ("false", False),
    ("integer", 1),
    ("string", "word"),
    ("list", [1]),
    ("empty-list", []),
    ("instance", Truthy()),
):
    started = perf_counter()
    result = False
    for _ in range(COUNT):
        result = bool(value)
    print(label, result, round(perf_counter() - started, 6))
