"""Strict runner for the vendored CoWasm Python benchmark corpus.

The original ``bench.py`` runner deliberately catches exceptions so that one
failed experiment does not stop an exploratory benchmark run.  A compatibility
corpus needs the opposite behavior: the first semantic or runtime failure must
make the process fail.

Keep timing outside the benchmark bodies.  This lets Sage.js and CPython run
the same source and use the same underlying benchmark workloads.
"""

import misc
import brython
import numbers
import pystone
import p1list
import nbody
import uuid_
import fib
import lambda_
import call
import mypyc_micro
import parse_int

from bench import registered_benchmarks
from time import time


FORMAT_VERSION = 1


def run_corpus():
    benchmarks = registered_benchmarks()
    print("SAGEJS_COWASM_CORPUS", FORMAT_VERSION)
    for index, (name, benchmark) in enumerate(benchmarks):
        started = time()
        benchmark()
        elapsed_us = int((time() - started) * 1000000)
        print("RESULT", index, name, elapsed_us, sep="\t")
    print("COMPLETE", len(benchmarks), sep="\t")


if __name__ == "__main__":
    run_corpus()
