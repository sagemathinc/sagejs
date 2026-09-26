#!/usr/bin/env python3
"""Adversarial tests for the restricted open-cubic oracle comparator."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import verify


class RestrictedOracleVerifierTests(unittest.TestCase):
    def test_wrong_private_digest_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private.json"
            path.write_text("{}\n", encoding="utf-8")
            with self.assertRaisesRegex(verify.VerificationError, "SHA-256 mismatch"):
                verify.bound_json(path, "0" * 64, "private evidence")

    def test_case_set_mismatch_fails_closed(self) -> None:
        with self.assertRaisesRegex(verify.VerificationError, "field IDs differ"):
            verify.compare_case_sets({"public": {}}, {"private": {}})

    def test_mutated_expected_field_is_retained_without_values(self) -> None:
        public = {
            "fieldId": "synthetic-cubic",
            "polynomialAscending": ["1", "0", "-1", "1"],
            "result": {
                "publicComplete": True,
                "outcome": "complete-conditional-grh",
                "usesPariInput": False,
                "usesPreparedFixture": False,
                "usesFieldAnswersAsInput": False,
                "preparation": {
                    "signature": [1, 1],
                    "equationOrderIndex": "2",
                    "discriminant": "-23",
                },
                "candidate": {"classNumber": "7", "invariantFactors": ["7"]},
                "completion": {
                    "classNumber": "7",
                    "invariantFactors": ["7"],
                    "unitRank": 1,
                },
            },
        }
        private = {
            "polynomialAscending": ["1", "0", "-1", "1"],
            "signature": [1, 1],
            "constructionEvidence": {
                "equationOrderIndex": "2",
                "fieldDiscriminant": "-23",
            },
            "expected": {"classNumber": "11", "invariantFactors": ["7"]},
        }
        result = verify.compare_case(public, private)
        self.assertEqual(result["status"], "failed")
        failed = [
            check["field"] for check in result["checks"] if check["status"] == "failed"
        ]
        self.assertEqual(failed, ["candidate.classNumber", "completion.classNumber"])
        status, exit_code = verify.comparison_status([result])
        self.assertEqual((status, exit_code), ("failed", 1))
        serialized = json.dumps(result, sort_keys=True)
        self.assertNotIn('"actual"', serialized)
        self.assertNotIn('"expected"', serialized)
        self.assertNotIn('"7"', serialized)
        self.assertNotIn('"11"', serialized)

    def test_public_timeout_status_is_preserved(self) -> None:
        result = verify.compare_case(
            {"fieldId": "timed-out-cubic", "failure": {"kind": "timeout"}}, {}
        )
        self.assertEqual(result["status"], "public-failure-or-timeout")
        self.assertEqual(verify.comparison_status([result]), ("failed", 1))


if __name__ == "__main__":
    unittest.main()
