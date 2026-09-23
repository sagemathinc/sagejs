#!/usr/bin/env python3
"""Select untouched confirmation inputs through an answer-blind projection."""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
QUALIFICATION = HERE.parent
POLICY_PATH = HERE / "policy.json"
PANEL_PATH = QUALIFICATION / "corpus" / "qualified-neutral-panel-v1.json"
OUTPUT_PATH = HERE / "inputs.json"
RECEIPT_PATH = HERE / "selection-receipt.json"
POLICY_SCHEMA = "sagejs.rust-class-group/heldout-cubic-confirmation-policy-v2"
POOL_SCHEMA = "sagejs.rust-class-group/private-candidate-pool-v1"
INPUT_SCHEMA = "sagejs.rust-class-group/heldout-cubic-confirmation-inputs-v1"
RECEIPT_SCHEMA = "sagejs.rust-class-group/heldout-cubic-confirmation-selection-v1"
PRIVATE_BINDING_SCHEMA = (
    "sagejs.rust-class-group/private-heldout-cubic-confirmation-binding-v1"
)
PROJECTION_FIELDS = (
    "id",
    "polynomialAscending",
    "polynomialSha256",
    "degree",
    "irreducible",
)
FORBIDDEN_OUTPUT_KEYS = {
    "expected",
    "constructionEvidence",
    "signature",
    "timingStratum",
    "traits",
    "classNumber",
    "invariantFactors",
    "pariPublicNanoseconds",
    "integralBasis",
    "relations",
    "retrySchedule",
    "oracleTrace",
}


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def polynomial_digest(coefficients: list[str]) -> str:
    return sha256_bytes(canonical_json(coefficients).encode())


def validate_policy(policy: dict[str, Any]) -> None:
    if policy.get("schema") != POLICY_SCHEMA:
        raise RuntimeError("unexpected confirmation policy schema")
    if policy.get("status") != "materialized-before-any-heldout-failure-fix":
        raise RuntimeError("confirmation policy timing is not frozen")
    if (
        policy.get("preregistrationStatus")
        != "commit-ready-not-preregistered-until-committed"
    ):
        raise RuntimeError("confirmation policy overclaims preregistration")
    if (
        policy.get("selectionAlgorithm")
        != "seeded-sha256-over-answer-free-projection-v1"
    ):
        raise RuntimeError("unexpected confirmation selection algorithm")
    if policy.get("degree") != 3 or policy.get("caseCount") != 12:
        raise RuntimeError("confirmation policy must select twelve cubics")
    if policy.get("allowedCandidateProjectionFields") != list(PROJECTION_FIELDS):
        raise RuntimeError("answer-free candidate projection changed")
    if set(policy.get("selectionForbiddenFields", [])) != {
        "expected",
        "constructionEvidence",
        "signature",
        "timingStratum",
        "traits",
    }:
        raise RuntimeError("selection forbidden fields changed")
    if not policy.get("excludeEveryOriginalPanelFieldId") or not policy.get(
        "excludeEveryOriginalPanelPolynomialSha256"
    ):
        raise RuntimeError("original panel exclusion is incomplete")
    failure = policy.get("failurePolicy", {})
    if set(failure.values()) != {True} or len(failure) != 4:
        raise RuntimeError("confirmation failure policy is incomplete")
    if not isinstance(policy.get("seed"), str) or len(policy["seed"]) < 32:
        raise RuntimeError("confirmation seed is invalid")


def answer_free_projection(candidate: dict[str, Any]) -> dict[str, Any]:
    missing = set(PROJECTION_FIELDS).difference(candidate)
    if missing:
        raise RuntimeError(
            f"candidate lacks public projection fields: {sorted(missing)}"
        )
    projection = {key: candidate[key] for key in PROJECTION_FIELDS}
    coefficients = projection["polynomialAscending"]
    if (
        not isinstance(projection["id"], str)
        or not isinstance(coefficients, list)
        or not all(isinstance(value, str) for value in coefficients)
        or not isinstance(projection["polynomialSha256"], str)
        or not isinstance(projection["degree"], int)
        or projection["irreducible"] is not True
    ):
        raise RuntimeError("candidate public projection is malformed")
    if len(coefficients) != projection["degree"] + 1 or coefficients[-1] != "1":
        raise RuntimeError("candidate polynomial shape is invalid")
    if polynomial_digest(coefficients) != projection["polynomialSha256"]:
        raise RuntimeError("candidate polynomial digest is invalid")
    return projection


def original_identities(panel: dict[str, Any]) -> tuple[set[str], set[str]]:
    if panel.get("schema") != "sagejs.rust-class-group/qualified-neutral-panel-v1":
        raise RuntimeError("unexpected original panel schema")
    ids: set[str] = set()
    digests: set[str] = set()
    for partition in ("open", "heldOut"):
        cases = panel.get("partitions", {}).get(partition, {}).get("cases", [])
        if len(cases) != 60:
            raise RuntimeError("original panel partition is incomplete")
        for case in cases:
            field_id = case.get("fieldId")
            coefficients = case.get("field", {}).get("coefficientsAscending")
            if not isinstance(field_id, str) or not isinstance(coefficients, list):
                raise RuntimeError("original panel identity is malformed")
            ids.add(field_id)
            digests.add(polynomial_digest(coefficients))
    if len(ids) != 120 or len(digests) != 120:
        raise RuntimeError("original panel identities are not unique")
    return ids, digests


def select_projections(
    pool: dict[str, Any], panel: dict[str, Any], policy: dict[str, Any]
) -> list[dict[str, Any]]:
    if pool.get("schema") != POOL_SCHEMA:
        raise RuntimeError("unexpected private candidate-pool schema")
    candidates = pool.get("candidates")
    if not isinstance(candidates, list):
        raise RuntimeError("private candidate pool has no candidate array")
    excluded_ids, excluded_digests = original_identities(panel)
    eligible: list[tuple[str, dict[str, Any]]] = []
    seen_ids: set[str] = set()
    seen_digests: set[str] = set()
    for candidate in candidates:
        projection = answer_free_projection(candidate)
        if projection["degree"] != policy["degree"]:
            continue
        if (
            projection["id"] in excluded_ids
            or projection["polynomialSha256"] in excluded_digests
        ):
            continue
        if (
            projection["id"] in seen_ids
            or projection["polynomialSha256"] in seen_digests
        ):
            raise RuntimeError("duplicate eligible confirmation identity")
        seen_ids.add(projection["id"])
        seen_digests.add(projection["polynomialSha256"])
        score = sha256_bytes(
            (policy["seed"] + "\0" + canonical_json(projection)).encode()
        )
        eligible.append((score, projection))
    eligible.sort(
        key=lambda item: (item[0], item[1]["polynomialSha256"], item[1]["id"])
    )
    count = policy["caseCount"]
    if len(eligible) < count:
        raise RuntimeError("not enough unused answer-free cubic candidates")
    return [projection for _, projection in eligible[:count]]


def runtime_case(projection: dict[str, Any], policy: dict[str, Any]) -> dict[str, Any]:
    randomness_seed = sha256_bytes(
        (policy["seed"] + "\0runtime\0" + projection["id"]).encode()
    )
    return {
        "schema": "sagejs.rust-class-group.neutral-input/v1",
        "inputId": "sha256:" + sha256_bytes(canonical_json(projection).encode()),
        "fieldId": projection["id"],
        "field": {
            "variable": "x",
            "coefficientsAscending": projection["polynomialAscending"],
            "degree": projection["degree"],
            "monic": True,
            "irreducible": projection["irreducible"],
        },
        "preparation": {"kind": "public-polynomial"},
        "request": {
            "proof": policy["runtimeProofMode"],
            "output": "class-and-unit-group",
            "mapPolicy": "construct-eagerly",
            "unitPolicy": "compact-complete",
            "limits": {
                "wallMilliseconds": "600000",
                "memoryBytes": "4294967296",
                "relationCandidates": "100000000",
                "precisionBits": 4096,
                "continuationPasses": 100,
            },
        },
        "randomness": {"algorithm": "chacha20-v1", "seed": randomness_seed},
        "containsOracleAnswers": False,
    }


def assert_answer_free(value: Any) -> None:
    def visit(item: Any) -> None:
        if isinstance(item, dict):
            forbidden = FORBIDDEN_OUTPUT_KEYS.intersection(item)
            if forbidden:
                raise RuntimeError(
                    f"public confirmation output leaks forbidden keys: {sorted(forbidden)}"
                )
            for child in item.values():
                visit(child)
        elif isinstance(item, list):
            for child in item:
                visit(child)

    visit(value)


def build_outputs(
    pool: dict[str, Any], panel: dict[str, Any], policy: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    selected = select_projections(pool, panel, policy)
    manifest = {
        "schema": INPUT_SCHEMA,
        "status": "frozen-unexecuted-confirmation-inputs",
        "answerVisibility": "none",
        "selectionTiming": policy["status"],
        "policy": POLICY_PATH.name,
        "policySha256": sha256_file(POLICY_PATH),
        "originalPanel": PANEL_PATH.relative_to(QUALIFICATION).as_posix(),
        "originalPanelSha256": sha256_file(PANEL_PATH),
        "partition": "confirmation",
        "degree": policy["degree"],
        "caseCount": len(selected),
        "executed": False,
        "cases": [runtime_case(projection, policy) for projection in selected],
    }
    assert_answer_free(manifest)
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "status": "passed",
        "answerDisclosure": "none",
        "selectionUsedAnswerOrOutputFields": False,
        "selectionProjectionFields": list(PROJECTION_FIELDS),
        "selectionIgnoredFields": policy["selectionForbiddenFields"],
        "selectionAlgorithm": policy["selectionAlgorithm"],
        "selectionTiming": policy["status"],
        "frozenUtc": policy["frozenUtc"],
        "preregistrationStatus": policy["preregistrationStatus"],
        "policySha256": sha256_file(POLICY_PATH),
        "originalPanelSha256": sha256_file(PANEL_PATH),
        "originalPanelCaseCount": 120,
        "excludedByIdentityAndPolynomial": True,
        "eligibleUnusedCubicCount": eligible_unused_count(pool, panel, policy),
        "selectedCaseCount": len(selected),
        "inputsSha256": sha256_bytes(manifest_bytes),
        "inputsExecuted": False,
        "privateCandidatePoolDigestPublished": False,
    }
    assert_answer_free(receipt)
    return manifest, receipt


def eligible_unused_count(
    pool: dict[str, Any], panel: dict[str, Any], policy: dict[str, Any]
) -> int:
    excluded_ids, excluded_digests = original_identities(panel)
    count = 0
    for candidate in pool["candidates"]:
        projection = answer_free_projection(candidate)
        if (
            projection["degree"] == policy["degree"]
            and projection["id"] not in excluded_ids
            and projection["polynomialSha256"] not in excluded_digests
        ):
            count += 1
    return count


def render(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True) + "\n"


def atomic_write(path: Path, text: str, *, private: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False
    ) as temporary:
        temporary.write(text)
        temporary_path = Path(temporary.name)
    if private:
        temporary_path.chmod(0o600)
    temporary_path.replace(path)
    if private:
        path.chmod(0o600)


def require_outside_repository(path: Path) -> Path:
    repository = HERE.parents[3]
    resolved = path.resolve()
    try:
        resolved.relative_to(repository)
    except ValueError:
        return resolved
    raise RuntimeError("private binding path must be outside the repository")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate-pool", type=Path, required=True)
    parser.add_argument("--private-binding", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    policy = load_json(POLICY_PATH)
    validate_policy(policy)
    pool = load_json(arguments.candidate_pool.resolve())
    panel = load_json(PANEL_PATH)
    manifest, receipt = build_outputs(pool, panel, policy)
    expected = {OUTPUT_PATH: render(manifest), RECEIPT_PATH: render(receipt)}
    private_binding_path = require_outside_repository(arguments.private_binding)
    private_binding = {
        "schema": PRIVATE_BINDING_SCHEMA,
        "candidatePoolSha256": sha256_file(arguments.candidate_pool.resolve()),
        "policySha256": sha256_file(POLICY_PATH),
        "originalPanelSha256": sha256_file(PANEL_PATH),
        "inputsSha256": receipt["inputsSha256"],
        "selectionReceiptSha256": sha256_bytes(expected[RECEIPT_PATH].encode()),
        "selectedCaseCount": receipt["selectedCaseCount"],
        "inputsExecuted": False,
    }
    if arguments.check:
        for path, text in expected.items():
            if not path.is_file() or path.read_text(encoding="utf-8") != text:
                raise RuntimeError(
                    f"generated confirmation artifact differs: {path.name}"
                )
        if (
            not private_binding_path.is_file()
            or load_json(private_binding_path) != private_binding
        ):
            raise RuntimeError("private confirmation binding differs")
    else:
        for path, text in expected.items():
            atomic_write(path, text)
        atomic_write(private_binding_path, render(private_binding), private=True)
    print(
        canonical_json(
            {
                "status": "passed",
                "selectedCaseCount": receipt["selectedCaseCount"],
                "inputsSha256": receipt["inputsSha256"],
                "inputsExecuted": False,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
