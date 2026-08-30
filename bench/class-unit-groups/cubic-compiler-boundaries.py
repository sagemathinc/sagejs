"""Profile authentic cubic class-number boundaries and execution targets.

Run this file with the Sage.js Python frontend, for example:

```sh
SAGEJS_USE_SOURCE=1 SAGEJS_OPT_LEVEL=O2 \
  SAGEJS_CUBIC_PROFILE_SAMPLES=7 \
  node bin/sagejs --python \
  bench/class-unit-groups/cubic-compiler-boundaries.py
```

Set `SAGEJS_CUBIC_KERNEL_TARGET=javascript` to force the generated JavaScript
fallbacks for the two packed relation-sieve kernels.  The benchmark checks the
same exact class numbers in either mode.  Boundary timings are inclusive and
nested; they are diagnostic attribution, not additive phase totals.
"""

from __future__ import annotations

import functools
import hashlib
import json
import os
import time

import sagejs.native as native
import sagejs.number_fields.bl_composite_kernel as kernels
import sagejs.number_fields.class_group_matrix as matrix
import sagejs.number_fields.class_unit_groups as groups
import sagejs.number_fields.cubic_class_number as cubic
import sagejs.number_fields.ideal_arithmetic as ideals


CASES = (
    ("3.1.588.1", (1, 5, -1, 1), 3),
    ("3.1.4027.2", (8, 7, -1, 1), 6),
    ("3.1.5448.1", (30, -14, -1, 1), 8),
)
SAMPLES = int(os.environ.get("SAGEJS_CUBIC_PROFILE_SAMPLES", "5"))
WARMUPS = int(os.environ.get("SAGEJS_CUBIC_PROFILE_WARMUPS", "1"))
PROFILE_MODE = os.environ.get("SAGEJS_CUBIC_PROFILE_MODE", "full")
TARGET = os.environ.get("SAGEJS_CUBIC_KERNEL_TARGET", "native")
KERNEL_CALLS = int(os.environ.get("SAGEJS_CUBIC_KERNEL_CALLS", "200"))
KERNEL_BATCHES = int(os.environ.get("SAGEJS_CUBIC_KERNEL_BATCHES", "5"))
KERNEL_WARMUPS = int(os.environ.get("SAGEJS_CUBIC_KERNEL_WARMUPS", "50"))
if SAMPLES < 1 or WARMUPS < 0:
    raise ValueError("SAGEJS_CUBIC_PROFILE sample counts are invalid")
if PROFILE_MODE not in ("full", "targets"):
    raise ValueError("SAGEJS_CUBIC_PROFILE_MODE must be full or targets")
if KERNEL_CALLS < 1 or KERNEL_BATCHES < 1 or KERNEL_WARMUPS < 0:
    raise ValueError("SAGEJS_CUBIC_KERNEL sample counts are invalid")
if TARGET not in ("native", "javascript"):
    raise ValueError("SAGEJS_CUBIC_KERNEL_TARGET must be native or javascript")

R = PolynomialRing(QQ, "x")
x = R.gen()
active: dict[str, list[float]] | None = None


def median(values: list[float]) -> float:
    ordered = sorted(values)
    return float(ordered[len(ordered) // 2])


def record(name: str, started: float) -> None:
    if active is None:
        return
    row = active.setdefault(name, [0.0, 0.0])
    row[0] += 1
    row[1] += time.perf_counter() - started


def wrap(module, name: str) -> None:
    original = getattr(module, name)

    @functools.wraps(original)
    def measured(*args, **kwargs):
        started = time.perf_counter()
        try:
            return original(*args, **kwargs)
        finally:
            record(name, started)

    setattr(module, name, measured)


for module, names in (
    (
        native,
        (
            "kernel_integer_buffer",
            "kernel_integer_zeros",
            "integer_buffer_values",
        ),
    ),
    (
        ideals,
        (
            "packed_ideal_power_basis_chains_from_bases",
            "packed_valuation_power_bases",
        ),
    ),
    (
        matrix,
        (
            "resident_exact_relation_hnf_selection",
            "exact_relation_hnf_support",
            "exact_relation_hnf_basis",
            "_determinant_exact",
            "extract_relation_presentation",
        ),
    ),
    (
        cubic,
        (
            "packed_cubic_factor_records",
            "_order_cubic_norm_form_coefficients",
            "_packed_principal_factor_proposals",
            "_packed_cubic_relation_candidates",
            "_select_cubic_relation_candidates",
            "_validated_cubic_integral_relation_batch",
            "_materialize_packed_cubic_factor_records",
        ),
    ),
):
    for function_name in names:
        wrap(module, function_name)


candidate_kernel = kernels.packed_cubic_norm_smooth_candidates_in_place
row_kernel = kernels.packed_factor_base_rows_in_place
if TARGET == "javascript":
    candidate_kernel = candidate_kernel.javascript
    row_kernel = row_kernel.javascript
cubic._cubic_relation_sieve_kernel_override = (
    None if TARGET == "native" else (candidate_kernel, row_kernel)
)


def make_field(coefficients: tuple[int, ...], name: str):
    polynomial = R(0)
    for exponent, coefficient in enumerate(coefficients):
        polynomial += coefficient * x**exponent
    field = NumberField(polynomial, name)
    field.maximal_order()
    return field


def candidate_kernel_targets() -> list[dict[str, object]]:
    """Compare the two target bodies without changing proof authority."""

    norm_form = (1, 12, 144, 7, 13, -9, 75, 12, 180, -9)
    rational_primes = (2, 3, 5, 7, 11)
    capacity = 128
    call_count = KERNEL_CALLS
    batch_count = KERNEL_BATCHES

    def buffers(function):
        return (
            native.kernel_integer_zeros(function, 4, 1),
            native.kernel_integer_zeros(function, 3 * capacity, 16),
            native.kernel_integer_zeros(function, capacity, 16),
            native.kernel_integer_buffer(function, norm_form),
            native.kernel_integer_buffer(function, rational_primes),
        )

    def invoke(function, values) -> None:
        assert function(*values, 4, capacity)

    answer: list[dict[str, object]] = []
    packed = kernels.packed_cubic_norm_smooth_candidates_in_place
    for target_name, function in (
        ("native", packed),
        ("javascript", packed.javascript),
    ):
        values = buffers(function)
        for _warmup in range(KERNEL_WARMUPS):
            invoke(function, values)
        call_samples: list[float] = []
        for _batch in range(batch_count):
            started = time.perf_counter_ns()
            for _call in range(call_count):
                invoke(function, values)
            call_samples.append((time.perf_counter_ns() - started) / call_count)
        inclusive_samples: list[float] = []
        for _batch in range(batch_count):
            started = time.perf_counter_ns()
            for _call in range(50):
                current = buffers(function)
                invoke(function, current)
                tuple(native.integer_buffer_values(current[0]))
            inclusive_samples.append((time.perf_counter_ns() - started) / 50)
        metadata = tuple(
            int(value) for value in native.integer_buffer_values(values[0])
        )
        assert metadata == (105, 364, 0, 4)
        answer.append(
            {
                "target": target_name,
                "route_selector": (
                    "native-wrapper"
                    if target_name == "native"
                    else "explicit-javascript-property"
                ),
                "callable_compiled": native.is_compiled(function),
                "call_execution_mode": native.execution_mode(
                    function, *values, 4, capacity
                ),
                "call_nanoseconds": median(call_samples),
                "call_samples_nanoseconds": call_samples,
                "buffer_inclusive_nanoseconds": median(inclusive_samples),
                "buffer_inclusive_samples_nanoseconds": inclusive_samples,
                "metadata": metadata,
            }
        )
    return answer


def digest_payload(payload: dict[str, object]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def retained_proof_evidence(field, artifact, proof: bool):
    """Verify and detach the exact presentation retained by the public call."""

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


def profile_records() -> list[dict[str, object]]:
    answer_records: list[dict[str, object]] = []
    if PROFILE_MODE != "full":
        return answer_records
    global active
    for proof in (False, True):
        for case_index, (label, coefficients, expected) in enumerate(CASES):
            for warmup in range(WARMUPS):
                warm = make_field(coefficients, f"warm_{proof}_{case_index}_{warmup}")
                assert (
                    groups.cubic_class_number_projection(warm, proof=proof) == expected
                )
            samples: list[float] = []
            field_setup_samples: list[float] = []
            boundary_samples: list[dict[str, tuple[int, float]]] = []
            retained_field = None
            retained_artifact = None
            for sample in range(SAMPLES):
                field_started = time.perf_counter()
                field = make_field(coefficients, f"field_{proof}_{case_index}_{sample}")
                field_setup_samples.append(time.perf_counter() - field_started)
                active = {}
                started = time.perf_counter()
                result = groups.cubic_class_number_projection(field, proof=proof)
                elapsed = time.perf_counter() - started
                captured = active
                active = None
                assert result == expected
                artifact = field._bounded_cubic_class_number_artifact
                assert artifact is not None
                retained_field = field
                retained_artifact = artifact
                samples.append(elapsed)
                boundary_samples.append(
                    {
                        name: (int(values[0]), float(values[1]))
                        for name, values in captured.items()
                    }
                )
            assert retained_field is not None and retained_artifact is not None
            presentation_started = time.perf_counter()
            proof_status, presentation, proof_carrier = retained_proof_evidence(
                retained_field, retained_artifact, proof
            )
            presentation_seconds = time.perf_counter() - presentation_started
            names = sorted({name for row in boundary_samples for name in row})
            record_payload = {
                "label": label,
                "proof": proof,
                "class_number": expected,
                "seconds": median(samples),
                "samples": samples,
                "proof_status": proof_status,
                "proof_carrier": proof_carrier,
                "presentation_sha256": digest_payload(presentation),
                "presentation_bytes": len(
                    json.dumps(presentation, sort_keys=True, separators=(",", ":"))
                ),
                "phases": {
                    "class_number": {
                        "samples_seconds": samples,
                        "median_seconds": median(samples),
                    },
                    "field_setup": {
                        "samples_seconds": field_setup_samples,
                        "median_seconds": median(field_setup_samples),
                    },
                    "presentation": {"seconds": presentation_seconds},
                },
                "boundaries": {
                    name: {
                        "calls": int(
                            median(
                                [
                                    float(row.get(name, (0, 0.0))[0])
                                    for row in boundary_samples
                                ]
                            )
                        ),
                        "seconds": median(
                            [
                                float(row.get(name, (0, 0.0))[1])
                                for row in boundary_samples
                            ]
                        ),
                    }
                    for name in names
                },
            }
            answer_records.append(record_payload)
            print("ROW", json.dumps(record_payload, sort_keys=True))
    return answer_records


records = profile_records()

cubic._cubic_relation_sieve_kernel_override = None
print(
    "RESULT",
    json.dumps(
        {
            "schema": "sagejs-cubic-compiler-boundaries/v1",
            "optimization_level": os.environ.get("SAGEJS_OPT_LEVEL", "default"),
            "profile_mode": PROFILE_MODE,
            "kernel_target": TARGET,
            "candidate_kernel_targets": candidate_kernel_targets(),
            "samples": SAMPLES,
            "warmups": WARMUPS,
            "records": records,
        },
        sort_keys=True,
    ),
)
