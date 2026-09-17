"""Checked benchmark for warmed ordinary instance stores."""

from __future__ import annotations

import sys
import time


class Record:
    def __init__(self, left, right):
        self.left = left
        self.right = right


def run(record, iterations):
    started = time.perf_counter()
    for index in range(iterations):
        record.left = index
        record.right = index
    elapsed = (time.perf_counter() - started) * 1000
    assert record.left == iterations - 1
    assert record.right == iterations - 1
    print("warmed_stores " + str(elapsed))


run(Record(0, 0), int(sys.argv[-1]))
