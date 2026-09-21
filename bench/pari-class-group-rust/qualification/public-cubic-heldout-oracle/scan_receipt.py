#!/usr/bin/env python3
"""Fail closed unless both held-out receipts satisfy their redacted schemas."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent

EXECUTION_TOP_KEYS = {
    "schema",
    "status",
    "answerDisclosure",
    "oracleComparison",
    "partition",
    "degree",
    "caseCount",
    "confirmationPolicy",
    "inputs",
    "sourceClosure",
    "execution",
    "build",
    "privateResults",
    "cases",
}
EXECUTION_CASE_KEYS = {
    "fieldId",
    "status",
    "redactedStage",
    "externalNanoseconds",
    "requestSha256",
}
COMPARISON_TOP_KEYS = {
    "schema",
    "status",
    "answerDisclosure",
    "evidenceRole",
    "rustExecutionReplayed",
    "initialBlindEvidence",
    "partition",
    "degree",
    "caseCount",
    "heldOutCompared",
    "rustExecution",
    "executionReceiptSha256",
    "privateResultsSha256",
    "oracleIdentitySha256",
    "comparisonFields",
    "identityCrossChecks",
    "confirmationPolicy",
    "failurePolicy",
    "cases",
    "verifierSources",
}
COMPARISON_CASE_KEYS = {"fieldId", "status", "redactedStage", "checks"}
CHECK_KEYS = {"check", "status"}
ALLOWED_CHECKS = {
    "polynomialAscending",
    "signature",
    "equationOrderIndex",
    "fieldDiscriminant",
    "candidate.classNumber",
    "candidate.invariantFactors",
    "completion.classNumber",
    "completion.invariantFactors",
    "unitRank",
}

HISTORY_SCHEMA = "sagejs.rust-class-group/heldout-cubic-historical-status-v1"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_history(history_path: Path) -> None:
    history = json.loads(history_path.read_text(encoding="utf-8"))
    require(history.get("schema") == HISTORY_SCHEMA, "historical status schema changed")
    initial = history.get("initialBlindCampaign", {})
    formatted = history.get("formattedHarness", {})
    confirmation = history.get("untouchedConfirmationGate", {})
    require(
        initial.get("policyStateAtExecution") == "uncommitted-worktree-only"
        and initial.get("preregistered") is False,
        "historical status overclaims preregistration",
    )
    require(
        initial.get("receiptsBytePreserved") is True,
        "initial receipt preservation is not asserted",
    )
    require(
        formatted.get("rustReplayPerformed") is False,
        "formatted harness overclaims a Rust replay",
    )
    require(
        formatted.get("restrictedVerifierReplayPerformed") is True,
        "restricted verifier replay is missing",
    )
    require(
        confirmation.get("executed") is False,
        "untouched confirmation set was marked executed",
    )
    execution_receipt_path = (
        HERE.parent / "public-cubic-heldout-corpus" / "receipt.json"
    )
    execution_receipt = json.loads(execution_receipt_path.read_text(encoding="utf-8"))
    require(
        initial.get("executionCommit")
        == execution_receipt.get("execution", {}).get("gitCommit"),
        "historical execution commit differs from the byte-preserved receipt",
    )
    paths = {
        initial.get("executionReceiptSha256"): execution_receipt_path,
        initial.get("comparisonReceiptSha256"): HERE / "receipt.json",
        formatted.get("executorSha256"): HERE.parent
        / "public-cubic-heldout-corpus"
        / "run.py",
        formatted.get("verifierSha256"): HERE / "verify.py",
        formatted.get("strengthenedReceiptSha256"): HERE / "strengthened-receipt.json",
        confirmation.get("inputsSha256"): (
            HERE / confirmation.get("inputsPath", "")
        ).resolve(),
    }
    require(None not in paths, "historical status omits a digest")
    for digest, path in paths.items():
        require(path.is_file(), f"historically bound file is missing: {path.name}")
        require(
            sha256_file(path) == digest, f"historically bound file changed: {path.name}"
        )


def validate_exact_redacted_shapes(execution: dict, comparison: dict) -> None:
    require(
        set(execution) == EXECUTION_TOP_KEYS,
        "execution receipt top-level shape changed",
    )
    require(
        set(comparison) == COMPARISON_TOP_KEYS,
        "comparison receipt top-level shape changed",
    )
    require(
        execution.get("schema")
        == "sagejs.rust-class-group/heldout-cubic-execution-receipt-v1",
        "execution schema changed",
    )
    require(
        comparison.get("schema")
        == "sagejs.rust-class-group/heldout-cubic-oracle-receipt-v1",
        "comparison schema changed",
    )
    require(
        execution.get("answerDisclosure")
        == comparison.get("answerDisclosure")
        == "none",
        "answer disclosure changed",
    )
    require(
        execution.get("oracleComparison") == "not-yet-performed",
        "executor claims oracle access",
    )
    require(
        comparison.get("heldOutCompared") is True,
        "comparison did not cover held-out inputs",
    )
    require(
        comparison.get("rustExecution") == "completed-before-private-evidence-opened",
        "process separation claim changed",
    )
    require(
        comparison.get("evidenceRole") == "post-hoc-strengthened-verifier-replay"
        and comparison.get("rustExecutionReplayed") is False,
        "strengthened receipt overclaims a Rust replay",
    )
    initial = comparison.get("initialBlindEvidence", {})
    require(
        initial.get("policyWasCommittedBeforeExecution") is False
        and initial.get("preregistered") is False,
        "initial blind receipt overclaims preregistration",
    )
    execution_cases = execution.get("cases")
    comparison_cases = comparison.get("cases")
    require(
        isinstance(execution_cases, list) and len(execution_cases) == 12,
        "execution case count changed",
    )
    require(
        isinstance(comparison_cases, list) and len(comparison_cases) == 12,
        "comparison case count changed",
    )
    for case in execution_cases:
        require(set(case) == EXECUTION_CASE_KEYS, "execution case shape changed")
        require(
            case.get("status") in {"completed-self-sealed", "failed"},
            "execution status changed",
        )
    for case in comparison_cases:
        require(set(case) == COMPARISON_CASE_KEYS, "comparison case shape changed")
        require(
            case.get("status") in {"passed", "failed"},
            "comparison status changed",
        )
        checks = case.get("checks")
        require(isinstance(checks, list), "comparison checks are not an array")
        for check in checks:
            require(set(check) == CHECK_KEYS, "comparison check shape changed")
            require(
                check.get("check") in ALLOWED_CHECKS,
                "comparison check name changed",
            )
            require(
                check.get("status") in {"passed", "failed"},
                "comparison check status changed",
            )
    execution_ids = [case.get("fieldId") for case in execution_cases]
    comparison_ids = [case.get("fieldId") for case in comparison_cases]
    require(
        None not in execution_ids and len(set(execution_ids)) == 12,
        "execution identities are invalid",
    )
    require(
        sorted(execution_ids) == sorted(comparison_ids),
        "execution and comparison identities differ",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execution", type=Path, required=True)
    parser.add_argument("--comparison", type=Path, required=True)
    parser.add_argument("--history", type=Path, default=HERE / "historical-status.json")
    arguments = parser.parse_args()
    executor = load_module(
        "heldout_executor", HERE.parent / "public-cubic-heldout-corpus" / "run.py"
    )
    verifier = load_module("heldout_verifier", HERE / "verify.py")
    execution = json.loads(arguments.execution.read_text(encoding="utf-8"))
    comparison = json.loads(arguments.comparison.read_text(encoding="utf-8"))
    executor.assert_redacted(execution)
    verifier.assert_redacted(comparison)
    validate_exact_redacted_shapes(execution, comparison)
    validate_history(arguments.history.resolve())
    print('{"answerDisclosure":"none","status":"passed"}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
