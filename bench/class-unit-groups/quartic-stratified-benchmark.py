"""Benchmark the pinned higher-discriminant quartic class-number corpus."""

from __future__ import annotations

import json
import math
import os
import time
from typing import Any

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
FIXTURE = os.environ.get(
    "SAGEJS_QUARTIC_STRATIFIED_FIXTURE",
    os.path.join(
        ROOT,
        "test/fixtures/number-field-lmfdb-quartic-stratified.json",
    ),
)
ROLE = os.environ.get("SAGEJS_QUARTIC_STRATIFIED_ROLE", "smoke")
PROOF_MODE = os.environ.get("SAGEJS_QUARTIC_STRATIFIED_PROOF", "both")
SAMPLES = int(os.environ.get("SAGEJS_QUARTIC_STRATIFIED_SAMPLES", "1"))
LIMIT = int(os.environ.get("SAGEJS_QUARTIC_STRATIFIED_LIMIT", "0"))
LABELS = tuple(
    label
    for label in os.environ.get("SAGEJS_QUARTIC_STRATIFIED_LABELS", "").split(",")
    if label
)
FINISH_GROUP = os.environ.get("SAGEJS_QUARTIC_STRATIFIED_FINISH_GROUP", "0") == "1"
VERIFY_GROUP = os.environ.get("SAGEJS_QUARTIC_STRATIFIED_VERIFY_GROUP", "0") == "1"
IMPLEMENTATION = os.environ.get("SAGEJS_QUARTIC_STRATIFIED_IMPLEMENTATION", "sagejs")
OUTPUT = os.environ.get("SAGEJS_QUARTIC_STRATIFIED_OUTPUT")

if IMPLEMENTATION == "sagejs":
    import sagejs.number_fields.class_unit_groups as class_unit_module
elif IMPLEMENTATION == "sage-pari":
    from sage.all import NumberField, PolynomialRing, QQ
else:
    raise ValueError(
        "SAGEJS_QUARTIC_STRATIFIED_IMPLEMENTATION must be sagejs or sage-pari"
    )


def median(values: list[float]) -> float:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[middle])
    return float((ordered[middle - 1] + ordered[middle]) / 2)


def polynomial_from_coefficients(coefficients: list[str]) -> Any:
    ring = PolynomialRing(QQ, "x")
    x = ring.gen()
    polynomial = ring(0)
    for exponent in range(len(coefficients)):
        polynomial += int(coefficients[exponent]) * x**exponent
    return polynomial


def selected_proofs() -> tuple[bool, ...]:
    if PROOF_MODE == "both":
        return (False, True)
    if PROOF_MODE == "false":
        return (False,)
    if PROOF_MODE == "true":
        return (True,)
    raise ValueError("SAGEJS_QUARTIC_STRATIFIED_PROOF must be false, true, or both")


def projection_for(field: Any, proof: bool) -> Any:
    if IMPLEMENTATION != "sagejs":
        return None
    limits = class_unit_module.ClassUnitEngineLimits()
    key = class_unit_module._class_number_projection_cache_key(proof, limits)
    projection = class_unit_module._cached_class_number_projection(field, key, proof)
    if projection is not None and not projection.matches(field, proof):
        raise ArithmeticError(
            "the quartic scalar request retained an invalid projection"
        )
    return projection


def projection_shape(projection: Any) -> dict[str, Any]:
    if projection is None:
        return {}
    continuation = getattr(projection, "_continuation", None)
    if continuation is not None:
        plan = continuation[0]
        factor_base = continuation[1]
        collector = continuation[2]
        presentation = continuation[3]
        return {
            "kind": "class-unit-index-one",
            "factor_base_bound": int(plan.bound),
            "factor_base_size": len(factor_base),
            "retained_relations": len(collector.records),
            "presentation_order": int(presentation.order),
        }
    arithmetic = getattr(projection, "_arithmetic", None)
    if arithmetic is None:
        raise ArithmeticError("the quartic projection has no retained proof state")
    plan = json.loads(arithmetic._plan_json)
    factor_base = json.loads(arithmetic._factor_base_json)
    return {
        "kind": "minkowski-class-number-one",
        "factor_base_bound": int(plan["bound"]),
        "factor_base_size": len(factor_base),
        "retained_relations": len(factor_base),
        "presentation_order": 1,
    }


def resource_projection(resources: dict[str, Any]) -> dict[str, Any]:
    names = (
        "factor_base_candidates",
        "factor_base_prime_ideals",
        "relation_attempts",
        "relation_candidates",
        "relations",
        "presentation_extractions",
        "quartic_factor_base_seed_uses",
        "quartic_relation_seed_relations",
        "quartic_class_number_relation_saturation_first_uses",
        "class_number_post_saturation_projections",
        "deferred_saturation_certificate_constructions",
        "deferred_minkowski_certificate_constructions",
        "analytic_primes",
        "analytic_prime_power_terms",
    )
    return {
        name: resources[name]
        for name in names
        if name in resources and isinstance(resources[name], (int, float, str, bool))
    }


def dominant_phase(phases: dict[str, float]) -> tuple[str | None, float | None]:
    candidates = tuple(
        (name, float(value))
        for name, value in phases.items()
        if name != "total" and isinstance(value, (int, float))
    )
    if not candidates:
        return None, None
    return max(candidates, key=lambda value: value[1])


def run_sample(record: dict[str, Any], proof: bool, sample: int) -> dict[str, Any]:
    polynomial = polynomial_from_coefficients(record["coefficients"])
    field_started = time.perf_counter_ns()
    field = NumberField(
        polynomial,
        "a_"
        + record["label"].replace(".", "_")
        + "_"
        + str(int(proof))
        + "_"
        + str(sample),
    )
    field_seconds = (time.perf_counter_ns() - field_started) / 1_000_000_000
    order_started = time.perf_counter_ns()
    field.maximal_order()
    maximal_order_seconds = (time.perf_counter_ns() - order_started) / 1_000_000_000

    scalar_started = time.perf_counter_ns()
    try:
        answer = int(field.class_number(proof=proof))
    except Exception as error:
        scalar_seconds = (time.perf_counter_ns() - scalar_started) / 1_000_000_000
        failed = {
            "ok": False,
            "label": record["label"],
            "role": record["selection"]["role"],
            "stratum": record["selection"]["stratum"],
            "proof": proof,
            "sample": sample,
            "expected_class_number": int(record["class_number"]),
            "class_group": list(record["class_group"]),
            "field_seconds": field_seconds,
            "maximal_order_seconds": maximal_order_seconds,
            "class_number_seconds": scalar_seconds,
            "error_type": type(error).__name__,
            "error": str(error),
        }
        print(
            "QUARTIC_STRATIFIED_PROGRESS|"
            + json.dumps(
                {
                    "label": record["label"],
                    "proof": proof,
                    "sample": sample,
                    "seconds": scalar_seconds,
                    "error": str(error),
                },
                sort_keys=True,
                separators=(",", ":"),
            ),
            flush=True,
        )
        return failed
    scalar_seconds = (time.perf_counter_ns() - scalar_started) / 1_000_000_000
    if answer != int(record["class_number"]):
        raise ArithmeticError(record["label"] + ": Sage.js class number disagrees")
    projection = projection_for(field, proof)
    if projection is None:
        engine = None
        before_resources = {}
        scalar_phases = {}
        phase_name, phase_seconds = None, None
        retained_group = getattr(field, "_global_class_group_cache", None)
        proof_status = str(
            getattr(
                retained_group,
                "proof_status",
                "exact-unconditional" if proof else "exact-relations-conditional-grh",
            )
        )
        projection_description = {
            "kind": (
                "complete-minkowski-group" if retained_group is not None else "none"
            )
        }
    else:
        engine = projection._engine
        before_resources = resource_projection(dict(engine._resource_usage))
        scalar_phases = dict(engine._phase_timings)
        phase_name, phase_seconds = dominant_phase(scalar_phases)
        proof_status = str(projection.proof_status)
        projection_description = projection_shape(projection)

    class_group_seconds = None
    verification_seconds = None
    group_status = None
    after_resources = before_resources
    if FINISH_GROUP:
        group_started = time.perf_counter_ns()
        group = field.class_group(proof=proof)
        class_group_seconds = (time.perf_counter_ns() - group_started) / 1_000_000_000
        invariants = sorted(str(int(value)) for value in group.invariants())
        if invariants != record["class_group"] or int(group.order()) != answer:
            raise ArithmeticError(record["label"] + ": Sage.js class group disagrees")
        group_status = str(getattr(group, "proof_status", proof_status))
        if VERIFY_GROUP:
            if IMPLEMENTATION != "sagejs":
                raise ValueError(
                    "group verification is a Sage.js-only benchmark boundary"
                )
            verify_started = time.perf_counter_ns()
            if group.verify() is not True:
                raise ArithmeticError(record["label"] + ": public proof replay failed")
            verification_seconds = (
                time.perf_counter_ns() - verify_started
            ) / 1_000_000_000
        if engine is not None:
            after_resources = resource_projection(dict(engine._resource_usage))

    result = {
        "ok": True,
        "label": record["label"],
        "role": record["selection"]["role"],
        "stratum": record["selection"]["stratum"],
        "proof": proof,
        "sample": sample,
        "class_number": answer,
        "class_group": list(record["class_group"]),
        "proof_status": proof_status,
        "group_proof_status": group_status,
        "field_seconds": field_seconds,
        "maximal_order_seconds": maximal_order_seconds,
        "class_number_seconds": scalar_seconds,
        "class_group_suffix_seconds": class_group_seconds,
        "verification_seconds": verification_seconds,
        "dominant_scalar_phase": phase_name,
        "dominant_scalar_phase_seconds": phase_seconds,
        "scalar_phase_timings": scalar_phases,
        "projection": projection_description,
        "resources_before_group": before_resources,
        "resources_after_group": after_resources,
    }
    print(
        "QUARTIC_STRATIFIED_PROGRESS|"
        + json.dumps(
            {
                "label": record["label"],
                "proof": proof,
                "sample": sample,
                "seconds": scalar_seconds,
                "group_suffix_seconds": class_group_seconds,
            },
            sort_keys=True,
            separators=(",", ":"),
        ),
        flush=True,
    )
    return result


with open(FIXTURE, encoding="utf-8") as stream:
    fixture = json.load(stream)

if fixture.get("schema") != "sagejs.number-fields/lmfdb-quartic-stratified-corpus-v1":
    raise ValueError("unsupported quartic corpus fixture")
if ROLE == "all":
    cases = list(fixture["records"])
elif ROLE in ("smoke", "tune", "holdout"):
    cases = [
        record for record in fixture["records"] if record["selection"]["role"] == ROLE
    ]
else:
    raise ValueError(
        "SAGEJS_QUARTIC_STRATIFIED_ROLE must be smoke, tune, holdout, or all"
    )
if LABELS:
    selected_labels = set(LABELS)
    cases = [record for record in cases if record["label"] in selected_labels]
    if len(cases) != len(selected_labels):
        raise ValueError("one or more requested quartic labels are outside the role")
if LIMIT > 0:
    cases = cases[:LIMIT]
if not cases or SAMPLES < 1:
    raise ValueError("the quartic benchmark needs at least one case and sample")

observations = []
for case in cases:
    for selected_proof in selected_proofs():
        for sample_index in range(SAMPLES):
            observations.append(run_sample(case, selected_proof, sample_index))

rows = []
for case in cases:
    for selected_proof in selected_proofs():
        samples = [
            observation
            for observation in observations
            if observation["label"] == case["label"]
            and observation["proof"] == selected_proof
        ]
        successful = [sample for sample in samples if sample["ok"]]
        scalar_values = [sample["class_number_seconds"] for sample in successful]
        group_values = [
            sample["class_group_suffix_seconds"]
            for sample in successful
            if sample["class_group_suffix_seconds"] is not None
        ]
        verification_values = [
            sample["verification_seconds"]
            for sample in successful
            if sample["verification_seconds"] is not None
        ]
        representative = successful[len(successful) // 2] if successful else None
        rows.append(
            {
                "label": case["label"],
                "role": case["selection"]["role"],
                "stratum": case["selection"]["stratum"],
                "discriminant_absolute": case["discriminant_absolute"],
                "signature": [case["r1"], case["r2"]],
                "class_number": int(case["class_number"]),
                "class_group": list(case["class_group"]),
                "proof": selected_proof,
                "ok_samples": len(successful),
                "failed_samples": len(samples) - len(successful),
                "errors": sorted(
                    {sample["error"] for sample in samples if not sample["ok"]}
                ),
                "class_number_median_seconds": (
                    median(scalar_values) if scalar_values else None
                ),
                "class_group_suffix_median_seconds": (
                    median(group_values) if group_values else None
                ),
                "verification_median_seconds": (
                    median(verification_values) if verification_values else None
                ),
                "dominant_scalar_phase": (
                    representative["dominant_scalar_phase"]
                    if representative is not None
                    else None
                ),
                "dominant_scalar_phase_seconds": (
                    representative["dominant_scalar_phase_seconds"]
                    if representative is not None
                    else None
                ),
                "projection": (
                    representative["projection"] if representative is not None else None
                ),
                "resources": (
                    representative["resources_before_group"]
                    if representative is not None
                    else None
                ),
            }
        )

scalar_medians = [
    row["class_number_median_seconds"]
    for row in rows
    if row["class_number_median_seconds"] is not None
]
geometric_mean_seconds = (
    math.exp(sum(math.log(value) for value in scalar_medians) / len(scalar_medians))
    if scalar_medians
    else None
)
payload = {
    "schema": "sagejs-benchmark/quartic-stratified-class-number-v1",
    "implementation": IMPLEMENTATION,
    "fixture_records_sha256": fixture["checksums"]["records_sha256"],
    "boundary": "fresh field with maximal order prepared outside scalar timer",
    "role": ROLE,
    "labels": list(LABELS),
    "proof_mode": PROOF_MODE,
    "samples": SAMPLES,
    "finish_group": FINISH_GROUP,
    "verify_group": VERIFY_GROUP,
    "ok_observations": len(
        [observation for observation in observations if observation["ok"]]
    ),
    "failed_observations": len(
        [observation for observation in observations if not observation["ok"]]
    ),
    "geometric_mean_class_number_seconds": geometric_mean_seconds,
    "rows": rows,
    "observations": observations,
}
encoded_payload = json.dumps(payload, sort_keys=True, separators=(",", ":"))
if OUTPUT:
    with open(OUTPUT, "w", encoding="utf-8") as stream:
        stream.write(encoded_payload + "\n")
print("QUARTIC_STRATIFIED_BENCHMARK|" + encoded_payload)
