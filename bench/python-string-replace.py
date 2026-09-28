"""Compare warmed Python string replacement across replacement counts.

Run with CPython and `sagejs --python`. Timing excludes startup and import.
"""

from time import perf_counter


def measure(name, text, old, new, count, calls):
    expected = text.replace(old, new, count)
    samples = []
    for sample in range(10):
        checksum = 0
        started = perf_counter()
        for _ in range(calls):
            checksum += len(text.replace(old, new, count))
        elapsed = (perf_counter() - started) * 1000
        if sample >= 3:
            samples.append(elapsed)
        assert checksum == calls * len(expected)
    print(name, round(sorted(samples)[3], 3), checksum, [round(s, 3) for s in samples])


for size in (100, 1_000, 5_000):
    text = "ab" * (size // 2)
    measure("all-" + str(size), text, "a", "$&", -1, 200)
    measure("one-" + str(size), text, "a", "$&", 1, 200)

measure("limited-1000", "ab" * 2_500, "a", "$&", 1_000, 200)
for count in (2, 8, 100):
    measure("limited-" + str(count), "ab" * 2_500, "a", "$&", count, 200)


def escape(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


text = "A < B & C > D; paragraph text.\n" * 200
expected = escape(text)
samples = []
for sample in range(10):
    checksum = 0
    started = perf_counter()
    for _ in range(200):
        checksum += len(escape(text))
    elapsed = (perf_counter() - started) * 1000
    if sample >= 3:
        samples.append(elapsed)
    assert checksum == 200 * len(expected)
print(
    "html-escape",
    round(sorted(samples)[3], 3),
    checksum,
    [round(s, 3) for s in samples],
)
