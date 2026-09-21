#!/usr/bin/env python3
"""Compare a terminated confirmation run with the bound private oracle pool."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import tempfile
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
QUALIFICATION = HERE.parent
INPUTS_PATH = HERE / "inputs.json"
POLICY_PATH = HERE / "policy.json"
SELECTION_PATH = HERE / "selection-receipt.json"
COMPARATOR_PATH = QUALIFICATION / "public-cubic-heldout-oracle" / "verify.py"
RECEIPT_SCHEMA = "sagejs.rust-class-group/cubic-confirmation-comparison-v1"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as target:
        target.write(canonical(value) + "\n")
        temporary = Path(target.name)
    temporary.replace(path)


def load_comparator() -> Any:
    spec = importlib.util.spec_from_file_location(
        "heldout_cubic_comparator", COMPARATOR_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load restricted comparator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-results", required=True, type=Path)
    parser.add_argument(
        "--execution-receipt", default=HERE / "execution-receipt.json", type=Path
    )
    parser.add_argument("--candidate-pool", required=True, type=Path)
    parser.add_argument("--private-binding", required=True, type=Path)
    parser.add_argument(
        "--receipt", default=HERE / "comparison-receipt.json", type=Path
    )
    arguments = parser.parse_args()

    private = json.loads(arguments.private_results.read_text())
    execution = json.loads(arguments.execution_receipt.read_text())
    pool = json.loads(arguments.candidate_pool.read_text())
    binding = json.loads(arguments.private_binding.read_text())
    if binding.get("candidatePoolSha256") != digest(arguments.candidate_pool):
        raise RuntimeError("private binding does not bind candidate pool")
    for key, path in (
        ("inputsSha256", INPUTS_PATH),
        ("policySha256", POLICY_PATH),
        ("selectionReceiptSha256", SELECTION_PATH),
    ):
        expected = digest(path)
        if binding.get(key) != expected:
            raise RuntimeError(f"private binding does not bind {key}")
        if private.get(key) != expected or execution.get(key) != expected:
            raise RuntimeError(f"execution identity differs for {key}")
    private_digest = hashlib.sha256(
        (canonical(private) + "\n").encode()
    ).hexdigest()
    if execution.get("privateResults", {}).get("sha256") != private_digest:
        raise RuntimeError("execution receipt does not bind private results")

    inputs = json.loads(INPUTS_PATH.read_text())
    expected_ids = {case["fieldId"] for case in inputs["cases"]}
    result_by_id = {case["fieldId"]: case for case in private.get("cases", [])}
    execution_by_id = {
        case["fieldId"]: case for case in execution.get("cases", [])
    }
    expected_by_id = {
        case["id"]: case
        for case in pool.get("candidates", [])
        if case.get("id") in expected_ids
    }
    if not (
        set(result_by_id)
        == set(execution_by_id)
        == set(expected_by_id)
        == expected_ids
    ):
        raise RuntimeError("confirmation identities differ")

    comparator = load_comparator()
    compared: list[dict[str, Any]] = []
    for field_id in sorted(expected_ids):
        result = comparator.compare_case(
            execution_by_id[field_id],
            result_by_id[field_id],
            expected_by_id[field_id],
        )
        compared.append(
            {
                "fieldId": field_id,
                "status": result["status"],
                "failedChecks": [
                    check["label"]
                    for check in result["checks"]
                    if check["status"] != "passed"
                ],
                "passedCheckCount": sum(
                    check["status"] == "passed" for check in result["checks"]
                ),
            }
        )
    passed = all(case["status"] == "passed" for case in compared)
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "status": "passed" if passed else "failed",
        "answerDisclosure": "none",
        "comparisonRole": "post-execution-restricted-private-oracle",
        "rustExecutionReplayed": False,
        "verifierSha256": digest(Path(__file__)),
        "comparatorSha256": digest(COMPARATOR_PATH),
        "executionReceiptSha256": digest(arguments.execution_receipt),
        "privateResultsSha256": digest(arguments.private_results),
        "privateCandidatePoolDigestPublished": False,
        "caseCount": len(compared),
        "passedCount": sum(case["status"] == "passed" for case in compared),
        "cases": compared,
    }
    atomic_json(arguments.receipt.resolve(), receipt)
    print(
        canonical(
            {
                "status": receipt["status"],
                "caseCount": receipt["caseCount"],
                "passedCount": receipt["passedCount"],
            }
        )
    )
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
