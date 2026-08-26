"""Measure automatic cubic preflight against its explicit public control.

The comparison uses fresh isomorphic fields with a prepared maximal order in
one persistent process.  `prior_direct` is the exact-`7fc836e6` three-sample
receipt which motivated this routing experiment.  The automatic path must
match an explicit `class_number(); class_unit_group()` sequence while retaining
the ordinary exact collector, presentation, hR, saturation, and replay checks.

Design references are Hecke 0.40.0's shared `ClassGrpCtx` (BSD-2-Clause) and a
clean-room reading of PARI's GPL `buch2.c`; no upstream code is copied here.
"""

from __future__ import annotations

import json
import time
from typing import Any

import sagejs.number_fields.class_unit_groups as class_unit_module

CASES = (
    ("3.1.23.1", (1, 0, -1, 1), 1, (), "complete-zero"),
    ("3.1.59.1", (-1, 2, 0, 1), 1, (), "complete"),
    ("3.1.283.1", (-1, 4, 0, 1), 2, (2,), "live-prefix"),
    ("3.1.588.1", (1, 5, -1, 1), 3, (3,), "complete"),
    ("3.1.1083.1", (-12, -6, -1, 1), 3, (3,), "complete"),
    ("3.1.1371.1", (6, 3, -1, 1), 4, (4,), "live-prefix"),
    ("3.1.1563.1", (-6, 7, -1, 1), 5, (5,), "live-prefix"),
    ("3.1.2856.1", (-21, 9, -1, 1), 7, (7,), "live-prefix"),
    ("3.1.4027.2", (8, 7, -1, 1), 6, (6,), "proof-dependent"),
    ("3.1.5448.1", (30, -14, -1, 1), 8, (8,), "live-prefix"),
)

PRIOR_DIRECT = {
    False: (
        0.6381065845489502,
        0.634756326675415,
        0.668402910232544,
        5.192254304885864,
        0.9973077774047852,
        0.7880003452301025,
        0.7794017791748047,
        0.919166088104248,
        0.8307101726531982,
        9.73068642616272,
    ),
    True: (
        0.6139206886291504,
        0.6207120418548584,
        0.6530735492706299,
        7.078765869140625,
        3.509592056274414,
        2.4611477851867676,
        4.939170598983765,
        5.845529317855835,
        8.940664768218994,
        14.129876136779785,
    ),
}

SAMPLES = 5
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


def check_result(result: Any, order: int, invariants: tuple[int, ...]) -> None:
    assert result.complete and result.class_number() == order
    assert result.class_group().invariants() == invariants
    units = result.unit_group()
    assert units.unit_rank == 1 and units.torsion.order == 2
    regulator = result.regulator()
    assert regulator.rigorous and regulator.full_rank_certified


def artifact_mode(field: Any, proof: bool) -> str:
    artifact = field._bounded_cubic_class_number_artifact
    diagnostics = artifact.diagnostics
    if diagnostics.get("relation_seed_size_policy_exceeded", False):
        return "size-decline"
    if artifact.complete:
        return "complete-zero" if diagnostics["factor_base_size"] == 0 else "complete"
    assert diagnostics.get("context_relation_prefix_bound", False)
    if proof and diagnostics["factor_base_size"] == 10:
        return "live-prefix-proof"
    return "live-prefix"


def selected_resources(result: Any) -> dict[str, Any]:
    resources = result.diagnostics["resources"]
    names = (
        "relation_attempts",
        "relation_candidates",
        "relations",
        "presentation_extractions",
        "saturation_rounds",
        "cubic_relation_seed_uses",
        "cubic_relation_seed_relations",
        "cubic_relation_seed_materializations",
        "cubic_factor_base_seed_uses",
        "cubic_specialized_seed_skips",
    )
    return {name: resources.get(name, 0) for name in names}


# Warm every imported stage without retaining a measured field.
for warm_proof in (False, True):
    warm = make_field((-1, 2, 0, 1), "w")
    check_result(warm.class_unit_group(proof=warm_proof), 1, ())

records = []
for proof in (False, True):
    automatic_sum = 0.0
    prior_sum = sum(PRIOR_DIRECT[proof])
    for index, (label, coefficients, order, invariants, expected_mode) in enumerate(
        CASES
    ):
        automatic_samples = []
        explicit_samples = []
        legacy_samples = []
        phases = []
        resources = []
        observed_modes = []
        for warm_index in range(4):
            prepared_warm = make_field(coefficients, "w" + str(index) + str(warm_index))
            check_result(prepared_warm.class_unit_group(proof=proof), order, invariants)
            explicit_warm = make_field(coefficients, "e" + str(index) + str(warm_index))
            assert explicit_warm.class_number(proof=proof) == order
            check_result(explicit_warm.class_unit_group(proof=proof), order, invariants)
        original_projection = class_unit_module.cubic_class_number_projection

        def skip_zero_factor_base_preflight(
            field: Any, proof: bool | None = None
        ) -> int:
            del field, proof
            return 1

        if index == 0:
            class_unit_module.cubic_class_number_projection = (
                skip_zero_factor_base_preflight
            )
            for warm_index in range(4):
                legacy_warm = make_field(
                    coefficients, "z" + str(index) + str(warm_index)
                )
                check_result(
                    legacy_warm.class_unit_group(proof=proof), order, invariants
                )
            class_unit_module.cubic_class_number_projection = original_projection
        for sample in range(SAMPLES):
            modes = (
                ("automatic", "explicit", "legacy")
                if index == 0 and sample % 2 == 0
                else (
                    ("legacy", "explicit", "automatic")
                    if index == 0
                    else (
                        ("automatic", "explicit")
                        if sample % 2 == 0
                        else ("explicit", "automatic")
                    )
                )
            )
            for mode in modes:
                field = make_field(coefficients, mode[0] + str(index) + str(sample))
                class_unit_module.cubic_class_number_projection = (
                    skip_zero_factor_base_preflight
                    if mode == "legacy"
                    else original_projection
                )
                started = time.perf_counter()
                if mode == "explicit":
                    assert field.class_number(proof=proof) == order
                result = field.class_unit_group(proof=proof)
                elapsed = float(time.perf_counter() - started)
                check_result(result, order, invariants)
                if mode == "automatic":
                    observed_modes.append(artifact_mode(field, proof))
                    automatic_samples.append(elapsed)
                    phases.append(
                        {
                            key: float(value)
                            for key, value in result.diagnostics[
                                "phase_timings"
                            ].items()
                        }
                    )
                    resources.append(selected_resources(result))
                elif mode == "explicit":
                    observed_modes.append(artifact_mode(field, proof))
                    explicit_samples.append(elapsed)
                else:
                    assert field._bounded_cubic_class_number_artifact is None
                    legacy_samples.append(elapsed)
        class_unit_module.cubic_class_number_projection = original_projection
        automatic = median(automatic_samples)
        explicit = median(explicit_samples)
        prior = PRIOR_DIRECT[proof][index]
        automatic_sum += automatic
        required_mode = expected_mode
        if expected_mode == "proof-dependent":
            required_mode = "live-prefix-proof" if proof else "size-decline"
        assert all(mode == required_mode for mode in observed_modes)
        row = {
            "label": label,
            "proof": proof,
            "artifact_mode": required_mode,
            "automatic_seconds": automatic,
            "explicit_seconds": explicit,
            "automatic_over_explicit": automatic / explicit,
            "automatic_over_prior_direct": automatic / prior,
            "prior_direct_seconds": prior,
            "automatic_samples": automatic_samples,
            "explicit_samples": explicit_samples,
            "legacy_seconds": median(legacy_samples) if legacy_samples else None,
            "legacy_samples": legacy_samples,
            "phase_medians": {
                key: median([entry.get(key, 0.0) for entry in phases])
                for key in phases[0]
            },
            "resources": resources[len(resources) // 2],
        }
        print(
            "ROW",
            json.dumps(
                {
                    "label": label,
                    "proof": proof,
                    "automatic_seconds": automatic,
                    "explicit_seconds": explicit,
                    "automatic_over_prior_direct": automatic / prior,
                },
                sort_keys=True,
            ),
        )
        assert automatic <= 0.70
        assert automatic <= 1.05 * explicit
        if index == 0:
            assert automatic <= 1.02 * median(legacy_samples)
        else:
            assert automatic <= 0.50 * prior
        records.append(row)
    aggregate_ratio = automatic_sum / prior_sum
    assert aggregate_ratio <= (0.10 if proof else 0.18)

print(
    json.dumps(
        {
            "schema": "sagejs-cubic-auto-preflight-benchmark/v1",
            "boundary": "kernel-warm fresh field with prepared maximal order",
            "samples": SAMPLES,
            "prior_revision": "7fc836e632693fc176e95acf5a3e4a3f3c297581",
            "records": records,
        },
        sort_keys=True,
        default=str,
    )
)
