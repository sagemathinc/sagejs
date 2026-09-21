# Copyright (C) Sage.js contributors.
# License: GPL-3.0-only

"""Honest Sage.js boundary for Rust cubic qualification receipts.

This module does not execute or dispatch to the experimental Rust backend.  It
only validates the coefficient-only qualification request and the available
fields of its summary receipt against a Sage.js number field, then returns an
*incomplete* `ClassUnitComputation`. Receipt version 2 does not contain a
request hash or polynomial, so even field identity is not fully bound. It also
omits the exact presentation, ideal-map, unit, regulator, and proof-replay
material needed to construct the ordinary public class and unit objects.

The distinction matters: `publicComplete` in the Rust receipt means that the
Rust qualification process constructed and checked its private sealed object.
It is not authority for Sage.js to publish a class number or class group.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import sagejs as sage

from sagejs.number_fields.rust_class_group_preparation import prepare_cubic_for_rust

REQUEST_SCHEMA = "sagejs.rust-class-group/public-cubic-e2e-request-v2"
RECEIPT_SCHEMA = "sagejs.rust-class-group/public-cubic-e2e-receipt-v2"
CAPABILITY_SCHEMA = "sagejs.rust-class-group/public-cubic-qualification-capability-v1"
DIAGNOSTICS_SCHEMA = "sagejs.rust-class-group/public-cubic-qualification-diagnostics-v1"

_BACKEND = "handwritten-rust-math-core"
_ALGORITHM = "rust-public-cubic-qualification-experimental"
_CONDITIONAL_PROOF = "conditional-grh"
_COMPLETE_OUTCOME = "complete-conditional-grh"
_INCOMPLETE_OUTCOME = "incomplete"
_CANDIDATE_AUTHORITIES = (
    "authenticated-supplied-principal-relations-candidate-only",
    "authenticated-collector-sealed-compact-elementary-two-presentation",
)
_CLASS_UNIT_HYPOTHESIS = "GRH for the Dedekind-zeta residue bound"
_FACTOR_BASE_HYPOTHESIS = (
    "GRH for all unramified Hecke L-functions of class-group characters"
)
_PUBLIC_EVIDENCE_GAPS = (
    "receipt-v2 omits the replayable relation presentation and its transforms",
    "receipt-v2 omits exact class-generator ideals and order witnesses",
    "receipt-v2 omits the arbitrary-ideal class map and quotient-principality witnesses",
    "receipt-v2 omits live exact unit generators, torsion, and regulator evidence",
    "receipt-v2 omits Sage.js saturation and conditional proof replay records",
    "receipt-v2 does not bind itself to the request polynomial or resource limits",
    "receipt-v2 does not identify the executable artifact that produced it",
)
_REQUEST_KEYS = {"schema", "polynomialAscending", "proofMode", "resources"}
_RESOURCE_U32_KEYS = {
    "maximumIrreducibilityPrime",
    "embeddingPrecisionBits",
    "maximumRelationExponent",
    "logarithmPrecisionBits",
    "replayPrecisionBits",
    "analyticPrecisionBits",
}
_RESOURCE_U64_KEYS = {
    "maximumTrialDivisor",
    "maximumNormalFormOperations",
    "maximumVerificationMultiplyAdds",
    "maximumAnalyticThreshold",
}
_RESOURCE_USIZE_KEYS = {
    "maximumVisitedIdeals",
    "maximumCandidates",
    "maximumNormalFormEntries",
    "maximumPrincipalFactorTerms",
    "maximumCompactGenerators",
    "maximumCompactSurplusRows",
    "maximumCompactSaturationMinorTrials",
    "maximumCompactDependencyEntries",
    "maximumCompactTargetCoefficientBits",
    "maximumRelations",
    "maximumDependencies",
    "maximumKernelCoefficientBits",
    "maximumUnitExponentBits",
    "maximumReconstructionDenominatorBits",
}
_RESOURCE_KEYS = _RESOURCE_U32_KEYS | _RESOURCE_U64_KEYS | _RESOURCE_USIZE_KEYS
_RECEIPT_BASE_KEYS = {
    "schema",
    "outcome",
    "publicComplete",
    "requestedProof",
    "usesPariInput",
    "usesPreparedFixture",
    "usesFieldAnswersAsInput",
    "preparation",
    "relations",
    "stageTimingsNanoseconds",
}
_PREPARATION_KEYS = {
    "discriminant",
    "signature",
    "equationOrderIndex",
    "discriminantPrimeFactors",
    "certificateVerified",
}
_RELATION_KEYS = {
    "factorBaseSize",
    "relationCount",
    "completeRankAndSurplus",
    "missingRank",
}
_CANDIDATE_KEYS = {
    "invariantFactors",
    "classNumber",
    "authenticatedPrincipalRelations",
    "generatorOrderWitnesses",
    "authority",
}
_COMPLETION_KEYS = {
    "proof",
    "classNumber",
    "invariantFactors",
    "unitRank",
    "bfThreshold",
    "classUnitHypothesis",
    "factorBaseHypothesis",
    "sealedEvidenceVerified",
    "arbitraryIdealClassMapRetained",
}
_TIMING_KEYS = {
    "publicInputAndPreparation",
    "relationCollection",
    "candidateAuthentication",
    "unitAndAnalyticCompletion",
    "totalToSealedResult",
}


def _require_mapping(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TypeError(name + " must be a dictionary")
    return value


def _require_closed_mapping(
    value: Any, name: str, expected_keys: set[str]
) -> dict[str, Any]:
    mapping = _require_mapping(value, name)
    actual_keys = set(mapping)
    if actual_keys != expected_keys:
        missing = sorted(expected_keys - actual_keys)
        unknown = sorted(actual_keys - expected_keys)
        raise ValueError(
            name
            + " has the wrong fields (missing="
            + repr(missing)
            + ", unknown="
            + repr(unknown)
            + ")"
        )
    return mapping


def _canonical_signed_integer(value: Any, name: str) -> int:
    if not isinstance(value, str):
        raise TypeError(name + " must be a canonical decimal string")
    try:
        answer = int(value)
    except ValueError as error:
        raise ValueError(name + " must be a canonical decimal string") from error
    if str(answer) != value:
        raise ValueError(name + " must be a canonical decimal string")
    return answer


def _canonical_nonnegative_integer(value: Any, name: str) -> int:
    answer = _canonical_signed_integer(value, name)
    if answer < 0:
        raise ValueError(name + " must be nonnegative")
    return answer


def _bounded_json_integer(value: Any, name: str, maximum: int) -> int:
    if type(value) is not int:
        raise TypeError(name + " must be a JSON integer")
    if value < 0 or value > maximum:
        raise ValueError(name + " is outside its unsigned Rust range")
    return value


def _canonical_json_copy(value: Any, name: str) -> Any:
    try:
        encoded = json.dumps(
            value, sort_keys=True, separators=(",", ":"), allow_nan=False
        )
        return json.loads(encoded)
    except (TypeError, ValueError) as error:
        raise TypeError(name + " must contain only canonical JSON data") from error


def _json_sha256(value: Any, name: str) -> str:
    canonical = json.dumps(
        _canonical_json_copy(value, name),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def rust_public_cubic_qualification_capability(
    field: Any = None, *, proof: bool | None = False
) -> dict[str, Any]:
    """Describe the receipt adapter without claiming an executable backend.

    `supported` describes whether a receipt can be inspected for this request;
    `publicResultSupported` remains false until a future receipt carries all
    replayable Sage.js evidence.  This function never launches Rust.
    """
    reasons = []
    if proof is not False:
        reasons.append("the Rust cubic qualification supports only proof=False")
    if field is not None:
        try:
            degree = int(field.degree())
        except (AttributeError, TypeError, ValueError):
            degree = -1
        if degree != 3:
            reasons.append("the qualification receipt schema supports only degree 3")
    supported = not reasons
    return {
        "schema": CAPABILITY_SCHEMA,
        "backend": _BACKEND,
        "status": "experimental-qualification",
        "supported": supported,
        "reason": "receipt adaptation is available"
        if supported
        else "; ".join(reasons),
        "capabilities": {
            "receiptValidation": True,
            "fieldConsistencyChecks": True,
            "requestBinding": False,
            "nativeExecution": False,
            "wasmExecution": False,
            "publicResultSupported": False,
            "automaticDispatch": False,
        },
        "requestSchema": REQUEST_SCHEMA,
        "receiptSchema": RECEIPT_SCHEMA,
        "proofMode": _CONDITIONAL_PROOF if proof is False else "unsupported",
        "completionStatus": "receipt-summary-only",
        "artifactIdentity": None,
        "artifactIdentityStatus": "not-present-in-receipt-v2",
        "requestBindingStatus": "not-present-in-receipt-v2",
        "fallbackReason": "ordinary Python remains the public semantic owner",
        "freshOrCached": "not-applicable-receipt-adapter-only",
        "missingPublicEvidence": list(_PUBLIC_EVIDENCE_GAPS),
    }


def _validate_request(
    field: Any, request: Any
) -> tuple[dict[str, Any], dict[str, Any]]:
    request = _require_closed_mapping(request, "request", _REQUEST_KEYS)
    if request["schema"] != REQUEST_SCHEMA:
        raise ValueError("the Rust qualification request has the wrong schema")
    if request["proofMode"] != _CONDITIONAL_PROOF:
        raise ValueError("only conditional-grh qualification receipts are adaptable")
    polynomial = request["polynomialAscending"]
    if not isinstance(polynomial, list) or len(polynomial) != 4:
        raise ValueError("request.polynomialAscending must have four coefficients")
    coefficients = [
        _canonical_signed_integer(value, "request polynomial coefficient")
        for value in polynomial
    ]
    if coefficients[-1] != 1:
        raise ValueError("the Rust qualification request must be monic cubic")

    resources = _require_closed_mapping(
        request["resources"], "request.resources", _RESOURCE_KEYS
    )
    for key in _RESOURCE_U32_KEYS:
        _bounded_json_integer(resources[key], "request.resources." + key, 2**32 - 1)
    for key in _RESOURCE_U64_KEYS | _RESOURCE_USIZE_KEYS:
        _bounded_json_integer(resources[key], "request.resources." + key, 2**64 - 1)

    authoritative = prepare_cubic_for_rust(field)
    expected_coefficients = authoritative["field"]["coefficientsAscending"]
    if polynomial != expected_coefficients:
        raise ArithmeticError(
            "the Rust qualification request is not bound to this number field"
        )
    return request, authoritative


def _validate_preparation(
    field: Any, authoritative: dict[str, Any], receipt: dict[str, Any]
) -> dict[str, Any]:
    preparation = _require_closed_mapping(
        receipt["preparation"], "receipt.preparation", _PREPARATION_KEYS
    )
    if preparation["certificateVerified"] is not True:
        raise ArithmeticError("the Rust maximal-order certificate was not verified")
    expected = authoritative["preparation"]
    discriminant = _canonical_signed_integer(
        preparation["discriminant"], "receipt preparation discriminant"
    )
    if discriminant != int(expected["discriminant"]):
        raise ArithmeticError("the Rust receipt changed the maximal-order discriminant")
    signature = preparation["signature"]
    expected_signature = [
        expected["signature"]["realPlaces"],
        expected["signature"]["complexPairs"],
    ]
    if signature != expected_signature:
        raise ArithmeticError("the Rust receipt changed the field signature")

    maximal = __import__(
        "sagejs.number_fields.maximal_order", fromlist=["maximal_order"]
    )
    expected_index = int(maximal.equation_order_index(field.maximal_order()))
    equation_order_index = _canonical_nonnegative_integer(
        preparation["equationOrderIndex"], "receipt equation-order index"
    )
    if equation_order_index != expected_index or equation_order_index < 1:
        raise ArithmeticError("the Rust receipt changed the equation-order index")

    raw_factors = preparation["discriminantPrimeFactors"]
    if not isinstance(raw_factors, list):
        raise TypeError("receipt discriminant prime factors must be a list")
    factors = [
        _canonical_nonnegative_integer(value, "receipt discriminant prime factor")
        for value in raw_factors
    ]
    expected_factors = [
        int(prime) for prime, _exponent in sage.factor(abs(discriminant))
    ]
    if factors != expected_factors:
        raise ArithmeticError(
            "the Rust receipt changed the discriminant prime factorization"
        )
    return preparation


def _validate_invariants(values: Any, name: str) -> tuple[int, ...]:
    if not isinstance(values, list):
        raise TypeError(name + " must be a list")
    invariants = tuple(
        _canonical_nonnegative_integer(value, name + " entry") for value in values
    )
    previous = 1
    for invariant in invariants:
        if invariant <= 1 or invariant % previous != 0:
            raise ArithmeticError(
                name + " must contain normalized nontrivial invariant factors"
            )
        previous = invariant
    return invariants


def _validate_timings(receipt: dict[str, Any]) -> dict[str, int]:
    raw = _require_closed_mapping(
        receipt["stageTimingsNanoseconds"],
        "receipt.stageTimingsNanoseconds",
        _TIMING_KEYS,
    )
    timings = {
        key: _bounded_json_integer(
            raw[key], "receipt.stageTimingsNanoseconds." + key, 2**128 - 1
        )
        for key in _TIMING_KEYS
    }
    components = (
        timings["publicInputAndPreparation"]
        + timings["relationCollection"]
        + timings["candidateAuthentication"]
        + timings["unitAndAnalyticCompletion"]
    )
    if timings["totalToSealedResult"] < components:
        raise ArithmeticError("the Rust receipt stage timings exceed its total time")
    return timings


def _validate_complete_receipt(
    field: Any, receipt: dict[str, Any], relations: dict[str, Any]
) -> tuple[tuple[int, ...], dict[str, Any]]:
    candidate = _require_closed_mapping(
        receipt["candidate"], "receipt.candidate", _CANDIDATE_KEYS
    )
    completion = _require_closed_mapping(
        receipt["completion"], "receipt.completion", _COMPLETION_KEYS
    )
    candidate_invariants = _validate_invariants(
        candidate["invariantFactors"], "candidate invariant factors"
    )
    completion_invariants = _validate_invariants(
        completion["invariantFactors"], "completion invariant factors"
    )
    if candidate_invariants != completion_invariants:
        raise ArithmeticError("candidate and completion invariant factors differ")
    expected_class_number = 1
    for invariant in candidate_invariants:
        expected_class_number *= invariant
    candidate_class_number = _canonical_nonnegative_integer(
        candidate["classNumber"], "candidate class number"
    )
    completion_class_number = _canonical_nonnegative_integer(
        completion["classNumber"], "completion class number"
    )
    if (
        candidate_class_number != expected_class_number
        or completion_class_number != expected_class_number
    ):
        raise ArithmeticError("the Rust receipt invariant product is inconsistent")
    if candidate["authority"] not in _CANDIDATE_AUTHORITIES:
        raise ValueError("the Rust candidate has an unknown authority")
    authenticated_relations = _bounded_json_integer(
        candidate["authenticatedPrincipalRelations"],
        "candidate authenticated relation count",
        2**64 - 1,
    )
    generator_witnesses = _bounded_json_integer(
        candidate["generatorOrderWitnesses"],
        "candidate generator witness count",
        2**64 - 1,
    )
    if authenticated_relations != relations["relationCount"]:
        raise ArithmeticError("the authenticated relation count changed")
    if generator_witnesses != len(candidate_invariants):
        raise ArithmeticError("the candidate does not retain one witness per generator")
    if completion["proof"] != _CONDITIONAL_PROOF:
        raise ValueError("the Rust completion has the wrong proof mode")
    expected_unit_rank = sum(field.signature()) - 1
    if (
        _bounded_json_integer(completion["unitRank"], "completion unit rank", 2**64 - 1)
        != expected_unit_rank
    ):
        raise ArithmeticError("the Rust completion changed the field unit rank")
    _bounded_json_integer(
        completion["bfThreshold"], "completion BF threshold", 2**64 - 1
    )
    if completion["classUnitHypothesis"] != _CLASS_UNIT_HYPOTHESIS:
        raise ValueError("the Rust completion has an unknown class/unit hypothesis")
    if completion["factorBaseHypothesis"] != _FACTOR_BASE_HYPOTHESIS:
        raise ValueError("the Rust completion has an unknown factor-base hypothesis")
    if completion["sealedEvidenceVerified"] is not True:
        raise ArithmeticError("the Rust sealed evidence was not internally verified")
    if completion["arbitraryIdealClassMapRetained"] is not True:
        raise ArithmeticError("the Rust result did not retain its private class map")
    return candidate_invariants, {
        "candidateClassNumber": candidate_class_number,
        "candidateAuthority": candidate["authority"],
        "authenticatedPrincipalRelations": authenticated_relations,
        "generatorOrderWitnesses": generator_witnesses,
        "rustInternalSealedEvidenceVerified": True,
        "rustInternalArbitraryIdealClassMapRetained": True,
    }


def adapt_rust_public_cubic_qualification_receipt(
    field: Any, request: dict[str, Any], receipt: dict[str, Any]
) -> Any:
    """Validate a Rust summary receipt and return an incomplete public record.

    No value in receipt-v2 can make this result complete.  In particular, the
    tentative class number is retained only in diagnostics; `class_number()`
    and `class_group()` continue to reject the incomplete computation.
    """
    request, authoritative = _validate_request(field, request)
    receipt = _require_mapping(receipt, "receipt")
    if receipt.get("schema") != RECEIPT_SCHEMA:
        raise ValueError("the Rust qualification receipt has the wrong schema")
    if receipt.get("requestedProof") != request["proofMode"]:
        raise ValueError("the Rust receipt changed the requested proof mode")
    for key in ("usesPariInput", "usesPreparedFixture", "usesFieldAnswersAsInput"):
        if receipt.get(key) is not False:
            raise ValueError("the Rust public qualification boundary violated " + key)

    outcome = receipt.get("outcome")
    if outcome == _COMPLETE_OUTCOME:
        expected_keys = _RECEIPT_BASE_KEYS | {"candidate", "completion"}
        if receipt.get("publicComplete") is not True:
            raise ValueError("a complete Rust receipt must set publicComplete")
    elif outcome == _INCOMPLETE_OUTCOME:
        expected_keys = _RECEIPT_BASE_KEYS | {"firstUnavailableBoundary"}
        if receipt.get("publicComplete") is not False:
            raise ValueError("an incomplete Rust receipt cannot set publicComplete")
    else:
        raise ValueError("the Rust qualification receipt has an unknown outcome")
    _require_closed_mapping(receipt, "receipt", expected_keys)

    _validate_preparation(field, authoritative, receipt)
    relations = _require_closed_mapping(
        receipt["relations"], "receipt.relations", _RELATION_KEYS
    )
    relation_values = {
        key: _bounded_json_integer(
            relations[key], "receipt.relations." + key, 2**64 - 1
        )
        for key in ("factorBaseSize", "relationCount", "missingRank")
    }
    relation_values["completeRankAndSurplus"] = relations["completeRankAndSurplus"]
    if type(relations["completeRankAndSurplus"]) is not bool:
        raise TypeError("receipt.relations.completeRankAndSurplus must be boolean")
    timings = _validate_timings(receipt)

    tentative_invariants: tuple[int, ...] = ()
    producer_details: dict[str, Any] = {}
    if outcome == _COMPLETE_OUTCOME:
        if not relations["completeRankAndSurplus"] or relations["missingRank"] != 0:
            raise ArithmeticError(
                "the complete Rust receipt has an incomplete relation rank"
            )
        tentative_invariants, producer_details = _validate_complete_receipt(
            field, receipt, relation_values
        )
        first_unavailable_boundary = "sagejs-public-evidence-adaptation"
    else:
        if relations["completeRankAndSurplus"] or relations["missingRank"] == 0:
            raise ArithmeticError(
                "the incomplete Rust receipt has inconsistent rank state"
            )
        boundary = receipt["firstUnavailableBoundary"]
        if boundary != "relation-collection":
            raise ValueError("the Rust receipt has an unknown unavailable boundary")
        first_unavailable_boundary = boundary

    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    request_copy = _canonical_json_copy(request, "request")
    diagnostics = {
        "schema": DIAGNOSTICS_SCHEMA,
        "backend": _BACKEND,
        "capabilities": rust_public_cubic_qualification_capability(field, proof=False)[
            "capabilities"
        ],
        "artifactIdentity": None,
        "artifactIdentityStatus": "not-present-in-receipt-v2",
        "requestIdentity": _json_sha256(request_copy, "request"),
        "requestBindingStatus": "not-present-in-receipt-v2",
        "receiptIdentity": _json_sha256(receipt, "receipt"),
        "proofMode": request["proofMode"],
        "completionStatus": "rust-internal-" + outcome + "/sagejs-incomplete",
        "fallbackReason": "receipt-v2 lacks replayable Sage.js public evidence",
        "resourceLimits": {
            "requested": request_copy["resources"],
            "producerBindingStatus": "not-present-in-receipt-v2",
        },
        "freshOrCached": "unknown-not-recorded-by-receipt-v2",
        "automaticDispatch": False,
        "producerPublicCompleteLabel": receipt["publicComplete"],
        "producerFirstUnavailableBoundary": first_unavailable_boundary,
        "stageTimingsNanoseconds": timings,
        "relations": relation_values,
        "remainingEvidenceGaps": list(_PUBLIC_EVIDENCE_GAPS),
    }
    diagnostics.update(producer_details)
    stages = (
        groups.ClassUnitStage(
            "rust-public-cubic-qualification",
            "complete" if outcome == _COMPLETE_OUTCOME else "incomplete",
            {
                "receiptIdentity": diagnostics["receiptIdentity"],
                "producerOutcome": outcome,
                "producerPublicCompleteLabel": receipt["publicComplete"],
            },
        ),
        groups.ClassUnitStage(
            "sagejs-public-class-unit-adaptation",
            "incomplete",
            {"missingEvidence": list(_PUBLIC_EVIDENCE_GAPS)},
        ),
    )
    return groups.ClassUnitComputation(
        field,
        proof_status=groups.INCOMPLETE_RESOURCE_LIMIT,
        complete=False,
        reason=(
            "the Rust cubic qualification receipt is a summary only; exact Sage.js "
            "class-map, unit, regulator, saturation, and proof replay evidence is absent"
        ),
        algorithm=_ALGORITHM,
        stages=stages,
        tentative_invariants=tentative_invariants,
        diagnostics=diagnostics,
    )


__all__ = [
    "adapt_rust_public_cubic_qualification_receipt",
    "rust_public_cubic_qualification_capability",
]
