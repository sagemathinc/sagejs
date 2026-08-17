#!/usr/bin/env python3
"""Shared exact Puiseux-series benchmark for Sage and Sage.js."""

from __future__ import annotations

import json
import time

try:
    from sage.all import QQ, PuiseuxSeriesRing
except ImportError:
    # Sage.js script mode supplies the same public constructors as builtins.
    pass


SAMPLES = 7
PARENT_ITERATIONS = 20000
ARITHMETIC_ITERATIONS = 1000
DENOMINATORS = [2, 3, 5, 7, 11]


def measure(callable_):
    samples = []
    answer = None
    callable_()
    for _repetition in range(SAMPLES):
        started = time.perf_counter_ns()
        candidate = callable_()
        samples.append(time.perf_counter_ns() - started)
        if answer is None:
            answer = candidate
        elif answer != candidate:
            raise RuntimeError("benchmark output changed between samples")
    return {"answer": answer, "wallNanoseconds": samples}


def main():
    ring = PuiseuxSeriesRing(QQ, "y")
    y = ring.gen()

    def parent_surface():
        for _index in range(PARENT_ITERATIONS):
            ring.gen()
            ring.gens()
            ring.ngens()
            ring.default_prec()
            ring.is_sparse()
            ring.is_dense()
            ring.is_field()
            ring.laurent_series_ring()
        return repr(ring) + "|" + repr(ring.gen())

    def rational_arithmetic():
        answer = ring(0)
        for _index in range(ARITHMETIC_ITERATIONS):
            answer = y ** (QQ(1) / 2) + y ** (QQ(1) / 3)
            answer *= y ** (-QQ(1) / 5) + y ** (QQ(2) / 7)
            answer = answer.add_bigoh(QQ(3) / 2)
        return repr(answer)

    def denominator_ladder():
        answer = ring(0)
        for denominator in DENOMINATORS:
            answer += y ** (QQ(1) / denominator)
        return repr(answer) + "|" + str(answer.ramification_index())

    result = {
        "policy": {
            "warmupRuns": 1,
            "measuredRuns": int(SAMPLES),
            "parentIterations": int(PARENT_ITERATIONS),
            "arithmeticIterations": int(ARITHMETIC_ITERATIONS),
            "denominators": [int(value) for value in DENOMINATORS],
        },
        "results": {
            "parentSurface": measure(parent_surface),
            "rationalArithmetic": measure(rational_arithmetic),
            "denominatorLadder": measure(denominator_ladder),
        },
    }
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
