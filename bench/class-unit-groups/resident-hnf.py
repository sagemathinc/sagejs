"""Benchmark resident exact HNF selection on authentic cubic workflows.

Run with a compiled resident kernel, for example:

```sh
SAGEJS_USE_SOURCE=1 SAGEJS_OPT_LEVEL=O2 \
  SAGEJS_RESIDENT_HNF_SAMPLES=7 \
  node bin/sagejs --python bench/class-unit-groups/resident-hnf.py
```

Each public scalar constructs a fresh isomorphic field and prepares its
maximal order before the timer.  The resident routes replace only the current
private relation-row selector, exactly as described in `RESIDENT-HNF.md`.
"""

from __future__ import annotations

import hashlib
import json
import os
import time

import sagejs.number_fields.class_group_matrix as matrix
import sagejs.number_fields.class_unit_groups as groups
import sagejs.number_fields.cubic_class_number as cubic


CASES = (
    ("3.1.588.1", (1, 5, -1, 1), 3),
    ("3.1.4027.2", (8, 7, -1, 1), 6),
    ("3.1.5448.1", (30, -14, -1, 1), 8),
)
SAMPLES = int(os.environ.get("SAGEJS_RESIDENT_HNF_SAMPLES", "5"))
WARMUPS = int(os.environ.get("SAGEJS_RESIDENT_HNF_WARMUPS", "1"))
TARGETS = tuple(
    target.strip()
    for target in os.environ.get(
        "SAGEJS_RESIDENT_HNF_TARGETS", "current,native,javascript"
    ).split(",")
    if target.strip()
)
ENFORCE = os.environ.get("SAGEJS_RESIDENT_HNF_ENFORCE") == "1"
if SAMPLES < 1 or WARMUPS < 0:
    raise ValueError("resident HNF sample counts are invalid")
if not TARGETS or any(
    target not in ("current", "native", "javascript", "python") for target in TARGETS
):
    raise ValueError("resident HNF targets are invalid")

R = PolynomialRing(QQ, "x")
x = R.gen()
original_selector = cubic._select_cubic_relation_candidates
original_support = matrix.exact_relation_hnf_support
original_basis = matrix.exact_relation_hnf_basis
original_determinant = matrix._determinant_exact
active_diagnostics: dict[str, int | float] | None = None


def median(values: list[float]) -> float:
    ordered = sorted(values)
    return float(ordered[len(ordered) // 2])


def counted_support(*args, **kwargs):
    if active_diagnostics is not None:
        active_diagnostics["boundary_calls"] += 1
    return original_support(*args, **kwargs)


def counted_basis(*args, **kwargs):
    if active_diagnostics is not None:
        active_diagnostics["boundary_calls"] += 1
    return original_basis(*args, **kwargs)


def counted_determinant(*args, **kwargs):
    if active_diagnostics is not None:
        active_diagnostics["boundary_calls"] += 1
    return original_determinant(*args, **kwargs)


matrix.exact_relation_hnf_support = counted_support
matrix.exact_relation_hnf_basis = counted_basis
matrix._determinant_exact = counted_determinant


def measured_current_selector(matrix_module, initial_rows, candidates, width):
    global active_diagnostics
    diagnostics: dict[str, int | float] = {
        "selector_calls": 1,
        "boundary_calls": 0,
        "packed_input_bytes": 0,
        "published_output_values": 0,
        "hnf_calls": 0,
        "deletion_trials": 0,
        "selector_seconds": 0.0,
    }
    active_diagnostics = diagnostics
    started = time.perf_counter()
    try:
        answer = original_selector(matrix_module, initial_rows, candidates, width)
    finally:
        diagnostics["selector_seconds"] = time.perf_counter() - started
        active_diagnostics = None
    sample_diagnostics.append(diagnostics)
    return answer


resident_target = "native"


def measured_resident_selector(matrix_module, initial_rows, candidates, width):
    started = time.perf_counter()
    rows = tuple(entry[0] for entry in candidates)
    answer = matrix_module.resident_exact_relation_hnf_selection(
        initial_rows,
        rows,
        width,
        backend=resident_target,
    )
    if not answer.deletion_complete:
        raise ArithmeticError("authentic resident HNF deletion did not complete")
    sample_diagnostics.append(
        {
            "selector_calls": 1,
            "boundary_calls": answer.boundary_calls,
            "packed_input_bytes": answer.packed_input_bytes,
            "published_output_values": answer.published_output_values,
            "hnf_calls": answer.hnf_calls,
            "deletion_trials": answer.deletion_trials,
            "selector_seconds": time.perf_counter() - started,
        }
    )
    if answer.rank < 1:
        return None, 0
    return (
        tuple(candidates[index] for index in answer.selected_candidate_indices),
        answer.rank,
    )


def make_field(coefficients: tuple[int, ...], name: str):
    polynomial = R(0)
    for exponent, coefficient in enumerate(coefficients):
        polynomial += coefficient * x**exponent
    field = NumberField(polynomial, name)
    field.maximal_order()
    return field


def digest_presentation(payload: dict[str, object]) -> str:
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def retained_proof_evidence(field, artifact, proof: bool):
    """Verify the exact public scalar's retained proof carrier."""
    certificate = artifact.certificate
    if artifact.complete:
        assert certificate is not None and certificate.verify()
        payload = certificate.to_dict()
        detached = cubic.CubicMinkowskiClassNumberCertificate.from_dict(field, payload)
        assert detached.to_dict() == payload and detached.verify()
        return (
            artifact.proof_status,
            certificate.presentation,
            "detached-cubic-certificate",
        )

    projections = tuple(field._class_number_projection_cache.values())
    assert projections
    projection = projections[-1]
    assert projection.matches(field, proof)
    presentation = projection._continuation[3]
    assert presentation.verify()
    payload = presentation.to_dict()
    detached = matrix.RelationPresentation.from_dict(payload)
    assert detached.to_dict() == payload and detached.verify()
    return projection.proof_status, payload, "live-projection-presentation"


records: list[dict[str, object]] = []
presentation_oracles: dict[tuple[str, bool], str] = {}
sample_diagnostics: list[dict[str, int | float]] = []
try:
    for proof in (False, True):
        for case_index, (label, coefficients, expected) in enumerate(CASES):
            for warmup in range(WARMUPS):
                for target in TARGETS:
                    resident_target = target
                    cubic._select_cubic_relation_candidates = (
                        measured_current_selector
                        if target == "current"
                        else measured_resident_selector
                    )
                    sample_diagnostics = []
                    field = make_field(
                        coefficients,
                        "resident_warm_"
                        + str(proof)
                        + "_"
                        + str(case_index)
                        + "_"
                        + target
                        + "_"
                        + str(warmup),
                    )
                    assert (
                        groups.cubic_class_number_projection(field, proof=proof)
                        == expected
                    )

            target_seconds = {target: [] for target in TARGETS}
            target_diagnostics = {target: [] for target in TARGETS}
            retained = {}
            for sample in range(SAMPLES):
                # Rotate target order so allocator/thermal drift is not
                # assigned systematically to one implementation.
                ordered_targets = (
                    TARGETS[sample % len(TARGETS) :] + TARGETS[: sample % len(TARGETS)]
                )
                for target in ordered_targets:
                    resident_target = target
                    cubic._select_cubic_relation_candidates = (
                        measured_current_selector
                        if target == "current"
                        else measured_resident_selector
                    )
                    sample_diagnostics = []
                    field = make_field(
                        coefficients,
                        "resident_sample_"
                        + str(proof)
                        + "_"
                        + str(case_index)
                        + "_"
                        + target
                        + "_"
                        + str(sample),
                    )
                    started = time.perf_counter()
                    class_number = groups.cubic_class_number_projection(
                        field, proof=proof
                    )
                    elapsed = time.perf_counter() - started
                    assert class_number == expected
                    artifact = field._bounded_cubic_class_number_artifact
                    assert artifact is not None
                    target_seconds[target].append(elapsed)
                    target_diagnostics[target].append(
                        {
                            key: sum(float(row[key]) for row in sample_diagnostics)
                            for key in (
                                "selector_calls",
                                "boundary_calls",
                                "packed_input_bytes",
                                "published_output_values",
                                "hnf_calls",
                                "deletion_trials",
                                "selector_seconds",
                            )
                        }
                    )
                    retained[target] = (field, artifact)

            for target in TARGETS:
                resident_target = target
                seconds = target_seconds[target]
                diagnostics_samples = target_diagnostics[target]
                retained_field, retained_artifact = retained[target]
                proof_status, presentation_payload, proof_carrier = (
                    retained_proof_evidence(retained_field, retained_artifact, proof)
                )
                presentation_digest = digest_presentation(presentation_payload)
                oracle_key = (label, proof)
                if target != "python" and oracle_key in presentation_oracles:
                    assert presentation_oracles[oracle_key] == presentation_digest
                elif target != "python":
                    presentation_oracles[oracle_key] = presentation_digest
                diagnostic_names = diagnostics_samples[0]
                record = {
                    "label": label,
                    "proof": proof,
                    "target": target,
                    "class_number": expected,
                    "proof_status": proof_status,
                    "proof_carrier": proof_carrier,
                    "presentation_sha256": presentation_digest,
                    "seconds": median(seconds),
                    "samples": seconds,
                    "selector": {
                        name: median(
                            [float(sample[name]) for sample in diagnostics_samples]
                        )
                        for name in diagnostic_names
                    },
                }
                records.append(record)
                print("ROW", json.dumps(record, sort_keys=True))
finally:
    cubic._select_cubic_relation_candidates = original_selector
    matrix.exact_relation_hnf_support = original_support
    matrix.exact_relation_hnf_basis = original_basis
    matrix._determinant_exact = original_determinant

comparisons = []
for proof in (False, True):
    for label, _coefficients, _expected in CASES:
        current = next(
            (
                record
                for record in records
                if record["label"] == label
                and record["proof"] == proof
                and record["target"] == "current"
            ),
            None,
        )
        if current is None:
            continue
        for target in ("native", "javascript", "python"):
            resident = next(
                (
                    record
                    for record in records
                    if record["label"] == label
                    and record["proof"] == proof
                    and record["target"] == target
                ),
                None,
            )
            if resident is None:
                continue
            improvement = 1.0 - float(resident["seconds"]) / float(current["seconds"])
            comparisons.append(
                {
                    "label": label,
                    "proof": proof,
                    "target": target,
                    "improvement": improvement,
                }
            )

if ENFORCE:
    native = [row for row in comparisons if row["target"] == "native"]
    hard = [
        row for row in native if row["label"] == "3.1.4027.2" and row["proof"] is True
    ]
    neighbors = [row for row in native if row["label"] != "3.1.4027.2"]
    if not hard or any(float(row["improvement"]) < 0.08 for row in hard):
        raise AssertionError("resident HNF missed the 4027 end-to-end target")
    if any(float(row["improvement"]) < -0.03 for row in neighbors):
        raise AssertionError("resident HNF regressed a neighboring cubic")

print(
    "RESULT",
    json.dumps(
        {
            "schema": "sagejs-resident-exact-relation-hnf/v1",
            "samples": SAMPLES,
            "warmups": WARMUPS,
            "targets": TARGETS,
            "optimization_level": os.environ.get("SAGEJS_OPT_LEVEL", "default"),
            "records": records,
            "comparisons": comparisons,
        },
        sort_keys=True,
    ),
)
