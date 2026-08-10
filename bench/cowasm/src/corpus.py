"""Strict runner for the vendored CoWasm Python benchmark corpus.

The original `bench.py` runner deliberately catches exceptions so that one
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
from sys import argv
from time import time


FORMAT_VERSION = 2


def integer_option(name, fallback):
    for index, argument in enumerate(argv):
        if argument == name and index + 1 < len(argv):
            return int(argv[index + 1])
    return fallback


def string_options(name):
    values = []
    for index, argument in enumerate(argv):
        if argument == name and index + 1 < len(argv):
            values.append(argv[index + 1])
    return values


def run_pass(kind, sample, benchmarks):
    for index, (name, benchmark) in enumerate(benchmarks):
        started = time()
        benchmark()
        elapsed_us = int((time() - started) * 1000000)
        print(kind, sample, index, name, elapsed_us, sep="\t")


def run_corpus():
    warmups = integer_option("--warmups", 0)
    samples = integer_option("--samples", 1)
    if warmups < 0 or samples < 1:
        raise ValueError("warmups must be nonnegative and samples positive")
    benchmarks = registered_benchmarks()
    selected = string_options("--only")
    if selected:
        benchmarks = [benchmark for benchmark in benchmarks if benchmark[0] in selected]
        if len(benchmarks) != len(set(selected)):
            raise ValueError("unknown or duplicate benchmark selection")
    print("SAGEJS_COWASM_CORPUS", FORMAT_VERSION)
    for sample in range(warmups):
        run_pass("WARMUP", sample, benchmarks)
    for sample in range(samples):
        run_pass("RESULT", sample, benchmarks)
    print("COMPLETE", warmups, samples, len(benchmarks), sep="\t")


if __name__ == "__main__":
    run_corpus()
