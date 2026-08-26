"""Measure the rigorous quartic scalar stop and resumable suffix."""

from __future__ import annotations

import json
import math
import os
import time
from typing import Any

import sagejs.number_fields.class_group_factor_base as factor_base_module
import sagejs.number_fields.class_unit_groups as class_unit_module
from sagejs.number_fields.class_groups import bounded_minkowski_class_number_one

R = PolynomialRing(QQ, "x")
x = R.gen()
CASES = (
    ("complex-h1-x4-plus-2", x**4 + 2, 1),
    ("complex-h2-d2889", x**4 - x**3 + 3 * x**2 + 2 * x + 1, 2),
    ("mixed-h2-d8375", x**4 - 2 * x**3 - x**2 - 3 * x + 1, 2),
    ("real-h2-d79937", x**4 - 4 * x**3 - 5 * x**2 + 5 * x + 4, 2),
    ("complex-h4-d36677", x**4 - 4 * x**3 + 4 * x**2 - x + 6, 4),
)
SAMPLES = int(os.environ.get("SAGEJS_QUARTIC_PROJECTION_SAMPLES", "3"))


def median(values: list[float]) -> float:
    return float(sorted(values)[len(values) // 2])


def make_field(polynomial: Any, name: str) -> Any:
    field = NumberField(polynomial, name)
    field.maximal_order()
    return field


def run(polynomial: Any, expected: int, proof: bool, projected: bool, sample: int):
    field = make_field(
        polynomial,
        ("p" if projected else "f") + str(int(proof)) + str(sample),
    )
    factor_base_builds = [0]
    original_build = factor_base_module.build_factor_base

    def counted_build(plan: Any) -> Any:
        factor_base_builds[0] += 1
        return original_build(plan)

    factor_base_module.build_factor_base = counted_build
    try:
        started = time.perf_counter_ns()
        if projected:
            answer = class_unit_module.quartic_class_number_projection(
                field, proof=proof
            )
            key = class_unit_module._class_number_projection_cache_key(
                proof, class_unit_module.ClassUnitEngineLimits()
            )
            result = class_unit_module._cached_class_number_projection(
                field, key, proof
            )
            assert result is not None
        else:
            bounded = bounded_minkowski_class_number_one(field)
            if expected == 1:
                assert bounded.complete
                result = bounded
                answer = int(bounded.order())
            else:
                assert not bounded.complete and bounded.minkowski_factor_base_complete
                result = class_unit_module.class_unit_context(
                    field, proof=proof, algorithm="minkowski"
                )
                answer = int(result.class_number())
        scalar_seconds = (time.perf_counter_ns() - started) / 1_000_000_000
        assert answer == expected
        finish_seconds = None
        scalar_factor_base_builds = factor_base_builds[0]
        before_resources = dict(result._engine._resource_usage) if projected else None
        if projected:
            started = time.perf_counter_ns()
            if expected == 1:
                completed = result.finish_bounded()
            else:
                completed = result.finish()
            finish_seconds = (time.perf_counter_ns() - started) / 1_000_000_000
            assert completed.complete
            if expected == 1:
                assert completed.order() == expected
            else:
                assert completed.class_number() == expected
                assert completed.proof_status == "exact-unconditional"
        after_resources = (
            dict(result._engine._resource_usage)
            if projected
            else ({} if expected == 1 else dict(result.diagnostics["resources"]))
        )
        return (
            scalar_seconds,
            finish_seconds,
            scalar_factor_base_builds,
            factor_base_builds[0],
            before_resources,
            after_resources,
        )
    finally:
        factor_base_module.build_factor_base = original_build


rows = []
for label, polynomial, expected in CASES:
    for proof in (False, True):
        full_samples = []
        projected_samples = []
        finish_samples = []
        full_builds = []
        full_total_builds = []
        projected_builds = []
        projected_total_builds = []
        projected_resources = []
        for sample in range(SAMPLES):
            full, _, builds, total_builds, _, _ = run(
                polynomial, expected, proof, False, sample
            )
            projected, finish, projected_count, projected_total, before, after = run(
                polynomial, expected, proof, True, sample
            )
            full_samples.append(full)
            projected_samples.append(projected)
            finish_samples.append(float(finish))
            full_builds.append(builds)
            full_total_builds.append(total_builds)
            projected_builds.append(projected_count)
            projected_total_builds.append(projected_total)
            projected_resources.append(
                {
                    "relation_attempts": before["relation_attempts"],
                    "relations": before["relations"],
                    "seed_relations": before["quartic_relation_seed_relations"],
                    "post_saturation_projection": before[
                        "class_number_post_saturation_projections"
                    ],
                    "certificate_constructions_before_finish": before[
                        "deferred_saturation_certificate_constructions"
                    ],
                    "certificate_constructions_after_finish": after[
                        "deferred_saturation_certificate_constructions"
                    ],
                    "minkowski_certificate_constructions_before_finish": before[
                        "deferred_minkowski_certificate_constructions"
                    ],
                    "minkowski_certificate_constructions_after_finish": after[
                        "deferred_minkowski_certificate_constructions"
                    ],
                }
            )
        full_median = median(full_samples)
        projected_median = median(projected_samples)
        ratio = projected_median / full_median
        assert all(value == 2 for value in full_builds)
        assert all(value == 1 for value in projected_builds)
        assert ratio <= 1.10
        assert median(finish_samples) <= 0.50
        if expected == 1:
            assert all(value == 2 for value in projected_total_builds)
            assert all(
                value["certificate_constructions_before_finish"] == 0
                and value["certificate_constructions_after_finish"] == 0
                and value["minkowski_certificate_constructions_before_finish"] == 0
                and value["minkowski_certificate_constructions_after_finish"] == 1
                for value in projected_resources
            )
        else:
            assert all(value == 1 for value in projected_total_builds)
            assert all(
                value["certificate_constructions_before_finish"] == 0
                and value["certificate_constructions_after_finish"] == 1
                and value["minkowski_certificate_constructions_before_finish"] == 0
                and value["minkowski_certificate_constructions_after_finish"] == 0
                for value in projected_resources
            )
        rows.append(
            {
                "label": label,
                "proof": proof,
                "full_seconds": full_median,
                "projected_seconds": projected_median,
                "ratio": ratio,
                "finish_seconds": median(finish_samples),
                "full_factor_base_builds": full_builds,
                "full_total_factor_base_builds": full_total_builds,
                "projected_factor_base_builds": projected_builds,
                "projected_total_factor_base_builds": projected_total_builds,
                "projected_resources": projected_resources,
            }
        )

geometric_mean_ratio = math.exp(sum(math.log(row["ratio"]) for row in rows) / len(rows))
assert geometric_mean_ratio <= 0.75

print(
    "QUARTIC_CLASS_NUMBER_PROJECTION|"
    + json.dumps(
        {
            "schema": "sagejs-benchmark/quartic-class-number-projection-v1",
            "samples": SAMPLES,
            "geometric_mean_ratio": geometric_mean_ratio,
            "rows": rows,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
)
