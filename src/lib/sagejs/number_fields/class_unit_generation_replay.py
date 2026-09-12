"""Detached, bounded Minkowski coverage, without class/unit completeness.

Only verifier-created field/order/prime objects participate in the check.
The content digest detects corruption, not mathematical authority.
"""

from __future__ import annotations

from typing import Any

from sagejs.number_fields._class_unit_replay_data import (
    _integer,
    _keys,
    _portable,
    _require,
    preflight_field_order_primes,
    reconstruct_field_order_primes,
)
from sagejs.number_fields.class_unit_replay import _decode, _hash

SCHEMA = "sagejs.number-fields/class-unit-generation-v1"
MAX_DEGREE = 10
MAX_BOUND = 1000
MAX_BASE = 128
MAX_PLAN_MEMORY = 16 * 1024 * 1024


def _preflight(payload: Any) -> None:
    _keys(
        payload, "schema field_order factor_base claimed_minkowski_bound content_sha256"
    )
    _require(payload["schema"] == SCHEMA, "unsupported generation schema")
    body = dict(payload)
    digest = body.pop("content_sha256")
    _require(type(digest) is str and _hash(body) == digest, "generation hash mismatch")
    _integer(payload["claimed_minkowski_bound"], MAX_BOUND)
    preflight_field_order_primes(
        payload["field_order"],
        payload["factor_base"],
        max_degree=MAX_DEGREE,
        max_base=MAX_BASE,
        max_prime=MAX_BOUND,
    )


def replay_generating_base(text: str) -> dict[str, Any]:
    """Check exact prime inclusion under Minkowski; never grant completeness.

    Invalid mathematics raises `ValueError`; oversized serialized inputs raise
    `ComponentReplayResourceError`, including a truthful bound claim above
    1000. A plan-memory or required-prime-count overflow returns
    `resource-limit`, not a generation theorem.
    Missing required ideals return `missing-coverage`; the base may still
    generate by a different argument, which this verifier does not establish.
    """
    payload = _decode(text)
    _preflight(payload)
    field, order, factor_base = reconstruct_field_order_primes(
        payload["field_order"], payload["factor_base"]
    )
    return _check_generating_base(payload, field, order, factor_base)


def _check_generating_base(
    payload: dict[str, Any], field: Any, order: Any, factor_base: list[Any]
) -> dict[str, Any]:
    """Internal composition step on independently decoded fresh exact objects.

    The caller must perform the bounded field/order/prime decoding above, not
    supply producer objects. No report, token or callback can replace this step.
    """
    _preflight(payload)
    from sagejs.number_fields import class_group_factor_base as bases
    from sagejs.number_fields import class_unit_context as context

    _require(
        context._order_fingerprint(field, order) == payload["field_order"]
        and [_portable(prime) for prime in factor_base] == payload["factor_base"],
        "generation inputs differ from decoded components",
    )
    # This plan owns only fresh caches. No serialized plan or producer callback
    # is decoded. A bound claim can never reduce the enumerated theorem bound.
    plan = bases.factor_base_plan(
        order,
        proof=True,
        theorem="minkowski",
        max_bound=MAX_BOUND,
        max_rational_primes=500,
        max_prime_ideals=5000,
        max_memory_bytes=MAX_PLAN_MEMORY,
    )
    _require(
        plan.bound == payload["claimed_minkowski_bound"],
        "recomputed Minkowski bound differs",
    )
    report: dict[str, Any] = {
        "schema": "sagejs.number-fields/class-unit-generation-report-v1",
        "input_sha256": payload["content_sha256"],
        "field_order": payload["field_order"],
        "generation_only": True,
        "complete": False,
        "generation_verified": False,
        "status": "resource-limit",
        "pending": [
            "class_generation",
            "exact_relations_and_presentation",
            "unit_rank_and_torsion",
            "analytic_index",
        ],
        "bound_evidence": plan.bound_result.to_dict(),
        "assumptions": [],
        "limits": {
            "degree": MAX_DEGREE,
            "bound": MAX_BOUND,
            "base": MAX_BASE,
            "plan_memory_bytes": MAX_PLAN_MEMORY,
        },
    }
    if not plan.fits_caps:
        report["resource_failures"] = list(plan.cap_failures)
        return report
    required = []
    for record in bases.prime_ideal_norm_stream(plan):
        if len(required) == MAX_BASE:
            report["resource_failures"] = ["required-prime-count"]
            return report
        required.append(record.ideal())
    missing = [
        prime
        for prime in required
        if not any(prime == present for present in factor_base)
    ]
    report["factor_base_verified"] = len(factor_base)
    report["required_primes"] = [_portable(prime) for prime in required]
    report["missing_primes"] = [_portable(prime) for prime in missing]
    report["generation_verified"] = not missing
    report["status"] = "missing-coverage" if missing else "verified"
    if not missing:
        report["pending"] = report["pending"][1:]
    return report
