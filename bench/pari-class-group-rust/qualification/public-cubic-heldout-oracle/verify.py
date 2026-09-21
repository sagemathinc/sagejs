#!/usr/bin/env python3
"""Compare terminated held-out Rust results with private oracle evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
import time
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"
DEFAULT_RECEIPT = HERE / "receipt.json"
CONFIG_SCHEMA = "sagejs.rust-class-group/public-cubic-heldout-oracle-config-v1"
EXECUTION_SCHEMA = "sagejs.rust-class-group/heldout-cubic-execution-receipt-v1"
PRIVATE_RESULTS_SCHEMA = "sagejs.rust-class-group/private-heldout-cubic-rust-results-v1"
PRIVATE_EVIDENCE_SCHEMA = "sagejs.rust-class-group/private-qualified-panel-evidence-v1"
RECEIPT_SCHEMA = "sagejs.rust-class-group/heldout-cubic-oracle-receipt-v1"
INITIAL_EXECUTION_RECEIPT_SHA256 = (
    "9ed956b7017dc84ec73977c046bc7c425e28da1b5815e9d305a5abf58002a60b"
)
INITIAL_COMPARISON_RECEIPT_SHA256 = (
    "3c9916a538ee4852b1f2d021a4b243ac1718d8a706a8ef153bb801bd8a921fbd"
)

FORBIDDEN_KEYS = {
    "polynomialAscending",
    "coefficientsAscending",
    "result",
    "parsedResult",
    "stdout",
    "stderr",
    "classNumber",
    "invariantFactors",
    "discriminant",
    "signature",
    "equationOrderIndex",
    "unitRank",
    "expected",
    "privateEvidenceSha256",
}


class VerificationError(RuntimeError):
    """A structural, sequencing, or cryptographic check failed."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def bound_json(path: Path, digest: str, label: str) -> Any:
    require(path.is_file(), f"{label} is missing")
    require(sha256_file(path) == digest, f"{label} SHA-256 mismatch")
    return load_json(path)


def checked(label: str, actual: Any, expected: Any) -> dict[str, str]:
    return {"check": label, "status": "passed" if actual == expected else "failed"}


def assert_redacted(receipt: Any) -> None:
    def visit(value: Any) -> None:
        if isinstance(value, dict):
            forbidden = FORBIDDEN_KEYS.intersection(value)
            require(
                not forbidden,
                f"redacted receipt contains forbidden keys: {sorted(forbidden)}",
            )
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    require(isinstance(receipt, dict), "redacted receipt is not an object")
    visit(receipt)
    require(
        receipt.get("answerDisclosure") == "none", "answer disclosure is not denied"
    )


def index_cases(cases: Any, id_key: str, label: str) -> dict[str, dict[str, Any]]:
    require(isinstance(cases, list), f"{label} cases are not an array")
    indexed = {case.get(id_key): case for case in cases if isinstance(case, dict)}
    require(None not in indexed, f"{label} case has no identity")
    require(len(indexed) == len(cases), f"{label} case identities are not unique")
    return indexed


def validate_private_provenance(
    private: dict[str, Any],
    selected: dict[str, dict[str, Any]],
    oracle: dict[str, Any],
    trace: dict[str, Any],
) -> None:
    private_oracle = private.get("oracleBuild", {})
    require(
        private_oracle.get("pariVersion") == oracle.get("pariVersion")
        and private_oracle.get("gpSha256") == oracle.get("gpSha256"),
        "private evidence was produced by another oracle build",
    )
    require(
        private_oracle.get("buchallSourceSha256")
        == trace.get("source", {}).get("sha256"),
        "private evidence used another PARI trace source",
    )
    expected_identity = (
        f"pari-{private_oracle['pariVersion']}-gp-sha256:{private_oracle['gpSha256']}"
    )
    for case in selected.values():
        expected = case.get("expected", {})
        independent = case.get("constructionEvidence", {}).get("independent", {})
        require(case.get("irreducible") is True, "private case is not irreducible")
        require(
            expected.get("validationStatus") == "pari-plus-independent-check",
            "private case lacks independent validation status",
        )
        require(
            expected.get("oracleIdentity") == expected_identity,
            "private case refers to another oracle identity",
        )
        require(
            independent.get("irreducible") is True
            and independent.get("signature") == case.get("signature"),
            "private case lacks independent irreducibility/signature evidence",
        )
        require(
            independent.get("polynomialDiscriminant")
            == independent.get("fieldDiscriminantTimesIndexSquared"),
            "private case fails the independent discriminant/index identity",
        )


def validate_execution_identity(
    execution: dict[str, Any], private_results: dict[str, Any]
) -> None:
    require(
        private_results.get("gitCommit")
        == execution.get("execution", {}).get("gitCommit"),
        "private and public execution commits differ",
    )
    require(
        private_results.get("panelSha256")
        == execution.get("inputs", {}).get("panelSha256"),
        "private and public panel identities differ",
    )
    require(
        private_results.get("selectionReceiptSha256")
        == execution.get("inputs", {}).get("selectionReceiptSha256"),
        "private and public selection identities differ",
    )
    require(
        private_results.get("sourceClosure") == execution.get("sourceClosure"),
        "private and public source closures differ",
    )
    private_build = private_results.get("build", {})
    public_build = execution.get("build", {})
    for key in (
        "kind",
        "nanoseconds",
        "binaryBytes",
        "binarySha256",
        "linkageSha256",
        "linksPari",
    ):
        require(
            private_build.get(key) == public_build.get(key),
            f"private and public build identities differ: {key}",
        )
    require(public_build.get("linksPari") is False, "held-out binary links PARI")
    require(
        private_results.get("campaignNanoseconds")
        == execution.get("execution", {}).get("campaignNanoseconds"),
        "private and public campaign timings differ",
    )


def compare_case(
    execution: dict[str, Any],
    private_result: dict[str, Any],
    private_expected: dict[str, Any],
) -> dict[str, Any]:
    field_id = execution.get("fieldId")
    if execution.get("status") != "completed-self-sealed":
        return {
            "fieldId": field_id,
            "status": "failed",
            "redactedStage": execution.get("redactedStage") or "execution",
            "checks": [],
        }
    result = private_result.get("parsedResult")
    if not isinstance(result, dict):
        return {
            "fieldId": field_id,
            "status": "failed",
            "redactedStage": "private-result-structure",
            "checks": [],
        }
    preparation = result.get("preparation", {})
    candidate = result.get("candidate", {})
    completion = result.get("completion", {})
    expected = private_expected.get("expected", {})
    construction = private_expected.get("constructionEvidence", {})
    signature = private_expected.get("signature")
    expected_unit_rank = (
        signature[0] + signature[1] - 1
        if isinstance(signature, list) and len(signature) == 2
        else None
    )
    checks = [
        checked(
            "polynomialAscending",
            private_result.get("polynomialAscending"),
            private_expected.get("polynomialAscending"),
        ),
        checked("signature", preparation.get("signature"), signature),
        checked(
            "equationOrderIndex",
            preparation.get("equationOrderIndex"),
            construction.get("equationOrderIndex"),
        ),
        checked(
            "fieldDiscriminant",
            preparation.get("discriminant"),
            construction.get("fieldDiscriminant"),
        ),
        checked(
            "candidate.classNumber",
            candidate.get("classNumber"),
            expected.get("classNumber"),
        ),
        checked(
            "candidate.invariantFactors",
            candidate.get("invariantFactors"),
            expected.get("invariantFactors"),
        ),
        checked(
            "completion.classNumber",
            completion.get("classNumber"),
            expected.get("classNumber"),
        ),
        checked(
            "completion.invariantFactors",
            completion.get("invariantFactors"),
            expected.get("invariantFactors"),
        ),
        checked("unitRank", completion.get("unitRank"), expected_unit_rank),
    ]
    complete = (
        result.get("schema") == "sagejs.rust-class-group/public-cubic-e2e-receipt-v2"
        and result.get("outcome") == "complete-conditional-grh"
        and result.get("publicComplete") is True
        and result.get("usesPariInput") is False
        and result.get("usesPreparedFixture") is False
        and result.get("usesFieldAnswersAsInput") is False
        and completion.get("sealedEvidenceVerified") is True
    )
    passed = complete and all(check["status"] == "passed" for check in checks)
    return {
        "fieldId": field_id,
        "status": "passed" if passed else "failed",
        "redactedStage": None if passed else "independent-oracle-comparison",
        "checks": checks,
    }


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False
    ) as temporary:
        json.dump(value, temporary, indent=2, sort_keys=True)
        temporary.write("\n")
        temporary_path = Path(temporary.name)
    temporary_path.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-results", type=Path, required=True)
    parser.add_argument("--private-evidence", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, default=DEFAULT_RECEIPT)
    arguments = parser.parse_args()
    verification_started = time.time_ns()

    config = load_json(CONFIG_PATH)
    require(config.get("schema") == CONFIG_SCHEMA, "unexpected verifier config schema")
    require(
        config.get("partition") == "heldOut", "verifier must select held-out partition"
    )
    require(config.get("degree") == 3, "verifier must select cubics")
    require(config.get("expectedCaseCount") == 12, "verifier must compare twelve cases")

    execution_config_path = (HERE / config["executionConfig"]).resolve()
    execution_config = bound_json(
        execution_config_path, config["executionConfigSha256"], "execution config"
    )
    panel = bound_json(
        (HERE / config["panel"]).resolve(), config["panelSha256"], "panel"
    )
    selection = bound_json(
        (HERE / config["selectionReceipt"]).resolve(),
        config["selectionReceiptSha256"],
        "selection receipt",
    )
    oracle = bound_json(
        (HERE / config["oracleIdentity"]).resolve(),
        config["oracleIdentitySha256"],
        "oracle identity",
    )
    trace = bound_json(
        (HERE / config["traceContract"]).resolve(),
        config["traceContractSha256"],
        "trace contract",
    )
    execution_path = (HERE / config["executionReceipt"]).resolve()
    execution = load_json(execution_path)
    require(
        execution.get("schema") == EXECUTION_SCHEMA,
        "unexpected execution receipt schema",
    )
    require(
        execution.get("answerDisclosure") == "none",
        "execution receipt discloses answers",
    )
    require(
        execution.get("oracleComparison") == "not-yet-performed",
        "execution receipt already claims oracle work",
    )
    require(execution.get("caseCount") == 12, "execution receipt case count changed")
    require(
        execution.get("confirmationPolicy")
        == execution_config.get("confirmationPolicy"),
        "execution did not use the frozen confirmation policy",
    )
    require(
        execution.get("inputs", {}).get("panelSha256") == config["panelSha256"],
        "execution used another panel",
    )
    require(
        execution.get("inputs", {}).get("selectionReceiptSha256")
        == config["selectionReceiptSha256"],
        "execution used another selection receipt",
    )
    require(
        execution.get("inputs", {}).get("configSha256")
        == config["executionConfigSha256"],
        "execution used another configuration",
    )
    require(
        execution.get("sourceClosure", {}).get("containsDirtyAlgorithmSources")
        is False,
        "execution used dirty algorithm sources",
    )

    private_results_path = arguments.private_results.resolve()
    private_results = bound_json(
        private_results_path,
        execution.get("privateResults", {}).get("sha256", ""),
        "private Rust results",
    )
    require(
        private_results.get("schema") == PRIVATE_RESULTS_SCHEMA,
        "unexpected private result schema",
    )
    require(
        private_results.get("executionComplete") is True,
        "Rust execution is not complete",
    )
    ended = private_results.get("executionEndedUnixNanoseconds")
    require(
        isinstance(ended, int) and ended < verification_started,
        "verifier started before Rust execution ended",
    )
    require(
        ended == execution.get("execution", {}).get("executionEndedUnixNanoseconds"),
        "execution end marker differs",
    )
    require(
        private_results.get("configSha256") == config["executionConfigSha256"],
        "private results used another config",
    )
    validate_execution_identity(execution, private_results)

    private_evidence_path = arguments.private_evidence.resolve()
    expected_private_digest = selection.get("privateEvidenceSha256")
    require(
        isinstance(expected_private_digest, str),
        "selection receipt lacks private binding",
    )
    private_evidence = bound_json(
        private_evidence_path, expected_private_digest, "private qualification evidence"
    )
    require(
        private_evidence.get("schema") == PRIVATE_EVIDENCE_SCHEMA,
        "unexpected private evidence schema",
    )

    public_selected = [
        case
        for case in panel["partitions"]["heldOut"]["cases"]
        if case.get("field", {}).get("degree") == 3
    ]
    private_selected = [
        case
        for case in private_evidence["partitions"]["heldOut"]["cases"]
        if case.get("degree") == 3
    ]
    public_by_id = index_cases(public_selected, "fieldId", "public panel")
    expected_by_id = index_cases(private_selected, "id", "private evidence")
    result_by_id = index_cases(
        private_results.get("cases"), "fieldId", "private Rust result"
    )
    execution_by_id = index_cases(
        execution.get("cases"), "fieldId", "execution receipt"
    )
    expected_ids = set(public_by_id)
    require(len(expected_ids) == 12, "panel does not contain twelve held-out cubics")
    require(set(expected_by_id) == expected_ids, "private evidence identities differ")
    require(set(result_by_id) == expected_ids, "private Rust result identities differ")
    require(set(execution_by_id) == expected_ids, "execution receipt identities differ")
    validate_private_provenance(private_evidence, expected_by_id, oracle, trace)
    for field_id in expected_ids:
        require(
            result_by_id[field_id].get("polynomialAscending")
            == public_by_id[field_id]["field"]["coefficientsAscending"],
            "private Rust input differs from frozen public input",
        )
        require(
            result_by_id[field_id].get("requestSha256")
            == execution_by_id[field_id].get("requestSha256"),
            "private and redacted request bindings differ",
        )

    cases = [
        compare_case(
            execution_by_id[field_id], result_by_id[field_id], expected_by_id[field_id]
        )
        for field_id in sorted(expected_ids)
    ]
    all_passed = all(case["status"] == "passed" for case in cases)
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "status": "passed" if all_passed else "failed",
        "answerDisclosure": "none",
        "evidenceRole": "post-hoc-strengthened-verifier-replay",
        "rustExecutionReplayed": False,
        "initialBlindEvidence": {
            "executionReceiptSha256": INITIAL_EXECUTION_RECEIPT_SHA256,
            "comparisonReceiptSha256": INITIAL_COMPARISON_RECEIPT_SHA256,
            "policyWasCommittedBeforeExecution": False,
            "preregistered": False,
        },
        "partition": "heldOut",
        "degree": 3,
        "caseCount": len(cases),
        "heldOutCompared": True,
        "rustExecution": "completed-before-private-evidence-opened",
        "executionReceiptSha256": sha256_file(execution_path),
        "privateResultsSha256": sha256_file(private_results_path),
        "oracleIdentitySha256": config["oracleIdentitySha256"],
        "comparisonFields": config["comparisonFields"],
        "identityCrossChecks": {
            "gitCommit": "matched",
            "sourceClosure": "matched",
            "binarySha256AndBytes": "matched",
            "linkageSha256AndNoPari": "matched",
            "panelSelectionAndConfig": "matched",
            "campaignEndAndDuration": "matched",
        },
        "confirmationPolicy": execution_config["confirmationPolicy"],
        "failurePolicy": "never-remove-fix-requires-untouched-confirmation-set",
        "cases": cases,
        "verifierSources": {
            "configSha256": sha256_file(CONFIG_PATH),
            "verifierSha256": sha256_file(Path(__file__).resolve()),
        },
    }
    assert_redacted(receipt)
    atomic_json(arguments.receipt.resolve(), receipt)
    print(
        json.dumps(
            {
                "status": receipt["status"],
                "caseCount": len(cases),
                "passedCount": sum(case["status"] == "passed" for case in cases),
                "failedCount": sum(case["status"] == "failed" for case in cases),
                "receiptSha256": sha256_file(arguments.receipt.resolve()),
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
