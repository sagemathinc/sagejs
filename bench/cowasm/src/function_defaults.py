"""Ordinary Python call-site witnesses for canonical function defaults.

Definitions, default evaluation, instance construction, and initial bound
method lookup happen at import, outside the corpus's warm-throughput timer.
Each timed function performs identical arithmetic and validates its checksum.
"""

from bench import register


ITERATIONS = 100_000
EXPECTED = ITERATIONS * (ITERATIONS - 1) // 2 + 7 * ITERATIONS


def required(value, step):
    return value + step


def positional(value, step=7):
    return value + step


def keyword_only(value, *, step=7):
    return value + step


class Adder:
    def add(self, value, step=7):
        return value + step


adder = Adder()
bound = adder.add

# Equivalence and canonical source-slot checks precede all timed passes.
assert positional.__defaults__ == (7,)
assert keyword_only.__kwdefaults__ == {"step": 7}
assert Adder.add.__defaults__ == (7,)
for value in (0, 11, 999):
    expected = value + 7
    assert required(value, 7) == expected
    assert positional(value, 7) == positional(value) == expected
    assert keyword_only(value, step=7) == keyword_only(value) == expected
    assert bound(value, 7) == bound(value) == expected


def required_supplied():
    total = 0
    for value in range(ITERATIONS):
        total += required(value, 7)
    assert total == EXPECTED


def positional_supplied():
    total = 0
    for value in range(ITERATIONS):
        total += positional(value, 7)
    assert total == EXPECTED


def positional_omitted():
    total = 0
    for value in range(ITERATIONS):
        total += positional(value)
    assert total == EXPECTED


def keyword_only_supplied():
    total = 0
    for value in range(ITERATIONS):
        total += keyword_only(value, step=7)
    assert total == EXPECTED


def keyword_only_omitted():
    total = 0
    for value in range(ITERATIONS):
        total += keyword_only(value)
    assert total == EXPECTED


def bound_supplied():
    total = 0
    for value in range(ITERATIONS):
        total += bound(value, 7)
    assert total == EXPECTED


def bound_omitted():
    total = 0
    for value in range(ITERATIONS):
        total += bound(value)
    assert total == EXPECTED


register("defaults required supplied", required_supplied)
register("defaults positional supplied", positional_supplied)
register("defaults positional omitted", positional_omitted)
register("defaults keyword-only supplied", keyword_only_supplied)
register("defaults keyword-only omitted", keyword_only_omitted)
register("defaults bound supplied", bound_supplied)
register("defaults bound omitted", bound_omitted)
