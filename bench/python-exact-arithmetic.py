"""Checked microbenchmarks for exact primitive arithmetic."""

import sys
import time


def run(name, count):
    left = 12345
    right = 37
    value = 0
    started = time.perf_counter()
    if name == "add":
        for _ in range(count):
            value = left + right
    elif name == "sub":
        for _ in range(count):
            value = left - right
    elif name == "mul":
        for _ in range(count):
            value = left * right
    elif name == "iadd":
        for _ in range(count):
            value = left
            value += right
    elif name == "isub":
        for _ in range(count):
            value = left
            value -= right
    elif name == "imul":
        for _ in range(count):
            value = left
            value *= right
    else:
        raise ValueError(name)
    elapsed = time.perf_counter() - started
    expected = {
        "add": 12382,
        "sub": 12308,
        "mul": 456765,
        "iadd": 12382,
        "isub": 12308,
        "imul": 456765,
    }[name]
    assert value == expected
    print(name + " " + str(elapsed * 1000))


try:
    iterations = int(sys.argv[-1])
except ValueError:
    iterations = 1_000_000
for case in ["add", "sub", "mul", "iadd", "isub", "imul"]:
    run(case, iterations)
