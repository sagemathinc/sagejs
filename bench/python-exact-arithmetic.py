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
    elif name == "pow":
        for _ in range(count):
            value = 3**7
    elif name == "ipow":
        for _ in range(count):
            value = 3
            value **= 7
    elif name == "bitand":
        for _ in range(count):
            value = left & right
    elif name == "bitor":
        for _ in range(count):
            value = left | right
    elif name == "bitxor":
        for _ in range(count):
            value = left ^ right
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
        "pow": 2187,
        "ipow": 2187,
        "bitand": 33,
        "bitor": 12349,
        "bitxor": 12316,
    }[name]
    assert value == expected
    print(name + " " + str(elapsed * 1000))


try:
    iterations = int(sys.argv[-1])
except ValueError:
    iterations = 1_000_000
for case in [
    "add",
    "sub",
    "mul",
    "pow",
    "bitand",
    "bitor",
    "bitxor",
    "iadd",
    "isub",
    "imul",
    "ipow",
]:
    run(case, iterations)
