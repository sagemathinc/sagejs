"""Measure exact public projection publication, repeat algebra, and ownership."""

from __future__ import annotations

import json
import os
import time
from typing import Any

import sagejs.runtime as runtime
from sagejs.number_fields import class_group_maps

CASES = (
    ("3.1.588.1", (1, 5, -1, 1), (3,)),
    ("3.1.5448.1", (30, -14, -1, 1), (8,)),
    ("3.1.4027.2", (8, 7, -1, 1), (6,)),
)
SAMPLES = 3
REPEATS = 21
MODE = os.environ.get("SAGEJS_PROJECTION_BENCH_MODE", "candidate")
if MODE not in ("baseline", "candidate", "ownership"):
    raise ValueError("benchmark mode must be baseline, candidate, or ownership")

R = PolynomialRing(QQ, "x")
x = R.gen()


def median(values: list[float]) -> float:
    return float(sorted(values)[len(values) // 2])


def make_field(coefficients: tuple[int, ...], name: str) -> Any:
    polynomial = R(0)
    for exponent, coefficient in enumerate(coefficients):
        polynomial += coefficient * x**exponent
    field = NumberField(polynomial, name)
    field.maximal_order()
    return field


def measured_case(
    label: str,
    coefficients: tuple[int, ...],
    invariants: tuple[int, ...],
    proof: bool,
) -> dict[str, Any]:
    class_unit_samples = []
    first_publication_samples = []
    repeat_samples = []
    statuses = []
    for sample in range(SAMPLES):
        field = make_field(
            coefficients,
            "m" + str(sample) + str(int(proof)) + label.replace(".", ""),
        )
        started = time.monotonic()
        result = field.class_unit_group(proof=proof)
        class_unit_samples.append(time.monotonic() - started)
        assert result.complete and result.class_group().invariants() == invariants
        statuses.append(result.proof_status)

        original_sealer = class_group_maps.seal_public_class_group_projection
        if MODE == "baseline":

            def interposed_sealer(group: Any) -> Any:
                return original_sealer(group)

            class_group_maps.seal_public_class_group_projection = interposed_sealer
        try:
            started = time.monotonic()
            first = field.class_group(proof=proof)
            first_publication_samples.append(time.monotonic() - started)
        finally:
            class_group_maps.seal_public_class_group_projection = original_sealer
        assert first.invariants() == invariants
        assert first.proof_status == result.proof_status
        if MODE == "candidate":
            for _index in range(REPEATS):
                started = time.monotonic()
                view = field.class_group(proof=proof)
                repeat_samples.append(time.monotonic() - started)
                assert view is not first and view.invariants() == invariants
    if MODE == "candidate":
        assert median(repeat_samples) <= 0.025
    return {
        "label": label,
        "proof": proof,
        "proof_statuses": statuses,
        "class_unit_samples": class_unit_samples,
        "class_unit_median": median(class_unit_samples),
        "first_publication_samples": first_publication_samples,
        "first_publication_median": median(first_publication_samples),
        "repeat_samples": repeat_samples,
        "repeat_median": None if not repeat_samples else median(repeat_samples),
    }


rows = []
if MODE != "ownership":
    for case in CASES:
        for proof in (False, True):
            rows.append(measured_case(case[0], case[1], case[2], proof))

ownership = None
if MODE in ("candidate", "ownership"):
    field = make_field((30, -14, -1, 1), "ownership")
    result = field.class_unit_group(proof=True)
    first = field.class_group(proof=True)
    process = runtime.reflect.get(runtime.global_object, "process")
    collector = runtime.reflect.get(runtime.global_object, "gc")

    def collect() -> None:
        if collector is not None and collector is not runtime.undefined:
            runtime.reflect.apply(collector, runtime.global_object, [])

    def memory_usage() -> dict[str, int]:
        usage = runtime.reflect.apply(
            runtime.reflect.get(process, "memoryUsage"), process, []
        )
        return {
            name: int(runtime.number(runtime.reflect.get(usage, name)))
            for name in ("rss", "heapUsed", "external")
        }

    for _index in range(500):
        field.class_group(proof=True)
    for _index in range(3):
        collect()
    plateau = memory_usage()
    views = [field.class_group(proof=True) for _index in range(1_000)]
    assert all(view is not first for view in views)
    for _index in range(3):
        collect()
    retained = memory_usage()
    views = []
    for _index in range(3):
        collect()
    after_release = memory_usage()
    previous = first
    discarded_fresh = True
    for index in range(1_000):
        current = field.class_group(proof=True)
        discarded_fresh = discarded_fresh and current is not previous
        previous = current
        if index % 100 == 99:
            collect()
    for _index in range(3):
        collect()
    after_discarded = memory_usage()
    started = time.monotonic()
    assert previous.verify()
    verify_seconds = time.monotonic() - started
    ownership = {
        "plateau": plateau,
        "retained": retained,
        "retained_delta": {name: retained[name] - plateau[name] for name in plateau},
        "retained_per_view": {
            name: (retained[name] - plateau[name]) // 1_000 for name in plateau
        },
        "after_release": after_release,
        "after_discarded": after_discarded,
        "discarded_delta": {
            name: after_discarded[name] - after_release[name] for name in after_release
        },
        "discarded_fresh": discarded_fresh,
        "full_verify_seconds": verify_seconds,
        "retained_projection_type": type(
            result.context._live_artifacts.public_class_group_projection
        ).__name__,
    }
    assert discarded_fresh
    assert after_discarded["rss"] <= after_release["rss"] + 8 * 1024 * 1024

print(
    json.dumps(
        {
            "benchmark": "exact-public-class-group-projection",
            "mode": MODE,
            "samples": SAMPLES,
            "repeats": REPEATS,
            "rows": rows,
            "ownership": ownership,
        },
        sort_keys=True,
    )
)
