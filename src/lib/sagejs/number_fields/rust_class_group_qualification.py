# Copyright (C) Sage.js contributors.
# License: GPL-3.0-only

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
_PROOF = "conditional-grh"
_COMPLETE = "complete-conditional-grh"
_GAPS = (
    "relation-presentation-and-transforms",
    "class-generators-and-order-witnesses",
    "arbitrary-ideal-class-map-witnesses",
    "units-torsion-and-regulator-evidence",
    "saturation-and-proof-replay",
    "request-and-resource-binding",
    "executable-artifact-identity",
)


def _keys(names: str) -> set[str]:
    return set(names.split())


_REQUEST_KEYS = _keys("schema polynomialAscending proofMode resources")
_U32 = _keys(
    "maximumIrreducibilityPrime embeddingPrecisionBits maximumRelationExponent "
    "logarithmPrecisionBits replayPrecisionBits analyticPrecisionBits"
)
_U64 = _keys(
    "maximumTrialDivisor maximumNormalFormOperations "
    "maximumVerificationMultiplyAdds maximumAnalyticThreshold"
)
_USIZE = _keys(
    "maximumVisitedIdeals maximumCandidates maximumNormalFormEntries "
    "maximumPrincipalFactorTerms maximumCompactGenerators maximumCompactSurplusRows "
    "maximumCompactSaturationMinorTrials maximumCompactDependencyEntries "
    "maximumCompactTargetCoefficientBits maximumRelations maximumDependencies "
    "maximumKernelCoefficientBits maximumUnitExponentBits "
    "maximumReconstructionDenominatorBits"
)
_BASE = _keys(
    "schema outcome publicComplete requestedProof usesPariInput usesPreparedFixture "
    "usesFieldAnswersAsInput preparation relations stageTimingsNanoseconds"
)
_PREPARATION = _keys(
    "discriminant signature equationOrderIndex discriminantPrimeFactors "
    "certificateVerified"
)
_RELATIONS = _keys("factorBaseSize relationCount completeRankAndSurplus missingRank")
_CANDIDATE = _keys(
    "invariantFactors classNumber authenticatedPrincipalRelations "
    "generatorOrderWitnesses authority"
)
_COMPLETION = _keys(
    "proof classNumber invariantFactors unitRank bfThreshold classUnitHypothesis "
    "factorBaseHypothesis requestedLogarithmPrecisionBits "
    "requestedReplayPrecisionBits attemptedPrecisionLevels sealedEvidenceVerified "
    "arbitraryIdealClassMapRetained"
)
_PRECISION_LEVEL = _keys("logarithmPrecisionBits replayPrecisionBits")
_TIMINGS = _keys(
    "publicInputAndPreparation relationCollection candidateAuthentication "
    "unitAndAnalyticCompletion totalToSealedResult"
)


def _map(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TypeError(name + " must be a mapping")
    return value


def _closed(value: Any, name: str, expected: set[str]) -> dict[str, Any]:
    value = _map(value, name)
    actual = set(value)
    if actual != expected:
        raise ValueError(
            f"{name} has the wrong fields "
            f"(missing={sorted(expected - actual)!r}, unknown={sorted(actual - expected)!r})"
        )
    return value


def _dec(value: Any, *, nonnegative: bool = False) -> int:
    if not isinstance(value, str):
        raise TypeError("noncanonical decimal")
    try:
        answer = int(value)
    except ValueError as error:
        raise ValueError("noncanonical decimal") from error
    if str(answer) != value:
        raise ValueError("noncanonical decimal")
    if nonnegative and answer < 0:
        raise ValueError("negative decimal")
    return answer


def _uint(value: Any, maximum: int = 2**64 - 1) -> int:
    if type(value) is not int:
        raise TypeError("noninteger unsigned value")
    if value < 0 or value > maximum:
        raise ValueError("unsigned value out of range")
    return value


def _json(value: Any) -> Any:
    try:
        return json.loads(
            json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
        )
    except (TypeError, ValueError) as error:
        raise TypeError("noncanonical JSON") from error


def _hash(value: Any) -> str:
    encoded = json.dumps(
        _json(value),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return "sha256:" + hashlib.sha256(encoded.encode()).hexdigest()


def rust_public_cubic_qualification_capability(
    field: Any = None, *, proof: bool | None = False
) -> dict[str, Any]:
    degree_ok = True
    if field is not None:
        try:
            degree_ok = int(field.degree()) == 3
        except (AttributeError, TypeError, ValueError):
            degree_ok = False
    supported = proof is False and degree_ok
    return {
        "schema": CAPABILITY_SCHEMA,
        "status": "experimental-qualification",
        "supported": supported,
        "capabilities": {
            "receiptValidation": True,
            "fieldConsistencyChecks": True,
            "requestBinding": False,
            "nativeExecution": False,
            "wasmExecution": False,
            "publicResultSupported": False,
            "automaticDispatch": False,
        },
        "proofMode": _PROOF if proof is False else "unsupported",
        "artifactIdentity": None,
        "artifactIdentityStatus": "not-present-in-receipt-v2",
    }


def _request(field: Any, request: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    request = _closed(request, "request", _REQUEST_KEYS)
    if request["schema"] != REQUEST_SCHEMA:
        raise ValueError("invalid request schema")
    if request["proofMode"] != _PROOF:
        raise ValueError("unsupported proof mode")
    polynomial = request["polynomialAscending"]
    if not isinstance(polynomial, list) or len(polynomial) != 4:
        raise ValueError("invalid cubic coefficients")
    coefficients = [_dec(value) for value in polynomial]
    if coefficients[-1] != 1:
        raise ValueError("nonmonic cubic")
    resources = _closed(request["resources"], "request.resources", _U32 | _U64 | _USIZE)
    for key in _U32:
        _uint(resources[key], 2**32 - 1)
    for key in _U64 | _USIZE:
        _uint(resources[key])
    auth = prepare_cubic_for_rust(field)
    if polynomial != auth["field"]["coefficientsAscending"]:
        raise ArithmeticError(
            "the Rust qualification request is not bound to this number field"
        )
    return request, auth


def _prep(field: Any, auth: dict[str, Any], receipt: dict[str, Any]) -> None:
    prep = _closed(receipt["preparation"], "receipt.preparation", _PREPARATION)
    if prep["certificateVerified"] is not True:
        raise ArithmeticError("unverified maximal order")
    expected = auth["preparation"]
    disc = _dec(prep["discriminant"])
    if disc != int(expected["discriminant"]):
        raise ArithmeticError("discriminant mismatch")
    if prep["signature"] != [
        expected["signature"]["realPlaces"],
        expected["signature"]["complexPairs"],
    ]:
        raise ArithmeticError("signature mismatch")
    maximal = __import__(
        "sagejs.number_fields.maximal_order", fromlist=["maximal_order"]
    )
    index = _dec(prep["equationOrderIndex"], nonnegative=True)
    if index < 1 or index != int(maximal.equation_order_index(field.maximal_order())):
        raise ArithmeticError("equation-order index mismatch")
    raw_factors = prep["discriminantPrimeFactors"]
    if not isinstance(raw_factors, list):
        raise TypeError("invalid discriminant factors")
    factors = [_dec(value, nonnegative=True) for value in raw_factors]
    if factors != [int(prime) for prime, _ in sage.factor(abs(disc))]:
        raise ArithmeticError("discriminant factorization mismatch")


def _inv(values: Any, name: str) -> tuple[int, ...]:
    if not isinstance(values, list):
        raise TypeError(name + " must be a list")
    result = tuple(_dec(value, nonnegative=True) for value in values)
    previous = 1
    for value in result:
        if value <= 1 or value % previous:
            raise ArithmeticError(name + " are not normalized")
        previous = value
    return result


def _time(receipt: dict[str, Any]) -> dict[str, int]:
    raw = _closed(
        receipt["stageTimingsNanoseconds"],
        "receipt.stageTimingsNanoseconds",
        _TIMINGS,
    )
    result = {key: _uint(raw[key], 2**128 - 1) for key in _TIMINGS}
    subtotal = sum(result[key] for key in _TIMINGS - {"totalToSealedResult"})
    if result["totalToSealedResult"] < subtotal:
        raise ArithmeticError("invalid stage timings")
    return result


def _complete(
    field: Any,
    request: dict[str, Any],
    receipt: dict[str, Any],
    rel: dict[str, Any],
) -> tuple[tuple[int, ...], dict[str, Any]]:
    cand = _closed(receipt["candidate"], "receipt.candidate", _CANDIDATE)
    done = _closed(receipt["completion"], "receipt.completion", _COMPLETION)
    invariants = _inv(cand["invariantFactors"], "candidate invariant factors")
    if invariants != _inv(done["invariantFactors"], "completion invariant factors"):
        raise ArithmeticError("invariant factors differ")
    class_number = 1
    for invariant in invariants:
        class_number *= invariant
    candidate_number = _dec(cand["classNumber"], nonnegative=True)
    completion_number = _dec(done["classNumber"], nonnegative=True)
    if candidate_number != class_number or completion_number != class_number:
        raise ArithmeticError("the Rust receipt invariant product is inconsistent")
    if cand["authority"] not in {
        "authenticated-supplied-principal-relations-candidate-only",
        "authenticated-collector-sealed-compact-elementary-two-presentation",
        "authenticated-collector-sealed-compact-mixed-invariant-presentation",
    }:
        raise ValueError("unknown candidate authority")
    authenticated = _uint(cand["authenticatedPrincipalRelations"])
    witnesses = _uint(cand["generatorOrderWitnesses"])
    if authenticated != rel["relationCount"]:
        raise ArithmeticError("relation count mismatch")
    if witnesses != len(invariants):
        raise ArithmeticError("generator witness mismatch")
    if done["proof"] != _PROOF:
        raise ValueError("completion proof mismatch")
    if _uint(done["unitRank"]) != sum(field.signature()) - 1:
        raise ArithmeticError("unit rank mismatch")
    _uint(done["bfThreshold"])
    if done["classUnitHypothesis"] != "GRH for the Dedekind-zeta residue bound":
        raise ValueError("unknown class/unit hypothesis")
    if done["factorBaseHypothesis"] != (
        "GRH for all unramified Hecke L-functions of class-group characters"
    ):
        raise ValueError("unknown factor-base hypothesis")
    requested_logarithm = _uint(done["requestedLogarithmPrecisionBits"], 2**32 - 1)
    requested_replay = _uint(done["requestedReplayPrecisionBits"], 2**32 - 1)
    requested_resources = request["resources"]
    if requested_logarithm != requested_resources["logarithmPrecisionBits"]:
        raise ArithmeticError("the completion changed logarithm precision")
    if requested_replay != requested_resources["replayPrecisionBits"]:
        raise ArithmeticError("the completion changed replay precision")
    raw_levels = done["attemptedPrecisionLevels"]
    if not isinstance(raw_levels, list) or not raw_levels:
        raise ValueError("missing attempted precision levels")
    levels: list[dict[str, int]] = []
    previous_logarithm = 0
    previous_replay = 0
    for index, raw_level in enumerate(raw_levels):
        level = _closed(
            raw_level,
            f"receipt.completion.attemptedPrecisionLevels[{index}]",
            _PRECISION_LEVEL,
        )
        logarithm = _uint(level["logarithmPrecisionBits"], 2**32 - 1)
        replay = _uint(level["replayPrecisionBits"], 2**32 - 1)
        if logarithm == 0 or replay == 0 or replay > logarithm:
            raise ValueError("invalid attempted precision level")
        if logarithm <= previous_logarithm or replay <= previous_replay:
            raise ValueError("attempted precision levels are not increasing")
        if logarithm > requested_logarithm or replay > requested_replay:
            raise ArithmeticError("an attempted precision exceeds the request")
        levels.append(
            {
                "logarithmPrecisionBits": logarithm,
                "replayPrecisionBits": replay,
            }
        )
        previous_logarithm = logarithm
        previous_replay = replay
    if levels[-1] != {
        "logarithmPrecisionBits": requested_logarithm,
        "replayPrecisionBits": requested_replay,
    }:
        raise ArithmeticError("the final precision attempt does not match the request")
    if done["sealedEvidenceVerified"] is not True:
        raise ArithmeticError("unverified sealed evidence")
    if done["arbitraryIdealClassMapRetained"] is not True:
        raise ArithmeticError("missing private class map")
    return invariants, {
        "candidateClassNumber": candidate_number,
        "candidateAuthority": cand["authority"],
        "authenticatedPrincipalRelations": authenticated,
        "generatorOrderWitnesses": witnesses,
        "requestedLogarithmPrecisionBits": requested_logarithm,
        "requestedReplayPrecisionBits": requested_replay,
        "attemptedPrecisionLevels": levels,
        "rustInternalSealedEvidenceVerified": True,
        "rustInternalArbitraryIdealClassMapRetained": True,
    }


def adapt_rust_public_cubic_qualification_receipt(
    field: Any, request: dict[str, Any], receipt: dict[str, Any]
) -> Any:
    request, auth = _request(field, request)
    receipt = _map(receipt, "receipt")
    if receipt.get("schema") != RECEIPT_SCHEMA:
        raise ValueError("invalid receipt schema")
    if receipt.get("requestedProof") != request["proofMode"]:
        raise ValueError("the Rust receipt changed the requested proof mode")
    for key in ("usesPariInput", "usesPreparedFixture", "usesFieldAnswersAsInput"):
        if receipt.get(key) is not False:
            raise ValueError("forbidden producer input: " + key)
    outcome = receipt.get("outcome")
    if outcome == _COMPLETE:
        expected = _BASE | {"candidate", "completion"}
        if receipt.get("publicComplete") is not True:
            raise ValueError("invalid complete label")
    elif outcome == "incomplete":
        expected = _BASE | {"firstUnavailableBoundary"}
        if receipt.get("publicComplete") is not False:
            raise ValueError("invalid incomplete label")
    else:
        raise ValueError("unknown receipt outcome")
    _closed(receipt, "receipt", expected)
    _prep(field, auth, receipt)
    rel = _closed(receipt["relations"], "receipt.relations", _RELATIONS)
    rels: dict[str, Any] = {
        key: _uint(rel[key])
        for key in ("factorBaseSize", "relationCount", "missingRank")
    }
    complete_rank = rel["completeRankAndSurplus"]
    if type(complete_rank) is not bool:
        raise TypeError("nonboolean rank status")
    rels["completeRankAndSurplus"] = complete_rank
    tentative: tuple[int, ...] = ()
    details: dict[str, Any] = {}
    if outcome == _COMPLETE:
        if not complete_rank or rel["missingRank"] != 0:
            raise ArithmeticError("incomplete relation rank")
        tentative, details = _complete(field, request, receipt, rels)
        unavailable = "sagejs-public-evidence-adaptation"
    else:
        if complete_rank or rel["missingRank"] == 0:
            raise ArithmeticError("inconsistent rank state")
        unavailable = receipt["firstUnavailableBoundary"]
        if unavailable != "relation-collection":
            raise ValueError("unknown unavailable boundary")

    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    request_copy = _json(request)
    diagnostics = {
        "schema": DIAGNOSTICS_SCHEMA,
        "backend": _BACKEND,
        "capabilities": rust_public_cubic_qualification_capability(field)[
            "capabilities"
        ],
        "artifactIdentity": None,
        "artifactIdentityStatus": "not-present-in-receipt-v2",
        "requestIdentity": _hash(request_copy),
        "requestBindingStatus": "not-present-in-receipt-v2",
        "receiptIdentity": _hash(receipt),
        "proofMode": request["proofMode"],
        "completionStatus": "rust-internal-" + str(outcome) + "/sagejs-incomplete",
        "fallbackReason": "receipt-v2 lacks replayable Sage.js public evidence",
        "resourceLimits": {
            "requested": request_copy["resources"],
            "producerBindingStatus": "not-present-in-receipt-v2",
        },
        "automaticDispatch": False,
        "producerPublicCompleteLabel": receipt["publicComplete"],
        "producerFirstUnavailableBoundary": unavailable,
        "stageTimingsNanoseconds": _time(receipt),
        "relations": rels,
        "remainingEvidenceGaps": list(_GAPS),
    }
    diagnostics.update(details)
    stages = (
        groups.ClassUnitStage(
            "rust-public-cubic-qualification",
            "complete" if outcome == _COMPLETE else "incomplete",
            {
                "receiptIdentity": diagnostics["receiptIdentity"],
                "producerOutcome": outcome,
                "producerPublicCompleteLabel": receipt["publicComplete"],
            },
        ),
        groups.ClassUnitStage(
            "sagejs-public-class-unit-adaptation",
            "incomplete",
            {"missingEvidence": list(_GAPS)},
        ),
    )
    return groups.ClassUnitComputation(
        field,
        proof_status=groups.INCOMPLETE_RESOURCE_LIMIT,
        complete=False,
        reason="the Rust summary receipt omits Sage.js public proof evidence",
        algorithm=_ALGORITHM,
        stages=stages,
        tentative_invariants=tentative,
        diagnostics=diagnostics,
    )


__all__ = [
    "adapt_rust_public_cubic_qualification_receipt",
    "rust_public_cubic_qualification_capability",
]
