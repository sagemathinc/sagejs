"""Checked microbenchmarks for Python argument binding and construction."""

from __future__ import annotations

import sys
import time


def keyword_function(left=1, middle=2, right=3):
    return left + middle + right


class Point:
    def __init__(self, left=1, right=2):
        self.left = left
        self.right = right

    def total(self):
        return self.left + self.right

    def keyword_method(self, left=1, middle=2, right=3):
        return left + middle + right


point = Point()


class Empty:
    pass


class NoOpInit:
    def __init__(self):
        pass


def run_case(name, iterations):
    total = 0
    constructed = None
    started = time.perf_counter()
    if name == "positional_function":
        for index in range(iterations):
            total += keyword_function(index, 2, 3)
    elif name == "keyword_function":
        for index in range(iterations):
            total += keyword_function(left=index, right=3)
    elif name == "keyword_method":
        for index in range(iterations):
            total += point.keyword_method(left=index, right=3)
    elif name == "positional_construction":
        for index in range(iterations):
            total += Point(index, 2).total()
    elif name == "keyword_construction":
        for index in range(iterations):
            total += Point(left=index, right=2).total()
    elif name == "empty_construction":
        for _ in range(iterations):
            constructed = Empty()
    elif name == "noop_init_construction":
        for _ in range(iterations):
            constructed = NoOpInit()
    else:
        raise ValueError("unknown case: " + name)
    elapsed = time.perf_counter() - started
    if name == "empty_construction":
        assert type(constructed) is Empty
    elif name == "noop_init_construction":
        assert type(constructed) is NoOpInit
    else:
        expected = iterations * (iterations - 1) // 2
        expected += (
            iterations
            * (
                {
                    "positional_function": 5,
                    "keyword_function": 5,
                    "keyword_method": 5,
                    "positional_construction": 2,
                    "keyword_construction": 2,
                }[name]
            )
        )
        assert total == expected, (name, total, expected)
    print(name + " " + str(elapsed * 1000))


try:
    iterations = int(sys.argv[-1])
except ValueError:
    iterations = 100_000
selected = [
    "positional_function",
    "keyword_function",
    "keyword_method",
    "empty_construction",
    "noop_init_construction",
    "positional_construction",
    "keyword_construction",
]
for selected_name in selected:
    run_case(selected_name, iterations)
