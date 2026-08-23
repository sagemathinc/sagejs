# This source is intentionally accepted unchanged by Sage.js and SageMath.
#
# One case per process, selected by SAGEJS_BENCH_CASE, timed inside the
# process so interpreter startup is excluded.  Counting is measured cold on
# purpose: Sage.js memoizes partition numbers, so a loop inside one process
# would time the cache rather than the algorithm.
#
# `unrank-100` addresses one member a million places into a class of about
# 190 million.  The index is deliberately large: an implementation that ranks
# from counts is nearly indifferent to it, and one that iterates is not.

import os
import time

CASE = os.environ.get("SAGEJS_BENCH_CASE", "count-1000")


def warm():
    """Pay one-time costs, such as binding a native routine, before timing."""
    return number_of_partitions(1)


def run(case):
    if case == "count-cold-100":
        # Deliberately unwarmed: the first count in a process also pays for
        # whatever binding the runtime needs before it can call out.
        return number_of_partitions(100)
    if case == "count-100":
        return number_of_partitions(100)
    if case == "count-1000":
        return number_of_partitions(1000)
    if case == "count-10000":
        return number_of_partitions(10000)
    if case == "count-1000000":
        return number_of_partitions(1000000)
    if case == "cardinality-200":
        return Partitions(200).cardinality()
    if case == "constrained-100":
        return Partitions(100, max_part=20).cardinality()
    if case == "list-30":
        return len(Partitions(30).list())
    if case == "unrank-100":
        return Partitions(100).unrank(1000000)
    if case == "random-100":
        return Partitions(100).random_element()
    raise ValueError("unknown benchmark case: " + case)


# Everything except the deliberately cold case pays one-time binding costs
# before the clock starts, so the figure is per-call cost.
if CASE != "count-cold-100":
    warm()

start = time.time()
answer = run(CASE)
elapsed = float(time.time() - start)
print("RESULT", CASE, 1, 0, elapsed)
