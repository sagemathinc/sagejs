"""Benchmark the public prepared genus-2 Kummer batch boundary."""

import json
import os
from time import perf_counter_ns

from sagejs.hyperelliptic_curves.jacobian_kummer_native import (
    Genus2PrimeKummerContext,
    genus2_kummer_double_batch,
)
from sagejs.native import is_compiled


def _rows(count: int, prime: int) -> list[list[int]]:
    state = 1729
    answer = []
    for _ in range(count):
        row = []
        for _coordinate in range(4):
            state = (1664525 * state + 1013904223) & 0xFFFFFFFF
            row.append(state % prime)
        if row == [0, 0, 0, 0]:
            row[3] = 1
        answer.append(row)
    return answer


def main() -> None:
    prime = 1_000_003
    count = int(os.environ.get("SAGEJS_KUMMER_BENCH_COUNT", "100000"))
    context = Genus2PrimeKummerContext(prime, [7, 11, 5, 3, 2, 1])
    points = _rows(count, prime)
    context.double_batch(points[: min(32, count)])
    started = perf_counter_ns()
    doubled, statuses = context.double_batch(points)
    elapsed_ns = perf_counter_ns() - started
    assert statuses == [0] * count
    checksum = sum(sum(row) for row in doubled) % 1_000_000_007
    print(
        json.dumps(
            {
                "schema": "sagejs.hyperelliptic-genus2-kummer-benchmark.v1",
                "compiled": is_compiled(genus2_kummer_double_batch),
                "count": count,
                "elapsed_ns": elapsed_ns,
                "points_per_second": count * 1_000_000_000 / elapsed_ns,
                "checksum": checksum,
                "first": doubled[0] if doubled else None,
                "last": doubled[-1] if doubled else None,
                "capability": context.capability(),
            },
            sort_keys=True,
        )
    )


main()
