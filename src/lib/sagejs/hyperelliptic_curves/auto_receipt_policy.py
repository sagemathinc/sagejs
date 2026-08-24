"""Receipt-bound decisions for public hyperelliptic automatic dispatch.

Absent or disabled policy preserves development `auto`; an enabled verified
policy fails unreceipted requests to exact fallback. Explicit `native` remains
available for collecting later receipts.
"""

from __future__ import annotations

import hashlib
from typing import Any, Iterable, cast

import sagejs.runtime as runtime

RUNTIME_GLOBAL = "__sagejs_hyperelliptic_auto_receipt_policy__"
RUNTIME_SCHEMA = "sagejs.hyperelliptic-auto-receipt-runtime/v1"


class AutoReceiptDecision:
    """Immutable diagnostic result from one public automatic dispatch query."""

    def __init__(
        self,
        *,
        allowed: bool,
        policy_present: bool,
        policy_enabled: bool,
        reason: str,
        backend: str,
        operation: str,
        entry_id: str | None = None,
    ) -> None:
        self.allowed = bool(allowed)
        self.policy_present = bool(policy_present)
        self.policy_enabled = bool(policy_enabled)
        self.reason = str(reason)
        self.backend = str(backend)
        self.operation = str(operation)
        self.entry_id = entry_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "allowed": self.allowed,
            "policy_present": self.policy_present,
            "policy_enabled": self.policy_enabled,
            "reason": self.reason,
            "backend": self.backend,
            "operation": self.operation,
            "entry_id": self.entry_id,
        }

    def __repr__(self) -> str:
        return "AutoReceiptDecision(" + repr(self.to_dict()) + ")"


def _property(value: Any, name: str) -> Any:
    return runtime.reflect.get(value, name)


def _explicit_decision(algorithm: str, backend: str, operation: str) -> Any:
    if algorithm == "native":
        return AutoReceiptDecision(
            allowed=True,
            policy_present=False,
            policy_enabled=False,
            reason="explicit-native-receipt-collection",
            backend=backend,
            operation=operation,
        )
    if algorithm == "reference":
        return AutoReceiptDecision(
            allowed=False,
            policy_present=False,
            policy_enabled=False,
            reason="explicit-reference",
            backend=backend,
            operation=operation,
        )
    return None


def auto_receipt_decision(
    *,
    algorithm: str,
    backend: str,
    operation: str,
    fingerprint: str,
    domain_id: str,
    genus: int,
    field_kind: str,
    model_kind: str,
    h_kind: str,
    prime: int,
    interval_start: int,
    interval_stop: int,
    batch_items: int,
    scalar_bits: int = 0,
    resource_bytes: int = 0,
) -> AutoReceiptDecision:
    """Return whether a capable accelerated backend may satisfy this request.

    This function does not test backend availability. The caller first applies
    its ordinary mathematical/capability checks and uses this result only for
    the capable accelerated branch.
    """

    if algorithm not in ("auto", "native", "reference"):
        raise ValueError("receipt-policy algorithm must be auto, native, or reference")
    explicit = _explicit_decision(algorithm, backend, operation)
    if explicit is not None:
        return explicit
    provider = _property(runtime.global_object, RUNTIME_GLOBAL)
    if provider is runtime.undefined:
        return AutoReceiptDecision(
            allowed=True,
            policy_present=False,
            policy_enabled=False,
            reason="development-auto-policy-absent",
            backend=backend,
            operation=operation,
        )
    try:
        if _property(provider, "schema") != RUNTIME_SCHEMA:
            raise RuntimeError("invalid hyperelliptic receipt-policy runtime schema")
        decide = _property(provider, "decide")
        if not callable(decide):
            raise RuntimeError("hyperelliptic receipt-policy runtime has no decision")
        result = runtime.reflect.apply(
            decide,
            provider,
            [
                backend,
                operation,
                fingerprint,
                domain_id,
                int(genus),
                field_kind,
                model_kind,
                h_kind,
                int(prime),
                int(interval_start),
                int(interval_stop),
                int(batch_items),
                int(scalar_bits),
                int(resource_bytes),
            ],
        )
        if _property(result, "schema") != RUNTIME_SCHEMA:
            raise RuntimeError("invalid hyperelliptic receipt-policy decision schema")
        enabled = bool(_property(result, "policy_enabled"))
        selected = bool(_property(result, "selected"))
        reason = str(_property(result, "reason"))
        entry = _property(result, "entry_id")
        if not enabled:
            if selected or reason != "policy-disabled":
                raise RuntimeError("invalid disabled hyperelliptic receipt policy")
            return AutoReceiptDecision(
                allowed=True,
                policy_present=True,
                policy_enabled=False,
                reason=reason,
                backend=backend,
                operation=operation,
            )
        return AutoReceiptDecision(
            allowed=selected,
            policy_present=True,
            policy_enabled=True,
            reason=reason,
            backend=backend,
            operation=operation,
            entry_id=None if entry is None else str(entry),
        )
    except Exception:
        return AutoReceiptDecision(
            allowed=False,
            policy_present=True,
            policy_enabled=True,
            reason="receipt-policy-query-error",
            backend=backend,
            operation=operation,
        )


def _digest_piece(digest: Any, value: str) -> None:
    encoded = value.encode("utf-8")
    digest.update(len(encoded).to_bytes(8, "big"))
    digest.update(encoded)


def coefficient_model_fingerprint(
    schema: str,
    genus: int,
    field: str,
    f_coefficients: Iterable[Any],
    h_coefficients: Iterable[Any],
) -> str:
    """Hash one exact coefficient model with unambiguous framing."""

    digest = hashlib.sha256()
    for value in (schema, str(int(genus)), field):
        _digest_piece(digest, value)
    f_values = tuple(str(value) for value in f_coefficients)
    h_values = tuple(str(value) for value in h_coefficients)
    _digest_piece(digest, "f:" + str(len(f_values)))
    for value in f_values:
        _digest_piece(digest, value)
    _digest_piece(digest, "h:" + str(len(h_values)))
    for value in h_values:
        _digest_piece(digest, value)
    return digest.hexdigest()


def curve_model_fingerprint(curve: Any, schema: str) -> str:
    """Return a stable exact fingerprint for a rational or prime-field model."""

    f_value, h_value = curve.hyperelliptic_polynomials()
    base = curve.base_ring()
    kind = getattr(base, "_kind", None)
    if kind == "GF":
        characteristic = int(base.characteristic())

        def canonical(coefficient: Any) -> Any:
            lift = getattr(coefficient, "lift", None)
            return int(cast(Any, lift)()) if callable(lift) else int(coefficient)

        field = "prime-field:" + str(characteristic)
        f_values = [canonical(value) for value in f_value.list()]
        h_values = [canonical(value) for value in h_value.list()]
    else:
        field = "rational"
        f_values = list(f_value.list())
        h_values = list(h_value.list())
    return coefficient_model_fingerprint(
        schema,
        int(curve.genus()),
        field,
        f_values,
        h_values,
    )


def h_kind_from_coefficients(values: Iterable[Any]) -> str:
    """Classify a generalized model without changing its equation."""

    return "nonzero" if any(value != 0 for value in values) else "zero"


__all__ = [
    "AutoReceiptDecision",
    "RUNTIME_GLOBAL",
    "RUNTIME_SCHEMA",
    "auto_receipt_decision",
    "coefficient_model_fingerprint",
    "curve_model_fingerprint",
    "h_kind_from_coefficients",
]
