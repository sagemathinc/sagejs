"""Checked polymorphic and mutation-heavy Python method-call benchmarks."""

from __future__ import annotations

import sys
import time


class First:
    def method(self, value=0):
        return value + 1


class Second:
    def method(self, value=0):
        return value + 2


class Third:
    def method(self, value=0):
        return value + 3


class Fourth:
    def method(self, value=0):
        return value + 4


class Mutable:
    pass


def method_even(self, value=0):
    return value


def method_odd(self, value=0):
    return value + 1


receivers = (First(), Second(), Third(), Fourth())
mutable = Mutable()


def run_case(name, iterations):
    total = 0
    started = time.perf_counter()
    if name == "polymorphic_keyword_method":
        for index in range(iterations):
            total += receivers[index % 4].method(value=index)
        expected = iterations * (iterations - 1) // 2
        expected += (iterations // 4) * 10
    elif name == "mutating_keyword_method":
        block_size = 1_000
        assert iterations % (2 * block_size) == 0
        for block in range(iterations // block_size):
            Mutable.method = method_even if block % 2 == 0 else method_odd
            for offset in range(block_size):
                total += mutable.method(value=block * block_size + offset)
        expected = iterations * (iterations - 1) // 2 + iterations // 2
    else:
        raise ValueError("unknown case: " + name)
    elapsed = time.perf_counter() - started
    assert total == expected, (name, total, expected)
    print(name + " " + str(elapsed * 1000))


try:
    iterations = int(sys.argv[-1])
except ValueError:
    iterations = 100_000
for selected_name in ["polymorphic_keyword_method", "mutating_keyword_method"]:
    run_case(selected_name, iterations)
