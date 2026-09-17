"""Checked decomposition of ordinary instance access and construction."""

from __future__ import annotations

import sys
import time


class Empty:
    pass


class One:
    def __init__(self, left):
        self.left = left


class Two:
    def __init__(self, left, right):
        self.left = left
        self.right = right


class Four:
    def __init__(self, a, b, c, d):
        self.a = a
        self.b = b
        self.c = c
        self.d = d


one = One(0)
two = Two(0, 0)


def body(receiver, left, right):
    receiver.left = left
    receiver.right = right


def run(name, iterations):
    total = 0
    value = None
    started = time.perf_counter()
    if name == "empty":
        for _ in range(iterations):
            value = Empty()
    elif name == "one":
        for index in range(iterations):
            value = One(index)
    elif name == "two":
        for index in range(iterations):
            value = Two(index, 2)
    elif name == "four":
        for index in range(iterations):
            value = Four(index, 2, 3, 4)
    elif name == "body":
        for index in range(iterations):
            body(two, index, 2)
    elif name == "stores":
        for index in range(iterations):
            one.left = index
            two.right = index
    elif name == "reads":
        for _ in range(iterations):
            total += one.left + two.right
    else:
        raise ValueError("unknown case: " + name)
    assert value is None or isinstance(value, (Empty, One, Two, Four))
    assert total >= 0
    print(name + " " + str((time.perf_counter() - started) * 1000))


iterations = int(sys.argv[-1])
for selected in ["empty", "one", "two", "four", "body", "stores", "reads"]:
    run(selected, iterations)
