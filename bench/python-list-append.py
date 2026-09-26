"""Checked list-append dispatch benchmark with retained elements."""

import time


iterations = 100_000
expected = iterations * (iterations - 1) // 2


def run(name):
    values = []
    started = time.perf_counter()
    if name == "immediate":
        for index in range(iterations):
            values.append(index)
    elif name == "saved_bound":
        append = values.append
        for index in range(iterations):
            append(index)
    elif name == "unbound":
        for index in range(iterations):
            list.append(values, index)
    else:
        raise ValueError(name)
    elapsed = (time.perf_counter() - started) * 1000
    assert len(values) == iterations
    assert sum(values) == expected
    print(name, elapsed)


for case in ("immediate", "saved_bound", "unbound"):
    run(case)


def grouped_workflow():
    """Retain values in buckets, as a small aggregation workload would."""
    buckets = [[] for _ in range(64)]
    started = time.perf_counter()
    for index in range(iterations):
        buckets[index % 64].append(index)
    elapsed = (time.perf_counter() - started) * 1000
    assert sum(len(bucket) for bucket in buckets) == iterations
    assert sum(sum(bucket) for bucket in buckets) == expected
    print("grouped", elapsed)


grouped_workflow()
