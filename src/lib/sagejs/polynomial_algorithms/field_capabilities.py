"""Coefficient-domain routing for polynomial algorithms and geometry.

This registry separates a usable scalar field from a qualified public
polynomial/geometry domain. In particular, an extension scalar adapter does
not make the rational packed ABI or an unimplemented polynomial backend safe.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime
from sagejs.polynomial_algorithms.exact_field import (
    COMMON_FQ_CHARACTERISTIC_MAX,
    ExactField,
)

CAPABILITY_ABI = "sagejs.polynomial-field-capability/v1"
_CORE_FAMILIES = ("rational", "prime")
_GLOBAL_ORDERS = ("lex", "deglex", "degrevlex")
_OPERATIONS = (
    "geometry",
    "ideal",
    "groebner.packed-v1",
    "groebner.generic-v2",
    "univariate.euclidean",
    "univariate.factor",
)


def _target() -> str:
    return (
        "wasm"
        if runtime.reflect.get(runtime.global_object, "__sagejs_wasm_native_resolver__")
        is not runtime.undefined
        else "native"
    )


def field_capability(
    parent: Any,
    operation: str,
    order: Any = None,
    proof: Any = None,
) -> dict[str, Any]:
    """Describe one implemented domain, without claiming platform receipts.

    Generic v2 is an internal exact reference operation. Its availability is
    intentionally independent of the still-closed extension geometry gate.
    Univariate entries describe existing primitives, not qualification
    of extension-field decomposition or the entire geometry milestone.
    """
    if operation not in _OPERATIONS:
        raise ValueError("unknown polynomial field operation: " + str(operation))
    if order is not None and order not in _GLOBAL_ORDERS:
        raise ValueError("unsupported polynomial monomial order: " + str(order))
    proof_module = __import__(
        "sagejs._baselib.proof", fromlist=["resolve_polynomial_proof"]
    )
    proof_required = proof_module.resolve_polynomial_proof(proof)
    target = _target()
    supported = False
    descriptor = None
    reason = "no exact coefficient adapter is implemented for this parent"
    fallback = None
    resource_envelope = "existing public polynomial representation limits"
    try:
        field = ExactField(parent)
    except NotImplementedError:
        field = None
    if field is not None:
        descriptor = field.descriptor()
        if operation in ("geometry", "ideal", "groebner.packed-v1"):
            supported = field.family in _CORE_FAMILIES
            reason = (
                "public polynomial ideal arithmetic and algebraic geometry "
                "currently support QQ and prime GF(p); extension domains await "
                "their qualified storage and dispatch implementation"
            )
            if operation == "groebner.packed-v1":
                reason = "packed Groebner v1 accepts only QQ and prime GF(p)"
                resource_envelope = "specialized packed v1 ABI limits"
            elif operation == "ideal" and field.family == "finite-extension":
                supported = field.characteristic <= COMMON_FQ_CHARACTERISTIC_MAX
                reason = "exact generic-v2 ideals over resident extension polynomials"
                resource_envelope = (
                    "bounded generic-v2 coefficient and monomial operations"
                )
                if not supported:
                    reason = "extension multivariate storage requires characteristic <= 4294967295"
        else:
            supported = True
            reason = "implemented exact coefficient operation"
            if operation == "groebner.generic-v2":
                fallback = "same-source exact Buchberger with full provenance"
                resource_envelope = "GroebnerBudget plus exact-field codec limits"
            else:
                resource_envelope = (
                    "existing exact univariate substrate limits; generic gcd/xgcd "
                    "degree <= 4096, 30-second deadline checked between divisions"
                )
            if (
                field.family == "finite-extension"
                and target == "wasm"
                and field.characteristic > COMMON_FQ_CHARACTERISTIC_MAX
            ):
                supported = False
                reason = "Wasm finite-extension resources require characteristic <= 4294967295"
                fallback = None
    return {
        "abi": CAPABILITY_ABI,
        "operation": operation,
        "base_field_descriptor": descriptor,
        "order": order,
        "proof_requested": proof_required,
        "execution_target": target,
        "resource_envelope": resource_envelope,
        "supported": supported,
        "reason": reason,
        "fallback": fallback,
        "qualification": "operation availability; consult milestone receipts separately",
    }


def require_field_operation(
    parent: Any,
    operation: str,
    order: Any = None,
    proof: Any = None,
) -> Any:
    """Reject an unsupported domain before allocating a polynomial backend."""
    if hasattr(parent, "is_field") and not bool(parent.is_field()):
        raise TypeError("the coefficient ring must be a field")
    capability = field_capability(parent, operation, order, proof)
    if not capability["supported"]:
        raise NotImplementedError(
            capability["reason"]
            + "; field="
            + str(parent)
            + ", operation="
            + operation
            + ", order="
            + str(order)
            + ", proof="
            + str(capability["proof_requested"])
            + ", target="
            + capability["execution_target"]
            + ", fallback="
            + str(capability["fallback"])
            + "; see agents/no-singular-extension-fields-plan.md"
        )
    return parent


def packed_v1_characteristic(parent: Any, order: str) -> int:
    """Guard the specialized ABI even when called below a public ideal gate."""
    require_field_operation(parent, "groebner.packed-v1", order)
    return ExactField(parent).characteristic
