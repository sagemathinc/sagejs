#!/usr/bin/env python3
"""Adversarial tests for the post-execution held-out verifier."""

from __future__ import annotations

import ast
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent


def load_verifier():
    spec = importlib.util.spec_from_file_location("heldout_verify", HERE / "verify.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


VERIFY = load_verifier()


def load_scanner():
    spec = importlib.util.spec_from_file_location(
        "heldout_scan", HERE / "scan_receipt.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture() -> tuple[dict, dict, dict]:
    result = {
        "schema": "sagejs.rust-class-group/public-cubic-e2e-receipt-v2",
        "outcome": "complete-conditional-grh",
        "publicComplete": True,
        "usesPariInput": False,
        "usesPreparedFixture": False,
        "usesFieldAnswersAsInput": False,
        "preparation": {
            "signature": [1, 1],
            "equationOrderIndex": "7",
            "discriminant": "-SECRET-DISC",
        },
        "candidate": {"classNumber": "SECRET-H", "invariantFactors": ["SECRET-I"]},
        "completion": {
            "classNumber": "SECRET-H",
            "invariantFactors": ["SECRET-I"],
            "unitRank": 1,
            "sealedEvidenceVerified": True,
        },
    }
    execution = {
        "fieldId": "public-id",
        "status": "completed-self-sealed",
        "redactedStage": None,
    }
    private_result = {
        "fieldId": "public-id",
        "polynomialAscending": ["SECRET-POLY"],
        "parsedResult": result,
    }
    private_expected = {
        "id": "public-id",
        "polynomialAscending": ["SECRET-POLY"],
        "signature": [1, 1],
        "constructionEvidence": {
            "equationOrderIndex": "7",
            "fieldDiscriminant": "-SECRET-DISC",
        },
        "expected": {"classNumber": "SECRET-H", "invariantFactors": ["SECRET-I"]},
    }
    return execution, private_result, private_expected


class HeldoutVerifierTests(unittest.TestCase):
    def test_verifier_has_no_process_launching_import(self) -> None:
        tree = ast.parse((HERE / "verify.py").read_text(encoding="utf-8"))
        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".")[0])
        self.assertNotIn("subprocess", imported)
        self.assertNotIn("os", imported)

    def test_success_receipt_does_not_copy_values(self) -> None:
        case = VERIFY.compare_case(*fixture())
        self.assertEqual(case["status"], "passed")
        rendered = json.dumps(case)
        for secret in ("SECRET-POLY", "SECRET-DISC", "SECRET-H", "SECRET-I"):
            self.assertNotIn(secret, rendered)

    def test_each_exact_mismatch_is_preserved_but_redacted(self) -> None:
        execution, private_result, private_expected = fixture()
        for check_name, mutate in (
            (
                "polynomialAscending",
                lambda: private_result.update(polynomialAscending=["different"]),
            ),
            (
                "signature",
                lambda: private_result["parsedResult"]["preparation"].update(
                    signature=[3, 0]
                ),
            ),
            (
                "equationOrderIndex",
                lambda: private_result["parsedResult"]["preparation"].update(
                    equationOrderIndex="8"
                ),
            ),
            (
                "fieldDiscriminant",
                lambda: private_result["parsedResult"]["preparation"].update(
                    discriminant="different"
                ),
            ),
            (
                "candidate.classNumber",
                lambda: private_result["parsedResult"]["candidate"].update(
                    classNumber="different"
                ),
            ),
            (
                "candidate.invariantFactors",
                lambda: private_result["parsedResult"]["candidate"].update(
                    invariantFactors=[]
                ),
            ),
            (
                "completion.classNumber",
                lambda: private_result["parsedResult"]["completion"].update(
                    classNumber="different"
                ),
            ),
            (
                "completion.invariantFactors",
                lambda: private_result["parsedResult"]["completion"].update(
                    invariantFactors=[]
                ),
            ),
            (
                "unitRank",
                lambda: private_result["parsedResult"]["completion"].update(unitRank=2),
            ),
        ):
            execution, private_result, private_expected = fixture()
            mutate()
            case = VERIFY.compare_case(execution, private_result, private_expected)
            self.assertEqual(case["status"], "failed", check_name)
            failed = [
                check["check"]
                for check in case["checks"]
                if check["status"] == "failed"
            ]
            self.assertIn(check_name, failed)

    def test_execution_failure_does_not_open_mathematical_values(self) -> None:
        execution, private_result, private_expected = fixture()
        execution.update(status="failed", redactedStage="timeout")
        case = VERIFY.compare_case(execution, private_result, private_expected)
        self.assertEqual(
            case,
            {
                "fieldId": "public-id",
                "status": "failed",
                "redactedStage": "timeout",
                "checks": [],
            },
        )

    def test_disclosure_scanner_rejects_every_forbidden_key(self) -> None:
        VERIFY.assert_redacted({"answerDisclosure": "none", "cases": []})
        for forbidden in VERIFY.FORBIDDEN_KEYS:
            with self.assertRaises(VERIFY.VerificationError, msg=forbidden):
                VERIFY.assert_redacted(
                    {"answerDisclosure": "none", "cases": [{forbidden: "sentinel"}]}
                )

    def test_publication_scanner_rejects_extra_case_fields_and_id_drift(self) -> None:
        scanner = load_scanner()
        execution = {key: None for key in scanner.EXECUTION_TOP_KEYS}
        execution.update(
            schema="sagejs.rust-class-group/heldout-cubic-execution-receipt-v1",
            answerDisclosure="none",
            oracleComparison="not-yet-performed",
            cases=[
                {
                    "fieldId": f"case-{index}",
                    "status": "failed",
                    "redactedStage": "completion",
                    "externalNanoseconds": 1,
                    "requestSha256": "0" * 64,
                }
                for index in range(12)
            ],
        )
        comparison = {key: None for key in scanner.COMPARISON_TOP_KEYS}
        comparison.update(
            schema="sagejs.rust-class-group/heldout-cubic-oracle-receipt-v1",
            answerDisclosure="none",
            evidenceRole="post-hoc-strengthened-verifier-replay",
            rustExecutionReplayed=False,
            initialBlindEvidence={
                "policyWasCommittedBeforeExecution": False,
                "preregistered": False,
            },
            heldOutCompared=True,
            rustExecution="completed-before-private-evidence-opened",
            cases=[
                {
                    "fieldId": f"case-{index}",
                    "status": "failed",
                    "redactedStage": "completion",
                    "checks": [],
                }
                for index in range(12)
            ],
        )
        scanner.validate_exact_redacted_shapes(execution, comparison)
        leaked = copy.deepcopy(comparison)
        leaked["cases"][0]["answer"] = "SECRET"
        with self.assertRaises(RuntimeError):
            scanner.validate_exact_redacted_shapes(execution, leaked)
        drifted = copy.deepcopy(comparison)
        drifted["cases"][0]["fieldId"] = "another-case"
        with self.assertRaises(RuntimeError):
            scanner.validate_exact_redacted_shapes(execution, drifted)

    def test_every_execution_identity_mismatch_fails_closed(self) -> None:
        execution = {
            "execution": {"gitCommit": "commit", "campaignNanoseconds": 17},
            "inputs": {"panelSha256": "panel", "selectionReceiptSha256": "selection"},
            "sourceClosure": {"algorithmRootSha256": "closure"},
            "build": {
                "kind": "cargo-build-locked-release",
                "nanoseconds": 3,
                "binaryBytes": 5,
                "binarySha256": "binary",
                "linkageSha256": "linkage",
                "linksPari": False,
            },
        }
        private = {
            "gitCommit": "commit",
            "campaignNanoseconds": 17,
            "panelSha256": "panel",
            "selectionReceiptSha256": "selection",
            "sourceClosure": {"algorithmRootSha256": "closure"},
            "build": copy.deepcopy(execution["build"]),
        }
        VERIFY.validate_execution_identity(execution, private)
        mutations = []
        for key in (
            "gitCommit",
            "campaignNanoseconds",
            "panelSha256",
            "selectionReceiptSha256",
            "sourceClosure",
        ):
            mutations.append(
                (key, lambda value, key=key: value.__setitem__(key, "different"))
            )
        for key in execution["build"]:
            mutations.append(
                (
                    f"build.{key}",
                    lambda value, key=key: value["build"].__setitem__(
                        key, True if key != "linksPari" else True
                    ),
                )
            )
        for label, mutate in mutations:
            changed = copy.deepcopy(private)
            mutate(changed)
            with self.assertRaises(VERIFY.VerificationError, msg=label):
                VERIFY.validate_execution_identity(execution, changed)

    def test_historical_bindings_preserve_initial_and_strengthened_receipts(
        self,
    ) -> None:
        scanner = load_scanner()
        scanner.validate_history(HERE / "historical-status.json")

    def test_historical_execution_commit_is_derived_from_initial_receipt(self) -> None:
        scanner = load_scanner()
        history = json.loads(
            (HERE / "historical-status.json").read_text(encoding="utf-8")
        )
        history["initialBlindCampaign"]["executionCommit"] = "0" * 40
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "history.json"
            path.write_text(json.dumps(history), encoding="utf-8")
            with self.assertRaisesRegex(
                RuntimeError, "historical execution commit differs"
            ):
                scanner.validate_history(path)


if __name__ == "__main__":
    unittest.main()
