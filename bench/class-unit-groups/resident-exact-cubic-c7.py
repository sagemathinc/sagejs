"""Measure the first resident-exact cubic class-number vertical slice.

The maximal order is prepared before the single contiguous public timer.  A
fresh isomorphic field is used for every retained sample, and diagnostics plus
the proof-strength carrier are read only after the timer stops.  This is the
coarse C7 acceptance boundary; it is not assembled from nested phase clocks.
"""

from __future__ import annotations

import hashlib
import json
import os
import time

import sagejs.number_fields.cubic_class_number as cubic


COEFFICIENTS = (-1665, -576, -1, 1)
EXPECTED_CLASS_NUMBER = 9
SAMPLES = int(os.environ.get("SAGEJS_C7_SAMPLES", "1"))
WARMUPS = int(os.environ.get("SAGEJS_C7_WARMUPS", "1"))
if SAMPLES < 1 or WARMUPS < 0:
    raise ValueError("SAGEJS_C7 sample counts are invalid")

R = PolynomialRing(QQ, "x")
x = R.gen()


def make_field(coefficients: tuple[int, ...], name: str):
    polynomial = R(0)
    for exponent, coefficient in enumerate(coefficients):
        polynomial += coefficient * x**exponent
    field = NumberField(polynomial, name)
    field.maximal_order()
    return field


def retained_proof_receipt(field) -> dict[str, object]:
    """Detach and replay exactly the proof retained by the public scalar call.

    This work begins only after the complete public timer has stopped.  It is
    deliberately reported as its own boundary: eager proof materialization or
    replay must never be hidden in the C7 public speedup.
    """
    artifact = getattr(field, "_bounded_cubic_class_number_artifact", None)
    if artifact is not None and bool(getattr(artifact, "complete", False)):
        certificate = artifact.certificate
        if certificate is None:
            raise AssertionError("a complete cubic artifact lost its certificate")
        live_started = time.perf_counter_ns()
        live_verified = bool(certificate.verify())
        live_nanoseconds = time.perf_counter_ns() - live_started
        if not live_verified:
            raise AssertionError("live cubic certificate replay failed")
        payload_started = time.perf_counter_ns()
        payload = certificate.to_dict()
        payload_nanoseconds = time.perf_counter_ns() - payload_started
        detached_started = time.perf_counter_ns()
        detached = cubic.CubicMinkowskiClassNumberCertificate.from_dict(field, payload)
        detached_nanoseconds = time.perf_counter_ns() - detached_started
        if (
            detached.to_dict() != payload
            or detached.class_number != EXPECTED_CLASS_NUMBER
        ):
            raise AssertionError("detached cubic certificate changed canonical output")
        return {
            "carrier": "detached-cubic-certificate",
            "proof_status": str(artifact.proof_status),
            "canonical_sha256": str(certificate.stable_hash()),
            "payload_bytes": len(
                json.dumps(payload, sort_keys=True, separators=(",", ":"))
            ),
            "live_replay_nanoseconds": int(live_nanoseconds),
            "payload_nanoseconds": int(payload_nanoseconds),
            "detached_replay_nanoseconds": int(detached_nanoseconds),
            "diagnostics": dict(getattr(artifact, "diagnostics", {})),
        }

    # The coupled-engine route retains a complete live context rather than a
    # bounded cubic artifact.  Read it through public APIs after the scalar
    # timer and then replay the public class-group proof payload independently.
    context_started = time.perf_counter_ns()
    context = field.class_unit_group(proof=False)
    context_nanoseconds = time.perf_counter_ns() - context_started
    if context.complete is not True or context.class_number() != EXPECTED_CLASS_NUMBER:
        raise AssertionError("the retained class/unit result changed the scalar answer")
    group_started = time.perf_counter_ns()
    group = field.class_group(proof=False)
    group_nanoseconds = time.perf_counter_ns() - group_started
    if int(group.order()) != EXPECTED_CLASS_NUMBER:
        raise AssertionError("the retained class group changed the scalar answer")
    payload_started = time.perf_counter_ns()
    payload = group.proof_payload()
    payload_nanoseconds = time.perf_counter_ns() - payload_started
    detached_started = time.perf_counter_ns()
    detached_verified = bool(group.verify_proof_payload(payload))
    detached_nanoseconds = time.perf_counter_ns() - detached_started
    if not detached_verified:
        raise AssertionError("detached public class-group proof replay failed")
    payload_text = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return {
        "carrier": "detached-public-class-group-proof",
        "proof_status": str(context.proof_status),
        "canonical_sha256": hashlib.sha256(payload_text.encode("utf-8")).hexdigest(),
        "payload_bytes": len(payload_text),
        "context_retrieval_nanoseconds": int(context_nanoseconds),
        "group_projection_nanoseconds": int(group_nanoseconds),
        "payload_nanoseconds": int(payload_nanoseconds),
        "detached_replay_nanoseconds": int(detached_nanoseconds),
        "class_group_invariants": [int(value) for value in group.invariants()],
        "diagnostics": dict(context.diagnostics),
    }


# Warm frontend/native routing on a much smaller independent cubic. This does
# not populate any field-local public result used by a retained sample.
for warmup in range(WARMUPS):
    warm = make_field((1, 5, -1, 1), "c7_warm_" + str(warmup))
    assert int(warm.class_number(proof=False)) == 3

rows = []
retained_field = None
for sample in range(SAMPLES):
    field = make_field(COEFFICIENTS, "c7_" + str(sample))
    started = time.perf_counter_ns()
    answer = int(field.class_number(proof=False))
    elapsed = time.perf_counter_ns() - started
    assert answer == EXPECTED_CLASS_NUMBER
    retained_field = field
    rows.append(
        {
            "sample": sample,
            "nanoseconds": int(elapsed),
            "class_number": answer,
        }
    )

if retained_field is None:
    raise AssertionError("C7 retained no field for proof replay")
proof = retained_proof_receipt(retained_field)

print(
    "CUBIC_C7|"
    + json.dumps(
        {
            "schema": "sagejs.resident-exact-cubic-c7/v1",
            "label": "3.3.2989441.2",
            "coefficients": list(COEFFICIENTS),
            "proof_requested": False,
            "boundary": "prepared-order-contiguous-public-class-number",
            "samples": rows,
            "proof": proof,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
)
