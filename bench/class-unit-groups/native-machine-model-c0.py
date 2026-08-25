"""Stage-resolved C0 profile for the native mathematical machine model sprint.

This is intentionally a production-shaped witness, not a microbenchmark.  It
separates exact proposal generation, authentication, admission, publication,
first observation, authenticated live reads, bulk serialization, and detached
replay for the nontrivial cubic class-number example of discriminant `-1083`.
"""

from __future__ import annotations

import json
import platform
import time
from typing import Any, Callable

from sagejs.number_fields import class_group_relations as relation_module
from sagejs.number_fields import cubic_class_number as cubic_module


timings: dict[str, list[float]] = {}
counts: dict[str, int] = {}


def _record(name: str, elapsed: float) -> None:
    timings.setdefault(name, []).append(float(elapsed))
    counts[name] = counts.get(name, 0) + 1


def _wrap_function(module: Any, name: str, stage: str) -> Callable[..., Any]:
    original = getattr(module, name)

    def wrapped(*args: Any, **kwargs: Any) -> Any:
        started = time.perf_counter()
        try:
            return original(*args, **kwargs)
        finally:
            _record(stage, time.perf_counter() - started)

    setattr(module, name, wrapped)
    return original


def _wrap_method(owner: Any, name: str, stage: str) -> Callable[..., Any]:
    original = getattr(owner, name)

    def wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:
        started = time.perf_counter()
        try:
            return original(self, *args, **kwargs)
        finally:
            _record(stage, time.perf_counter() - started)

    setattr(owner, name, wrapped)
    return original


originals = [
    (
        cubic_module,
        "_packed_cubic_relation_candidates",
        _wrap_function(
            cubic_module,
            "_packed_cubic_relation_candidates",
            "proposal_generation",
        ),
    ),
    (
        cubic_module,
        "_validated_cubic_integral_relation_batch",
        _wrap_function(
            cubic_module,
            "_validated_cubic_integral_relation_batch",
            "authority_construction",
        ),
    ),
    (
        relation_module._ValidatedIntegralRelationBatch,
        "authorize",
        _wrap_method(
            relation_module._ValidatedIntegralRelationBatch,
            "authorize",
            "authority_validation",
        ),
    ),
    (
        relation_module.ExactRelationCollector,
        "_store_integral_payload_records",
        _wrap_method(
            relation_module.ExactRelationCollector,
            "_store_integral_payload_records",
            "record_construction_and_store",
        ),
    ),
    (
        relation_module.ExactRelationCollector,
        "_admit_validated_integral_order_basis_rows",
        _wrap_method(
            relation_module.ExactRelationCollector,
            "_admit_validated_integral_order_basis_rows",
            "validated_batch_admission",
        ),
    ),
    (
        cubic_module,
        "_issue_cubic_class_number_result",
        _wrap_function(
            cubic_module,
            "_issue_cubic_class_number_result",
            "producer_seal_publication",
        ),
    ),
]


ring_started = time.perf_counter()
R = PolynomialRing(QQ, "x")
x = R.gen()
field = NumberField(x**3 - x**2 - 6 * x - 12, "a")
field_construction = float(time.perf_counter() - ring_started)

producer_started = time.perf_counter()
result = cubic_module.bounded_cubic_minkowski_class_number(field)
producer_seconds = float(time.perf_counter() - producer_started)

for owner, name, original in reversed(originals):
    setattr(owner, name, original)

observation_started = time.perf_counter()
observed_order = result.order()
first_observation_seconds = float(time.perf_counter() - observation_started)

live_started = time.perf_counter()
live_order = cubic_module.authenticated_cubic_class_number(result, field)
live_authentication_seconds = float(time.perf_counter() - live_started)

gather_started = time.perf_counter()
payload = result.certificate.to_dict()
bulk_gather_seconds = float(time.perf_counter() - gather_started)

live_replay_started = time.perf_counter()
live_replay_ok = result.certificate.verify()
live_replay_seconds = float(time.perf_counter() - live_replay_started)

detached_field = field
detached_field_seconds = 0.0
detached_started = time.perf_counter()
detached = cubic_module.CubicMinkowskiClassNumberCertificate.from_dict(
    detached_field, payload
)
detached_replay_seconds = float(time.perf_counter() - detached_started)

public_field_started = time.perf_counter()
public_field = NumberField(x**3 - x**2 - 6 * x - 12, "c")
public_field_seconds = float(time.perf_counter() - public_field_started)
public_started = time.perf_counter()
public_order = public_field.class_number(proof=False)
public_seconds = float(time.perf_counter() - public_started)
cached_started = time.perf_counter()
cached_order = public_field.class_number(proof=True)
cached_seconds = float(time.perf_counter() - cached_started)

assert result.complete
assert observed_order == live_order == detached.class_number == 3
assert public_order == cached_order == 3
assert live_replay_ok
assert detached.to_dict() == payload

report = {
    "schema": "sagejs-native-machine-model-c0/v1",
    "platform": platform.platform(),
    "field": {
        "polynomial": "x^3 - x^2 - 6*x - 12",
        "discriminant": int(field.discriminant()),
        "class_number": observed_order,
        "proof_status": result.proof_status,
    },
    "seconds": {
        "field_construction": field_construction,
        "producer_total": producer_seconds,
        "producer_phases": {
            name: float(value)
            for name, value in result.diagnostics["phase_timings"].items()
        },
        "instrumented": timings,
        "first_scalar_observation": first_observation_seconds,
        "live_authenticated_scalar_read": live_authentication_seconds,
        "authenticated_bulk_gather": bulk_gather_seconds,
        "live_full_certificate_replay": live_replay_seconds,
        "detached_same_field_construction": detached_field_seconds,
        "detached_same_field_from_dict_and_replay": detached_replay_seconds,
        "public_field_construction": public_field_seconds,
        "public_first_call": public_seconds,
        "public_cached_stronger_proof_read": cached_seconds,
    },
    "counts": {
        "instrumented": counts,
        "factor_base": result.diagnostics["factor_base_size"],
        "relations": len(result.relation_records),
        "projective_lines": result.diagnostics["projective_lines"],
        "residue_states": result.diagnostics["residue_states"],
    },
    "authority": {
        "certificate_sha256": result.certificate.stable_hash(),
        "payload_bytes": len(json.dumps(payload, separators=(",", ":"))),
        "live_result_authenticated": live_order is not None,
        "detached_payload_equal": detached.to_dict() == payload,
    },
}
print(json.dumps(report, sort_keys=True, default=str))
