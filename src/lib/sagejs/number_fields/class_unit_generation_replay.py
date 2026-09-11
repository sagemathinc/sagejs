"""Detached, bounded Minkowski coverage, without class/unit completeness.

Only verifier-created field/order/prime objects participate in the check.
The content digest detects corruption, not mathematical authority.
"""

from __future__ import annotations

from typing import Any

from sagejs.number_fields.class_unit_replay import (
    _decode,
    _hash,
    _integer,
    _keys,
    _list,
    _require,
    _vector,
)

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
    identity = payload["field_order"]
    _keys(identity, "field maximal_order_basis discriminant")
    field = identity["field"]
    _keys(field, "defining_polynomial degree variable")
    degree = _integer(field["degree"], MAX_DEGREE, minimum=2)
    _require(
        type(field["variable"]) is str and field["variable"].isidentifier(),
        "invalid field variable",
    )
    _vector(field["defining_polynomial"], degree + 1, 32)
    _require(
        field["defining_polynomial"][-1] == [1, 1], "a monic presentation is required"
    )
    _integer(identity["discriminant"], (1 << 128) - 1, minimum=-(1 << 128) + 1)
    _require(
        len(_list(identity["maximal_order_basis"], degree)) == degree,
        "incorrect order basis size",
    )
    for row in identity["maximal_order_basis"]:
        _vector(row, degree)
    fingerprint = {
        "defining_polynomial": field["defining_polynomial"],
        "variable": field["variable"],
        "maximal_order_basis": identity["maximal_order_basis"],
        "discriminant": identity["discriminant"],
    }
    for prime in _list(payload["factor_base"], MAX_BASE):
        _keys(prime, "schema field_order_fingerprint prime e f basis residue")
        _require(
            prime["schema"] == "sagejs.number-fields.prime-ideal.v1",
            "unsupported prime schema",
        )
        _require(
            prime["field_order_fingerprint"] == fingerprint,
            "prime field/order binding differs",
        )
        p = _integer(prime["prime"], MAX_BOUND, minimum=2)
        _integer(prime["e"], degree, minimum=1)
        f = _integer(prime["f"], degree, minimum=1)
        _require(
            len(_list(prime["basis"], degree)) == degree, "incorrect prime basis size"
        )
        for row in prime["basis"]:
            _vector(row, degree)
        residue = prime["residue"]
        _keys(residue, "primitive quotient_matrix power_inverse modulus")
        for name, size in (("primitive", degree), ("modulus", f + 1)):
            _require(
                len(_list(residue[name], size)) == size, "incorrect residue vector size"
            )
            for entry in residue[name]:
                _integer(entry, p - 1)
        for name, rows in (("quotient_matrix", degree), ("power_inverse", f)):
            _require(
                len(_list(residue[name], rows)) == rows, "incorrect residue matrix size"
            )
            for row in residue[name]:
                _require(len(_list(row, f)) == f, "incorrect residue row size")
                for entry in row:
                    _integer(entry, p - 1)


def _portable(prime: Any) -> dict[str, Any]:
    encoded = prime.to_dict()
    del encoded["field_instance"]
    del encoded["order_instance"]
    return encoded


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
    from sagejs.number_fields import class_unit_context as context
    from sagejs.number_fields import prime_ideals

    identity = payload["field_order"]
    encoded_field = identity["field"]
    algebra = __import__("sagejs._baselib.algebra", fromlist=["QQ"])
    polynomials = __import__("sagejs._baselib.polynomial", fromlist=["PolynomialRing"])
    number_fields = __import__(
        "sagejs._baselib.number_fields", fromlist=["NumberField"]
    )
    polynomial = polynomials.PolynomialRing(algebra.QQ, "x")(
        [algebra.QQ(a) / b for a, b in encoded_field["defining_polynomial"]]
    )
    field = number_fields.NumberField(polynomial, encoded_field["variable"])
    order = field.maximal_order()
    _require(
        context._order_fingerprint(field, order) == identity,
        "recomputed maximal order differs",
    )
    factor_base = []
    for portable in payload["factor_base"]:
        encoded = dict(portable)
        encoded["field_instance"] = prime_ideals._identity_token(field)
        encoded["order_instance"] = prime_ideals._identity_token(order)
        prime = prime_ideals.prime_ideal_from_dict(order, encoded)
        _require(_portable(prime) == portable, "prime payload is not canonical")
        _require(
            not any(prime == previous for previous in factor_base),
            "duplicate factor-base ideal",
        )
        factor_base.append(prime)
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
